// profanity.go — 아이디/닉네임에 쓸 수 없는 금칙어 목록과 판정.
package service

import "strings"

// bannedWords — 대표적인 한국어·영어 비속어. 부분 일치로 차단한다.
var bannedWords = []string{
	"시발", "씨발", "씨발놈", "씨팔", "개새끼", "개새키", "병신", "지랄", "좆", "존나", "썅", "느금", "니미",
	"fuck", "shit", "bitch", "asshole", "nigger", "cunt", "whore", "dick", "faggot",
}

// containsProfanity — 소문자화·공백 제거 후 금칙어 부분 일치를 검사한다.
func containsProfanity(s string) bool {
	normalized := strings.ToLower(strings.Join(strings.Fields(s), ""))
	for _, w := range bannedWords {
		if strings.Contains(normalized, w) {
			return true
		}
	}
	return false
}
