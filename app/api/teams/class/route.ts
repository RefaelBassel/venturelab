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
    sql: `SELECT
            t.team_id, t.device_code, t.data, t.updated_at,
            g.data AS grade_data, g.graded_by, g.updated_at AS grade_updated_at
          FROM teams t
          LEFT JOIN grades g
            ON g.class_id = t.class_id AND g.team_id = t.team_id
          WHERE t.class_id = ?
          ORDER BY t.updated_at DESC`,
    args: [classId],
  });

  const teams = result.rows.map((row) => {
    const gradeRaw = row.grade_data as string | null;
    const grade = gradeRaw
      ? {
          ...JSON.parse(gradeRaw),
          gradedBy: (row.graded_by as string) || null,
          updatedAt: Number(row.grade_updated_at),
        }
      : null;
    return {
      teamId: row.team_id as string,
      deviceCode: row.device_code as string,
      data: JSON.parse(row.data as string),
      updatedAt: Number(row.updated_at),
      grade,
    };
  });

  return NextResponse.json({ teams });
}
