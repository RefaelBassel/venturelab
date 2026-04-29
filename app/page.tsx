'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    fetch('/api/init').catch(() => {});
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        textAlign: 'center',
        background: 'var(--gradient)',
      }}
    >
      <div style={{ fontSize: '4rem', marginBottom: 20 }}>🚀</div>
      <h1
        style={{
          fontSize: '2.5rem',
          fontWeight: 900,
          color: 'white',
          marginBottom: 12,
          letterSpacing: '-0.02em',
        }}
      >
        VentureLab
      </h1>
      <p
        style={{
          color: 'rgba(255,255,255,0.9)',
          fontSize: '1.15rem',
          maxWidth: 520,
          marginBottom: 8,
          lineHeight: 1.6,
          fontWeight: 600,
        }}
      >
        מעבדת המיזמים החברתיים
      </p>
      <p
        style={{
          color: 'rgba(255,255,255,0.75)',
          fontSize: '1rem',
          maxWidth: 520,
          marginBottom: 40,
          lineHeight: 1.7,
        }}
      >
        כלי לתכנון מיזם חברתי — שלב ד׳ במחשבת ישראל
      </p>
      <div
        style={{
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        <button
          onClick={() => router.push('/student')}
          style={{
            padding: '18px 36px',
            borderRadius: 14,
            border: 'none',
            background: 'white',
            color: 'var(--primary)',
            fontWeight: 700,
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            boxShadow: '0 8px 20px rgba(0,0,0,0.15)',
          }}
        >
          👩‍💻 כניסת תלמידים
        </button>
        <button
          onClick={() => router.push('/teacher')}
          style={{
            padding: '18px 36px',
            borderRadius: 14,
            border: '2px solid rgba(255,255,255,0.5)',
            background: 'transparent',
            color: 'white',
            fontWeight: 700,
            fontSize: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          🎓 דשבורד מורה
        </button>
      </div>
    </div>
  );
}
