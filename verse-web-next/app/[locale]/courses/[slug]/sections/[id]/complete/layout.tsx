import AuthGuard from "@/components/AuthGuard";
import { isTrialCourse } from "@/lib/guest";

// 구절 열람(섹션 목록)은 공개, 완료 화면은 암기 플로우와 같은 게이트를 유지.
export default function SectionCompleteLayout({
  children,
  params: { slug },
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  return <AuthGuard allowGuest={isTrialCourse(slug)}>{children}</AuthGuard>;
}
