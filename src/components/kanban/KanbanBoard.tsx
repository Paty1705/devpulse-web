'use client';

import { useState, useEffect, useCallback } from 'react';
import { TaskModal } from '@/components/kanban/TaskModal';
import { NewTaskModal } from '@/components/kanban/NewTaskModal';
import { BoardView, COLUMN_DEFS, type BoardColumn, type BoardTask } from '@/components/kanban/BoardView';
import { useAuth } from '@/components/providers/AuthProvider';
import { supabase } from '@/lib/supabase';

type Task = BoardTask;
type Column = BoardColumn;

const emptyColumns = (): Record<string, Column> =>
  Object.fromEntries(COLUMN_DEFS.map((c) => [c.id, { id: c.id, title: c.title, tasks: [] as Task[] }]));

export function KanbanBoard() {
  const { profile, user } = useAuth();
  const [columns, setColumns] = useState<Record<string, Column>>(emptyColumns);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [leaderProjectIds, setLeaderProjectIds] = useState<Set<string>>(new Set());
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  const [testDates, setTestDates] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('projects').select('id, name, leader_id');
      setProjectNames(Object.fromEntries((data || []).map((p) => [p.id, p.name])));
      setLeaderProjectIds(new Set((data || []).filter((p) => p.leader_id === user.id).map((p) => p.id)));
    })();
  }, [user]);

  const fetchTasks = useCallback(async () => {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, status, is_locked, locked_by, requires_sql, assigned_to, item_type, priority, progress, recurrence_id, due_date, project_id, assignee:profiles!tasks_assigned_to_fkey(email)')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error al cargar tareas:', error);
      setLoading(false);
      return;
    }

    const grouped = emptyColumns();
    ((data || []) as unknown as Task[]).forEach((t) => {
      (grouped[t.status] ?? grouped.backlog).tasks.push(t);
    });
    setColumns(grouped);
    setLoading(false);

    // Próxima fecha de prueba pendiente de cada tarea (si la tabla existe).
    const { data: tests } = await supabase
      .from('task_test_dates')
      .select('task_id, test_date')
      .eq('result', 'pendiente')
      .order('test_date', { ascending: true });
    const next: Record<string, string> = {};
    (tests || []).forEach((t) => {
      if (!next[t.task_id]) next[t.task_id] = t.test_date;
    });
    setTestDates(next);
  }, []);

  useEffect(() => {
    (async () => {
      await fetchTasks();
    })();

    const channel = supabase
      .channel('tasks_board_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTasks]);

  // El jefe puede mover cualquier tarea, EXCEPTO una que la persona asignada
  // ya puso "en progreso" (bloqueada por otro usuario): ahí pierde el control
  // hasta que se libere. El desarrollador asignado puede mover la suya, pero
  // una vez que entra en auditoría (in_review) o llega a "ready" (lista para
  // desplegar) queda liberada: ni siquiera el asignado puede seguir
  // moviéndola, solo el jefe decide el paso siguiente.
  const isManagerOfTask = useCallback((task: Task) => {
    return profile?.role === 'jefe' || (!!task.project_id && leaderProjectIds.has(task.project_id));
  }, [profile, leaderProjectIds]);

  const canModifyTask = useCallback((task: Task) => {
    const lockedByOther = task.is_locked && task.locked_by !== user?.id;
    if (isManagerOfTask(task)) return !lockedByOther;
    if (!user) return false;
    return task.assigned_to === user.id && task.status !== 'in_review' && task.status !== 'ready';
  }, [user, isManagerOfTask]);

  const moveTask = async (taskId: string, to: string, beforeId: string | null) => {
    const from = Object.values(columns).find((c) => c.tasks.some((t) => t.id === taskId));
    if (!from || !columns[to]) return;
    const task = from.tasks.find((t) => t.id === taskId)!;
    if (!canModifyTask(task)) return;

    const updatedTask: Task = { ...task, status: to };
    if (to === 'in_progress') {
      updatedTask.is_locked = true;
      // El bloqueo debe quedar a nombre de quien realmente va a trabajar la
      // tarea (el asignado), no de quien la arrastra: el jefe puede mover
      // tareas de otras personas y no debe aparecer como que él la toma.
      // Si no tiene asignado, cae a quien la movió (si no, locked_by=null
      // dejaría al jefe bloqueado afuera de su propia acción).
      updatedTask.locked_by = task.assigned_to || user?.id || null;
    } else if (from.id === 'in_progress' && to !== 'in_progress') {
      updatedTask.is_locked = false;
      updatedTask.locked_by = null;
    }

    // Actualización optimista: se quita de su columna y se inserta antes de
    // `beforeId` en la de destino (o al final).
    setColumns((prev) => {
      const next = { ...prev };
      next[from.id] = { ...prev[from.id], tasks: prev[from.id].tasks.filter((t) => t.id !== taskId) };
      const dest = [...next[to].tasks];
      const at = beforeId ? dest.findIndex((t) => t.id === beforeId) : -1;
      dest.splice(at === -1 ? dest.length : at, 0, updatedTask);
      next[to] = { ...next[to], tasks: dest };
      return next;
    });

    if (from.id === to) return; // Solo cambió el orden visual

    const { error } = await supabase
      .from('tasks')
      .update({
        status: updatedTask.status,
        is_locked: updatedTask.is_locked,
        locked_by: updatedTask.locked_by,
      })
      .eq('id', task.id);

    if (error) {
      console.error('Error al mover la tarea, revirtiendo:', error);
      fetchTasks();
    }
  };

  return (
    <>
      <BoardView
        columns={columns}
        loading={loading}
        currentUserId={user?.id ?? null}
        projectNames={projectNames}
        testDates={testDates}
        canModify={canModifyTask}
        canCreate={profile?.role === 'jefe' || leaderProjectIds.size > 0}
        onCreate={() => setIsNewTaskModalOpen(true)}
        onOpen={setSelectedTask}
        onMove={moveTask}
      />

      <TaskModal isOpen={!!selectedTask} onClose={() => setSelectedTask(null)} task={selectedTask} onUpdated={fetchTasks} />
      <NewTaskModal
        isOpen={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
        onTaskCreated={() => {
          setIsNewTaskModalOpen(false);
          fetchTasks();
        }}
      />
    </>
  );
}
