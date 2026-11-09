'use client';

import { X, Plus, Trash2, Calendar as CalendarIcon, Database, GitBranch, Save, Repeat } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { createGoogleCalendarEvent } from '@/lib/calendar';
import { branchNameForTask } from '@/lib/github';
import { useAuth } from '@/components/providers/AuthProvider';
import { describeRecurrence, formatShort, FREQUENCY_UNIT, toISODate, upcoming, type Frequency } from '@/lib/recurrence';

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

  // Repetición (si se elige, se guarda en task_recurrences y la base
  // genera cada tarea en su fecha).
  const [repeat, setRepeat] = useState<Frequency | 'no'>('no');
  const [everyN, setEveryN] = useState('1');
  const [startsOn, setStartsOn] = useState(() => toISODate(new Date()));
  const [dueInDays, setDueInDays] = useState('0');
  const [endDate, setEndDate] = useState('');

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
      // Primer proyecto propio, o tarea personal si no lidera ninguno.
      const first = visibleProjects[0];
      setProjectId(first?.id ?? '');
      setAssignedTo(first ? first.leader_id ?? '' : user?.id ?? '');
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

  const selectedProject = projects.find(p => p.id === projectId) || null;
  // Los proyectos son individuales: sus tareas solo pueden ser del responsable.
  // Proyecto → solo su responsable. Sin proyecto → tarea personal, para uno mismo.
  const assignableProfiles = !selectedProject
    ? profiles.filter(p => p.id === user?.id)
    : profiles.filter(p => p.id === selectedProject.leader_id);

  // Al elegir proyecto, la tarea se asigna sola a su responsable (se hace en
  // el handler, no en un efecto, para no derivar estado en cascada).
  const handleProjectChange = (newProjectId: string) => {
    setProjectId(newProjectId);
    const proj = projects.find(p => p.id === newProjectId);
    setAssignedTo(proj ? proj.leader_id ?? '' : user?.id ?? '');
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
    if (!title.trim()) {
      alert('Ponle un título a la tarea.');
      return;
    }
    setIsSubmitting(true);

    try {
      if (repeat !== 'no') {
        const n = Math.min(52, Math.max(1, Number(everyN) || 1));
        const days = Math.min(60, Math.max(0, Number(dueInDays) || 0));
        if (endDate && endDate < startsOn) throw new Error('La fecha final no puede ser antes del inicio.');
        const { error } = await supabase.from('task_recurrences').insert({
          project_id: projectId || null,
          assigned_to: assignedTo || null,
          title: title.trim(),
          description,
          item_type: itemType,
          priority,
          acceptance_criteria: criteria,
          frequency: repeat,
          every_n: n,
          due_in_days: days,
          starts_on: startsOn,
          next_run: startsOn,
          end_date: endDate || null,
        });
        if (error) throw error;
        onTaskCreated();
        onClose();
        return;
      }

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
      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[20px] shadow-[var(--shadow-hover)] w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header Fijo */}
        <div className="px-6 py-5 flex justify-between items-center bg-[var(--bg-column)] border-b border-[var(--border-column)] flex-none z-10">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Crear / Agregar Tarea</h2>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-card-hover)] rounded-[12px] text-[var(--text-secondary)] transition-colors">
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
                  className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[12px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                >
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  <option value="">Personal · sin proyecto</option>
                </select>
                {!selectedProject && (
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1">Tarea personal: es para ti, la mueves tú hasta terminarla y no pasa por auditoría.</p>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2 uppercase tracking-wider">Título</label>
                <input 
                  type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[12px] p-2.5 text-[var(--text-primary)] font-medium focus:outline-none focus:border-[var(--btn-primary-bg)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-2">Tipo de Ítem</label>
                <div className="flex flex-wrap gap-2">
                  {['Feature', 'Bug', 'Base de Datos', 'Refactor'].map(type => (
                    <label key={type} className={`cursor-pointer px-3 py-1 rounded-[12px] text-sm border transition-colors ${itemType === type ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-bold border-[var(--btn-primary-bg)]' : 'bg-[var(--bg-column)] border-[var(--border-column)] text-[var(--text-primary)] hover:border-[var(--btn-primary-bg)]'}`}>
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
                  className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[12px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
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
                className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[12px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-[var(--text-secondary)] mb-1">Criterios de Aceptación (Definition of Done)</label>
              <div className="flex gap-2 mb-2">
                <input 
                  type="text" value={newCriterion} onChange={(e) => setNewCriterion(e.target.value)} onKeyDown={handleAddCriterion}
                  placeholder="Ej: El endpoint devuelve 200 OK"
                  className="flex-1 bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[12px] p-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]"
                />
                <button type="button" onClick={handleAddCriterion} className="bg-[var(--bg-column)] border border-[var(--border-card)] px-3 rounded-[12px] text-[var(--text-secondary)] hover:bg-[var(--btn-primary-bg)] hover:text-[var(--btn-primary-text)] transition-colors"><Plus size={18} /></button>
              </div>
              <ul className="space-y-1">
                {criteria.map((c, i) => (
                  <li key={i} className="flex items-center justify-between text-sm bg-[var(--bg-column)] p-2 rounded-[12px] border border-[var(--border-column)] text-[var(--text-primary)]">
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
                  disabled={!selectedProject}
                  className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[12px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)] disabled:opacity-70"
                >
                  {selectedProject && <option value="">Sin asignar</option>}
                  {assignableProfiles.map(p => <option key={p.id} value={p.id}>{p.email} ({p.role})</option>)}
                </select>
                {selectedProject && assignableProfiles.length === 0 && (
                  <p className="text-xs text-amber-500 mt-1">Este proyecto todavía no tiene responsable.</p>
                )}
              </div>
              {repeat === 'no' ? (<>
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-1">Fecha Límite</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-2.5 text-[var(--text-secondary)]" size={18} />
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[12px] p-2.5 pl-10 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-1">Hora Límite</label>
                <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[12px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]" />
              </div>
              </>) : (
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-[var(--text-secondary)] mb-1">Empieza</label>
                <input type="date" value={startsOn} min={toISODate(new Date())} onChange={(e) => e.target.value && setStartsOn(e.target.value)} className="w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[12px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]" />
              </div>
              )}
            </div>

            <RepeatPicker
              repeat={repeat} setRepeat={setRepeat}
              everyN={everyN} setEveryN={setEveryN}
              startsOn={startsOn}
              dueInDays={dueInDays} setDueInDays={setDueInDays}
              endDate={endDate} setEndDate={setEndDate}
            />
          </section>

          {/* Bloque 3: Control de BD y Trazabilidad */}
          {repeat !== 'no' ? (
            <p className="text-sm text-[var(--text-secondary)] surface-card border border-[var(--border-card)] rounded-[14px] p-3">
              Las tareas repetitivas no crean rama de GitHub ni evento de calendario. Si alguna lo necesita, ábrela cuando aparezca en el tablero.
            </p>
          ) : (
          <section className="space-y-4">
            <h3 className="font-bold text-lg text-[var(--text-primary)] pb-2 flex items-center gap-2 border-b border-[var(--border-column)]">
              <span className="bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] w-6 h-6 rounded flex items-center justify-center text-sm font-bold">3</span>
              Control de BD y Git
            </h3>
            
            <div>
              <label className="block text-sm font-bold text-[var(--text-secondary)] mb-1 flex items-center gap-2">
                <GitBranch size={16} /> Nombre de Rama (vista previa)
              </label>
              <input type="text" readOnly value={branchNamePreview} className="w-full bg-[var(--bg-page)] border border-[var(--border-column)] text-[var(--text-secondary)] rounded-[12px] p-2.5 font-mono text-sm cursor-not-allowed" />
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                {selectedProject?.repo_url
                  ? 'Se creará automáticamente en GitHub al guardar la tarea.'
                  : 'Este proyecto no tiene repositorio de GitHub configurado, así que no se creará la rama automáticamente.'}
              </p>
            </div>

            <div className="bg-[var(--bg-column)] border border-[var(--border-card)] p-4 rounded-[20px]">
              <label className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] cursor-pointer mb-2">
                <input type="checkbox" checked={requiresSql} onChange={(e) => setRequiresSql(e.target.checked)} className="rounded text-[var(--btn-primary-bg)] focus:ring-[var(--btn-primary-bg)] bg-[var(--bg-page)] border-[var(--border-card)]" />
                <Database size={18} className="text-[var(--btn-primary-bg)]" /> ¿Requiere cambios en Base de Datos?
              </label>
              
              {requiresSql && (
                <textarea 
                  value={sqlScript} onChange={(e) => setSqlScript(e.target.value)}
                  placeholder="Pega el script SQL de migración o ingresa la ruta del archivo .sql"
                  className="w-full mt-3 bg-[var(--bg-page)] border border-[var(--border-card)] rounded-[12px] p-3 font-mono text-sm text-[var(--text-primary)] h-24 focus:outline-none focus:border-[var(--btn-primary-bg)]"
                />
              )}
            </div>
          </section>
          )}
        </div>

        {/* Footer Fijo */}
        <div className="px-6 py-4 border-t border-[var(--border-column)] bg-[var(--bg-column)] flex justify-end gap-3 flex-none">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="px-6 py-2 border border-[var(--border-card)] text-[var(--text-primary)] rounded-[12px] font-bold hover:bg-[var(--bg-page)] transition-colors active:scale-[0.97]">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={isSubmitting} className="px-6 py-2 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] rounded-[12px] font-bold hover:brightness-110 transition-colors disabled:opacity-50 flex items-center gap-2 active:scale-[0.97]">
            <Save size={18} />
            {isSubmitting ? 'Guardando...' : repeat !== 'no' ? 'Crear repetición' : 'Crear Tarea'}
          </button>
        </div>
      </div>
    </div>
  );
}

type RepeatPickerProps = {
  repeat: Frequency | 'no';
  setRepeat: (v: Frequency | 'no') => void;
  everyN: string;
  setEveryN: (v: string) => void;
  startsOn: string;
  dueInDays: string;
  setDueInDays: (v: string) => void;
  endDate: string;
  setEndDate: (v: string) => void;
};

const REPEAT_OPTIONS: { value: Frequency | 'no'; label: string }[] = [
  { value: 'no', label: 'No se repite' },
  { value: 'diaria', label: 'Diaria' },
  { value: 'semanal', label: 'Semanal' },
  { value: 'mensual', label: 'Mensual' },
];

const fieldClass = 'w-full bg-[var(--bg-column)] border border-[var(--border-card)] rounded-[12px] p-2.5 text-[var(--text-primary)] focus:outline-none focus:border-[var(--btn-primary-bg)]';

function RepeatPicker({ repeat, setRepeat, everyN, setEveryN, startsOn, dueInDays, setDueInDays, endDate, setEndDate }: RepeatPickerProps) {
  const n = Math.min(52, Math.max(1, Number(everyN) || 1));
  const next = repeat === 'no' ? [] : upcoming(startsOn, repeat, n, 3, endDate || null, startsOn);
  const days = Math.max(0, Number(dueInDays) || 0);
  return (
    <div className="surface-card border border-[var(--border-card)] rounded-[18px] p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-bold text-[var(--text-primary)] inline-flex items-center gap-2"><Repeat size={16} /> Repetir</span>
        <div role="group" aria-label="Frecuencia" className="flex flex-wrap gap-1.5">
          {REPEAT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={repeat === o.value}
              onClick={() => setRepeat(o.value)}
              className={`min-h-9 px-3 rounded-[10px] text-sm font-semibold border transition-colors ${repeat === o.value ? 'nav-active border-transparent' : 'border-[var(--border-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {repeat !== 'no' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="block">
              <span className="block text-sm font-bold text-[var(--text-secondary)] mb-1">Cada</span>
              <span className="flex items-center gap-2">
                <input type="number" min={1} max={52} value={everyN} onChange={(e) => setEveryN(e.target.value)} className={`${fieldClass} w-20`} />
                <span className="text-sm text-[var(--text-secondary)]">{FREQUENCY_UNIT[repeat][n === 1 ? 0 : 1]}</span>
              </span>
            </label>
            <label className="block">
              <span className="block text-sm font-bold text-[var(--text-secondary)] mb-1">Días para terminarla</span>
              <input type="number" min={0} max={60} value={dueInDays} onChange={(e) => setDueInDays(e.target.value)} className={fieldClass} />
            </label>
            <label className="block">
              <span className="block text-sm font-bold text-[var(--text-secondary)] mb-1">Hasta <span className="font-normal">(opcional)</span></span>
              <input type="date" value={endDate} min={startsOn} onChange={(e) => setEndDate(e.target.value)} className={fieldClass} />
            </label>
          </div>
          <p className="text-sm text-[var(--text-primary)]">
            <strong>{describeRecurrence(repeat, n, startsOn)}</strong>
            {', '}
            {days === 0 ? 'con fecha límite el mismo día' : `con ${days} ${days === 1 ? 'día' : 'días'} para terminarla`}.
          </p>
          {next.length > 0 && (
            <p className="text-xs text-[var(--text-secondary)]">
              Próximas: {next.map(formatShort).join(' · ')}
              {startsOn === toISODate(new Date()) && ' · la de hoy se crea en cuanto guardes'}
            </p>
          )}
        </>
      )}
    </div>
  );
}
