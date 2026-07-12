// verse_dto.go — 공개 구절 조회 응답 DTO.
package dto

type VerseResponse struct {
	Book    int16  `json:"book"`
	Chapter int16  `json:"chapter"`
	Verse   int16  `json:"verse"`
	Text    string `json:"text"`
}
