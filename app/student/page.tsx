'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Project,
  Resource,
  BudgetItem,
  emptyProject,
} from '@/lib/types';
import {
  loadLocal,
  saveLocal,
  getStoredClassId,
  setStoredClassId,
  getOrCreateTeamId,
  setStoredTeamId,
  toDeviceCode,
  normalizeClassId,
} from '@/lib/storage';
import { detectProjectType } from '@/lib/projectTypes';

type StepId =
  | 'background'
  | 'vision'
  | 'resources'
  | 'budget'
  | 'goals'
  | 'kpis'
  | 'action'
  | 'summary';

const STEPS: { id: StepId; emoji: string; label: string }[] = [
  { id: 'background', emoji: '📋', label: 'רקע המיזם' },
  { id: 'vision', emoji: '🌟', label: 'חזון' },
  { id: 'resources', emoji: '⚙️', label: 'מפת משאבים' },
  { id: 'budget', emoji: '💰', label: 'תקציב' },
  { id: 'goals', emoji: '🎯', label: 'יעדים' },
  { id: 'kpis', emoji: '📊', label: 'מדדי הצלחה' },
  { id: 'action', emoji: '🔧', label: 'תוכנית פעולה' },
  { id: 'summary', emoji: '🚀', label: 'סיכום והגשה' },
];

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function isStepDone(stepIdx: number, p: Project): boolean {
  switch (stepIdx) {
    case 0:
      return !!(
        p.ventureName.trim() &&
        p.problem.trim() &&
        p.teamMembers.some((m) => m.trim())
      );
    case 1:
      return (p.vision || '').trim().length > 10;
    case 2:
      return p.resources.some((r) => r.resource.trim());
    case 3:
      return p.budget.some((b) => b.item.trim() && b.cost.trim());
    case 4:
      return p.goals.filter((g) => g.trim()).length >= 2;
    case 5:
      return p.kpis.filter((k) => k.trim()).length >= 2;
    case 6:
      return !!(p.actionSetup.trim() && p.actionExecute.trim());
    case 7:
      return false; // סיכום הוא תצוגה בלבד
    default:
      return false;
  }
}

export default function StudentPage() {
  const router = useRouter();

  // אתחול: state בסיסי
  const [hydrated, setHydrated] = useState(false);
  const [classId, setClassId] = useState<string>('');
  const [teamId, setTeamId] = useState<string>('');
  const [project, setProject] = useState<Project>(emptyProject());
  const [stepIdx, setStepIdx] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [showSetup, setShowSetup] = useState(false);
  const [showResume, setShowResume] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSave = useRef(true); // למנוע שמירה ראשונה אחרי טעינה

  // hydration: רץ פעם אחת בצד הלקוח
  useEffect(() => {
    fetch('/api/init').catch(() => {});
    const storedClass = getStoredClassId();
    const storedTeam = getOrCreateTeamId();
    setTeamId(storedTeam);
    if (!storedClass) {
      setShowSetup(true);
      setProject(loadLocal());
      setHydrated(true);
      return;
    }
    setClassId(storedClass);
    // נסה לטעון מהשרת
    (async () => {
      try {
        const res = await fetch(
          `/api/teams?classId=${encodeURIComponent(storedClass)}&teamId=${encodeURIComponent(storedTeam)}`,
        );
        const json = await res.json();
        if (json.data) {
          setProject({ ...emptyProject(), ...json.data });
        } else {
          setProject(loadLocal());
        }
      } catch {
        setProject(loadLocal());
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  // אוטו-שמירה (מקומי + שרת עם debounce)
  useEffect(() => {
    if (!hydrated) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    saveLocal(project);
    if (!classId || !teamId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId, teamId, data: project }),
        });
        if (!res.ok) throw new Error('save failed');
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [project, classId, teamId, hydrated]);

  // עדכון שדה כללי
  const update = useCallback(<K extends keyof Project>(key: K, val: Project[K]) => {
    setProject((prev) => ({ ...prev, [key]: val }));
  }, []);

  // חישוב סוג מיזם וצוואר בקבוק
  const detectedType = useMemo(
    () =>
      detectProjectType({
        ventureName: project.ventureName,
        problem: project.problem,
        vision: project.vision,
      }),
    [project.ventureName, project.problem, project.vision],
  );

  // סך הכל תקציב
  const totalBudget = useMemo(() => {
    return project.budget.reduce((sum, b) => {
      const num = parseFloat((b.cost || '').replace(/[^\d.-]/g, ''));
      return sum + (isFinite(num) ? num : 0);
    }, 0);
  }, [project.budget]);

  const completedSteps = STEPS.map((_, i) => isStepDone(i, project));
  const deviceCode = teamId ? toDeviceCode(teamId) : '';

  if (!hydrated) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        טוען…
      </div>
    );
  }

  return (
    <>
      {showSetup && (
        <SetupOverlay
          deviceCode={deviceCode}
          onStart={(cls) => {
            const norm = normalizeClassId(cls);
            setClassId(norm);
            setStoredClassId(norm);
            setShowSetup(false);
          }}
          onResume={() => {
            setShowResume(true);
          }}
          onBack={() => router.push('/')}
        />
      )}
      {showResume && (
        <ResumeOverlay
          onCancel={() => setShowResume(false)}
          onResumed={(cls, tid, data) => {
            setClassId(cls);
            setStoredClassId(cls);
            setTeamId(tid);
            setStoredTeamId(tid);
            setProject({ ...emptyProject(), ...data });
            skipNextSave.current = true;
            setShowResume(false);
            setShowSetup(false);
          }}
        />
      )}

      {!showSetup && (
        <>
          <Header
            saveStatus={saveStatus}
            classId={classId}
            deviceCode={deviceCode}
            onChangeClass={() => setShowSetup(true)}
          />
          <ProgressBar completedSteps={completedSteps} currentStep={stepIdx} />
          <StepNav
            stepIdx={stepIdx}
            completed={completedSteps}
            onStep={setStepIdx}
          />
          <main
            style={{
              maxWidth: 880,
              margin: '0 auto',
              padding: '24px 16px 80px',
            }}
          >
            <StepContent
              stepId={STEPS[stepIdx].id}
              project={project}
              update={update}
              setProject={setProject}
              detectedType={detectedType}
              totalBudget={totalBudget}
              completedSteps={completedSteps}
            />
            <StepActions
              stepIdx={stepIdx}
              setStepIdx={setStepIdx}
              total={STEPS.length}
              canAdvance={isStepDone(stepIdx, project) || stepIdx === 7}
            />
          </main>
        </>
      )}
    </>
  );
}

// ---------- Header ----------
function Header({
  saveStatus,
  classId,
  deviceCode,
  onChangeClass,
}: {
  saveStatus: SaveStatus;
  classId: string;
  deviceCode: string;
  onChangeClass: () => void;
}) {
  return (
    <header
      className="no-print"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'white',
        borderBottom: '1px solid var(--border)',
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontSize: '1.6rem' }}>🚀</div>
        <div>
          <div style={{ fontWeight: 900, color: 'var(--primary)', fontSize: '1.1rem' }}>
            VentureLab
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-light)' }}>
            מעבדת המיזמים
          </div>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          fontSize: '0.85rem',
        }}
      >
        <SaveBadge status={saveStatus} />
        <span
          style={{
            background: '#f1f5f9',
            color: 'var(--text-light)',
            padding: '6px 12px',
            borderRadius: 999,
          }}
        >
          כיתה: <b>{classId || '—'}</b>
        </span>
        <span
          title="קוד מכשיר לשחזור"
          style={{
            background: '#eef2ff',
            color: 'var(--primary-dark)',
            padding: '6px 12px',
            borderRadius: 999,
            fontFamily: 'monospace',
            letterSpacing: 1,
          }}
        >
          🔑 {deviceCode}
        </span>
        <button
          onClick={onChangeClass}
          style={{
            border: '1px solid var(--border)',
            background: 'white',
            padding: '6px 12px',
            borderRadius: 999,
            fontSize: '0.8rem',
          }}
        >
          החלף כיתה
        </button>
      </div>
    </header>
  );
}

function SaveBadge({ status }: { status: SaveStatus }) {
  if (status === 'idle')
    return (
      <span
        style={{
          background: '#f1f5f9',
          color: 'var(--text-light)',
          padding: '6px 12px',
          borderRadius: 999,
        }}
      >
        מוכן
      </span>
    );
  if (status === 'saving')
    return (
      <span
        style={{
          background: '#fef3c7',
          color: '#92400e',
          padding: '6px 12px',
          borderRadius: 999,
          animation: 'saving-pulse 1.2s infinite',
        }}
      >
        ⏳ שומר…
      </span>
    );
  if (status === 'saved')
    return (
      <span
        style={{
          background: '#d1fae5',
          color: '#065f46',
          padding: '6px 12px',
          borderRadius: 999,
        }}
      >
        ✓ נשמר
      </span>
    );
  return (
    <span
      style={{
        background: '#fee2e2',
        color: '#991b1b',
        padding: '6px 12px',
        borderRadius: 999,
      }}
    >
      ⚠ שגיאה בשמירה
    </span>
  );
}

// ---------- Progress Bar ----------
function ProgressBar({
  completedSteps,
  currentStep,
}: {
  completedSteps: boolean[];
  currentStep: number;
}) {
  return (
    <div
      className="no-print"
      style={{
        display: 'flex',
        gap: 4,
        padding: '12px 20px',
        background: 'white',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {STEPS.map((_, i) => {
        const color = completedSteps[i]
          ? 'var(--success)'
          : i === currentStep
            ? 'var(--accent)'
            : 'var(--border)';
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: color,
              transition: 'background 0.3s',
            }}
          />
        );
      })}
    </div>
  );
}

// ---------- Step Nav ----------
function StepNav({
  stepIdx,
  completed,
  onStep,
}: {
  stepIdx: number;
  completed: boolean[];
  onStep: (i: number) => void;
}) {
  return (
    <nav
      className="step-nav no-print"
      style={{
        display: 'flex',
        gap: 8,
        padding: '12px 20px',
        background: 'white',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
      }}
    >
      {STEPS.map((s, i) => {
        const active = i === stepIdx;
        const done = completed[i];
        return (
          <button
            key={s.id}
            onClick={() => onStep(i)}
            style={{
              flexShrink: 0,
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid',
              borderColor: active
                ? 'var(--primary)'
                : done
                  ? 'var(--success)'
                  : 'var(--border)',
              background: active
                ? 'var(--primary)'
                : done
                  ? '#d1fae5'
                  : 'white',
              color: active ? 'white' : done ? '#065f46' : 'var(--text)',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>{s.emoji}</span>
            <span>{s.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ---------- Step Actions ----------
function StepActions({
  stepIdx,
  setStepIdx,
  total,
  canAdvance,
}: {
  stepIdx: number;
  setStepIdx: (i: number) => void;
  total: number;
  canAdvance: boolean;
}) {
  return (
    <div
      className="step-actions no-print"
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 24,
        gap: 12,
      }}
    >
      <button
        onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
        disabled={stepIdx === 0}
        style={{
          padding: '12px 24px',
          borderRadius: 12,
          border: '2px solid var(--border)',
          background: 'white',
          fontWeight: 600,
          opacity: stepIdx === 0 ? 0.5 : 1,
        }}
      >
        ← חזרה
      </button>
      {stepIdx < total - 1 && (
        <button
          onClick={() => setStepIdx(Math.min(total - 1, stepIdx + 1))}
          disabled={!canAdvance}
          style={{
            padding: '12px 28px',
            borderRadius: 12,
            border: 'none',
            background: canAdvance ? 'var(--primary)' : '#cbd5e1',
            color: 'white',
            fontWeight: 700,
            opacity: canAdvance ? 1 : 0.7,
          }}
        >
          המשך →
        </button>
      )}
      {stepIdx === total - 1 && (
        <button
          onClick={() => window.print()}
          style={{
            padding: '12px 28px',
            borderRadius: 12,
            border: 'none',
            background: 'var(--success)',
            color: 'white',
            fontWeight: 700,
          }}
        >
          🖨 הדפסה / שמירה כ-PDF
        </button>
      )}
    </div>
  );
}

// ---------- Card primitive ----------
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="card"
      style={{
        background: 'white',
        borderRadius: 16,
        padding: 32,
        boxShadow:
          '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
        border: '1px solid var(--border)',
        marginBottom: 20,
      }}
    >
      {children}
    </div>
  );
}

function StepHeader({
  emoji,
  title,
  subtitle,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2
        style={{
          fontSize: '1.6rem',
          fontWeight: 800,
          color: 'var(--primary)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span>{emoji}</span>
        {title}
      </h2>
      {subtitle && (
        <p
          style={{
            color: 'var(--text-light)',
            marginTop: 6,
            lineHeight: 1.6,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label
      style={{
        display: 'block',
        marginBottom: 6,
        fontWeight: 600,
        fontSize: '0.95rem',
      }}
    >
      {children}
      {required && <span style={{ color: 'var(--danger)' }}> *</span>}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  border: '2px solid var(--border)',
  borderRadius: 10,
  fontSize: '1rem',
  background: 'white',
};

// ---------- Step Content router ----------
function StepContent(props: {
  stepId: StepId;
  project: Project;
  update: <K extends keyof Project>(k: K, v: Project[K]) => void;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
  detectedType: ReturnType<typeof detectProjectType>;
  totalBudget: number;
  completedSteps: boolean[];
}) {
  switch (props.stepId) {
    case 'background':
      return <BackgroundStep {...props} />;
    case 'vision':
      return <VisionStep {...props} />;
    case 'resources':
      return <ResourcesStep {...props} />;
    case 'budget':
      return <BudgetStep {...props} />;
    case 'goals':
      return <GoalsStep {...props} />;
    case 'kpis':
      return <KpisStep {...props} />;
    case 'action':
      return <ActionStep {...props} />;
    case 'summary':
      return <SummaryStep {...props} />;
  }
}

// ---------- Step 1: Background ----------
function BackgroundStep({
  project,
  update,
}: {
  project: Project;
  update: <K extends keyof Project>(k: K, v: Project[K]) => void;
}) {
  const [newMember, setNewMember] = useState('');
  const addMember = () => {
    const t = newMember.trim();
    if (!t) return;
    update('teamMembers', [...project.teamMembers.filter(Boolean), t]);
    setNewMember('');
  };
  const removeMember = (idx: number) => {
    const next = project.teamMembers.filter((_, i) => i !== idx);
    update('teamMembers', next.length ? next : ['']);
  };
  return (
    <Card>
      <StepHeader
        emoji="📋"
        title="רקע המיזם"
        subtitle="שמות חברי הצוות, שם המיזם, הבעיה החברתית, מחקר עולמי וריאיון."
      />
      <div style={{ display: 'grid', gap: 16 }}>
        <div>
          <FieldLabel required>חברי הצוות (לפחות 2)</FieldLabel>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 8,
            }}
          >
            {project.teamMembers
              .filter((m) => m.trim())
              .map((m, i) => (
                <span
                  key={i}
                  style={{
                    background: '#eef2ff',
                    color: 'var(--primary-dark)',
                    padding: '6px 12px',
                    borderRadius: 999,
                    fontSize: '0.9rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {m}
                  <button
                    onClick={() => removeMember(project.teamMembers.indexOf(m))}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--primary-dark)',
                      fontSize: '1rem',
                      lineHeight: 1,
                    }}
                    aria-label="הסר"
                  >
                    ×
                  </button>
                </span>
              ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={newMember}
              onChange={(e) => setNewMember(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addMember();
                }
              }}
              placeholder="שם חבר/ת צוות + Enter"
              style={inputStyle}
            />
            <button
              onClick={addMember}
              style={{
                padding: '10px 18px',
                borderRadius: 10,
                border: '2px dashed #c7d2fe',
                background: '#f0f0ff',
                color: 'var(--primary-dark)',
                fontWeight: 600,
              }}
            >
              + הוסף
            </button>
          </div>
        </div>

        <div>
          <FieldLabel required>שם המיזם</FieldLabel>
          <input
            value={project.ventureName}
            onChange={(e) => update('ventureName', e.target.value)}
            placeholder="לדוגמה: מצעד הספרים — להחזיר ילדים לקריאה"
            style={inputStyle}
          />
        </div>

        <div>
          <FieldLabel required>הבעיה החברתית</FieldLabel>
          <textarea
            value={project.problem}
            onChange={(e) => update('problem', e.target.value)}
            rows={4}
            placeholder="מה הבעיה? את מי היא משפיעה? למה היא חשובה?"
            style={{ ...inputStyle, minHeight: 110 }}
          />
        </div>

        <div>
          <FieldLabel>מחקר עולמי — מה קיים בעולם?</FieldLabel>
          <textarea
            value={project.worldResearch}
            onChange={(e) => update('worldResearch', e.target.value)}
            rows={4}
            placeholder="פרויקטים, מחקרים או יוזמות דומות שמצאתם — כולל קישורים אם יש."
            style={{ ...inputStyle, minHeight: 110 }}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: '1fr',
          }}
        >
          <div>
            <FieldLabel>שם המרואיין/ת</FieldLabel>
            <input
              value={project.interviewee}
              onChange={(e) => update('interviewee', e.target.value)}
              placeholder="מי הוא/היא? באיזה תפקיד?"
              style={inputStyle}
            />
          </div>
          <div>
            <FieldLabel>תובנות מהריאיון</FieldLabel>
            <textarea
              value={project.interviewInsights}
              onChange={(e) => update('interviewInsights', e.target.value)}
              rows={3}
              placeholder="מה למדתם? ציטוטים מעניינים?"
              style={{ ...inputStyle, minHeight: 90 }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------- Step 2: Vision ----------
function VisionStep({
  project,
  update,
}: {
  project: Project;
  update: <K extends keyof Project>(k: K, v: Project[K]) => void;
}) {
  return (
    <Card>
      <StepHeader
        emoji="🌟"
        title="חזון המיזם"
        subtitle="חזון טוב מתאר את העולם המשופר שאתם רוצים ליצור."
      />
      <div
        style={{
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          padding: 12,
          borderRadius: 10,
          marginBottom: 16,
          fontSize: '0.9rem',
          lineHeight: 1.7,
          color: '#78350f',
        }}
      >
        💡 <b>טיפ:</b> חזון טוב מתחיל ב&quot;עולם שבו…&quot; ומתאר שינוי ממשי
        ומעורר השראה.
      </div>
      <FieldLabel required>החזון</FieldLabel>
      <textarea
        value={project.vision}
        onChange={(e) => update('vision', e.target.value)}
        rows={6}
        placeholder="עולם שבו…"
        style={{ ...inputStyle, minHeight: 140 }}
      />
      {project.vision.trim().length > 10 && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: '#d1fae5',
            border: '1px solid #6ee7b7',
            borderRadius: 12,
            color: '#065f46',
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>תצוגה מקדימה:</div>
          <div style={{ lineHeight: 1.8 }}>{project.vision}</div>
        </div>
      )}
    </Card>
  );
}

// ---------- Step 3: Resources ----------
function ResourcesStep({
  project,
  setProject,
  detectedType,
}: {
  project: Project;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
  detectedType: ReturnType<typeof detectProjectType>;
}) {
  const [showReview, setShowReview] = useState(false);
  const updateRow = (i: number, patch: Partial<Resource>) => {
    setProject((prev) => ({
      ...prev,
      resources: prev.resources.map((r, idx) =>
        idx === i ? { ...r, ...patch } : r,
      ),
    }));
  };
  const addRow = () => {
    setProject((prev) => ({
      ...prev,
      resources: [
        ...prev.resources,
        { resource: '', source: '', approval: 'לא' },
      ],
    }));
  };
  const removeRow = (i: number) => {
    setProject((prev) => ({
      ...prev,
      resources:
        prev.resources.length > 1
          ? prev.resources.filter((_, idx) => idx !== i)
          : prev.resources,
    }));
  };

  // Smart Review
  const review = useMemo(() => {
    const issues: { kind: 'warning' | 'info'; text: string }[] = [];
    const filled = project.resources.filter((r) => r.resource.trim());
    if (filled.length < 3)
      issues.push({
        kind: 'warning',
        text: `יש לכם ${filled.length} משאבים — שווה להגיע ל-3 לפחות.`,
      });
    project.resources.forEach((r, i) => {
      if (r.resource.trim() && !r.source.trim()) {
        issues.push({
          kind: 'warning',
          text: `שורה ${i + 1}: למשאב "${r.resource}" אין מקור/ספק.`,
        });
      }
    });
    if (detectedType) {
      const have = filled.map((r) => r.resource.toLowerCase());
      const missing = detectedType.expectedResources.filter(
        (e) => !have.some((h) => h.includes(e.toLowerCase().split('/')[0])),
      );
      if (missing.length) {
        issues.push({
          kind: 'info',
          text: `זיהינו מיזם מסוג "${detectedType.label}". משאבים נפוצים שלא הופיעו: ${missing.join(', ')}`,
        });
      }
    }
    return issues;
  }, [project.resources, detectedType]);

  return (
    <Card>
      <StepHeader
        emoji="⚙️"
        title="מפת משאבים"
        subtitle="מה צריך כדי שהמיזם יקרה? מאיפה זה יבוא? מה האישור הנדרש?"
      />
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: 0,
            minWidth: 560,
          }}
        >
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={th}>משאב</th>
              <th style={th}>מקור / ספק</th>
              <th style={th}>אישור</th>
              <th style={{ ...th, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {project.resources.map((r, i) => (
              <tr key={i}>
                <td style={td}>
                  <input
                    value={r.resource}
                    onChange={(e) => updateRow(i, { resource: e.target.value })}
                    placeholder="שם המשאב"
                    style={{ ...inputStyle, padding: '8px 10px' }}
                  />
                </td>
                <td style={td}>
                  <input
                    value={r.source}
                    onChange={(e) => updateRow(i, { source: e.target.value })}
                    placeholder="ספק/תורם"
                    style={{ ...inputStyle, padding: '8px 10px' }}
                  />
                </td>
                <td style={td}>
                  <select
                    value={r.approval}
                    onChange={(e) =>
                      updateRow(i, {
                        approval: e.target.value as Resource['approval'],
                      })
                    }
                    style={{ ...inputStyle, padding: '8px 10px' }}
                  >
                    <option value="לא">לא</option>
                    <option value="בתהליך">בתהליך</option>
                    <option value="כן">כן</option>
                  </select>
                </td>
                <td style={td}>
                  <button
                    onClick={() => removeRow(i)}
                    className="remove-btn"
                    style={removeBtn}
                    aria-label="מחק"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={addRow} className="add-row-btn" style={addBtn}>
        + הוסף משאב
      </button>
      <button
        onClick={() => setShowReview((v) => !v)}
        style={{
          marginTop: 16,
          marginInlineStart: 8,
          padding: '10px 18px',
          borderRadius: 10,
          border: '2px solid var(--accent)',
          background: '#fffbeb',
          color: '#92400e',
          fontWeight: 700,
        }}
      >
        🔍 בדיקת מוכנות
      </button>
      {showReview && (
        <div style={{ marginTop: 16 }}>
          {review.length === 0 ? (
            <div
              style={{
                padding: 14,
                background: '#d1fae5',
                borderRadius: 10,
                color: '#065f46',
              }}
            >
              ✅ כל הכבוד! לא זיהינו בעיות.
            </div>
          ) : (
            review.map((issue, i) => (
              <div
                key={i}
                style={{
                  padding: 12,
                  marginBottom: 8,
                  borderRadius: 10,
                  background: issue.kind === 'warning' ? '#fef3c7' : '#dbeafe',
                  color: issue.kind === 'warning' ? '#92400e' : '#1e3a8a',
                  border: `1px solid ${issue.kind === 'warning' ? '#fcd34d' : '#93c5fd'}`,
                }}
              >
                {issue.kind === 'warning' ? '⚠️' : 'ℹ️'} {issue.text}
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

// ---------- Step 4: Budget ----------
function BudgetStep({
  project,
  setProject,
  detectedType,
  totalBudget,
}: {
  project: Project;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
  detectedType: ReturnType<typeof detectProjectType>;
  totalBudget: number;
}) {
  const [showReview, setShowReview] = useState(false);

  // אוטו-הוספה: עבור כל משאב חדש בשלב 3 שאין לו שורה תואמת בתקציב — הוסף שורה
  useEffect(() => {
    setProject((prev) => {
      const existingItems = new Set(
        prev.budget.map((b) => b.item.trim().toLowerCase()).filter(Boolean),
      );
      const additions: BudgetItem[] = [];
      for (const r of prev.resources) {
        const name = r.resource.trim();
        if (name && !existingItems.has(name.toLowerCase())) {
          additions.push({
            item: name,
            cost: '',
            notes: r.source ? `ממשאב: ${r.source}` : '',
            fromResource: true,
          });
          existingItems.add(name.toLowerCase());
        }
      }
      if (additions.length === 0) return prev;
      const cleanedBudget =
        prev.budget.length === 1 &&
        !prev.budget[0].item.trim() &&
        !prev.budget[0].cost.trim()
          ? []
          : prev.budget;
      return { ...prev, budget: [...cleanedBudget, ...additions] };
    });
  }, [project.resources, setProject]);

  const updateRow = (i: number, patch: Partial<BudgetItem>) => {
    setProject((prev) => ({
      ...prev,
      budget: prev.budget.map((b, idx) =>
        idx === i ? { ...b, ...patch } : b,
      ),
    }));
  };
  const addRow = () => {
    setProject((prev) => ({
      ...prev,
      budget: [
        ...prev.budget,
        { item: '', cost: '', notes: '', fromResource: false },
      ],
    }));
  };
  const removeRow = (i: number) => {
    setProject((prev) => ({
      ...prev,
      budget:
        prev.budget.length > 1
          ? prev.budget.filter((_, idx) => idx !== i)
          : prev.budget,
    }));
  };

  const review = useMemo(() => {
    const issues: { kind: 'warning' | 'info'; text: string }[] = [];
    project.budget.forEach((b, i) => {
      if (b.item.trim() && !b.cost.trim()) {
        issues.push({
          kind: 'warning',
          text: `שורה ${i + 1}: לפריט "${b.item}" אין מחיר.`,
        });
      }
    });
    if (totalBudget > 5000) {
      issues.push({
        kind: 'info',
        text: `סך התקציב גבוה (${totalBudget.toLocaleString('he-IL')} ₪) — ודאו מקור מימון.`,
      });
    }
    if (totalBudget === 0 && project.budget.some((b) => b.item.trim())) {
      issues.push({
        kind: 'warning',
        text: 'יש פריטים בתקציב, אבל סך הכל הוא 0. הזינו עלויות.',
      });
    }
    if (detectedType) {
      const have = project.budget.map((b) => b.item.toLowerCase());
      const missing = detectedType.expectedBudget.filter(
        (e) => !have.some((h) => h.includes(e.toLowerCase().split(' ')[0])),
      );
      if (missing.length) {
        issues.push({
          kind: 'info',
          text: `מיזם "${detectedType.label}" — לעיתים שוכחים: ${missing.join(', ')}`,
        });
      }
    }
    return issues;
  }, [project.budget, totalBudget, detectedType]);

  return (
    <Card>
      <StepHeader
        emoji="💰"
        title="תקציב המיזם"
        subtitle="פרטו פריט אחר פריט. סמנו אם הפריט מגיע ממשאב/תרומה."
      />
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: 0,
            minWidth: 600,
          }}
        >
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={th}>פריט</th>
              <th style={{ ...th, width: 110 }}>עלות (₪)</th>
              <th style={th}>הערות</th>
              <th style={{ ...th, width: 70 }}>ממשאב?</th>
              <th style={{ ...th, width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {project.budget.map((b, i) => (
              <tr key={i}>
                <td style={td}>
                  <input
                    value={b.item}
                    onChange={(e) => updateRow(i, { item: e.target.value })}
                    placeholder="פריט"
                    style={{ ...inputStyle, padding: '8px 10px' }}
                  />
                </td>
                <td style={td}>
                  <input
                    value={b.cost}
                    onChange={(e) => updateRow(i, { cost: e.target.value })}
                    inputMode="numeric"
                    placeholder="0"
                    style={{ ...inputStyle, padding: '8px 10px' }}
                  />
                </td>
                <td style={td}>
                  <input
                    value={b.notes}
                    onChange={(e) => updateRow(i, { notes: e.target.value })}
                    placeholder="הערות"
                    style={{ ...inputStyle, padding: '8px 10px' }}
                  />
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={b.fromResource}
                    onChange={(e) =>
                      updateRow(i, { fromResource: e.target.checked })
                    }
                    style={{ width: 18, height: 18 }}
                  />
                </td>
                <td style={td}>
                  <button
                    onClick={() => removeRow(i)}
                    className="remove-btn"
                    style={removeBtn}
                    aria-label="מחק"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td
                colSpan={5}
                style={{
                  textAlign: 'left',
                  padding: '14px 12px',
                  fontWeight: 800,
                  fontSize: '1.05rem',
                  color: 'var(--primary-dark)',
                  borderTop: '2px solid var(--border)',
                }}
              >
                סה&quot;כ: {totalBudget.toLocaleString('he-IL')} ₪
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <button onClick={addRow} className="add-row-btn" style={addBtn}>
        + הוסף פריט
      </button>
      <button
        onClick={() => setShowReview((v) => !v)}
        style={{
          marginTop: 16,
          marginInlineStart: 8,
          padding: '10px 18px',
          borderRadius: 10,
          border: '2px solid var(--accent)',
          background: '#fffbeb',
          color: '#92400e',
          fontWeight: 700,
        }}
      >
        🔍 בדיקת מוכנות
      </button>
      {showReview && (
        <div style={{ marginTop: 16 }}>
          {review.length === 0 ? (
            <div
              style={{
                padding: 14,
                background: '#d1fae5',
                borderRadius: 10,
                color: '#065f46',
              }}
            >
              ✅ התקציב נראה תקין.
            </div>
          ) : (
            review.map((issue, i) => (
              <div
                key={i}
                style={{
                  padding: 12,
                  marginBottom: 8,
                  borderRadius: 10,
                  background: issue.kind === 'warning' ? '#fef3c7' : '#dbeafe',
                  color: issue.kind === 'warning' ? '#92400e' : '#1e3a8a',
                  border: `1px solid ${issue.kind === 'warning' ? '#fcd34d' : '#93c5fd'}`,
                }}
              >
                {issue.kind === 'warning' ? '⚠️' : 'ℹ️'} {issue.text}
              </div>
            ))
          )}
        </div>
      )}
    </Card>
  );
}

// ---------- Step 5: Goals ----------
function GoalsStep({
  project,
  setProject,
}: {
  project: Project;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
}) {
  const updateGoal = (i: number, val: string) => {
    setProject((prev) => ({
      ...prev,
      goals: prev.goals.map((g, idx) => (idx === i ? val : g)),
    }));
  };
  const addGoal = () =>
    setProject((prev) => ({ ...prev, goals: [...prev.goals, ''] }));
  const removeGoal = (i: number) =>
    setProject((prev) => ({
      ...prev,
      goals:
        prev.goals.length > 3
          ? prev.goals.filter((_, idx) => idx !== i)
          : prev.goals,
    }));

  return (
    <Card>
      <StepHeader
        emoji="🎯"
        title="יעדים"
        subtitle="3 יעדים ברורים שתשאפו להגשים."
      />
      <NumberedList
        items={project.goals}
        onChange={updateGoal}
        onRemove={removeGoal}
        canRemove={project.goals.length > 3}
        placeholder="יעד"
      />
      <button onClick={addGoal} className="add-row-btn" style={addBtn}>
        + הוסף יעד
      </button>
    </Card>
  );
}

// ---------- Step 6: KPIs ----------
function KpisStep({
  project,
  setProject,
}: {
  project: Project;
  setProject: React.Dispatch<React.SetStateAction<Project>>;
}) {
  const updateKpi = (i: number, val: string) => {
    setProject((prev) => ({
      ...prev,
      kpis: prev.kpis.map((k, idx) => (idx === i ? val : k)),
    }));
  };
  const addKpi = () =>
    setProject((prev) => ({ ...prev, kpis: [...prev.kpis, ''] }));
  const removeKpi = (i: number) =>
    setProject((prev) => ({
      ...prev,
      kpis:
        prev.kpis.length > 3
          ? prev.kpis.filter((_, idx) => idx !== i)
          : prev.kpis,
    }));

  return (
    <Card>
      <StepHeader
        emoji="📊"
        title="מדדי הצלחה"
        subtitle="מדד טוב הוא כמותי — מספר, אחוז, תדירות."
      />
      <NumberedList
        items={project.kpis}
        onChange={updateKpi}
        onRemove={removeKpi}
        canRemove={project.kpis.length > 3}
        placeholder="לדוגמה: 30 תלמידים השתתפו"
      />
      <button onClick={addKpi} className="add-row-btn" style={addBtn}>
        + הוסף מדד
      </button>
    </Card>
  );
}

function NumberedList({
  items,
  onChange,
  onRemove,
  canRemove,
  placeholder,
}: {
  items: string[];
  onChange: (i: number, val: string) => void;
  onRemove: (i: number) => void;
  canRemove: boolean;
  placeholder: string;
}) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {items.map((val, i) => (
        <div
          key={i}
          style={{ display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--gradient)',
              color: 'white',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {i + 1}
          </div>
          <input
            value={val}
            onChange={(e) => onChange(i, e.target.value)}
            placeholder={placeholder}
            style={inputStyle}
          />
          {canRemove && (
            <button
              onClick={() => onRemove(i)}
              className="remove-btn"
              style={removeBtn}
              aria-label="מחק"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------- Step 7: Action plan ----------
function ActionStep({
  project,
  update,
}: {
  project: Project;
  update: <K extends keyof Project>(k: K, v: Project[K]) => void;
}) {
  return (
    <Card>
      <StepHeader
        emoji="🔧"
        title="תוכנית פעולה"
        subtitle="חלקו את ההוצאה לפועל לשלושה שלבים: הקמה, ביצוע, וקיימות (איך נמשיך?)."
      />
      <div style={{ display: 'grid', gap: 16 }}>
        <PhaseCard
          title="הקמה"
          color="#3b82f6"
          value={project.actionSetup}
          onChange={(v) => update('actionSetup', v)}
          placeholder="מה צריך לעשות לפני שהמיזם מתחיל? תיאומים, אישורים, רכישות…"
        />
        <PhaseCard
          title="ביצוע"
          color="#f59e0b"
          value={project.actionExecute}
          onChange={(v) => update('actionExecute', v)}
          placeholder="איך זה ייראה בפועל? לוח זמנים, חלוקת תפקידים…"
        />
        <PhaseCard
          title="קיימות"
          color="#10b981"
          value={project.actionSustain}
          onChange={(v) => update('actionSustain', v)}
          placeholder="איך המיזם ימשיך אחרי השנה? מי יקבל אחריות?"
        />
      </div>
    </Card>
  );
}

function PhaseCard({
  title,
  color,
  value,
  onChange,
  placeholder,
}: {
  title: string;
  color: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div
      style={{
        background: '#f8fafc',
        borderRadius: 12,
        padding: 16,
        borderInlineStart: `5px solid ${color}`,
      }}
    >
      <div
        style={{
          fontWeight: 800,
          marginBottom: 8,
          color,
        }}
      >
        {title}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        style={{ ...inputStyle, minHeight: 90, background: 'white' }}
      />
    </div>
  );
}

// ---------- Step 8: Summary ----------
function SummaryStep({
  project,
  totalBudget,
  completedSteps,
}: {
  project: Project;
  totalBudget: number;
  completedSteps: boolean[];
}) {
  const doneCount = completedSteps.filter(Boolean).length;
  return (
    <Card>
      <StepHeader
        emoji="🚀"
        title="תיק המיזם"
        subtitle={`השלמתם ${doneCount} מתוך ${STEPS.length - 1} שלבים. ניתן להדפיס/לשמור כ-PDF.`}
      />
      <div style={{ display: 'grid', gap: 18 }}>
        <Section title="פרטי המיזם">
          <Row label="שם המיזם">{project.ventureName || '—'}</Row>
          <Row label="חברי הצוות">
            {project.teamMembers.filter((m) => m.trim()).join(', ') || '—'}
          </Row>
        </Section>

        <Section title="הבעיה והרקע">
          <Row label="הבעיה">{project.problem || '—'}</Row>
          <Row label="מחקר עולמי">{project.worldResearch || '—'}</Row>
          <Row label="ריאיון עם">{project.interviewee || '—'}</Row>
          <Row label="תובנות מהריאיון">
            {project.interviewInsights || '—'}
          </Row>
        </Section>

        <Section title="חזון">
          <div style={{ lineHeight: 1.8 }}>{project.vision || '—'}</div>
        </Section>

        <Section title="משאבים">
          <SimpleTable
            headers={['משאב', 'מקור', 'אישור']}
            rows={project.resources
              .filter((r) => r.resource.trim())
              .map((r) => [r.resource, r.source || '—', r.approval])}
          />
        </Section>

        <Section title="תקציב">
          <SimpleTable
            headers={['פריט', 'עלות (₪)', 'הערות']}
            rows={project.budget
              .filter((b) => b.item.trim())
              .map((b) => [b.item, b.cost || '0', b.notes || '—'])}
          />
          <div
            style={{
              marginTop: 8,
              fontWeight: 800,
              color: 'var(--primary-dark)',
            }}
          >
            סה&quot;כ: {totalBudget.toLocaleString('he-IL')} ₪
          </div>
        </Section>

        <Section title="יעדים">
          <ol style={{ paddingInlineStart: 24, lineHeight: 1.9 }}>
            {project.goals.filter((g) => g.trim()).length === 0 ? (
              <li>—</li>
            ) : (
              project.goals
                .filter((g) => g.trim())
                .map((g, i) => <li key={i}>{g}</li>)
            )}
          </ol>
        </Section>

        <Section title="מדדי הצלחה">
          <ol style={{ paddingInlineStart: 24, lineHeight: 1.9 }}>
            {project.kpis.filter((k) => k.trim()).length === 0 ? (
              <li>—</li>
            ) : (
              project.kpis
                .filter((k) => k.trim())
                .map((k, i) => <li key={i}>{k}</li>)
            )}
          </ol>
        </Section>

        <Section title="תוכנית פעולה">
          <Row label="הקמה">{project.actionSetup || '—'}</Row>
          <Row label="ביצוע">{project.actionExecute || '—'}</Row>
          <Row label="קיימות">{project.actionSustain || '—'}</Row>
        </Section>
      </div>
    </Card>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: '#f8fafc',
        borderRadius: 12,
        padding: 16,
        border: '1px solid var(--border)',
      }}
    >
      <h3
        style={{
          fontSize: '1.05rem',
          fontWeight: 800,
          color: 'var(--primary-dark)',
          marginBottom: 10,
        }}
      >
        {title}
      </h3>
      <div style={{ display: 'grid', gap: 8 }}>{children}</div>
    </section>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(120px, 180px) 1fr',
        gap: 12,
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--text-light)' }}>{label}</div>
      <div style={{ lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number)[][];
}) {
  if (rows.length === 0) return <div>—</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
        }}
      >
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                style={{
                  textAlign: 'right',
                  padding: 8,
                  borderBottom: '2px solid var(--border)',
                  fontWeight: 700,
                  color: 'var(--text-light)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td
                  key={j}
                  style={{
                    padding: 8,
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Setup overlays ----------
function SetupOverlay({
  deviceCode,
  onStart,
  onResume,
  onBack,
}: {
  deviceCode: string;
  onStart: (cls: string) => void;
  onResume: () => void;
  onBack: () => void;
}) {
  const [cls, setCls] = useState('');
  return (
    <div style={overlay}>
      <div style={overlayCard}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>👩‍💻</div>
        <h2
          style={{
            fontSize: '1.6rem',
            fontWeight: 900,
            color: 'var(--primary)',
            marginBottom: 8,
          }}
        >
          ברוכים הבאים למעבדה
        </h2>
        <p
          style={{
            color: 'var(--text-light)',
            marginBottom: 20,
            lineHeight: 1.6,
          }}
        >
          הזינו את <b>קוד הכיתה</b> שהמורה נתן (לדוגמה: <code>כיתה-י3</code>).
        </p>
        <input
          value={cls}
          onChange={(e) => setCls(e.target.value)}
          placeholder="קוד כיתה"
          style={{ ...inputStyle, marginBottom: 14 }}
          autoFocus
        />
        <button
          onClick={() => cls.trim() && onStart(cls.trim())}
          disabled={!cls.trim()}
          style={{
            width: '100%',
            padding: '14px 24px',
            borderRadius: 12,
            border: 'none',
            background: cls.trim() ? 'var(--primary)' : '#cbd5e1',
            color: 'white',
            fontWeight: 700,
            fontSize: '1rem',
          }}
        >
          התחלה
        </button>
        <div
          style={{
            marginTop: 16,
            fontSize: '0.85rem',
            color: 'var(--text-light)',
            lineHeight: 1.7,
          }}
        >
          קוד המכשיר שלכם:{' '}
          <span
            style={{
              fontFamily: 'monospace',
              background: '#eef2ff',
              padding: '4px 8px',
              borderRadius: 6,
              color: 'var(--primary-dark)',
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            {deviceCode}
          </span>
          <div style={{ marginTop: 6 }}>
            שמרו אותו — הוא נחוץ אם תפתחו במכשיר אחר.
          </div>
        </div>
        <div
          style={{
            marginTop: 16,
            display: 'flex',
            gap: 8,
            justifyContent: 'center',
          }}
        >
          <button
            onClick={onResume}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: '2px dashed var(--border)',
              background: 'white',
              fontSize: '0.85rem',
            }}
          >
            כבר יש לי קוד מכשיר
          </button>
          <button
            onClick={onBack}
            style={{
              padding: '10px 16px',
              borderRadius: 10,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-light)',
              fontSize: '0.85rem',
            }}
          >
            חזרה
          </button>
        </div>
      </div>
    </div>
  );
}

function ResumeOverlay({
  onCancel,
  onResumed,
}: {
  onCancel: () => void;
  onResumed: (cls: string, teamId: string, data: Project) => void;
}) {
  const [cls, setCls] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    setBusy(true);
    try {
      const res = await fetch(
        `/api/teams/find?classId=${encodeURIComponent(cls.trim())}&deviceCode=${encodeURIComponent(code.trim().toUpperCase())}`,
      );
      const json = await res.json();
      if (!json.found) {
        setErr('לא נמצא — בדקו שהקוד נכון.');
      } else {
        onResumed(normalizeClassId(cls.trim()), json.teamId, json.data);
      }
    } catch {
      setErr('שגיאה בחיבור לשרת.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlay}>
      <div style={overlayCard}>
        <div style={{ fontSize: '2.4rem', marginBottom: 10 }}>🔑</div>
        <h2
          style={{
            fontSize: '1.4rem',
            fontWeight: 900,
            color: 'var(--primary)',
            marginBottom: 8,
          }}
        >
          המשך במכשיר אחר
        </h2>
        <p
          style={{
            color: 'var(--text-light)',
            marginBottom: 16,
            fontSize: '0.9rem',
          }}
        >
          הזינו את קוד הכיתה ואת קוד המכשיר (8 תווים) שקיבלתם בפעם הראשונה.
        </p>
        <input
          value={cls}
          onChange={(e) => setCls(e.target.value)}
          placeholder="קוד כיתה"
          style={{ ...inputStyle, marginBottom: 10 }}
        />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="קוד מכשיר"
          maxLength={8}
          style={{
            ...inputStyle,
            marginBottom: 12,
            fontFamily: 'monospace',
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        />
        {err && (
          <div
            style={{
              padding: 10,
              background: '#fee2e2',
              color: '#991b1b',
              borderRadius: 10,
              marginBottom: 10,
              fontSize: '0.9rem',
            }}
          >
            {err}
          </div>
        )}
        <button
          onClick={submit}
          disabled={busy || !cls.trim() || code.trim().length < 4}
          style={{
            width: '100%',
            padding: '12px 24px',
            borderRadius: 10,
            border: 'none',
            background: busy ? '#cbd5e1' : 'var(--primary)',
            color: 'white',
            fontWeight: 700,
          }}
        >
          {busy ? 'בודק…' : 'טען נתונים'}
        </button>
        <button
          onClick={onCancel}
          style={{
            marginTop: 10,
            border: 'none',
            background: 'transparent',
            color: 'var(--text-light)',
          }}
        >
          ביטול
        </button>
      </div>
    </div>
  );
}

// ---------- shared styles ----------
const th: React.CSSProperties = {
  textAlign: 'right',
  padding: '10px 12px',
  fontWeight: 700,
  color: 'var(--text-light)',
  fontSize: '0.9rem',
  borderBottom: '1px solid var(--border)',
};
const td: React.CSSProperties = { padding: '8px 6px', verticalAlign: 'middle' };

const removeBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  border: '1px solid var(--border)',
  background: '#fee2e2',
  color: '#991b1b',
  fontSize: '1.1rem',
  lineHeight: 1,
};

const addBtn: React.CSSProperties = {
  marginTop: 16,
  padding: '10px 18px',
  borderRadius: 10,
  border: '2px dashed #c7d2fe',
  background: '#f0f0ff',
  color: 'var(--primary-dark)',
  fontWeight: 600,
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  zIndex: 100,
};

const overlayCard: React.CSSProperties = {
  background: 'white',
  borderRadius: 20,
  padding: 32,
  maxWidth: 460,
  width: '100%',
  textAlign: 'center',
  boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
};
