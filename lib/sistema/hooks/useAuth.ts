'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/sistema/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { SistemaUser } from '@/types/sistema';

const sistemaUserLoads = new Map<string, Promise<{ ok: boolean; result: { exists?: boolean; user?: SistemaUser | null; error?: string } }>>();

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [sistemaUser, setSistemaUser] = useState<SistemaUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tablesExist, setTablesExist] = useState(true);

  const checkTablesExist = useCallback(async () => {
    try {
      const res = await fetch('/api/sistema-data?type=check-tables');
      const result = await res.json();
      if (!result.exists) {
        setTablesExist(false);
        return false;
      }
      return true;
    } catch {
      setTablesExist(false);
      return false;
    }
  }, []);

  const fetchSistemaUser = useCallback(async (userId: string) => {
    try {
      let load = sistemaUserLoads.get(userId);
      if (!load) {
        load = fetch(`/api/sistema-data?userId=${userId}&type=user`, {
          cache: 'no-store'
        }).then(async (res) => ({ ok: res.ok, result: await res.json() }));
        sistemaUserLoads.set(userId, load);
        void load.then(
          () => window.setTimeout(() => sistemaUserLoads.delete(userId), 1_000),
          () => window.setTimeout(() => sistemaUserLoads.delete(userId), 1_000),
        );
      }
      const { ok, result } = await load;

      if (result.exists === false) {
        setTablesExist(false);
        return;
      }

      if (!ok) {
        console.error('Error fetching sistema user:', result.error);
        return;
      }

      if (result.user && (
        result.user.is_authorized !== true ||
        result.user.deleted_at ||
        result.user.is_active === false
      )) {
        setSistemaUser(null);
        return;
      }

      setSistemaUser(result.user || null);
    } catch (err) {
      console.error('Error fetching sistema user:', err);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const initAuth = async () => {
      try {
        const [
          exists,
          { data: { session }, error: sessionError },
        ] = await Promise.all([
          checkTablesExist(),
          supabase.auth.getSession(),
        ]);

        if (sessionError) console.error("Session error:", sessionError);

        setUser(session?.user ?? null);

        if (session?.user && exists) {
          await fetchSistemaUser(session.user.id);
        }
      } catch (err) {
        console.error("Auth initialization error:", err);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      if (session?.user && tablesExist) {
        await fetchSistemaUser(session.user.id);
      } else {
        setSistemaUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchSistemaUser, checkTablesExist, tablesExist]);

  const updateSistemaUser = async (updates: Partial<SistemaUser>): Promise<boolean> => {
    if (!user) return false;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('sistema_users')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      await fetchSistemaUser(user.id);
      return true;
    } catch (err) {
      console.error('Error updating sistema user:', err);
      return false;
    }
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
  };

  return {
    user,
    sistemaUser,
    loading,
    isAuthenticated: !!user,
    hasSistemaProfile: !!sistemaUser,
    tablesExist,
    updateSistemaUser,
    signOut,
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
