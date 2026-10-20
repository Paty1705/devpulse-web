'use client';

import { useAuth, RequestableRole } from '@/components/providers/AuthProvider';
import { LogIn, GitBranch } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SPECIALTIES, SPECIALTY_LABELS, Specialty } from '@/lib/specialties';

const ROLE_OPTIONS: { value: RequestableRole; label: string }[] = [
  { value: 'developer', label: 'Developer' },
  { value: 'qa', label: 'QA' },
  { value: 'pasante', label: 'Pasante' },
];

export default function Home() {
  const { user, loading, signInWithGoogle, signInWithGithub, signInWithEmail, signInWithPassword, signUpWithEmail } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState<RequestableRole>('developer');
  const [specialty, setSpecialty] = useState<Specialty | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formInfo, setFormInfo] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormInfo(null);

    if (mode === 'register') {
      if (password.length < 6) return setFormError('La contraseña debe tener al menos 6 caracteres.');
      if (password !== confirm) return setFormError('Las contraseñas no coinciden.');
      if (role === 'developer' && !specialty) return setFormError('Elige tu especialidad (frontend, backend, etc.).');
    }

    setSubmitting(true);
    if (mode === 'login') {
      const error = await signInWithPassword(email.trim(), password);
      if (error) setFormError(error === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error);
    } else {
      const { error, needsEmailConfirmation } = await signUpWithEmail(email.trim(), password, role, specialty || null);
      if (error) {
        setFormError(error);
      } else if (needsEmailConfirmation) {
        setFormInfo('Cuenta creada. Revisa tu correo para confirmarla; después un jefe tendrá que aprobar tu acceso.');
      }
      // Con sesión activa, el useEffect de arriba redirige al dashboard (pantalla de "pendiente de aprobación").
    }
    setSubmitting(false);
  };

  const inputClass =
    'w-full bg-[var(--bg-page)] border border-[var(--border-card)] text-[var(--text-primary)] text-sm rounded-[6px] p-2.5 focus:outline-none focus:border-[var(--btn-primary-bg)]';

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

            <div className="flex items-center gap-3 pt-2">
              <div className="flex-1 h-px bg-[var(--border-card)]" />
              <span className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">o con tu correo</span>
              <div className="flex-1 h-px bg-[var(--border-card)]" />
            </div>

            <div className="grid grid-cols-2 gap-1 bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[6px] p-1">
              {(['login', 'register'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => { setMode(m); setFormError(null); setFormInfo(null); }}
                  className={`py-1.5 text-sm font-bold rounded-[4px] transition-colors ${mode === m ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
                >
                  {m === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-left">
              <input
                type="email" required autoComplete="email" placeholder="Correo"
                value={email} onChange={e => setEmail(e.target.value)} className={inputClass}
              />
              <input
                type="password" required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="Contraseña"
                value={password} onChange={e => setPassword(e.target.value)} className={inputClass}
              />
              {mode === 'register' && (
                <>
                  <input
                    type="password" required autoComplete="new-password" placeholder="Confirmar contraseña"
                    value={confirm} onChange={e => setConfirm(e.target.value)} className={inputClass}
                  />
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Rol que solicitas</label>
                    <select value={role} onChange={e => setRole(e.target.value as RequestableRole)} className={inputClass}>
                      {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">Un jefe revisa tu solicitud y confirma tu rol antes de darte acceso.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">
                      Especialidad{role === 'developer' ? '' : ' (opcional)'}
                    </label>
                    <select value={specialty} onChange={e => setSpecialty(e.target.value as Specialty | '')} className={inputClass}>
                      <option value="">Selecciona...</option>
                      {SPECIALTIES.map(s => <option key={s} value={s}>{SPECIALTY_LABELS[s]}</option>)}
                    </select>
                  </div>
                </>
              )}

              {formError && <p className="text-sm text-[#EF4444]">{formError}</p>}
              {formInfo && <p className="text-sm text-[var(--btn-primary-bg)]">{formInfo}</p>}

              <button
                type="submit" disabled={submitting}
                className="w-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-bold py-3 px-4 rounded-[6px] hover:brightness-110 transition-all active:scale-[0.97] disabled:opacity-50"
              >
                {submitting ? 'Procesando...' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
              </button>
            </form>

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
