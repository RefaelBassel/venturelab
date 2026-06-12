import Anthropic from '@anthropic-ai/sdk';
import { db, ensureSummaries } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { isTeacher } from '@/lib/teachers';
import { normalizeClassId } from '@/lib/classId';
import { projectToText } from '@/lib/projectText';
import { Project, emptyProject } from '@/lib/types';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SYSTEM_PROMPT = `אתה עורך תוכן מנוסה שמכין כרטיסי תקציר עשירים ומעוררי השראה למיזמים חברתיים של תלמידי תיכון, לקראת "ערב תוצרים" שבו הורים, מורים והקהילה רואים את העבודות. הכרטיס צריך לתת לקורא תמונה שלמה של המיזם — לא רק הבעיה, אלא גם מה למדו, איך יבצעו, כמה זה עולה ולאן הם חותרים.

לכל מיזם, החזר באמצעות הכלי submit_showcase:
- tagline: שורת מחץ אחת קצרה (עד 12 מילים) שלוכדת את לב המיזם — קולעת, ברורה ומזמינה. בלי נקודה בסוף.
- summary: 2 משפטים זורמים בגוף שלישי — איזו בעיה חברתית המיזם נוגע בה, ומהו הפתרון המרכזי שהצוות מציע. עברית יפה ומכבדת, בלי קלישאות וסופרלטיבים ריקים.
- highlights: ארבע נקודות תמציתיות (משפט אחד קצר כל אחת, לכל היותר), כל אחת על שלב אחר במיזם. אם באמת אין מידע לשלב מסוים — החזר מחרוזת ריקה ("") לאותו שדה:
  - world: התובנה המרכזית שהצוות למד מהעולם או מהריאיון (מה גילו שעובד / חסר).
  - approach: איך הצוות מציע להוציא את המיזם לפועל — לב תוכנית הפעולה (הקמה/ביצוע) במשפט.
  - budget: כמה המיזם צפוי לעלות ועל מה עיקר ההוצאה. אם הוזן סכום — ציין אותו (למשל "כ-1,500 ₪, בעיקר ל...").
  - goals: היעד המרכזי או מדד ההצלחה החשוב ביותר שהצוות הציב.
- quotes: 1-2 ציטוטים קצרים (עד 15 מילים כל אחד) **מילה במילה מתוך הטקסט של התלמידים** (מהבעיה / החזון / התובנות). חובה להעתיק קטע אותנטי כפי שכתבו — אסור להמציא, לתקן או לנסח מחדש. אם אין קטע ראוי, החזר מערך ריק.

כתוב בעברית תקנית. אל תכלול ציון מספרי. המיזם תאורטי — אל תתאר אותו כאילו כבר יצא לפועל.`;

const SCHEMA = {
  type: 'object' as const,
  properties: {
    tagline: { type: 'string' as const },
    summary: { type: 'string' as const },
    highlights: {
      type: 'object' as const,
      properties: {
        world: { type: 'string' as const },
        approach: { type: 'string' as const },
        budget: { type: 'string' as const },
        goals: { type: 'string' as const },
      },
      required: ['world', 'approach', 'budget', 'goals'],
      additionalProperties: false,
    },
    quotes: {
      type: 'array' as const,
      items: { type: 'string' as const },
      maxItems: 2,
    },
  },
  required: ['tagline', 'summary', 'highlights', 'quotes'],
  additionalProperties: false,
};

function rowToSummary(row: Record<string, unknown> | undefined) {
  if (!row || !row.summary_data) return null;
  const data = JSON.parse(row.summary_data as string);
  return { ...data, updatedAt: Number(row.summary_updated_at) };
}

// GET /api/teams/showcase?classId=X  — כל הצוותים בכיתה עם תקציר וציון (מורה בלבד)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isTeacher(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await ensureSummaries();

  const { searchParams } = new URL(req.url);
  const classId = normalizeClassId(searchParams.get('classId') || '');
  if (!classId) {
    return NextResponse.json({ error: 'missing classId' }, { status: 400 });
  }

  const result = await db.execute({
    sql: `SELECT
            t.team_id, t.device_code, t.data, t.updated_at,
            g.data AS grade_data,
            s.data AS summary_data, s.updated_at AS summary_updated_at
          FROM teams t
          LEFT JOIN grades g ON g.class_id = t.class_id AND g.team_id = t.team_id
          LEFT JOIN summaries s ON s.class_id = t.class_id AND s.team_id = t.team_id
          WHERE t.class_id = ?
          ORDER BY t.updated_at DESC`,
    args: [classId],
  });

  const teams = result.rows.map((row) => ({
    teamId: row.team_id as string,
    deviceCode: row.device_code as string,
    data: JSON.parse(row.data as string),
    grade: row.grade_data ? JSON.parse(row.grade_data as string) : null,
    summary: rowToSummary(row as Record<string, unknown>),
  }));

  return NextResponse.json({ teams });
}

// POST /api/teams/showcase  — יצירת תקציר ע"י Claude עבור צוות אחד ושמירתו
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isTeacher(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY לא הוגדר בסביבה.' },
      { status: 503 },
    );
  }
  await ensureSummaries();

  const body = await req.json();
  const classId = normalizeClassId(body.classId || '');
  const teamId = body.teamId || '';
  if (!classId || !teamId) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  const teamRes = await db.execute({
    sql: 'SELECT data FROM teams WHERE class_id = ? AND team_id = ?',
    args: [classId, teamId],
  });
  if (teamRes.rows.length === 0) {
    return NextResponse.json({ error: 'team not found' }, { status: 404 });
  }
  const project: Project = {
    ...emptyProject(),
    ...JSON.parse(teamRes.rows[0].data as string),
  };

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let generated: {
    tagline: string;
    summary: string;
    highlights: {
      world: string;
      approach: string;
      budget: string;
      goals: string;
    };
    quotes: string[];
  };
  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [
        {
          name: 'submit_showcase',
          description: 'הגש את התקציר, שורת המחץ והציטוטים לתצוגה בערב התוצרים.',
          input_schema: SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_showcase' },
      messages: [
        {
          role: 'user',
          content: `הינה תיק המיזם. נסח תקציר לערב תוצרים והשתמש בכלי submit_showcase.\n\n${projectToText(project)}`,
        },
      ],
    });
    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      return NextResponse.json(
        { error: 'Claude did not return a tool_use block' },
        { status: 502 },
      );
    }
    generated = toolUse.input as typeof generated;
  } catch (err) {
    return NextResponse.json(
      { error: `שגיאה בקריאה ל-Claude: ${(err as Error).message}` },
      { status: 500 },
    );
  }

  // שמור — תוך שמירה על בחירות התצוגה הקיימות (showScore/excellence) אם יש
  const existingRes = await db.execute({
    sql: 'SELECT data FROM summaries WHERE class_id = ? AND team_id = ?',
    args: [classId, teamId],
  });
  const existing =
    existingRes.rows.length > 0
      ? JSON.parse(existingRes.rows[0].data as string)
      : {};
  const h = generated.highlights || {
    world: '',
    approach: '',
    budget: '',
    goals: '',
  };
  const merged = {
    ...existing,
    tagline: generated.tagline,
    summary: generated.summary,
    highlights: {
      world: h.world || '',
      approach: h.approach || '',
      budget: h.budget || '',
      goals: h.goals || '',
    },
    quotes: Array.isArray(generated.quotes) ? generated.quotes.slice(0, 2) : [],
  };

  const id = `${classId}__${teamId}`;
  await db.execute({
    sql: `INSERT INTO summaries (id, class_id, team_id, data, updated_at)
          VALUES (?, ?, ?, ?, unixepoch())
          ON CONFLICT(class_id, team_id) DO UPDATE SET
            data = excluded.data, updated_at = unixepoch()`,
    args: [id, classId, teamId, JSON.stringify(merged)],
  });

  return NextResponse.json({ summary: merged });
}
