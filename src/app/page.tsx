'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { LogIn, GitBranch } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const { user, loading, signInWithGoogle, signInWithGithub, signInWithEmail } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) return <div className="flex h-screen items-center justify-center">Cargando...</div>;

  if (!user) {
    return (
      <main className="flex h-screen flex-col items-center justify-center p-24">
        <div className="bg-[var(--bg-card)] text-[var(--text-primary)] border border-[var(--border-card)] p-8 rounded-[8px] shadow-[var(--shadow-hover)] max-w-md w-full text-center">
          <h1 className="text-3xl font-bold mb-2 text-[var(--text-primary)]">DevPulse Web</h1>
          <p className="text-[var(--text-secondary)] mb-8">Gestión de proyectos y auditoría cruzada</p>
          
          <div className="space-y-4">
            <button 
              onClick={signInWithGithub}
              className="flex items-center justify-center gap-3 w-full bg-[#24292F] hover:bg-[#24292F]/90 text-white font-bold py-3 px-4 rounded-[6px] transition-all shadow-md active:scale-[0.97]"
            >
              <GitBranch size={20} />
              Iniciar sesión con GitHub
            </button>

            <button 
              onClick={signInWithGoogle}
              className="flex items-center justify-center gap-3 w-full bg-[var(--bg-column)] border border-[var(--border-column)] hover:bg-[var(--bg-page)] text-[var(--text-primary)] font-bold py-3 px-4 rounded-[6px] transition-all shadow-[var(--shadow-subtle)] active:scale-[0.97]"
            >
              <LogIn size={20} className="text-[var(--text-secondary)]" />
              Iniciar sesión con Google
            </button>

            <div className="mt-8 pt-6 border-t border-[var(--border-card)]">
              <p className="text-xs text-[var(--text-secondary)] mb-3 font-bold uppercase tracking-wider">Entorno de Pruebas</p>
              <select 
                onChange={(e) => {
                  if (e.target.value) {
                    signInWithEmail(e.target.value);
                  }
                }}
                className="w-full bg-[var(--bg-page)] border border-[var(--border-card)] text-[var(--text-primary)] text-sm rounded-[6px] p-2 focus:outline-none focus:border-[var(--btn-primary-bg)] cursor-pointer"
                defaultValue=""
              >
                <option value="" disabled>Selecciona un usuario de prueba...</option>
                <option value="jefa.tecnica@devpulse.com">👑 Jefatura (jefa.tecnica@devpulse.com)</option>
                <option value="front.senior@devpulse.com">💻 Developer Front (front.senior@devpulse.com)</option>
                <option value="back.senior@devpulse.com">⚙️ Developer Back (back.senior@devpulse.com)</option>
                <option value="qa.tester@devpulse.com">🔍 QA Tester (qa.tester@devpulse.com)</option>
                <option value="dev.junior@devpulse.com">🌱 Dev Junior (dev.junior@devpulse.com)</option>
              </select>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return null;
}
