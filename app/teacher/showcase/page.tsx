'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, signOut, useSession } from 'next-auth/react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { isTeacher } from '@/lib/teachers';
import { Project, Showcase } from '@/lib/types';
import { Grade, RUBRIC_TOTAL, gradeTotal } from '@/lib/rubric';

const TEACHER_CLASS_KEY = 'venturelab_teacher_classid';

// צילום עמיד של כרטיס ל-PNG (data URL): ממתין לפונט+תמונות, צילום-חימום,
// וניסיון חוזר בלי הטמעת פונט אם הראשון נכשל.
async function cardToPng(node: HTMLElement): Promise<string> {
  if (document.fonts?.ready) await document.fonts.ready;
  const imgs = Array.from(node.querySelectorAll('img'));
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((res) => {
            img.onload = () => res();
            img.onerror = () => res();
          }),
    ),
  );
  const opts = { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true };
  await toPng(node, { ...opts, pixelRatio: 1 }).catch(() => {});
  try {
    return await toPng(node, opts);
  } catch {
    return await toPng(node, { ...opts, skipFonts: true });
  }
}

function pngSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => res({ w: 800, h: 1100 });
    img.src = dataUrl;
  });
}

function safeName(s: string): string {
  return (s || 'מיזם').replace(/[\\/:*?"<>|]/g, '').trim() || 'מיזם';
}

function imageExists(src: string): Promise<boolean> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img.naturalWidth > 0);
    img.onerror = () => res(false);
    img.src = src + (src.includes('?') ? '' : `?v=${Date.now()}`);
  });
}

function summaryHasContent(s: Showcase | null | undefined): boolean {
  if (!s) return false;
  const h = s.highlights || {};
  return !!(
    s.tagline?.trim() ||
    h.pain?.trim() ||
    h.proposal?.trim() ||
    h.world?.trim() ||
    h.approach?.trim() ||
    h.budget?.trim() ||
    h.goals?.trim()
  );
}

interface Row {
  teamId: string;
  deviceCode: string;
  data: Project;
  grade: Grade | null;
  summary: Showcase | null;
}

// ====== חוברת תקצירי מיזמים (booklet) ======
const TEAL = '#0e4f54';
const ORANGE = '#f5a623';
const CREAM = '#fdf7ec';
// צבעי כריכה בסגנון ספר הלימוד
const COVER_ORANGE = '#d7973c';
const COVER_TITLE = '#5a3a15';
const COVER_SUB = '#6e4a1d';
const PAGE_W = 794; // A4 ב-96dpi
const PAGE_H = 1123;

function bookletPageStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: PAGE_W,
    height: PAGE_H,
    position: 'relative',
    overflow: 'hidden',
    background: 'white',
    boxSizing: 'border-box',
    ...extra,
  };
}

// שמש כתומה — המוטיב מלוגו שחרית (חצי עיגול, שטוח מלמטה)
function Sun({ size, color = ORANGE }: { size: number; color?: string }) {
  return (
    <div
      style={{
        width: size,
        height: size / 2,
        background: color,
        borderTopLeftRadius: size,
        borderTopRightRadius: size,
      }}
    />
  );
}

function BookletCover({
  classLabel,
  imageSrc,
}: {
  classLabel: string;
  imageSrc?: string;
}) {
  if (imageSrc) {
    return (
      <div className="booklet-page" style={bookletPageStyle()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt="כריכה"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }
  // עיצוב בסגנון כריכת ספר הלימוד: רקע כתום-זהוב + פס לבן עם הלוגואים למעלה
  return (
    <div
      className="booklet-page"
      style={bookletPageStyle({
        background: COVER_ORANGE,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      })}
    >
      {/* פס לבן עם הלוגואים — רק בכריכה */}
      <div
        style={{
          marginTop: 34,
          background: CREAM,
          borderRadius: 10,
          padding: '14px 34px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 34,
        }}
      >
        <LogoImg src="/logos/aguda.png" alt="האגודה" height={42} />
        <LogoImg src="/logos/shacharit.png" alt="שחרית" height={50} />
        <LogoImg src="/logos/chemed.png" alt="חמד" height={36} />
      </div>

      {/* כותרת */}
      <div style={{ marginTop: 130, textAlign: 'center', padding: '0 56px' }}>
        <div
          style={{
            color: COVER_TITLE,
            fontWeight: 900,
            fontSize: 70,
            lineHeight: 1.15,
            textShadow: '0 2px 0 rgba(255,255,255,0.25)',
          }}
        >
          אחריות קהילתית
        </div>
        <div
          style={{
            color: COVER_TITLE,
            fontWeight: 900,
            fontSize: 44,
            marginTop: 8,
            textShadow: '0 2px 0 rgba(255,255,255,0.25)',
          }}
        >
          חוברת תקצירי מיזמים
        </div>
        <div
          style={{
            color: COVER_SUB,
            fontSize: 25,
            fontWeight: 600,
            marginTop: 26,
          }}
        >
          מחשבת ישראל · תיכון שחרית
        </div>
        {classLabel && (
          <div style={{ color: COVER_SUB, fontSize: 21, marginTop: 8, opacity: 0.9 }}>
            {classLabel}
          </div>
        )}
      </div>

      <div style={{ marginTop: 'auto', marginBottom: 70 }}>
        <Sun size={150} />
      </div>
    </div>
  );
}

function BookletIntro({ classLabel }: { classLabel: string }) {
  return (
    <div
      className="booklet-page"
      style={bookletPageStyle({ padding: '70px 64px' })}
    >
      <div style={{ width: 90, height: 5, background: ORANGE, borderRadius: 3, marginBottom: 28 }} />
      <h1 style={{ color: TEAL, fontSize: 42, fontWeight: 900, marginBottom: 24 }}>
        דבר הצוות
      </h1>
      <p style={{ fontSize: 20, lineHeight: 2, color: '#1e293b', marginBottom: 18 }}>
        חוברת זו מאגדת את תקצירי המיזמים החברתיים שפיתחו תלמידי הכיתה במסגרת
        לימודי מחשבת ישראל — שלב &quot;אחריות קהילתית&quot;. כל מיזם נולד מתוך
        הקשבה לכאב אמיתי בקהילה, ומציע דרך מעשית לתקן, לחבר ולעשות טוב.
      </p>
      <p style={{ fontSize: 20, lineHeight: 2, color: '#1e293b', marginBottom: 40 }}>
        אנו גאים בתלמידינו על החשיבה, האכפתיות והיצירתיות, ומזמינים אתכם לעיין
        ברעיונות שצמחו כאן.
      </p>
      <div
        style={{
          borderInlineStart: `5px solid ${ORANGE}`,
          background: CREAM,
          borderRadius: 12,
          padding: '24px 28px',
          fontSize: 21,
          lineHeight: 1.9,
          color: TEAL,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 24, marginBottom: 8 }}>
          ריעות רוקח · רפאל באסל
        </div>
        <div style={{ fontWeight: 700 }}>צוות מחשבת ישראל</div>
        <div style={{ opacity: 0.85 }}>תיכון שחרית</div>
      </div>
      {classLabel && (
        <div style={{ marginTop: 'auto', paddingTop: 40, color: 'var(--text-light)', fontSize: 18 }}>
          {classLabel}
        </div>
      )}
    </div>
  );
}

function BookletToc({
  entries,
}: {
  entries: { name: string; members: string; page: number }[];
}) {
  return (
    <div
      className="booklet-page"
      style={bookletPageStyle({ padding: '70px 64px' })}
    >
      <div style={{ width: 90, height: 5, background: ORANGE, borderRadius: 3, marginBottom: 28 }} />
      <h1 style={{ color: TEAL, fontSize: 40, fontWeight: 900, marginBottom: 30 }}>
        תוכן עניינים
      </h1>
      <div style={{ display: 'grid', gap: 14 }}>
        {entries.map((e, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              fontSize: 19,
            }}
          >
            <span style={{ fontWeight: 800, color: TEAL, minWidth: 28 }}>
              {e.page}.
            </span>
            <span style={{ fontWeight: 700, color: '#1e293b' }}>{e.name}</span>
            {e.members && (
              <span style={{ color: 'var(--text-light)', fontSize: 16 }}>
                · {e.members}
              </span>
            )}
            <span
              style={{
                flex: 1,
                borderBottom: '2px dotted #cbd5e1',
                margin: '0 6px',
                transform: 'translateY(-4px)',
              }}
            />
            <span style={{ fontWeight: 800, color: TEAL }}>עמ׳ {e.page}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BookletProjectPage({
  row,
  number,
  classLabel,
}: {
  row: Row;
  number: number;
  classLabel: string;
}) {
  const s = row.summary || {};
  const showScore = !!s.showScore && !!row.grade && gradeTotal(row.grade) > 0;
  const excellence = !!s.excellence;
  const members = row.data.teamMembers.filter((m) => m.trim()).join(' · ');
  return (
    <div
      className="booklet-page"
      style={bookletPageStyle({
        padding: '48px 56px 40px',
        display: 'flex',
        flexDirection: 'column',
      })}
    >
      {/* header — no logos in booklet pages */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          color: 'var(--text-light)',
          fontSize: 14,
          fontWeight: 700,
          borderBottom: `2px solid ${ORANGE}`,
          paddingBottom: 8,
          marginBottom: 20,
        }}
      >
        <span>חוברת תקצירי מיזמים · אחריות קהילתית</span>
        <span>{classLabel}</span>
      </div>

      {(excellence || showScore) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {excellence && (
            <span
              style={{
                background: `linear-gradient(135deg,${ORANGE},#eab308)`,
                color: 'white',
                fontWeight: 800,
                fontSize: 15,
                padding: '6px 14px',
                borderRadius: 999,
              }}
            >
              ⭐ מיזם מצטיין
            </span>
          )}
          {showScore && (
            <span
              style={{
                background: '#ede9fe',
                color: '#5b21b6',
                fontWeight: 900,
                fontSize: 15,
                padding: '6px 14px',
                borderRadius: 999,
              }}
            >
              {gradeTotal(row.grade)}/{RUBRIC_TOTAL}
            </span>
          )}
        </div>
      )}

      <h2 style={{ color: TEAL, fontSize: 34, fontWeight: 900, lineHeight: 1.2 }}>
        {row.data.ventureName}
      </h2>
      {members && (
        <div style={{ color: 'var(--text-light)', fontSize: 17, marginTop: 6, marginBottom: 16 }}>
          {members}
        </div>
      )}
      {s.tagline && (
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            fontStyle: 'italic',
            color: ORANGE,
            lineHeight: 1.5,
            marginBottom: 18,
          }}
        >
          {s.tagline}
        </div>
      )}

      <div style={{ fontSize: 17 }}>
        <Highlights s={s} marginBottom={s.quotes?.length ? 18 : 0} />
        <Quotes quotes={s.quotes} />
      </div>

      <div
        style={{
          marginTop: 'auto',
          paddingTop: 16,
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-between',
          color: 'var(--text-light)',
          fontSize: 13,
        }}
      >
        <span>מעבדת המיזמים · מחשבת ישראל · תיכון שחרית</span>
        <span>עמ׳ {number}</span>
      </div>
    </div>
  );
}

function BookletBack({ imageSrc }: { imageSrc?: string }) {
  if (imageSrc) {
    return (
      <div className="booklet-page" style={bookletPageStyle()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageSrc}
          alt="כריכה אחורית"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </div>
    );
  }
  return (
    <div
      className="booklet-page"
      style={bookletPageStyle({
        background: COVER_ORANGE,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Sun size={170} />
      <div style={{ color: COVER_TITLE, fontSize: 34, fontWeight: 900, marginTop: 28 }}>
        מעבדת המיזמים
      </div>
      <div style={{ color: COVER_SUB, fontSize: 21, marginTop: 8 }}>
        מחשבת ישראל · תיכון שחרית
      </div>
      <div
        style={{
          marginTop: 46,
          background: CREAM,
          borderRadius: 12,
          padding: '14px 28px',
          display: 'flex',
          gap: 30,
          alignItems: 'center',
        }}
      >
        <LogoImg src="/logos/aguda.png" alt="האגודה" height={36} />
        <LogoImg src="/logos/shacharit.png" alt="שחרית" height={42} />
        <LogoImg src="/logos/chemed.png" alt="חמד" height={30} />
      </div>
    </div>
  );
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
  const [pdf, setPdf] = useState<{ done: number; total: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bookletRows, setBookletRows] = useState<Row[] | null>(null);
  const [bookletStage, setBookletStage] = useState<string>('');
  const [coverImgs, setCoverImgs] = useState<{ front?: string; back?: string }>(
    {},
  );
  const bookletRef = useRef<HTMLDivElement>(null);

  const downloadAllPdf = useCallback(async () => {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>('.showcase-card[data-content="1"]'),
    );
    if (cards.length === 0) return;
    setPdf({ done: 0, total: cards.length });
    let doc: jsPDF | null = null;
    try {
      for (let i = 0; i < cards.length; i++) {
        const url = await cardToPng(cards[i]);
        const { w, h } = await pngSize(url);
        const orientation = w > h ? 'landscape' : 'portrait';
        if (!doc) {
          doc = new jsPDF({ unit: 'px', format: [w, h], orientation });
        } else {
          doc.addPage([w, h], orientation);
        }
        doc.addImage(url, 'PNG', 0, 0, w, h);
        setPdf({ done: i + 1, total: cards.length });
      }
      doc?.save('ערב-תוצרים.pdf');
    } catch {
      setErr('שגיאה ביצירת ה-PDF המאוחד. נסו שוב או הורידו כרטיסים בנפרד.');
    } finally {
      setPdf(null);
    }
  }, []);

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
    async (teamId: string): Promise<Showcase> => {
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
      return json.summary as Showcase;
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
    const missing = rows.filter((r) => !summaryHasContent(r.summary));
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

  const toggleSelect = useCallback((teamId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }, []);

  const busyBooklet = !!bookletRows || !!bookletStage;

  const buildBooklet = useCallback(async () => {
    const chosen = rows.filter(
      (r) => selected.has(r.teamId) && r.data.ventureName?.trim(),
    );
    if (chosen.length === 0) {
      setErr('בחרו לפחות מיזם אחד לחוברת (סמנו "כלול בחוברת" בכרטיס).');
      return;
    }
    setErr('');
    const missing = chosen.filter((r) => !summaryHasContent(r.summary));
    const fresh = new Map<string, Showcase>();
    for (let i = 0; i < missing.length; i++) {
      setBookletStage(`מכין תקצירים… ${i + 1}/${missing.length}`);
      try {
        fresh.set(missing[i].teamId, await generateOne(missing[i].teamId));
      } catch {
        /* skip a failed one */
      }
    }
    const finalRows = chosen
      .map((r) =>
        fresh.has(r.teamId)
          ? { ...r, summary: { ...(r.summary || {}), ...fresh.get(r.teamId)! } }
          : r,
      )
      .filter((r) => summaryHasContent(r.summary));
    if (finalRows.length === 0) {
      setBookletStage('');
      setErr('לא נוצרו תקצירים למיזמים שנבחרו.');
      return;
    }
    // בדוק אם הועלתה תמונת כריכה (מותאמת אישית)
    setBookletStage('בונה חוברת…');
    const [hasFront, hasBack] = await Promise.all([
      imageExists('/logos/cover.png'),
      imageExists('/logos/cover-back.png'),
    ]);
    setCoverImgs({
      front: hasFront ? '/logos/cover.png' : undefined,
      back: hasBack ? '/logos/cover-back.png' : undefined,
    });
    setBookletRows(finalRows); // מפעיל רינדור מוסתר + אפקט הצילום
  }, [rows, selected, generateOne]);

  // אחרי שהדפים המוסתרים עלו — צלם אותם ל-PDF
  useEffect(() => {
    if (!bookletRows) return;
    let cancelled = false;
    (async () => {
      await new Promise((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r(null))),
      );
      if (document.fonts?.ready) await document.fonts.ready;
      const root = bookletRef.current;
      if (!root) {
        setBookletRows(null);
        setBookletStage('');
        return;
      }
      const pages = Array.from(
        root.querySelectorAll<HTMLElement>('.booklet-page'),
      );
      try {
        const doc = new jsPDF({
          unit: 'px',
          format: [PAGE_W, PAGE_H],
          orientation: 'portrait',
        });
        for (let i = 0; i < pages.length; i++) {
          if (cancelled) return;
          const url = await cardToPng(pages[i]);
          if (i > 0) doc.addPage([PAGE_W, PAGE_H], 'portrait');
          doc.addImage(url, 'PNG', 0, 0, PAGE_W, PAGE_H);
          setBookletStage(`בונה חוברת… ${i + 1}/${pages.length}`);
        }
        doc.save('חוברת-תקצירי-מיזמים.pdf');
      } catch {
        setErr('שגיאה ביצירת החוברת. נסו שוב.');
      } finally {
        if (!cancelled) {
          setBookletRows(null);
          setBookletStage('');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookletRows]);

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
          <button
            onClick={buildBooklet}
            disabled={busyBooklet || !!bulk || !!pdf || loading}
            style={{ ...primaryBtn, background: TEAL }}
          >
            {bookletStage || `📖 הפק חוברת (${selected.size})`}
          </button>
          <button
            onClick={downloadAllPdf}
            disabled={!!pdf || !!bulk || busyBooklet || loading}
            style={primaryBtn}
          >
            {pdf ? `מכין PDF… ${pdf.done}/${pdf.total}` : '⬇️ הורד הכל (PDF)'}
          </button>
          <button onClick={() => window.print()} style={outlineBtn}>
            🖨 הדפסה
          </button>
          <button onClick={onBack} style={outlineBtn}>
            חזרה לדשבורד
          </button>
        </div>
      </header>

      {/* Selection helpers for the booklet */}
      {withName.length > 0 && (
        <div
          className="no-print"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '10px 16px 0',
            fontSize: '0.85rem',
            color: 'var(--text-light)',
            flexWrap: 'wrap',
          }}
        >
          <span>לחוברת — סמנו מיזמים:</span>
          <button
            onClick={() => setSelected(new Set(withName.map((r) => r.teamId)))}
            style={miniOutline}
          >
            בחר הכל
          </button>
          <button onClick={() => setSelected(new Set())} style={miniOutline}>
            נקה בחירה
          </button>
          <span>נבחרו {selected.size}</span>
        </div>
      )}

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
              selected={selected.has(row.teamId)}
              onToggleSelect={() => toggleSelect(row.teamId)}
              onGenerate={generateOne}
              onTogglePref={savePrefs}
            />
          ))}
        </div>
      </main>

      {/* Hidden booklet render area — captured to PDF, off-screen */}
      {bookletRows && (
        <div
          ref={bookletRef}
          aria-hidden
          style={{ position: 'fixed', left: -100000, top: 0, pointerEvents: 'none' }}
        >
          <BookletCover classLabel={classId} imageSrc={coverImgs.front} />
          <BookletIntro classLabel={classId} />
          <BookletToc
            entries={bookletRows.map((r, i) => ({
              name: r.data.ventureName || 'ללא שם',
              members: r.data.teamMembers.filter((m) => m.trim()).join(' · '),
              page: i + 1,
            }))}
          />
          {bookletRows.map((r, i) => (
            <BookletProjectPage
              key={r.teamId}
              row={r}
              number={i + 1}
              classLabel={classId}
            />
          ))}
          <BookletBack imageSrc={coverImgs.back} />
        </div>
      )}
    </div>
  );
}

function ShowcaseCard({
  row,
  selected,
  onToggleSelect,
  onGenerate,
  onTogglePref,
}: {
  row: Row;
  selected: boolean;
  onToggleSelect: () => void;
  onGenerate: (teamId: string) => Promise<Showcase>;
  onTogglePref: (
    teamId: string,
    showScore: boolean,
    excellence: boolean,
  ) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dlErr, setDlErr] = useState('');

  const s = row.summary || {};
  const showScore = !!s.showScore;
  const excellence = !!s.excellence;
  const hasGrade = row.grade && gradeTotal(row.grade) > 0;
  const score = row.grade ? gradeTotal(row.grade) : 0;
  const members = row.data.teamMembers.filter((m) => m.trim()).join(' · ');

  const h = s.highlights || {};
  const hasContent = !!(
    s.tagline?.trim() ||
    h.pain?.trim() ||
    h.proposal?.trim() ||
    h.world?.trim() ||
    h.approach?.trim() ||
    h.budget?.trim() ||
    h.goals?.trim()
  );

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

  const downloadPng = async () => {
    const node = cardRef.current;
    if (!node) return;
    setDownloading(true);
    setDlErr('');
    try {
      const dataUrl = await cardToPng(node);
      const a = document.createElement('a');
      a.download = `${safeName(row.data.ventureName)}.png`;
      a.href = dataUrl;
      a.click();
    } catch {
      setDlErr('שגיאה בהורדת התמונה. נסו שוב, או השתמשו ב-🖨 הדפסה / PDF.');
    } finally {
      setDownloading(false);
    }
  };

  const downloadPdf = async () => {
    const node = cardRef.current;
    if (!node) return;
    setDownloading(true);
    setDlErr('');
    try {
      const dataUrl = await cardToPng(node);
      const { w, h } = await pngSize(dataUrl);
      const doc = new jsPDF({
        unit: 'px',
        format: [w, h],
        orientation: w > h ? 'landscape' : 'portrait',
      });
      doc.addImage(dataUrl, 'PNG', 0, 0, w, h);
      doc.save(`${safeName(row.data.ventureName)}.pdf`);
    } catch {
      setDlErr('שגיאה ביצירת PDF. נסו שוב, או השתמשו ב-🖨 הדפסה / PDF.');
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
        data-content={hasContent ? '1' : '0'}
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

        <div style={{ padding: '18px 26px 24px' }}>
          {/* Badges — in normal flow above the title (no overlap) */}
          {(excellence || (showScore && hasGrade)) && (
            <div
              style={{
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 12,
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
                  ⭐ מיזם מצטיין
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
          )}

          <h2
            style={{
              fontSize: '1.55rem',
              fontWeight: 900,
              color: 'var(--primary-dark)',
              lineHeight: 1.25,
              marginBottom: 4,
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

          <Highlights
            s={s}
            marginBottom={s.quotes?.length ? 16 : 0}
            showPlaceholder
          />

          <Quotes quotes={s.quotes} />

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
        <label
          style={{
            ...miniLabel,
            fontWeight: 700,
            color: selected ? '#5b21b6' : 'var(--text)',
            background: selected ? '#f5f3ff' : 'transparent',
            border: '1px solid',
            borderColor: selected ? '#c4b5fd' : 'var(--border)',
            borderRadius: 8,
            padding: '6px 10px',
          }}
        >
          <input type="checkbox" checked={selected} onChange={onToggleSelect} />
          📖 לחוברת
        </label>
        <button onClick={generate} disabled={busy} style={miniPrimary}>
          {busy ? '⏳ מנסח…' : hasContent ? '↻ רענן תקציר' : '✨ צור תקציר'}
        </button>
        <button
          onClick={downloadPng}
          disabled={downloading || !hasContent}
          style={miniOutline}
        >
          {downloading ? '⏳ מכין…' : '⬇️ תמונה'}
        </button>
        <button
          onClick={downloadPdf}
          disabled={downloading || !hasContent}
          style={miniOutline}
        >
          {downloading ? '⏳' : '⬇️ PDF'}
        </button>
        {dlErr && (
          <span style={{ fontSize: '0.78rem', color: '#991b1b' }}>{dlErr}</span>
        )}
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
          ⭐ מיזם מצטיין
        </label>
      </div>
    </div>
  );
}

function Highlight({
  icon,
  label,
  hint,
  text,
}: {
  icon: string;
  label: string;
  hint?: string;
  text?: string;
}) {
  if (!text || !text.trim()) return null;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ fontSize: '1rem', lineHeight: 1.5 }}>{icon}</span>
      <div style={{ fontSize: '0.92rem', lineHeight: 1.55 }}>
        <span style={{ fontWeight: 800, color: 'var(--primary-dark)' }}>
          {label}
        </span>
        {hint && (
          <span style={{ color: 'var(--text-light)', fontWeight: 400 }}>
            {' '}
            ({hint})
          </span>
        )}
        <span style={{ fontWeight: 800, color: 'var(--primary-dark)' }}>: </span>
        <span style={{ color: 'var(--text)' }}>{text}</span>
      </div>
    </div>
  );
}

function Highlights({
  s,
  marginBottom,
  showPlaceholder,
}: {
  s: Showcase;
  marginBottom?: number;
  showPlaceholder?: boolean;
}) {
  const h = s.highlights || {};
  const hasHeadline = !!(h.pain?.trim() || h.proposal?.trim());
  const hasDetails = !!(
    h.world?.trim() ||
    h.approach?.trim() ||
    h.budget?.trim() ||
    h.goals?.trim()
  );
  const hasAny = !!s.tagline?.trim() || hasHeadline || hasDetails;

  if (!hasAny) {
    return showPlaceholder ? (
      <p
        className="no-print"
        style={{ color: 'var(--text-light)', fontStyle: 'italic' }}
      >
        עדיין לא נוצר תקציר — לחצו &quot;✨ צור תקציר&quot; למטה.
      </p>
    ) : null;
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: 10,
        background: '#f8fafc',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '14px 16px',
        marginBottom: marginBottom ?? 0,
      }}
    >
      <Highlight icon="💔" label="הכאב" hint="למה נולד המיזם" text={h.pain} />
      <Highlight icon="💡" label="הפתרון המוצע" text={h.proposal} />
      {hasHeadline && hasDetails && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            margin: '2px 0',
            color: 'var(--text-light)',
            fontSize: '0.72rem',
            fontWeight: 800,
          }}
        >
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          העמקה ופרטים
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>
      )}
      <Highlight icon="🔍" label="מחקר שטח" text={h.world} />
      <Highlight icon="🛠️" label="תוכנית הפעולה" text={h.approach} />
      <Highlight icon="💰" label="תקציב" text={h.budget} />
      <Highlight icon="🎯" label="יעדים" text={h.goals} />
    </div>
  );
}

function Quotes({ quotes }: { quotes?: string[] }) {
  if (!quotes || quotes.length === 0) return null;
  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 4 }}>
      {quotes.map((q, i) => (
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
