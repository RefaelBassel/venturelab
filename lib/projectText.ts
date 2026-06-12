import { Project } from './types';

// סריאליזציה של תיק המיזם לטקסט קריא — לשימוש בבקשות ל-Claude
// (הצעת ציון + תקציר ערב תוצרים).
export function projectToText(p: Project): string {
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
