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
}
