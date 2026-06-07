// בניית הודעת משוב לתלמידים + קישורי וואטסאפ/מייל.
// הכל בצד הלקוח — wa.me ו-mailto נפתחים עם ההודעה מוכנה, ללא שרת וללא עלות.

import { Project } from './types';
import { Grade, RUBRIC_SECTIONS, RUBRIC_TOTAL, gradeTotal, clamp } from './rubric';

// נורמליזציה של מספר טלפון ישראלי לפורמט בינלאומי ל-wa.me (ללא + וללא 0 מוביל)
export function waPhone(raw: string): string {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('972')) return d;
  if (d.startsWith('0')) return '972' + d.slice(1);
  if (d.length === 9) return '972' + d; // מקומי בלי 0 מוביל
  return d;
}

export function waLink(phone: string, text: string): string {
  return `https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(text)}`;
}

export function mailtoLink(
  email: string,
  subject: string,
  body: string,
): string {
  return `mailto:${encodeURIComponent((email || '').trim())}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

export const NAME_TOKEN = '[שם]';

// תבנית ברירת מחדל. [שם] יוחלף בשם כל תלמיד/ה לפני השליחה.
export function defaultMessageTemplate(opts: {
  project: Project;
  grade: Grade;
  teacherName?: string;
  includeSections: boolean;
}): string {
  const { project, grade, teacherName, includeSections } = opts;
  const total = gradeTotal(grade);
  const venture = project.ventureName?.trim() || 'המיזם';
  const lines: string[] = [];

  lines.push(`שלום ${NAME_TOKEN} 👋`);
  lines.push('');
  lines.push(`הערכת המיזם שלכם *"${venture}"* הושלמה. הנה המשוב שלי:`);
  lines.push('');
  lines.push(`📊 *ציון סופי: ${total}/${RUBRIC_TOTAL}*`);

  if (grade.general?.trim()) {
    lines.push('');
    lines.push(grade.general.trim());
  }

  if (includeSections) {
    lines.push('');
    lines.push('*פירוט לפי סעיפים:*');
    RUBRIC_SECTIONS.forEach((s, i) => {
      const sc = clamp(grade.scores?.[s.id] || 0, 0, s.max);
      lines.push(`${i + 1}. ${s.label} — ${sc}/${s.max}`);
      const note = grade.notes?.[s.id]?.trim();
      if (note) lines.push(`   ${note}`);
    });
  }

  lines.push('');
  lines.push('כל הכבוד על העבודה וההשקעה! 🚀');
  if (teacherName?.trim()) {
    lines.push(`— ${teacherName.trim()}, מחשבת ישראל`);
  }

  return lines.join('\n');
}

export function emailSubject(project: Project): string {
  const venture = project.ventureName?.trim() || 'המיזם';
  return `הערכת המיזם — ${venture}`;
}

export function personalize(template: string, memberName: string): string {
  return template.split(NAME_TOKEN).join(memberName || '');
}
