// verse.go — 성경 본문 도메인 타입. DB도 HTTP도 모른다(순수 비즈니스 타입).
package domain

// Verse — 한 절. 기획서 §6.2 bible_verses 대응.
type Verse struct {
	ID      int64
	Book    int16
	Chapter int16
	Verse   int16
	Text    string
}

// Segment — 긴 절을 마침표 기준으로 쪼갠 조각. 기획서 §5.
// 적재 시점에 미리 계산되어 저장된다(런타임 분할 아님).
type Segment struct {
	ID           int64
	VerseID      int64
	SegmentLabel string // 'a','b',... (분할 없으면 "")
	Text         string
	WordCount    int
	Ord          int
}
