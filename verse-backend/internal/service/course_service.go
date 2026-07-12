// course_service.go — 코스/본문 조회 로직.
// "코스 상세 = 코스 + 아이템+절텍스트 조립"처럼 여러 쿼리를 한 응답으로 합치는
// 도메인 책임이 여기 있다.
package service

import (
	"context"

	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/repository"
)

type CourseDetail struct {
	Course   domain.Course
	Items    []domain.CourseItemWithVerse      // 섹션 없는 코스
	Sections []domain.CourseSectionWithItems   // 섹션 있는 코스
}

type CourseService struct {
	courses repository.CourseRepo
	verses  repository.VerseRepo
}

func NewCourseService(courses repository.CourseRepo, verses repository.VerseRepo) *CourseService {
	return &CourseService{courses: courses, verses: verses}
}

// GetVerse — 책/장/절 번호로 성경 구절 하나를 반환 (공개 구절 공유 페이지용).
func (s *CourseService) GetVerse(ctx context.Context, book, chapter, verse int16) (domain.Verse, error) {
	return s.verses.GetVerse(ctx, book, chapter, verse)
}

func (s *CourseService) ListCourses(ctx context.Context) ([]domain.Course, error) {
	return s.courses.ListCourses(ctx)
}

func (s *CourseService) AddFavorite(ctx context.Context, userID, courseItemID int64) error {
	return s.courses.AddFavorite(ctx, userID, courseItemID)
}

func (s *CourseService) RemoveFavorite(ctx context.Context, userID, courseItemID int64) error {
	return s.courses.RemoveFavorite(ctx, userID, courseItemID)
}

func (s *CourseService) ListFavoriteItems(ctx context.Context, userID int64) ([]domain.FavoriteItem, error) {
	return s.courses.ListFavoriteItems(ctx, userID)
}

// GetSectionDetail — 섹션 ID로 섹션 정보 + 절 목록을 반환.
func (s *CourseService) GetSectionDetail(ctx context.Context, sectionID int64) (domain.CourseSectionWithItems, error) {
	sec, err := s.courses.GetSectionByID(ctx, sectionID)
	if err != nil {
		return domain.CourseSectionWithItems{}, err
	}
	items, err := s.courses.ListItemsBySection(ctx, sec.ID)
	if err != nil {
		return domain.CourseSectionWithItems{}, err
	}
	return domain.CourseSectionWithItems{CourseSection: sec, Items: items}, nil
}

// GetCourseDetail — 코스 + 아이템 목록(절 텍스트 포함)을 한 번에 반환.
// 섹션이 있는 코스는 Sections 필드를, 없는 코스는 Items 필드를 채운다.
func (s *CourseService) GetCourseDetail(ctx context.Context, slug string) (CourseDetail, error) {
	course, err := s.courses.GetCourseBySlug(ctx, slug)
	if err != nil {
		return CourseDetail{}, err
	}

	sections, err := s.courses.ListSectionsByCourse(ctx, course.ID)
	if err != nil {
		return CourseDetail{}, err
	}

	if len(sections) > 0 {
		result := make([]domain.CourseSectionWithItems, len(sections))
		for i, sec := range sections {
			items, err := s.courses.ListItemsBySection(ctx, sec.ID)
			if err != nil {
				return CourseDetail{}, err
			}
			result[i] = domain.CourseSectionWithItems{CourseSection: sec, Items: items}
		}
		return CourseDetail{Course: course, Sections: result}, nil
	}

	items, err := s.courses.ListCourseItemsWithVerse(ctx, course.ID)
	if err != nil {
		return CourseDetail{}, err
	}
	return CourseDetail{Course: course, Items: items}, nil
}
