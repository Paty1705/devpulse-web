'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from 'next/navigation';
import { ArrowLeft, UserCheck, UserX, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Profile = {
  id: string;
  email: string;
  role: string;
  status: 'pending' | 'approved' | 'rejected';
};

const ROLE_OPTIONS = ['developer', 'qa', 'pasante', 'jefe'];
const ROLE_LABELS: Record<string, string> = {
  jefe: 'Jefe', developer: 'Developer', qa: 'QA', pasante: 'Pasante',
};

export default function UsuariosPage() {
  const { profile, user } = useAuth();
  const router = useRouter();
  const isJefe = profile?.role === 'jefe';

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [roleChoice, setRoleChoice] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, email, role, status').order('email');
    setProfiles(data || []);
    setLoaded(true);
  }, []);

  useEffect(() => { (async () => { await fetchProfiles(); })(); }, [fetchProfiles]);

  if (!loaded) {
    return <div className="p-8 text-[var(--text-secondary)]">Cargando...</div>;
  }

  if (profile && !isJefe) {
    return (
      <div className="p-8 bg-red-50 text-red-600 rounded-lg max-w-2xl mx-auto mt-8 border border-red-200">
        <h2 className="text-xl font-bold mb-2">Acceso Denegado</h2>
        <p>Esta vista es exclusiva para jefatura.</p>
        <button onClick={() => router.push('/dashboard')} className="mt-4 underline">Volver al panel</button>
      </div>
    );
  }

  const pending = profiles.filter(p => p.status === 'pending');
  const others = profiles.filter(p => p.status !== 'pending');

  const approve = async (p: Profile) => {
    setBusyId(p.id);
    const newRole = roleChoice[p.id] || 'pasante';
    const { error } = await supabase.from('profiles').update({ status: 'approved', role: newRole }).eq('id', p.id);
    setBusyId(null);
    if (error) {
      alert('Error al aprobar: ' + error.message);
    } else {
      fetchProfiles();
    }
  };

  const reject = async (p: Profile) => {
    setBusyId(p.id);
    const { error } = await supabase.from('profiles').update({ status: 'rejected' }).eq('id', p.id);
    setBusyId(null);
    if (error) {
      alert('Error al rechazar: ' + error.message);
    } else {
      fetchProfiles();
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <header className="mb-8">
        <button
          onClick={() => router.push('/dashboard/jefatura')}
          className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors self-start text-sm font-bold bg-[var(--bg-column)] border border-[var(--border-column)] px-3 py-1.5 rounded-[6px] shadow-[var(--shadow-subtle)] hover:border-[var(--btn-primary-bg)] active:scale-[0.97] mb-4"
        >
          <ArrowLeft size={16} />
          Volver a Proyectos
        </button>
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">Usuarios</h1>
        <p className="text-[var(--text-secondary)] mt-1">
          Cuentas nuevas creadas por Google/GitHub quedan pendientes hasta que las apruebes.
        </p>
      </header>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
          Pendientes de aprobación {pending.length > 0 && `(${pending.length})`}
        </h2>
        {pending.length === 0 ? (
          <div className="text-center py-10 text-[var(--text-secondary)] border-2 border-dashed border-[var(--border-column)] rounded-[12px] bg-[var(--bg-column)]">
            <Users size={36} className="mx-auto mb-3 opacity-50" />
            <p>No hay cuentas esperando aprobación.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-4 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-4 shadow-[var(--shadow-subtle)]">
                <span className="font-medium text-[var(--text-primary)]">{p.email}</span>
                <div className="flex items-center gap-2">
                  <select
                    value={roleChoice[p.id] || 'pasante'}
                    onChange={e => setRoleChoice(prev => ({ ...prev, [p.id]: e.target.value }))}
                    className="bg-[var(--bg-page)] border border-[var(--border-column)] text-[var(--text-primary)] rounded-[6px] px-2 py-1.5 text-sm"
                  >
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <button
                    disabled={busyId === p.id}
                    onClick={() => approve(p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-bold bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:brightness-110 transition-all disabled:opacity-50"
                  >
                    <UserCheck size={14} /> Aprobar
                  </button>
                  <button
                    disabled={busyId === p.id}
                    onClick={() => reject(p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-bold text-[#EF4444] hover:text-white hover:bg-[#EF4444] bg-[var(--bg-page)] border border-[#EF4444]/30 transition-colors disabled:opacity-50"
                  >
                    <UserX size={14} /> Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-3">Todos los usuarios</h2>
        <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] shadow-[var(--shadow-subtle)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--bg-column)] border-b border-[var(--border-column)] text-left text-[var(--text-secondary)] uppercase text-xs tracking-wider">
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {others.map(p => (
                <tr key={p.id} className="border-b border-[var(--border-column)] last:border-b-0">
                  <td className="px-4 py-3 text-[var(--text-primary)]">{p.email}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{ROLE_LABELS[p.role] || p.role}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded-[4px] ${p.status === 'approved' ? 'bg-[var(--badge-sql-bg)] text-[var(--badge-sql-text)]' : 'bg-[var(--badge-locked-bg)] text-[var(--badge-locked-text)]'}`}>
                      {p.status === 'approved' ? 'Aprobado' : 'Rechazado'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.status === 'rejected' && p.id !== user?.id && (
                      <button
                        disabled={busyId === p.id}
                        onClick={() => approve(p)}
                        className="text-xs font-bold text-[var(--btn-primary-bg)] hover:underline disabled:opacity-50"
                      >
                        Re-aprobar como {ROLE_LABELS[roleChoice[p.id] || 'pasante']}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
