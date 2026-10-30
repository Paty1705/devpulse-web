'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { Mascot } from '@/components/mascot/Mascot';
import { Activity, GitBranch, LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const TEST_USERS = [
  { email: 'jefa.tecnica@devpulse.com', label: 'Jefatura' },
  { email: 'front.senior@devpulse.com', label: 'Developer Front' },
  { email: 'back.senior@devpulse.com', label: 'Developer Back' },
  { email: 'qa.tester@devpulse.com', label: 'QA Tester' },
  { email: 'dev.junior@devpulse.com', label: 'Dev Junior' },
];

export default function Home() {
  const { user, loading, signInWithGoogle, signInWithGithub, signInWithEmail } = useAuth();
  const { preferences } = usePreferences();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-[var(--text-secondary)]">Cargando…</div>;
  }

  if (user) return null;

  return (
    <main className="min-h-screen flex items-center justify-center p-4 md:p-8">
      <div className="glass-panel glass-iridescent thick-iridescent rounded-[32px] w-full max-w-[880px] p-6 md:p-10 flex flex-wrap items-center gap-8 md:gap-12">
        {/* Lado de marca */}
        <div className="flex-[1_1_300px] flex flex-col items-center md:items-start gap-6 text-center md:text-left">
          <div className="flex items-center gap-3">
            <span className="tile-3d w-14 h-14 rounded-[18px] flex items-center justify-center" style={{ background: 'linear-gradient(150deg, var(--accent-2), var(--accent))' }}>
              <Activity size={28} strokeWidth={2.4} className="text-white" />
            </span>
            <span className="flex flex-col text-left">
              <span className="font-display font-bold text-3xl tracking-tight text-[var(--text-primary)]">DevPulse</span>
              <span className="font-mono text-xs text-[var(--text-secondary)]">área de sistemas</span>
            </span>
          </div>
          <Mascot kind={preferences.mascot} size={190} />
          <p className="text-[15px] leading-relaxed text-[var(--text-secondary)] max-w-[300px]">
            Proyectos, tareas, juntas y avances del equipo en un solo lugar.
          </p>
        </div>

        {/* Lado de acceso */}
        <div className="flex-[1_1_320px] flex flex-col gap-4">
          <div className="flex flex-col gap-1 mb-2">
            <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">Bienvenido</h1>
            <p className="text-sm text-[var(--text-secondary)]">Inicia sesión para continuar.</p>
          </div>

          <button
            onClick={signInWithGithub}
            className="tile-3d flex items-center justify-center gap-3 w-full min-h-12 bg-[#1F2328] hover:bg-[#2D333B] text-white font-semibold px-4 rounded-[16px] transition-colors active:scale-[0.98]"
          >
            <GitBranch size={20} />
            Continuar con GitHub
          </button>

          <button
            onClick={signInWithGoogle}
            className="chip-glass flex items-center justify-center gap-3 w-full min-h-12 border border-[var(--border-card)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] font-semibold px-4 rounded-[16px] transition-colors active:scale-[0.98]"
          >
            <LogIn size={20} className="text-[var(--text-secondary)]" />
            Continuar con Google
          </button>

          <div className="mt-4 pt-5 border-t border-[var(--border-card)] flex flex-col gap-2">
            <label htmlFor="test-user" className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Entorno de pruebas
            </label>
            <select
              id="test-user"
              onChange={(e) => {
                if (e.target.value) signInWithEmail(e.target.value);
              }}
              defaultValue=""
              className="w-full min-h-11 chip-glass border border-[var(--border-card)] text-[var(--text-primary)] text-sm rounded-[14px] px-3 outline-none focus:border-[var(--accent)] cursor-pointer"
            >
              <option value="" disabled>Selecciona un usuario de prueba…</option>
              {TEST_USERS.map((u) => (
                <option key={u.email} value={u.email}>{u.label} ({u.email})</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </main>
  );
}
