import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Square, Timer, ChevronLeft } from 'lucide-react';
import { playSound } from '../../lib/sounds.js';
import { haptic } from '../../lib/haptics.js';

/** Referência visual do anel no cronômetro (1 h), sem impor meta de treino */
const SW_VISUAL_CAP_SEC = 60 * 60;
const SW_SPINNER_ARC = 0.14;

const COUNTDOWN_PRESETS = [30, 60, 90, 120];
const CIRCLE_RADIUS = 110;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => n.toString().padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

/**
 * @param {object} props
 * @param {function} props.onClose - Navigate back
 * @param {function} props.onFinish - Called with total seconds when user finishes workout
 * @param {object} props.timerHook - External timer state from useWorkoutTimer
 */
export function WorkoutTimerView({ onClose, onFinish, timerHook }) {
  const {
    ref: timerRef,
    setActiveMode,
    reportStopwatchStart,
    reportStopwatchPause,
    reportResetStopwatch,
    reportRestStart,
    reportRestPause,
    setRestPreset,
    reportResetRest,
    reportFinish,
    readStopwatchTotal,
    readRestRemaining
  } = timerHook;

  const sw0 = timerRef.current.stopwatch;
  const initialElapsed = sw0.baseElapsed + (
    sw0.running && sw0.startedAt
      ? Math.floor((Date.now() - sw0.startedAt) / 1000)
      : 0
  );

  const r0 = timerRef.current.rest;
  const initialRemaining = r0.running && r0.startedAt
    ? Math.max(0, r0.baseRemaining - Math.floor((Date.now() - r0.startedAt) / 1000))
    : r0.baseRemaining;

  const [mode, setMode] = useState(timerRef.current.activeMode || 'stopwatch');
  const [running, setRunning] = useState(
    () => timerRef.current.stopwatch.running || timerRef.current.rest.running
  );
  const [elapsed, setElapsed] = useState(initialElapsed);
  const [countdownTarget, setCountdownTarget] = useState(r0.target ?? 60);
  const [countdownRemaining, setCountdownRemaining] = useState(initialRemaining);
  const [customInput, setCustomInput] = useState('');
  /** B.2: feedback curto ao pausar automaticamente ao trocar de modo */
  const [modeSwitchHint, setModeSwitchHint] = useState(null);
  /** D.4: mensagens para leitor de tela (só marcos; nunca a cada tick) */
  const [a11yLiveMessage, setA11yLiveMessage] = useState('');

  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const baseElapsedRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (!modeSwitchHint) return undefined;
    const t = setTimeout(() => setModeSwitchHint(null), 4500);
    return () => clearTimeout(t);
  }, [modeSwitchHint]);

  useEffect(() => {
    if (!a11yLiveMessage) return undefined;
    const t = setTimeout(() => setA11yLiveMessage(''), 2200);
    return () => clearTimeout(t);
  }, [a11yLiveMessage]);

  const handleCountdownNaturalEnd = useCallback(() => {
    setCountdownRemaining(0);
    clearTimer();
    setRunning(false);
    reportRestPause(0);
    playSound('streak');
    haptic('success');
    setA11yLiveMessage('Descanso finalizado.');
  }, [clearTimer, reportRestPause]);

  const handleCountdownNaturalEndRef = useRef(handleCountdownNaturalEnd);
  handleCountdownNaturalEndRef.current = handleCountdownNaturalEnd;

  useEffect(() => {
    const sw = timerRef.current.stopwatch;
    const r = timerRef.current.rest;
    if (sw.running && sw.startedAt) {
      startTimeRef.current = sw.startedAt;
      baseElapsedRef.current = sw.baseElapsed;
      intervalRef.current = setInterval(() => {
        const total = baseElapsedRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsed(total);
      }, 250);
    } else if (r.running && r.startedAt) {
      startTimeRef.current = r.startedAt;
      baseElapsedRef.current = r.baseRemaining;
      setCountdownTarget(r.target);
      intervalRef.current = setInterval(() => {
        const rem = baseElapsedRef.current - Math.floor((Date.now() - startTimeRef.current) / 1000);
        if (rem <= 0) {
          handleCountdownNaturalEndRef.current();
        } else {
          setCountdownRemaining(rem);
        }
      }, 250);
    }
    return () => clearTimer();
  // Sincroniza intervalo com ref ao montar (estado vindo do hook); não reexecutar ao mudar handlers.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startStopwatch = useCallback(() => {
    startTimeRef.current = Date.now();
    baseElapsedRef.current = elapsed;
    intervalRef.current = setInterval(() => {
      const total = baseElapsedRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsed(total);
    }, 250);
    setRunning(true);
    reportStopwatchStart(elapsed);
  }, [elapsed, reportStopwatchStart]);

  const startCountdown = useCallback(() => {
    if (countdownRemaining <= 0) return;
    startTimeRef.current = Date.now();
    baseElapsedRef.current = countdownRemaining;
    intervalRef.current = setInterval(() => {
      const rem = baseElapsedRef.current - Math.floor((Date.now() - startTimeRef.current) / 1000);
      if (rem <= 0) {
        handleCountdownNaturalEnd();
      } else {
        setCountdownRemaining(rem);
      }
    }, 250);
    setRunning(true);
    reportRestStart(countdownRemaining, countdownTarget);
  }, [countdownRemaining, countdownTarget, clearTimer, handleCountdownNaturalEnd, reportRestStart]);

  const handlePlayPause = useCallback(() => {
    if (running) {
      clearTimer();
      setRunning(false);
      if (mode === 'stopwatch') {
        const total = baseElapsedRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsed(total);
        reportStopwatchPause(total);
      } else {
        const rem = baseElapsedRef.current - Math.floor((Date.now() - startTimeRef.current) / 1000);
        const clamped = Math.max(0, rem);
        setCountdownRemaining(clamped);
        reportRestPause(clamped);
      }
      haptic('light');
    } else {
      haptic('medium');
      if (mode === 'stopwatch') startStopwatch();
      else startCountdown();
    }
  }, [running, mode, clearTimer, startStopwatch, startCountdown, reportStopwatchPause, reportRestPause]);

  const handleReset = useCallback(() => {
    clearTimer();
    setRunning(false);
    if (mode === 'stopwatch') {
      setElapsed(0);
      baseElapsedRef.current = 0;
      reportResetStopwatch();
    } else {
      setCountdownRemaining(countdownTarget);
      baseElapsedRef.current = countdownTarget;
      reportResetRest();
    }
    haptic('light');
  }, [mode, countdownTarget, clearTimer, reportResetStopwatch, reportResetRest]);

  const handleFinishWorkout = useCallback(() => {
    clearTimer();
    setRunning(false);
    const totalSec = reportFinish();
    haptic('success');
    playSound('checkin');
    if (totalSec != null && totalSec > 0) {
      setA11yLiveMessage(`Treino finalizado. Tempo: ${formatTime(totalSec)}.`);
    }
    onFinish?.(totalSec != null && totalSec > 0 ? totalSec : null);
  }, [clearTimer, reportFinish, onFinish]);

  const selectCountdownPreset = useCallback((seconds) => {
    clearTimer();
    setRunning(false);
    setCountdownTarget(seconds);
    setCountdownRemaining(seconds);
    baseElapsedRef.current = seconds;
    setRestPreset(seconds, seconds);
  }, [clearTimer, setRestPreset]);

  const applyCustomCountdown = useCallback(() => {
    const val = parseInt(customInput, 10);
    if (Number.isFinite(val) && val > 0 && val <= 60) {
      const sec = val * 60;
      selectCountdownPreset(sec);
      setCustomInput('');
    }
  }, [customInput, selectCountdownPreset]);

  const switchMode = useCallback((newMode) => {
    if (newMode === mode) return;
    clearTimer();

    if (running) {
      if (mode === 'stopwatch') {
        const total = baseElapsedRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000);
        reportStopwatchPause(total);
        setElapsed(total);
        setModeSwitchHint('Treino pausado ao mudar para Descanso.');
      } else {
        const rem = baseElapsedRef.current - Math.floor((Date.now() - startTimeRef.current) / 1000);
        const clamped = Math.max(0, rem);
        reportRestPause(clamped);
        setCountdownRemaining(clamped);
        setModeSwitchHint('Descanso pausado ao mudar para Cronômetro.');
      }
      setRunning(false);
    }

    setMode(newMode);
    setActiveMode(newMode);

    if (newMode === 'stopwatch') {
      const t = readStopwatchTotal();
      setElapsed(t);
      baseElapsedRef.current = timerRef.current.stopwatch.baseElapsed;
      startTimeRef.current = timerRef.current.stopwatch.startedAt;
    } else {
      const rem = readRestRemaining();
      const tgt = timerRef.current.rest.target;
      setCountdownTarget(tgt);
      setCountdownRemaining(rem);
      baseElapsedRef.current = timerRef.current.rest.baseRemaining;
      startTimeRef.current = timerRef.current.rest.startedAt;
    }
  }, [
    mode,
    running,
    clearTimer,
    reportStopwatchPause,
    reportRestPause,
    setActiveMode,
    readStopwatchTotal,
    readRestRemaining,
    timerRef
  ]);

  /** B.1 + painéis D.1: descanso = remaining/target sempre no painel descanso; cronômetro = arco quando pausado ou em segundo plano */
  const countdownProgress =
    countdownTarget > 0 ? countdownRemaining / countdownTarget : 0;
  const stopwatchArcFill =
    elapsed > 0 && !(mode === 'stopwatch' && running)
      ? Math.min(1, elapsed / SW_VISUAL_CAP_SEC)
      : 0;
  const countdownStrokeOffset = CIRCLE_CIRCUMFERENCE * (1 - countdownProgress);
  const stopwatchStrokeOffset = CIRCLE_CIRCUMFERENCE * (1 - stopwatchArcFill);
  const dashSpinner = `${CIRCLE_CIRCUMFERENCE * SW_SPINNER_ARC} ${CIRCLE_CIRCUMFERENCE * (1 - SW_SPINNER_ARC)}`;

  const ringMotionClass =
    'motion-reduce:transition-none motion-reduce:duration-0 transition-all duration-300';

  const workoutTotalForSummary = readStopwatchTotal();

  const playPauseAria =
    mode === 'stopwatch'
      ? (running ? 'Pausar cronômetro de treino' : 'Iniciar cronômetro de treino')
      : (running ? 'Pausar contagem do descanso' : 'Iniciar contagem regressiva do descanso');

  return (
    <div className="space-y-6 animate-in-fade motion-reduce:animate-none">
      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {a11yLiveMessage}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="Voltar para a tela anterior"
          className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/90"
        >
          <ChevronLeft size={20} aria-hidden="true" />
          <span className="text-sm font-semibold">Voltar</span>
        </button>
        <div className="flex flex-col items-center text-center min-w-0 flex-1 px-2">
          <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
            <Timer size={20} className="text-emerald-400 shrink-0" aria-hidden="true" />
            Timer
          </h2>
          <p className="text-[11px] text-zinc-500 mt-0.5 max-w-[16rem] leading-snug">
            Cronômetro soma seu treino · Descanso conta o intervalo entre séries
          </p>
        </div>
        <div className="w-16 shrink-0" aria-hidden="true" />
      </div>

      {modeSwitchHint ? (
        <p className="text-center text-xs text-amber-200 bg-amber-600/15 border border-amber-500/35 rounded-xl py-2 px-3" role="status" aria-live="polite">
          {modeSwitchHint}
        </p>
      ) : null}

      <div
        className="flex rounded-xl bg-zinc-900/80 border border-zinc-800 p-1 gap-1"
        role="tablist"
        aria-label="Modo do timer"
      >
        <button
          type="button"
          role="tab"
          id="timer-tab-stopwatch"
          aria-selected={mode === 'stopwatch'}
          aria-controls="timer-panel-stopwatch"
          onClick={() => switchMode('stopwatch')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/90 ${
            mode === 'stopwatch'
              ? 'bg-emerald-600/25 text-emerald-200 border border-emerald-500/55'
              : 'text-zinc-500 border border-transparent hover:text-zinc-300'
          }`}
        >
          Cronômetro
        </button>
        <button
          type="button"
          role="tab"
          id="timer-tab-countdown"
          aria-selected={mode === 'countdown'}
          aria-controls="timer-panel-countdown"
          onClick={() => switchMode('countdown')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/90 ${
            mode === 'countdown'
              ? 'bg-emerald-600/25 text-emerald-200 border border-emerald-500/55'
              : 'text-zinc-500 border border-transparent hover:text-zinc-300'
          }`}
        >
          Descanso
        </button>
      </div>

      <div
        id="timer-panel-stopwatch"
        role="tabpanel"
        hidden={mode !== 'stopwatch'}
        aria-labelledby="timer-tab-stopwatch"
        className="space-y-4"
      >
        <div className="flex justify-center py-4">
          <div className="relative w-64 h-64 flex items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 248 248" aria-hidden="true">
              <circle
                cx="124" cy="124" r={CIRCLE_RADIUS}
                fill="none" stroke="rgb(39 39 42)" strokeWidth="6"
              />
              {mode === 'stopwatch' && running ? (
                <g
                  className="animate-spin motion-reduce:animate-none"
                  style={{ transformOrigin: '124px 124px' }}
                >
                  <circle
                    cx="124" cy="124" r={CIRCLE_RADIUS}
                    fill="none"
                    stroke="rgb(22 163 74)"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={dashSpinner}
                    strokeDashoffset={0}
                  />
                </g>
              ) : (
                <circle
                  cx="124" cy="124" r={CIRCLE_RADIUS}
                  fill="none"
                  stroke={elapsed > 0 ? 'rgb(22 163 74 / 0.65)' : 'rgb(22 163 74 / 0.22)'}
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={CIRCLE_CIRCUMFERENCE}
                  strokeDashoffset={stopwatchStrokeOffset}
                  className={ringMotionClass}
                />
              )}
            </svg>

            <div className="text-center z-10 px-2 max-w-[15rem]">
              <p
                className="text-5xl font-black tabular-nums tracking-tight text-white"
                aria-live="off"
              >
                {formatTime(elapsed)}
              </p>
              <p className="text-xs text-zinc-500 uppercase mt-1 font-bold">
                Tempo de treino
              </p>
              <p className="text-[10px] text-zinc-600 mt-2 normal-case font-medium leading-tight">
                Anel: referência visual até 1 h (não define meta de treino)
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        id="timer-panel-countdown"
        role="tabpanel"
        hidden={mode !== 'countdown'}
        aria-labelledby="timer-tab-countdown"
        className="space-y-4"
      >
        <div className="flex justify-center py-4">
          <div className="relative w-64 h-64 flex items-center justify-center">
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 248 248" aria-hidden="true">
              <circle
                cx="124" cy="124" r={CIRCLE_RADIUS}
                fill="none" stroke="rgb(39 39 42)" strokeWidth="6"
              />
              <circle
                cx="124" cy="124" r={CIRCLE_RADIUS}
                fill="none"
                stroke={
                  mode === 'countdown' && running
                    ? 'rgb(22 163 74)'
                    : 'rgb(22 163 74 / 0.45)'
                }
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={CIRCLE_CIRCUMFERENCE}
                strokeDashoffset={countdownStrokeOffset}
                className={ringMotionClass}
              />
            </svg>

            <div className="text-center z-10 px-2 max-w-[15rem]">
              <p className="text-sm text-zinc-400 tabular-nums font-semibold mb-1">
                Treino · <span className="text-zinc-200">{formatTime(workoutTotalForSummary)}</span>
              </p>
              <p
                className="text-5xl font-black tabular-nums tracking-tight text-white"
                aria-live="off"
              >
                {formatTime(countdownRemaining)}
              </p>
              <p className="text-xs text-zinc-500 uppercase mt-1 font-bold">
                Descanso restante
              </p>
              <p className="text-[10px] text-zinc-600 mt-2 normal-case font-medium leading-tight">
                Anel: tempo restante / tempo configurado
              </p>
            </div>
          </div>
        </div>

        {mode === 'countdown' && !running && countdownRemaining === countdownTarget && (
          <div className="space-y-3 animate-in-fade motion-reduce:animate-none" id="timer-rest-presets">
            <p className="text-center text-[10px] uppercase font-bold text-zinc-600">Duração do descanso</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {COUNTDOWN_PRESETS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => selectCountdownPreset(sec)}
                  aria-label={sec >= 60 ? `Descanso de ${sec / 60} minutos` : `Descanso de ${sec} segundos`}
                  aria-pressed={countdownTarget === sec}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/90 ${
                    countdownTarget === sec
                      ? 'bg-emerald-600/25 text-emerald-200 border border-emerald-500/55'
                      : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  {sec >= 60 ? `${sec / 60}min` : `${sec}s`}
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-center items-center">
              <label htmlFor="timer-rest-custom-min" className="sr-only">
                Minutos de descanso personalizado (1 a 60)
              </label>
              <input
                id="timer-rest-custom-min"
                type="number"
                inputMode="numeric"
                min="1"
                max="60"
                placeholder="min"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyCustomCountdown(); }}
                className="w-20 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white text-center placeholder:text-zinc-700 focus:outline-none focus-visible:border-emerald-500/60 focus-visible:ring-2 focus-visible:ring-emerald-500/30"
              />
              <button
                type="button"
                onClick={applyCustomCountdown}
                disabled={!customInput}
                aria-label="Aplicar minutos personalizados ao descanso"
                className="px-4 py-2 rounded-xl text-sm font-bold bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-600 transition-colors disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/90"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={handleReset}
          disabled={mode === 'stopwatch' ? elapsed === 0 : countdownRemaining === countdownTarget}
          title={mode === 'stopwatch' ? 'Zera só o cronômetro de treino' : 'Reinicia o descanso ao tempo configurado'}
          className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:border-zinc-600 transition-all motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-30 disabled:cursor-not-allowed active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400/90"
          aria-label={mode === 'stopwatch' ? 'Zerar cronômetro de treino' : 'Reiniciar contagem do descanso'}
        >
          <RotateCcw size={22} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={handlePlayPause}
          disabled={mode === 'countdown' && countdownRemaining <= 0}
          title={playPauseAria}
          className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all motion-reduce:transition-none motion-reduce:active:scale-100 active:scale-90 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-100 ${
            running
              ? 'bg-orange-600 shadow-orange-600/35'
              : 'bg-green-600 shadow-green-600/35'
          }`}
          aria-label={playPauseAria}
        >
          {running ? (
            <Pause size={32} className="text-zinc-950" aria-hidden="true" />
          ) : (
            <Play size={32} className="text-zinc-950 ml-1" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={handleFinishWorkout}
          disabled={readStopwatchTotal() === 0}
          className="w-14 h-14 rounded-full bg-red-600/25 border border-red-500/50 flex items-center justify-center text-red-300 hover:bg-red-600/35 hover:border-red-400/70 transition-all motion-reduce:transition-none motion-reduce:active:scale-100 disabled:opacity-30 disabled:cursor-not-allowed active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400/90"
          aria-label="Finalizar treino e usar este tempo no check-in"
        >
          <Square size={20} className="fill-current" aria-hidden="true" />
        </button>
      </div>

      <p className="text-center text-[11px] text-zinc-600">
        {mode === 'stopwatch'
          ? 'Inicie o cronômetro e treine! Trocar para Descanso não apaga o tempo de treino. Ao finalizar, registre seu check-in.'
          : 'Configure o descanso entre séries. Um alerta tocará ao final. O tempo de treino continua salvo no modo Cronômetro.'}
      </p>
    </div>
  );
}
