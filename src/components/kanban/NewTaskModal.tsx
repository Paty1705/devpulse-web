'use client';

import { X, Plus, Trash2, Calendar as CalendarIcon, Database, GitBranch, Save } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { createGoogleCalendarEvent } from '@/lib/calendar';
import { branchNameForTask } from '@/lib/github';
import { useAuth } from '@/components/providers/AuthProvider';

type Project = { id: string; name: string; leader_id: string | null; mode: string; repo_url: string | null };
type Profile = { id: string; email: string; role: string };

type NewTaskModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: () => void; // Recargar tareas
  initialDueDate?: string; // Precarga la fecha límite (YYYY-MM-DD), ej. desde la Agenda
};

export function NewTaskModal({ isOpen, onClose, onTaskCreated, initialDueDate }: NewTaskModalProps) {
  const { user, profile } = useAuth();
  const isJefe = profile?.role === 'jefe';

  // Datos de Supabase
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projectMemberIds, setProjectMemberIds] = useState<string[]>([]);
  
  // Estado del formulario
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [itemType, setItemType] = useState('Feature');
  const [priority, setPriority] = useState('Media');
  const [description, setDescription] = useState('');
  
  // Criterios de aceptación
  const [criteria, setCriteria] = useState<string[]>([]);
  const [newCriterion, setNewCriterion] = useState('');

  // Asignación y agenda
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');

  // BD y Git
  const [requiresSql, setRequiresSql] = useState(false);
  const [sqlScript, setSqlScript] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchProjectsAndProfiles = useCallback(async () => {
    const { data: projs } = await supabase.from('projects').select('id, name, leader_id, mode, repo_url');
    if (projs) {
      // Un líder de proyecto no-jefe solo puede crear tareas en el/los
      // proyectos donde él mismo es leader_id.
      const visibleProjects = isJefe ? projs : projs.filter(p => p.leader_id === user?.id);
      setProjects(visibleProjects);
      if (visibleProjects.length > 0) setProjectId(prev => prev || visibleProjects[0].id);
    }

    const { data: profs } = await supabase.from('profiles').select('id, email, role');
    if (profs) setProfiles(profs);
  }, [isJefe, user?.id]);

  useEffect(() => {
    if (isOpen) {
      (async () => {
        await fetchProjectsAndProfiles();
      })();
    }
  }, [isOpen, fetchProjectsAndProfiles]);

  // Trae el equipo del proyecto elegido para no poder asignar la tarea a
  // alguien que no forma parte de ese proyecto.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      if (!projectId) {
        if (!cancelled) setProjectMemberIds([]);
        return;
      }
      const { data } = await supabase.from('project_members').select('user_id').eq('project_id', projectId);
      if (!cancelled) setProjectMemberIds((data || []).map(d => d.user_id));
    })();
    return () => { cancelled = true; };
  }, [isOpen, projectId]);

  const selectedProject = projects.find(p => p.id === projectId) || null;
  const assignableProfiles = !selectedProject
    ? profiles
    : profiles.filter(p => p.id === selectedProject.leader_id || (selectedProject.mode === 'team' && projectMemberIds.includes(p.id)));

  // Si el proyecto cambia (ver <select> de Proyecto) y el asignado ya no
  // pertenece a ese equipo, se limpia ahí mismo en el handler, no en un
  // efecto reactivo (evita cascada de renders por derivar estado en efecto).
  const handleProjectChange = (newProjectId: string) => {
    setProjectId(newProjectId);
    setAssignedTo('');
  };

  // Precarga la fecha límite cada vez que el modal se abre (ej. al venir
  // desde un día clickeado en la Agenda).
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen && initialDueDate) {
      setDueDate(initialDueDate);
    }
  }

  if (!isOpen) return null;

  const handleAddCriterion = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ((e.type === 'keydown' && (e as React.KeyboardEvent).key !== 'Enter') || !newCriterion.trim()) return;
    e.preventDefault();
    setCriteria([...criteria, newCriterion.trim()]);
    setNewCriterion('');
  };

  const removeCriterion = (index: number) => {
    setCriteria(criteria.filter((_, i) => i !== index));
  };

  // Vista previa: el id real todavía no existe hasta guardar la tarea, así
  // que se muestra con un placeholder. El nombre real (con el id de verdad)
  // es el que efectivamente se crea en GitHub en handleSubmit.
  const branchNamePreview = branchNameForTask('XXXXXX', title || 'nueva tarea');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      let isoDate = null;
      let googleEventId = null;

      if (dueDate) {
        const timeStr = dueTime || '23:59';
        isoDate = new Date(`${dueDate}T${timeStr}:00`).toISOString();
        
        // Crear evento en GCalendar
        googleEventId = await createGoogleCalendarEvent(title, description, isoDate);
      }

      // Insertar en Supabase (con select() para recuperar el id real y poder
      // crear la rama de GitHub con el mismo esquema de nombre que TaskModal)
      const { data: insertedTask, error } = await supabase.from('tasks').insert([{
        project_id: projectId || null,
        title,
        description,
        item_type: itemType,
        priority,
        acceptance_criteria: criteria,
        assigned_to: assignedTo || null,
        due_date: isoDate,
        google_event_id: googleEventId,
        requires_sql: requiresSql,
        sql_script: sqlScript,
        pr_url: '',
        status: 'backlog'
      }]).select().single();

      if (error) throw error;

      // Crear la rama en GitHub automáticamente (no bloquea la tarea si falla).
      if (insertedTask && selectedProject?.repo_url) {
        const realBranchName = branchNameForTask(insertedTask.id, title);
        try {
          const res = await fetch('/api/github/create-branch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoUrl: selectedProject.repo_url, branchName: realBranchName }),
          });
          const branchData = await res.json();
          if (!res.ok) {
            console.warn('No se pudo crear la rama en GitHub:', branchData.error);
            alert(`Tarea creada. Aviso: no se pudo crear la rama en GitHub (${branchData.error}).`);
          } else {
            // Registro para el control de versiones (quién, qué proyecto, cuándo).
            const { error: logError } = await supabase.from('branch_logs').insert([{
              project_id: projectId,
              task_id: insertedTask.id,
              branch_name: realBranchName,
              created_by: user?.id,
              already_existed: !!branchData.alreadyExisted,
            }]);
            if (logError) console.warn('No se pudo registrar la rama en el control de versiones:', logError.message);
          }
        } catch (branchErr) {
          console.warn('No se pudo crear la rama en GitHub:', branchErr);
        }
      }

      onTaskCreated();
      onClose();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : JSON.stringify(err);
      alert('Error al guardar la tarea: ' + message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] shadow-[var(--shadow-hover)] w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header Fijo */}
        <div className="px-6 py-5 flex justify-between items-center bg-[var(--bg-column)] border-b border-[var(--border-column)] flex-none z-10">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Crear / Agregar Tarea</h2>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-card-hover)] rounded-[6px] text-[var(--text-secondary)] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Cuerpo Scrolleable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Bloque 1: Definición y Alcance */}
          <section className="space-y-4">
            <h3 className="font-bold text-lg text-[var(--text-primary)] pb-2 flex items-center gap-2 border-b border-[var(--border-column)]">
              <span className="bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] w-6 h-6 rounded flex items-center justify-center text-sm font-bold">1</span>
              Definición y Alcance
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">Proyecto</label>
                <select 
                  value={projectId} onChange={(e) => handleProjectChange(e.target.value)}
                  className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                >
                  <option value="">Selecciona un proyecto...</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">Título</label>
                <input 
                  type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] p-2.5 text-[var(--text-primary)] font-medium focus:outline-none focus:border-[var(--btn-primary-bg)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">Tipo de Ítem</label>
                <div className="flex flex-wrap gap-2">
                  {['Feature', 'Bug', 'Base de Datos', 'Refactor'].map(type => (
                    <label key={type} className={`cursor-pointer px-3 py-1 rounded-[6px] text-sm border transition-colors ${itemType === type ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-bold border-[var(--btn-primary-bg)]' : 'bg-[var(--bg-column)] border-[var(--border-column)] text-[var(--text-primary)] hover:border-[var(--btn-primary-bg)]'}`}>
                      <input type="radio" className="hidden" name="itemType" value={type} checked={itemType === type} onChange={() => setItemType(type)} />
                      {type}
                    </label>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-1">Prioridad</label>
                <select 
                  value={priority} onChange={(e) => setPriority(e.target.value)}
                  className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                >
                  <option>Baja</option><option>Media</option><option>Alta</option><option>Crítica</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-[var(--text-secondary)] mb-1">Descripción Técnica</label>
              <textarea 
                rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Requerimientos, contexto técnico..."
                className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-[var(--text-secondary)] mb-1">Criterios de Aceptación (Definition of Done)</label>
              <div className="flex gap-2 mb-2">
                <input 
                  type="text" value={newCriterion} onChange={(e) => setNewCriterion(e.target.value)} onKeyDown={handleAddCriterion}
                  placeholder="Ej: El endpoint devuelve 200 OK"
                  className="flex-1 bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] p-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                />
                <button type="button" onClick={handleAddCriterion} className="bg-[var(--bg-column)] border border-[var(--border-card)] px-3 rounded-[6px] text-[var(--text-secondary)] hover:bg-[var(--btn-primary-bg)] hover:text-[var(--btn-primary-text)] transition-colors"><Plus size={18} /></button>
              </div>
              <ul className="space-y-1">
                {criteria.map((c, i) => (
                  <li key={i} className="flex items-center justify-between text-sm bg-[var(--bg-column)] p-2 rounded-[6px] border border-[var(--border-column)] text-[var(--text-primary)]">
                    <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm border border-[var(--border-card)]" /> {c}</span>
                    <button type="button" onClick={() => removeCriterion(i)} className="text-red-500 hover:text-red-700"><Trash2 size={16}/></button>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Bloque 2: Asignación y Agenda */}
          <section className="space-y-4">
            <h3 className="font-bold text-lg text-[var(--text-primary)] pb-2 flex items-center gap-2 border-b border-[var(--border-column)]">
              <span className="bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] w-6 h-6 rounded flex items-center justify-center text-sm font-bold">2</span>
              Asignación y Agenda (GCalendar)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-1">Asignar a</label>
                <select
                  value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}
                  className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                >
                  <option value="">Sin asignar</option>
                  {assignableProfiles.map(p => <option key={p.id} value={p.id}>{p.email} ({p.role})</option>)}
                </select>
                {selectedProject && assignableProfiles.length === 0 && (
                  <p className="text-xs text-amber-500 mt-1">Este proyecto todavía no tiene líder/equipo asignado.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-1">Fecha Límite</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-2.5 text-[var(--text-secondary)]" size={18} />
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] p-2.5 pl-10 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-1">Hora Límite</label>
                <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[6px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]" />
              </div>
            </div>
          </section>

          {/* Bloque 3: Control de BD y Trazabilidad */}
          <section className="space-y-4">
            <h3 className="font-bold text-lg text-[var(--text-primary)] pb-2 flex items-center gap-2 border-b border-[var(--border-column)]">
              <span className="bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] w-6 h-6 rounded flex items-center justify-center text-sm font-bold">3</span>
              Control de BD y Git
            </h3>
            
            <div>
              <label className="block text-sm font-bold text-[var(--text-secondary)] mb-1 flex items-center gap-2">
                <GitBranch size={16} /> Nombre de Rama (vista previa)
              </label>
              <input type="text" readOnly value={branchNamePreview} className="w-full bg-[var(--bg-page)] border border-[var(--border-column)] text-[var(--text-secondary)] rounded-[6px] p-2.5 font-mono text-sm cursor-not-allowed" />
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {selectedProject?.repo_url
                  ? 'Se creará automáticamente en GitHub al guardar la tarea.'
                  : 'Este proyecto no tiene repositorio de GitHub configurado, así que no se creará la rama automáticamente.'}
              </p>
            </div>

            <div className="bg-[var(--bg-column)] border border-[var(--border-card)] p-4 rounded-[8px]">
              <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] cursor-pointer mb-2">
                <input type="checkbox" checked={requiresSql} onChange={(e) => setRequiresSql(e.target.checked)} className="rounded text-[var(--btn-primary-bg)] focus:ring-[var(--btn-primary-bg)] bg-[var(--bg-page)] border-[var(--border-card)]" />
                <Database size={18} className="text-[var(--btn-primary-bg)]" /> ¿Requiere cambios en Base de Datos?
              </label>
              
              {requiresSql && (
                <textarea 
                  value={sqlScript} onChange={(e) => setSqlScript(e.target.value)}
                  placeholder="Pega el script SQL de migración o ingresa la ruta del archivo .sql"
                  className="w-full mt-3 bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[6px] p-3 font-mono text-sm text-[var(--text-primary)] h-24 focus:outline-none focus:border-[var(--btn-primary-bg)]"
                />
              )}
            </div>
          </section>
        </div>

        {/* Footer Fijo */}
        <div className="px-6 py-4 border-t border-[var(--border-column)] bg-[var(--bg-column)] flex justify-end gap-3 flex-none">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-6 py-2 border border-[var(--border-card)] text-[var(--text-primary)] rounded-[6px] font-bold hover:bg-[var(--bg-page)] transition-colors active:scale-[0.97]">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="px-6 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-[6px] font-bold hover:brightness-110 transition-colors disabled:opacity-50 flex items-center gap-2 active:scale-[0.97]">
            <Save size={18} />
            {isSubmitting ? 'Guardando...' : 'Crear Tarea'}
          </button>
        </div>
      </div>
    </div>
  );
}
