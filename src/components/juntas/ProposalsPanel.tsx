'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AlertTriangle, Check, Loader2, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDateOnly, PRIORITIES, prioStyle, shortName, type AiStatus, type PersonRef, type Proposal } from '@/lib/meetings';
import { Avatar } from '@/components/juntas/Avatar';

export type ProjectOption = { id: string; name: string; leader_id: string | null; leader: { email: string } | null };

type Props = {
  meetingId: string;
  proposals: Proposal[];
  projects: ProjectOption[];
  emailById: Record<string, string>;
  attendees: PersonRef[];
  isJefe: boolean;
  isAttendee: boolean;
  currentUserId?: string;
  aiStatus: AiStatus;
  aiError: string | null;
  hasRecording: boolean;
  processing: boolean;
  onProcess: () => void;
  onChanged: () => void;
};

const fieldClass =
  'min-h-9 rounded-[10px] px-2.5 text-[13px] surface-card border border-[var(--border-card)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-70';

export function ProposalsPanel({
  meetingId, proposals, projects, emailById, attendees, isJefe, isAttendee, currentUserId, aiStatus, aiError, hasRecording, processing, onProcess, onChanged,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ordered = [...proposals].sort((a, b) => {
    const rank = { pendiente: 0, aceptada: 1, descartada: 2 } as const;
    return rank[a.status] - rank[b.status];
  });
  const pending = proposals.filter((p) => p.status === 'pendiente');
  // Lista para aceptar = tiene responsable (sin proyecto se vuelve tarea personal).
  const ready = pending.filter((p) => p.assigned_to);
  const myProjects = projects.filter((x) => x.leader_id === currentUserId);
  const accepted = proposals.filter((p) => p.status === 'aceptada').length;

  const patch = async (id: string, values: Partial<Proposal>) => {
    setError(null);
    const { error: err } = await supabase.from('meeting_task_proposals').update(values).eq('id', id);
    if (err) setError('No se pudo guardar el cambio.');
    else onChanged();
  };

  const accept = async (id: string) => {
    setBusy(id);
    setError(null);
    const { error: err } = await supabase.rpc('accept_meeting_proposal', { p_proposal_id: id });
    setBusy(null);
    if (err) setError(`No se pudo crear la tarea: ${err.message}`);
    onChanged();
  };

  const acceptAll = async () => {
    setBusy('all');
    for (const p of ready) {
      const { error: err } = await supabase.rpc('accept_meeting_proposal', { p_proposal_id: p.id });
      if (err) {
        setError(`No se pudo crear "${p.title}": ${err.message}`);
        break;
      }
    }
    setBusy(null);
    onChanged();
  };

  const addManual = async () => {
    setError(null);
    // El jefe agrega una propuesta abierta; un asistente, una para sí mismo.
    const values: Record<string, string | null | undefined> = {
      meeting_id: meetingId, title: 'Nueva tarea', source: 'manual', priority: 'Media', created_by: currentUserId,
    };
    if (!isJefe) values.assigned_to = currentUserId;
    const { error: err } = await supabase.from('meeting_task_proposals').insert(values);
    if (err) setError('No se pudo agregar la tarea.');
    else onChanged();
  };

  const remove = async (id: string) => {
    setError(null);
    const { error: err } = await supabase.from('meeting_task_proposals').delete().eq('id', id);
    if (err) setError('No se pudo quitar la propuesta.');
    else onChanged();
  };

  return (
    <section className="glass-panel glass-iridescent thick-iridescent rounded-[28px] p-5 flex flex-col gap-4 min-w-0">
      <div className="flex items-center gap-3">
        <span className="tile-3d w-10 h-10 shrink-0 rounded-[13px] flex items-center justify-center" style={{ background: 'linear-gradient(150deg, var(--accent-2), var(--accent))' }}>
          <Sparkles size={20} className="text-white" />
        </span>
        <span className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Tareas propuestas</h2>
          <span className="block text-xs text-[var(--text-secondary)]">
            {pending.length} por revisar · {accepted} {accepted === 1 ? 'aceptada' : 'aceptadas'}
          </span>
        </span>
      </div>

      {/* Estado de la IA */}
      {aiStatus === 'procesando' || processing ? (
        <div className="chip-glass rounded-[16px] p-3 flex items-center gap-3 text-sm text-[var(--text-primary)]">
          <Loader2 size={18} className="animate-spin shrink-0" />
          La IA está escuchando la grabación. Puede tardar unos minutos.
        </div>
      ) : aiStatus === 'error' ? (
        <div className="rounded-[16px] p-3 flex flex-col gap-2 text-sm" style={{ background: 'var(--prio-alta-bg)', color: 'var(--prio-alta-text)' }}>
          <span className="flex items-start gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {aiError || 'No se pudo procesar la grabación.'}</span>
          {isJefe && hasRecording && (
            <button onClick={onProcess} className="self-start inline-flex items-center gap-1.5 font-semibold underline underline-offset-2">
              <RotateCcw size={14} /> Reintentar
            </button>
          )}
        </div>
      ) : null}

      {ordered.length === 0 && aiStatus !== 'procesando' && !processing && (
        <p className="text-sm text-[var(--text-secondary)] py-4 text-center">
          {hasRecording
            ? 'La IA no encontró tareas en la grabación.'
            : 'Graba la junta o sube el audio y la IA propondrá las tareas que se acordaron.'}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {ordered.map((p) => {
          const isAuthor = !!currentUserId && p.created_by === currentUserId;
          const editable = p.status === 'pendiente' && (isJefe || isAuthor);
          const projectOptions = isJefe ? projects : myProjects;
          const proposer = p.source === 'manual' && p.created_by && p.created_by !== p.assigned_to ? emailById[p.created_by] : undefined;
          const ownProposal = p.source === 'manual' && p.created_by && p.created_by === p.assigned_to && !isAuthor;
          const project = projects.find((x) => x.id === p.project_id);
          const assigneeEmail = p.assigned_to ? emailById[p.assigned_to] : undefined;
          const suggestedProjects = !p.project_id && p.assigned_to ? projects.filter((x) => x.leader_id === p.assigned_to) : [];
          return (
            <li
              key={p.id}
              className={`chip-glass rounded-[18px] p-3.5 flex flex-col gap-2.5 border ${p.status === 'aceptada' ? 'border-[var(--ok-text)]' : 'border-[var(--border-card)]'} ${p.status === 'descartada' ? 'opacity-55' : ''}`}
            >
              <div className="flex items-start gap-2">
                {editable ? (
                  <input
                    key={`${p.id}-${p.title}`}
                    defaultValue={p.title}
                    aria-label="Título de la tarea"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== p.title) patch(p.id, { title: v });
                    }}
                    className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-[var(--text-primary)] outline-none border-b border-transparent focus:border-[var(--accent)] py-0.5"
                  />
                ) : (
                  <span className={`flex-1 min-w-0 text-sm font-semibold text-[var(--text-primary)] ${p.status === 'descartada' ? 'line-through' : ''}`}>{p.title}</span>
                )}
                <span className="shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded-[6px] surface-card text-[var(--text-secondary)]">{p.source === 'ia' ? 'IA' : 'manual'}</span>
              </div>

              {p.source_quote && <p className="text-xs italic text-[var(--text-secondary)] leading-relaxed">“{p.source_quote}”</p>}

              {editable ? (
                <div className="grid grid-cols-2 gap-2">
                  <label className="col-span-2 flex flex-col gap-1">
                    <span className="text-[11px] text-[var(--text-secondary)]">Proyecto · responsable</span>
                    <select
                      value={p.project_id ?? ''}
                      onChange={(e) => {
                        const proj = projects.find((x) => x.id === e.target.value);
                        patch(p.id, { project_id: proj?.id ?? null, assigned_to: proj?.leader_id ?? (isJefe ? p.assigned_to : currentUserId ?? null) });
                      }}
                      className={fieldClass}
                    >
                      <option value="">Personal · sin proyecto</option>
                      {isJefe && suggestedProjects.length > 0 && (
                        <optgroup label={`De ${shortName(assigneeEmail)}`}>
                          {suggestedProjects.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </optgroup>
                      )}
                      {projectOptions.length > 0 && (
                        <optgroup label={isJefe ? 'Todos' : 'Mis proyectos'}>
                          {projectOptions.map((x) => <option key={x.id} value={x.id}>{x.name}{isJefe ? ` · ${shortName(x.leader?.email)}` : ''}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </label>
                  {isJefe && !p.project_id && (
                    <label className="col-span-2 flex flex-col gap-1">
                      <span className="text-[11px] text-[var(--text-secondary)]">Responsable (tarea personal)</span>
                      <select value={p.assigned_to ?? ''} onChange={(e) => patch(p.id, { assigned_to: e.target.value || null })} className={fieldClass}>
                        <option value="">Elegir responsable…</option>
                        {attendees.map((a) => <option key={a.id} value={a.id}>{a.email}</option>)}
                        {p.assigned_to && !attendees.some((a) => a.id === p.assigned_to) && (
                          <option value={p.assigned_to}>{emailById[p.assigned_to] ?? 'Otra persona'}</option>
                        )}
                      </select>
                    </label>
                  )}
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-[var(--text-secondary)]">Prioridad</span>
                    <select value={p.priority} onChange={(e) => patch(p.id, { priority: e.target.value as Proposal['priority'] })} className={fieldClass} style={prioStyle(p.priority)}>
                      {PRIORITIES.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-[var(--text-secondary)]">Fecha límite</span>
                    <input type="date" value={p.due_date ?? ''} onChange={(e) => patch(p.id, { due_date: e.target.value || null })} className={fieldClass} />
                  </label>
                  <label className="col-span-2 flex flex-col gap-1">
                    <span className="text-[11px] text-[var(--text-secondary)]">Fecha de prueba (opcional)</span>
                    <input type="date" value={p.test_date ?? ''} onChange={(e) => patch(p.id, { test_date: e.target.value || null })} className={fieldClass} />
                  </label>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                  <span className="px-2 py-1 rounded-[8px]" style={prioStyle(p.priority)}>{p.priority}</span>
                  <span className="px-2 py-1 rounded-[8px] surface-card text-[var(--text-primary)]">{project?.name ?? 'personal'}</span>
                  {p.due_date && <span className="px-2 py-1 rounded-[8px] surface-card text-[var(--text-primary)]">límite {formatDateOnly(p.due_date)}</span>}
                  {p.test_date && <span className="px-2 py-1 rounded-[8px] surface-card text-[var(--text-primary)]">prueba {formatDateOnly(p.test_date)}</span>}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Avatar email={assigneeEmail} highlight={p.assigned_to === currentUserId} size={26} />
                <span className="flex-1 min-w-0 text-xs text-[var(--text-secondary)] truncate">
                  {assigneeEmail ? shortName(assigneeEmail) : 'Sin responsable'}
                  {proposer && ` · propuesta por ${shortName(proposer)}`}
                  {ownProposal && ' · la propuso para sí'}
                  {isJefe && p.status === 'pendiente' && !p.assigned_to && <span style={{ color: 'var(--prio-media-text)' }}> · elige proyecto o responsable para aceptar</span>}
                  {!isJefe && isAuthor && p.status === 'pendiente' && ' · espera a que el jefe la acepte'}
                </span>
              </div>

              {editable && !isJefe && (
                <button
                  onClick={() => remove(p.id)}
                  className="self-start min-h-9 px-3 rounded-[10px] text-[13px] font-semibold surface-card border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] inline-flex items-center gap-1.5"
                >
                  <X size={14} /> Quitar mi propuesta
                </button>
              )}
              {editable && isJefe && (
                <div className="flex gap-2">
                  <button
                    onClick={() => accept(p.id)}
                    disabled={!p.assigned_to || busy !== null}
                    className="nav-active flex-1 min-h-10 rounded-[12px] text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy === p.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Aceptar
                  </button>
                  <button
                    onClick={() => patch(p.id, { status: 'descartada' })}
                    disabled={busy !== null}
                    className="flex-1 min-h-10 rounded-[12px] text-[13px] font-semibold surface-card border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] inline-flex items-center justify-center gap-1.5"
                  >
                    <X size={14} /> Descartar
                  </button>
                </div>
              )}
              {p.status === 'aceptada' && (
                <span className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="font-semibold" style={{ color: 'var(--ok-text)' }}>✓ Tarea creada y asignada</span>
                  <Link href="/dashboard/kanban" className="font-semibold text-[var(--text-primary)] underline underline-offset-2">Ver en tablero</Link>
                </span>
              )}
              {p.status === 'descartada' && isJefe && (
                <button onClick={() => patch(p.id, { status: 'pendiente' })} className="self-start text-[13px] font-semibold text-[var(--text-primary)] underline underline-offset-2 inline-flex items-center gap-1">
                  <RotateCcw size={13} /> Deshacer
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {(isJefe || isAttendee) && (
        <div className="flex flex-wrap gap-2">
          <button onClick={addManual} className="flex-1 min-w-[130px] min-h-11 rounded-[14px] text-[13px] font-semibold chip-glass border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] inline-flex items-center justify-center gap-1.5">
            <Plus size={15} /> {isJefe ? 'Tarea manual' : 'Proponer tarea para mí'}
          </button>
          {isJefe && ready.length > 1 && (
            <button onClick={acceptAll} disabled={busy !== null} className="nav-active flex-1 min-w-[160px] min-h-11 rounded-[14px] text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
              {busy === 'all' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Aceptar {ready.length} listas
            </button>
          )}
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </section>
  );
}
