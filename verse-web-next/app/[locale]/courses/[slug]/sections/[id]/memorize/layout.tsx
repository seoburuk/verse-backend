import AuthGuard from "@/components/AuthGuard";
import { isTrialCourse } from "@/lib/guest";

// 구절 열람(섹션 목록)은 공개, 암기 플로우만 로그인(체험 코스는 게스트 허용) 게이트.
export default function SectionMemorizeLayout({
  children,
  params: { slug },
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  return <AuthGuard allowGuest={isTrialCourse(slug)}>{children}</AuthGuard>;
}
