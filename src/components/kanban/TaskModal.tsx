'use client';

import { X, Copy, Check, FileCode, Users } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

type TaskModalProps = {
  isOpen: boolean;
  onClose: () => void;
  task: any; // Simplified for now
};

export function TaskModal({ isOpen, onClose, task }: TaskModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const gitCommand = `git checkout -b feature/TASK-${task?.id || '000'}-${task?.title?.toLowerCase().replace(/\s+/g, '-') || 'tarea'}`;
  
  const mockMarkdown = `
### Descripción Técnica
El objetivo es migrar la tabla de usuarios a un nuevo esquema respetando el RLS.

**Pasos requeridos:**
1. Crear el esquema SQL.
2. Actualizar las funciones de Supabase.
`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(gitCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] shadow-[var(--shadow-hover)] w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-5 flex justify-between items-center bg-[var(--bg-column)] border-b border-[var(--border-column)]">
          <div className="flex items-center gap-3">
            <span className="font-mono bg-[var(--badge-bg)] text-[var(--badge-text)] px-2 py-1 rounded-[6px] font-bold text-sm">TASK-{task?.id || '000'}</span>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">{task?.title || 'Detalle de Tarea'}</h2>
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
                <ReactMarkdown>{mockMarkdown}</ReactMarkdown>
              </div>
            </section>

            <section>
              <h3 className="font-bold text-[var(--text-primary)] mb-2 flex items-center gap-2">
                <FileCode size={18} /> Script SQL Adjunto
              </h3>
              <textarea 
                className="w-full bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[6px] p-3 text-sm font-mono text-[var(--text-primary)] h-32 focus:outline-none focus:border-[var(--btn-primary-bg)]"
                placeholder="Escribe o pega el script SQL de migración aquí..."
                defaultValue={"ALTER TABLE public.profiles ADD COLUMN new_field TEXT;"}
                disabled={task?.is_locked}
              />
            </section>
          </div>

          {/* Sidebar */}
          <div className="w-full md:w-64 space-y-6">
            <div className="bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[8px] p-4 space-y-4 shadow-[var(--shadow-subtle)]">
              <div>
                <span className="block text-xs font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Estado</span>
                <span className="inline-block bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] px-2.5 py-1 rounded-[6px] text-sm font-bold">En Progreso</span>
              </div>
              
              <div>
                <span className="block text-xs font-bold text-[var(--text-secondary)] mb-1 uppercase tracking-wider">Asignado a</span>
                <div className="flex items-center gap-2 text-sm">
                  <div className="w-6 h-6 bg-[var(--bg-page)] rounded-full flex items-center justify-center font-bold text-[var(--text-primary)]">JD</div>
                  <span className="text-[var(--text-primary)] font-medium">Juan Desarrollador</span>
                </div>
              </div>

              {task?.is_locked && (
                <div className="bg-red-900/10 text-red-500 p-3 rounded-[6px] text-xs border border-red-500/30">
                  <span className="font-bold flex items-center gap-1 mb-1">Bloqueo Exclusivo Activo</span>
                  Esta tarea está siendo intervenida. Campos técnicos deshabilitados.
                </div>
              )}
            </div>

            <div className="bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[8px] p-4">
              <h4 className="font-bold text-sm mb-3 flex items-center gap-2 text-[var(--text-primary)]">
                <Users size={16} /> Auditoría
              </h4>
              <p className="text-xs text-[var(--text-secondary)] mb-3">La auditoría cruzada se habilita en la columna de Pruebas.</p>
              <button disabled className="w-full bg-[var(--bg-page)] text-[var(--text-secondary)] font-bold py-2 rounded-[6px] text-sm cursor-not-allowed opacity-60">
                Iniciar Auditoría
              </button>
            </div>
          </div>

        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-[var(--border-column)] bg-[var(--bg-column)] flex justify-end gap-3 flex-none">
          <button onClick={onClose} className="px-6 py-2 border border-[var(--border-card)] text-[var(--text-primary)] rounded-[6px] font-bold hover:bg-[var(--bg-page)] transition-colors active:scale-[0.97]">
            Cerrar
          </button>
          <button className="px-6 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-[6px] font-bold hover:brightness-110 transition-colors active:scale-[0.97]">
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
}
