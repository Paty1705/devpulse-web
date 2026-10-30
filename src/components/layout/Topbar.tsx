'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Bell, Check, ExternalLink, Moon, Settings, Sun } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { supabase } from '@/lib/supabase';

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
};

const TITLES: [prefix: string, title: string][] = [
  ['/dashboard/jefatura/usuarios', 'Usuarios'],
  ['/dashboard/jefatura/versiones', 'Versiones'],
  ['/dashboard/jefatura', 'Proyectos'],
  ['/dashboard/kanban', 'Tablero'],
  ['/dashboard/agenda', 'Agenda'],
  ['/dashboard', 'Panel de control'],
];

const subscribeNoop = () => () => {};

function initials(email?: string | null) {
  if (!email) return '··';
  const name = email.split('@')[0].replace(/[^a-zA-Z]/g, '');
  return (name.slice(0, 2) || '··').toUpperCase();
}

const iconButton =
  'glass-panel relative w-12 h-12 rounded-[16px] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors active:scale-[0.97]';

export function Topbar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { preferences, updatePreferences } = usePreferences();
  // Evita diferencias de hidratación: el servidor no conoce el tema del sistema.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      console.error('Error al obtener notificaciones:', error);
      return;
    }
    setNotifications(data ?? []);
    setUnreadCount((data ?? []).filter((n) => !n.read).length);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      await fetchNotifications();
    })();
    const channel = supabase
      .channel('notifications_channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload) => {
        setNotifications((prev) => [payload.new as Notification, ...prev]);
        setUnreadCount((prev) => prev + 1);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) setIsNotifOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (n: Notification) => {
    if (!n.read) {
      await supabase.from('notifications').update({ read: true }).eq('id', n.id);
      setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    if (n.link) {
      setIsNotifOpen(false);
      router.push(n.link);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const isDark = mounted
    ? preferences.theme === 'dark' || (preferences.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    : false;

  const title = TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? 'DevPulse';
  const today = mounted
    ? new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
    : '';

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      {/* Solo la sección y la fecha: cada página pone su propio <h1>. */}
      <div className="flex flex-col gap-0.5">
        <span className="font-mono text-xs text-[var(--text-secondary)]">devpulse / {title.toLowerCase()}</span>
        <span className="font-display text-lg font-semibold text-[var(--text-primary)] first-letter:uppercase min-h-7">{today}</span>
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              aria-label={unreadCount > 0 ? `Notificaciones, ${unreadCount} sin leer` : 'Notificaciones'}
              aria-expanded={isNotifOpen}
              className={iconButton}
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[#E11D48] text-white text-[11px] font-bold flex items-center justify-center shadow-[0_0_10px_rgba(225,29,72,0.6)]">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[18px] shadow-[var(--shadow-hover)] overflow-hidden z-50 animate-fade-in-up">
                <div className="px-4 py-3 border-b border-[var(--border-column)] flex justify-between items-center">
                  <h2 className="font-bold text-[var(--text-primary)] text-sm">Notificaciones</h2>
                  {unreadCount > 0 && (
                    <button onClick={markAllAsRead} className="text-xs text-[var(--btn-primary-bg)] hover:brightness-110 flex items-center gap-1 font-bold">
                      <Check size={12} /> Marcar leídas
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-[var(--text-secondary)] text-sm">No tienes notificaciones</div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => markAsRead(n)}
                        className={`w-full text-left p-4 border-b border-[var(--border-column)] last:border-b-0 transition-colors ${n.read ? 'opacity-70 hover:bg-[var(--bg-page)]' : 'bg-[var(--btn-primary-bg)]/5 hover:bg-[var(--btn-primary-bg)]/10'}`}
                      >
                        <span className="flex justify-between items-start mb-1">
                          <span className={`text-sm font-bold ${n.read ? 'text-[var(--text-primary)]' : 'text-[var(--btn-primary-bg)]'}`}>{n.title}</span>
                          {!n.read && <span className="w-2 h-2 bg-[var(--btn-primary-bg)] rounded-full mt-1.5 shadow-[0_0_8px_var(--btn-primary-bg)]" />}
                        </span>
                        <span className="block text-xs text-[var(--text-secondary)] mb-2 line-clamp-2">{n.message}</span>
                        {n.link && (
                          <span className="text-[10px] text-[var(--btn-primary-bg)] flex items-center gap-1 font-bold">
                            Ver detalles <ExternalLink size={10} />
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => updatePreferences({ theme: isDark ? 'light' : 'dark' })}
          aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className={iconButton}
        >
          {isDark ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <button onClick={onOpenSettings} aria-label="Preferencias" className={`${iconButton} lg:hidden`}>
          <Settings size={20} />
        </button>

        <span
          title={user?.email ?? undefined}
          className="tile-3d w-12 h-12 rounded-[16px] flex items-center justify-center font-display font-bold text-white"
          style={{ background: 'linear-gradient(150deg, var(--accent), var(--accent-2))' }}
        >
          {initials(user?.email)}
        </span>
      </div>
    </header>
  );
}
