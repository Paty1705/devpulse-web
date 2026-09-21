'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Calendar, CheckCircle, Clock } from 'lucide-react';

export default function DashboardPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  if (loading || !user) return <div className="p-8">Cargando dashboard...</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">Panel de Control</h1>
        <p className="text-[var(--text-secondary)]">Bienvenido, gestiona tus tareas y auditorías.</p>
      </header>

      {profile?.role === 'jefe' && (
        <section className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-6 mb-8 shadow-[var(--shadow-subtle)]">
          <h2 className="text-xl font-bold mb-4 text-[var(--text-primary)]">Gestión de Jefatura</h2>
          <div className="flex gap-4">
            <button 
              onClick={() => router.push('/dashboard/jefatura')}
              className="bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] px-4 py-2 rounded-[6px] font-bold hover:brightness-110 shadow-sm transition-all active:scale-[0.97]"
            >
              Crear Nuevo Proyecto
            </button>
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Tareas de Hoy */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-6 shadow-[var(--shadow-subtle)] hover:bg-[var(--bg-card-hover)] transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-[var(--badge-urgent-bg)] text-[var(--badge-urgent-text)] rounded-[6px]">
              <Clock size={24} />
            </div>
            <h3 className="font-bold text-lg text-[var(--text-primary)]">Urgente (Hoy)</h3>
          </div>
          <p className="text-[var(--text-secondary)] text-sm">No hay tareas pendientes para hoy.</p>
        </div>

        {/* Esta semana */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-6 shadow-[var(--shadow-subtle)] hover:bg-[var(--bg-card-hover)] transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-[var(--badge-bg)] text-[var(--badge-text)] rounded-[6px]">
              <Calendar size={24} />
            </div>
            <h3 className="font-bold text-lg text-[var(--text-primary)]">Esta Semana</h3>
          </div>
          <p className="text-[var(--text-secondary)] text-sm">Las tareas planificadas aparecerán aquí.</p>
        </div>

        {/* Completadas */}
        <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-6 shadow-[var(--shadow-subtle)] hover:bg-[var(--bg-card-hover)] transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-[var(--badge-sql-bg)] text-[var(--badge-sql-text)] rounded-[6px]">
              <CheckCircle size={24} />
            </div>
            <h3 className="font-bold text-lg text-[var(--text-primary)]">Completadas</h3>
          </div>
          <p className="text-[var(--text-secondary)] text-sm">0 tareas completadas recientemente.</p>
        </div>
      </div>
      
      {/* Botón temporal hacia el Kanban */}
      <div className="mt-8 flex justify-end">
        <button 
          onClick={() => router.push('/dashboard/kanban')}
          className="bg-[var(--bg-column)] border border-[var(--border-column)] text-[var(--text-primary)] px-4 py-2 rounded-[6px] font-bold hover:bg-[var(--btn-primary-bg)] hover:text-[var(--btn-primary-text)] hover:border-[var(--btn-primary-bg)] shadow-[var(--shadow-subtle)] transition-all active:scale-[0.97]"
        >
          Ir al Tablero Kanban &rarr;
        </button>
      </div>
    </div>
  );
}
