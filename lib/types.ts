export interface Resource {
  resource: string;
  source: string;
  approval: 'לא' | 'בתהליך' | 'כן';
}

export interface BudgetItem {
  item: string;
  cost: string;
  notes: string;
  fromResource: boolean;
}

export interface TeamContact {
  name: string;
  phone: string;
  email: string;
}

// תקציר ערב תוצרים — נוצר ע"י Claude, עם בחירות תצוגה של המורה.
export interface ShowcaseHighlights {
  pain?: string; // הכאב — למה נולד המיזם
  proposal?: string; // ההצעה — הפתרון המוצע
  world?: string; // מחקר שטח — מה למדו מהעולם / מהריאיון
  approach?: string; // תוכנית הפעולה — איך מציעים לבצע
  budget?: string; // תקציב — כמה עולה ועל מה
  goals?: string; // יעדים — יעד מרכזי / מדד הצלחה
}

export interface Showcase {
  tagline?: string;
  summary?: string;
  highlights?: ShowcaseHighlights;
  quotes?: string[];
  members?: string; // שמות תלמידים לתצוגה — עריכת מורה (גובר על data.teamMembers)
  showScore?: boolean;
  excellence?: boolean;
  updatedAt?: number;
}

export interface Project {
  teamMembers: string[];
  ventureName: string;
  problem: string;
  worldResearch: string;
  interviewee: string;
  interviewInsights: string;
  vision: string;
  resources: Resource[];
  budget: BudgetItem[];
  goals: string[];
  kpis: string[];
  actionSetup: string;
  actionExecute: string;
  actionSustain: string;
}

export const emptyProject = (): Project => ({
  teamMembers: ['', ''],
  ventureName: '',
  problem: '',
  worldResearch: '',
  interviewee: '',
  interviewInsights: '',
  vision: '',
  resources: [{ resource: '', source: '', approval: 'לא' }],
  budget: [{ item: '', cost: '', notes: '', fromResource: false }],
  goals: ['', '', ''],
  kpis: ['', '', ''],
  actionSetup: '',
  actionExecute: '',
  actionSustain: '',
});
