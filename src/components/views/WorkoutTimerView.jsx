import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Square, Timer, ChevronLeft } from 'lucide-react';
import { playSound } from '../../lib/sounds.js';
import { haptic } from '../../lib/haptics.js';

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
 * @param {{ running: boolean, ref: React.RefObject }} props.timerHook - External timer state from useWorkoutTimer
 */
export function WorkoutTimerView({ onClose, onFinish, timerHook }) {
  const { ref: timerRef, reportStart, reportPause, reportReset, reportFinish } = timerHook;

  const restoredElapsed = timerRef.current.baseElapsed + (
    timerRef.current.running && timerRef.current.startedAt
      ? Math.floor((Date.now() - timerRef.current.startedAt) / 1000)
      : 0
  );

  const [mode, setMode] = useState(timerRef.current.mode || 'stopwatch');
  const [running, setRunning] = useState(timerRef.current.running);
  const [elapsed, setElapsed] = useState(restoredElapsed);
  const [countdownTarget, setCountdownTarget] = useState(60);
  const [countdownRemaining, setCountdownRemaining] = useState(60);
  const [customInput, setCustomInput] = useState('');

  const intervalRef = useRef(null);
  const startTimeRef = useRef(timerRef.current.startedAt);
  const baseElapsedRef = useRef(timerRef.current.baseElapsed);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (timerRef.current.running && timerRef.current.startedAt) {
      startTimeRef.current = timerRef.current.startedAt;
      baseElapsedRef.current = timerRef.current.baseElapsed;
      if (mode === 'stopwatch') {
        intervalRef.current = setInterval(() => {
          const total = baseElapsedRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000);
          setElapsed(total);
        }, 250);
      } else {
        if (timerRef.current.countdownTarget) setCountdownTarget(timerRef.current.countdownTarget);
        intervalRef.current = setInterval(() => {
          const rem = baseElapsedRef.current - Math.floor((Date.now() - startTimeRef.current) / 1000);
          if (rem <= 0) {
            setCountdownRemaining(0);
            clearTimer();
            setRunning(false);
            reportPause(0);
            playSound('streak');
            haptic('success');
          } else {
            setCountdownRemaining(rem);
          }
        }, 250);
      }
    }
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
    reportStart(elapsed);
  }, [elapsed, reportStart]);

  const startCountdown = useCallback(() => {
    if (countdownRemaining <= 0) return;
    startTimeRef.current = Date.now();
    baseElapsedRef.current = countdownRemaining;
    intervalRef.current = setInterval(() => {
      const rem = baseElapsedRef.current - Math.floor((Date.now() - startTimeRef.current) / 1000);
      if (rem <= 0) {
        setCountdownRemaining(0);
        clearTimer();
        setRunning(false);
        reportPause(0);
        playSound('streak');
        haptic('success');
      } else {
        setCountdownRemaining(rem);
      }
    }, 250);
    setRunning(true);
    reportStart(countdownRemaining, countdownTarget);
  }, [countdownRemaining, countdownTarget, clearTimer, reportPause, reportStart]);

  const handlePlayPause = useCallback(() => {
    if (running) {
      clearTimer();
      setRunning(false);
      if (mode === 'stopwatch') {
        const total = baseElapsedRef.current + Math.floor((Date.now() - startTimeRef.current) / 1000);
        setElapsed(total);
        reportPause(total);
      } else {
        const rem = baseElapsedRef.current - Math.floor((Date.now() - startTimeRef.current) / 1000);
        const clamped = Math.max(0, rem);
        setCountdownRemaining(clamped);
        reportPause(clamped);
      }
      haptic('light');
    } else {
      haptic('medium');
      if (mode === 'stopwatch') startStopwatch();
      else startCountdown();
    }
  }, [running, mode, clearTimer, startStopwatch, startCountdown, reportPause]);

  const handleReset = useCallback(() => {
    clearTimer();
    setRunning(false);
    if (mode === 'stopwatch') {
      setElapsed(0);
      baseElapsedRef.current = 0;
    } else {
      setCountdownRemaining(countdownTarget);
      baseElapsedRef.current = countdownTarget;
    }
    reportReset();
    haptic('light');
  }, [mode, countdownTarget, clearTimer, reportReset]);

  const handleFinishWorkout = useCallback(() => {
    clearTimer();
    setRunning(false);
    const totalSec = reportFinish();
    let sec = totalSec;
    if (mode === 'countdown') {
      sec = countdownTarget - countdownRemaining;
    } else if (sec == null) {
      sec = elapsed;
    }
    haptic('success');
    playSound('checkin');
    onFinish?.(sec > 0 ? sec : null);
  }, [mode, elapsed, countdownTarget, countdownRemaining, clearTimer, reportFinish, onFinish]);

  const selectCountdownPreset = useCallback((seconds) => {
    clearTimer();
    setRunning(false);
    setCountdownTarget(seconds);
    setCountdownRemaining(seconds);
    baseElapsedRef.current = seconds;
    reportReset();
  }, [clearTimer, reportReset]);

  const applyCustomCountdown = useCallback(() => {
    const val = parseInt(customInput, 10);
    if (Number.isFinite(val) && val > 0 && val <= 60) {
      selectCountdownPreset(val * 60);
      setCustomInput('');
    }
  }, [customInput, selectCountdownPreset]);

  const switchMode = useCallback((newMode) => {
    if (newMode === mode) return;
    clearTimer();
    setRunning(false);
    setMode(newMode);
    timerRef.current.mode = newMode;
    if (newMode === 'stopwatch') {
      setElapsed(0);
      baseElapsedRef.current = 0;
    } else {
      setCountdownRemaining(countdownTarget);
      baseElapsedRef.current = countdownTarget;
    }
    reportReset();
  }, [mode, countdownTarget, clearTimer, reportReset, timerRef]);

  const displayTime = mode === 'stopwatch' ? elapsed : countdownRemaining;
  const progress = mode === 'countdown' && countdownTarget > 0
    ? countdownRemaining / countdownTarget
    : mode === 'stopwatch' && elapsed > 0 ? 1 : 0;
  const strokeOffset = CIRCLE_CIRCUMFERENCE * (1 - progress);

  return (
    <div className="space-y-6 animate-in-fade">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onClose} className="flex items-center gap-1 text-zinc-400 hover:text-white transition-colors">
          <ChevronLeft size={20} />
          <span className="text-sm font-semibold">Voltar</span>
        </button>
        <h2 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
          <Timer size={20} className="text-green-500" />
          Timer
        </h2>
        <div className="w-16" />
      </div>

      <div className="flex rounded-xl bg-zinc-900/80 border border-zinc-800 p-1 gap-1">
        <button
          type="button"
          onClick={() => switchMode('stopwatch')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
            mode === 'stopwatch'
              ? 'bg-green-500/20 text-green-400 border border-green-500/40'
              : 'text-zinc-500 border border-transparent hover:text-zinc-300'
          }`}
        >
          Cronômetro
        </button>
        <button
          type="button"
          onClick={() => switchMode('countdown')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors ${
            mode === 'countdown'
              ? 'bg-green-500/20 text-green-400 border border-green-500/40'
              : 'text-zinc-500 border border-transparent hover:text-zinc-300'
          }`}
        >
          Descanso
        </button>
      </div>

      <div className="flex justify-center py-4">
        <div className="relative w-64 h-64 flex items-center justify-center">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 248 248">
            <circle
              cx="124" cy="124" r={CIRCLE_RADIUS}
              fill="none" stroke="rgb(39 39 42)" strokeWidth="6"
            />
            <circle
              cx="124" cy="124" r={CIRCLE_RADIUS}
              fill="none"
              stroke={running ? 'rgb(34 197 94)' : 'rgb(34 197 94 / 0.4)'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={CIRCLE_CIRCUMFERENCE}
              strokeDashoffset={strokeOffset}
              className="transition-all duration-300"
            />
          </svg>

          <div className="text-center z-10">
            <p className="text-5xl font-black tabular-nums tracking-tight text-white">
              {formatTime(displayTime)}
            </p>
            <p className="text-xs text-zinc-500 uppercase mt-1 font-bold">
              {mode === 'stopwatch' ? 'Tempo de treino' : 'Descanso restante'}
            </p>
          </div>
        </div>
      </div>

      {mode === 'countdown' && !running && countdownRemaining === countdownTarget && (
        <div className="space-y-3 animate-in-fade">
          <div className="flex gap-2 justify-center">
            {COUNTDOWN_PRESETS.map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => selectCountdownPreset(sec)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                  countdownTarget === sec
                    ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                    : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-600'
                }`}
              >
                {sec >= 60 ? `${sec / 60}min` : `${sec}s`}
              </button>
            ))}
          </div>
          <div className="flex gap-2 justify-center items-center">
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="60"
              placeholder="min"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyCustomCountdown(); }}
              className="w-20 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white text-center placeholder:text-zinc-700 focus:outline-none focus:border-green-500/50"
            />
            <button
              type="button"
              onClick={applyCustomCountdown}
              disabled={!customInput}
              className="px-4 py-2 rounded-xl text-sm font-bold bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-600 transition-colors disabled:opacity-40"
            >
              OK
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={handleReset}
          disabled={mode === 'stopwatch' ? elapsed === 0 : countdownRemaining === countdownTarget}
          className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white hover:border-zinc-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-90"
          aria-label="Reset"
        >
          <RotateCcw size={22} />
        </button>

        <button
          type="button"
          onClick={handlePlayPause}
          disabled={mode === 'countdown' && countdownRemaining <= 0}
          className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-90 disabled:opacity-40 ${
            running
              ? 'bg-orange-500 shadow-orange-500/30'
              : 'bg-green-500 shadow-green-500/30'
          }`}
          aria-label={running ? 'Pausar' : 'Iniciar'}
        >
          {running ? <Pause size={32} className="text-black" /> : <Play size={32} className="text-black ml-1" />}
        </button>

        <button
          type="button"
          onClick={handleFinishWorkout}
          disabled={mode === 'stopwatch' ? elapsed === 0 : false}
          className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 hover:bg-red-500/30 hover:border-red-500/60 transition-all disabled:opacity-30 disabled:cursor-not-allowed active:scale-90"
          aria-label="Finalizar treino"
        >
          <Square size={20} className="fill-current" />
        </button>
      </div>

      <p className="text-center text-[11px] text-zinc-600">
        {mode === 'stopwatch'
          ? 'Inicie o cronômetro e treine! Ao finalizar, registre seu check-in.'
          : 'Configure o descanso entre séries. Um alerta tocará ao final.'}
      </p>
    </div>
  );
}
