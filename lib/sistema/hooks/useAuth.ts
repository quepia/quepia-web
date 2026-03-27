'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/sistema/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { SistemaUser } from '@/types/sistema';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [sistemaUser, setSistemaUser] = useState<SistemaUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [tablesExist, setTablesExist] = useState(true);
  const [setupError, setSetupError] = useState<string | null>(null);

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
      const res = await fetch(`/api/sistema-data?userId=${userId}&type=user`, {
        cache: 'no-store'
      });
      const result = await res.json();

      if (result.exists === false) {
        setTablesExist(false);
        return;
      }

      if (!res.ok) {
        console.error('Error fetching sistema user:', result.error);
        return;
      }

      if (result.user && (result.user.deleted_at || result.user.is_active === false)) {
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
        // First check if tables exist
        const exists = await checkTablesExist();

        // Get initial session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
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

  const createSistemaUser = async (nombre: string): Promise<boolean> => {
    if (!user) {
      setSetupError('No hay usuario autenticado');
      return false;
    }

    if (!tablesExist) {
      setSetupError('Las tablas del sistema no están configuradas. Ejecuta las migraciones SQL en Supabase.');
      return false;
    }

    try {
      setSetupError(null);
      const supabase = createClient();
      const { error } = await supabase.from('sistema_users').insert({
        id: user.id,
        email: user.email!,
        nombre,
      });

      if (error) {
        console.error('Error creating sistema user:', error);
        if (error.code === '42P01') {
          setSetupError('Las tablas del sistema no están configuradas. Ejecuta las migraciones SQL en Supabase.');
          setTablesExist(false);
        } else if (error.code === '23505') {
          // Unique violation - user already exists, just fetch them
          await fetchSistemaUser(user.id);
          return true;
        } else {
          setSetupError(`Error: ${error.message}`);
        }
        return false;
      }

      await fetchSistemaUser(user.id);
      return true;
    } catch (err) {
      console.error('Error creating sistema user:', err);
      setSetupError('Error inesperado al crear el perfil');
      return false;
    }
  };

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
    setupError,
    createSistemaUser,
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
