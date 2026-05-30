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

// GET /api/teams/grade?classId=X&teamId=Y  — קריאת ציון של צוות (מורה בלבד)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isTeacher(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const classId = normalizeClassId(searchParams.get('classId') || '');
  const teamId = searchParams.get('teamId') || '';

  if (!classId || !teamId) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  const result = await db.execute({
    sql: 'SELECT data, graded_by, updated_at FROM grades WHERE class_id = ? AND team_id = ?',
    args: [classId, teamId],
  });

  if (result.rows.length === 0) {
    return NextResponse.json({ grade: null });
  }

  const row = result.rows[0];
  const data = JSON.parse(row.data as string);
  return NextResponse.json({
    grade: {
      ...data,
      gradedBy: (row.graded_by as string) || null,
      updatedAt: Number(row.updated_at),
    },
  });
}

// POST /api/teams/grade  — שמירת ציון (מורה בלבד)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isTeacher(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const classId = normalizeClassId(body.classId || '');
  const teamId = body.teamId || '';
  const data = body.data;

  if (!classId || !teamId || !data) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  const id = `${classId}__${teamId}`;
  const email = session?.user?.email || null;

  // Don't persist gradedBy/updatedAt inside the JSON — columns are the source of truth
  const clean = { ...data };
  delete clean.gradedBy;
  delete clean.updatedAt;

  await db.execute({
    sql: `INSERT INTO grades (id, class_id, team_id, data, graded_by, updated_at)
          VALUES (?, ?, ?, ?, ?, unixepoch())
          ON CONFLICT(class_id, team_id) DO UPDATE SET
            data = excluded.data,
            graded_by = excluded.graded_by,
            updated_at = unixepoch()`,
    args: [id, classId, teamId, JSON.stringify(clean), email],
  });

  return NextResponse.json({ ok: true });
}

// DELETE /api/teams/grade?classId=X&teamId=Y  — מחיקת ציון (מורה בלבד)
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isTeacher(session?.user?.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const classId = normalizeClassId(searchParams.get('classId') || '');
  const teamId = searchParams.get('teamId') || '';

  if (!classId || !teamId) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 });
  }

  await db.execute({
    sql: 'DELETE FROM grades WHERE class_id = ? AND team_id = ?',
    args: [classId, teamId],
  });

  return NextResponse.json({ ok: true });
}
