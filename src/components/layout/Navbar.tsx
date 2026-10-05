'use client';

import { useAuth } from '@/components/providers/AuthProvider';
import { LogOut, Settings, User, Bell, Check, ExternalLink } from 'lucide-react';
import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { SettingsModal } from '@/components/layout/SettingsModal';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
};

const subscribeNoop = () => () => {};

export function Navbar() {
  const { user, profile, signOut } = useAuth();
  const { preferences, updatePreferences } = usePreferences();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // Evita mismatches de hidratación: en el servidor y en el primer render
  // del cliente devuelve false, y recién después pasa a true.
  const mounted = useSyncExternalStore(subscribeNoop, () => true, () => false);

  // Notificaciones
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const fetchNotifications = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('notifications').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(20);
      if (error) {
        console.error("Error al obtener notificaciones:", error);
      }
      if (data && !error) {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.read).length);
      }
    } catch(e) {
      console.error("Excepción en fetchNotifications:", e);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      (async () => {
        await fetchNotifications();
      })();

      const channel = supabase.channel('notifications_channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, payload => {
          setNotifications(prev => [payload.new as Notification, ...prev]);
          setUnreadCount(prev => prev + 1);
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, fetchNotifications]);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAsRead = async (n: Notification) => {
    if (!n.read) {
      await supabase.from('notifications').update({ read: true }).eq('id', n.id);
      setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, read: true } : item));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    if (n.link) {
      setIsNotifOpen(false);
      router.push(n.link);
    }
  };

  const markAllAsRead = async () => {
    await supabase.from('notifications').update({ read: true }).eq('user_id', user!.id).eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const isDark = mounted 
    ? (preferences.theme === 'dark' || (preferences.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) 
    : false;


  return (
    <>
      <nav className="border-b border-[var(--border-column)] bg-[var(--bg-column)] backdrop-blur-[14px] px-6 py-4 flex items-center justify-between shadow-[var(--shadow-subtle)] sticky top-0 z-40">
        <div className="font-bold text-xl text-[var(--text-primary)]">
          DevPulse Web
        </div>
        
        <div className="flex items-center gap-6">
          {profile && (
            <div className="flex items-center gap-2 bg-[var(--bg-page)] px-3 py-1.5 rounded-full border border-[var(--border-card)] shadow-[var(--shadow-subtle)]">
              <User size={16} className="text-[var(--btn-primary-bg)]" />
              <span className="text-xs font-bold text-[var(--text-primary)]">{profile.role.toUpperCase()}</span>
            </div>
          )}
          
          <div className="text-sm font-medium text-[var(--text-secondary)] hidden md:block">
            {user?.email}
          </div>

          <div className="flex items-center gap-3 border-l border-[var(--border-column)] pl-4">
            
            {/* Notificaciones */}
            {user && (
              <div className="relative" ref={notifRef}>
                <button 
                  onClick={() => setIsNotifOpen(!isNotifOpen)}
                  className="p-2 hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-[6px] transition-colors active:scale-[0.97] relative"
                  title="Notificaciones"
                >
                  <Bell size={20} />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-[#F87171] rounded-full border-2 border-[var(--bg-column)] animate-pulse"></span>
                  )}
                </button>

                {isNotifOpen && (
                  <div className="absolute right-0 mt-2 w-80 bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[12px] shadow-[var(--shadow-hover)] overflow-hidden z-50 animate-fade-in-up">
                    <div className="px-4 py-3 border-b border-[var(--border-column)] bg-[var(--bg-column)] flex justify-between items-center">
                      <h3 className="font-bold text-[var(--text-primary)] text-sm">Notificaciones</h3>
                      {unreadCount > 0 && (
                        <button onClick={markAllAsRead} className="text-xs text-[var(--btn-primary-bg)] hover:brightness-110 flex items-center gap-1 font-bold">
                          <Check size={12} /> Marcar leídas
                        </button>
                      )}
                    </div>
                    
                    <div className="max-h-80 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-8 text-center text-[var(--text-secondary)] text-sm">
                          No tienes notificaciones
                        </div>
                      ) : (
                        notifications.map(n => (
                          <div 
                            key={n.id} 
                            onClick={() => markAsRead(n)}
                            className={`p-4 border-b border-[var(--border-column)] last:border-b-0 cursor-pointer transition-colors ${n.read ? 'opacity-70 hover:bg-[var(--bg-page)]' : 'bg-[var(--btn-primary-bg)]/5 hover:bg-[var(--btn-primary-bg)]/10'}`}
                          >
                            <div className="flex justify-between items-start mb-1">
                              <span className={`text-sm font-bold ${n.read ? 'text-[var(--text-primary)]' : 'text-[var(--btn-primary-bg)]'}`}>
                                {n.title}
                              </span>
                              {!n.read && <span className="w-2 h-2 bg-[var(--btn-primary-bg)] rounded-full mt-1.5 shadow-[0_0_8px_var(--btn-primary-bg)]"></span>}
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] mb-2 line-clamp-2">
                              {n.message}
                            </p>
                            {n.link && (
                              <span className="text-[10px] text-[var(--btn-primary-bg)] flex items-center gap-1 font-bold">
                                Ver detalles <ExternalLink size={10} />
                              </span>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Theme Toggle Capsule */}
            <button 
              onClick={() => updatePreferences({ theme: preferences.theme === 'dark' ? 'light' : 'dark' })}
              className="relative w-[54px] h-[28px] rounded-full border border-[var(--border-column)] bg-[var(--bg-page)] shadow-[var(--shadow-subtle)] overflow-hidden flex items-center px-1 transition-colors duration-300 active:scale-[0.95]"
              title="Alternar Tema"
            >
              <div className="w-full flex justify-between px-1.5 absolute inset-0 items-center pointer-events-none">
                <span className="text-[10px]">☀️</span>
                <span className="text-[10px]">🌙</span>
              </div>
              <div className={`w-[20px] h-[20px] bg-[var(--btn-primary-bg)] rounded-full shadow-md z-10 transition-transform duration-[250ms] cubic-bezier(0.4, 0, 0.2, 1) ${isDark ? 'transform translate-x-[24px]' : 'transform translate-x-0'}`} />
            </button>

            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-[6px] transition-colors active:scale-[0.97]"
              title="Preferencias"
            >
              <Settings size={20} />
            </button>

            {user && (
              <button 
                onClick={signOut}
                className="p-2 hover:bg-red-500/10 hover:text-red-400 text-[var(--text-secondary)] rounded-[6px] transition-colors active:scale-[0.97]"
                title="Cerrar sesión"
              >
                <LogOut size={20} />
              </button>
            )}
          </div>
        </div>
      </nav>

      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}
