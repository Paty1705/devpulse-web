'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ChevronLeft, Download, FlaskConical, Printer, TrendingUp, type LucideIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/providers/AuthProvider';
import { Avatar } from '@/components/juntas/Avatar';
import { prioStyle, shortName } from '@/lib/meetings';
import { parseDate, toISODate } from '@/lib/recurrence';

type Person = { id: string; email: string; role: string };
type Task = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  assigned_to: string | null;
  project_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  progress: number | null;
};
type ProgressEntry = { id: string; task_id: string; user_id: string; percent: number; note: string; evidence_url: string | null; created_at: string };
type TestEntry = { id: string; task_id: string; test_date: string; result: 'pendiente' | 'aprobada' | 'fallida' };

type Preset = 'semana' | 'semana_pasada' | 'mes' | 'mes_pasado' | 'rango';
const PRESETS: { value: Preset; label: string }[] = [
  { value: 'semana', label: 'Esta semana' },
  { value: 'semana_pasada', label: 'Semana pasada' },
  { value: 'mes', label: 'Este mes' },
  { value: 'mes_pasado', label: 'Mes pasado' },
  { value: 'rango', label: 'Fechas' },
];

/** Rango [desde, hasta] en YYYY-MM-DD; las semanas empiezan en lunes. */
function presetRange(preset: Exclude<Preset, 'rango'>, now = new Date()): [string, string] {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'semana' || preset === 'semana_pasada') {
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7) - (preset === 'semana_pasada' ? 7 : 0));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return [toISODate(monday), toISODate(sunday)];
  }
  const offset = preset === 'mes_pasado' ? -1 : 0;
  return [toISODate(new Date(d.getFullYear(), d.getMonth() + offset, 1)), toISODate(new Date(d.getFullYear(), d.getMonth() + offset + 1, 0))];
}

/** Inicio y fin del rango como instantes locales (fin = 23:59:59.999). */
function bounds(from: string, to: string) {
  const start = parseDate(from);
  const end = parseDate(to);
  end.setHours(23, 59, 59, 999);
  return [start, end] as const;
}

const dayFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const dayTimeFmt = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const rangeFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

type PersonStats = {
  person: Person;
  completed: Task[];
  onTime: number;
  late: number;
  noDue: number;
  progress: ProgressEntry[];
  open: Task[];
  overdue: Task[];
  avgOpenProgress: number | null;
  testsOk: number;
  testsFail: number;
};

export default function ReportesPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const isJefe = profile?.role === 'jefe';

  const [preset, setPreset] = useState<Preset>('semana');
  const [[from, to], setRange] = useState<[string, string]>(() => presetRange('semana'));
  const [personId, setPersonId] = useState<string>('todos');

  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Record<string, string>>({});
  const [tasks, setTasks] = useState<Task[]>([]);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [tests, setTests] = useState<TestEntry[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  // Datos que no dependen del periodo.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: profs }, { data: projs }, { data: taskRows, error: taskErr }] = await Promise.all([
        supabase.from('profiles').select('id, email, role').eq('status', 'approved').order('email'),
        supabase.from('projects').select('id, name'),
        supabase.from('tasks').select('id, title, status, priority, assigned_to, project_id, due_date, completed_at, progress'),
      ]);
      if (taskErr) setError('No se pudieron cargar las tareas. Revisa que el script supabase/reportes.sql esté aplicado.');
      setPeople((profs ?? []) as Person[]);
      setProjects(Object.fromEntries((projs ?? []).map((p) => [p.id, p.name])));
      setTasks((taskRows ?? []) as Task[]);
    })();
  }, [user]);

  // Avances y pruebas del periodo.
  const loadPeriod = useCallback(async () => {
    setDataLoading(true);
    const [start, end] = bounds(from, to);
    const [{ data: prog }, { data: tst }] = await Promise.all([
      supabase
        .from('task_progress')
        .select('id, task_id, user_id, percent, note, evidence_url, created_at')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false }),
      supabase.from('task_test_dates').select('id, task_id, test_date, result').gte('test_date', from).lte('test_date', to),
    ]);
    setProgress((prog ?? []) as ProgressEntry[]);
    setTests((tst ?? []) as TestEntry[]);
    setDataLoading(false);
  }, [from, to]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      await loadPeriod();
    })();
  }, [user, loadPeriod]);

  const choosePreset = (p: Preset) => {
    setPreset(p);
    if (p !== 'rango') setRange(presetRange(p));
  };

  // Quien no es jefe solo ve su propio reporte.
  const effectivePerson = isJefe ? personId : user?.id ?? 'todos';

  const stats = useMemo(() => {
    const [start, end] = bounds(from, to);
    const now = new Date();
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const list = isJefe ? people : people.filter((p) => p.id === user?.id);
    return list.map<PersonStats>((person) => {
      const mine = tasks.filter((t) => t.assigned_to === person.id);
      const completed = mine
        .filter((t) => t.completed_at && new Date(t.completed_at) >= start && new Date(t.completed_at) <= end)
        .sort((a, b) => +new Date(b.completed_at!) - +new Date(a.completed_at!));
      const withDue = completed.filter((t) => t.due_date);
      const onTime = withDue.filter((t) => new Date(t.completed_at!) <= new Date(t.due_date!)).length;
      const open = mine.filter((t) => t.status !== 'completed');
      const myTests = tests.filter((x) => taskById.get(x.task_id)?.assigned_to === person.id);
      return {
        person,
        completed,
        onTime,
        late: withDue.length - onTime,
        noDue: completed.length - withDue.length,
        progress: progress.filter((p) => p.user_id === person.id),
        open,
        overdue: open.filter((t) => t.due_date && new Date(t.due_date) < now),
        avgOpenProgress: open.length ? Math.round(open.reduce((a, t) => a + (t.progress ?? 0), 0) / open.length) : null,
        testsOk: myTests.filter((x) => x.result === 'aprobada').length,
        testsFail: myTests.filter((x) => x.result === 'fallida').length,
      };
    });
  }, [tasks, progress, tests, people, from, to, isJefe, user]);

  const selected = useMemo(
    () => (effectivePerson === 'todos' ? null : stats.find((s) => s.person.id === effectivePerson) ?? null),
    [stats, effectivePerson],
  );
  const scope = useMemo(() => (selected ? [selected] : stats), [selected, stats]);

  const totals = useMemo(() => {
    const sum = (f: (s: PersonStats) => number) => scope.reduce((a, s) => a + f(s), 0);
    const completed = sum((s) => s.completed.length);
    const onTime = sum((s) => s.onTime);
    const withDue = onTime + sum((s) => s.late);
    return {
      completed,
      onTimePct: withDue ? Math.round((onTime / withDue) * 100) : null,
      withDue,
      progress: sum((s) => s.progress.length),
      overdue: sum((s) => s.overdue.length),
      testsOk: sum((s) => s.testsOk),
      testsFail: sum((s) => s.testsFail),
    };
  }, [scope]);

  // Completadas por día (o por semana si el periodo es largo).
  const series = useMemo(() => {
    const [start, end] = bounds(from, to);
    const days = Math.round((end.getTime() - start.getTime()) / 864e5);
    const weekly = days > 35;
    const buckets: { key: string; label: string; count: number }[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const label = weekly ? `sem. ${dayFmt.format(cursor)}` : dayFmt.format(cursor);
      buckets.push({ key: toISODate(cursor), label, count: 0 });
      cursor.setDate(cursor.getDate() + (weekly ? 7 : 1));
    }
    scope.forEach((s) =>
      s.completed.forEach((t) => {
        const iso = toISODate(new Date(t.completed_at!));
        let idx = buckets.findIndex((b, i) => iso >= b.key && (i === buckets.length - 1 || iso < buckets[i + 1].key));
        if (idx === -1) idx = buckets.length - 1;
        buckets[idx].count += 1;
      }),
    );
    return { buckets, weekly };
  }, [scope, from, to]);

  const exportCsv = () => {
    const rows: string[][] = [['Tipo', 'Fecha', 'Persona', 'Tarea', 'Proyecto', 'Detalle']];
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    scope.forEach((s) => {
      s.completed.forEach((t) =>
        rows.push([
          'Completada',
          new Date(t.completed_at!).toLocaleString('es-MX'),
          s.person.email,
          t.title,
          t.project_id ? projects[t.project_id] ?? '' : 'Personal',
          !t.due_date ? 'sin fecha límite' : new Date(t.completed_at!) <= new Date(t.due_date) ? 'a tiempo' : 'tarde',
        ]),
      );
      s.progress.forEach((p) => {
        const t = taskById.get(p.task_id);
        rows.push([
          'Avance',
          new Date(p.created_at).toLocaleString('es-MX'),
          s.person.email,
          t?.title ?? '',
          t?.project_id ? projects[t.project_id] ?? '' : 'Personal',
          `${p.percent}%${p.note ? ` · ${p.note}` : ''}${p.evidence_url ? ` · ${p.evidence_url}` : ''}`,
        ]);
      });
    });
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    // BOM para que Excel respete los acentos.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-${selected ? shortName(selected.person.email) : 'equipo'}-${from}_a_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading || !user) return <div className="p-8 text-[var(--text-secondary)]">Cargando…</div>;

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const maxCount = Math.max(1, ...series.buckets.map((b) => b.count));
  const periodLabel = `${rangeFmt.format(parseDate(from))} – ${rangeFmt.format(parseDate(to))}`;

  return (
    <div className="max-w-[1400px] flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
            {selected && isJefe ? `Reporte de ${shortName(selected.person.email)}` : isJefe ? 'Reporte del equipo' : 'Mi reporte'}
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">{periodLabel}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button onClick={exportCsv} className="min-h-11 px-4 rounded-[14px] text-sm font-semibold chip-glass border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] inline-flex items-center gap-2">
            <Download size={16} /> Excel (CSV)
          </button>
          <button onClick={() => window.print()} className="nav-active min-h-11 px-4 rounded-[14px] text-sm font-semibold inline-flex items-center gap-2">
            <Printer size={16} /> Imprimir / PDF
          </button>
        </div>
      </header>

      {/* Filtros */}
      <div className="glass-panel rounded-[22px] p-3 flex flex-wrap items-center gap-2 print:hidden">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => choosePreset(p.value)}
              aria-pressed={preset === p.value}
              className={`shrink-0 min-h-11 px-3.5 rounded-[14px] text-sm font-semibold transition-colors ${preset === p.value ? 'nav-active' : 'chip-glass text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'rango' && (
          <div className="flex items-center gap-2">
            <input type="date" value={from} max={to} onChange={(e) => e.target.value && setRange([e.target.value, to])} aria-label="Desde" className="min-h-11 rounded-[12px] px-3 text-sm surface-card border border-[var(--border-card)] text-[var(--text-primary)]" />
            <span className="text-sm text-[var(--text-secondary)]">a</span>
            <input type="date" value={to} min={from} onChange={(e) => e.target.value && setRange([from, e.target.value])} aria-label="Hasta" className="min-h-11 rounded-[12px] px-3 text-sm surface-card border border-[var(--border-card)] text-[var(--text-primary)]" />
          </div>
        )}
        {isJefe && (
          <select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            aria-label="Persona"
            className="ml-auto min-h-11 rounded-[14px] px-3 text-sm font-semibold surface-card border border-[var(--border-card)] text-[var(--text-primary)]"
          >
            <option value="todos">Todo el equipo</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.email}</option>)}
          </select>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={CheckCircle2} label="Completadas" value={totals.completed} detail={totals.completed === 1 ? 'tarea en el periodo' : 'tareas en el periodo'} loading={dataLoading} />
        <Kpi
          icon={TrendingUp}
          label="A tiempo"
          value={totals.onTimePct === null ? '—' : `${totals.onTimePct}%`}
          detail={totals.withDue ? `de ${totals.withDue} con fecha límite` : 'ninguna tenía fecha límite'}
          loading={dataLoading}
        />
        <Kpi icon={FlaskConical} label="Avances registrados" value={totals.progress} detail={`${totals.testsOk} pruebas aprobadas · ${totals.testsFail} fallidas`} loading={dataLoading} />
        <Kpi
          icon={AlertTriangle}
          label="Atrasadas hoy"
          value={totals.overdue}
          detail={totals.overdue ? 'pasaron su fecha límite' : 'nada vencido'}
          detailStyle={totals.overdue ? { color: 'var(--prio-alta-text)' } : { color: 'var(--ok-text)' }}
          loading={dataLoading}
        />
      </div>

      {/* Completadas en el tiempo */}
      <section className="glass-panel glass-iridescent rounded-[24px] p-5 flex flex-col gap-4 break-inside-avoid">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Completadas por {series.weekly ? 'semana' : 'día'}</h2>
        {totals.completed === 0 && !dataLoading ? (
          <p className="text-sm text-[var(--text-secondary)]">No se completó ninguna tarea en este periodo.</p>
        ) : (
          <div className="overflow-x-auto no-scrollbar">
            <div className="flex items-end gap-[2px] h-40 min-w-full" style={{ minWidth: series.buckets.length * 22 }} role="img" aria-label={`Tareas completadas por ${series.weekly ? 'semana' : 'día'}`}>
              {series.buckets.map((b) => (
                <div key={b.key} className="group relative flex-1 min-w-[20px] h-full flex flex-col justify-end items-center gap-1">
                  {b.count > 0 && <span className="font-mono text-[11px] text-[var(--text-secondary)]">{b.count}</span>}
                  <div
                    className="w-full max-w-[28px] rounded-t-[4px] transition-opacity group-hover:opacity-80"
                    style={{ height: `${(b.count / maxCount) * 100}%`, minHeight: b.count ? 4 : 1, background: b.count ? 'var(--accent)' : 'var(--border-card)' }}
                  />
                  <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[8px] px-2 py-1 text-[11px] bg-[var(--bg-card)] border border-[var(--border-card)] text-[var(--text-primary)] shadow-[var(--shadow-hover)] opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    {b.label}: {b.count}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-[2px] mt-1" style={{ minWidth: series.buckets.length * 22 }}>
              {series.buckets.map((b, i) => (
                <span key={b.key} className="flex-1 min-w-[20px] text-center font-mono text-[10px] text-[var(--text-secondary)] truncate">
                  {i % Math.ceil(series.buckets.length / 10) === 0 ? b.label.replace('sem. ', '') : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Por persona (solo jefe, vista de equipo) */}
      {isJefe && !selected && (
        <section className="glass-panel rounded-[24px] p-2 sm:p-4 flex flex-col gap-2 break-inside-avoid">
          <h2 className="px-2 pt-2 text-lg font-semibold text-[var(--text-primary)]">Por persona</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-secondary)]">
                  <th className="font-semibold px-3 py-2">Persona</th>
                  <th className="font-semibold px-3 py-2 text-right">Completadas</th>
                  <th className="font-semibold px-3 py-2 text-right">A tiempo</th>
                  <th className="font-semibold px-3 py-2 text-right">Avances</th>
                  <th className="font-semibold px-3 py-2 text-right">Atrasadas</th>
                  <th className="font-semibold px-3 py-2 min-w-[160px]">Avance de lo abierto</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => {
                  const withDue = s.onTime + s.late;
                  return (
                    <tr key={s.person.id} onClick={() => setPersonId(s.person.id)} className="border-t border-[var(--border-column)] cursor-pointer hover:bg-[var(--bg-card-hover)] transition-colors">
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-2.5 min-w-0">
                          <Avatar email={s.person.email} highlight={s.person.id === user.id} size={30} />
                          <span className="min-w-0">
                            <span className="block font-semibold text-[var(--text-primary)] truncate">{shortName(s.person.email)}</span>
                            <span className="block font-mono text-[11px] text-[var(--text-secondary)]">{s.person.role}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-[var(--text-primary)]">{s.completed.length}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[var(--text-primary)]">{withDue ? `${Math.round((s.onTime / withDue) * 100)}%` : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-[var(--text-primary)]">{s.progress.length}</td>
                      <td className="px-3 py-2.5 text-right font-mono" style={{ color: s.overdue.length ? 'var(--prio-alta-text)' : 'var(--text-secondary)' }}>{s.overdue.length}</td>
                      <td className="px-3 py-2.5">
                        {s.avgOpenProgress === null ? (
                          <span className="text-xs text-[var(--text-secondary)]">sin tareas abiertas</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span className="flex-1 h-2 rounded-full bg-[var(--border-card)] overflow-hidden">
                              <span className="block h-full rounded-full" style={{ width: `${s.avgOpenProgress}%`, background: 'var(--accent)' }} />
                            </span>
                            <span className="font-mono text-xs text-[var(--text-primary)] w-14 text-right">{s.avgOpenProgress}% · {s.open.length}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-2 pb-1 text-xs text-[var(--text-secondary)]">Toca una persona para ver el detalle de lo que hizo.</p>
        </section>
      )}

      {/* Detalle de una persona */}
      {selected && (
        <>
          {isJefe && (
            <button onClick={() => setPersonId('todos')} className="self-start -mt-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] inline-flex items-center gap-1 print:hidden">
              <ChevronLeft size={16} /> Todo el equipo
            </button>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <section className="glass-panel rounded-[24px] p-5 flex flex-col gap-3 break-inside-avoid">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Tareas completadas</h2>
              {selected.completed.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">Ninguna en este periodo.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {selected.completed.map((t) => {
                    const late = t.due_date && new Date(t.completed_at!) > new Date(t.due_date);
                    return (
                      <li key={t.id} className="surface-card border border-[var(--border-card)] rounded-[14px] p-3 flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[var(--text-primary)]">{t.title}</span>
                          <span className="block text-xs text-[var(--text-secondary)]">
                            {t.project_id ? projects[t.project_id] ?? 'Proyecto' : 'Personal'} · {dayTimeFmt.format(new Date(t.completed_at!))}
                          </span>
                        </span>
                        <span className="shrink-0 flex flex-col items-end gap-1">
                          {t.priority && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-[8px]" style={prioStyle(t.priority)}>{t.priority}</span>}
                          <span className="text-[11px] font-semibold" style={{ color: !t.due_date ? 'var(--text-secondary)' : late ? 'var(--prio-alta-text)' : 'var(--ok-text)' }}>
                            {!t.due_date ? 'sin fecha límite' : late ? 'tarde' : 'a tiempo'}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="glass-panel rounded-[24px] p-5 flex flex-col gap-3 break-inside-avoid">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Avances registrados</h2>
              {selected.progress.length === 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">No registró avances en este periodo.</p>
              ) : (
                <ol className="flex flex-col">
                  {selected.progress.map((p) => {
                    const t = taskById.get(p.task_id);
                    return (
                      <li key={p.id} className="relative pl-6 pb-4 last:pb-0 border-l border-[var(--border-card)] ml-1.5">
                        <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full" style={{ background: 'var(--accent)' }} />
                        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                          <span className="text-sm font-semibold text-[var(--text-primary)]">{t?.title ?? 'Tarea borrada'}</span>
                          <span className="font-mono text-xs text-[var(--text-primary)]">{p.percent}%</span>
                        </span>
                        <span className="block text-xs text-[var(--text-secondary)]">{dayTimeFmt.format(new Date(p.created_at))}</span>
                        {p.note && <p className="text-[13px] text-[var(--text-secondary)] mt-1 whitespace-pre-line">{p.note}</p>}
                        {p.evidence_url && (
                          <a href={p.evidence_url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[var(--accent)] hover:underline break-all">
                            Ver evidencia
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          {selected.overdue.length > 0 && (
            <section className="glass-panel rounded-[24px] p-5 flex flex-col gap-3 break-inside-avoid">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] inline-flex items-center gap-2">
                <AlertTriangle size={17} style={{ color: 'var(--prio-alta-text)' }} /> Atrasadas hoy
              </h2>
              <ul className="flex flex-col gap-2">
                {selected.overdue.map((t) => (
                  <li key={t.id} className="surface-card border border-[var(--border-card)] rounded-[14px] p-3 flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--text-primary)] truncate">{t.title}</span>
                      <span className="block text-xs text-[var(--text-secondary)]">
                        venció el {dayFmt.format(new Date(t.due_date!))} · {t.project_id ? projects[t.project_id] ?? 'Proyecto' : 'Personal'}
                      </span>
                    </span>
                    <span className="font-mono text-xs text-[var(--text-primary)]">{t.progress ?? 0}%</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, detail, detailStyle, loading }: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  detail: string;
  detailStyle?: React.CSSProperties;
  loading: boolean;
}) {
  return (
    <div className="glass-panel glass-iridescent rounded-[22px] p-4 flex flex-col gap-2 break-inside-avoid">
      <span className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-[var(--text-secondary)]">{label}</span>
        <Icon size={16} className="text-[var(--text-secondary)]" />
      </span>
      <span className="text-3xl font-bold tracking-tight text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-display)' }}>
        {loading ? '…' : value}
      </span>
      <span className="text-xs text-[var(--text-secondary)]" style={detailStyle}>{detail}</span>
    </div>
  );
}
