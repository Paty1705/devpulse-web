'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { AlertTriangle, Clock, FileCode, FlaskConical, Lock, Plus, Repeat } from 'lucide-react';

export type BoardTask = {
  id: string;
  title: string;
  status: string;
  is_locked: boolean;
  locked_by: string | null;
  requires_sql: boolean;
  assigned_to: string | null;
  item_type?: string | null;
  priority?: string | null;
  progress?: number | null;
  recurrence_id?: string | null;
  due_date?: string | null;
  project_id: string | null;
  assignee?: { email: string } | null;
};

export type BoardColumn = { id: string; title: string; tasks: BoardTask[] };

export const COLUMN_DEFS: { id: string; title: string; dot: string }[] = [
  { id: 'backlog', title: 'Backlog', dot: 'var(--text-secondary)' },
  { id: 'in_progress', title: 'En progreso', dot: 'var(--accent)' },
  { id: 'in_review', title: 'En pruebas', dot: 'var(--accent-2)' },
  { id: 'ready', title: 'Listo para desplegar', dot: '#F59E0B' },
  { id: 'completed', title: 'Completado', dot: 'var(--ok-text)' },
];

const PRIORITIES = ['Todas', 'Crítica', 'Alta', 'Media', 'Baja'] as const;
type PriorityFilter = (typeof PRIORITIES)[number];

function prioStyle(priority: string | null | undefined): CSSProperties {
  const key = priority === 'Alta' || priority === 'Crítica' ? 'alta' : priority === 'Baja' ? 'baja' : 'media';
  return { background: `var(--prio-${key}-bg)`, color: `var(--prio-${key}-text)` };
}

const shortDate = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

function formatDateOnly(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return shortDate.format(new Date(y, m - 1, d));
}

function initials(email?: string | null) {
  if (!email) return '?';
  return (email.split('@')[0].replace(/[^a-zA-Z]/g, '').slice(0, 2) || '?').toUpperCase();
}

const filterButton = (active: boolean) =>
  `min-h-9 px-3.5 rounded-[10px] text-[13px] transition-colors ${
    active ? 'nav-active font-semibold' : 'font-medium text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'
  }`;

type BoardViewProps = {
  columns: Record<string, BoardColumn>;
  loading: boolean;
  currentUserId: string | null;
  projectNames: Record<string, string>;
  /** Próxima fecha de prueba pendiente por tarea (YYYY-MM-DD). */
  testDates: Record<string, string>;
  canModify: (task: BoardTask) => boolean;
  canCreate: boolean;
  onCreate: () => void;
  onOpen: (task: BoardTask) => void;
  /** Mueve la tarea a `to`, antes de `beforeId` (o al final si es null). */
  onMove: (taskId: string, to: string, beforeId: string | null) => void;
};

export function BoardView({
  columns, loading, currentUserId, projectNames, testDates, canModify, canCreate, onCreate, onOpen, onMove,
}: BoardViewProps) {
  const [priority, setPriority] = useState<PriorityFilter>('Todas');
  const [onlyMine, setOnlyMine] = useState(false);

  const visible = useMemo(() => {
    const keep = (t: BoardTask) =>
      (priority === 'Todas' || (t.priority ?? 'Media') === priority) && (!onlyMine || t.assigned_to === currentUserId);
    return Object.fromEntries(Object.values(columns).map((c) => [c.id, c.tasks.filter(keep)])) as Record<string, BoardTask[]>;
  }, [columns, priority, onlyMine, currentUserId]);

  const total = Object.values(columns).reduce((acc, c) => acc + c.tasks.length, 0);
  const shown = Object.values(visible).reduce((acc, list) => acc + list.length, 0);
  const today = new Date(new Date().toDateString());

  // Con filtros activos, el índice que da la librería es el de la lista
  // VISIBLE: se traduce a "antes de qué tarea" para no depender de posiciones.
  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const destList = visible[destination.droppableId].filter((t) => t.id !== draggableId);
    const before = destList[destination.index]?.id ?? null;
    onMove(draggableId, destination.droppableId, before);
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">Tablero</h1>
          <p className="text-[var(--text-secondary)] text-sm">
            {loading ? 'Cargando tareas…' : shown === total ? `${total} tareas` : `${shown} de ${total} tareas con estos filtros`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Filtrar por prioridad" className="glass-panel flex flex-wrap gap-1 p-1 rounded-[14px]">
            {PRIORITIES.map((p) => (
              <button key={p} onClick={() => setPriority(p)} aria-pressed={priority === p} className={filterButton(priority === p)}>
                {p}
              </button>
            ))}
          </div>
          <button onClick={() => setOnlyMine(!onlyMine)} aria-pressed={onlyMine} className={`glass-panel ${filterButton(onlyMine)} min-h-11 px-4 rounded-[14px]`}>
            Solo mis tareas
          </button>
          {canCreate && (
            <button
              onClick={onCreate}
              className="nav-active min-h-11 px-5 rounded-[14px] font-semibold text-sm inline-flex items-center gap-2 active:scale-[0.97] transition-transform"
            >
              <Plus size={16} /> Nueva tarea
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="glass-panel rounded-[24px] py-16 text-center text-[var(--text-secondary)]">Cargando tareas…</div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="overflow-x-auto pb-3 -mx-1 px-1">
            <div className="grid grid-cols-5 gap-4 min-w-[1180px]">
              {COLUMN_DEFS.map((def) => {
                const list = visible[def.id] ?? [];
                return (
                  <section key={def.id} className="relative rounded-[24px] p-3.5 flex flex-col gap-3 min-h-[60vh]">
                    {/* El vidrio va en una capa hermana y no envuelve a las tarjetas:
                        backdrop-filter en un ancestro rompe la posición de la
                        tarjeta mientras se arrastra (crea un nuevo bloque
                        contenedor para position: fixed). */}
                    <div aria-hidden="true" className="glass-panel glass-iridescent rounded-[24px] pointer-events-none" style={{ position: 'absolute', inset: 0 }} />
                    <div className="relative flex items-center justify-between gap-2 px-1 pt-1">
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: def.dot, boxShadow: `0 0 8px ${def.dot}` }} />
                        <h2 className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{def.title}</h2>
                      </span>
                      <span className="chip-glass font-mono text-xs font-bold px-2 py-0.5 rounded-[8px] text-[var(--text-primary)]">{list.length}</span>
                    </div>

                    <Droppable droppableId={def.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`relative flex-1 flex flex-col gap-2.5 rounded-[18px] p-0.5 transition-colors ${snapshot.isDraggingOver ? 'chip-glass' : ''}`}
                        >
                          {list.map((task, index) => {
                            const editable = canModify(task);
                            const isDone = task.status === 'completed';
                            const isOverdue = !!task.due_date && !isDone && new Date(task.due_date) < today;
                            const isDueToday = !!task.due_date && new Date(task.due_date).toDateString() === today.toDateString();
                            const test = testDates[task.id];
                            const pct = isDone ? 100 : task.progress ?? 0;
                            return (
                              <Draggable key={task.id} draggableId={task.id} index={index} isDragDisabled={!editable}>
                                {(drag, dragSnapshot) => (
                                  <div
                                    ref={drag.innerRef}
                                    {...drag.draggableProps}
                                    {...drag.dragHandleProps}
                                    onClick={() => onOpen(task)}
                                    title={!editable ? (task.is_locked ? 'Bloqueada por la persona asignada: nadie más puede moverla' : 'Solo el jefe, el líder o la persona asignada pueden mover esta tarea') : undefined}
                                    style={{
                                      ...drag.draggableProps.style,
                                      // Mientras se arrastra va sobre otras tarjetas: fondo casi opaco.
                                      ...(dragSnapshot.isDragging ? { backgroundColor: 'var(--bg-solid, var(--bg-card))' } : null),
                                    }}
                                    className={`chip-glass rounded-[18px] p-[var(--kanban-card-padding)] flex flex-col gap-2.5 cursor-pointer border border-[var(--border-card)] hover:bg-[var(--bg-card-hover)] transition-[background-color,box-shadow,opacity] ${
                                      dragSnapshot.isDragging ? 'shadow-[var(--shadow-hover)] ring-2 ring-[var(--accent)]' : ''
                                    } ${!editable && !dragSnapshot.isDragging ? 'opacity-80' : ''} ${isDone ? 'opacity-75' : ''}`}
                                  >
                                    <span className="flex items-start justify-between gap-2">
                                      <span className="font-semibold leading-snug text-[length:var(--kanban-card-text)] text-[var(--text-primary)]">{task.title}</span>
                                      <span className="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-[8px]" style={prioStyle(task.priority)}>
                                        {task.priority ?? 'Media'}
                                      </span>
                                    </span>

                                    <span className="font-mono text-[11px] text-[var(--text-secondary)] truncate">
                                      {(task.project_id && projectNames[task.project_id]) || 'Sin proyecto'} · {task.item_type ?? 'Feature'}
                                    </span>

                                    <span className="flex flex-wrap gap-1.5">
                                      {task.due_date ? (
                                        <span
                                          className="font-mono text-[11px] px-2 py-1 rounded-[8px] inline-flex items-center gap-1 surface-card"
                                          style={isOverdue ? prioStyle('Alta') : isDueToday ? prioStyle('Media') : undefined}
                                        >
                                          {isOverdue ? <AlertTriangle size={11} /> : <Clock size={11} />}
                                          {isOverdue ? 'venció ' : ''}{isDueToday && !isOverdue ? 'hoy' : shortDate.format(new Date(task.due_date))}
                                        </span>
                                      ) : (
                                        <span className="font-mono text-[11px] px-2 py-1 rounded-[8px] inline-flex items-center gap-1 surface-card text-[var(--text-secondary)]">
                                          <Clock size={11} /> sin fecha
                                        </span>
                                      )}
                                      {test && (
                                        <span className="font-mono text-[11px] px-2 py-1 rounded-[8px] inline-flex items-center gap-1 surface-card shadow-[inset_0_0_0_1px_var(--accent-2)]">
                                          <FlaskConical size={11} /> prueba {formatDateOnly(test)}
                                        </span>
                                      )}
                                      {task.recurrence_id && (
                                        <span className="font-mono text-[11px] px-2 py-1 rounded-[8px] inline-flex items-center gap-1 surface-card" title="Tarea recurrente">
                                          <Repeat size={11} />
                                        </span>
                                      )}
                                      {task.requires_sql && (
                                        <span className="font-mono text-[11px] px-2 py-1 rounded-[8px] inline-flex items-center gap-1 bg-[var(--badge-sql-bg)] text-[var(--badge-sql-text)]" title="Requiere SQL">
                                          <FileCode size={11} /> SQL
                                        </span>
                                      )}
                                      {task.is_locked && (
                                        <span className="font-mono text-[11px] px-2 py-1 rounded-[8px] inline-flex items-center gap-1 bg-[var(--badge-locked-bg)] text-[var(--badge-locked-text)]" title="Bloqueada por la persona asignada">
                                          <Lock size={11} />
                                        </span>
                                      )}
                                    </span>

                                    <span className="flex items-center gap-2">
                                      <span
                                        className="tile-3d w-7 h-7 shrink-0 rounded-[9px] flex items-center justify-center text-[10px] font-bold text-white"
                                        style={{ background: task.assigned_to === currentUserId ? 'linear-gradient(150deg, var(--accent), var(--accent-2))' : 'linear-gradient(150deg, #64748B, #334155)' }}
                                        title={task.assignee?.email ?? 'Sin asignar'}
                                      >
                                        {task.assigned_to ? initials(task.assignee?.email) : '—'}
                                      </span>
                                      <span className="flex-1 h-1.5 rounded-full surface-card overflow-hidden" aria-hidden="true">
                                        <span
                                          className="block h-full rounded-full"
                                          style={{ width: `${pct}%`, background: isDone ? 'var(--ok-text)' : 'linear-gradient(90deg, var(--accent-2), var(--accent))' }}
                                        />
                                      </span>
                                      <span className="font-mono text-[11px] font-bold text-[var(--text-primary)]">{pct}%</span>
                                    </span>
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                          {list.length === 0 && !snapshot.isDraggingOver && (
                            <p className="text-xs text-[var(--text-secondary)] text-center py-8">
                              {columns[def.id]?.tasks.length ? 'Nada con estos filtros' : 'Sin tareas'}
                            </p>
                          )}
                        </div>
                      )}
                    </Droppable>
                  </section>
                );
              })}
            </div>
          </div>
        </DragDropContext>
      )}
    </div>
  );
}
