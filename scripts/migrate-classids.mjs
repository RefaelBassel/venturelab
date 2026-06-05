// מיגרציה: מאחד את כל וריאנטי קודי הכיתה לפורמט מנורמל אחד.
// הרצה יבשה (ברירת מחדל):  node scripts/migrate-classids.mjs
// ביצוע בפועל:            node scripts/migrate-classids.mjs --apply
import { readFileSync } from 'fs';
import { createClient } from '@libsql/client';

const APPLY = process.argv.includes('--apply');

const env = {};
for (const line of readFileSync(
  new URL('../.env.local', import.meta.url),
  'utf8',
).split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const db = createClient({
  url: env.TURSO_DATABASE_URL,
  authToken: env.TURSO_AUTH_TOKEN,
});

// תלמידות שהקלידו "י1" בלבד (בלי "כיתה") שייכות לאותה כיתה — מיפוי מפורש.
const SPECIAL = { 'י1': 'כיתהי1' };
function norm(raw) {
  const n = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s/\\'"׳״`.,_-]/g, '');
  return SPECIAL[n] ?? n;
}

async function migrateTable(table) {
  const res = await db.execute(`SELECT id, class_id, team_id FROM ${table}`);
  let changed = 0;
  for (const row of res.rows) {
    const oldClass = row.class_id;
    const newClass = norm(oldClass);
    if (newClass === oldClass) continue;
    const newId = `${newClass}__${row.team_id}`;
    changed++;
    console.log(`  [${table}] "${oldClass}" -> "${newClass}"  (team ${row.team_id})`);
    if (APPLY) {
      await db.execute({
        sql: `UPDATE ${table} SET class_id = ?, id = ? WHERE id = ?`,
        args: [newClass, newId, row.id],
      });
    }
  }
  return changed;
}

console.log(`\n=== מיגרציה ${APPLY ? '(ביצוע בפועל)' : '(הרצה יבשה — שום דבר לא נשמר)'} ===\n`);
const t = await migrateTable('teams');
const g = await migrateTable('grades');
console.log(`\nסה"כ שורות לעדכון: teams=${t}, grades=${g}`);
if (!APPLY) {
  console.log('\n⚠ זו הרצה יבשה. כדי לבצע בפועל הוסף --apply');
} else {
  // ספירת אימות אחרי המיגרציה
  const after = await db.execute(
    "SELECT class_id, COUNT(*) AS n FROM teams GROUP BY class_id ORDER BY n DESC",
  );
  console.log('\n=== קודי כיתה אחרי המיגרציה ===');
  for (const r of after.rows) console.log(`  "${r.class_id}": ${Number(r.n)} צוותים`);
}
