// sessionStorage 키 빌더 — memorize 페이지가 목록 페이지에서 넘어온 항목 배열을
// URL 상태 없이 재사용하기 위한 캐시. 새로고침 등으로 없으면 memorize 페이지가 API로 재조회한다.
export const itemsCacheKey = {
  course: (slug: string) => `kjv_items_course_${slug}`,
  section: (sectionId: number | string) => `kjv_items_section_${sectionId}`,
};
