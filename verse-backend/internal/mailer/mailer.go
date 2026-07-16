// mailer.go — 트랜잭션 메일 발송 추상화.
//
// 왜 인터페이스로 분리하는가: 서비스 레이어가 "메일을 보낸다"만 알면 되고,
// 실제 발송 수단(Resend API / 로컬 로그)은 배포 환경에 따라 바뀐다.
package mailer

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

type Mailer interface {
	Send(ctx context.Context, to, subject, htmlBody string) error
}

// NewMailer — RESEND_API_KEY가 있으면 실제 발송, 없으면 콘솔 로그(dev).
func NewMailer(resendAPIKey, mailFrom string) Mailer {
	if resendAPIKey == "" {
		return LogMailer{}
	}
	return ResendMailer{apiKey: resendAPIKey, from: mailFrom}
}

// LogMailer — 개발 환경용. 메일 대신 표준 로그에 본문을 출력한다.
type LogMailer struct{}

func (LogMailer) Send(_ context.Context, to, subject, htmlBody string) error {
	log.Printf("[mailer:dev] to=%s subject=%q body=%s", to, subject, htmlBody)
	return nil
}

// ResendMailer — https://resend.com REST API 호출. SDK 없이 net/http만 사용.
type ResendMailer struct {
	apiKey string
	from   string
}

func (m ResendMailer) Send(ctx context.Context, to, subject, htmlBody string) error {
	payload, err := json.Marshal(map[string]any{
		"from":    m.from,
		"to":      []string{to},
		"subject": subject,
		"html":    htmlBody,
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.resend.com/emails", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+m.apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("resend: unexpected status %d", resp.StatusCode)
	}
	return nil
}
