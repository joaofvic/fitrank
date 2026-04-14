import { useState, useRef, useCallback } from 'react';

/**
 * Lightweight app-level timer state that persists across view changes.
 * WorkoutTimerView reads/writes this to sync state when mounting/unmounting.
 */
export function useWorkoutTimer() {
  const [running, setRunning] = useState(false);
  const ref = useRef({
    running: false,
    mode: 'stopwatch',
    startedAt: null,
    baseElapsed: 0,
  });

  const reportStart = useCallback((baseElapsed = 0, countdownTarget = 0) => {
    ref.current = { ...ref.current, running: true, startedAt: Date.now(), baseElapsed, countdownTarget };
    setRunning(true);
  }, []);

  const reportPause = useCallback((currentElapsed) => {
    ref.current = { ...ref.current, running: false, startedAt: null, baseElapsed: currentElapsed };
    setRunning(false);
  }, []);

  const reportReset = useCallback(() => {
    ref.current = { ...ref.current, running: false, startedAt: null, baseElapsed: 0 };
    setRunning(false);
  }, []);

  const reportFinish = useCallback(() => {
    const r = ref.current;
    let total = r.baseElapsed;
    if (r.running && r.startedAt) total += Math.floor((Date.now() - r.startedAt) / 1000);
    ref.current = { running: false, mode: 'stopwatch', startedAt: null, baseElapsed: 0 };
    setRunning(false);
    return total > 0 ? total : null;
  }, []);

  const getElapsed = useCallback(() => {
    const r = ref.current;
    let total = r.baseElapsed;
    if (r.running && r.startedAt) total += Math.floor((Date.now() - r.startedAt) / 1000);
    return total;
  }, []);

  return { running, ref, reportStart, reportPause, reportReset, reportFinish, getElapsed };
}
