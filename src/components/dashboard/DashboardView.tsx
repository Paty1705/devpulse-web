'use client';

import Link from 'next/link';
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  Bug, CheckCircle2, Clock, Database, FileText, FolderKanban, Link2, Mic, Play,
  Plus, Sparkles, Wrench, type LucideIcon,
} from 'lucide-react';
import { Mascot } from '@/components/mascot/Mascot';
import type { Mascot as MascotKind } from '@/lib/theme';

export type DashboardTask = {
  id: string;
  title: string;
  status: string;
  item_type: string | null;
  priority: string | null;
  progress: number | null;
  due_date: string | null;
  assigned_to: string | null;
  assignee: { email: string } | null;
  project_id: string | null;
  project: { name: string } | null;
};

export type ProjectRow = { id: string; name: string; leader_id: string | null };
export type ProgressRow = { created_at: string };
export type MeetingRow = { id: string; title: string; scheduled_at: string; status: string };
export type ResourceRow = { id: string; title: string; kind: 'video' | 'documento' | 'enlace'; url: string | null; duration_minutes: number | null };

const TYPE_TILE: Record<string, { icon: LucideIcon; bg: string }> = {
  Feature: { icon: Sparkles, bg: 'linear-gradient(150deg, var(--accent-2), var(--accent))' },
  Bug: { icon: Bug, bg: 'linear-gradient(150deg, #FDBA74, #C2410C)' },
  'Base de Datos': { icon: Database, bg: 'linear-gradient(150deg, #5EEAD4, #0F766E)' },
  Refactor: { icon: Wrench, bg: 'linear-gradient(150deg, #CBD5E1, #475569)' },
};

const RESOURCE_ICON: Record<ResourceRow['kind'], LucideIcon> = { video: Play, documento: FileText, enlace: Link2 };

function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function prioStyle(priority: string | null): CSSProperties {
  const key = priority === 'Alta' || priority === 'Crítica' ? 'alta' : priority === 'Baja' ? 'baja' : 'media';
  return { background: `var(--prio-${key}-bg)`, color: `var(--prio-${key}-text)` };
}

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

const shortDate = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });
const weekday = new Intl.DateTimeFormat('es-MX', { weekday: 'short' });
const meetingTime = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

function Card({ children, className = '', thick = false }: { children: ReactNode; className?: string; thick?: boolean }) {
  return (
    <section className={`glass-panel glass-iridescent ${thick ? 'thick-iridescent' : ''} rounded-[28px] p-6 ${className}`}>
      {children}
    </section>
  );
}

function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">{children}</h2>
      {action}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-[var(--text-secondary)] py-6 text-center">{children}</p>;
}

const linkChip = 'chip-glass text-[13px] font-semibold px-3 py-2 rounded-[12px] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors';

export type DashboardData = {
  tasks: DashboardTask[];
  projects: ProjectRow[];
  progressRows: ProgressRow[];
  meeting: MeetingRow | null;
  resources: ResourceRow[];
};

type DashboardViewProps = DashboardData & {
  dataLoading: boolean;
  isJefe: boolean;
  userId: string;
  mascot: MascotKind;
  onSelectTask: (id: string) => void;
};

/** Parte visual del panel de inicio: recibe los datos ya cargados. */
export function DashboardView({ tasks, projects, progressRows, meeting, resources, dataLoading, isJefe, userId, mascot, onSelectTask }: DashboardViewProps) {
  const view = useMemo(() => {
    const today = startOfDay(new Date());
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    const pending = tasks.filter((t) => t.status !== 'completed');
    const completed = tasks.filter((t) => t.status === 'completed');
    const overdue = pending.filter((t) => t.due_date && new Date(t.due_date) < today);
    const dueToday = pending.filter((t) => t.due_date && new Date(t.due_date) >= today && new Date(t.due_date) <= endOfToday);
    const dueWeek = pending.filter((t) => t.due_date && new Date(t.due_date) > endOfToday && new Date(t.due_date) <= weekFromNow);
    const inReview = pending.filter((t) => t.status === 'in_review');

    // Avances por día (últimos 7 días, incluido hoy).
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
    const perDay = days.map((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      return progressRows.filter((r) => {
        const c = new Date(r.created_at);
        return c >= d && c < next;
      }).length;
    });

    // Avance por proyecto: una tarea completada cuenta 100 %, el resto su progress.
    const byProject = projects
      .map((p) => {
        const list = tasks.filter((t) => t.project_id === p.id);
        const pct = list.length
          ? Math.round(list.reduce((acc, t) => acc + (t.status === 'completed' ? 100 : t.progress ?? 0), 0) / list.length)
          : 0;
        return { id: p.id, name: p.name, pct, count: list.length };
      })
      .filter((p) => p.count > 0)
      .sort((a, b) => b.count - a.count);
    const overall = tasks.length
      ? Math.round(tasks.reduce((acc, t) => acc + (t.status === 'completed' ? 100 : t.progress ?? 0), 0) / tasks.length)
      : 0;

    return { pending, completed, overdue, dueToday, dueWeek, inReview, days, perDay, byProject, overall, upcoming: pending.slice(0, 5) };
  }, [tasks, projects, progressRows]);

  const isManager = isJefe || projects.some((p) => p.leader_id === userId);
  const summary = dataLoading
    ? 'Cargando tu día…'
    : view.dueToday.length + view.overdue.length === 0
      ? 'No tienes entregas para hoy. Buen momento para adelantar lo de la semana.'
      : `Hoy tienes ${view.dueToday.length} ${view.dueToday.length === 1 ? 'entrega' : 'entregas'}${view.overdue.length ? ` y ${view.overdue.length} ${view.overdue.length === 1 ? 'vencida' : 'vencidas'}` : ''}.`;

  return (
    <div className="max-w-[1400px] flex flex-col gap-5">
      {/* Fila 1: bienvenida + KPIs */}
      <div className="flex flex-wrap gap-5">
        <Card thick className="flex-[2_1_420px] flex flex-wrap items-center gap-6 overflow-hidden">
          <Mascot kind={mascot} size={160} />
          <div className="flex-1 min-w-[220px] flex flex-col gap-2.5">
            <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">{greeting()}</h1>
            <p className="text-[15px] leading-relaxed text-[var(--text-primary)]/85">{summary}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="chip-glass font-mono text-xs px-2.5 py-1.5 rounded-[10px] text-[var(--text-primary)]">{view.dueWeek.length} esta semana</span>
              <span className="chip-glass font-mono text-xs px-2.5 py-1.5 rounded-[10px] text-[var(--text-primary)]">{view.inReview.length} en pruebas</span>
              {meeting && (
                <span className="chip-glass font-mono text-xs px-2.5 py-1.5 rounded-[10px] text-[var(--text-primary)]">
                  junta {new Date(meeting.scheduled_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
            {isManager && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Link href="/dashboard/jefatura" className={linkChip}>
                  <span className="inline-flex items-center gap-1.5"><FolderKanban size={14} /> Ver proyectos</span>
                </Link>
                {isJefe && (
                  <Link href="/dashboard/jefatura" className="nav-active text-[13px] font-semibold px-3 py-2 rounded-[12px]">
                    <span className="inline-flex items-center gap-1.5"><Plus size={14} /> Nuevo proyecto</span>
                  </Link>
                )}
              </div>
            )}
          </div>
        </Card>

        <Kpi
          label={isJefe ? 'Proyectos del área' : 'Proyectos asignados'}
          value={projects.length}
          detail={`${new Set(view.inReview.map((t) => t.project_id)).size} con tareas en pruebas`}
          icon={FolderKanban}
          tile="linear-gradient(150deg, var(--accent-2), var(--accent))"
          loading={dataLoading}
        />
        <Kpi
          label="Tareas completadas"
          value={view.completed.length}
          detail={`de ${tasks.length} en total`}
          icon={CheckCircle2}
          tile="linear-gradient(150deg, #5EEAD4, #0F766E)"
          loading={dataLoading}
        />
        <Kpi
          label="Por vencer"
          value={view.dueToday.length + view.dueWeek.length}
          detail={view.overdue.length ? `${view.overdue.length} ${view.overdue.length === 1 ? 'vencida' : 'vencidas'}` : 'nada vencido'}
          detailStyle={view.overdue.length ? { color: 'var(--prio-alta-text)', fontWeight: 600 } : undefined}
          icon={Clock}
          tile="linear-gradient(150deg, #FDBA74, #C2410C)"
          loading={dataLoading}
        />
      </div>

      {/* Fila 2: gráfica + mis tareas */}
      <div className="flex flex-wrap gap-5">
        <Card className="flex-[3_1_460px] min-w-0">
          <CardTitle>
            <span className="flex flex-col">
              Avances registrados
              <span className="text-[13px] font-normal text-[var(--text-secondary)] font-sans">
                {isJefe ? 'Del equipo, ' : ''}últimos 7 días
              </span>
            </span>
          </CardTitle>
          <ProgressChart days={view.days} values={view.perDay} loading={dataLoading} />
        </Card>

        <Card className="flex-[2_1_360px] min-w-0">
          <CardTitle action={<Link href="/dashboard/kanban" className={linkChip}>Ver tablero</Link>}>
            {isJefe ? 'Próximas tareas' : 'Mis tareas'}
          </CardTitle>
          {dataLoading ? (
            <Empty>Cargando…</Empty>
          ) : view.upcoming.length === 0 ? (
            <Empty>No hay tareas pendientes.</Empty>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {view.upcoming.map((t) => {
                const tile = TYPE_TILE[t.item_type ?? 'Feature'] ?? TYPE_TILE.Feature;
                const Icon = tile.icon;
                const isOverdue = !!t.due_date && new Date(t.due_date) < startOfDay(new Date());
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => onSelectTask(t.id)}
                      className="chip-glass w-full flex items-center gap-3.5 p-3 rounded-[20px] text-left hover:bg-[var(--bg-card-hover)] transition-colors"
                    >
                      <span className="tile-3d w-11 h-11 shrink-0 rounded-[14px] flex items-center justify-center" style={{ background: tile.bg }}>
                        <Icon size={20} className="text-white" />
                      </span>
                      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{t.title}</span>
                        <span className="font-mono text-xs text-[var(--text-secondary)] truncate">
                          {t.project?.name ?? 'Sin proyecto'} · {t.due_date ? (
                            <span style={isOverdue ? { color: 'var(--prio-alta-text)', fontWeight: 700 } : undefined}>
                              {isOverdue ? 'venció ' : 'límite '}{shortDate.format(new Date(t.due_date))}
                            </span>
                          ) : 'sin fecha'}
                          {isJefe && t.assignee?.email ? ` · ${t.assignee.email.split('@')[0]}` : ''}
                        </span>
                      </span>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-[10px] shrink-0" style={prioStyle(t.priority)}>
                        {t.priority ?? 'Media'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Fila 3: junta + avance por proyecto + recursos */}
      <div className="flex flex-wrap gap-5">
        <Card thick className="flex-[1_1_300px] min-w-0 flex flex-col">
          <CardTitle
            action={meeting && (
              <span className="chip-glass font-mono text-xs px-2.5 py-1 rounded-[10px] text-[var(--text-primary)]">
                {meeting.status === 'en_curso' ? 'en curso' : shortDate.format(new Date(meeting.scheduled_at))}
              </span>
            )}
          >
            Próxima junta
          </CardTitle>
          {meeting ? (
            <div className="flex flex-col gap-1 mb-4">
              <span className="text-base font-semibold text-[var(--text-primary)]">{meeting.title}</span>
              <span className="text-[13px] text-[var(--text-secondary)] first-letter:uppercase">{meetingTime.format(new Date(meeting.scheduled_at))}</span>
            </div>
          ) : (
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              {dataLoading ? 'Cargando…' : 'No hay juntas programadas.'}
            </p>
          )}
          <div className="mt-auto flex flex-wrap gap-2.5">
            <button
              disabled
              title="El modo junta llega en la siguiente fase"
              className="nav-active flex-1 min-w-[140px] min-h-12 rounded-[16px] font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Play size={16} fill="currentColor" /> Iniciar junta
            </button>
            <button
              disabled
              title="La grabación llega en la siguiente fase"
              className="chip-glass flex-1 min-w-[110px] min-h-12 rounded-[16px] font-semibold text-sm text-[var(--text-primary)] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Mic size={16} /> Grabar
            </button>
          </div>
          <span className="mt-3 text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
            <Sparkles size={13} /> La IA propondrá tareas a partir de la grabación
          </span>
        </Card>

        <Card className="flex-[1_1_300px] min-w-0">
          <CardTitle>Avance por proyecto</CardTitle>
          {dataLoading ? (
            <Empty>Cargando…</Empty>
          ) : view.byProject.length === 0 ? (
            <Empty>Aún no hay proyectos con tareas.</Empty>
          ) : (
            <div className="flex flex-wrap items-center gap-5">
              <div
                role="img"
                aria-label={`Avance general ${view.overall}%`}
                className="w-32 h-32 shrink-0 rounded-full flex items-center justify-center"
                style={{ background: `conic-gradient(var(--accent) 0 ${view.overall}%, var(--bg-page) ${view.overall}% 100%)` }}
              >
                <div className="glass-panel w-[92px] h-[92px] rounded-full flex flex-col items-center justify-center">
                  <span className="font-display text-2xl font-bold leading-none text-[var(--text-primary)]">{view.overall}%</span>
                  <span className="text-[11px] text-[var(--text-secondary)]">general</span>
                </div>
              </div>
              <ul className="flex-1 min-w-[150px] flex flex-col gap-3">
                {view.byProject.slice(0, 4).map((p, i) => (
                  <li key={p.id} className="flex flex-col gap-1.5">
                    <span className="flex justify-between gap-2 text-[13px] text-[var(--text-primary)]">
                      <span className="truncate">{p.name}</span>
                      <span className="font-mono font-bold">{p.pct}%</span>
                    </span>
                    <span className="chip-glass block h-2 rounded-full overflow-hidden">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${p.pct}%`, background: ['var(--accent)', 'var(--accent-2)', '#C2410C', '#0F766E'][i] }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="flex-[1_1_300px] min-w-0">
          <CardTitle>Recursos recomendados</CardTitle>
          {dataLoading ? (
            <Empty>Cargando…</Empty>
          ) : resources.length === 0 ? (
            <Empty>Todavía nadie ha recomendado videos o documentos.</Empty>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {resources.map((r) => {
                const Icon = RESOURCE_ICON[r.kind];
                const body = (
                  <>
                    <span
                      className="tile-3d w-16 h-11 shrink-0 rounded-[12px] flex items-center justify-center"
                      style={{ background: r.kind === 'documento' ? 'linear-gradient(150deg, var(--accent-2), var(--accent))' : 'linear-gradient(150deg, #475569, #1C2230)' }}
                    >
                      <Icon size={18} className="text-white" fill={r.kind === 'video' ? 'currentColor' : 'none'} />
                    </span>
                    <span className="min-w-0 flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{r.title}</span>
                      <span className="font-mono text-xs text-[var(--text-secondary)]">
                        {r.kind}{r.duration_minutes ? ` · ${r.duration_minutes} min` : ''}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={r.id}>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="chip-glass flex items-center gap-3 p-2.5 rounded-[18px] hover:bg-[var(--bg-card-hover)] transition-colors">
                        {body}
                      </a>
                    ) : (
                      <span className="chip-glass flex items-center gap-3 p-2.5 rounded-[18px]">{body}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

    </div>
  );
}


function Kpi({ label, value, detail, detailStyle, icon: Icon, tile, loading }: {
  label: string;
  value: number;
  detail: string;
  detailStyle?: CSSProperties;
  icon: LucideIcon;
  tile: string;
  loading: boolean;
}) {
  return (
    <section className="glass-panel glass-iridescent flex-[1_1_180px] rounded-[28px] p-5 flex flex-col gap-3.5">
      <h2 className="font-sans text-sm font-semibold text-[var(--text-secondary)]">{label}</h2>
      <span className="tile-3d w-[52px] h-[52px] rounded-[16px] flex items-center justify-center" style={{ background: tile }}>
        <Icon size={24} className="text-white" strokeWidth={2.2} />
      </span>
      <span className="font-display text-[40px] font-bold leading-none text-[var(--text-primary)]">{loading ? '—' : value}</span>
      <span className="text-[13px] text-[var(--text-secondary)]" style={loading ? undefined : detailStyle}>{loading ? ' ' : detail}</span>
    </section>
  );
}

function ProgressChart({ days, values, loading }: { days: Date[]; values: number[]; loading: boolean }) {
  const max = Math.max(4, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const W = 600;
  const H = 180;
  const step = W / (values.length - 1);
  const points = values.map((v, i) => [i * step, H - 12 - (v / max) * (H - 36)] as const);
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const best = values.indexOf(Math.max(...values));

  if (loading) return <Empty>Cargando…</Empty>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[34px] font-bold leading-none text-[var(--text-primary)]">{total}</span>
        <span className="text-sm text-[var(--text-secondary)]">{total === 1 ? 'avance' : 'avances'} esta semana</span>
      </div>
      {total === 0 ? (
        <Empty>Aún no hay avances registrados. Se registran desde cada tarea.</Empty>
      ) : (
        <>
          <svg
            width="100%"
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Avances por día: ${days.map((d, i) => `${weekday.format(d)} ${values[i]}`).join(', ')}`}
          >
            <defs>
              <linearGradient id="dashArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style={{ stopColor: 'var(--accent)', stopOpacity: 0.4 }} />
                <stop offset="1" style={{ stopColor: 'var(--accent)', stopOpacity: 0 }} />
              </linearGradient>
              <linearGradient id="dashLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" style={{ stopColor: 'var(--accent-2)' }} />
                <stop offset="1" style={{ stopColor: 'var(--accent)' }} />
              </linearGradient>
            </defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="currentColor" strokeOpacity="0.08" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={area} fill="url(#dashArea)" />
            <path d={line} fill="none" stroke="url(#dashLine)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="grid grid-cols-7 text-center font-mono text-xs text-[var(--text-secondary)]">
            {days.map((d, i) => (
              <span key={d.toISOString()} className={i === best && values[i] > 0 ? 'font-bold text-[var(--text-primary)]' : ''}>
                {weekday.format(d).replace('.', '')}
                <span className="block">{values[i]}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
