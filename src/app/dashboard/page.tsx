'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { supabase } from '@/lib/supabase';
import { TaskModal } from '@/components/kanban/TaskModal';
import {
  DashboardView, startOfDay,
  type DashboardTask, type MeetingRow, type ProgressRow, type ProjectRow, type ResourceRow,
} from '@/components/dashboard/DashboardView';

export default function DashboardPage() {
  const { user, profile, loading } = useAuth();
  const { preferences } = usePreferences();
  const router = useRouter();
  const isJefe = profile?.role === 'jefe';

  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [progressRows, setProgressRows] = useState<ProgressRow[]>([]);
  const [meeting, setMeeting] = useState<MeetingRow | null>(null);
  const [resources, setResources] = useState<ResourceRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  const fetchAll = useCallback(async () => {
    if (!user || !profile) return;
    setDataLoading(true);

    const { data: projectData } = await supabase.from('projects').select('id, name, leader_id');
    const allProjects = (projectData ?? []) as ProjectRow[];
    const ledIds = allProjects.filter((p) => p.leader_id === user.id).map((p) => p.id);

    // El jefe ve las tareas de todo el equipo; el líder de un proyecto, las
    // propias más las de su(s) proyecto(s); el resto, solo las propias.
    let taskQuery = supabase
      .from('tasks')
      .select('id, title, status, item_type, priority, progress, due_date, assigned_to, assignee:profiles!tasks_assigned_to_fkey(email), project_id, project:projects(name)')
      .order('due_date', { ascending: true, nullsFirst: false });
    if (!isJefe) {
      taskQuery = ledIds.length
        ? taskQuery.or(`assigned_to.eq.${user.id},project_id.in.(${ledIds.join(',')})`)
        : taskQuery.eq('assigned_to', user.id);
    }

    const weekAgo = startOfDay(new Date());
    weekAgo.setDate(weekAgo.getDate() - 6);
    let progressQuery = supabase.from('task_progress').select('created_at').gte('created_at', weekAgo.toISOString());
    if (!isJefe) progressQuery = progressQuery.eq('user_id', user.id);

    // Las tablas de juntas, avances y recursos vienen de la migración del
    // área: si fallan (p. ej. sin migrar), esas secciones quedan vacías.
    const [taskRes, progressRes, meetingRes, resourceRes] = await Promise.all([
      taskQuery,
      progressQuery,
      supabase
        .from('meetings')
        .select('id, title, scheduled_at, status')
        .in('status', ['programada', 'en_curso'])
        .gte('scheduled_at', new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1),
      supabase
        .from('resources')
        .select('id, title, kind, url, duration_minutes')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(3),
    ]);

    const visibleTasks = (taskRes.data ?? []) as unknown as DashboardTask[];
    const myProjectIds = new Set([...ledIds, ...visibleTasks.map((t) => t.project_id).filter(Boolean) as string[]]);

    setTasks(visibleTasks);
    setProjects(isJefe ? allProjects : allProjects.filter((p) => myProjectIds.has(p.id)));
    setProgressRows((progressRes.data ?? []) as ProgressRow[]);
    setMeeting(((meetingRes.data ?? [])[0] as MeetingRow | undefined) ?? null);
    setResources((resourceRes.data ?? []) as ResourceRow[]);
    setDataLoading(false);
  }, [user, profile, isJefe]);

  useEffect(() => {
    if (user && profile) {
      (async () => {
        await fetchAll();
      })();
    }
  }, [user, profile, fetchAll]);

  if (loading || !user) return <div className="p-8 text-[var(--text-secondary)]">Cargando panel…</div>;

  return (
    <>
      <DashboardView
        tasks={tasks}
        projects={projects}
        progressRows={progressRows}
        meeting={meeting}
        resources={resources}
        dataLoading={dataLoading}
        isJefe={isJefe}
        userId={user.id}
        mascot={preferences.mascot}
        onSelectTask={setSelectedTaskId}
      />
      <TaskModal
        isOpen={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        task={selectedTaskId ? { id: selectedTaskId } : null}
        onUpdated={fetchAll}
      />
    </>
  );
}
