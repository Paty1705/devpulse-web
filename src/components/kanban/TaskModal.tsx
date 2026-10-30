'use client';

import { X, Copy, Check, FileCode, Users, Lock, Unlock } from 'lucide-react';
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/providers/AuthProvider';
import { Task } from './KanbanBoard';

type TaskModalProps = {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
};

export function TaskModal({ isOpen, onClose, task }: TaskModalProps) {
  const { user, profile } = useAuth();
  const [copied, setCopied] = useState(false);
  const [sqlScript, setSqlScript] = useState(task?.sql_script || '');
  const [assigneeEmail, setAssigneeEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setSqlScript(task.sql_script || '');
      if (task.locked_by) {
        fetchAssignee(task.locked_by);
      } else {
        setAssigneeEmail(null);
      }
    }
  }, [task]);

  const fetchAssignee = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('email').eq('id', userId).single();
    if (data) setAssigneeEmail(data.email);
  };

  if (!isOpen || !task) return null;

  const gitCommand = `git checkout -b feature/TASK-${task.id.substring(0,6)}-${task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  const markdownContent = `
### Especificación Técnica

**Descripción:**
${task.description || 'Sin descripción detallada.'}

**Criterios de Aceptación:**
${task.acceptance_criteria && task.acceptance_criteria.length > 0 
  ? task.acceptance_criteria.map(c => `- ${c}`).join('\n')
  : 'No definidos.'}

**Tipo:** ${task.item_type || 'Feature'}
**Prioridad:** ${task.priority || 'Media'}
`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(gitCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isLockedByMe = task.locked_by === user?.id;
  const isLockedByOther = task.locked_by && task.locked_by !== user?.id;
  const canEdit = isLockedByMe || (!task.locked_by && profile?.role !== 'qa');

  const toggleLock = async () => {
    setSaving(true);
    const newLockedBy = task.locked_by ? null : user?.id;
    await supabase.from('tasks').update({ locked_by: newLockedBy }).eq('id', task.id);
    setSaving(false);
    onClose(); // Cerrar para que el kanban actualice visualmente (en una app robusta actualizaríamos estado local)
  };

  const saveChanges = async () => {
    if (!canEdit) return;
    setSaving(true);
    await supabase.from('tasks').update({ sql_script: sqlScript }).eq('id', task.id);
    setSaving(false);
    onClose();
  };

  const startAudit = async () => {
    if (profile?.role !== 'qa') return;
    setSaving(true);
    
    // Cambiar estado a in_review (por si no lo estaba) y crear auditoría
    await supabase.from('tasks').update({ status: 'in_review' }).eq('id', task.id);
    await supabase.from('audits').insert({
      task_id: task.id,
      auditor_id: user?.id,
      status: 'pending'
    });
    
    setSaving(false);
    alert('Auditoría iniciada correctamente. Revisa la tabla audits.');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] shadow-[var(--shadow-hover)] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">
        
        {/* Header */}
        <div className="px-6 py-5 flex justify-between items-center bg-[var(--bg-column)] border-b border-[var(--border-column)]">
          <div className="flex items-center gap-3">
            <span className="font-mono bg-[var(--badge-bg)] text-[var(--badge-text)] px-2 py-1 rounded-[6px] font-bold text-sm">TASK-{task.id.substring(0,6)}</span>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">{task.title}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-card-hover)] rounded-[6px] text-[var(--text-secondary)] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-8">
          
          {/* Main Info */}
          <div className="flex-1 space-y-6">
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
            </section>

            <section>
              <h3 className="font-bold text-[var(--text-primary)] mb-2">Especificación</h3>
              <div className="prose prose-sm dark:prose-invert max-w-none bg-[var(--bg-column)] p-4 rounded-[6px] border border-[var(--border-card)] text-[var(--text-primary)]">
                <ReactMarkdown>{markdownContent}</ReactMarkdown>
              </div>
            </section>

            <section>
              <h3 className="font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                <FileCode size={18} /> Script SQL Adjunto
              </h3>
              <textarea 
                className="w-full bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[6px] p-3 text-sm font-mono text-[var(--text-primary)] h-32 focus:outline-none focus:border-[var(--btn-primary-bg)]"
                placeholder="Escribe o pega el script SQL de migración aquí..."
                value={sqlScript}
                onChange={e => setSqlScript(e.target.value)}
                disabled={!canEdit}
              />
            </section>
          </div>

          {/* Sidebar */}
          <div className="w-full md:w-64 space-y-6">
            <div className="bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[8px] p-4 space-y-4 shadow-[var(--shadow-subtle)]">
              <div>
                <span className="block text-xs font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Estado</span>
                <span className="inline-block bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] px-2.5 py-1 rounded-[6px] text-sm font-bold uppercase">
                  {task.status.replace('_', ' ')}
                </span>
              </div>
              
              <div>
                <span className="block text-xs font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Asignado a</span>
                {assigneeEmail ? (
                  <div className="flex items-center gap-2 text-sm">
                    <div className="w-6 h-6 bg-[var(--bg-page)] rounded-full flex items-center justify-center font-bold text-[var(--text-primary)] text-xs">
                      {assigneeEmail.substring(0,2).toUpperCase()}
                    </div>
                    <span className="text-[var(--text-primary)] font-medium truncate" title={assigneeEmail}>{assigneeEmail}</span>
                  </div>
                ) : (
                  <span className="text-sm text-[var(--text-secondary)] italic">No asignado</span>
                )}
              </div>

              {isLockedByOther ? (
                <div className="bg-red-900/10 text-red-500 p-3 rounded-[6px] text-xs border border-red-500/30">
                  <span className="font-bold flex items-center gap-1 mb-1"><Lock size={12}/> Bloqueo Exclusivo</span>
                  Esta tarea está siendo intervenida por otro usuario.
                </div>
              ) : (
                <button 
                  onClick={toggleLock} 
                  disabled={saving || profile?.role === 'qa'}
                  className={`w-full flex justify-center items-center gap-2 font-bold py-2 rounded-[6px] text-sm transition-colors ${isLockedByMe ? 'bg-[var(--badge-locked-bg)] text-[var(--badge-locked-text)] hover:brightness-110' : 'bg-[var(--bg-page)] border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'}`}
                >
                  {isLockedByMe ? <><Unlock size={16} /> Desbloquear Tarea</> : <><Lock size={16} /> Bloquear Tarea</>}
                </button>
              )}
            </div>

            <div className="bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[8px] p-4">
              <h4 className="font-bold text-sm mb-3 flex items-center gap-2 text-[var(--text-primary)]">
                <Users size={16} /> Auditoría
              </h4>
              <p className="text-xs text-[var(--text-secondary)] mb-3">La auditoría cruzada se habilita para el rol QA.</p>
              <button 
                onClick={startAudit}
                disabled={profile?.role !== 'qa' || saving} 
                className={`w-full font-bold py-2 rounded-[6px] text-sm transition-colors ${profile?.role === 'qa' ? 'bg-[#D15EEE] text-white hover:brightness-110 shadow-[0_0_15px_rgba(209,94,238,0.3)]' : 'bg-[var(--bg-page)] text-[var(--text-secondary)] cursor-not-allowed opacity-60'}`}
              >
                {saving && profile?.role === 'qa' ? 'Iniciando...' : 'Iniciar Auditoría'}
              </button>
            </div>
          </div>

        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-column)] bg-[var(--bg-column)] flex justify-end gap-3 flex-none">
          <button onClick={onClose} className="px-6 py-2 border border-[var(--border-card)] text-[var(--text-primary)] rounded-[6px] font-bold hover:bg-[var(--bg-page)] transition-colors active:scale-[0.97]">
            Cerrar
          </button>
          <button 
            onClick={saveChanges}
            disabled={!canEdit || saving}
            className={`px-6 py-2 rounded-[6px] font-bold transition-colors active:scale-[0.97] ${canEdit ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:brightness-110' : 'bg-[var(--bg-page)] text-[var(--text-secondary)] cursor-not-allowed opacity-60'}`}
          >
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
