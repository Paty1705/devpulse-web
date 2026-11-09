'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Activity, BookOpen, CalendarDays, FolderKanban, GitBranch, LayoutGrid,
  LogOut, Mic, Settings, SquareKanban, Users, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { supabase } from '@/lib/supabase';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Quién lo ve. Por defecto, todos. */
  access?: 'manager' | 'jefe';
  /** Pantallas del rediseño que todavía no existen. */
  soon?: boolean;
};

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutGrid },
  { href: '/dashboard/kanban', label: 'Tablero', icon: SquareKanban },
  { href: '/dashboard/agenda', label: 'Agenda', icon: CalendarDays },
  { href: '/dashboard/juntas', label: 'Juntas', icon: Mic, soon: true },
  { href: '/dashboard/recursos', label: 'Recursos', icon: BookOpen, soon: true },
  { href: '/dashboard/jefatura', label: 'Proyectos', icon: FolderKanban, access: 'manager' },
  { href: '/dashboard/jefatura/versiones', label: 'Versiones', icon: GitBranch, access: 'manager' },
  { href: '/dashboard/jefatura/usuarios', label: 'Usuarios', icon: Users, access: 'jefe' },
];

const ROLE_LABEL: Record<string, string> = {
  jefe: 'jefatura',
  developer: 'desarrollo',
  qa: 'qa',
  pasante: 'pasante',
  empleado: 'empleado',
  usuario: 'usuario',
};

function isActive(pathname: string, href: string) {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/dashboard/jefatura') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const pathname = usePathname();
  const { user, profile, signOut } = useAuth();
  const [isLeader, setIsLeader] = useState(false);
  const [stats, setStats] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: led }, { data: mine }] = await Promise.all([
        supabase.from('projects').select('id').eq('leader_id', user.id).limit(1),
        supabase.from('tasks').select('status').eq('assigned_to', user.id),
      ]);
      if (cancelled) return;
      setIsLeader(!!led?.length);
      if (mine) setStats({ done: mine.filter((t) => t.status === 'completed').length, total: mine.length });
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isJefe = profile?.role === 'jefe';
  const canSee = (item: NavItem) =>
    !item.access || (item.access === 'jefe' ? isJefe : isJefe || isLeader);
  const percent = stats && stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <aside
      aria-label="Navegación principal"
      className="glass-panel glass-iridescent thick-iridescent rounded-[30px] p-4 flex flex-col gap-5 w-full lg:w-[248px] lg:shrink-0 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:overflow-y-auto no-scrollbar"
    >
      <div className="flex items-center gap-3 px-2 pt-2">
        <span className="tile-3d w-12 h-12 rounded-[16px] flex items-center justify-center" style={{ background: 'linear-gradient(150deg, var(--accent-2), var(--accent))' }}>
          <Activity size={24} strokeWidth={2.4} className="text-white" />
        </span>
        <span className="flex flex-col">
          <span className="font-display font-bold text-xl tracking-tight text-[var(--text-primary)]">DevPulse</span>
          <span className="font-mono text-[11px] text-[var(--text-secondary)]">área de sistemas</span>
        </span>
      </div>

      <nav className="flex flex-col gap-1.5">
        {NAV.filter(canSee).map((item) => {
          const Icon = item.icon;
          if (item.soon) {
            return (
              <span
                key={item.href}
                aria-disabled="true"
                title="Disponible en la siguiente fase"
                className="flex items-center gap-3 min-h-[42px] px-3.5 rounded-[16px] text-[15px] font-medium text-[var(--text-secondary)] opacity-60 cursor-default"
              >
                <Icon size={20} />
                <span className="flex-1">{item.label}</span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-[8px] bg-[var(--bg-page)]">pronto</span>
              </span>
            );
          }
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 min-h-[42px] px-3.5 rounded-[16px] text-[15px] transition-colors ${
                active
                  ? 'nav-active font-semibold'
                  : 'font-medium text-[var(--text-primary)] hover:bg-[var(--bg-page)]'
              }`}
            >
              <Icon size={20} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Widget estilo terminal con el avance personal */}
      <div className="[@media(max-height:760px)]:hidden rounded-[20px] p-4 font-mono text-xs leading-relaxed bg-[#0A0F1E]/85 text-[#A9B4CC] shadow-[inset_0_2px_6px_rgba(0,0,0,0.5)]">
        <div className="flex gap-1.5 mb-2.5" aria-hidden="true">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F87171]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#FBBF24]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#34D399]" />
        </div>
        <div><span className="text-[#5EEAD4]">$</span> devpulse --estado</div>
        <div className="text-[#E2E8F0]">rol: {ROLE_LABEL[profile?.role ?? ''] ?? '—'}</div>
        <div className="text-[#E2E8F0]">
          {stats ? `tareas: ${stats.done}/${stats.total} hechas` : 'cargando…'}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex-1 h-2 rounded-full bg-[#232B3B] overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${percent}%`, background: 'linear-gradient(90deg, var(--accent-2), var(--accent))' }} />
          </div>
          <span className="text-[#E2E8F0]">{percent}%</span>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-1.5">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-3 min-h-[42px] px-3.5 rounded-[16px] text-[15px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-page)] transition-colors text-left"
        >
          <Settings size={20} />
          Preferencias
        </button>
        {user && (
          <button
            onClick={signOut}
            className="flex items-center gap-3 min-h-[42px] px-3.5 rounded-[16px] text-[15px] font-medium text-[var(--text-secondary)] hover:bg-red-500/10 hover:text-red-500 transition-colors text-left"
          >
            <LogOut size={20} />
            Cerrar sesión
          </button>
        )}
      </div>
    </aside>
  );
}
