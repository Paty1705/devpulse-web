'use client';

import { X, Plus, Briefcase } from 'lucide-react';
import { useState } from 'react';

type QuickAddModalProps = {
  isOpen: boolean;
  date: Date | null;
  isJefe: boolean;
  onClose: () => void;
  onAddPersonal: (title: string) => Promise<void>;
  onCreateWorkTask: () => void;
};

export function QuickAddModal({ isOpen, date, isJefe, onClose, onAddPersonal, onCreateWorkTask }: QuickAddModalProps) {
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen || !date) return null;

  const dateLabel = date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  const handleAddPersonal = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    await onAddPersonal(title.trim());
    setIsSaving(false);
    setTitle('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] shadow-[var(--shadow-hover)] w-full max-w-sm flex flex-col overflow-hidden">
        <div className="px-5 py-4 flex justify-between items-center bg-[var(--bg-column)] border-b border-[var(--border-column)]">
          <h2 className="text-sm font-bold text-[var(--text-primary)] capitalize">{dateLabel}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-[var(--bg-card-hover)] rounded-[6px] text-[var(--text-secondary)] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2">Nota personal</label>
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddPersonal(); }}
                placeholder="Ej: Dentista, entregar reporte..."
                className="flex-1 bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] p-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
              />
              <button
                onClick={handleAddPersonal}
                disabled={isSaving || !title.trim()}
                className="px-3 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-[6px] font-bold hover:brightness-110 transition-colors disabled:opacity-50 flex items-center justify-center"
              >
                <Plus size={18} />
              </button>
            </div>
            <p className="text-[10px] text-[var(--text-secondary)] mt-1">Solo tú la ves, no forma parte de ningún proyecto.</p>
          </div>

          {isJefe && (
            <div className="pt-4 border-t border-[var(--border-column)]">
              <button
                onClick={onCreateWorkTask}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-[var(--bg-column)] border border-[var(--border-column)] rounded-[6px] text-sm font-bold text-[var(--text-primary)] hover:border-[var(--btn-primary-bg)] hover:text-[var(--btn-primary-bg)] transition-colors"
              >
                <Briefcase size={16} /> Crear tarea de trabajo
              </button>
              <p className="text-[10px] text-[var(--text-secondary)] mt-1">Abre el formulario completo de Kanban con esta fecha precargada.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
