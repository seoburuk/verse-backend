export const sessionGradesKey = (sectionId: string) => `sg_${sectionId}`;

export function recordGrade(sectionId: string, grade: string) {
  const key = sessionGradesKey(sectionId);
  const existing: string[] = JSON.parse(sessionStorage.getItem(key) ?? "[]");
  existing.push(grade);
  sessionStorage.setItem(key, JSON.stringify(existing));
}

export function clearGrades(sectionId: string) {
  sessionStorage.removeItem(sessionGradesKey(sectionId));
}
