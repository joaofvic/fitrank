import { useState, useRef, useCallback } from 'react';

/**
 * Estado de timer em nível de app (persiste entre telas).
 * Duas trilhas independentes:
 * - stopwatch: tempo de treino acumulado (cronômetro)
 * - rest: countdown de descanso (target + remaining)
 * activeMode indica qual aba está em foco na UI; não zera a outra trilha.
 * rest.hasRestSession: true após preset/plano/início de descanso (Epic C — mini fora da tela timer).
 */
function createInitialSession() {
  return {
    activeMode: 'stopwatch',
    stopwatch: { running: false, baseElapsed: 0, startedAt: null },
    rest: {
      running: false,
      baseRemaining: 60,
      startedAt: null,
      target: 60,
      hasRestSession: false
    }
  };
}

function computeStopwatchTotal(s) {
  const sw = s.stopwatch;
  let t = sw.baseElapsed;
  if (sw.running && sw.startedAt) {
    t += Math.floor((Date.now() - sw.startedAt) / 1000);
  }
  return t;
}

function computeRestRemaining(s) {
  const r = s.rest;
  if (!r.running || !r.startedAt) return r.baseRemaining;
  return Math.max(0, r.baseRemaining - Math.floor((Date.now() - r.startedAt) / 1000));
}

/** Epic C.2: sessão “ativa” para o mini (treino com tempo, descanso em uso ou configurado). */
function computeSessionActive(s) {
  if (computeStopwatchTotal(s) > 0) return true;
  if (s.rest.running) return true;
  return Boolean(s.rest.hasRestSession);
}

export function useWorkoutTimer() {
  const ref = useRef(createInitialSession());
  const [running, setRunning] = useState(
    () => ref.current.stopwatch.running || ref.current.rest.running
  );
  /** Incrementa a cada mutação relevante para o mini timer re-renderizar (ref + activeMode). */
  const [sessionGen, setSessionGen] = useState(0);

  const bumpRunning = useCallback(() => {
    const s = ref.current;
    setRunning(s.stopwatch.running || s.rest.running);
    setSessionGen((g) => g + 1);
  }, []);

  const setActiveMode = useCallback((mode) => {
    if (mode !== 'stopwatch' && mode !== 'countdown') return;
    ref.current = { ...ref.current, activeMode: mode };
    setSessionGen((g) => g + 1);
  }, []);

  /** Inicia / retoma o cronômetro de treino a partir de `baseElapsed` segundos já acumulados. */
  const reportStopwatchStart = useCallback((baseElapsed = 0) => {
    ref.current = {
      ...ref.current,
      activeMode: 'stopwatch',
      stopwatch: { running: true, baseElapsed, startedAt: Date.now() }
    };
    bumpRunning();
  }, [bumpRunning]);

  /** Pausa o cronômetro com o total atual em segundos. */
  const reportStopwatchPause = useCallback((currentTotal) => {
    ref.current = {
      ...ref.current,
      stopwatch: { running: false, baseElapsed: currentTotal, startedAt: null }
    };
    bumpRunning();
  }, [bumpRunning]);

  /** Zera apenas a trilha de treino. */
  const reportResetStopwatch = useCallback(() => {
    ref.current = {
      ...ref.current,
      stopwatch: { running: false, baseElapsed: 0, startedAt: null }
    };
    bumpRunning();
  }, [bumpRunning]);

  /** Inicia countdown de descanso: `remainingWhenStarting` e duração alvo `target`. */
  const reportRestStart = useCallback((remainingWhenStarting, target) => {
    ref.current = {
      ...ref.current,
      activeMode: 'countdown',
      rest: {
        running: true,
        baseRemaining: remainingWhenStarting,
        startedAt: Date.now(),
        target,
        hasRestSession: true
      }
    };
    bumpRunning();
  }, [bumpRunning]);

  /** Pausa o descanso com o remaining atual (0 quando acabou). */
  const reportRestPause = useCallback((currentRemaining) => {
    const prev = ref.current.rest;
    const t = prev.target;
    ref.current = {
      ...ref.current,
      rest: {
        running: false,
        baseRemaining: currentRemaining,
        startedAt: null,
        target: t,
        hasRestSession: true
      }
    };
    bumpRunning();
  }, [bumpRunning]);

  /**
   * Define preset de descanso (pausado), sem alterar o cronômetro de treino.
   * @param {number} target
   * @param {number} [remaining] default = target
   */
  const setRestPreset = useCallback((target, remaining = null) => {
    const rem = remaining != null ? remaining : target;
    ref.current = {
      ...ref.current,
      rest: {
        running: false,
        baseRemaining: rem,
        startedAt: null,
        target,
        hasRestSession: true
      }
    };
    bumpRunning();
  }, [bumpRunning]);

  /** Reinicia o descanso para o `target` atual (estado pausado). */
  const reportResetRest = useCallback(() => {
    const prev = ref.current.rest;
    const t = prev.target;
    ref.current = {
      ...ref.current,
      rest: {
        running: false,
        baseRemaining: t,
        startedAt: null,
        target: t,
        hasRestSession: prev.hasRestSession
      }
    };
    bumpRunning();
  }, [bumpRunning]);

  /**
   * Abre sessão de descanso a partir do plano (ex.: WorkoutPlanView).
   * Preserva `stopwatch` existente.
   */
  const prepareRestFromPlan = useCallback((restSeconds) => {
    const sec = Math.max(1, Math.floor(Number(restSeconds) || 0));
    const sw = ref.current.stopwatch;
    let nextSw = sw;
    if (sw.running && sw.startedAt) {
      const total = sw.baseElapsed + Math.floor((Date.now() - sw.startedAt) / 1000);
      nextSw = { running: false, baseElapsed: total, startedAt: null };
    }
    ref.current = {
      ...ref.current,
      activeMode: 'countdown',
      stopwatch: nextSw,
      rest: {
        running: false,
        baseRemaining: sec,
        startedAt: null,
        target: sec,
        hasRestSession: true
      }
    };
    bumpRunning();
  }, [bumpRunning]);

  /** Retorna segundos de treino acumulados (para check-in). Reseta ambas as trilhas. */
  const reportFinish = useCallback(() => {
    const total = computeStopwatchTotal(ref.current);
    ref.current = createInitialSession();
    setRunning(false);
    setSessionGen((g) => g + 1);
    return total > 0 ? total : null;
  }, []);

  const readStopwatchTotal = useCallback(() => computeStopwatchTotal(ref.current), []);

  const readRestRemaining = useCallback(() => computeRestRemaining(ref.current), []);

  const isSessionActive = useCallback(() => computeSessionActive(ref.current), []);

  /** Alias de `readStopwatchTotal` (compat). */
  const getElapsed = useCallback(() => computeStopwatchTotal(ref.current), []);

  return {
    running,
    sessionGen,
    isSessionActive,
    ref,
    setActiveMode,
    reportStopwatchStart,
    reportStopwatchPause,
    reportResetStopwatch,
    reportRestStart,
    reportRestPause,
    setRestPreset,
    reportResetRest,
    prepareRestFromPlan,
    reportFinish,
    readStopwatchTotal,
    readRestRemaining,
    getElapsed
  };
}
