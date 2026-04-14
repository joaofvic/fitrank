import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSupabase, isSupabaseConfigured } from '../../lib/supabase/client.js';
import { Sentry } from '../../lib/sentry.js';
import { identifyUser, resetUser } from '../../lib/posthog.js';
import { logger } from '../../lib/logger.js';
import { analytics } from '../../lib/analytics.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const supabase = useMemo(() => getSupabase(), []);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured());
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  const loadProfile = useCallback(
    async (userId) => {
      if (!supabase || !userId) {
        setProfile(null);
        setTenant(null);
        if (Sentry?.setUser) Sentry.setUser(null);
        resetUser();
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select(
          'id, display_name, nome, username, avatar_url, academia, pontos, streak, xp, league, is_pro, last_checkin_date, created_at, is_platform_master, tenant_id, tenants (slug, name, status)'
        )
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        logger.error('perfil', error);
        setProfile(null);
        setTenant(null);
        return;
      }
      const profileData = data ? { ...data, tenants: undefined } : null;
      setProfile(profileData);
      setTenant(data?.tenants ?? null);

      if (profileData && Sentry?.setUser) {
        Sentry.setUser({ id: profileData.id, username: profileData.username });
        Sentry.setTag('tenant_id', profileData.tenant_id ?? 'none');
        Sentry.setTag('is_master', String(!!profileData.is_platform_master));
      }
      identifyUser(profileData, data?.tenants);

      return profileData;
    },
    [supabase]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (hashParams.get('type') === 'recovery') {
      setIsPasswordRecovery(true);
    }
  }, [supabase]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (cancelled) return;
      setSession(s);
      setLoading(false);
      if (s?.user?.id) {
        loadProfile(s.user.id);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      setSession(s);
      if (s?.user?.id) {
        loadProfile(s.user.id);
      } else {
        setProfile(null);
        setTenant(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    analytics.authLogout();
    await supabase.auth.signOut();
    analytics.authLogout();
    setProfile(null);
    setTenant(null);
    setIsPasswordRecovery(false);
    if (Sentry?.setUser) Sentry.setUser(null);
    resetUser();
  }, [supabase]);

  const completePasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
  }, []);

  const refreshProfile = useCallback(() => {
    const uid = session?.user?.id;
    if (uid) return loadProfile(uid);
    return Promise.resolve();
  }, [session?.user?.id, loadProfile]);

  const value = useMemo(
    () => ({
      supabase,
      configured: isSupabaseConfigured(),
      session,
      profile,
      tenant,
      loading,
      isPasswordRecovery,
      completePasswordRecovery,
      refreshProfile,
      signOut
    }),
    [
      supabase,
      session,
      profile,
      tenant,
      loading,
      isPasswordRecovery,
      completePasswordRecovery,
      refreshProfile,
      signOut
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return ctx;
}
