'use client';

import { useEffect, useState } from 'react';

// Chrome's beforeinstallprompt isn't in the standard TS lib yet
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'venturelab_install_dismissed';

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  // Register the service worker once on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    // Defer until idle so it doesn't compete with the first paint
    const reg = () =>
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /* swallow — non-critical */
      });
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void) => void;
    }).requestIdleCallback;
    if (typeof ric === 'function') {
      ric(reg);
    } else {
      window.setTimeout(reg, 1500);
    }
  }, []);

  // Listen for the install prompt
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    } catch {}
    if (dismissed) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const onInstall = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      setVisible(false);
      setDeferred(null);
    }
  };

  const onDismiss = () => {
    setVisible(false);
    setDeferred(null);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {}
  };

  if (!visible) return null;

  return (
    <div
      className="no-print"
      role="dialog"
      aria-label="הצעת התקנה"
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        right: 16,
        maxWidth: 460,
        margin: '0 auto',
        background: 'white',
        borderRadius: 16,
        padding: '12px 14px',
        boxShadow: '0 14px 32px rgba(15,23,42,0.25)',
        border: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        zIndex: 200,
      }}
    >
      <div style={{ fontSize: '1.8rem', lineHeight: 1 }} aria-hidden>
        📱
      </div>
      <div style={{ flex: 1, lineHeight: 1.4, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
          התקינו את VentureLab
        </div>
        <div
          style={{
            fontSize: '0.8rem',
            color: 'var(--text-light)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          קיצור דרך במסך הבית, ללא שורת כתובת
        </div>
      </div>
      <button
        onClick={onInstall}
        style={{
          padding: '8px 14px',
          borderRadius: 10,
          border: 'none',
          background: 'var(--primary)',
          color: 'white',
          fontWeight: 700,
          fontSize: '0.9rem',
        }}
      >
        התקנה
      </button>
      <button
        onClick={onDismiss}
        aria-label="סגירה"
        style={{
          border: 'none',
          background: 'transparent',
          fontSize: '1.4rem',
          color: 'var(--text-light)',
          padding: '4px 8px',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
