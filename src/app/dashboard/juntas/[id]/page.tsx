'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, ChevronLeft, FileText, Play, Repeat, Square, Video, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/providers/AuthProvider';
import { AvatarStack } from '@/components/juntas/Avatar';
import { MinutePanel } from '@/components/juntas/MinutePanel';
import { ProposalsPanel, type ProjectOption } from '@/components/juntas/ProposalsPanel';
import { RecorderBar } from '@/components/juntas/RecorderBar';
import { ReviewPanel } from '@/components/juntas/ReviewPanel';
import { useAudioDuration } from '@/components/juntas/useAudioDuration';
import { extensionFor, useRecorder } from '@/components/juntas/useRecorder';
import { durationLabel, meetingDateTime, REMINDER_OPTIONS, reminderLabel, STATUS_LABEL, statusStyle, toDateInput, type Meeting, type MeetingSeries, type MinuteItem, type PersonRef, type Proposal } from '@/lib/meetings';
import { describeRecurrence } from '@/lib/recurrence';
import { cancelMeetingEvent, endRecurringEvent } from '@/lib/calendar';

// Límite de subida de Supabase Storage en el plan gratuito.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export default function MeetingRoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const isJefe = profile?.role === 'jefe';
  const recorder = useRecorder();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [attendees, setAttendees] = useState<PersonRef[]>([]);
  const [items, setItems] = useState<MinuteItem[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [emailById, setEmailById] = useState<Record<string, string>>({});
  const [notFound, setNotFound] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const savedMs = useAudioDuration(audioUrl);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<MeetingSeries | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [remoteRecording, setRemoteRecording] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Reloj ligero para saber si la junta ya excedió su duración.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  const fetchMeeting = useCallback(async () => {
    const { data, error: err } = await supabase.from('meetings').select('*').eq('id', id).maybeSingle();
    if (err || !data) {
      setNotFound(true);
      return;
    }
    setMeeting(data as Meeting);
    if (data.series_id) {
      const { data: s } = await supabase.from('meeting_series').select('*').eq('id', data.series_id).maybeSingle();
      setSeries((s as MeetingSeries | null) ?? null);
    } else {
      setSeries(null);
    }
  }, [id]);

  const fetchItems = useCallback(async () => {
    const { data } = await supabase.from('meeting_minute_items').select('*').eq('meeting_id', id).order('position');
    setItems((data ?? []) as MinuteItem[]);
  }, [id]);

  const fetchProposals = useCallback(async () => {
    const { data } = await supabase.from('meeting_task_proposals').select('*').eq('meeting_id', id).order('created_at');
    setProposals((data ?? []) as Proposal[]);
  }, [id]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      await fetchMeeting();
      const [{ data: att }, { data: projs }, { data: people }] = await Promise.all([
        supabase.from('meeting_attendees').select('user_id, profile:profiles(email)').eq('meeting_id', id),
        supabase.from('projects').select('id, name, leader_id, leader:profiles!projects_leader_id_fkey(email)').order('name'),
        supabase.from('profiles').select('id, email'),
      ]);
      type AttRow = { user_id: string; profile: { email: string } | null };
      setAttendees(((att ?? []) as unknown as AttRow[]).filter((a) => a.profile).map((a) => ({ id: a.user_id, email: a.profile!.email })));
      setProjects((projs ?? []) as unknown as ProjectOption[]);
      setEmailById(Object.fromEntries((people ?? []).map((p) => [p.id, p.email])));
      await Promise.all([fetchItems(), fetchProposals()]);
    })();

    // Tiempo real: todos los asistentes ven la minuta y las propuestas en vivo.
    const channel = supabase
      .channel(`meeting_${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings', filter: `id=eq.${id}` }, () => fetchMeeting())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_minute_items', filter: `meeting_id=eq.${id}` }, () => fetchItems())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meeting_task_proposals', filter: `meeting_id=eq.${id}` }, () => fetchProposals())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, id, fetchMeeting, fetchItems, fetchProposals]);

  // Aviso en vivo de "se está grabando": presencia de Realtime, sin tocar la base.
  // Si el jefe cierra la pestaña o se desconecta, el aviso desaparece solo.
  const isRecordingNow = recorder.state !== 'idle';
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`recording_${id}`, { config: { presence: { key: user.id } } });
    ch.on('presence', { event: 'sync' }, () => {
      const all = Object.values(ch.presenceState()).flat() as unknown as { recording?: boolean }[];
      setRemoteRecording(all.some((p) => p.recording));
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ recording: isRecordingNow });
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, id, isRecordingNow]);

  // URL firmada para escuchar la grabación (el bucket es privado).
  const recordingPath = meeting?.recording_path ?? null;
  useEffect(() => {
    if (!recordingPath) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage.from('meeting-recordings').createSignedUrl(recordingPath, 60 * 60);
      if (!cancelled) setAudioUrl(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [recordingPath]);

  // Token vigente: si el navegador estuvo en segundo plano o en suspensión
  // el token pudo vencer, así que se renueva antes de llamar a la API.
  const freshToken = useCallback(async (forceRefresh: boolean) => {
    const { data: { session } } = await supabase.auth.getSession();
    const expiresSoon = !session?.expires_at || session.expires_at * 1000 - Date.now() < 2 * 60 * 1000;
    if (session && !forceRefresh && !expiresSoon) return session.access_token;
    const { data, error: refreshErr } = await supabase.auth.refreshSession();
    return refreshErr ? null : data.session?.access_token ?? null;
  }, []);

  const process = useCallback(async () => {
    setProcessing(true);
    setError(null);
    const call = (token: string) =>
      fetch('/api/ai/procesar-junta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meetingId: id }),
      });
    let failure: string | null = null;
    try {
      let token = await freshToken(false);
      let res = token ? await call(token) : null;
      if (!res || res.status === 401) {
        token = await freshToken(true);
        res = token ? await call(token) : null;
      }
      if (!res) {
        failure = 'Tu sesión expiró. La grabación está guardada: vuelve a iniciar sesión y presiona Reintentar.';
      } else if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        failure = res.status === 401
          ? 'Tu sesión expiró. La grabación está guardada: vuelve a iniciar sesión y presiona Reintentar.'
          : body.error ?? 'No se pudo procesar la grabación.';
      }
    } catch {
      failure = 'No se pudo contactar al servidor para procesar la grabación.';
    }
    if (failure) {
      setError(failure);
      // Si el servidor no alcanzó a marcar el error, evita que quede "procesando" para siempre.
      await supabase.from('meetings').update({ ai_status: 'error', ai_error: failure }).eq('id', id).eq('ai_status', 'procesando');
    }
    setProcessing(false);
    await Promise.all([fetchMeeting(), fetchProposals()]);
  }, [id, fetchMeeting, fetchProposals, freshToken]);

  const uploadAudio = useCallback(async (blob: Blob, ext: string) => {
    if (blob.size > MAX_UPLOAD_BYTES) {
      setError('La grabación pesa más de 50 MB, el máximo que permite Supabase en el plan gratuito.');
      return;
    }
    setUploading(true);
    setError(null);
    const path = `${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('meeting-recordings').upload(path, blob, { contentType: blob.type || undefined });
    if (upErr) {
      setUploading(false);
      setError(`No se pudo subir la grabación: ${upErr.message}`);
      return;
    }
    const { error: updErr } = await supabase.from('meetings').update({ recording_path: path, ai_status: 'procesando', ai_error: null }).eq('id', id);
    setUploading(false);
    if (updErr) {
      setError('La grabación se subió, pero no se pudo ligar a la junta.');
      return;
    }
    await fetchMeeting();
    await process();
  }, [id, fetchMeeting, process]);

  const stopAndProcess = useCallback(async () => {
    const blob = await recorder.stop();
    if (blob) await uploadAudio(blob, extensionFor(blob.type));
  }, [recorder, uploadAudio]);

  const extendDuration = async (extra: number) => {
    if (!meeting) return;
    setError(null);
    const next = (meeting.duration_minutes ?? 60) + extra;
    const { error: err } = await supabase.from('meetings').update({ duration_minutes: next }).eq('id', id);
    if (err) setError('No se pudo extender la duración de la junta.');
    await fetchMeeting();
  };

  const setStatus = async (status: Meeting['status']) => {
    setError(null);
    if (status === 'terminada' && recorder.state !== 'idle') await stopAndProcess();
    const values: Partial<Meeting> = { status };
    if (status === 'en_curso') values.started_at = new Date().toISOString();
    if (status === 'terminada') values.ended_at = new Date().toISOString();
    const { error: err } = await supabase.from('meetings').update(values).eq('id', id);
    if (err) setError('No se pudo cambiar el estado de la junta.');
    // Cancelada: también se quita de Google Calendar (avisa a los invitados).
    if (!err && status === 'cancelada' && meeting) {
      const eventId = meeting.google_event_id ?? series?.google_event_id;
      if (eventId) {
        const ok = await cancelMeetingEvent(eventId, meeting.google_event_id ? undefined : new Date(meeting.scheduled_at));
        if (!ok) setError('La junta se canceló aquí, pero no se pudo quitar de Google Calendar (inicia sesión con Google o cancélala allá).');
      }
    }
    await fetchMeeting();
  };

  const updateReminder = async (minutes: number | null) => {
    setError(null);
    const { error: err } = await supabase.from('meetings').update({ reminder_minutes: minutes }).eq('id', id);
    if (err) setError('No se pudo cambiar el recordatorio.');
    await fetchMeeting();
  };

  // Deja esta junta como la última de la serie.
  const stopSeries = async () => {
    if (!series || !meeting) return;
    setConfirmStop(false);
    setError(null);
    const { error: err } = await supabase.from('meeting_series').update({ active: false }).eq('id', series.id);
    if (err) {
      setError('No se pudo detener la repetición.');
      return;
    }
    if (series.google_event_id) {
      const ok = await endRecurringEvent(
        series.google_event_id,
        { frequency: series.frequency, everyN: series.every_n, start: new Date(series.starts_at) },
        toDateInput(new Date(meeting.scheduled_at)),
      );
      if (!ok) setError('Ya no se repite aquí, pero no se pudo actualizar Google Calendar (inicia sesión con Google o edítala allá).');
    }
    await fetchMeeting();
  };

  const attendeeEmails = useMemo(() => attendees.map((a) => a.email), [attendees]);

  if (loading || !user) return <div className="p-8 text-[var(--text-secondary)]">Cargando…</div>;
  if (notFound) {
    return (
      <div className="glass-panel glass-iridescent rounded-[28px] p-8 max-w-xl text-[var(--text-primary)] flex flex-col gap-3">
        <h1 className="text-2xl font-bold">No encontramos esta junta</h1>
        <p className="text-sm text-[var(--text-secondary)]">Puede que no exista o que no estés invitado.</p>
        <Link href="/dashboard/juntas" className="self-start chip-glass min-h-11 px-4 rounded-[14px] text-sm font-semibold flex items-center">Volver a Juntas</Link>
      </div>
    );
  }
  if (!meeting) return <div className="p-8 text-[var(--text-secondary)]">Cargando junta…</div>;

  const canWrite = meeting.status !== 'cancelada';
  const plannedMin = meeting.duration_minutes ?? 60;
  const startedMs = new Date(meeting.started_at ?? meeting.scheduled_at).getTime();
  const overtimeMin = meeting.status === 'en_curso' ? Math.max(0, Math.floor((now - startedMs) / 60000) - plannedMin) : 0;

  return (
    <div className="fit-page max-w-[1400px] flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/dashboard/juntas" aria-label="Volver a Juntas" className="glass-panel w-12 h-12 shrink-0 rounded-[16px] flex items-center justify-center text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors">
            <ChevronLeft size={20} />
          </Link>
          <div className="min-w-0 flex flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-[10px]" style={statusStyle(meeting.status)}>
                {meeting.status === 'en_curso' && <span className="w-2 h-2 rounded-full bg-current animate-pulse" />}
                {STATUS_LABEL[meeting.status]}
              </span>
              <span className="font-mono text-xs text-[var(--text-secondary)] first-letter:uppercase">{meetingDateTime.format(new Date(meeting.scheduled_at))} · {durationLabel(plannedMin)}</span>
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)] truncate">{meeting.title}</h1>
            <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
              {series && (
                <span className="chip-glass px-2 py-1 rounded-[8px] inline-flex items-center gap-1.5 text-[var(--text-primary)]">
                  <Repeat size={12} />
                  {series.active ? describeRecurrence(series.frequency, series.every_n, toDateInput(new Date(series.starts_at))) : 'Última de la serie'}
                </span>
              )}
              {meeting.status === 'programada' && (
                isJefe ? (
                  <label className="chip-glass pl-2 pr-1 py-0.5 rounded-[8px] inline-flex items-center gap-1.5 text-[var(--text-primary)]">
                    <Bell size={12} />
                    <span className="sr-only">Recordatorio</span>
                    <select name="reminder_minutes"
                      value={meeting.reminder_minutes ?? ''}
                      onChange={(e) => updateReminder(e.target.value === '' ? null : Number(e.target.value))}
                      className="bg-transparent text-xs font-semibold outline-none cursor-pointer"
                    >
                      {REMINDER_OPTIONS.map((o) => <option key={o.label} value={o.value ?? ''}>{o.label}</option>)}
                    </select>
                  </label>
                ) : (
                  <span className="chip-glass px-2 py-1 rounded-[8px] inline-flex items-center gap-1.5 text-[var(--text-primary)]">
                    <Bell size={12} /> {reminderLabel(meeting.reminder_minutes)}
                  </span>
                )
              )}
              {isJefe && series?.active && (
                confirmStop ? (
                  <span className="inline-flex items-center gap-1">
                    <button onClick={stopSeries} className="px-2 py-1 rounded-[8px] font-semibold bg-red-500/15 text-red-500 hover:bg-red-500/25">Sí, que esta sea la última</button>
                    <button onClick={() => setConfirmStop(false)} className="px-2 py-1 rounded-[8px] font-semibold hover:bg-[var(--bg-card-hover)]">No</button>
                  </span>
                ) : (
                  <button onClick={() => setConfirmStop(true)} className="px-2 py-1 rounded-[8px] font-semibold hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]">Dejar de repetir</button>
                )
              )}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <AvatarStack emails={attendeeEmails} currentEmail={user.email} max={6} />
          <span className="text-[13px] text-[var(--text-secondary)]">{attendees.length} asistentes</span>
          {meeting.video_url && (meeting.status === 'programada' || meeting.status === 'en_curso') && (
            <a href={meeting.video_url} target="_blank" rel="noopener noreferrer" className="chip-glass min-h-11 px-4 rounded-[14px] text-sm font-semibold border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] inline-flex items-center gap-2">
              <Video size={16} /> Unirse por Meet
            </a>
          )}
          {isJefe && meeting.status === 'programada' && (
            <>
              <button onClick={() => setStatus('cancelada')} className="chip-glass min-h-11 px-4 rounded-[14px] text-sm font-semibold border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] inline-flex items-center gap-2">
                <XCircle size={16} /> Cancelar
              </button>
              <button onClick={() => setStatus('en_curso')} className="nav-active min-h-11 px-5 rounded-[14px] text-sm font-semibold inline-flex items-center gap-2">
                <Play size={16} fill="currentColor" /> Iniciar junta
              </button>
            </>
          )}
          {isJefe && meeting.status === 'en_curso' && (
            <button onClick={() => setStatus('terminada')} className="nav-active min-h-11 px-5 rounded-[14px] text-sm font-semibold inline-flex items-center gap-2">
              <Square size={14} fill="currentColor" /> Terminar junta
            </button>
          )}
        </div>
      </header>

      {meeting.status !== 'cancelada' && (
        <RecorderBar
          recorder={recorder}
          remoteRecording={remoteRecording}
          isJefe={isJefe}
          canRecord={meeting.status === 'en_curso'}
          hasRecording={!!meeting.recording_path}
          savedMs={savedMs}
          uploading={uploading}
          onStop={stopAndProcess}
          onUploadFile={(f) => uploadAudio(f, f.name.split('.').pop()?.toLowerCase() || 'webm')}
        />
      )}

      {overtimeMin > 0 && (
        <div role="alert" className="rounded-[16px] px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-3" style={{ background: 'var(--prio-media-bg)', color: 'var(--prio-media-text)' }}>
          <span>
            Esta junta ya rebasó su duración de {durationLabel(plannedMin)} por {durationLabel(overtimeMin)}.
            {recorder.state !== 'idle' && ' La grabación sigue activa.'}
          </span>
          {isJefe && (
            <span className="flex gap-2">
              <button onClick={() => extendDuration(15)} className="chip-glass min-h-9 px-3 rounded-[12px] text-[13px] font-semibold border border-[var(--border-card)] text-[var(--text-primary)]">Extender 15 min</button>
              <button onClick={() => setStatus('terminada')} className="nav-active min-h-9 px-3 rounded-[12px] text-[13px] font-semibold">Terminar junta</button>
            </span>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-[16px] px-4 py-3 text-sm" style={{ background: 'var(--prio-alta-bg)', color: 'var(--prio-alta-text)' }}>{error}</p>
      )}

      <div className="fit-body meeting-columns flex flex-wrap gap-5 items-start">
        <div className="flex-[1_1_300px] min-w-0">
          <ReviewPanel attendees={attendees} reviewFrom={meeting.review_from} currentUserId={user.id} />
        </div>
        <div className="flex-[1.35_1_380px] min-w-0">
          <MinutePanel
            meetingId={meeting.id}
            items={items}
            notes={meeting.notes}
            canWrite={canWrite}
            isJefe={isJefe}
            currentUserId={user.id}
            onChanged={fetchItems}
          >
              {(meeting.recording_path || meeting.transcript) && (
                <div className="flex flex-col gap-3 border-t border-[var(--border-card)] pt-4">
                  <h3 className="text-base font-semibold text-[var(--text-primary)] flex items-center gap-2"><FileText size={18} /> Grabación y transcripción</h3>
                  {audioUrl && <audio controls preload="metadata" src={audioUrl} className="w-full" />}
                  {meeting.transcript ? (
                    <details className="chip-glass rounded-[16px] p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-[var(--text-primary)]">Ver transcripción</summary>
                      <p className="mt-3 text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">{meeting.transcript}</p>
                    </details>
                  ) : (
                    <p className="text-sm text-[var(--text-secondary)]">La transcripción aparecerá cuando la IA termine de procesar.</p>
                  )}
                  {isJefe && meeting.recording_path && meeting.ai_status !== 'procesando' && !processing && (
                    <button onClick={process} className="self-start chip-glass min-h-10 px-4 rounded-[12px] text-[13px] font-semibold border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]">
                      Volver a procesar con IA
                    </button>
                  )}
                </div>
              )}
          </MinutePanel>
        </div>
        <div className="flex-[1.2_1_340px] min-w-0">
          <ProposalsPanel
            meetingId={meeting.id}
            proposals={proposals}
            projects={projects}
            emailById={emailById}
            attendees={attendees}
            isJefe={isJefe}
            isAttendee={attendees.some((a) => a.id === user.id)}
            currentUserId={user.id}
            aiStatus={meeting.ai_status}
            aiError={meeting.ai_error}
            hasRecording={!!meeting.recording_path}
            processing={processing}
            onProcess={process}
            onChanged={fetchProposals}
          />
        </div>
      </div>

    </div>
  );
}
