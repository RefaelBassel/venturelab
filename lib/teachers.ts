// חשבונות Google שיקבלו גישה לדשבורד מורה
// ניתן להוסיף עוד בעתיד
export const TEACHER_EMAILS = new Set([
  'refaelbassel@gmail.com',
  'reutst99@gmail.com',
]);

export function isTeacher(email: string | null | undefined): boolean {
  if (!email) return false;
  return TEACHER_EMAILS.has(email);
}
