import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { isTeacher } from '@/lib/teachers';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { RUBRIC_SECTIONS, RUBRIC_TOTAL } from '@/lib/rubric';
import { Project, emptyProject } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function normalizeClassId(raw: string) {
  return (raw || '').trim().replace(/\//g, '').replace(/\s+/g, '-');
}

// טקסט קבוע — נשמר בקאש כדי לחסוך עלות במורה שמדרג כמה צוותים ברצף
const SYSTEM_PROMPT = `אתה עוזר מורה מנוסה במחשבת ישראל, מסייע להעריך תיק מיזם חברתי תאורטי שהגישו תלמידי כיתה י' בזוגות. אינך מורה מחליף — המורה האנושי הוא הקובע הסופי, ותפקידך לתת הצעה ראשונית מנומקת לכל סעיף שהמורה יוכל לאשר או לעדכן.

הקפד על:
- היה אדיב והוגן. ציון נמוך הוא רק כשהתוכן באמת חסר או שגוי — לא בגלל ניסוח לא מושלם.
- המיזם הוא **תאורטי**. אין להוריד נקודות על "מה אם זה לא יעבוד בשטח" — בדוק רק את איכות התכנון.
- אם שדה ריק לחלוטין: ציון 0-2.
- אם שדה מצוין ויסודי: ציון 80-100% מהמקסימום.
- ההערה צריכה להיות 1-2 משפטים, **ספציפית** למה שכתבו (לא גנרית). הזכר ציטוט קצר ממה שכתבו כשאפשר.
- כתוב בעברית תקנית, בגוף נוכח אל הצוות ("הצגתם בעיה חדה אבל..."), בטון מכובד ומעודד.

המחוון (סך 100 נקודות):

1. **זיהוי הבעיה והרקע** (max 15) — בעיה ממוקדת ומוגדרת היטב, ברור על מי משפיעה ולמה היא חשובה.
2. **מחקר עולמי ולמידה מהשטח** (max 10) — לפחות 2 יוזמות/מחקרים דומים + ריאיון עם תובנה מעשית.
3. **חזון** (max 15) — חזון ספציפי ומעורר השראה ("עולם שבו..."), מתחבר לבעיה.
4. **מפת משאבים** (max 15) — לפחות 3-4 משאבים ריאליים עם מקור מזוהה ואישור עדכני.
5. **תקציב** (max 10) — פריטים עם עלויות מספריות, סכום הגיוני יחסית לטיב המיזם, חיבור למשאבים.
6. **יעדים** (max 10) — לפחות 2-3 יעדים ספציפיים, שאפתניים-אך-ריאליסטיים.
7. **מדדי הצלחה** (max 10) — מדדים **כמותיים** (מספר/אחוז/תדירות) הקשורים ליעדים.
8. **תוכנית פעולה** (max 10) — שלושת השלבים מלאים (הקמה, ביצוע, **קיימות**). היעדר שלב הקיימות הוא דגל אדום.
9. **קוהרנטיות וניסוח** (max 5) — סיפור אחד עקבי בין החלקים, עברית תקנית.

החזר את הציון וההערות באמצעות הכלי submit_grade בלבד.`;

// הגדרת ה-tool המבוסס על המחוון
const SCHEMA = {
  type: 'object' as const,
  properties: {
    scores: {
      type: 'object' as const,
      properties: Object.fromEntries(
        RUBRIC_SECTIONS.map((s) => [
          s.id,
          { type: 'number' as const, minimum: 0, maximum: s.max },
        ]),
      ),
      required: RUBRIC_SECTIONS.map((s) => s.id),
      additionalProperties: false,
    },
    notes: {
      type: 'object' as const,
      properties: Object.fromEntries(
        RUBRIC_SECTIONS.map((s) => [s.id, { type: 'string' as const }]),
      ),
      required: RUBRIC_SECTIONS.map((s) => s.id),
      additionalProperties: false,
    },
    general: {
      type: 'string' as const,
      description: 'משוב כללי לצוות — 2-3 משפטים מעודדים שמסכמים נקודות חזק ונקודות לשיפור.',
    },
  },
  required: ['scores', 'notes', 'general'],
  additionalProperties: false,
};

function projectToText(p: Project): string {
  const lines: string[] = [];
  lines.push(`שם המיזם: ${p.ventureName || '(לא הוזן)'}`);
  lines.push(
    `חברי הצוות: ${p.teamMembers.filter((m) => m.trim()).join(', ') || '(לא הוזן)'}`,
  );
  lines.push(`\n[1] הבעיה החברתית:\n${p.problem || '(ריק)'}`);
  lines.push(`\n[2] מחקר עולמי:\n${p.worldResearch || '(ריק)'}`);
  lines.push(`\n[2] ריאיון עם: ${p.interviewee || '(לא הוזן)'}`);
  lines.push(`תובנות מהריאיון:\n${p.interviewInsights || '(ריק)'}`);
  lines.push(`\n[3] חזון:\n${p.vision || '(ריק)'}`);

  lines.push(`\n[4] מפת משאבים:`);
  const filledRes = p.resources.filter((r) => r.resource.trim());
  if (filledRes.length === 0) {
    lines.push('(לא הוזנו משאבים)');
  } else {
    filledRes.forEach((r, i) => {
      lines.push(
        `  ${i + 1}. ${r.resource} | מקור: ${r.source || '(אין)'} | אישור: ${r.approval}`,
      );
    });
  }

  lines.push(`\n[5] תקציב:`);
  const filledBud = p.budget.filter((b) => b.item.trim());
  if (filledBud.length === 0) {
    lines.push('(לא הוזן תקציב)');
  } else {
    let total = 0;
    filledBud.forEach((b, i) => {
      const n = parseFloat((b.cost || '').replace(/[^\d.-]/g, ''));
      if (isFinite(n)) total += n;
      lines.push(
        `  ${i + 1}. ${b.item}: ${b.cost || '0'} ₪${b.notes ? ' | ' + b.notes : ''}${b.fromResource ? ' [ממשאב]' : ''}`,
      );
    });
    lines.push(`  סה"כ: ${total.toLocaleString('he-IL')} ₪`);
  }

  lines.push(`\n[6] יעדים:`);
  const goals = p.goals.filter((g) => g.trim());
  if (goals.length === 0) lines.push('(לא הוזנו)');
  else goals.forEach((g, i) => lines.push(`  ${i + 1}. ${g}`));

  lines.push(`\n[7] מדדי הצלחה:`);
  const kpis = p.kpis.filter((k) => k.trim());
  if (kpis.length === 0) lines.push('(לא הוזנו)');
  else kpis.forEach((k, i) => lines.push(`  ${i + 1}. ${k}`));

  lines.push(`\n[8] תוכנית פעולה:`);
  lines.push(`  הקמה: ${p.actionSetup || '(ריק)'}`);
  lines.push(`  ביצוע: ${p.actionExecute || '(ריק)'}`);
  lines.push(`  קיימות: ${p.actionSustain || '(ריק)'}`);

  return lines.join('\n');
}

// POST /api/teams/grade/suggest  — קבלת הצעת ציון מנומקת מ-Claude
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isTeacher(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error: 'ANTHROPIC_API_KEY לא הוגדר בסביבה. הוסיפו אותו ב-Vercel ובקובץ .env.local.',
      },
      { status: 503 },
    );
  }

  const body = await req.json();
  const classId = normalizeClassId(body.classId || '');
  const teamId = body.teamId || '';
  if (!classId || !teamId) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  // טען את נתוני הצוות
  const result = await db.execute({
    sql: 'SELECT data FROM teams WHERE class_id = ? AND team_id = ?',
    args: [classId, teamId],
  });
  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'team not found' }, { status: 404 });
  }
  const project: Project = {
    ...emptyProject(),
    ...JSON.parse(result.rows[0].data as string),
  };

  // קרא ל-Claude
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      tools: [
        {
          name: 'submit_grade',
          description: `הגש את ההצעה לציון ולנימוקים לפי המחוון. סך הציון לא יעלה על ${RUBRIC_TOTAL} נקודות.`,
          input_schema: SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_grade' },
      messages: [
        {
          role: 'user',
          content: `הינה תיק המיזם של הצוות. הערך אותו לפי המחוון והשתמש בכלי submit_grade.\n\n${projectToText(project)}`,
        },
      ],
    });

    // חלץ את ה-tool_use
    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      return NextResponse.json(
        { error: 'Claude did not return a tool_use block' },
        { status: 502 },
      );
    }

    return NextResponse.json({
      suggestion: toolUse.input,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
        cache_read_input_tokens:
          response.usage.cache_read_input_tokens || 0,
        cache_creation_input_tokens:
          response.usage.cache_creation_input_tokens || 0,
      },
    });
  } catch (err) {
    const msg = (err as Error).message || 'unknown error';
    return NextResponse.json(
      { error: `שגיאה בקריאה ל-Claude: ${msg}` },
      { status: 500 },
    );
  }
}
