'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, signOut, useSession } from 'next-auth/react';
import { Project, emptyProject } from '@/lib/types';
import { isTeacher } from '@/lib/teachers';

interface TeamRow {
  teamId: string;
  deviceCode: string;
  data: Project;
  updatedAt: number;
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <StatCard label="סה״כ צוותים" value={String(stats.total)} />
            <StatCard label="צוותים שסיימו 7+ שלבים" value={String(stats.finished)} />
            <StatCard label="ממוצע שלבים שהושלמו" value={`${stats.avg} / 7`} />
          </div>
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
                <div style={{ display: 'flex', gap: 8 }}>
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
