'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Cake } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/providers/AuthProvider';
import { Avatar } from '@/components/juntas/Avatar';
import { birthdayLabel, displayName, isBirthdayToday, ROLE_NAME, type Member, type ProfileInfo } from '@/lib/profile';

export default function EquipoPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [infoById, setInfoById] = useState<Record<string, ProfileInfo>>({});
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [people, details] = await Promise.all([
        supabase.from('profiles').select('id, email, role').eq('status', 'approved').order('email'),
        supabase.from('profile_info').select('*'),
      ]);
      if (cancelled) return;
      if (people.error || details.error) setError('No se pudo cargar la información del equipo.');
      setMembers((people.data ?? []) as Member[]);
      setInfoById(Object.fromEntries(((details.data ?? []) as ProfileInfo[]).map((i) => [i.user_id, i])));
      setDataLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || !user) return <div className="p-8 text-[var(--text-secondary)]">Cargando…</div>;

  const sorted = [...members].sort((a, b) => displayName(a.email, infoById[a.id]).localeCompare(displayName(b.email, infoById[b.id]), 'es'));

  return (
    <div className="max-w-[1400px] flex flex-col gap-4 sm:gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl sm:text-[1.75rem] font-bold tracking-tight text-[var(--text-primary)]">Equipo</h1>
        <p className="text-sm text-[var(--text-secondary)]">Conoce a quienes trabajan contigo.</p>
      </header>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      {dataLoading ? (
        <p className="text-sm text-[var(--text-secondary)]">Cargando…</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {sorted.map((m) => {
            const info = infoById[m.id];
            const birthday = birthdayLabel(info);
            return (
              <li key={m.id} className="flex">
                <Link href={`/dashboard/equipo/${m.id}`} className="glass-panel glass-iridescent rounded-[22px] p-5 w-full flex flex-col gap-3 hover:bg-[var(--bg-card-hover)] transition-colors">
                  <span className="flex items-center gap-3 min-w-0">
                    <Avatar email={m.email} highlight={m.id === user.id} size={52} />
                    <span className="min-w-0 flex flex-col">
                      <span className="font-semibold text-[var(--text-primary)] truncate">
                        {displayName(m.email, info)}{m.id === user.id && ' (tú)'}
                      </span>
                      <span className="text-xs text-[var(--text-secondary)]">{ROLE_NAME[m.role] ?? m.role}</span>
                    </span>
                  </span>
                  {info?.about && <span className="text-sm text-[var(--text-secondary)] line-clamp-2 break-words">{info.about}</span>}
                  {!!info?.specialties.length && (
                    <span className="flex flex-wrap gap-1.5">
                      {info.specialties.slice(0, 4).map((s) => (
                        <span key={s} className="font-mono text-[11px] px-2 py-1 rounded-[8px] chip-glass text-[var(--text-primary)] break-all">{s}</span>
                      ))}
                      {info.specialties.length > 4 && <span className="font-mono text-[11px] px-2 py-1 text-[var(--text-secondary)]">+{info.specialties.length - 4}</span>}
                    </span>
                  )}
                  {birthday && (
                    <span className="mt-auto inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                      <Cake size={14} /> {isBirthdayToday(info) ? '¡Hoy cumple años! 🎉' : birthday}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
