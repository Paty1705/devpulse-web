'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronRight, FileAudio, Mic, Plus, Sparkles } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/providers/AuthProvider';
import { AvatarStack } from '@/components/juntas/Avatar';
import { NewMeetingModal } from '@/components/juntas/NewMeetingModal';
import { meetingDateTime, STATUS_LABEL, statusStyle, type Meeting } from '@/lib/meetings';

type MeetingRow = Meeting & {
  attendees: { user_id: string; profile: { email: string } | null }[];
  proposals: { status: string }[];
  minutes: { id: string }[];
};

export default function JuntasPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const isJefe = profile?.role === 'jefe';
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNewOpen, setIsNewOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  const fetchMeetings = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('meetings')
      .select('*, attendees:meeting_attendees(user_id, profile:profiles(email)), proposals:meeting_task_proposals(status), minutes:meeting_minute_items(id)')
      .order('scheduled_at', { ascending: false });
    if (err) setError('No se pudieron cargar las juntas.');
    setRows((data ?? []) as unknown as MeetingRow[]);
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      await fetchMeetings();
    })();
    const channel = supabase
      .channel('meetings_list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, () => fetchMeetings())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchMeetings]);

  const { upcoming, past } = useMemo(() => {
    const active = rows.filter((m) => m.status === 'programada' || m.status === 'en_curso');
    // En curso primero, luego la más próxima.
    active.sort((a, b) => (a.status === b.status ? +new Date(a.scheduled_at) - +new Date(b.scheduled_at) : a.status === 'en_curso' ? -1 : 1));
    return { upcoming: active, past: rows.filter((m) => m.status === 'terminada' || m.status === 'cancelada') };
  }, [rows]);

  if (loading || !user) return <div className="p-8 text-[var(--text-secondary)]">Cargando…</div>;

  return (
    <div className="max-w-[1400px] flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">Juntas</h1>
          <p className="text-sm text-[var(--text-secondary)]">Minutas, grabaciones y tareas que salen de cada reunión.</p>
        </div>
        {isJefe && (
          <button onClick={() => setIsNewOpen(true)} className="nav-active min-h-11 px-5 rounded-[14px] font-semibold text-sm inline-flex items-center gap-2 active:scale-[0.97] transition-transform">
            <Plus size={16} /> Nueva junta
          </button>
        )}
      </header>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Próximas</h2>
        {dataLoading ? (
          <p className="text-sm text-[var(--text-secondary)]">Cargando…</p>
        ) : upcoming.length === 0 ? (
          <div className="glass-panel glass-iridescent rounded-[24px] p-8 text-center flex flex-col items-center gap-3">
            <span className="tile-3d w-14 h-14 rounded-[18px] flex items-center justify-center" style={{ background: 'linear-gradient(150deg, var(--accent-2), var(--accent))' }}>
              <CalendarClock size={26} className="text-white" />
            </span>
            <p className="text-[var(--text-primary)] font-semibold">No hay juntas programadas.</p>
            <p className="text-sm text-[var(--text-secondary)]">
              {isJefe ? 'Crea una para empezar a llevar la minuta y grabarla.' : 'Cuando el jefe te invite a una, aparecerá aquí.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {upcoming.map((m) => <MeetingCard key={m.id} meeting={m} currentEmail={user.email} />)}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Anteriores</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {past.map((m) => <MeetingCard key={m.id} meeting={m} currentEmail={user.email} />)}
          </div>
        </section>
      )}

      <NewMeetingModal
        isOpen={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        onCreated={(id) => {
          setIsNewOpen(false);
          router.push(`/dashboard/juntas/${id}`);
        }}
      />
    </div>
  );
}

function MeetingCard({ meeting: m, currentEmail }: { meeting: MeetingRow; currentEmail?: string | null }) {
  const emails = m.attendees.map((a) => a.profile?.email).filter(Boolean) as string[];
  const pending = m.proposals.filter((p) => p.status === 'pendiente').length;
  const accepted = m.proposals.filter((p) => p.status === 'aceptada').length;
  const live = m.status === 'en_curso';
  return (
    <Link
      href={`/dashboard/juntas/${m.id}`}
      className={`glass-panel glass-iridescent ${live ? 'thick-iridescent' : ''} rounded-[24px] p-5 flex flex-col gap-4 hover:bg-[var(--bg-card-hover)] transition-colors`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-base font-semibold text-[var(--text-primary)] truncate">{m.title}</span>
          <span className="block text-[13px] text-[var(--text-secondary)] first-letter:uppercase">{meetingDateTime.format(new Date(m.scheduled_at))}</span>
        </span>
        <span className="shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-[10px]" style={statusStyle(m.status)}>
          {live && <span className="w-2 h-2 rounded-full bg-current animate-pulse" />}
          {STATUS_LABEL[m.status]}
        </span>
      </span>

      <span className="flex flex-wrap gap-2">
        <span className="chip-glass font-mono text-[11px] px-2 py-1 rounded-[8px] text-[var(--text-primary)]">{m.minutes.length} en minuta</span>
        {m.recording_path && (
          <span className="chip-glass font-mono text-[11px] px-2 py-1 rounded-[8px] text-[var(--text-primary)] inline-flex items-center gap-1">
            <FileAudio size={11} /> grabada
          </span>
        )}
        {m.ai_status === 'procesando' && (
          <span className="chip-glass font-mono text-[11px] px-2 py-1 rounded-[8px] text-[var(--text-primary)] inline-flex items-center gap-1">
            <Sparkles size={11} /> procesando
          </span>
        )}
        {pending > 0 && (
          <span className="font-mono text-[11px] px-2 py-1 rounded-[8px]" style={{ background: 'var(--prio-media-bg)', color: 'var(--prio-media-text)' }}>
            {pending} por revisar
          </span>
        )}
        {accepted > 0 && (
          <span className="font-mono text-[11px] px-2 py-1 rounded-[8px]" style={{ background: 'var(--prio-baja-bg)', color: 'var(--prio-baja-text)' }}>
            {accepted} {accepted === 1 ? 'tarea asignada' : 'tareas asignadas'}
          </span>
        )}
      </span>

      <span className="mt-auto flex items-center justify-between gap-3">
        <AvatarStack emails={emails} currentEmail={currentEmail} />
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--text-primary)]">
          {live ? <><Mic size={14} /> Entrar</> : 'Abrir'} <ChevronRight size={16} />
        </span>
      </span>
    </Link>
  );
}
