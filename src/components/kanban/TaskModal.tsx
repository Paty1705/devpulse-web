'use client';

import { X, Copy, Check, FileCode, Users, Save, ShieldCheck, ShieldX, Rocket, AlertTriangle, Calendar as CalendarIcon, GitBranch, GitPullRequest } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/providers/AuthProvider';
import { branchNameForTask } from '@/lib/github';

type FullTask = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  is_locked: boolean;
  locked_by: string | null;
  requires_sql: boolean;
  sql_script: string | null;
  pr_url: string | null;
  assigned_to: string | null;
  acceptance_criteria: string[] | null;
  due_date: string | null;
  project_id: string | null;
};

type PrStatus = { state: 'open' | 'closed'; merged: boolean; draft: boolean };

type AssigneeProfile = { email: string; role: string };

type AuditRecord = {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  comments: string | null;
  created_at: string;
  auditor: { email: string } | null;
};

const AUDIT_STATUS_LABELS: Record<AuditRecord['status'], string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

// Separa un ISO string en sus partes de fecha y hora en horario LOCAL, para
// precargar los <input type="date"> / <input type="time"> sin que el huso
// horario corra el día o la hora para atrás (igual criterio que en Agenda).
function toLocalDateTimeParts(iso: string | null) {
  if (!iso) return { date: '', time: '' };
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { date, time };
}

type TaskModalProps = {
  isOpen: boolean;
  onClose: () => void;
  task: { id: string } | null; // Solo necesitamos el id; el resto lo traemos de Supabase
  onUpdated?: () => void; // Refresca el tablero cuando cambia el estado (guardado o auditoría)
};

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  in_progress: 'En Progreso',
  in_review: 'En Pruebas / Auditoría',
  ready: 'Listo para Despliegue',
  completed: 'Completado',
};

export function TaskModal({ isOpen, onClose, task, onUpdated }: TaskModalProps) {
  const { user, profile } = useAuth();
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fullTask, setFullTask] = useState<FullTask | null>(null);
  const [assignee, setAssignee] = useState<AssigneeProfile | null>(null);
  const [lockedByEmail, setLockedByEmail] = useState<string | null>(null);
  const [sqlDraft, setSqlDraft] = useState('');
  const [prUrlDraft, setPrUrlDraft] = useState('');
  const [dueDateDraft, setDueDateDraft] = useState('');
  const [dueTimeDraft, setDueTimeDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [auditComment, setAuditComment] = useState('');
  const [isAuditing, setIsAuditing] = useState(false);
  const [projectRepoUrl, setProjectRepoUrl] = useState<string | null>(null);
  const [branchCreating, setBranchCreating] = useState(false);
  const [branchResult, setBranchResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [prStatus, setPrStatus] = useState<PrStatus | null>(null);
  const [prStatusFailed, setPrStatusFailed] = useState(false);
  const [prStatusLoading, setPrStatusLoading] = useState(false);
  const [leaderProjectIds, setLeaderProjectIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('projects').select('id').eq('leader_id', user.id);
      setLeaderProjectIds(new Set((data || []).map(p => p.id)));
    })();
  }, [user]);

  const fetchTaskDetail = useCallback(async (taskId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, description, status, is_locked, locked_by, requires_sql, sql_script, pr_url, assigned_to, acceptance_criteria, due_date, project_id')
      .eq('id', taskId)
      .single();

    if (error || !data) {
      console.error('Error al cargar detalle de tarea:', error);
      setLoading(false);
      return;
    }

    setFullTask(data as FullTask);
    setSqlDraft(data.sql_script || '');
    setPrUrlDraft(data.pr_url || '');
    const { date, time } = toLocalDateTimeParts(data.due_date);
    setDueDateDraft(date);
    setDueTimeDraft(time);
    setAuditComment('');

    if (data.assigned_to) {
      const { data: profile } = await supabase.from('profiles').select('email, role').eq('id', data.assigned_to).single();
      if (profile) setAssignee(profile as AssigneeProfile);
    } else {
      setAssignee(null);
    }

    if (data.locked_by) {
      const { data: lockProfile } = await supabase.from('profiles').select('email').eq('id', data.locked_by).single();
      setLockedByEmail(lockProfile?.email ?? null);
    } else {
      setLockedByEmail(null);
    }

    if (data.project_id) {
      const { data: projectRow } = await supabase.from('projects').select('repo_url').eq('id', data.project_id).single();
      setProjectRepoUrl(projectRow?.repo_url ?? null);
    } else {
      setProjectRepoUrl(null);
    }

    const { data: auditRows, error: auditsError } = await supabase
      .from('audits')
      .select('id, status, comments, created_at, auditor:profiles(email)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });

    if (!auditsError && auditRows) {
      setAudits(auditRows as unknown as AuditRecord[]);
    } else {
      setAudits([]);
    }

    setLoading(false);
  }, []);

  // Limpia los datos de la tarea anterior en el mismo render en que cambia
  // isOpen/task.id, en vez de en un efecto, para evitar mostrar datos viejos
  // mientras se carga la nueva tarea.
  const activeTaskId = isOpen ? task?.id ?? null : null;
  const [loadedTaskId, setLoadedTaskId] = useState<string | null>(null);
  if (activeTaskId !== loadedTaskId) {
    setLoadedTaskId(activeTaskId);
    setFullTask(null);
    setAssignee(null);
    setLockedByEmail(null);
    setAudits([]);
    setDueDateDraft('');
    setDueTimeDraft('');
    setProjectRepoUrl(null);
    setBranchResult(null);
    setPrStatus(null);
    setPrStatusFailed(false);
  }

  useEffect(() => {
    if (activeTaskId) {
      (async () => {
        await fetchTaskDetail(activeTaskId);
      })();
    }
  }, [activeTaskId, fetchTaskDetail]);

  // Consulta en vivo el estado real del PR en GitHub (abierto/draft/mergeado)
  // en vez de confiar en que alguien actualice el link a mano.
  useEffect(() => {
    const prUrl = fullTask?.pr_url;
    let cancelled = false;
    (async () => {
      setPrStatusLoading(true);
      if (!prUrl) {
        if (!cancelled) {
          setPrStatus(null);
          setPrStatusFailed(false);
          setPrStatusLoading(false);
        }
        return;
      }
      try {
        const res = await fetch('/api/github/pr-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prUrl }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setPrStatusFailed(true);
          setPrStatus(null);
        } else {
          setPrStatusFailed(false);
          setPrStatus(data);
        }
      } catch {
        if (!cancelled) {
          setPrStatusFailed(true);
          setPrStatus(null);
        }
      } finally {
        if (!cancelled) setPrStatusLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fullTask?.pr_url]);

  if (!isOpen) return null;

  // Solo el jefe o la persona asignada pueden modificar la tarea. Si la
  // persona asignada ya la puso "en progreso" (bloqueada por ella), el jefe
  // pierde la posibilidad de modificarla hasta que se libere. Y una vez que
  // entra en auditoría (in_review) o llega a "ready" (lista para desplegar),
  // queda liberada: ni el asignado puede seguir editándola, solo el jefe.
  const isJefe = profile?.role === 'jefe';
  // El líder de un proyecto tiene, dentro de SU proyecto, los mismos permisos
  // que un jefe (ver supabase/add_project_leader_permissions.sql) excepto
  // desplegar — eso sigue siendo exclusivo de isJefe, sin excepción.
  const isManager = isJefe || (!!fullTask?.project_id && leaderProjectIds.has(fullTask.project_id));
  const isOwner = !!fullTask && !!user && fullTask.assigned_to === user.id;
  const lockedByOther = !!fullTask && fullTask.is_locked && fullTask.locked_by !== user?.id;
  const isOwnerEditableStatus = !!fullTask && fullTask.status !== 'in_review' && fullTask.status !== 'ready';
  const canEdit = !!fullTask && ((isManager && !lockedByOther) || (isOwner && isOwnerEditableStatus));

  // QA revisa y deja comentarios/sugerencias (no decide nada). La decisión
  // final de aprobar o rechazar -- que es lo que mueve la tarea -- la toma
  // el jefe o el líder del proyecto.
  const isQA = profile?.role === 'qa';
  const canReview = !!fullTask && fullTask.status === 'in_review' && isQA && !isOwner;
  const canDecide = !!fullTask && fullTask.status === 'in_review' && isManager && !isOwner;

  // El despliegue final ("ready" -> "completed") también es una decisión
  // exclusiva del jefe. Si pudimos verificar el PR en GitHub y NO está
  // mergeado, se bloquea aunque haya una URL cargada. Si no pudimos
  // verificarlo (sin GITHUB_TOKEN, PR eliminado, etc.) no bloqueamos por eso
  // solo: se mantiene el comportamiento anterior (basta con tener la URL).
  const prBlocksDeploy = !!prStatus && !prStatus.merged;
  const canDeploy = !!fullTask && fullTask.status === 'ready' && isJefe;

  const branchName = fullTask ? branchNameForTask(fullTask.id, fullTask.title) : 'feature/TASK-000-tarea';
  const gitCommand = `git checkout -b ${branchName}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(gitCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateBranchNow = async () => {
    if (!fullTask || !projectRepoUrl) return;
    setBranchCreating(true);
    setBranchResult(null);
    try {
      const res = await fetch('/api/github/create-branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: projectRepoUrl, branchName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBranchResult({ ok: false, message: data.error || 'Error desconocido.' });
      } else {
        setBranchResult({ ok: true, message: data.alreadyExisted ? 'La rama ya existía en GitHub.' : 'Rama creada en GitHub.' });
        // Registro para el control de versiones (quién, qué proyecto, cuándo).
        if (fullTask.project_id) {
          const { error: logError } = await supabase.from('branch_logs').insert([{
            project_id: fullTask.project_id,
            task_id: fullTask.id,
            branch_name: branchName,
            created_by: user?.id,
            already_existed: !!data.alreadyExisted,
          }]);
          if (logError) console.warn('No se pudo registrar la rama en el control de versiones:', logError.message);
        }
      }
    } catch (err) {
      setBranchResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBranchCreating(false);
    }
  };

  const handleSave = async () => {
    if (!fullTask || !canEdit) return;
    setIsSaving(true);
    const isoDueDate = dueDateDraft ? new Date(`${dueDateDraft}T${dueTimeDraft || '23:59'}:00`).toISOString() : null;
    const { error } = await supabase
      .from('tasks')
      .update({ sql_script: sqlDraft, pr_url: prUrlDraft.trim() || null, due_date: isoDueDate })
      .eq('id', fullTask.id);
    setIsSaving(false);
    if (error) {
      alert('Error al guardar: ' + error.message);
    } else {
      onUpdated?.();
      await fetchTaskDetail(fullTask.id);
    }
  };

  const handleDeploy = async () => {
    if (!fullTask || !canDeploy) return;
    setIsDeploying(true);
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'completed' })
      .eq('id', fullTask.id);
    setIsDeploying(false);
    if (error) {
      alert('Error al marcar como desplegado: ' + error.message);
    } else {
      onUpdated?.();
      onClose();
    }
  };

  const handleDecision = async (status: 'approved' | 'rejected') => {
    if (!fullTask || !user || !canDecide) return;
    setIsAuditing(true);
    // El trigger on_audit_result (apply_audit_result()) se encarga de mover
    // tasks.status y el lock según el resultado: no hace falta actualizarlo
    // desde acá.
    const { error } = await supabase.from('audits').insert([{
      task_id: fullTask.id,
      auditor_id: user.id,
      status,
      comments: auditComment.trim() || null,
    }]);
    setIsAuditing(false);
    if (error) {
      alert('Error al registrar la decisión: ' + error.message);
    } else {
      onUpdated?.();
      onClose();
    }
  };

  const handleReview = async () => {
    if (!fullTask || !user || !canReview || !auditComment.trim()) return;
    setIsAuditing(true);
    const { error } = await supabase.from('audits').insert([{
      task_id: fullTask.id,
      auditor_id: user.id,
      status: 'pending',
      comments: auditComment.trim(),
    }]);
    setIsAuditing(false);
    if (error) {
      alert('Error al registrar la revisión: ' + error.message);
    } else {
      setAuditComment('');
      onUpdated?.();
      await fetchTaskDetail(fullTask.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] shadow-[var(--shadow-hover)] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        <div className="px-6 py-5 flex justify-between items-center bg-[var(--bg-column)] border-b border-[var(--border-column)]">
          <div className="flex items-center gap-3 min-w-0">
            <span className="font-mono bg-[var(--badge-bg)] text-[var(--badge-text)] px-2 py-1 rounded-[6px] font-bold text-sm flex-shrink-0">
              TASK-{(fullTask?.id || '000').slice(0, 6)}
            </span>
            <h2 className="text-xl font-bold text-[var(--text-primary)] truncate">{loading ? 'Cargando...' : fullTask?.title || 'Tarea'}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-card-hover)] rounded-[6px] text-[var(--text-secondary)] transition-colors flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 p-12 text-center text-[var(--text-secondary)]">Cargando detalle de la tarea...</div>
        ) : !fullTask ? (
          <div className="flex-1 p-12 text-center text-[var(--text-secondary)]">No se pudo cargar la tarea.</div>
        ) : (
        <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-8">

          <div className="flex-1 space-y-6">
            {fullTask.status !== 'completed' && fullTask.due_date && new Date(fullTask.due_date) < new Date(new Date().toDateString()) && (
              <div className="bg-red-900/10 text-red-500 border border-red-500/30 rounded-[6px] px-4 py-3 text-sm font-bold flex items-center gap-2">
                <AlertTriangle size={16} /> Tarea atrasada: venció el {new Date(fullTask.due_date).toLocaleDateString()}.
              </div>
            )}
            <section>
              <h3 className="font-bold text-[var(--text-primary)] mb-2">Comando de Git</h3>
              <div className="flex items-center gap-2 bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] p-1">
                <code className="flex-1 px-3 py-2 text-sm text-[var(--text-primary)] overflow-x-auto whitespace-nowrap">
                  {gitCommand}
                </code>
                <button
                  onClick={copyToClipboard}
                  className="p-2 bg-[var(--bg-page)] text-[var(--text-secondary)] hover:bg-[var(--btn-primary-bg)] hover:text-[var(--btn-primary-text)] border border-[var(--border-card)] rounded-[6px] transition-colors"
                  title="Copiar comando"
                >
                  {copied ? <Check size={18} className="text-[var(--btn-primary-bg)]" /> : <Copy size={18} />}
                </button>
              </div>
              {projectRepoUrl ? (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    onClick={handleCreateBranchNow}
                    disabled={branchCreating}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--btn-primary-bg)] hover:border-[var(--btn-primary-bg)] transition-colors disabled:opacity-50"
                  >
                    <GitBranch size={14} /> {branchCreating ? 'Creando...' : 'Crear rama en GitHub'}
                  </button>
                  {branchResult && (
                    <span className={`text-xs ${branchResult.ok ? 'text-emerald-500' : 'text-red-500'}`}>{branchResult.message}</span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-[var(--text-secondary)] mt-1">Este proyecto no tiene repositorio de GitHub configurado.</p>
              )}
            </section>

            <section>
              <h3 className="font-bold text-[var(--text-primary)] mb-2">Especificación</h3>
              <div className="prose prose-sm dark:prose-invert max-w-none bg-[var(--bg-column)] p-4 rounded-[6px] border border-[var(--border-card)] text-[var(--text-primary)]">
                {fullTask.description ? (
                  <ReactMarkdown>{fullTask.description}</ReactMarkdown>
                ) : (
                  <p className="text-[var(--text-secondary)] italic">Sin descripción.</p>
                )}
              </div>
              {fullTask.acceptance_criteria && fullTask.acceptance_criteria.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-1">Criterios de Aceptación</h4>
                  <ul className="text-sm text-[var(--text-primary)] list-disc pl-5 space-y-0.5">
                    {fullTask.acceptance_criteria.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
            </section>

            <section>
              <h3 className="font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                <FileCode size={18} /> Script SQL Adjunto
              </h3>
              <textarea
                className="w-full bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[6px] p-3 text-sm font-mono text-[var(--text-primary)] h-32 focus:outline-none focus:border-[var(--btn-primary-bg)] disabled:opacity-60"
                placeholder="Sin script SQL para esta tarea."
                value={sqlDraft}
                onChange={(e) => setSqlDraft(e.target.value)}
                disabled={!fullTask.requires_sql || !canEdit}
              />
              {!fullTask.requires_sql ? (
                <p className="text-xs text-[var(--text-secondary)] mt-1">Esta tarea no está marcada como que requiere cambios de BD.</p>
              ) : !canEdit && (
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  {lockedByOther
                    ? `Bloqueada por ${lockedByEmail || 'la persona asignada'}: nadie más puede editarla mientras esté en progreso.`
                    : `Solo el jefe o la persona asignada pueden editar este campo${fullTask.status === 'in_review' ? ' mientras no esté en auditoría' : ''}.`}
                </p>
              )}
            </section>
          </div>

          <div className="w-full md:w-64 space-y-6">
            <div className="bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[8px] p-4 space-y-4 shadow-[var(--shadow-subtle)]">
              <div>
                <span className="block text-xs font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Estado</span>
                <span className="inline-block bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] px-2.5 py-1 rounded-[6px] text-sm font-bold">
                  {STATUS_LABELS[fullTask.status] || fullTask.status}
                </span>
              </div>

              <div>
                <span className="block text-xs font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Asignado a</span>
                {assignee ? (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-6 h-6 bg-[var(--bg-page)] rounded-full flex items-center justify-center font-bold text-[var(--text-primary)] text-xs">
                      {assignee.email.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-[var(--text-primary)] font-medium truncate">{assignee.email}</span>
                  </div>
                ) : (
                  <span className="text-sm text-[var(--text-secondary)] italic">Sin asignar</span>
                )}
              </div>

              <div>
                <span className="block text-xs font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarIcon size={12} /> Fecha límite
                </span>
                {canEdit ? (
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={dueDateDraft}
                      onChange={(e) => setDueDateDraft(e.target.value)}
                      className="flex-1 bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[6px] p-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                    />
                    <input
                      type="time"
                      value={dueTimeDraft}
                      onChange={(e) => setDueTimeDraft(e.target.value)}
                      disabled={!dueDateDraft}
                      className="flex-1 bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[6px] p-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)] disabled:opacity-50"
                    />
                  </div>
                ) : fullTask.due_date ? (
                  <span className="text-sm text-[var(--text-primary)] font-medium">{new Date(fullTask.due_date).toLocaleString()}</span>
                ) : (
                  <span className="text-sm text-[var(--text-secondary)] italic">Sin fecha límite</span>
                )}
              </div>

              <div>
                <span className="block text-xs font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Pull Request</span>
                {canEdit ? (
                  <input
                    type="url"
                    value={prUrlDraft}
                    onChange={(e) => setPrUrlDraft(e.target.value)}
                    placeholder="https://github.com/.../pull/123"
                    className="w-full bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[6px] p-2 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                  />
                ) : fullTask.pr_url ? (
                  <a href={fullTask.pr_url} target="_blank" rel="noreferrer" className="text-sm text-[var(--btn-primary-bg)] hover:underline break-all">
                    {fullTask.pr_url}
                  </a>
                ) : (
                  <span className="text-sm text-[var(--text-secondary)] italic">Sin PR asociado</span>
                )}
                {fullTask.pr_url && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                    <GitPullRequest size={12} className="flex-shrink-0" />
                    {prStatusLoading ? (
                      <span className="text-[var(--text-secondary)]">Consultando estado en GitHub...</span>
                    ) : prStatusFailed ? (
                      <span className="text-[var(--text-secondary)]">No se pudo verificar el estado en GitHub.</span>
                    ) : prStatus?.merged ? (
                      <span className="text-emerald-500 font-bold">Mergeado</span>
                    ) : prStatus?.draft ? (
                      <span className="text-amber-500 font-bold">Borrador (draft)</span>
                    ) : prStatus?.state === 'closed' ? (
                      <span className="text-red-500 font-bold">Cerrado sin mergear</span>
                    ) : prStatus?.state === 'open' ? (
                      <span className="text-[var(--btn-primary-bg)] font-bold">Abierto</span>
                    ) : null}
                  </div>
                )}
              </div>

              {fullTask.is_locked && (
                <div className="bg-red-900/10 text-red-500 p-3 rounded-[6px] text-xs border border-red-500/30">
                  <span className="font-bold flex items-center gap-1 mb-1">Bloqueo Exclusivo Activo</span>
                  {lockedByEmail ? `Intervenida por ${lockedByEmail}.` : 'Esta tarea está siendo intervenida.'}
                </div>
              )}
            </div>

            <div className="bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[8px] p-4 space-y-3">
              <h4 className="font-bold text-sm flex items-center gap-2 text-[var(--text-primary)]">
                <Users size={16} /> Auditoría
              </h4>

              {fullTask.status !== 'in_review' ? (
                <p className="text-xs text-[var(--text-secondary)]">La auditoría cruzada se habilita cuando la tarea pasa a la columna de Pruebas.</p>
              ) : canDecide ? (
                <>
                  <p className="text-xs text-[var(--text-secondary)]">Revisa el trabajo (y los comentarios de QA si los hay) y apruébalo, o recházalo indicando los cambios necesarios.</p>
                  <textarea
                    value={auditComment}
                    onChange={(e) => setAuditComment(e.target.value)}
                    placeholder="Comentario / cambios sugeridos (opcional para aprobar, recomendado al rechazar)"
                    className="w-full bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[6px] p-2 text-xs text-[var(--text-primary)] h-20 focus:outline-none focus:border-[var(--btn-primary-bg)]"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDecision('approved')}
                      disabled={isAuditing}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-[6px] text-sm transition-colors disabled:opacity-50"
                    >
                      <ShieldCheck size={16} /> Aprobar
                    </button>
                    <button
                      onClick={() => handleDecision('rejected')}
                      disabled={isAuditing}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-500 text-white font-bold py-2 rounded-[6px] text-sm transition-colors disabled:opacity-50"
                    >
                      <ShieldX size={16} /> Rechazar
                    </button>
                  </div>
                </>
              ) : canReview ? (
                <>
                  <p className="text-xs text-[var(--text-secondary)]">Deja tu revisión y los cambios que sugieres. El jefe decide si se aprueba o se rechaza.</p>
                  <textarea
                    value={auditComment}
                    onChange={(e) => setAuditComment(e.target.value)}
                    placeholder="Qué revisaste y qué cambios sugieres (obligatorio)"
                    className="w-full bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[6px] p-2 text-xs text-[var(--text-primary)] h-20 focus:outline-none focus:border-[var(--btn-primary-bg)]"
                  />
                  <button
                    onClick={handleReview}
                    disabled={isAuditing || !auditComment.trim()}
                    className="w-full flex items-center justify-center gap-1.5 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-bold py-2 rounded-[6px] text-sm transition-colors disabled:opacity-50"
                  >
                    <Users size={16} /> {isAuditing ? 'Enviando...' : 'Enviar revisión'}
                  </button>
                </>
              ) : isOwner ? (
                <p className="text-xs text-[var(--text-secondary)]">No puedes auditar tu propia tarea. Está a la espera de revisión de QA y de la decisión del jefe.</p>
              ) : (
                <p className="text-xs text-[var(--text-secondary)]">Esta tarea está en auditoría. QA puede dejar comentarios y el jefe decide si se aprueba o se rechaza.</p>
              )}

              {audits.length > 0 && (
                <div className="pt-2 border-t border-[var(--border-column)] space-y-2">
                  <h5 className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">Historial</h5>
                  {audits.map(a => (
                    <div key={a.id} className="text-xs bg-[var(--bg-page)] border border-[var(--border-column)] rounded-[6px] p-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className={`font-bold ${a.status === 'approved' ? 'text-emerald-500' : a.status === 'rejected' ? 'text-red-500' : 'text-[var(--text-secondary)]'}`}>
                          {AUDIT_STATUS_LABELS[a.status]}
                        </span>
                        <span className="text-[var(--text-secondary)]">{a.auditor?.email ?? 'QA'}</span>
                      </div>
                      {a.comments && <p className="text-[var(--text-primary)]">{a.comments}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {fullTask.status === 'ready' && (
              <div className="bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[8px] p-4 space-y-3">
                <h4 className="font-bold text-sm flex items-center gap-2 text-[var(--text-primary)]">
                  <Rocket size={16} /> Despliegue
                </h4>
                {canDeploy ? (
                  <>
                    <p className="text-xs text-[var(--text-secondary)]">Auditoría aprobada. Confirma el despliegue para marcarla como completada.</p>
                    {!fullTask.pr_url && (
                      <p className="text-xs text-amber-500">Carga la URL del Pull Request antes de desplegar.</p>
                    )}
                    {fullTask.pr_url && prBlocksDeploy && (
                      <p className="text-xs text-amber-500">El Pull Request todavía no fue mergeado en GitHub ({prStatus?.draft ? 'borrador' : prStatus?.state === 'closed' ? 'cerrado sin mergear' : 'abierto'}).</p>
                    )}
                    <button
                      onClick={handleDeploy}
                      disabled={isDeploying || !fullTask.pr_url || prBlocksDeploy}
                      className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-[6px] text-sm transition-colors disabled:opacity-50"
                    >
                      <Rocket size={16} /> {isDeploying ? 'Desplegando...' : 'Marcar como Desplegado'}
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)]">Lista para desplegar. Solo el jefe puede confirmar el despliegue final.</p>
                )}
              </div>
            )}
          </div>

        </div>
        )}

        <div className="px-6 py-4 border-t border-[var(--border-column)] bg-[var(--bg-column)] flex justify-end gap-3 flex-none">
          <button onClick={onClose} className="px-6 py-2 border border-[var(--border-card)] text-[var(--text-primary)] rounded-[6px] font-bold hover:bg-[var(--bg-page)] transition-colors active:scale-[0.97]">
            Cerrar
          </button>
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={!fullTask || isSaving}
              className="px-6 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-[6px] font-bold hover:brightness-110 transition-colors disabled:opacity-50 flex items-center gap-2 active:scale-[0.97]"
            >
              <Save size={16} />
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
