import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { isTeacher } from '@/lib/teachers';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { RUBRIC_SECTIONS, RUBRIC_TOTAL } from '@/lib/rubric';
import { normalizeClassId } from '@/lib/classId';
import { Project, emptyProject } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// טקסט קבוע — נשמר בקאש כדי לחסוך עלות במורה שמדרג כמה צוותים ברצף
const SYSTEM_PROMPT = `אתה עוזר מורה מנוסה במחשבת ישראל, מסייע להעריך תיק מיזם חברתי תאורטי שהגישו תלמידי כיתה י' בזוגות. אינך מורה מחליף — המורה האנושי הוא הקובע הסופי, ותפקידך לתת הצעה ראשונית מנומקת לכל סעיף שהמורה יוכל לאשר או לעדכן.

**גישת הציון — נדיב ומעודד (חשוב מאוד):**
אלה תלמידי תיכון שמתנסים לראשונה בתכנון מיזם. המטרה היא לעודד ולחזק, לא לסנן. תן את הטבת הספק — אם תוכן סביר וכתוב ברצינות, הוא ראוי לרוב הנקודות. הורד נקודות רק כשתוכן באמת חסר, ריק או שגוי — לא בגלל חוסר עומק, ניסוח לא מושלם, או "אפשר היה יותר".

**עוגני ציון (לכל סעיף, כאחוז מהמקסימום):**
- שדה ריק לחלוטין → 0.
- ניסיון חלקי/מינימלי (כתבו משהו על הנושא, גם אם קצר או כללי) → 60-75%.
- תוכן סביר ורציני שעונה על העיקר → 80-90%.
- תוכן טוב ומפורט → 90-100%.
ברירת המחדל כשמתלבטים בין שתי רמות — בחר את הגבוהה.

הנחיות נוספות:
- המיזם הוא **תאורטי**. אל תוריד נקודות על "מה אם זה לא יעבוד בשטח" — בדוק רק את איכות התכנון, לא את היתכנותו.
- אל תעניש על כמות. אם המחוון מבקש "3 משאבים" והם כתבו 2 טובים — זה עדיין ראוי לרוב הנקודות.
- אל תוריד נקודות על שגיאות כתיב, ניסוח מסורבל, או חוסר פירוט — רק על היעדר תוכן ממשי.
- ההערה צריכה להיות 1-2 משפטים, **ספציפית** למה שכתבו (לא גנרית), ולפתוח בחיזוק לפני הצעת שיפור. הזכר ציטוט קצר ממה שכתבו כשאפשר.
- כתוב בעברית תקנית, בגוף נוכח אל הצוות ("הצגתם בעיה חדה ו..."), בטון חם, מכבד ומעודד.

המחוון (סך 100 נקודות):

1. **זיהוי הבעיה והרקע** (max 15) — בעיה חברתית מזוהה וברור על מי היא משפיעה. ככל שממוקדת ומוסברת יותר — טוב יותר, אבל גם בעיה כללית שמוצגת ברצינות ראויה לרוב הנקודות.
2. **מחקר עולמי ולמידה מהשטח** (max 10) — התייחסות ליוזמות דומות ו/או ריאיון עם תובנה. גם דוגמה אחת או ריאיון אחד ראויים לרוב הנקודות.
3. **חזון** (max 15) — תיאור של שינוי חיובי שהמיזם שואף אליו. ניסוח "עולם שבו..." הוא יתרון, לא דרישה.
4. **מפת משאבים** (max 15) — משאבים שצריך כדי שהמיזם יקרה, רצוי עם מקור. 2-3 משאבים סבירים ראויים לרוב הנקודות.
5. **תקציב** (max 10) — פריטים עם עלויות, סכום סביר. אל תדקדק על דיוק המספרים.
6. **יעדים** (max 10) — יעדים שהצוות שואף להשיג. 2 יעדים ברורים ראויים לרוב הנקודות.
7. **מדדי הצלחה** (max 10) — דרכים לבדוק אם הצליחו. מדד כמותי הוא אידיאלי, אבל גם מדד איכותי סביר זוכה לקרדיט חלקי נדיב.
8. **תוכנית פעולה** (max 10) — שלבי ביצוע. אם יש הקמה וביצוע אבל הקיימות חסרה — הורד מעט בלבד, לא הרבה.
9. **קוהרנטיות וניסוח** (max 5) — שהחלקים מסתדרים יחד באופן הגיוני. היה נדיב — תן את מרבית הנקודות אלא אם יש סתירה ממשית.

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
      // thinking cannot be combined with forced tool_choice — API returns 400.
      // The structured output via tool_choice alone is sufficient for graded scoring.
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
