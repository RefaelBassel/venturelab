import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeClassId(raw: string) {
  return (raw || '').trim().replace(/\//g, '').replace(/\s+/g, '-');
}

function toDeviceCode(teamId: string) {
  return teamId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

// GET /api/teams?classId=X&teamId=Y  — טעינת נתוני צוות
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const classId = normalizeClassId(searchParams.get('classId') || '');
  const teamId = searchParams.get('teamId') || '';

  if (!classId || !teamId) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  const result = await db.execute({
    sql: 'SELECT data FROM teams WHERE class_id = ? AND team_id = ?',
    args: [classId, teamId],
  });

  if (result.rows.length === 0) {
    return NextResponse.json({ data: null });
  }

  return NextResponse.json({
    data: JSON.parse(result.rows[0].data as string),
  });
}

// POST /api/teams  — שמירת/עדכון נתוני צוות
export async function POST(req: NextRequest) {
  const body = await req.json();
  const classId = normalizeClassId(body.classId || '');
  const teamId = body.teamId || '';
  const data = body.data;

  if (!classId || !teamId || !data) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  const deviceCode = toDeviceCode(teamId);
  const id = `${classId}__${teamId}`;

  await db.execute({
    sql: `INSERT INTO teams (id, class_id, team_id, device_code, data, updated_at)
          VALUES (?, ?, ?, ?, ?, unixepoch())
          ON CONFLICT(class_id, team_id) DO UPDATE SET
            data = excluded.data,
            device_code = excluded.device_code,
            updated_at = unixepoch()`,
    args: [id, classId, teamId, deviceCode, JSON.stringify(data)],
  });

  return NextResponse.json({ ok: true, deviceCode });
}
