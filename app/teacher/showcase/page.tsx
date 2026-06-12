'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, signOut, useSession } from 'next-auth/react';
import { toPng } from 'html-to-image';
import { isTeacher } from '@/lib/teachers';
import { Project, Showcase } from '@/lib/types';
import { Grade, RUBRIC_TOTAL, gradeTotal } from '@/lib/rubric';

const TEACHER_CLASS_KEY = 'venturelab_teacher_classid';

interface Row {
  teamId: string;
  deviceCode: string;
  data: Project;
  grade: Grade | null;
  summary: Showcase | null;
}

export default function ShowcasePage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <Centered>⏳ טוען…</Centered>;
  }
  if (status === 'unauthenticated') {
    return (
      <Centered>
        <div style={{ textAlign: 'center' }}>
          <p style={{ marginBottom: 16 }}>נדרשת כניסת מורה.</p>
          <button
            onClick={() => signIn('google', { callbackUrl: '/teacher/showcase' })}
            style={primaryBtn}
          >
            כניסה עם Google
          </button>
        </div>
      </Centered>
    );
  }
  if (!isTeacher(session?.user?.email)) {
    return (
      <Centered>
        <div style={{ textAlign: 'center' }}>
          <p style={{ marginBottom: 16 }}>חשבון זה אינו מאושר לגישת מורים.</p>
          <button onClick={() => signOut({ callbackUrl: '/' })} style={outlineBtn}>
            התנתק
          </button>
        </div>
      </Centered>
    );
  }

  return <ShowcaseView onBack={() => router.push('/teacher')} />;
}

function ShowcaseView({ onBack }: { onBack: () => void }) {
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(TEACHER_CLASS_KEY) || '';
      if (saved) setClassId(saved);
    } catch {}
  }, []);

  const load = useCallback(async (cid: string) => {
    if (!cid) return;
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(
        `/api/teams/showcase?classId=${encodeURIComponent(cid)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRows(json.teams || []);
    } catch {
      setErr('שגיאה בטעינת המיזמים.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (classId) load(classId);
  }, [classId, load]);

  const generateOne = useCallback(
    async (teamId: string) => {
      const res = await fetch('/api/teams/showcase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, teamId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setRows((prev) =>
        prev.map((r) =>
          r.teamId === teamId
            ? { ...r, summary: { ...(r.summary || {}), ...json.summary } }
            : r,
        ),
      );
    },
    [classId],
  );

  const savePrefs = useCallback(
    async (teamId: string, showScore: boolean, excellence: boolean) => {
      setRows((prev) =>
        prev.map((r) =>
          r.teamId === teamId
            ? { ...r, summary: { ...(r.summary || {}), showScore, excellence } }
            : r,
        ),
      );
      try {
        await fetch('/api/teams/showcase/prefs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId, teamId, showScore, excellence }),
        });
      } catch {}
    },
    [classId],
  );

  const generateAll = useCallback(async () => {
    const missing = rows.filter((r) => !r.summary?.summary);
    if (missing.length === 0) return;
    setBulk({ done: 0, total: missing.length });
    for (let i = 0; i < missing.length; i++) {
      try {
        await generateOne(missing[i].teamId);
      } catch {
        // ממשיכים גם אם צוות אחד נכשל
      }
      setBulk({ done: i + 1, total: missing.length });
    }
    setBulk(null);
  }, [rows, generateOne]);

  const withName = rows.filter((r) => r.data.ventureName?.trim());

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 60 }}>
      {/* Toolbar */}
      <header
        className="no-print"
        style={{
          background: 'white',
          borderBottom: '1px solid var(--border)',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          position: 'sticky',
          top: 0,
          zIndex: 30,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: '1.5rem' }}>🎪</div>
          <div>
            <div style={{ fontWeight: 900, color: 'var(--primary)' }}>
              ערב תוצרים
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>
              כיתה: {classId || '—'}
            </div>
          </div>
        </div>
        <div
          style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}
        >
          <input
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            placeholder="קוד כיתה"
            style={{
              padding: '8px 12px',
              border: '2px solid var(--border)',
              borderRadius: 10,
              fontSize: '0.9rem',
              width: 130,
            }}
          />
          <button
            onClick={generateAll}
            disabled={!!bulk || loading}
            style={primaryBtn}
          >
            {bulk
              ? `מייצר תקצירים… ${bulk.done}/${bulk.total}`
              : '✨ צור תקצירים לכולם'}
          </button>
          <button onClick={() => window.print()} style={outlineBtn}>
            🖨 הדפסה / PDF
          </button>
          <button onClick={onBack} style={outlineBtn}>
            חזרה לדשבורד
          </button>
        </div>
      </header>

      {/* Branded logo band (letterhead) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 32,
          flexWrap: 'wrap',
          padding: '22px 16px 6px',
        }}
      >
        <LogoImg src="/logos/aguda.png" alt="האגודה לקידום החינוך ירושלים" height={56} />
        <LogoImg src="/logos/shacharit.png" alt="תיכון שחרית" height={64} />
        <LogoImg src="/logos/chemed.png" alt="חמ״ד" height={46} />
      </div>

      {/* Print title */}
      <h1
        style={{
          textAlign: 'center',
          fontWeight: 900,
          color: 'var(--primary-dark)',
          fontSize: '1.8rem',
          margin: '12px 0 4px',
        }}
      >
        מעבדת המיזמים — ערב תוצרים
      </h1>
      <p
        style={{
          textAlign: 'center',
          color: 'var(--text-light)',
          marginBottom: 20,
        }}
      >
        מחשבת ישראל · שלב ד׳
      </p>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '0 16px' }}>
        {err && (
          <div
            className="no-print"
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
        {loading && (
          <div style={{ textAlign: 'center', color: 'var(--text-light)' }}>
            טוען…
          </div>
        )}
        {!loading && withName.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--text-light)',
              padding: 40,
            }}
          >
            אין מיזמים עם שם בכיתה זו.
          </div>
        )}

        <div
          className="showcase-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
            gap: 20,
          }}
        >
          {withName.map((row) => (
            <ShowcaseCard
              key={row.teamId}
              row={row}
              onGenerate={generateOne}
              onTogglePref={savePrefs}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

function ShowcaseCard({
  row,
  onGenerate,
  onTogglePref,
}: {
  row: Row;
  onGenerate: (teamId: string) => Promise<void>;
  onTogglePref: (
    teamId: string,
    showScore: boolean,
    excellence: boolean,
  ) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const s = row.summary || {};
  const showScore = !!s.showScore;
  const excellence = !!s.excellence;
  const hasGrade = row.grade && gradeTotal(row.grade) > 0;
  const score = row.grade ? gradeTotal(row.grade) : 0;
  const members = row.data.teamMembers.filter((m) => m.trim()).join(' · ');

  const generate = async () => {
    setBusy(true);
    try {
      await onGenerate(row.teamId);
    } catch {
      /* שגיאה תיבלע — אפשר לנסות שוב */
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
      const a = document.createElement('a');
      const safe = (row.data.ventureName || 'מיזם').replace(/[\\/:*?"<>|]/g, '');
      a.download = `${safe}.png`;
      a.href = dataUrl;
      a.click();
    } catch {
      /* ניתן לנסות שוב */
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      {/* Printable / exportable card */}
      <div
        ref={cardRef}
        className="showcase-card"
        style={{
          position: 'relative',
          background: 'white',
          borderRadius: 20,
          border: '1px solid var(--border)',
          boxShadow: '0 6px 24px rgba(15,23,42,0.08)',
          overflow: 'hidden',
        }}
      >
        {/* Gradient top bar */}
        <div style={{ height: 10, background: 'var(--gradient)' }} />

        {/* Badges (top-left corner physically) */}
        <div
          style={{
            position: 'absolute',
            top: 22,
            left: 18,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            alignItems: 'flex-start',
          }}
        >
          {excellence && (
            <span
              style={{
                background: 'linear-gradient(135deg,#f59e0b,#eab308)',
                color: 'white',
                fontWeight: 800,
                fontSize: '0.8rem',
                padding: '5px 12px',
                borderRadius: 999,
                boxShadow: '0 2px 8px rgba(234,179,8,0.4)',
              }}
            >
              ⭐ הצטיינות
            </span>
          )}
          {showScore && hasGrade && (
            <span
              style={{
                background: '#ede9fe',
                color: '#5b21b6',
                fontWeight: 900,
                fontSize: '0.85rem',
                padding: '5px 12px',
                borderRadius: 999,
              }}
            >
              {score}/{RUBRIC_TOTAL}
            </span>
          )}
        </div>

        <div style={{ padding: '20px 26px 24px' }}>
          <h2
            style={{
              fontSize: '1.55rem',
              fontWeight: 900,
              color: 'var(--primary-dark)',
              lineHeight: 1.25,
              marginBottom: 4,
              paddingInlineStart: excellence || (showScore && hasGrade) ? 90 : 0,
            }}
          >
            {row.data.ventureName}
          </h2>
          {members && (
            <div
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-light)',
                marginBottom: 14,
              }}
            >
              {members}
            </div>
          )}

          {s.tagline && (
            <div
              style={{
                fontSize: '1.1rem',
                fontWeight: 700,
                fontStyle: 'italic',
                color: 'var(--primary)',
                lineHeight: 1.5,
                marginBottom: 14,
              }}
            >
              {s.tagline}
            </div>
          )}

          {s.summary ? (
            <p
              style={{
                fontSize: '1rem',
                lineHeight: 1.85,
                color: 'var(--text)',
                marginBottom: 14,
              }}
            >
              {s.summary}
            </p>
          ) : (
            <p
              className="no-print"
              style={{ color: 'var(--text-light)', fontStyle: 'italic' }}
            >
              עדיין לא נוצר תקציר — לחצו &quot;✨ צור תקציר&quot; למטה.
            </p>
          )}

          {s.highlights &&
            (s.highlights.world ||
              s.highlights.approach ||
              s.highlights.budget ||
              s.highlights.goals) && (
              <div
                style={{
                  display: 'grid',
                  gap: 9,
                  background: '#f8fafc',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  marginBottom: s.quotes?.length ? 16 : 0,
                }}
              >
                <Highlight icon="🌍" label="מהעולם" text={s.highlights.world} />
                <Highlight icon="🔧" label="איך נעשה" text={s.highlights.approach} />
                <Highlight icon="💰" label="תקציב" text={s.highlights.budget} />
                <Highlight icon="🎯" label="יעדים" text={s.highlights.goals} />
              </div>
            )}

          {s.quotes && s.quotes.length > 0 && (
            <div style={{ display: 'grid', gap: 10, marginTop: 4 }}>
              {s.quotes.map((q, i) => (
                <blockquote
                  key={i}
                  style={{
                    margin: 0,
                    borderInlineStart: '4px solid var(--accent)',
                    background: '#fffbeb',
                    padding: '10px 14px',
                    borderRadius: 8,
                    fontStyle: 'italic',
                    color: '#78350f',
                    lineHeight: 1.7,
                  }}
                >
                  ״{q}״
                </blockquote>
              ))}
            </div>
          )}

          <div
            style={{
              marginTop: 18,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
              fontSize: '0.72rem',
              color: 'var(--text-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>🚀 מעבדת המיזמים · מחשבת ישראל</span>
            <LogoImg src="/logos/shacharit.png" alt="תיכון שחרית" height={24} />
          </div>
        </div>
      </div>

      {/* Controls (not printed/exported) */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginTop: 8,
          padding: '0 4px',
        }}
      >
        <button onClick={generate} disabled={busy} style={miniPrimary}>
          {busy ? '⏳ מנסח…' : s.summary ? '↻ רענן תקציר' : '✨ צור תקציר'}
        </button>
        <button
          onClick={download}
          disabled={downloading || !s.summary}
          style={miniOutline}
        >
          {downloading ? '⏳' : '⬇️ תמונה'}
        </button>
        <label style={miniLabel}>
          <input
            type="checkbox"
            checked={showScore}
            onChange={(e) =>
              onTogglePref(row.teamId, e.target.checked, excellence)
            }
            disabled={!hasGrade}
          />
          הצג ציון
        </label>
        <label style={miniLabel}>
          <input
            type="checkbox"
            checked={excellence}
            onChange={(e) =>
              onTogglePref(row.teamId, showScore, e.target.checked)
            }
          />
          ⭐ הצטיינות
        </label>
      </div>
    </div>
  );
}

function Highlight({
  icon,
  label,
  text,
}: {
  icon: string;
  label: string;
  text?: string;
}) {
  if (!text || !text.trim()) return null;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ fontSize: '1rem', lineHeight: 1.5 }}>{icon}</span>
      <div style={{ fontSize: '0.92rem', lineHeight: 1.55 }}>
        <span style={{ fontWeight: 800, color: 'var(--primary-dark)' }}>
          {label}:{' '}
        </span>
        <span style={{ color: 'var(--text)' }}>{text}</span>
      </div>
    </div>
  );
}

function LogoImg({
  src,
  alt,
  height,
}: {
  src: string;
  alt: string;
  height: number;
}) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      style={{ height, width: 'auto', objectFit: 'contain' }}
      onError={() => setOk(false)}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        color: 'var(--text-light)',
      }}
    >
      {children}
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 10,
  border: 'none',
  background: 'var(--primary)',
  color: 'white',
  fontWeight: 700,
  fontSize: '0.9rem',
};
const outlineBtn: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 10,
  border: '2px solid var(--border)',
  background: 'white',
  fontWeight: 600,
  fontSize: '0.9rem',
};
const miniPrimary: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid #c4b5fd',
  background: '#f5f3ff',
  color: '#5b21b6',
  fontWeight: 700,
  fontSize: '0.82rem',
};
const miniOutline: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'white',
  fontWeight: 600,
  fontSize: '0.82rem',
};
const miniLabel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  fontSize: '0.82rem',
  color: 'var(--text)',
};
