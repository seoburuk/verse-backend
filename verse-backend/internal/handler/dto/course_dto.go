// course_dto.go — 코스 응답 DTO. domain 타입과 JSON 형태를 분리.
package dto

type CourseResponse struct {
	ID    int64  `json:"id"`
	Slug  string `json:"slug"`
	Title string `json:"title"`
	Theme string `json:"theme"`
	Ord   int    `json:"ord"`
}

type CourseItemResponse struct {
	CourseItemID int64  `json:"course_item_id"`
	Ord          int    `json:"ord"`
	Topic        string `json:"topic"`
	Book         int16  `json:"book"`
	Chapter      int16  `json:"chapter"`
	Verse        int16  `json:"verse"`
	Text         string `json:"text"`
}

type SectionDetailResponse struct {
	SectionID int64                `json:"section_id"`
	Title     string               `json:"title"`
	Ord       int                  `json:"ord"`
	Items     []CourseItemResponse `json:"items"`
}

type CourseSectionResponse struct {
	SectionID int64                `json:"section_id"`
	Title     string               `json:"title"`
	Ord       int                  `json:"ord"`
	Items     []CourseItemResponse `json:"items"`
}

type CourseDetailResponse struct {
	CourseResponse
	Items    []CourseItemResponse    `json:"items,omitempty"`
	Sections []CourseSectionResponse `json:"sections,omitempty"`
}
