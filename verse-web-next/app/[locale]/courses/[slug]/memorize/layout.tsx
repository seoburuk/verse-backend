import AuthGuard from "../../../../components/AuthGuard";

export default function MemorizeLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
