import { createClient } from '@libsql/client';

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export async function initDb() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      device_code TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(class_id, team_id)
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_teams_class ON teams(class_id)
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_teams_device ON teams(class_id, device_code)
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS grades (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      data TEXT NOT NULL,
      graded_by TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(class_id, team_id)
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_grades_class ON grades(class_id)
  `);
  await ensureSummaries();
}

// תקצירי ערב תוצרים — טבלה נפרדת. ניתן לקרוא בנפרד מ-initDb כדי
// להבטיח שהטבלה קיימת בנתיבי ה-showcase גם אם /api/init לא נקרא לאחרונה.
export async function ensureSummaries() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS summaries (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(class_id, team_id)
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_summaries_class ON summaries(class_id)
  `);
}
