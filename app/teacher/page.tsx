'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, signOut, useSession } from 'next-auth/react';
import { Project, TeamContact, emptyProject } from '@/lib/types';
import { isTeacher } from '@/lib/teachers';
import {
  Grade,
  RUBRIC_SECTIONS,
  RUBRIC_TOTAL,
  clamp,
  emptyGrade,
  gradeTotal,
  isGraded,
} from '@/lib/rubric';
import {
  defaultMessageTemplate,
  emailSubject,
  personalize,
  waLink,
  mailtoLink,
} from '@/lib/notify';

interface TeamRow {
  teamId: string;
  deviceCode: string;
  data: Project;
  updatedAt: number;
  grade: Grade | null;
}

const TEACHER_CLASS_KEY = 'venturelab_teacher_classid';

function calcProgress(data: Project): number {
  let done = 0;
  if (
    data.ventureName?.trim() &&
    data.problem?.trim() &&
    data.teamMembers.some((m) => m.trim())
  )
    done++;
  if ((data.vision || '').trim().length > 10) done++;
  if (data.resources.some((r) => r.resource.trim())) done++;
  if (data.budget.some((b) => b.item.trim() && b.cost.trim())) done++;
  if (data.goals.filter((g) => g.trim()).length >= 2) done++;
  if (data.kpis.filter((k) => k.trim()).length >= 2) done++;
  if (data.actionSetup?.trim() && data.actionExecute?.trim()) done++;
  return done;
}

function timeAgo(unix: number): string {
  const sec = Math.floor(Date.now() / 1000) - unix;
  if (sec < 60) return 'עכשיו';
  const min = Math.floor(sec / 60);
  if (min < 60) return `לפני ${min} דק׳`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `לפני ${hr} שעות`;
  const d = Math.floor(hr / 24);
  return `לפני ${d} ימים`;
}

export default function TeacherPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-light)',
        }}
      >
        ⏳ טוען…
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <SignInGate
        onSignIn={() => signIn('google', { callbackUrl: '/teacher' })}
        onBack={() => router.push('/')}
      />
    );
  }

  const email = session?.user?.email;
  if (!isTeacher(email)) {
    return (
      <UnauthorizedView
        email={email || ''}
        onSignOut={() => signOut({ callbackUrl: '/' })}
      />
    );
  }

  return <Dashboard email={email!} name={session?.user?.name || ''} />;
}

function SignInGate({
  onSignIn,
  onBack,
}: {
  onSignIn: () => void;
  onBack: () => void;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--gradient)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 20,
          padding: '40px 36px',
          maxWidth: 460,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🎓</div>
        <h1
          style={{
            fontSize: '1.8rem',
            fontWeight: 900,
            color: 'var(--primary)',
            marginBottom: 8,
          }}
        >
          דשבורד מורה
        </h1>
        <p
          style={{
            color: 'var(--text-light)',
            marginBottom: 24,
            lineHeight: 1.6,
          }}
        >
          כדי לראות את הצוותים בכיתה, יש להיכנס עם חשבון Google.
        </p>
        <button
          onClick={onSignIn}
          style={{
            width: '100%',
            padding: '14px 24px',
            borderRadius: 12,
            border: '2px solid var(--border)',
            background: 'white',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          🔑 כניסה עם Google
        </button>
        <button
          onClick={onBack}
          style={{
            marginTop: 12,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-light)',
          }}
        >
          חזרה לעמוד הראשי
        </button>
      </div>
    </div>
  );
}

function UnauthorizedView({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => void;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--gradient)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 20,
          padding: 36,
          maxWidth: 460,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>🚫</div>
        <h2
          style={{
            fontSize: '1.4rem',
            fontWeight: 900,
            color: 'var(--danger)',
            marginBottom: 10,
          }}
        >
          חשבון לא מאושר
        </h2>
        <p
          style={{
            color: 'var(--text-light)',
            marginBottom: 18,
            lineHeight: 1.7,
          }}
        >
          החשבון <b>{email}</b> אינו מאושר לגישת מורים.
          <br />
          פנו לרפאל כדי להוסיף את החשבון לרשימה המאושרת.
        </p>
        <button
          onClick={onSignOut}
          style={{
            padding: '10px 24px',
            borderRadius: 10,
            border: '2px solid var(--border)',
            background: 'white',
            fontWeight: 600,
          }}
        >
          התנתק
        </button>
      </div>
    </div>
  );
}

function Dashboard({ email, name }: { email: string; name: string }) {
  const [classId, setClassId] = useState('');
  const [classInput, setClassInput] = useState('');
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [modalTeam, setModalTeam] = useState<TeamRow | null>(null);
  const [gradeTeam, setGradeTeam] = useState<TeamRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // טען class id שמור
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TEACHER_CLASS_KEY);
      if (saved) {
        setClassId(saved);
        setClassInput(saved);
      }
    } catch {}
  }, []);

  const fetchTeams = async (cid: string) => {
    if (!cid) return;
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(
        `/api/teams/class?classId=${encodeURIComponent(cid)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setTeams(json.teams || []);
    } catch {
      setErr('שגיאה בטעינת הצוותים. נסו שוב.');
    } finally {
      setLoading(false);
    }
  };

  // polling אחרי שיש classId
  useEffect(() => {
    if (!classId) return;
    fetchTeams(classId);
    pollRef.current = setInterval(() => fetchTeams(classId), 15000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [classId]);

  const submit = () => {
    const t = classInput.trim();
    if (!t) return;
    try {
      localStorage.setItem(TEACHER_CLASS_KEY, t);
    } catch {}
    setClassId(t);
  };

  const saveGrade = async (team: TeamRow, grade: Grade) => {
    const res = await fetch('/api/teams/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId, teamId: team.teamId, data: grade }),
    });
    if (!res.ok) throw new Error('save failed');
    // Update local state with the new grade so the badge updates immediately
    setTeams((prev) =>
      prev.map((t) => (t.teamId === team.teamId ? { ...t, grade } : t)),
    );
    setGradeTeam((cur) =>
      cur && cur.teamId === team.teamId ? { ...cur, grade } : cur,
    );
  };

  const exportCsv = () => {
    if (teams.length === 0) return;
    const headers = [
      'שם המיזם',
      'חברי הצוות',
      'קוד מכשיר',
      ...RUBRIC_SECTIONS.map((s) => `${s.label} (/${s.max})`),
      `סה"כ (/${RUBRIC_TOTAL})`,
      'הערה כללית',
    ];
    const escape = (s: string | number) => {
      const str = String(s ?? '');
      if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
      return str;
    };
    const rows = teams.map((t) => {
      const g = t.grade;
      const scoreCols = RUBRIC_SECTIONS.map((s) =>
        g ? String(clamp(g.scores?.[s.id] || 0, 0, s.max)) : '',
      );
      return [
        t.data.ventureName || 'ללא שם',
        t.data.teamMembers.filter((m) => m.trim()).join(', '),
        t.deviceCode,
        ...scoreCols,
        g ? String(gradeTotal(g)) : '',
        g?.general || '',
      ]
        .map(escape)
        .join(',');
    });
    // UTF-8 BOM so Excel opens Hebrew correctly
    const csv = '﻿' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `venturelab-${classId}-grades.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const removeTeam = async (team: TeamRow) => {
    const projectName = team.data.ventureName || 'ללא שם';
    const members =
      team.data.teamMembers.filter((m) => m.trim()).join(', ') || 'ללא חברי צוות';
    const ok = window.confirm(
      `האם למחוק את הצוות "${projectName}" (${members})?\n\nפעולה זו אינה ניתנת לביטול — כל נתוני הצוות יימחקו.`,
    );
    if (!ok) return;

    setDeletingId(team.teamId);
    setErr('');
    try {
      const res = await fetch(
        `/api/teams?classId=${encodeURIComponent(classId)}&teamId=${encodeURIComponent(team.teamId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTeams((prev) => prev.filter((t) => t.teamId !== team.teamId));
    } catch {
      setErr('שגיאה במחיקת הצוות. נסו שוב.');
    } finally {
      setDeletingId(null);
    }
  };

  const stats = useMemo(() => {
    if (teams.length === 0) return null;
    const total = teams.length;
    const finished = teams.filter((t) => calcProgress(t.data) >= 7).length;
    const avg =
      teams.reduce((sum, t) => sum + calcProgress(t.data), 0) / teams.length;
    return { total, finished, avg: avg.toFixed(1) };
  }, [teams]);

  return (
    <div style={{ minHeight: '100vh' }}>
      <header
        style={{
          background: 'white',
          borderBottom: '1px solid var(--border)',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: '1.6rem' }}>🎓</div>
          <div>
            <div
              style={{
                fontWeight: 900,
                color: 'var(--primary)',
                fontSize: '1.1rem',
              }}
            >
              דשבורד מורה
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
              {name || email}
            </div>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          style={{
            padding: '8px 16px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'white',
            fontSize: '0.85rem',
          }}
        >
          התנתק
        </button>
      </header>

      <main
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '24px 16px 80px',
        }}
      >
        <div
          style={{
            background: 'white',
            borderRadius: 16,
            padding: 24,
            border: '1px solid var(--border)',
            marginBottom: 20,
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <label
              style={{
                display: 'block',
                marginBottom: 6,
                fontWeight: 600,
              }}
            >
              קוד הכיתה
            </label>
            <input
              value={classInput}
              onChange={(e) => setClassInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="לדוגמה: כיתה-י3"
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '2px solid var(--border)',
                borderRadius: 10,
                fontSize: '1rem',
              }}
            />
          </div>
          <button
            onClick={submit}
            style={{
              padding: '12px 24px',
              borderRadius: 10,
              border: 'none',
              background: 'var(--primary)',
              color: 'white',
              fontWeight: 700,
            }}
          >
            טען
          </button>
          {classId && (
            <button
              onClick={() => fetchTeams(classId)}
              style={{
                padding: '12px 18px',
                borderRadius: 10,
                border: '2px solid var(--border)',
                background: 'white',
                fontWeight: 600,
              }}
            >
              🔄 רענן
            </button>
          )}
        </div>

        {err && (
          <div
            style={{
              padding: 14,
              background: '#fee2e2',
              color: '#991b1b',
              borderRadius: 10,
              marginBottom: 16,
            }}
          >
            {err}
          </div>
        )}

        {stats && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
                marginBottom: 12,
              }}
            >
              <StatCard label="סה״כ צוותים" value={String(stats.total)} />
              <StatCard
                label="צוותים שסיימו 7+ שלבים"
                value={String(stats.finished)}
              />
              <StatCard
                label="ממוצע שלבים שהושלמו"
                value={`${stats.avg} / 7`}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: 20,
              }}
            >
              <button
                onClick={exportCsv}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'white',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                }}
              >
                ⬇️ ייצוא ציונים (CSV)
              </button>
            </div>
          </>
        )}

        {!classId && (
          <EmptyState text="הזינו קוד כיתה כדי לראות את הצוותים." />
        )}

        {classId && !loading && teams.length === 0 && (
          <EmptyState
            text={`עדיין אין צוותים בכיתה "${classId}". כשתלמיד יזין את אותו קוד כיתה, הוא יופיע כאן.`}
          />
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {teams.map((t) => {
            const progress = calcProgress(t.data);
            const badge =
              progress >= 7
                ? { text: '✅ הושלם', bg: '#d1fae5', color: '#065f46' }
                : progress >= 1
                  ? { text: '⏳ בתהליך', bg: '#fef3c7', color: '#92400e' }
                  : { text: '🆕 חדש', bg: '#dbeafe', color: '#1e3a8a' };
            return (
              <div
                key={t.teamId}
                style={{
                  background: 'white',
                  borderRadius: 14,
                  padding: 18,
                  border: '1px solid var(--border)',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 14,
                  alignItems: 'center',
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: '1.05rem',
                      marginBottom: 4,
                    }}
                  >
                    {t.data.ventureName || (
                      <span style={{ color: 'var(--text-light)' }}>
                        ללא שם
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '0.9rem',
                      color: 'var(--text-light)',
                      marginBottom: 8,
                    }}
                  >
                    {t.data.teamMembers.filter((m) => m.trim()).join(', ') || '—'}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <ProgressMini done={progress} total={7} />
                    <span
                      style={{
                        background: badge.bg,
                        color: badge.color,
                        padding: '3px 10px',
                        borderRadius: 999,
                        fontSize: '0.78rem',
                        fontWeight: 700,
                      }}
                    >
                      {badge.text}
                    </span>
                    {isGraded(t.grade) && (
                      <span
                        title="ציון מחוון"
                        style={{
                          background: '#ede9fe',
                          color: '#5b21b6',
                          padding: '3px 10px',
                          borderRadius: 999,
                          fontSize: '0.78rem',
                          fontWeight: 800,
                        }}
                      >
                        ★ {gradeTotal(t.grade)}/{RUBRIC_TOTAL}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--text-light)',
                      }}
                    >
                      עודכן {timeAgo(t.updatedAt)}
                    </span>
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '0.78rem',
                        color: 'var(--text-light)',
                        background: '#f1f5f9',
                        padding: '2px 8px',
                        borderRadius: 6,
                        letterSpacing: 1,
                      }}
                    >
                      {t.deviceCode}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setModalTeam(t)}
                    style={{
                      padding: '10px 18px',
                      borderRadius: 10,
                      border: '1px solid var(--primary)',
                      background: '#eef2ff',
                      color: 'var(--primary-dark)',
                      fontWeight: 700,
                    }}
                  >
                    פרטים
                  </button>
                  <button
                    onClick={() => setGradeTeam(t)}
                    style={{
                      padding: '10px 18px',
                      borderRadius: 10,
                      border: '1px solid #c4b5fd',
                      background: '#ede9fe',
                      color: '#5b21b6',
                      fontWeight: 700,
                    }}
                  >
                    ★ מחוון
                  </button>
                  <button
                    onClick={() => removeTeam(t)}
                    disabled={deletingId === t.teamId}
                    title="מחק צוות"
                    aria-label="מחק צוות"
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1px solid #fecaca',
                      background: '#fee2e2',
                      color: '#991b1b',
                      fontWeight: 700,
                      opacity: deletingId === t.teamId ? 0.6 : 1,
                      cursor:
                        deletingId === t.teamId ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {deletingId === t.teamId ? '⏳' : '🗑'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {modalTeam && (
        <TeamModal team={modalTeam} onClose={() => setModalTeam(null)} />
      )}
      {gradeTeam && (
        <GradeModal
          team={gradeTeam}
          classId={classId}
          teacherName={name}
          onClose={() => setGradeTeam(null)}
          onSave={saveGrade}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: 18,
      }}
    >
      <div
        style={{
          fontSize: '0.8rem',
          color: 'var(--text-light)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '1.8rem',
          fontWeight: 900,
          color: 'var(--primary-dark)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        background: 'white',
        border: '1px dashed var(--border)',
        borderRadius: 14,
        padding: 40,
        textAlign: 'center',
        color: 'var(--text-light)',
        lineHeight: 1.7,
      }}
    >
      📭<br />
      {text}
    </div>
  );
}

function ProgressMini({ done, total }: { done: number; total: number }) {
  const pct = (done / total) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          width: 100,
          height: 8,
          background: '#e2e8f0',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--gradient)',
          }}
        />
      </div>
      <span
        style={{
          fontSize: '0.8rem',
          color: 'var(--text-light)',
          fontWeight: 600,
          minWidth: 36,
        }}
      >
        {done}/{total}
      </span>
    </div>
  );
}

function TeamModal({
  team,
  onClose,
}: {
  team: TeamRow;
  onClose: () => void;
}) {
  const data = { ...emptyProject(), ...team.data };
  const total = data.budget.reduce((s, b) => {
    const n = parseFloat((b.cost || '').replace(/[^\d.-]/g, ''));
    return s + (isFinite(n) ? n : 0);
  }, 0);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 16,
          padding: 24,
          maxWidth: 760,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h2
            style={{
              fontWeight: 900,
              color: 'var(--primary)',
              fontSize: '1.4rem',
            }}
          >
            {data.ventureName || 'ללא שם'}
          </h2>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: '#f1f5f9',
              borderRadius: '50%',
              width: 36,
              height: 36,
              fontSize: '1.2rem',
            }}
            aria-label="סגור"
          >
            ×
          </button>
        </div>

        <ModalSection title="חברי הצוות">
          {data.teamMembers.filter((m) => m.trim()).join(', ') || '—'}
        </ModalSection>

        <ModalSection title="הבעיה החברתית">{data.problem || '—'}</ModalSection>
        <ModalSection title="מחקר עולמי">
          {data.worldResearch || '—'}
        </ModalSection>
        <ModalSection title="ריאיון עם">
          {data.interviewee || '—'}
        </ModalSection>
        <ModalSection title="תובנות מהריאיון">
          {data.interviewInsights || '—'}
        </ModalSection>
        <ModalSection title="חזון">{data.vision || '—'}</ModalSection>

        <ModalSection title="משאבים">
          {data.resources.filter((r) => r.resource.trim()).length === 0
            ? '—'
            : data.resources
                .filter((r) => r.resource.trim())
                .map((r, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    • <b>{r.resource}</b>
                    {r.source ? ` (${r.source})` : ''} —{' '}
                    <span style={{ color: 'var(--text-light)' }}>
                      אישור: {r.approval}
                    </span>
                  </div>
                ))}
        </ModalSection>

        <ModalSection title={`תקציב — סה״כ ${total.toLocaleString('he-IL')} ₪`}>
          {data.budget.filter((b) => b.item.trim()).length === 0
            ? '—'
            : data.budget
                .filter((b) => b.item.trim())
                .map((b, i) => (
                  <div key={i} style={{ marginBottom: 6 }}>
                    • <b>{b.item}</b> — {b.cost || '0'} ₪
                    {b.notes ? ` (${b.notes})` : ''}
                  </div>
                ))}
        </ModalSection>

        <ModalSection title="יעדים">
          {data.goals.filter((g) => g.trim()).length === 0 ? (
            '—'
          ) : (
            <ol style={{ paddingInlineStart: 22 }}>
              {data.goals
                .filter((g) => g.trim())
                .map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
            </ol>
          )}
        </ModalSection>

        <ModalSection title="מדדי הצלחה">
          {data.kpis.filter((k) => k.trim()).length === 0 ? (
            '—'
          ) : (
            <ol style={{ paddingInlineStart: 22 }}>
              {data.kpis
                .filter((k) => k.trim())
                .map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
            </ol>
          )}
        </ModalSection>

        <ModalSection title="תוכנית פעולה">
          <div>
            <b>הקמה:</b> {data.actionSetup || '—'}
          </div>
          <div>
            <b>ביצוע:</b> {data.actionExecute || '—'}
          </div>
          <div>
            <b>קיימות:</b> {data.actionSustain || '—'}
          </div>
        </ModalSection>
      </div>
    </div>
  );
}

function ModalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: '#f8fafc',
        borderRadius: 10,
        padding: 14,
        marginBottom: 10,
        lineHeight: 1.7,
      }}
    >
      <div
        style={{
          fontWeight: 800,
          color: 'var(--primary-dark)',
          marginBottom: 6,
          fontSize: '0.95rem',
        }}
      >
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ---------- Grade Modal ----------
function GradeModal({
  team,
  classId,
  teacherName,
  onClose,
  onSave,
}: {
  team: TeamRow;
  classId: string;
  teacherName?: string;
  onClose: () => void;
  onSave: (team: TeamRow, grade: Grade) => Promise<void>;
}) {
  const project = useMemo(
    () => ({ ...emptyProject(), ...team.data }),
    [team.data],
  );
  const [grade, setGrade] = useState<Grade>(
    () => team.grade || emptyGrade(),
  );
  const [saving, setSaving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  // --- שליחה לתלמידים ---
  const memberNames = useMemo(
    () => project.teamMembers.filter((m) => m.trim()),
    [project.teamMembers],
  );
  const [showSend, setShowSend] = useState(false);
  const [includeSections, setIncludeSections] = useState(true);
  const [message, setMessage] = useState<string>('');

  const buildMessage = (withSections: boolean) =>
    setMessage(
      defaultMessageTemplate({
        project,
        grade,
        teacherName,
        includeSections: withSections,
      }),
    );

  const getContact = (name: string): TeamContact =>
    (grade.contacts || []).find((c) => c.name === name) || {
      name,
      phone: '',
      email: '',
    };

  const setContact = (
    name: string,
    field: 'phone' | 'email',
    value: string,
  ) => {
    setGrade((prev) => {
      const contacts = [...(prev.contacts || [])];
      const i = contacts.findIndex((c) => c.name === name);
      if (i >= 0) contacts[i] = { ...contacts[i], [field]: value };
      else contacts.push({ name, phone: '', email: '', [field]: value });
      return { ...prev, contacts };
    });
  };

  const openLink = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
  };

  const total = gradeTotal(grade);

  const suggest = async () => {
    setSuggesting(true);
    setErr('');
    setInfo('');
    try {
      const res = await fetch('/api/teams/grade/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, teamId: team.teamId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error || `שגיאה ${res.status}`);
        return;
      }
      const s = json.suggestion as {
        scores: Record<string, number>;
        notes: Record<string, string>;
        general: string;
      };
      // אכוף את הטווח לכל סעיף ושמור בטופס
      const scores: Record<string, number> = {};
      for (const sec of RUBRIC_SECTIONS) {
        scores[sec.id] = clamp(s.scores?.[sec.id] || 0, 0, sec.max);
      }
      setGrade((prev) => ({
        scores,
        notes: { ...s.notes },
        general: s.general || '',
        contacts: prev.contacts, // שמור פרטי קשר שכבר הוזנו
      }));
      setInfo('הצעה התקבלה — אפשר לאשר כפי שהיא, או לערוך כל ציון/הערה לפני שמירה.');
    } catch {
      setErr('שגיאת רשת בקריאה ל-Claude.');
    } finally {
      setSuggesting(false);
    }
  };

  const setScore = (sid: string, raw: string) => {
    const section = RUBRIC_SECTIONS.find((s) => s.id === sid);
    if (!section) return;
    const n = raw === '' ? 0 : parseFloat(raw);
    const val = clamp(isFinite(n) ? n : 0, 0, section.max);
    setGrade((prev) => ({
      ...prev,
      scores: { ...prev.scores, [sid]: val },
    }));
  };

  const setNote = (sid: string, val: string) => {
    setGrade((prev) => ({
      ...prev,
      notes: { ...prev.notes, [sid]: val },
    }));
  };

  const setGeneral = (val: string) => {
    setGrade((prev) => ({ ...prev, general: val }));
  };

  const submit = async () => {
    setSaving(true);
    setErr('');
    try {
      await onSave(team, grade);
      onClose();
    } catch {
      setErr('שגיאה בשמירה. נסו שוב.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 16,
          padding: 0,
          maxWidth: 820,
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
        }}
      >
        {/* Sticky header */}
        <div
          style={{
            padding: '18px 22px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '1.3rem',
                fontWeight: 900,
                color: 'var(--primary)',
              }}
            >
              ★ מחוון — {project.ventureName || 'ללא שם'}
            </div>
            <div
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-light)',
                marginTop: 2,
              }}
            >
              {project.teamMembers.filter((m) => m.trim()).join(', ') ||
                'ללא חברי צוות'}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={suggest}
              disabled={suggesting || saving}
              title="ייצור הצעת ציון עם Claude AI — אפשר לערוך לפני שמירה"
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid #c4b5fd',
                background: suggesting ? '#ede9fe' : '#f5f3ff',
                color: '#5b21b6',
                fontWeight: 700,
                fontSize: '0.9rem',
                cursor: suggesting ? 'wait' : 'pointer',
              }}
            >
              {suggesting ? '✨ מנתח…' : '✨ הצע ציון'}
            </button>
            <div
              style={{
                background: '#ede9fe',
                color: '#5b21b6',
                padding: '8px 16px',
                borderRadius: 999,
                fontWeight: 900,
                fontSize: '1.05rem',
              }}
            >
              {total} / {RUBRIC_TOTAL}
            </div>
            <button
              onClick={onClose}
              style={{
                border: 'none',
                background: '#f1f5f9',
                borderRadius: '50%',
                width: 36,
                height: 36,
                fontSize: '1.2rem',
              }}
              aria-label="סגור"
            >
              ×
            </button>
          </div>
        </div>

        {info && (
          <div
            style={{
              padding: '10px 22px',
              background: '#dbeafe',
              color: '#1e3a8a',
              fontSize: '0.88rem',
              borderBottom: '1px solid var(--border)',
            }}
          >
            ℹ️ {info}
          </div>
        )}

        {/* Scrollable body */}
        <div
          style={{
            padding: '18px 22px',
            overflowY: 'auto',
            flex: 1,
            display: 'grid',
            gap: 14,
          }}
        >
          {RUBRIC_SECTIONS.map((section, idx) => {
            const score = grade.scores?.[section.id] || 0;
            const note = grade.notes?.[section.id] || '';
            const rows = section.preview(project);
            return (
              <section
                key={section.id}
                style={{
                  background: '#f8fafc',
                  borderRadius: 12,
                  padding: 14,
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 10,
                    marginBottom: 6,
                  }}
                >
                  <div
                    style={{
                      fontWeight: 800,
                      color: 'var(--primary-dark)',
                      fontSize: '1rem',
                    }}
                  >
                    {idx + 1}. {section.label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number"
                      min={0}
                      max={section.max}
                      step={0.5}
                      value={score}
                      onChange={(e) => setScore(section.id, e.target.value)}
                      style={{
                        width: 64,
                        padding: '6px 8px',
                        border: '2px solid var(--border)',
                        borderRadius: 8,
                        fontSize: '1rem',
                        fontWeight: 700,
                        textAlign: 'center',
                        background: 'white',
                      }}
                    />
                    <span
                      style={{
                        fontSize: '0.9rem',
                        color: 'var(--text-light)',
                        fontWeight: 700,
                      }}
                    >
                      / {section.max}
                    </span>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: '0.82rem',
                    color: 'var(--text-light)',
                    marginBottom: 10,
                    lineHeight: 1.55,
                  }}
                >
                  {section.description}
                </div>
                {rows.length > 0 && (
                  <div
                    style={{
                      background: 'white',
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 10,
                      border: '1px dashed var(--border)',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    {rows.map((r, i) => (
                      <div
                        key={i}
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'minmax(90px, 130px) 1fr',
                          gap: 10,
                          fontSize: '0.88rem',
                          lineHeight: 1.55,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            color: 'var(--text-light)',
                          }}
                        >
                          {r.label}
                        </div>
                        <div>{r.value}</div>
                      </div>
                    ))}
                  </div>
                )}
                <textarea
                  value={note}
                  onChange={(e) => setNote(section.id, e.target.value)}
                  placeholder="הערה (אופציונלי)"
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    border: '2px solid var(--border)',
                    borderRadius: 8,
                    fontSize: '0.92rem',
                    background: 'white',
                    minHeight: 56,
                    resize: 'vertical',
                  }}
                />
              </section>
            );
          })}

          {/* General feedback */}
          <section
            style={{
              background: '#fffbeb',
              borderRadius: 12,
              padding: 14,
              border: '1px solid #fde68a',
            }}
          >
            <div
              style={{
                fontWeight: 800,
                color: '#92400e',
                marginBottom: 8,
              }}
            >
              💬 הערה כללית למשוב
            </div>
            <textarea
              value={grade.general || ''}
              onChange={(e) => setGeneral(e.target.value)}
              placeholder="משוב כללי לצוות, מה הם עשו טוב ומה לשפר…"
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '2px solid #fde68a',
                borderRadius: 8,
                fontSize: '0.95rem',
                background: 'white',
                minHeight: 80,
                resize: 'vertical',
              }}
            />
          </section>

          {/* Send to students */}
          <section
            style={{
              background: '#eff6ff',
              borderRadius: 12,
              padding: 14,
              border: '1px solid #bfdbfe',
            }}
          >
            <button
              onClick={() => {
                const next = !showSend;
                setShowSend(next);
                if (next && !message) buildMessage(includeSections);
              }}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontWeight: 800,
                color: '#1e40af',
                fontSize: '1rem',
              }}
            >
              <span>📤 שליחת ההערכה לתלמידים</span>
              <span>{showSend ? '▲' : '▼'}</span>
            </button>

            {showSend && (
              <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: '0.9rem',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={includeSections}
                      onChange={(e) => {
                        setIncludeSections(e.target.checked);
                        buildMessage(e.target.checked);
                      }}
                      style={{ width: 16, height: 16 }}
                    />
                    כלול פירוט סעיפים בהודעה
                  </label>
                  <button
                    onClick={() => buildMessage(includeSections)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'white',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    ↻ בנה הודעה מחדש מהציון
                  </button>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--text-light)',
                      marginBottom: 4,
                    }}
                  >
                    תוכן ההודעה (ניתן לעריכה). הסימן{' '}
                    <code
                      style={{
                        background: '#dbeafe',
                        padding: '1px 5px',
                        borderRadius: 4,
                      }}
                    >
                      [שם]
                    </code>{' '}
                    יוחלף אוטומטית בשם כל תלמיד/ה.
                  </div>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={8}
                    placeholder="לחצו על 'בנה הודעה מחדש מהציון' כדי ליצור טיוטה…"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '2px solid #bfdbfe',
                      borderRadius: 8,
                      fontSize: '0.9rem',
                      background: 'white',
                      minHeight: 160,
                      resize: 'vertical',
                      lineHeight: 1.6,
                    }}
                  />
                </div>

                {memberNames.length === 0 ? (
                  <div
                    style={{
                      fontSize: '0.88rem',
                      color: 'var(--text-light)',
                    }}
                  >
                    לא הוזנו שמות חברי צוות במיזם זה.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {memberNames.map((name) => {
                      const c = getContact(name);
                      const text = personalize(message, name);
                      const subject = emailSubject(project);
                      const hasMsg = message.trim().length > 0;
                      return (
                        <div
                          key={name}
                          style={{
                            background: 'white',
                            borderRadius: 10,
                            padding: 10,
                            border: '1px solid var(--border)',
                            display: 'grid',
                            gap: 8,
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>{name}</div>
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              flexWrap: 'wrap',
                              alignItems: 'center',
                            }}
                          >
                            <input
                              value={c.phone}
                              onChange={(e) =>
                                setContact(name, 'phone', e.target.value)
                              }
                              placeholder="טלפון (לוואטסאפ)"
                              inputMode="tel"
                              style={{
                                flex: 1,
                                minWidth: 130,
                                padding: '8px 10px',
                                border: '2px solid var(--border)',
                                borderRadius: 8,
                                fontSize: '0.9rem',
                              }}
                            />
                            <button
                              onClick={() =>
                                openLink(waLink(c.phone, text))
                              }
                              disabled={!c.phone.trim() || !hasMsg}
                              style={{
                                padding: '8px 14px',
                                borderRadius: 8,
                                border: 'none',
                                background:
                                  c.phone.trim() && hasMsg
                                    ? '#22c55e'
                                    : '#cbd5e1',
                                color: 'white',
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              📱 וואטסאפ
                            </button>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              flexWrap: 'wrap',
                              alignItems: 'center',
                            }}
                          >
                            <input
                              value={c.email}
                              onChange={(e) =>
                                setContact(name, 'email', e.target.value)
                              }
                              placeholder="מייל"
                              inputMode="email"
                              style={{
                                flex: 1,
                                minWidth: 130,
                                padding: '8px 10px',
                                border: '2px solid var(--border)',
                                borderRadius: 8,
                                fontSize: '0.9rem',
                                direction: 'ltr',
                                textAlign: 'right',
                              }}
                            />
                            <button
                              onClick={() =>
                                openLink(
                                  mailtoLink(c.email, subject, text),
                                )
                              }
                              disabled={!c.email.trim() || !hasMsg}
                              style={{
                                padding: '8px 14px',
                                borderRadius: 8,
                                border: 'none',
                                background:
                                  c.email.trim() && hasMsg
                                    ? 'var(--primary)'
                                    : '#cbd5e1',
                                color: 'white',
                                fontWeight: 700,
                                fontSize: '0.9rem',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              ✉️ מייל
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-light)',
                    lineHeight: 1.6,
                  }}
                >
                  💡 פרטי הקשר נשמרים יחד עם הציון בלחיצה על &quot;שמור ציון&quot; —
                  כך לא תצטרכו להזין אותם שוב. השליחה עצמה פותחת וואטסאפ/מייל עם
                  ההודעה מוכנה; אתם לוחצים &quot;שלח&quot; בעצמכם.
                </div>
              </div>
            )}
          </section>

          {grade.updatedAt && (
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-light)',
                textAlign: 'center',
              }}
            >
              נשמר לאחרונה ב-
              {new Date(grade.updatedAt * 1000).toLocaleString('he-IL')}
              {grade.gradedBy ? ` ע"י ${grade.gradedBy}` : ''}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          {err ? (
            <span style={{ color: '#991b1b', fontSize: '0.9rem' }}>{err}</span>
          ) : (
            <span style={{ color: 'var(--text-light)', fontSize: '0.85rem' }}>
              סה״כ:{' '}
              <b style={{ color: '#5b21b6', fontSize: '1rem' }}>
                {total} / {RUBRIC_TOTAL}
              </b>
            </span>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: '2px solid var(--border)',
                background: 'white',
                fontWeight: 600,
              }}
            >
              ביטול
            </button>
            <button
              onClick={submit}
              disabled={saving}
              style={{
                padding: '10px 22px',
                borderRadius: 10,
                border: 'none',
                background: saving ? '#cbd5e1' : 'var(--primary)',
                color: 'white',
                fontWeight: 800,
              }}
            >
              {saving ? 'שומר…' : 'שמור ציון'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
