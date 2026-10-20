'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Specialty } from '@/lib/specialties';

type Profile = {
  id: string;
  email: string;
  role: 'jefe' | 'developer' | 'qa' | 'empleado' | 'usuario' | 'pasante';
  status: 'pending' | 'approved' | 'rejected';
  requested_role: 'developer' | 'qa' | 'pasante' | null;
  specialty: Specialty | null;
};

export type RequestableRole = 'developer' | 'qa' | 'pasante';

type SignUpResult = { error: string | null; needsEmailConfirmation: boolean };

type AuthContextType = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  signInWithEmail: (email: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<string | null>;
  signUpWithEmail: (email: string, password: string, requestedRole: RequestableRole, specialty: Specialty | null) => Promise<SignUpResult>;
  setRequestedRole: (role: RequestableRole) => Promise<string | null>;
  setSpecialty: (specialty: Specialty) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signInWithGoogle: async () => {},
  signInWithGithub: async () => {},
  signInWithEmail: async () => {},
  signInWithPassword: async () => null,
  signUpWithEmail: async () => ({ error: null, needsEmailConfirmation: false }),
  setRequestedRole: async () => null,
  setSpecialty: async () => null,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (data && !error) {
        setProfile(data as Profile);
      } else if (error) {
        console.error("Error fetching profile:", error);
      }
    } catch (e) {
      console.error("Exception fetching profile:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    };

    fetchSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/calendar.events',
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
  };

  const signInWithGithub = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const signInWithEmail = async (email: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: '123456'
    });
    if (error) {
      console.error("Error logging in with email:", error);
      alert("Error al iniciar sesión: " + error.message);
    }
  };

  // Login real con correo y contraseña (devuelve el mensaje de error o null)
  const signInWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  };

  // Registro con correo. El rol elegido es solo una SOLICITUD: la cuenta queda
  // 'pending' y un jefe decide el rol real al aprobarla.
  const signUpWithEmail = async (email: string, password: string, requestedRole: RequestableRole, specialty: Specialty | null): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { requested_role: requestedRole, specialty },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) return { error: error.message, needsEmailConfirmation: false };
    // Sin sesión = Supabase exige confirmar el correo antes de entrar
    return { error: null, needsEmailConfirmation: !data.session };
  };

  // Para quien entró con Google/GitHub y todavía no indicó qué rol solicita
  const setRequestedRole = async (role: RequestableRole) => {
    const { error } = await supabase.rpc('set_requested_role', { wanted: role });
    if (error) return error.message;
    if (user) await fetchProfile(user.id);
    return null;
  };

  const setSpecialty = async (specialty: Specialty) => {
    const { error } = await supabase.rpc('set_specialty', { wanted: specialty });
    if (error) return error.message;
    if (user) await fetchProfile(user.id);
    return null;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signInWithGoogle, signInWithGithub, signInWithEmail, signInWithPassword, signUpWithEmail, setRequestedRole, setSpecialty, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
