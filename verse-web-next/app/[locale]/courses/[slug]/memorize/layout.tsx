import AuthGuard from "@/components/AuthGuard";
import { isTrialCourse } from "@/lib/guest";

export default function MemorizeLayout({
  children,
  params: { slug },
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  return <AuthGuard allowGuest={isTrialCourse(slug)}>{children}</AuthGuard>;
}
