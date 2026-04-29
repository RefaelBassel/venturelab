import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth';
import { isTeacher } from '@/lib/teachers';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeClassId(raw: string) {
  return (raw || '').trim().replace(/\//g, '').replace(/\s+/g, '-');
}

// GET /api/teams/class?classId=X  — כל הצוותים בכיתה (מורה בלבד)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isTeacher(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const classId = normalizeClassId(searchParams.get('classId') || '');

  if (!classId) {
    return NextResponse.json({ error: 'missing classId' }, { status: 400 });
  }

  const result = await db.execute({
    sql: 'SELECT team_id, device_code, data, updated_at FROM teams WHERE class_id = ? ORDER BY updated_at DESC',
    args: [classId],
  });

  const teams = result.rows.map((row) => ({
    teamId: row.team_id as string,
    deviceCode: row.device_code as string,
    data: JSON.parse(row.data as string),
    updatedAt: Number(row.updated_at),
  }));

  return NextResponse.json({ teams });
}
