// course.go — 코스/코스아이템 도메인 타입. 기획서 §6.2.
package domain

type Course struct {
	ID       int64
	Slug     string
	Title    string
	Theme    string
	Ord      int
	Hidden   bool
	Category string
}

// CourseItem — 코스에 담긴 절 하나. 진도(progress)는 이 단위로만 추적한다.
// (기획서 §0: 절 단위 숙련도 모델링 안 함, 코스 아이템 단위만.)
type CourseItem struct {
	ID       int64
	CourseID int64
	VerseID  int64
	Ord      int
	Topic    string
}

// CourseItemWithVerse — 코스 상세 화면용 합성 타입(JOIN 결과).
// repository가 JOIN 쿼리로 한 번에 채워 반환한다.
type CourseItemWithVerse struct {
	CourseItemID int64
	VerseID      int64 // GetCourseItemVerse에서만 채워짐(형제 코스아이템 조회용)
	Ord          int
	Topic        string
	Book         int16
	Chapter      int16
	Verse        int16
	Text         string
}

// CourseSection — 코스 내 주제 섹션.
type CourseSection struct {
	ID       int64
	CourseID int64
	Title    string
	Ord      int
}

// CourseSectionWithItems — 섹션 + 절 목록.
type CourseSectionWithItems struct {
	CourseSection
	Items []CourseItemWithVerse
}
