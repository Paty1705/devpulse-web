'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDateOnly, type PersonRef } from '@/lib/meetings';
import { Avatar } from '@/components/juntas/Avatar';

type TaskRow = { id: string; assigned_to: string | null; status: string; due_date: string | null; progress: number | null };
type ProgressRow = { user_id: string };

type PersonSummary = PersonRef & {
  active: number;
  done: number;
  overdue: number;
  avg: number;
  updates: number;
};

/** Avances de cada asistente desde `reviewFrom` (normalmente la junta anterior). */
export function ReviewPanel({ attendees, reviewFrom, currentUserId }: { attendees: PersonRef[]; reviewFrom: string | null; currentUserId?: string }) {
  const [rows, setRows] = useState<PersonSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const ids = attendees.map((a) => a.id).join(',');

  useEffect(() => {
    if (!ids) return;
    let cancelled = false;
    (async () => {
      const userIds = ids.split(',');
      const since = reviewFrom ? new Date(`${reviewFrom}T00:00:00`) : new Date(Date.now() - 7 * 864e5);
      let tasks: TaskRow[] | null = null;
      let progress: ProgressRow[] | null = null;
      try {
        const [taskRes, progressRes] = await Promise.all([
          supabase.from('tasks').select('id, assigned_to, status, due_date, progress').in('assigned_to', userIds),
          supabase.from('task_progress').select('user_id').in('user_id', userIds).gte('created_at', since.toISOString()),
        ]);
        tasks = taskRes.data as TaskRow[] | null;
        progress = progressRes.data as ProgressRow[] | null;
      } catch {
        // Sin conexión: se muestran en cero en lugar de quedarse cargando.
      }
      if (cancelled) return;
      const today = new Date(new Date().toDateString());
      const t = tasks ?? [];
      const p = progress ?? [];
      setRows(
        attendees.map((a) => {
          const mine = t.filter((x) => x.assigned_to === a.id);
          const active = mine.filter((x) => x.status !== 'completed');
          return {
            ...a,
            active: active.length,
            done: mine.length - active.length,
            overdue: active.filter((x) => x.due_date && new Date(x.due_date) < today).length,
            avg: active.length ? Math.round(active.reduce((s, x) => s + (x.progress ?? 0), 0) / active.length) : 0,
            updates: p.filter((x) => x.user_id === a.id).length,
          };
        }),
      );
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // `attendees` cambia de identidad en cada render; `ids` resume su contenido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, reviewFrom]);

  const totals = rows.reduce((acc, r) => ({ updates: acc.updates + r.updates, active: acc.active + r.active, overdue: acc.overdue + r.overdue }), { updates: 0, active: 0, overdue: 0 });

  return (
    <section className="glass-panel glass-iridescent rounded-[28px] p-5 flex flex-col gap-4 min-w-0">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Avances desde la última junta</h2>
        <span className="font-mono text-xs text-[var(--text-secondary)]">desde {formatDateOnly(reviewFrom)}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          ['avances', totals.updates, 'var(--ok-text)'],
          ['activas', totals.active, 'var(--text-primary)'],
          ['vencidas', totals.overdue, 'var(--prio-alta-text)'],
        ].map(([label, value, color]) => (
          <div key={label as string} className="chip-glass rounded-[16px] p-3 flex flex-col">
            <span className="font-display text-2xl font-bold leading-none" style={{ color: color as string }}>{loaded ? value : '—'}</span>
            <span className="text-xs text-[var(--text-secondary)] mt-1">{label}</span>
          </div>
        ))}
      </div>

      {!loaded ? (
        <p className="text-sm text-[var(--text-secondary)]">Cargando…</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li key={r.id} className="chip-glass rounded-[18px] p-3 flex flex-col gap-2">
              <span className="flex items-center gap-2.5">
                <Avatar email={r.email} highlight={r.id === currentUserId} size={32} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">{r.email.split('@')[0]}</span>
                  <span className="block font-mono text-[11px] text-[var(--text-secondary)]">
                    {r.updates} {r.updates === 1 ? 'avance' : 'avances'} · {r.active} activas
                    {r.overdue > 0 && <span style={{ color: 'var(--prio-alta-text)', fontWeight: 700 }}> · {r.overdue} vencidas</span>}
                  </span>
                </span>
                <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{r.avg}%</span>
              </span>
              <span className="block h-1.5 rounded-full surface-card overflow-hidden">
                <span className="block h-full rounded-full" style={{ width: `${r.avg}%`, background: 'linear-gradient(90deg, var(--accent-2), var(--accent))' }} />
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link href="/dashboard/kanban" className="chip-glass min-h-11 rounded-[14px] flex items-center justify-center text-[13px] font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors">
        Ver tablero
      </Link>
    </section>
  );
}
