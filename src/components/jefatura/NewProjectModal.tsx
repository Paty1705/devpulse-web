'use client';

import { X, Bot, Save, Users, User as UserIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type Profile = { id: string; email: string; role: string };

type NewProjectModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: () => void;
};

export function NewProjectModal({ isOpen, onClose, onProjectCreated }: NewProjectModalProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [mode, setMode] = useState<'individual' | 'team'>('individual');
  
  // Asignaciones
  const [leaderId, setLeaderId] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  
  // IA
  const [spec, setSpec] = useState('');
  const [generatedTasks, setGeneratedTasks] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchProfiles();
      // Reset state on open
      setName('');
      setDescription('');
      setRepoUrl('');
      setSpec('');
      setGeneratedTasks([]);
    }
  }, [isOpen]);

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('id, email, role');
    if (data) setProfiles(data);
  };

  if (!isOpen) return null;

  const toggleMember = (id: string) => {
    if (selectedMembers.includes(id)) {
      setSelectedMembers(selectedMembers.filter(m => m !== id));
    } else {
      setSelectedMembers([...selectedMembers, id]);
    }
  };

  const handleGenerateTasks = async () => {
    if (!spec.trim()) return;
    setIsGenerating(true);
    setGeneratedTasks([]);
    try {
      const res = await fetch('/api/ai/generate-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error desconocido al generar tareas.');
      }
      if (data.tasks && Array.isArray(data.tasks)) {
        setGeneratedTasks(data.tasks);
      }
    } catch (error: any) {
      alert("Error de IA: " + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !repoUrl.trim() || !leaderId) {
      alert("Por favor completa los campos obligatorios: Nombre, Repositorio y Responsable/Líder.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Insertar Proyecto
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .insert([{
          name,
          description,
          repo_url: repoUrl,
          mode,
          leader_id: leaderId
        }])
        .select()
        .single();

      if (projectError) throw projectError;

      // 2. Insertar Miembros si es equipo
      if (mode === 'team' && selectedMembers.length > 0) {
        const membersToInsert = selectedMembers.map(userId => ({
          project_id: projectData.id,
          user_id: userId
        }));
        
        const { error: membersError } = await supabase
          .from('project_members')
          .insert(membersToInsert);
          
        if (membersError) throw membersError;
      }

      // 3. Insertar Tareas Generadas por IA
      if (generatedTasks.length > 0) {
        const tasksToInsert = generatedTasks.map(t => ({
          project_id: projectData.id,
          status: 'backlog', // Estado inicial según enum
          title: t.title,
          description: t.description,
          item_type: t.itemType,
          priority: t.priority,
          acceptance_criteria: t.acceptanceCriteria || []
        }));

        const { error: tasksError } = await supabase
          .from('tasks')
          .insert(tasksToInsert);

        if (tasksError) {
          console.error("Error al insertar tareas:", tasksError);
          // No bloqueamos la creación del proyecto si fallan las tareas
          alert("Proyecto creado, pero hubo un problema al guardar las tareas generadas.");
        }
      }

      alert("Proyecto creado exitosamente.");
      onProjectCreated();
      onClose();
    } catch (error: any) {
      console.error("Detalle del error:", error);
      alert("Error al crear el proyecto: " + (error.message || JSON.stringify(error)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] shadow-[var(--shadow-hover)] w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        
        <div className="px-6 py-5 flex justify-between items-center bg-[var(--bg-column)] border-b border-[var(--border-column)] flex-none z-10">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Nuevo Proyecto</h2>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-card-hover)] rounded-[6px] text-[var(--text-secondary)] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Bloque 1: Básicos */}
          <section className="space-y-4">
            <h3 className="font-bold text-lg text-[var(--text-primary)] pb-2 flex items-center gap-2 border-b border-[var(--border-column)]">
              <span className="bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] w-6 h-6 rounded flex items-center justify-center text-sm font-bold">1</span>
              Información General
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-1">Nombre del Proyecto</label>
                <input 
                  type="text" required value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                  placeholder="Ej: DevPulse v2"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-1">URL del Repositorio Git</label>
                <input 
                  type="url" required value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)}
                  className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                  placeholder="https://github.com/..."
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-[var(--text-secondary)] mb-1">Descripción</label>
              <textarea 
                rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Resumen general del sistema..."
                className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
              />
            </div>
          </section>

          {/* Bloque 2: Modalidad */}
          <section className="space-y-4">
            <h3 className="font-bold text-lg text-[var(--text-primary)] pb-2 flex items-center gap-2 border-b border-[var(--border-column)]">
              <span className="bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] w-6 h-6 rounded flex items-center justify-center text-sm font-bold">2</span>
              Modalidad y Equipo
            </h3>

            <div className="flex gap-4">
              <label className={`flex-1 cursor-pointer border rounded-[8px] p-4 flex items-center gap-4 transition-colors ${mode === 'individual' ? 'border-[var(--btn-primary-bg)] bg-[var(--bg-column)]' : 'border-[var(--border-card)] hover:bg-[var(--bg-card-hover)]'}`}>
                <input type="radio" name="mode" value="individual" checked={mode === 'individual'} onChange={() => setMode('individual')} className="hidden" />
                <div className={`w-10 h-10 rounded-[6px] flex items-center justify-center ${mode === 'individual' ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]' : 'bg-[var(--bg-page)] text-[var(--text-secondary)]'}`}>
                  <UserIcon size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-[var(--text-primary)]">Individual</h3>
                  <p className="text-xs text-[var(--text-secondary)]">Un solo responsable</p>
                </div>
              </label>

              <label className={`flex-1 cursor-pointer border rounded-[8px] p-4 flex items-center gap-4 transition-colors ${mode === 'team' ? 'border-[var(--btn-primary-bg)] bg-[var(--bg-column)]' : 'border-[var(--border-card)] hover:bg-[var(--bg-card-hover)]'}`}>
                <input type="radio" name="mode" value="team" checked={mode === 'team'} onChange={() => setMode('team')} className="hidden" />
                <div className={`w-10 h-10 rounded-[6px] flex items-center justify-center ${mode === 'team' ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)]' : 'bg-[var(--bg-page)] text-[var(--text-secondary)]'}`}>
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-[var(--text-primary)]">En Equipo</h3>
                  <p className="text-xs text-[var(--text-secondary)]">Múltiples colaboradores</p>
                </div>
              </label>
            </div>

            <div className="bg-[var(--bg-column)] border border-[var(--border-card)] p-4 rounded-[8px] space-y-4">
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-1">
                  {mode === 'individual' ? 'Responsable Único' : 'Líder del Proyecto'}
                </label>
                <select 
                  value={leaderId} onChange={(e) => setLeaderId(e.target.value)}
                  className="w-full bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[6px] p-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                >
                  <option value="">Seleccionar responsable...</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.email} ({p.role})</option>)}
                </select>
              </div>

              {mode === 'team' && (
                <div>
                  <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">Colaboradores Autorizados</label>
                  <div className="max-h-32 overflow-y-auto space-y-2 border border-[var(--border-card)] p-2 rounded-[6px] bg-[var(--bg-page)]">
                    {profiles.map(p => (
                      <label key={p.id} className="flex items-center gap-2 text-sm text-[var(--text-primary)] cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={selectedMembers.includes(p.id)}
                          onChange={() => toggleMember(p.id)}
                          className="rounded-[4px] text-[var(--btn-primary-bg)] focus:ring-[var(--btn-primary-bg)] bg-[var(--bg-column)] border-[var(--border-card)]" 
                        /> 
                        {p.email} <span className="text-xs text-[var(--text-secondary)]">({p.role})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Bloque 3: Asistente IA */}
          <section className="bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[8px] p-5 shadow-[var(--shadow-subtle)]">
            <div className="flex items-center gap-3 mb-3 text-[var(--text-primary)]">
              <Bot size={24} className="text-[var(--btn-primary-bg)]" />
              <h3 className="font-bold">Asistente IA (Generación de Tareas)</h3>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-3">Pega las especificaciones en bruto. El sistema conectará con IA para generar las tareas de backlog automáticamente.</p>
            <textarea 
              value={spec} onChange={(e) => setSpec(e.target.value)}
              className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] p-3 text-sm text-[var(--text-primary)] h-24 focus:outline-none focus:border-[var(--btn-primary-bg)] placeholder-[var(--text-secondary)] opacity-80 mb-3"
              placeholder="Ej: 'El sistema debe tener un login, una tabla de usuarios y exportar a PDF...'"
            />
            
            <button 
              type="button" 
              onClick={handleGenerateTasks} 
              disabled={isGenerating || !spec.trim()}
              className="w-full py-2 bg-[var(--bg-column)] border border-[var(--btn-primary-bg)] text-[var(--btn-primary-bg)] rounded-[6px] font-bold hover:bg-[var(--btn-primary-bg)] hover:text-[var(--btn-primary-text)] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.97]"
            >
              {isGenerating ? (
                <>
                  <span className="animate-spin border-2 border-current border-t-transparent rounded-full w-4 h-4" />
                  Analizando requerimientos...
                </>
              ) : (
                <>
                  <Bot size={18} />
                  Generar Tareas
                </>
              )}
            </button>

            {generatedTasks.length > 0 && (
              <div className="mt-4 border-t border-[var(--border-column)] pt-4">
                <h4 className="text-sm font-bold text-[var(--text-primary)] mb-3">Backlog Generado ({generatedTasks.length}):</h4>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                  {generatedTasks.map((t, idx) => (
                    <div key={idx} className="animate-fade-in-up opacity-0 bg-[var(--bg-column)] border border-[var(--border-card)] p-3 rounded-[6px]" style={{ animationDelay: `${idx * 50}ms` }}>
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold text-[13px] text-[var(--text-primary)]">{t.title}</span>
                        <div className="flex gap-1">
                          <span className="text-[10px] bg-[var(--badge-bg)] text-[var(--badge-text)] px-1.5 py-0.5 rounded">{t.itemType}</span>
                          <span className="text-[10px] bg-[var(--bg-page)] text-[var(--text-secondary)] border border-[var(--border-column)] px-1.5 py-0.5 rounded">{t.priority}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mb-2">{t.description}</p>
                      {t.acceptanceCriteria && t.acceptanceCriteria.length > 0 && (
                        <ul className="text-[10px] text-[var(--text-secondary)] list-disc pl-4 space-y-0.5">
                          {t.acceptanceCriteria.map((ac: string, i: number) => (
                            <li key={i}>{ac}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

        </div>

        <div className="px-6 py-4 border-t border-[var(--border-column)] bg-[var(--bg-column)] flex justify-end gap-3 flex-none">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-6 py-2 border border-[var(--border-card)] text-[var(--text-primary)] rounded-[6px] font-bold hover:bg-[var(--bg-page)] transition-colors active:scale-[0.97]">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="px-6 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-[6px] font-bold hover:brightness-110 transition-colors disabled:opacity-50 flex items-center gap-2 active:scale-[0.97]">
            <Save size={18} />
            {isSubmitting ? 'Guardando...' : 'Crear Proyecto'}
          </button>
        </div>
      </div>
    </div>
  );
}
