'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Loader2, Plus, RotateCcw, Sparkles, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { assigneeIds, formatDateOnly, PRIORITIES, prioStyle, shortName, splitAssignees, type AiStatus, type PersonRef, type Proposal } from '@/lib/meetings';
import { Avatar } from '@/components/juntas/Avatar';
import { ProposalForm } from '@/components/juntas/ProposalForm';
import { PeoplePicker } from '@/components/PeoplePicker';

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
  onChanged: () => void | Promise<void>;
};

const fieldClass =
  'min-h-9 rounded-[10px] px-2.5 text-[13px] surface-card border border-[var(--border-card)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-70';

export function ProposalsPanel({
  meetingId, proposals, projects, emailById, attendees, isJefe, isAttendee, currentUserId, aiStatus, aiError, hasRecording, processing, onProcess, onChanged,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  // Las tarjetas se muestran resumidas; estas son las que están abiertas.
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [newId, setNewId] = useState<string | null>(null);
  const toggle = (id: string) => setOpenIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  // Los campos guardan al salir de ellos; aceptar espera a que termine ese guardado.
  const saving = useRef<Promise<unknown>>(Promise.resolve());

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
    // Un guardado a la vez, en el orden en que se hicieron los cambios.
    const request = saving.current.then(() => supabase.from('meeting_task_proposals').update(values).eq('id', id));
    saving.current = request.catch(() => undefined);
    const { error: err } = await request;
    if (err) setError('No se pudo guardar el cambio.');
    else await onChanged();
  };

  const accept = async (id: string) => {
    setBusy(id);
    setError(null);
    await saving.current;
    const { error: err } = await supabase.rpc('accept_meeting_proposal', { p_proposal_id: id });
    setBusy(null);
    if (err) setError(`No se pudo crear la tarea: ${err.message}`);
    onChanged();
  };

  const acceptAll = async () => {
    setBusy('all');
    await saving.current;
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
    // Solo el jefe: agrega una propuesta abierta y la completa en la tarjeta.
    const { data, error: err } = await supabase.from('meeting_task_proposals').insert({
      meeting_id: meetingId, title: 'Nueva tarea', source: 'manual', priority: 'Media', created_by: currentUserId,
    }).select('id').single();
    if (err) {
      setError('No se pudo agregar la tarea.');
      return;
    }
    setNewId(data.id);
    setOpenIds((ids) => [...ids, data.id]);
    onChanged();
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
          <span className="flex flex-col gap-1">
            <span>La IA está escuchando la grabación. Puede tardar unos minutos (más o menos la mitad de lo que duró la junta); puedes seguir trabajando.</span>
            {isJefe && hasRecording && !processing && (
              <button onClick={onProcess} className="self-start inline-flex items-center gap-1.5 text-xs font-semibold underline underline-offset-2">
                <RotateCcw size={12} /> ¿Lleva mucho? Reintentar
              </button>
            )}
          </span>
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

      <ul className="panel-body scroll-list flex flex-col gap-3 -mr-2 pr-2 empty:hidden">
        {proposing && !isJefe && currentUserId && (
          <li className="shrink-0">
            <ProposalForm
              meetingId={meetingId}
              currentUserId={currentUserId}
              projects={myProjects}
              attendees={attendees}
              fieldClass={fieldClass}
              onSent={() => {
                setProposing(false);
                onChanged();
              }}
              onCancel={() => setProposing(false)}
            />
          </li>
        )}
        {ordered.map((p) => {
          const isAuthor = !!currentUserId && p.created_by === currentUserId;
          // Si el jefe cambió a la persona principal, quien la propuso ya no puede editarla.
          const editable = p.status === 'pendiente' && (isJefe || (isAuthor && p.assigned_to === currentUserId));
          const people = assigneeIds(p);
          const names = people.map((x) => shortName(emailById[x])).join(', ');
          // Se puede elegir a quienes asisten, además de quien lidera el proyecto o ya estaba elegido.
          const pickable = [
            ...attendees,
            ...[...new Set([...people, ...(projects.find((x) => x.id === p.project_id)?.leader_id ? [projects.find((x) => x.id === p.project_id)!.leader_id!] : [])])]
              .filter((x) => !attendees.some((a) => a.id === x) && emailById[x])
              .map((x) => ({ id: x, email: emailById[x] })),
          ];
          const projectOptions = isJefe ? projects : myProjects;
          const proposer = p.source === 'manual' && p.created_by && p.created_by !== p.assigned_to ? emailById[p.created_by] : undefined;
          const ownProposal = p.source === 'manual' && p.created_by && p.created_by === p.assigned_to && !isAuthor;
          const project = projects.find((x) => x.id === p.project_id);
          const assigneeEmail = p.assigned_to ? emailById[p.assigned_to] : undefined;
          const suggestedProjects = !p.project_id && p.assigned_to ? projects.filter((x) => x.leader_id === p.assigned_to) : [];
          const open = openIds.includes(p.id);
          const waiting = !isJefe && isAuthor && p.status === 'pendiente';
          return (
            <li
              key={p.id}
              className={`chip-glass shrink-0 rounded-[16px] p-3 flex flex-col gap-2 border ${p.status === 'aceptada' ? 'border-[var(--ok-text)]' : 'border-[var(--border-card)]'} ${p.status === 'descartada' ? 'opacity-55' : ''}`}
            >
              <div className="flex items-start gap-2">
                <button type="button" onClick={() => toggle(p.id)} aria-expanded={open} className="flex-1 min-w-0 min-h-8 flex items-center gap-1.5 text-left">
                  <ChevronDown size={15} className={`shrink-0 text-[var(--text-secondary)] transition-transform ${open ? '' : '-rotate-90'}`} />
                  <span className={`min-w-0 text-sm font-semibold text-[var(--text-primary)] break-words ${open ? '' : 'line-clamp-2'} ${p.status === 'descartada' ? 'line-through' : ''}`}>{p.title}</span>
                </button>
                {p.status === 'pendiente' && isJefe && (
                  <span className="shrink-0 flex gap-1.5">
                    <button
                      onClick={() => accept(p.id)}
                      disabled={!p.assigned_to || busy !== null}
                      aria-label={`Aceptar: ${p.title}`}
                      title={p.assigned_to ? 'Aceptar' : 'Elige quién la hará para aceptar'}
                      className="nav-active w-8 h-8 rounded-[10px] inline-flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {busy === p.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    </button>
                    <button
                      onClick={() => patch(p.id, { status: 'descartada' })}
                      disabled={busy !== null}
                      aria-label={`Descartar: ${p.title}`}
                      title="Descartar"
                      className="w-8 h-8 rounded-[10px] surface-card border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] inline-flex items-center justify-center"
                    >
                      <X size={15} />
                    </button>
                  </span>
                )}
                {p.status === 'descartada' && isJefe && (
                  <button onClick={() => patch(p.id, { status: 'pendiente' })} className="shrink-0 min-h-8 text-[13px] font-semibold text-[var(--text-primary)] underline underline-offset-2 inline-flex items-center gap-1">
                    <RotateCcw size={13} /> Deshacer
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-[var(--text-primary)]">
                <span className="px-1.5 py-0.5 rounded-[6px]" style={prioStyle(p.priority)}>{p.priority}</span>
                <span className="px-1.5 py-0.5 rounded-[6px] surface-card">{p.due_date ? `entrega ${formatDateOnly(p.due_date)}${p.due_time ? ` · ${p.due_time.slice(0, 5)}` : ''}` : 'sin fecha'}</span>
                <span className="px-1.5 py-0.5 rounded-[6px] surface-card max-w-[11rem] truncate" title={names || undefined}>
                  {assigneeEmail ? `${shortName(assigneeEmail)}${people.length > 1 ? ` +${people.length - 1}` : ''}` : 'sin responsable'}
                </span>
                <span className="px-1.5 py-0.5 rounded-[6px] surface-card text-[var(--text-secondary)]">{p.source === 'ia' ? 'IA' : 'manual'}</span>
              </div>

              {waiting && !open && <span className="text-xs text-[var(--text-secondary)]">Espera a que el jefe la acepte</span>}
              {p.status === 'aceptada' && (
                <span className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="font-semibold" style={{ color: 'var(--ok-text)' }}>
                    {people.length > 1 ? `✓ ${people.length} tareas creadas, una por persona` : '✓ Tarea creada y asignada'}
                  </span>
                  <Link href="/dashboard/kanban" className="font-semibold text-[var(--text-primary)] underline underline-offset-2">Ver en tablero</Link>
                </span>
              )}

              {open && (
                <div className="flex flex-col gap-2.5 border-t border-[var(--border-card)] pt-2.5">
                  {p.source_quote && <p className="text-xs italic text-[var(--text-secondary)] leading-relaxed">“{p.source_quote}”</p>}

                  {editable ? (
                    <>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] text-[var(--text-secondary)]">Qué hay que hacer</span>
                        <input name="titulo-propuesta"
                          autoFocus={p.id === newId}
                          key={`${p.id}-${p.title}`}
                          defaultValue={p.title}
                          maxLength={200}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== p.title) patch(p.id, { title: v });
                          }}
                          className={`${fieldClass} w-full font-semibold`}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] text-[var(--text-secondary)]">Explicación (opcional)</span>
                        <textarea name="description"
                          key={`${p.id}-${p.description ?? ''}`}
                          defaultValue={p.description ?? ''}
                          rows={3}
                          maxLength={2000}
                          placeholder="En qué consiste, para qué sirve, qué se va a entregar…"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v !== (p.description ?? '')) patch(p.id, { description: v || null });
                          }}
                          className={`${fieldClass} py-2 resize-y`}
                        />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="col-span-2 flex flex-col gap-1">
                          <span className="text-[11px] text-[var(--text-secondary)]">Proyecto</span>
                          <select name="project_id"
                            value={p.project_id ?? ''}
                            onChange={(e) => {
                              const proj = projects.find((x) => x.id === e.target.value);
                              const leader = proj?.leader_id;
                              // Con una sola persona pasa a quien lidera; si ya eran varias, se le suma.
                              const next = !isJefe || !leader ? people : people.length > 1 ? [...new Set([leader, ...people])] : [leader];
                              patch(p.id, { project_id: proj?.id ?? null, ...splitAssignees(next, [isJefe ? leader : currentUserId, p.assigned_to]) });
                            }}
                            className={fieldClass}
                          >
                            <option value="">Sin proyecto</option>
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
                        <div className="col-span-2">
                          <AssigneeField
                            people={pickable}
                            value={people}
                            lockedId={isJefe ? undefined : currentUserId}
                            onSave={(ids) => patch(p.id, splitAssignees(ids, [isJefe ? project?.leader_id : currentUserId, p.assigned_to]))}
                          />
                        </div>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] text-[var(--text-secondary)]">Fecha de entrega</span>
                          <input name="due_date" type="date" key={`${p.id}-due_date-${p.due_date ?? ''}`} defaultValue={p.due_date ?? ''} onBlur={(e) => { if (e.target.value !== (p.due_date ?? '')) patch(p.id, { due_date: e.target.value || null }); }} className={fieldClass} />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] text-[var(--text-secondary)]">Hora de entrega (opcional)</span>
                          <input name="due_time" type="time" key={`${p.id}-due_time-${p.due_time ?? ''}`} defaultValue={p.due_time?.slice(0, 5) ?? ''} onBlur={(e) => { if (e.target.value !== (p.due_time?.slice(0, 5) ?? '')) patch(p.id, { due_time: e.target.value || null }); }} className={fieldClass} />
                        </label>
                        {p.due_time && !p.due_date && <span className="col-span-2 text-xs" style={{ color: 'var(--prio-media-text)' }}>Elige también la fecha para que cuente la hora.</span>}
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] text-[var(--text-secondary)]">Prioridad</span>
                          <select name="priority" value={p.priority} onChange={(e) => patch(p.id, { priority: e.target.value as Proposal['priority'] })} className={fieldClass} style={prioStyle(p.priority)}>
                            {PRIORITIES.map((x) => <option key={x} value={x}>{x}</option>)}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] text-[var(--text-secondary)]">Fecha de prueba (opcional)</span>
                          <input name="test_date" type="date" key={`${p.id}-test_date-${p.test_date ?? ''}`} defaultValue={p.test_date ?? ''} onBlur={(e) => { if (e.target.value !== (p.test_date ?? '')) patch(p.id, { test_date: e.target.value || null }); }} className={fieldClass} />
                        </label>
                      </div>
                    </>
                  ) : (
                    <>
                      {p.description && <p className="text-[13px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words">{p.description}</p>}
                      {p.test_date && <span className="text-xs text-[var(--text-secondary)]">Fecha de prueba: {formatDateOnly(p.test_date)}</span>}
                    </>
                  )}

                  <div className="flex items-center gap-2">
                    <Avatar email={assigneeEmail} highlight={p.assigned_to === currentUserId} size={26} />
                    <span className="flex-1 min-w-0 text-xs text-[var(--text-secondary)]">
                      {names || 'Sin responsable'}
                      {` · ${project?.name ?? 'sin proyecto'}`}
                      {proposer && ` · propuesta por ${shortName(proposer)}`}
                      {ownProposal && ' · la propuso para sí'}
                      {isJefe && p.status === 'pendiente' && !p.assigned_to && <span style={{ color: 'var(--prio-media-text)' }}> · elige quién la hará para aceptar</span>}
                      {waiting && ' · espera a que el jefe la acepte'}
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
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {(isJefe || (isAttendee && !proposing)) && (
        <div className="flex flex-wrap gap-2">
          <button onClick={isJefe ? addManual : () => setProposing(true)} className="flex-1 min-w-[130px] min-h-11 rounded-[14px] text-[13px] font-semibold chip-glass border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] inline-flex items-center justify-center gap-1.5">
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

/** Mantiene lo marcado en pantalla mientras se guarda. */
function AssigneeField({ people, value, lockedId, onSave }: { people: PersonRef[]; value: string[]; lockedId?: string; onSave: (ids: string[]) => Promise<void> }) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const latest = useRef(0);
  const change = async (ids: string[]) => {
    const mine = ++latest.current;
    setDraft(ids);
    await onSave(ids);
    if (mine === latest.current) setDraft(null);
  };
  return <PeoplePicker legend="Responsables" people={people} selected={draft ?? value} onChange={change} lockedId={lockedId} />;
}
