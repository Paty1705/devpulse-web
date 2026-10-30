'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';
import {
  applyPreferencesToDOM,
  defaultPreferences,
  normalizePreferences,
  PREFERENCES_STORAGE_KEY,
  type Preferences,
} from '@/lib/theme';

export type { Preferences } from '@/lib/theme';

interface PreferencesContextType {
  preferences: Preferences;
  updatePreferences: (newPrefs: Partial<Preferences>) => void;
}

const PreferencesContext = createContext<PreferencesContextType>({
  preferences: defaultPreferences,
  updatePreferences: () => {},
});

// Los sliders (desenfoque, iridiscencia) disparan muchos cambios seguidos:
// el DOM y localStorage se actualizan al instante, Supabase espera a que el
// usuario suelte.
const SAVE_DELAY_MS = 600;

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carga inicial (localStorage + Supabase si hay login)
  useEffect(() => {
    if (profile === undefined) return; // Auth todavía no sabe si hay usuario
    let cancelled = false;

    (async () => {
      let raw: Record<string, unknown> = {};
      try {
        const local = localStorage.getItem(PREFERENCES_STORAGE_KEY);
        if (local) raw = { ...raw, ...JSON.parse(local) };
      } catch {
        // Preferencias locales corruptas: se ignoran.
      }

      // Si el usuario está logueado, Supabase gana (sincronización entre dispositivos)
      if (profile?.id) {
        try {
          const { data } = await supabase.from('profiles').select('preferences').eq('id', profile.id).single();
          if (data?.preferences) raw = { ...raw, ...data.preferences };
        } catch (e) {
          console.error('Error cargando preferencias de DB', e);
        }
      }

      if (cancelled) return;
      const prefs = normalizePreferences(raw);
      setPreferences(prefs);
      applyPreferencesToDOM(prefs);
      try {
        localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
      } catch {
        // Almacenamiento bloqueado (modo privado): se sigue sin caché local.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [profile]);

  // Escuchar cambios del sistema operativo si theme === 'system'
  useEffect(() => {
    if (preferences.theme !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyPreferencesToDOM(preferences);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [preferences]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const updatePreferences = useCallback((newPrefs: Partial<Preferences>) => {
    const updated = normalizePreferences({ ...preferences, ...newPrefs });
    setPreferences(updated);
    applyPreferencesToDOM(updated);
    try {
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignorar: se guarda igual en Supabase.
    }

    if (profile?.id) {
      const userId = profile.id;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const { error } = await supabase.from('profiles').update({ preferences: updated }).eq('id', userId);
        if (error) console.error('Error guardando preferencias', error);
      }, SAVE_DELAY_MS);
    }
  }, [preferences, profile]);

  // El destello inicial (FOUC) lo evita el <script> de layout.tsx.
  return (
    <PreferencesContext.Provider value={{ preferences, updatePreferences }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export const usePreferences = () => useContext(PreferencesContext);
