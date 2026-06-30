import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { LoginPage } from "./features/auth/LoginPage";
import { CourseListPage } from "./features/courses/CourseListPage";
import { CourseDetailPage } from "./features/courses/CourseDetailPage";
import { SectionDetailPage } from "./features/courses/SectionDetailPage";
import { MemorizePage } from "./features/memorize/MemorizePage";
import type { ReactNode } from "react";

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthed } = useAuth();
  return isAuthed ? <>{children}</> : <Navigate to="/login" replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/courses"
          element={
            <RequireAuth>
              <CourseListPage />
            </RequireAuth>
          }
        />
        <Route
          path="/courses/:slug"
          element={
            <RequireAuth>
              <CourseDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/sections/:sectionId"
          element={
            <RequireAuth>
              <SectionDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/memorize/:itemId"
          element={
            <RequireAuth>
              <MemorizePage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

function RootRedirect() {
  const { isAuthed } = useAuth();
  return <Navigate to={isAuthed ? "/courses" : "/login"} replace />;
}
