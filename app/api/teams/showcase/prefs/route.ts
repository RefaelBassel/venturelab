import { db, ensureSummaries } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { isTeacher } from '@/lib/teachers';
import { normalizeClassId } from '@/lib/classId';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/teams/showcase/prefs  — שמירת בחירות תצוגה (ציון / הצטיינות) למיזם
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isTeacher(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await ensureSummaries();

  const body = await req.json();
  const classId = normalizeClassId(body.classId || '');
  const teamId = body.teamId || '';
  if (!classId || !teamId) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  const existingRes = await db.execute({
    sql: 'SELECT data FROM summaries WHERE class_id = ? AND team_id = ?',
    args: [classId, teamId],
  });
  const existing =
    existingRes.rows.length > 0
      ? JSON.parse(existingRes.rows[0].data as string)
      : {};

  // עדכן רק שדות שנשלחו במפורש — כך ששמירת שמות לא מאפסת ציון/הצטיינות ולהפך
  const merged = { ...existing };
  if (body.showScore !== undefined) merged.showScore = !!body.showScore;
  if (body.excellence !== undefined) merged.excellence = !!body.excellence;
  if (body.members !== undefined) merged.members = String(body.members);

  const id = `${classId}__${teamId}`;
  await db.execute({
    sql: `INSERT INTO summaries (id, class_id, team_id, data, updated_at)
          VALUES (?, ?, ?, ?, unixepoch())
          ON CONFLICT(class_id, team_id) DO UPDATE SET
            data = excluded.data, updated_at = unixepoch()`,
    args: [id, classId, teamId, JSON.stringify(merged)],
  });

  return NextResponse.json({ ok: true, summary: merged });
}
