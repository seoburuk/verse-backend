package dto

type FavoriteItemDTO struct {
	CourseItemID int64   `json:"course_item_id"`
	Topic        string  `json:"topic"`
	CourseSlug   string  `json:"course_slug"`
	CourseTitle    string  `json:"course_title"`
	CourseTitleEn  *string `json:"course_title_en,omitempty"`
	SectionID      *int64  `json:"section_id"`
	SectionTitle   *string `json:"section_title"`
	SectionTitleEn *string `json:"section_title_en,omitempty"`
	Book         int16   `json:"book"`
	Chapter      int16   `json:"chapter"`
	Verse        int16   `json:"verse"`
	Text         string  `json:"text"`
}

type FavoritesResponse struct {
	Items []FavoriteItemDTO `json:"items"`
}
