// course_handler.go — 코스/본문 조회 핸들러. 기획서 §9.
package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/seoburuk/verse-backend/internal/domain"
	"github.com/seoburuk/verse-backend/internal/handler/dto"
)

func (h *Handler) GetSection(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid section id"})
		return
	}

	sec, err := h.courses.GetSectionDetail(r.Context(), id)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	items := make([]dto.CourseItemResponse, len(sec.Items))
	for i, it := range sec.Items {
		items[i] = toItemResponse(it)
	}
	writeJSON(w, http.StatusOK, dto.SectionDetailResponse{
		SectionID: sec.ID,
		Title:     sec.Title,
		TitleEn:   sec.TitleEn,
		Ord:       sec.Ord,
		Items:     items,
	})
}

func toItemResponse(it domain.CourseItemWithVerse) dto.CourseItemResponse {
	return dto.CourseItemResponse{
		CourseItemID: it.CourseItemID,
		Ord:          it.Ord,
		Topic:        it.Topic,
		TopicEn:      it.TopicEn,
		Book:         it.Book,
		Chapter:      it.Chapter,
		Verse:        it.Verse,
		Text:         it.Text,
	}
}

func (h *Handler) ListCourses(w http.ResponseWriter, r *http.Request) {
	courses, err := h.courses.ListCourses(r.Context())
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	resp := make([]dto.CourseResponse, len(courses))
	for i, c := range courses {
		resp[i] = dto.CourseResponse{
			ID:       c.ID,
			Slug:     c.Slug,
			Title:    c.Title,
			TitleEn:  c.TitleEn,
			Theme:    c.Theme,
			Ord:      c.Ord,
			Category: c.Category,
		}
	}
	writeJSON(w, http.StatusOK, resp)
}

// GetCoursesVersion — 오프라인 우선 클라이언트가 앱 시작 시 가볍게 호출해
// 로컬 번들 콘텐츠(코스 목록)를 재다운로드해야 하는지 판단하는 데 쓴다.
// course 목록 전체를 매번 내려받는 대신 (id, slug, ord, category)로 만든
// 해시 하나만 비교하면 되므로 응답 크기가 훨씬 작다.
func (h *Handler) GetCoursesVersion(w http.ResponseWriter, r *http.Request) {
	courses, err := h.courses.ListCourses(r.Context())
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	hasher := sha256.New()
	for _, c := range courses {
		hasher.Write([]byte(strconv.FormatInt(c.ID, 10)))
		hasher.Write([]byte("|"))
		hasher.Write([]byte(c.Slug))
		hasher.Write([]byte("|"))
		hasher.Write([]byte(strconv.Itoa(c.Ord)))
		hasher.Write([]byte("|"))
		hasher.Write([]byte(c.Category))
		hasher.Write([]byte("\n"))
	}

	writeJSON(w, http.StatusOK, dto.CoursesVersionResponse{Version: hex.EncodeToString(hasher.Sum(nil))})
}

func (h *Handler) GetCourse(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")

	detail, err := h.courses.GetCourseDetail(r.Context(), slug)
	if err != nil {
		writeJSON(w, errStatus(err), map[string]string{"error": err.Error()})
		return
	}

	cr := dto.CourseResponse{
		ID:       detail.Course.ID,
		Slug:     detail.Course.Slug,
		Title:    detail.Course.Title,
		TitleEn:  detail.Course.TitleEn,
		Theme:    detail.Course.Theme,
		Ord:      detail.Course.Ord,
		Category: detail.Course.Category,

		Commentary:   detail.Course.Commentary,
		CommentaryEn: detail.Course.CommentaryEn,
	}

	if len(detail.Sections) > 0 {
		sections := make([]dto.CourseSectionResponse, len(detail.Sections))
		for i, sec := range detail.Sections {
			secItems := make([]dto.CourseItemResponse, len(sec.Items))
			for j, it := range sec.Items {
				secItems[j] = toItemResponse(it)
			}
			sections[i] = dto.CourseSectionResponse{
				SectionID: sec.ID,
				Title:     sec.Title,
				TitleEn:   sec.TitleEn,
				Ord:       sec.Ord,
				Items:     secItems,
			}
		}
		writeJSON(w, http.StatusOK, dto.CourseDetailResponse{CourseResponse: cr, Sections: sections})
		return
	}

	items := make([]dto.CourseItemResponse, len(detail.Items))
	for i, it := range detail.Items {
		items[i] = toItemResponse(it)
	}
	writeJSON(w, http.StatusOK, dto.CourseDetailResponse{CourseResponse: cr, Items: items})
}
