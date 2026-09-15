'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/sistema/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { SistemaUser } from '@/types/sistema';

const sistemaUserLoads = new Map<string, Promise<{ ok: boolean; result: { exists?: boolean; user?: SistemaUser | null; error?: string } }>>();

async function loadProfile(userId: string) {
  const existing = sistemaUserLoads.get(userId);
  if (existing) return existing;
  const load = fetch(`/api/sistema-data?userId=${encodeURIComponent(userId)}&type=user`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  }).then(async (res) => ({ ok: res.ok, result: await res.json() }));
  sistemaUserLoads.set(userId, load);
  try {
    return await load;
  } finally {
    if (sistemaUserLoads.get(userId) === load) sistemaUserLoads.delete(userId);
  }
}

async function readSession() {
  // getSession can wait on token refresh or the SDK lock before fetch starts.
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      createClient().auth.getSession(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('La sesión tardó demasiado en responder.')), 8_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [sistemaUser, setSistemaUser] = useState<SistemaUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tablesExist, setTablesExist] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const mounted = useRef(false);
  const activeUserId = useRef<string | null>(null);
  const profileRequest = useRef(0);
  const sessionVersion = useRef(0);

  const fetchSistemaUser = useCallback(async (userId: string) => {
    const request = ++profileRequest.current;
    const isCurrent = () => mounted.current && activeUserId.current === userId && profileRequest.current === request;
    try {
      const { ok, result } = await loadProfile(userId);
      if (!isCurrent()) return;
      // Only an explicit schema response means missing tables; never infer it
      // from a 502, timeout, malformed JSON or missing profile.
      if (ok && result.exists === false) {
        setTablesExist(false);
        setSistemaUser(null);
        setAuthError(null);
        return;
      }
      if (!ok) throw new Error('No pudimos verificar tu acceso. Volvé a intentarlo.');
      setTablesExist(true);
      const profile = result.user;
      if (!profile || profile.is_authorized !== true || profile.deleted_at || profile.is_active === false) {
        setSistemaUser(null);
        setAuthError('Tu perfil no está disponible o no tiene acceso al sistema.');
        return;
      }
      setSistemaUser(profile);
      setAuthError(null);
    } catch {
      if (!isCurrent()) return;
      setSistemaUser(null);
      setAuthError('No pudimos verificar tu acceso. Volvé a intentarlo.');
    }
  }, []);

  const retryAuth = useCallback(async () => {
    const version = ++sessionVersion.current;
    setLoading(true);
    setAuthError(null);
    try {
      const { data: { session }, error } = await readSession();
      if (!mounted.current || sessionVersion.current !== version) return;
      if (error) throw error;
      activeUserId.current = session?.user.id ?? null;
      setUser(session?.user ?? null);
      setSistemaUser(null);
      if (session?.user) await fetchSistemaUser(session.user.id);
    } catch {
      if (mounted.current && sessionVersion.current === version) {
        setAuthError('No pudimos recuperar tu sesión. Volvé a intentarlo.');
      }
    } finally {
      if (mounted.current && sessionVersion.current === version) setLoading(false);
    }
  }, [fetchSistemaUser]);

  useEffect(() => {
    mounted.current = true;
    const supabase = createClient();
    void retryAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // retryAuth already handles the initial session; avoid a duplicate profile load.
      if (event === 'INITIAL_SESSION') return;
      const version = ++sessionVersion.current;
      profileRequest.current += 1;
      const nextUserId = session?.user.id ?? null;
      if (activeUserId.current !== nextUserId) setSistemaUser(null);
      activeUserId.current = nextUserId;
      setUser(session?.user ?? null);
      setAuthError(null);
      if (session?.user) {
        // Return immediately: the SDK awaits subscribers under its session lock.
        void fetchSistemaUser(session.user.id).finally(() => {
          if (mounted.current && sessionVersion.current === version) setLoading(false);
        });
      } else {
        setSistemaUser(null);
        setLoading(false);
        sistemaUserLoads.clear();
      }
    });
    return () => {
      mounted.current = false;
      sessionVersion.current += 1;
      profileRequest.current += 1;
      subscription.unsubscribe();
    };
  }, [fetchSistemaUser, retryAuth]);

  const updateSistemaUser = async (updates: Partial<SistemaUser>): Promise<boolean> => {
    if (!user) return false;
    try {
      const { error } = await createClient().from('sistema_users').update(updates).eq('id', user.id);
      if (error) throw error;
      await fetchSistemaUser(user.id);
      return true;
    } catch (err) {
      console.error('Error updating sistema user:', err);
      return false;
    }
  };

  const signOut = async () => { await createClient().auth.signOut(); };
  return {
    user, sistemaUser, loading, authError, retryAuth,
    isAuthenticated: !!user, hasSistemaProfile: !!sistemaUser, tablesExist,
    updateSistemaUser, signOut,
    refresh: () => user && fetchSistemaUser(user.id),
  };
}

type UseSistemaUsersOptions = {
  enabled?: boolean;
};

export function useSistemaUsers(options?: UseSistemaUsersOptions) {
  const enabled = options?.enabled ?? true;
  const [users, setUsers] = useState<SistemaUser[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    try {
      const supabase = createClient();
      let { data, error } = await supabase
        .from('sistema_users')
        .select('*')
        .is('deleted_at', null)
        .neq('is_active', false)
        .order('nombre', { ascending: true });

      if (error && (error.message.includes('deleted_at') || error.message.includes('is_active'))) {
        const fallback = await supabase
          .from('sistema_users')
          .select('*')
          .order('nombre', { ascending: true });
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        if (error.code !== '42P01') {
          console.error('Error fetching users:', error);
        }
        return;
      }

      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    loading,
    refresh: fetchUsers,
  };
}
