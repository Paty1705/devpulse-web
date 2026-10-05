'use client';

import { X, Bot, Save, Users, User as UserIcon, Check, Trash2, Pencil, Plus, Calendar as CalendarIcon } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { branchNameForTask, slugifyRepoName } from '@/lib/github';
import { useAuth } from '@/components/providers/AuthProvider';

type Profile = { id: string; email: string; role: string };
type GeneratedTask = {
  title: string;
  description: string;
  itemType: string;
  priority: string;
  acceptanceCriteria?: string[];
  assignedTo?: string;
  dueDate?: string; // YYYY-MM-DD
  dueTime?: string; // HH:MM
  accepted?: boolean;
  isEditing?: boolean;
  newCriterion?: string;
};
const ITEM_TYPES = ['Feature', 'Bug', 'Base de Datos', 'Refactor'];
const PRIORITIES = ['Baja', 'Media', 'Alta', 'Crítica'];
type EditableProject = {
  id: string;
  name: string;
  description: string | null;
  repo_url: string | null;
  mode: string;
  leader_id: string | null;
};

type NewProjectModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onProjectCreated: () => void;
  project?: EditableProject | null;
};

export function NewProjectModal({ isOpen, onClose, onProjectCreated, project }: NewProjectModalProps) {
  const isEdit = !!project;
  const { profile: myProfile } = useAuth();
  // Un líder de proyecto (no-jefe) puede editar su proyecto, pero no
  // reasignar quién es el líder — eso sigue siendo exclusivo de jefe.
  const canChangeLeader = !isEdit || myProfile?.role === 'jefe';
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [manualRepo, setManualRepo] = useState(false);
  const [repoName, setRepoName] = useState('');
  const [mode, setMode] = useState<'individual' | 'team'>('individual');

  // Asignaciones
  const [leaderId, setLeaderId] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [initialMemberIds, setInitialMemberIds] = useState<string[]>([]);
  
  // IA
  const [spec, setSpec] = useState('');
  const [generatedTasks, setGeneratedTasks] = useState<GeneratedTask[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptModalIndex, setAcceptModalIndex] = useState<number | null>(null);
  const [modalDueDate, setModalDueDate] = useState('');
  const [modalDueTime, setModalDueTime] = useState('');

  // Resetea el formulario en el mismo render en que isOpen pasa a true,
  // en vez de en un efecto, para no mostrar los datos de la sesión anterior.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      if (project) {
        setName(project.name);
        setDescription(project.description || '');
        setRepoUrl(project.repo_url || '');
        setMode(project.mode === 'team' ? 'team' : 'individual');
        setLeaderId(project.leader_id || '');
      } else {
        setName('');
        setDescription('');
        setRepoUrl('');
        setManualRepo(false);
        setRepoName('');
        setMode('individual');
        setLeaderId('');
        setSelectedMembers([]);
        setInitialMemberIds([]);
      }
      setSpec('');
      setGeneratedTasks([]);
      setAcceptModalIndex(null);
    }
  }

  const fetchProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, email, role');
    if (data) setProfiles(data);
  }, []);

  useEffect(() => {
    if (isOpen) {
      (async () => {
        await fetchProfiles();
      })();
    }
  }, [isOpen, fetchProfiles]);

  // En modo edición, trae el equipo actual del proyecto para poder
  // comparar (agregar/quitar) contra lo que quede seleccionado al guardar.
  useEffect(() => {
    if (isOpen && project) {
      (async () => {
        const { data } = await supabase.from('project_members').select('user_id').eq('project_id', project.id);
        const ids = (data || []).map(d => d.user_id);
        setSelectedMembers(ids);
        setInitialMemberIds(ids);
      })();
    }
  }, [isOpen, project]);

  if (!isOpen) return null;

  const assignableProfiles = mode === 'team'
    ? profiles.filter(p => p.id === leaderId || selectedMembers.includes(p.id))
    : profiles.filter(p => p.id === leaderId);

  const handleAssignGeneratedTask = (index: number, userId: string) => {
    setGeneratedTasks(prev => prev.map((t, i) => i === index ? { ...t, assignedTo: userId } : t));
  };

  const updateGeneratedTaskField = <K extends keyof GeneratedTask,>(index: number, field: K, value: GeneratedTask[K]) => {
    setGeneratedTasks(prev => prev.map((t, i) => i === index ? { ...t, [field]: value } : t));
  };

  const handleOpenAcceptModal = (index: number) => {
    const t = generatedTasks[index];
    setModalDueDate(t.dueDate || '');
    setModalDueTime(t.dueTime || '');
    setAcceptModalIndex(index);
  };

  const handleConfirmAccept = () => {
    if (acceptModalIndex === null) return;
    setGeneratedTasks(prev => prev.map((t, i) => i === acceptModalIndex
      ? { ...t, dueDate: modalDueDate, dueTime: modalDueTime, accepted: true, isEditing: false }
      : t));
    setAcceptModalIndex(null);
  };

  const handleDeleteGeneratedTask = (index: number) => {
    setGeneratedTasks(prev => prev.filter((_, i) => i !== index));
  };

  const handleToggleEditGeneratedTask = (index: number) => {
    setGeneratedTasks(prev => prev.map((t, i) => i === index ? { ...t, isEditing: !t.isEditing } : t));
  };

  const handleAddGeneratedCriterion = (index: number) => {
    setGeneratedTasks(prev => prev.map((t, i) => {
      if (i !== index || !t.newCriterion?.trim()) return t;
      return { ...t, acceptanceCriteria: [...(t.acceptanceCriteria || []), t.newCriterion.trim()], newCriterion: '' };
    }));
  };

  const handleRemoveGeneratedCriterion = (index: number, criterionIndex: number) => {
    setGeneratedTasks(prev => prev.map((t, i) => i === index
      ? { ...t, acceptanceCriteria: (t.acceptanceCriteria || []).filter((_, ci) => ci !== criterionIndex) }
      : t));
  };

  const acceptedCount = generatedTasks.filter(t => t.accepted).length;

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
        setGeneratedTasks(data.tasks.map((t: GeneratedTask) => ({ ...t, assignedTo: '' })));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      alert("Error de IA: " + message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const usingManualRepo = isEdit || manualRepo;
    if (!name.trim() || !leaderId || (usingManualRepo && !repoUrl.trim())) {
      alert("Por favor completa los campos obligatorios: Nombre, Repositorio y Responsable/Líder.");
      return;
    }

    setIsSubmitting(true);

    try {
      let finalRepoUrl = repoUrl;

      // Crea el repo en GitHub antes de guardar el proyecto, para que
      // repo_url quede apuntando a algo real desde el primer momento.
      if (!isEdit && !manualRepo) {
        const repoNameToCreate = repoName.trim() || slugifyRepoName(name);
        const res = await fetch('/api/github/create-repo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: repoNameToCreate, description, isPrivate: true }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'No se pudo crear el repositorio en GitHub.');
        }
        finalRepoUrl = data.repoUrl;
      }

      if (isEdit && project) {
        const { error: updateError } = await supabase
          .from('projects')
          .update({ name, description, repo_url: repoUrl, mode, leader_id: leaderId })
          .eq('id', project.id);

        if (updateError) throw updateError;

        const effectiveMembers = mode === 'team' ? selectedMembers : [];
        const toAdd = effectiveMembers.filter(id => !initialMemberIds.includes(id));
        const toRemove = initialMemberIds.filter(id => !effectiveMembers.includes(id));

        if (toAdd.length > 0) {
          const { error: addError } = await supabase
            .from('project_members')
            .insert(toAdd.map(userId => ({ project_id: project.id, user_id: userId })));
          if (addError) throw addError;
        }

        if (toRemove.length > 0) {
          const { error: removeError } = await supabase
            .from('project_members')
            .delete()
            .eq('project_id', project.id)
            .in('user_id', toRemove);
          if (removeError) throw removeError;
        }

        alert('Proyecto actualizado exitosamente.');
        onProjectCreated();
        onClose();
        return;
      }

      // 1. Insertar Proyecto
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .insert([{
          name,
          description,
          repo_url: finalRepoUrl,
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

      // 3. Insertar Tareas Generadas por IA (solo las que el usuario aceptó explícitamente)
      const acceptedTasks = generatedTasks.filter(t => t.accepted);
      if (acceptedTasks.length > 0) {
        const tasksToInsert = acceptedTasks.map(t => ({
          project_id: projectData.id,
          status: 'backlog', // Estado inicial por defecto (coincide con el enum real task_status)
          title: t.title,
          description: t.description,
          item_type: t.itemType,
          priority: t.priority,
          acceptance_criteria: t.acceptanceCriteria || [],
          assigned_to: t.assignedTo || null,
          due_date: t.dueDate ? new Date(`${t.dueDate}T${t.dueTime || '23:59'}:00`).toISOString() : null
        }));

        const { data: insertedTasks, error: tasksError } = await supabase
          .from('tasks')
          .insert(tasksToInsert)
          .select();

        if (tasksError) {
          console.error("Error al insertar tareas:", tasksError);
          // No bloqueamos la creación del proyecto si fallan las tareas
          alert("Proyecto creado, pero hubo un problema al guardar las tareas generadas.");
        } else if (insertedTasks && finalRepoUrl) {
          // Crea la rama de cada tarea en GitHub (no bloquea si alguna falla).
          await Promise.all(insertedTasks.map(async (t) => {
            try {
              const res = await fetch('/api/github/create-branch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repoUrl: finalRepoUrl, branchName: branchNameForTask(t.id, t.title) }),
              });
              if (!res.ok) {
                const data = await res.json();
                console.warn(`No se pudo crear la rama para "${t.title}":`, data.error);
              }
            } catch (branchErr) {
              console.warn(`No se pudo crear la rama para "${t.title}":`, branchErr);
            }
          }));
        }
      }

      alert("Proyecto creado exitosamente.");
      onProjectCreated();
      onClose();
    } catch (error) {
      console.error("Detalle del error:", error);
      const message = error instanceof Error ? error.message : JSON.stringify(error);
      alert("Error al crear el proyecto: " + message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] shadow-[var(--shadow-hover)] w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        
        <div className="px-6 py-5 flex justify-between items-center bg-[var(--bg-column)] border-b border-[var(--border-column)] flex-none z-10">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">{isEdit ? 'Editar Proyecto' : 'Nuevo Proyecto'}</h2>
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
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-bold text-[var(--text-secondary)]">
                    {isEdit || manualRepo ? 'URL del Repositorio Git' : 'Nombre del Repositorio (se crea en GitHub)'}
                  </label>
                  {!isEdit && (
                    <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] cursor-pointer select-none">
                      <input
                        type="checkbox" checked={manualRepo}
                        onChange={(e) => setManualRepo(e.target.checked)}
                        className="rounded-[4px] text-[var(--btn-primary-bg)] focus:ring-[var(--btn-primary-bg)] bg-[var(--bg-column)] border-[var(--border-card)]"
                      />
                      Ingresar repo existente
                    </label>
                  )}
                </div>
                {isEdit || manualRepo ? (
                  <input
                    type="url" required value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)}
                    className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                    placeholder="https://github.com/..."
                  />
                ) : (
                  <>
                    <input
                      type="text" value={repoName} onChange={(e) => setRepoName(e.target.value)}
                      className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                      placeholder={slugifyRepoName(name || 'proyecto')}
                    />
                    <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                      Se creará un repositorio privado nuevo en tu cuenta de GitHub al guardar.
                    </p>
                  </>
                )}
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
                  disabled={!canChangeLeader}
                  className="w-full bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[6px] p-2 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <option value="">Seleccionar responsable...</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.email} ({p.role})</option>)}
                </select>
                {!canChangeLeader && (
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1">Solo un jefe puede reasignar el liderazgo del proyecto.</p>
                )}
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

          {/* Bloque 3: Asistente IA (solo al crear; editar no vuelve a generar backlog) */}
          {!isEdit && (
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
                <h4 className="text-sm font-bold text-[var(--text-primary)] mb-3">
                  Backlog Generado ({generatedTasks.length}) — Aceptadas: {acceptedCount}
                </h4>
                <p className="text-[11px] text-[var(--text-secondary)] mb-3">
                  Solo las tareas marcadas con &quot;Aceptar&quot; se crearán junto con el proyecto. Las pendientes o borradas se descartan.
                </p>
                <div className="max-h-96 overflow-y-auto space-y-2 pr-2">
                  {generatedTasks.map((t, idx) => (
                    <div
                      key={idx}
                      className={`animate-fade-in-up opacity-0 bg-[var(--bg-column)] border p-3 rounded-[6px] ${t.accepted ? 'border-emerald-500' : 'border-[var(--border-card)]'}`}
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      {t.isEditing ? (
                        <div className="space-y-2 mb-2">
                          <input
                            type="text" value={t.title} onChange={(e) => updateGeneratedTaskField(idx, 'title', e.target.value)}
                            className="w-full bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[4px] p-1.5 text-[12px] font-bold text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                          />
                          <textarea
                            value={t.description} onChange={(e) => updateGeneratedTaskField(idx, 'description', e.target.value)}
                            className="w-full bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[4px] p-1.5 text-[11px] text-[var(--text-primary)] h-16 focus:outline-none focus:border-[var(--btn-primary-bg)]"
                          />
                          <div className="flex flex-wrap gap-1.5">
                            {ITEM_TYPES.map(type => (
                              <button
                                key={type} type="button" onClick={() => updateGeneratedTaskField(idx, 'itemType', type)}
                                className={`px-2 py-0.5 rounded-[4px] text-[10px] border transition-colors ${t.itemType === type ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-[var(--btn-primary-bg)] font-bold' : 'bg-[var(--bg-page)] border-[var(--border-column)] text-[var(--text-primary)]'}`}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                          <select
                            value={t.priority} onChange={(e) => updateGeneratedTaskField(idx, 'priority', e.target.value)}
                            className="w-full bg-[var(--bg-page)] border border-[var(--border-column)] rounded-[4px] p-1.5 text-[11px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                          >
                            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                          <div>
                            <ul className="space-y-1 mb-1.5">
                              {(t.acceptanceCriteria || []).map((ac, ci) => (
                                <li key={ci} className="flex items-center justify-between gap-2 text-[10px] bg-[var(--bg-page)] border border-[var(--border-column)] rounded-[4px] px-2 py-1 text-[var(--text-primary)]">
                                  <span className="flex-1">{ac}</span>
                                  <button type="button" onClick={() => handleRemoveGeneratedCriterion(idx, ci)} className="text-red-500 hover:text-red-400 flex-shrink-0">
                                    <Trash2 size={11} />
                                  </button>
                                </li>
                              ))}
                            </ul>
                            <div className="flex gap-1.5">
                              <input
                                type="text" value={t.newCriterion || ''}
                                onChange={(e) => updateGeneratedTaskField(idx, 'newCriterion', e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddGeneratedCriterion(idx); } }}
                                placeholder="Nuevo criterio de aceptación"
                                className="flex-1 bg-[var(--bg-page)] border border-[var(--border-column)] rounded-[4px] p-1.5 text-[10px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                              />
                              <button type="button" onClick={() => handleAddGeneratedCriterion(idx)} className="bg-[var(--bg-page)] border border-[var(--border-column)] px-2 rounded-[4px] text-[var(--text-secondary)] hover:text-[var(--btn-primary-bg)]">
                                <Plus size={13} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-[13px] text-[var(--text-primary)]">{t.title}</span>
                            <div className="flex gap-1 flex-shrink-0">
                              <span className="text-[10px] bg-[var(--badge-bg)] text-[var(--badge-text)] px-1.5 py-0.5 rounded">{t.itemType}</span>
                              <span className="text-[10px] bg-[var(--bg-page)] text-[var(--text-secondary)] border border-[var(--border-column)] px-1.5 py-0.5 rounded">{t.priority}</span>
                            </div>
                          </div>
                          <p className="text-[11px] text-[var(--text-secondary)] line-clamp-2 mb-2">{t.description}</p>
                          {t.acceptanceCriteria && t.acceptanceCriteria.length > 0 && (
                            <ul className="text-[10px] text-[var(--text-secondary)] list-disc pl-4 space-y-0.5 mb-2">
                              {t.acceptanceCriteria.map((ac: string, i: number) => (
                                <li key={i}>{ac}</li>
                              ))}
                            </ul>
                          )}
                          {t.dueDate && (
                            <div className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)] mb-2">
                              <CalendarIcon size={11} />
                              {new Date(`${t.dueDate}T${t.dueTime || '23:59'}:00`).toLocaleString()}
                            </div>
                          )}
                        </>
                      )}

                      <select
                        value={t.assignedTo || ''}
                        onChange={(e) => handleAssignGeneratedTask(idx, e.target.value)}
                        className="w-full bg-[var(--bg-page)] border border-[var(--border-column)] rounded-[4px] p-1.5 text-[11px] text-[var(--text-primary)] mb-2 focus:outline-none focus:border-[var(--btn-primary-bg)]"
                      >
                        <option value="">Sin asignar</option>
                        {assignableProfiles.map(p => <option key={p.id} value={p.id}>{p.email} ({p.role})</option>)}
                      </select>

                      <div className="flex gap-1.5">
                        <button
                          type="button" onClick={() => handleOpenAcceptModal(idx)}
                          title={t.accepted ? 'Aceptada: clic para cambiar la fecha' : 'Aceptar y elegir fecha de entrega'}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-[4px] text-[11px] font-bold transition-colors ${t.accepted ? 'bg-emerald-600 text-white' : 'bg-[var(--bg-page)] border border-[var(--border-column)] text-[var(--text-primary)] hover:border-emerald-500 hover:text-emerald-500'}`}
                        >
                          <Check size={12} /> {t.accepted ? 'Aceptada' : 'Aceptar'}
                        </button>
                        <button
                          type="button" onClick={() => handleToggleEditGeneratedTask(idx)}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-[4px] text-[11px] font-bold border transition-colors ${t.isEditing ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-[var(--btn-primary-bg)]' : 'bg-[var(--bg-page)] border-[var(--border-column)] text-[var(--text-primary)] hover:border-[var(--btn-primary-bg)] hover:text-[var(--btn-primary-bg)]'}`}
                        >
                          <Pencil size={12} /> {t.isEditing ? 'Listo' : 'Editar'}
                        </button>
                        <button
                          type="button" onClick={() => handleDeleteGeneratedTask(idx)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-[4px] text-[11px] font-bold bg-[var(--bg-page)] border border-[var(--border-column)] text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors"
                        >
                          <Trash2 size={12} /> Borrar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
          )}

        </div>

        <div className="px-6 py-4 border-t border-[var(--border-column)] bg-[var(--bg-column)] flex justify-end gap-3 flex-none">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-6 py-2 border border-[var(--border-card)] text-[var(--text-primary)] rounded-[6px] font-bold hover:bg-[var(--bg-page)] transition-colors active:scale-[0.97]">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="px-6 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-[6px] font-bold hover:brightness-110 transition-colors disabled:opacity-50 flex items-center gap-2 active:scale-[0.97]">
            <Save size={18} />
            {isSubmitting ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Proyecto'}
          </button>
        </div>
      </div>

      {acceptModalIndex !== null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] shadow-[var(--shadow-hover)] w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 bg-[var(--bg-column)] border-b border-[var(--border-column)]">
              <h3 className="font-bold text-[var(--text-primary)] text-sm flex items-center gap-2">
                <CalendarIcon size={16} /> Fecha de entrega
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">{generatedTasks[acceptModalIndex]?.title}</p>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-[var(--text-secondary)]">
                Opcional: elegí día y hora límite para esta tarea. Podés dejarlo en blanco y asignarlo después.
              </p>
              <div className="flex gap-2">
                <input
                  type="date" value={modalDueDate} onChange={(e) => setModalDueDate(e.target.value)}
                  className="flex-1 bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[6px] p-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                />
                <input
                  type="time" value={modalDueTime} onChange={(e) => setModalDueTime(e.target.value)}
                  disabled={!modalDueDate}
                  className="flex-1 bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[6px] p-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)] disabled:opacity-50"
                />
              </div>
            </div>
            <div className="px-5 py-4 bg-[var(--bg-column)] border-t border-[var(--border-column)] flex justify-end gap-2">
              <button
                type="button" onClick={() => setAcceptModalIndex(null)}
                className="px-4 py-2 text-sm font-bold border border-[var(--border-card)] text-[var(--text-primary)] rounded-[6px] hover:bg-[var(--bg-page)] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button" onClick={handleConfirmAccept}
                className="px-4 py-2 text-sm font-bold bg-emerald-600 text-white rounded-[6px] hover:bg-emerald-500 transition-colors flex items-center gap-2"
              >
                <Check size={16} /> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
