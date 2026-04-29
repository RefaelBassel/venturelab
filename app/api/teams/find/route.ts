import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeClassId(raw: string) {
  return (raw || '').trim().replace(/\//g, '').replace(/\s+/g, '-');
}

// GET /api/teams/find?classId=X&deviceCode=ABCD1234
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const classId = normalizeClassId(searchParams.get('classId') || '');
  const deviceCode = (searchParams.get('deviceCode') || '').toUpperCase();

  if (!classId || !deviceCode) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  const result = await db.execute({
    sql: 'SELECT team_id, data FROM teams WHERE class_id = ? AND device_code = ?',
    args: [classId, deviceCode],
  });

  if (result.rows.length === 0) {
    return NextResponse.json({ found: false });
  }

  return NextResponse.json({
    found: true,
    teamId: result.rows[0].team_id,
    data: JSON.parse(result.rows[0].data as string),
  });
}
