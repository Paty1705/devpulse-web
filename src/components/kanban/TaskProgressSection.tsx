'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, FlaskConical, TrendingUp, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/providers/AuthProvider';

type ProgressEntry = {
  id: string;
  percent: number;
  note: string;
  created_at: string;
  user_id: string;
  author: { email: string } | null;
};

type TestDate = {
  id: string;
  test_date: string;
  result: 'pendiente' | 'aprobada' | 'fallida';
  tester_id: string | null;
};

const RESULT_LABEL: Record<TestDate['result'], string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  fallida: 'Fallida',
};

const RESULT_STYLE: Record<TestDate['result'], React.CSSProperties> = {
  pendiente: { background: 'var(--prio-media-bg)', color: 'var(--prio-media-text)' },
  aprobada: { background: 'var(--prio-baja-bg)', color: 'var(--prio-baja-text)' },
  fallida: { background: 'var(--prio-alta-bg)', color: 'var(--prio-alta-text)' },
};

const dateTime = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// test_date es DATE (sin hora): se arma en hora local para que no se corra un día.
function formatDateOnly(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d));
}

type Props = {
  taskId: string;
  /** Persona asignada, líder del proyecto o jefe (lo mismo que exige la RLS). */
  canManage: boolean;
  /** Para refrescar el tablero cuando cambia el % de la tarea. */
  onChanged?: () => void;
};

export function TaskProgressSection({ taskId, canManage, onChanged }: Props) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [tests, setTests] = useState<TestDate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const [percent, setPercent] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [newTestDate, setNewTestDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [progressRes, testRes] = await Promise.all([
      supabase
        .from('task_progress')
        .select('id, percent, note, created_at, user_id, author:profiles!task_progress_user_id_fkey(email)')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false }),
      supabase
        .from('task_test_dates')
        .select('id, test_date, result, tester_id')
        .eq('task_id', taskId)
        .order('test_date', { ascending: true }),
    ]);
    // Si las tablas no existen (base sin migrar), la sección se oculta sola.
    if (progressRes.error?.code === '42P01' || testRes.error?.code === '42P01') {
      setUnavailable(true);
    }
    setEntries((progressRes.data ?? []) as unknown as ProgressEntry[]);
    setTests((testRes.data ?? []) as TestDate[]);
    setLoaded(true);
  }, [taskId]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  if (unavailable) return null;

  const current = entries[0]?.percent ?? 0;
  const value = percent ?? current;
  const canSetResult = (t: TestDate) => canManage || t.tester_id === user?.id;

  const saveProgress = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('task_progress').insert({
      task_id: taskId,
      user_id: user.id,
      percent: value,
      note: note.trim(),
    });
    setSaving(false);
    if (err) {
      setError('No se pudo guardar el avance. Revisa que seas responsable de la tarea.');
      return;
    }
    setNote('');
    setPercent(null);
    await load();
    onChanged?.();
  };

  const deleteProgress = async (id: string) => {
    const { error: err } = await supabase.from('task_progress').delete().eq('id', id);
    if (err) {
      setError('No se pudo borrar el avance.');
      return;
    }
    await load();
    onChanged?.();
  };

  const addTestDate = async () => {
    if (!newTestDate) return;
    setError(null);
    const { error: err } = await supabase.from('task_test_dates').insert({ task_id: taskId, test_date: newTestDate });
    if (err) {
      setError('No se pudo agregar la fecha de prueba.');
      return;
    }
    setNewTestDate('');
    await load();
  };

  const setResult = async (id: string, result: TestDate['result']) => {
    const { error: err } = await supabase.from('task_test_dates').update({ result }).eq('id', id);
    if (err) {
      setError('No se pudo actualizar el resultado de la prueba.');
      return;
    }
    await load();
  };

  const removeTestDate = async (id: string) => {
    const { error: err } = await supabase.from('task_test_dates').delete().eq('id', id);
    if (err) {
      setError('No se pudo quitar la fecha de prueba.');
      return;
    }
    await load();
  };

  return (
    <section className="space-y-5">
      {/* Avance */}
      <div>
        <h3 className="font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <TrendingUp size={18} /> Avance
        </h3>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-2.5 rounded-full bg-[var(--bg-page)] overflow-hidden">
            <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${current}%`, background: 'linear-gradient(90deg, var(--accent-2), var(--accent))' }} />
          </div>
          <span className="font-mono text-sm font-bold text-[var(--text-primary)]">{current}%</span>
        </div>

        {canManage && (
          <div className="chip-glass rounded-[16px] p-4 space-y-3 mb-4 border border-[var(--border-card)]">
            <label className="block">
              <span className="flex justify-between text-sm text-[var(--text-primary)] mb-1.5">
                <span className="font-semibold">Registrar avance</span>
                <span className="font-mono font-bold">{value}%</span>
              </span>
              <input
                type="range" min={0} max={100} step={5}
                value={value}
                onChange={(e) => setPercent(Number(e.target.value))}
                className="w-full accent-[var(--btn-primary-bg)]"
              />
            </label>
            <label className="block">
              <span className="block text-sm text-[var(--text-primary)] mb-1.5">¿Qué hiciste?</span>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. Terminé las políticas de lectura, faltan las de escritura"
                className="w-full rounded-[12px] px-3 py-2 text-sm surface-card border border-[var(--border-card)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-[var(--btn-primary-bg)] resize-y"
              />
            </label>
            <button
              onClick={saveProgress}
              disabled={saving || (percent === null && !note.trim())}
              className="w-full min-h-11 rounded-[12px] font-semibold text-sm bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
            >
              {saving ? 'Guardando…' : 'Guardar avance'}
            </button>
          </div>
        )}

        {!loaded ? (
          <p className="text-sm text-[var(--text-secondary)]">Cargando historial…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] italic">Aún no hay avances registrados.</p>
        ) : (
          <ol className="space-y-0">
            {entries.map((e, i) => (
              <li key={e.id} className="flex gap-3">
                <span className="flex flex-col items-center pt-1" aria-hidden="true">
                  <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
                  {i < entries.length - 1 && <span className="flex-1 w-0.5 bg-[var(--border-card)] my-1" />}
                </span>
                <span className="flex-1 pb-4 min-w-0">
                  <span className="flex justify-between gap-2 font-mono text-xs text-[var(--text-secondary)]">
                    <span className="truncate">{dateTime.format(new Date(e.created_at))} · {e.author?.email.split('@')[0] ?? '—'}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-bold text-[var(--text-primary)]">{e.percent}%</span>
                      {e.user_id === user?.id && (
                        <button onClick={() => deleteProgress(e.id)} aria-label="Borrar este avance" className="p-1 rounded-[6px] hover:bg-red-500/10 hover:text-red-500 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </span>
                  </span>
                  {e.note && <span className="block text-sm text-[var(--text-primary)] mt-0.5">{e.note}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Fechas de prueba */}
      <div>
        <h3 className="font-bold text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <FlaskConical size={18} /> Fechas de prueba
        </h3>
        {loaded && tests.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)] italic mb-3">Sin fechas de prueba.</p>
        )}
        <ul className="space-y-2 mb-3">
          {tests.map((t) => (
            <li key={t.id} className="chip-glass flex flex-wrap items-center gap-2 rounded-[12px] px-3 py-2 border border-[var(--border-card)]">
              <CalendarCheck size={16} className="text-[var(--text-secondary)]" />
              <span className="flex-1 min-w-[120px] text-sm font-semibold text-[var(--text-primary)] first-letter:uppercase">{formatDateOnly(t.test_date)}</span>
              {canSetResult(t) ? (
                <select
                  value={t.result}
                  onChange={(e) => setResult(t.id, e.target.value as TestDate['result'])}
                  aria-label="Resultado de la prueba"
                  className="text-xs font-semibold rounded-[8px] px-2 py-1 border-0 outline-none cursor-pointer"
                  style={RESULT_STYLE[t.result]}
                >
                  {(Object.keys(RESULT_LABEL) as TestDate['result'][]).map((r) => (
                    <option key={r} value={r}>{RESULT_LABEL[r]}</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs font-semibold rounded-[8px] px-2 py-1" style={RESULT_STYLE[t.result]}>{RESULT_LABEL[t.result]}</span>
              )}
              {canManage && (
                <button onClick={() => removeTestDate(t.id)} aria-label="Quitar fecha de prueba" className="p-1 rounded-[6px] text-[var(--text-secondary)] hover:bg-red-500/10 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
        {canManage && (
          <div className="flex gap-2">
            <label className="sr-only" htmlFor={`test-date-${taskId}`}>Nueva fecha de prueba</label>
            <input
              id={`test-date-${taskId}`}
              type="date"
              value={newTestDate}
              onChange={(e) => setNewTestDate(e.target.value)}
              className="flex-1 rounded-[12px] px-3 py-2 text-sm surface-card border border-[var(--border-card)] text-[var(--text-primary)] outline-none focus:border-[var(--btn-primary-bg)]"
            />
            <button
              onClick={addTestDate}
              disabled={!newTestDate}
              className="px-4 rounded-[12px] text-sm font-semibold chip-glass border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Agregar
            </button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </section>
  );
}
