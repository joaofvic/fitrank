import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthProvider.jsx';
import { useSocialData } from '../../hooks/useSocialData.js';
import { analytics } from '../../lib/analytics.js';
import { WelcomeStep } from './steps/WelcomeStep.jsx';
import { GoalStep } from './steps/GoalStep.jsx';
import { WorkoutTypesStep } from './steps/WorkoutTypesStep.jsx';
import { FriendsStep } from './steps/FriendsStep.jsx';

const TOTAL_STEPS = 4;
const STEP_NAMES = ['welcome', 'goal', 'workout_types', 'friends'];

export function OnboardingWizard() {
  const { supabase, profile, session, refreshProfile } = useAuth();
  const social = useSocialData({ supabase, session, profile });
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(null);
  const [workoutTypes, setWorkoutTypes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const trackedRef = useRef(false);

  useEffect(() => {
    if (!trackedRef.current) {
      analytics.onboardingStarted?.();
      trackedRef.current = true;
    }
  }, []);

  const advance = useCallback((skipCurrent = false) => {
    const eventName = skipCurrent ? 'onboardingStepSkipped' : 'onboardingStepCompleted';
    analytics[eventName]?.({ step_name: STEP_NAMES[step] });
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }, [step]);

  const finishOnboarding = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc('complete_onboarding', {
        p_fitness_goal: goal || null,
        p_preferred_workout_types: workoutTypes.length > 0 ? workoutTypes : [],
      });
      if (rpcErr) throw rpcErr;
      analytics.onboardingCompleted?.();
      await refreshProfile();
    } catch (e) {
      setError(e?.message || 'Erro ao salvar. Tente novamente.');
      setBusy(false);
    }
  }, [supabase, goal, workoutTypes, refreshProfile]);

  const handleFriendsFinish = useCallback(async () => {
    analytics.onboardingStepCompleted?.({ step_name: 'friends' });
    await finishOnboarding();
  }, [finishOnboarding]);

  const handleWorkoutNext = useCallback(() => {
    advance(false);
  }, [advance]);

  const handleWorkoutSkip = useCallback(() => {
    setWorkoutTypes([]);
    advance(true);
  }, [advance]);

  const handleGoalNext = useCallback(() => {
    advance(false);
  }, [advance]);

  const handleGoalSkip = useCallback(() => {
    setGoal(null);
    advance(true);
  }, [advance]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex justify-center gap-2" role="progressbar" aria-valuenow={step + 1} aria-valuemin={1} aria-valuemax={TOTAL_STEPS}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i <= step ? 'bg-green-500 w-8' : 'bg-zinc-800 w-6'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center" role="alert">{error}</p>
        )}

        {step === 0 && (
          <WelcomeStep
            displayName={profile?.display_name || profile?.nome}
            onNext={() => advance(false)}
          />
        )}

        {step === 1 && (
          <GoalStep
            value={goal}
            onChange={setGoal}
            onNext={handleGoalNext}
            onSkip={handleGoalSkip}
          />
        )}

        {step === 2 && (
          <WorkoutTypesStep
            supabase={supabase}
            value={workoutTypes}
            onChange={setWorkoutTypes}
            onNext={handleWorkoutNext}
            onSkip={handleWorkoutSkip}
          />
        )}

        {step === 3 && (
          <FriendsStep
            supabase={supabase}
            currentUserId={session?.user?.id}
            sendFriendRequest={social.sendFriendRequest}
            cancelSentFriendRequest={social.cancelSentFriendRequest}
            sentRequests={social.sentRequests}
            onLoadSentRequests={social.loadSentRequests}
            onFinish={handleFriendsFinish}
          />
        )}

        {busy && (
          <p className="text-sm text-zinc-400 text-center animate-pulse">Salvando...</p>
        )}
      </div>
    </div>
  );
}
