// course_dto.go — 코스 응답 DTO. domain 타입과 JSON 형태를 분리.
package dto

type CourseResponse struct {
	ID       int64  `json:"id"`
	Slug     string `json:"slug"`
	Title    string `json:"title"`
	TitleEn  string `json:"title_en,omitempty"`
	Theme    string `json:"theme"`
	Ord      int    `json:"ord"`
	Category string `json:"category"`

	Commentary   string `json:"commentary,omitempty"`
	CommentaryEn string `json:"commentary_en,omitempty"`
}

type CourseItemResponse struct {
	CourseItemID int64  `json:"course_item_id"`
	Ord          int    `json:"ord"`
	Topic        string `json:"topic"`
	TopicEn      string `json:"topic_en,omitempty"`
	Book         int16  `json:"book"`
	Chapter      int16  `json:"chapter"`
	Verse        int16  `json:"verse"`
	Text         string `json:"text"`
}

type SectionDetailResponse struct {
	SectionID int64                `json:"section_id"`
	Title     string               `json:"title"`
	TitleEn   string               `json:"title_en,omitempty"`
	Ord       int                  `json:"ord"`
	Items     []CourseItemResponse `json:"items"`
}

type CourseSectionResponse struct {
	SectionID int64                `json:"section_id"`
	Title     string               `json:"title"`
	TitleEn   string               `json:"title_en,omitempty"`
	Ord       int                  `json:"ord"`
	Items     []CourseItemResponse `json:"items"`
}

type CourseDetailResponse struct {
	CourseResponse
	Items    []CourseItemResponse    `json:"items,omitempty"`
	Sections []CourseSectionResponse `json:"sections,omitempty"`
}

// CoursesVersionResponse — 오프라인 우선 클라이언트가 로컬 번들 콘텐츠를
// 재다운로드해야 하는지 가볍게 확인하는 용도. course 목록의
// (id, slug, ord, category) 조합을 해시한 값이라 콘텐츠가 바뀌면 값이 바뀐다.
type CoursesVersionResponse struct {
	Version string `json:"version"`
}
