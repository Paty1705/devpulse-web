'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';

type Theme = 'light' | 'dark' | 'system';
type Accent = 'neon' | 'magenta' | 'azul' | 'indigo' | 'mint' | 'amber';
type Density = 'comfortable' | 'compact';

interface Preferences {
  theme: Theme;
  accent: Accent;
  density: Density;
}

interface PreferencesContextType {
  preferences: Preferences;
  updatePreferences: (newPrefs: Partial<Preferences>) => void;
}

const defaultPreferences: Preferences = {
  theme: 'system',
  accent: 'neon',
  density: 'comfortable',
};

const PreferencesContext = createContext<PreferencesContextType>({
  preferences: defaultPreferences,
  updatePreferences: () => {},
});

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);

  const applyDOMChanges = useCallback((prefs: Preferences) => {
    const root = document.documentElement;

    // Tema
    let isDark = false;
    if (prefs.theme === 'system') {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else {
      isDark = prefs.theme === 'dark';
    }

    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Acento
    root.setAttribute('data-accent', prefs.accent);

    // Densidad
    root.setAttribute('data-density', prefs.density);
  }, []);

  // Carga inicial (localStorage + Supabase si hay login)
  useEffect(() => {
    const loadPreferences = async () => {
      // 1. Intentar localStorage
      const localPrefs = localStorage.getItem('devpulse_preferences');
      let currentPrefs = { ...defaultPreferences };

      if (localPrefs) {
        try {
          currentPrefs = { ...currentPrefs, ...JSON.parse(localPrefs) };
        } catch {
          // Ignorar preferencias locales corruptas y seguir con los valores por defecto.
        }
      }

      // 2. Si el usuario está logueado, Supabase gana (sincronización en la nube)
      if (profile?.id) {
        try {
          const { data } = await supabase.from('profiles').select('preferences').eq('id', profile.id).single();
          if (data && data.preferences) {
            currentPrefs = { ...currentPrefs, ...data.preferences };
          }
        } catch (e) {
          console.error("Error cargando preferencias de DB", e);
        }
      }

      setPreferences(currentPrefs);
      applyDOMChanges(currentPrefs);
    };

    if (profile !== undefined) { // Evita correr antes de que Auth sepa si hay o no usuario
      loadPreferences();
    }
  }, [profile, applyDOMChanges]);

  // Escuchar cambios del sistema operativo si theme === 'system'
  useEffect(() => {
    if (preferences.theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyDOMChanges(preferences);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [preferences, applyDOMChanges]);

  const updatePreferences = async (newPrefs: Partial<Preferences>) => {
    const updated = { ...preferences, ...newPrefs };
    setPreferences(updated);
    applyDOMChanges(updated);
    
    // Guardar en LocalStorage
    localStorage.setItem('devpulse_preferences', JSON.stringify(updated));

    // Guardar en Supabase
    if (profile?.id) {
      await supabase.from('profiles').update({ preferences: updated }).eq('id', profile.id);
    }
  };

  // Ya no prevenimos el renderizado devolviendo null porque causa un error grave de hidratación entre el Server y el Client.
  // El destello (FOUC) ya está solucionado gracias al <script> que inyectamos en layout.tsx.

  return (
    <PreferencesContext.Provider value={{ preferences, updatePreferences }}>
      {children}
    </PreferencesContext.Provider>
  );
}

export const usePreferences = () => useContext(PreferencesContext);
