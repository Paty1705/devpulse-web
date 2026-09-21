'use client';

import { X, Plus, Trash2, Calendar as CalendarIcon, Database, GitBranch, Save } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { createGoogleCalendarEvent } from '@/lib/calendar';

type Project = { id: string; name: string };
type Profile = { id: string; email: string; role: string };

type NewTaskModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated: () => void; // Recargar tareas
};

export function NewTaskModal({ isOpen, onClose, onTaskCreated }: NewTaskModalProps) {
  // Datos de Supabase
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  
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

  useEffect(() => {
    if (isOpen) {
      fetchProjectsAndProfiles();
    }
  }, [isOpen]);

  const fetchProjectsAndProfiles = async () => {
    const { data: projs } = await supabase.from('projects').select('id, name');
    if (projs) setProjects(projs);
    if (projs && projs.length > 0 && !projectId) setProjectId(projs[0].id);

    const { data: profs } = await supabase.from('profiles').select('id, email, role');
    if (profs) setProfiles(profs);
  };

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

  const branchName = `feature/TASK-XXX-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || 'nueva-tarea'}`;

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

      // Insertar en Supabase
      const { data, error } = await supabase.from('tasks').insert([{
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
      }]);

      if (error) throw error;

      onTaskCreated();
      onClose();
    } catch (err) {
      console.error(err);
      alert('Error al guardar la tarea');
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
                  value={projectId} onChange={(e) => setProjectId(e.target.value)}
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
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.email} ({p.role})</option>)}
                </select>
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
                <GitBranch size={16} /> Nombre de Rama Sugerido
              </label>
              <input type="text" readOnly value={branchName} className="w-full bg-[var(--bg-page)] border border-[var(--border-column)] text-[var(--text-secondary)] rounded-[6px] p-2.5 font-mono text-sm cursor-not-allowed" />
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
