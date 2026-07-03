import AuthGuard from "@/components/AuthGuard";

export default function SectionsLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
