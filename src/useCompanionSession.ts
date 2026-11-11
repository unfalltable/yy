import { useEffect, useRef, useState } from 'react';
import type { AppState, CompanionSession } from './types';
import { advanceSession } from './companionCoach';
export function useCompanionSession(state: AppState, update: (fn: (s: AppState) => AppState) => void) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const resetTick = useRef<() => void>(() => {});
  const [foreground, setForeground] = useState(!document.hidden && document.hasFocus());
  useEffect(() => {
    // A restart does not retroactively count closed-app time.
    update(s => s.companionSession?.status === 'running'
      ? { ...s, companionSession: { ...s.companionSession, status: 'paused' } } : s);
    let lastTick = Date.now(), wasActive = !document.hidden && document.hasFocus();
    const refresh = () => { wasActive = !document.hidden && document.hasFocus(); lastTick = Date.now(); setForeground(wasActive); };
    resetTick.current = refresh;
    window.addEventListener('focus', refresh);
    window.addEventListener('blur', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(() => {
      const now = Date.now(), active = !document.hidden && document.hasFocus();
      const elapsed = now - lastTick;
      lastTick = now;
      const count = active && wasActive;
      wasActive = active; setForeground(active);
      if (stateRef.current.companionSession?.status !== 'running' || !count) return;
      update(s => {
        if (!s.companionSession) return s;
        const next = advanceSession(s.companionSession, elapsed, count);
        return next === s.companionSession ? s : { ...s, companionSession: next };
      });
    }, 1000);
    return () => { clearInterval(timer); window.removeEventListener('focus',refresh); window.removeEventListener('blur',refresh); document.removeEventListener('visibilitychange',refresh); };
  }, [update]);
  useEffect(() => { resetTick.current(); }, [state.companionSession?.id, state.companionSession?.status]);
  function change(fn: (session: CompanionSession) => CompanionSession) {
    update(s => s.companionSession ? { ...s, companionSession: fn(s.companionSession) } : s);
  }
  return { session: state.companionSession, foreground, change };
}
