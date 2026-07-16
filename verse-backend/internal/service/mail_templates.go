// mail_templates.go — 인증/재설정 코드 메일의 제목·본문(HTML)을 언어별로 만든다.
// 사용자 language 설정이 "ko"가 아니면 기본값은 영어.
package service

import "fmt"

func normalizeMailLang(lang string) string {
	if lang == "ko" {
		return "ko"
	}
	return "en"
}

func mailBrandWrap(bodyHTML string) string {
	return fmt.Sprintf(`<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0d0d0d;color:#e5e5e5;border:1px solid #2a2a2a;">
<div style="font-size:20px;font-weight:700;letter-spacing:1px;margin-bottom:24px;">PIX BIBLE</div>
%s
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #2a2a2a;font-size:12px;color:#888;">PIX BIBLE &middot; pixbible.cloud</div>
</div>`, bodyHTML)
}

// codeEmail — purpose(verify_email/reset_password) + 정규화된 언어로 제목/HTML 본문을 만든다.
func codeEmail(purpose, lang, code string) (subject, html string) {
	lang = normalizeMailLang(lang)

	switch purpose {
	case purposeVerifyEmail:
		if lang == "ko" {
			subject = "이메일 인증"
			html = mailBrandWrap(fmt.Sprintf(`<p style="font-size:15px;">이메일 인증 코드입니다. 10분 이내에 입력해주세요.</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:20px 0;">%s</p>`, code))
		} else {
			subject = "Verify your email"
			html = mailBrandWrap(fmt.Sprintf(`<p style="font-size:15px;">Your email verification code. Enter it within 10 minutes.</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:20px 0;">%s</p>`, code))
		}
	case purposeResetPassword:
		if lang == "ko" {
			subject = "비밀번호 재설정"
			html = mailBrandWrap(fmt.Sprintf(`<p style="font-size:15px;">비밀번호 재설정 코드입니다. 10분 이내에 입력해주세요.</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:20px 0;">%s</p><p style="font-size:13px;color:#999;">본인이 요청하지 않았다면 이 메일을 무시하세요.</p>`, code))
		} else {
			subject = "Reset your password"
			html = mailBrandWrap(fmt.Sprintf(`<p style="font-size:15px;">Your password reset code. Enter it within 10 minutes.</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:20px 0;">%s</p><p style="font-size:13px;color:#999;">If you didn't request this, you can ignore this email.</p>`, code))
		}
	}
	return subject, html
}
