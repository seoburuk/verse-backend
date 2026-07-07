// 비로그인 게스트에게 개방하는 체험 코스 (1개).
export const TRIAL_COURSE_SLUG =
  process.env.NEXT_PUBLIC_TRIAL_COURSE_SLUG ?? "beginnings";

export function isTrialCourse(slug: string): boolean {
  return slug === TRIAL_COURSE_SLUG;
}
