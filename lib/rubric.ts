// מחוון להערכת מיזם חברתי תאורטי

import { Project } from './types';

export interface RubricPreviewRow {
  label: string;
  value: string;
}

export interface RubricSection {
  id: string;
  label: string;
  max: number;
  description: string;
  /** Read-only project fields to surface beside this section in the grade modal */
  preview: (p: Project) => RubricPreviewRow[];
}

export const RUBRIC_SECTIONS: RubricSection[] = [
  {
    id: 'problem',
    label: 'זיהוי הבעיה והרקע',
    max: 15,
    description: 'בעיה ממוקדת ומוגדרת היטב, ברור על מי משפיעה ולמה היא חשובה.',
    preview: (p) => [
      { label: 'שם המיזם', value: p.ventureName || '—' },
      {
        label: 'חברי הצוות',
        value:
          p.teamMembers.filter((m) => m.trim()).join(', ') || '—',
      },
      { label: 'הבעיה', value: p.problem || '—' },
    ],
  },
  {
    id: 'research',
    label: 'מחקר עולמי ולמידה מהשטח',
    max: 10,
    description: 'יוזמות דומות בעולם + ריאיון עם תובנה מעשית.',
    preview: (p) => [
      { label: 'מחקר עולמי', value: p.worldResearch || '—' },
      { label: 'ריאיון עם', value: p.interviewee || '—' },
      { label: 'תובנות', value: p.interviewInsights || '—' },
    ],
  },
  {
    id: 'vision',
    label: 'חזון',
    max: 15,
    description: 'חזון ספציפי ומעורר השראה, מתחבר לבעיה.',
    preview: (p) => [{ label: 'החזון', value: p.vision || '—' }],
  },
  {
    id: 'resources',
    label: 'מפת משאבים',
    max: 15,
    description: 'משאבים ריאליים, מקור מזוהה, אישור עדכני.',
    preview: (p) => {
      const rows = p.resources
        .filter((r) => r.resource.trim())
        .map((r, i) => ({
          label: `משאב ${i + 1}`,
          value: `${r.resource} — ${r.source || 'ללא מקור'} — אישור: ${r.approval}`,
        }));
      return rows.length ? rows : [{ label: 'משאבים', value: '—' }];
    },
  },
  {
    id: 'budget',
    label: 'תקציב',
    max: 10,
    description: 'פריטים עם עלויות מספריות, סכום הגיוני, חיבור למשאבים.',
    preview: (p) => {
      const items = p.budget.filter((b) => b.item.trim());
      const total = items.reduce((s, b) => {
        const n = parseFloat((b.cost || '').replace(/[^\d.-]/g, ''));
        return s + (isFinite(n) ? n : 0);
      }, 0);
      const rows: RubricPreviewRow[] = items.map((b, i) => ({
        label: `פריט ${i + 1}`,
        value: `${b.item}: ${b.cost || '0'} ₪${b.notes ? ' — ' + b.notes : ''}`,
      }));
      rows.push({
        label: 'סה״כ',
        value: `${total.toLocaleString('he-IL')} ₪`,
      });
      return rows;
    },
  },
  {
    id: 'goals',
    label: 'יעדים',
    max: 10,
    description: 'יעדים ספציפיים, שאפתניים-אך-ריאליסטיים.',
    preview: (p) => {
      const rows = p.goals
        .filter((g) => g.trim())
        .map((g, i) => ({ label: `יעד ${i + 1}`, value: g }));
      return rows.length ? rows : [{ label: 'יעדים', value: '—' }];
    },
  },
  {
    id: 'kpis',
    label: 'מדדי הצלחה',
    max: 10,
    description: 'מדדים כמותיים שניתן לבדוק, קשורים ליעדים.',
    preview: (p) => {
      const rows = p.kpis
        .filter((k) => k.trim())
        .map((k, i) => ({ label: `מדד ${i + 1}`, value: k }));
      return rows.length ? rows : [{ label: 'מדדים', value: '—' }];
    },
  },
  {
    id: 'action',
    label: 'תוכנית פעולה',
    max: 10,
    description: '3 שלבים — הקמה, ביצוע, וקיימות (איך זה ימשיך).',
    preview: (p) => [
      { label: 'הקמה', value: p.actionSetup || '—' },
      { label: 'ביצוע', value: p.actionExecute || '—' },
      { label: 'קיימות', value: p.actionSustain || '—' },
    ],
  },
  {
    id: 'coherence',
    label: 'קוהרנטיות וניסוח',
    max: 5,
    description: 'סיפור אחד עקבי בין החלקים, ניסוח תקני.',
    preview: () => [],
  },
];

export const RUBRIC_TOTAL = RUBRIC_SECTIONS.reduce((s, x) => s + x.max, 0);

export interface Grade {
  scores: Record<string, number>;
  notes: Record<string, string>;
  general: string;
  updatedAt?: number;
  gradedBy?: string;
}

export function emptyGrade(): Grade {
  const scores: Record<string, number> = {};
  const notes: Record<string, string> = {};
  for (const s of RUBRIC_SECTIONS) {
    scores[s.id] = 0;
    notes[s.id] = '';
  }
  return { scores, notes, general: '' };
}

export function clamp(n: number, min: number, max: number): number {
  if (!isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function gradeTotal(g: Grade | null | undefined): number {
  if (!g) return 0;
  return RUBRIC_SECTIONS.reduce(
    (sum, s) => sum + clamp(g.scores?.[s.id] || 0, 0, s.max),
    0,
  );
}

export function isGraded(g: Grade | null | undefined): boolean {
  if (!g) return false;
  return RUBRIC_SECTIONS.some((s) => (g.scores?.[s.id] || 0) > 0);
}
