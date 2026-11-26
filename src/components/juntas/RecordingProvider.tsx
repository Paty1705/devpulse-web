'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/providers/AuthProvider';
import { RecordingIndicator } from '@/components/juntas/RecordingIndicator';
import { extensionFor, useRecorder } from '@/components/juntas/useRecorder';
import { useRecordingPresence } from '@/components/juntas/useRecordingPresence';

// Límite de subida de Supabase Storage en el plan gratuito.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const SESSION_EXPIRED = 'Tu sesión expiró. La grabación está guardada: vuelve a iniciar sesión y presiona Reintentar.';

export type MeetingRef = { id: string; title: string };

/** Subida y procesamiento de la grabación de una junta. */
export type RecordingJob = MeetingRef & {
  stage: 'subiendo' | 'procesando' | 'listo' | 'error';
  error?: string;
};

type RecordingValue = {
  recorder: ReturnType<typeof useRecorder>;
  /** Junta a la que pertenece la grabación en curso (o la última). */
  target: MeetingRef | null;
  /** Junta que se está grabando ahora, si hay alguna. */
  recordingId: string | null;
  jobs: Record<string, RecordingJob>;
  /** Por junta: si alguien (quizá desde otro equipo) la está grabando. */
  remote: Record<string, boolean>;
  start: (meeting: MeetingRef) => Promise<void>;
  stopAndSave: () => Promise<void>;
  uploadAudio: (meeting: MeetingRef, blob: Blob, ext: string) => Promise<void>;
  process: (meeting: MeetingRef) => Promise<void>;
  dismiss: (meetingId: string) => void;
  /** La pantalla de una junta pide su aviso de grabación; devuelve cómo soltarlo. */
  watch: (meetingId: string) => () => void;
};

const RecordingContext = createContext<RecordingValue | null>(null);
// Aparte, para que el menú no se vuelva a dibujar con cada nivel del micrófono.
const RecordingBusyContext = createContext(false);

export function useRecording() {
  const value = useContext(RecordingContext);
  if (!value) throw new Error('useRecording necesita <RecordingProvider>.');
  return value;
}

/** Hay una grabación en curso o subiéndose: salir de la sesión la perdería. */
export const useRecordingBusy = () => useContext(RecordingBusyContext);

// Token vigente: si el navegador estuvo en segundo plano o en suspensión
// el token pudo vencer, así que se renueva antes de llamar a la API.
async function freshToken(forceRefresh: boolean) {
  const { data: { session } } = await supabase.auth.getSession();
  const expiresSoon = !session?.expires_at || session.expires_at * 1000 - Date.now() < 2 * 60 * 1000;
  if (session && !forceRefresh && !expiresSoon) return session.access_token;
  const { data, error } = await supabase.auth.refreshSession();
  return error ? null : data.session?.access_token ?? null;
}

/**
 * Vive por encima de las pantallas: la grabación, su subida y el proceso con IA
 * siguen aunque se cambie de sección.
 */
export function RecordingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const recorder = useRecorder();
  const { start: startRecorder, stop: stopRecorder, state } = recorder;
  const [target, setTarget] = useState<MeetingRef | null>(null);
  const [jobs, setJobs] = useState<Record<string, RecordingJob>>({});
  const [watchedId, setWatchedId] = useState<string | null>(null);
  const recordingId = state !== 'idle' && target ? target.id : null;
  const remote = useRecordingPresence(user?.id, watchedId, recordingId);

  const setJob = useCallback(({ id, title }: MeetingRef, stage: RecordingJob['stage'], error?: string) => {
    setJobs((j) => ({ ...j, [id]: { id, title, stage, error } }));
  }, []);

  const dismiss = useCallback((meetingId: string) => {
    setJobs((j) => Object.fromEntries(Object.entries(j).filter(([id]) => id !== meetingId)));
  }, []);

  const watch = useCallback((meetingId: string) => {
    setWatchedId(meetingId);
    return () => setWatchedId((current) => (current === meetingId ? null : current));
  }, []);

  const process = useCallback(async (meeting: MeetingRef) => {
    setJob(meeting, 'procesando');
    const call = (token: string) =>
      fetch('/api/ai/procesar-junta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ meetingId: meeting.id }),
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
        failure = SESSION_EXPIRED;
      } else if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        failure = res.status === 401 ? SESSION_EXPIRED : body.error ?? 'No se pudo procesar la grabación.';
      }
    } catch {
      failure = 'No se pudo contactar al servidor para procesar la grabación.';
    }
    if (failure) {
      // Si el servidor no alcanzó a marcar el error, evita que quede "procesando" para siempre.
      await supabase.from('meetings').update({ ai_status: 'error', ai_error: failure }).eq('id', meeting.id).eq('ai_status', 'procesando');
      setJob(meeting, 'error', failure);
    } else {
      setJob(meeting, 'listo');
    }
  }, [setJob]);

  const uploadAudio = useCallback(async (meeting: MeetingRef, blob: Blob, ext: string) => {
    if (blob.size > MAX_UPLOAD_BYTES) {
      setJob(meeting, 'error', 'La grabación pesa más de 50 MB, el máximo que permite Supabase en el plan gratuito.');
      return;
    }
    setJob(meeting, 'subiendo');
    try {
      const path = `${meeting.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('meeting-recordings').upload(path, blob, { contentType: blob.type || undefined });
      if (upErr) {
        setJob(meeting, 'error', `No se pudo subir la grabación: ${upErr.message}`);
        return;
      }
      const { error: updErr } = await supabase.from('meetings').update({ recording_path: path, ai_status: 'procesando', ai_error: null }).eq('id', meeting.id);
      if (updErr) {
        setJob(meeting, 'error', 'La grabación se subió, pero no se pudo ligar a la junta.');
        return;
      }
    } catch {
      setJob(meeting, 'error', 'No se pudo subir la grabación. Revisa tu conexión.');
      return;
    }
    await process(meeting);
  }, [setJob, process]);

  const start = useCallback(async (meeting: MeetingRef) => {
    if (recordingId) return;
    setTarget(meeting);
    await startRecorder();
  }, [recordingId, startRecorder]);

  const stopAndSave = useCallback(async () => {
    const meeting = target;
    const blob = await stopRecorder();
    if (meeting && blob) await uploadAudio(meeting, blob, extensionFor(blob.type));
  }, [target, stopRecorder, uploadAudio]);

  const uploading = Object.values(jobs).some((j) => j.stage === 'subiendo');

  // Cerrar la pestaña mientras se sube perdería el audio.
  useEffect(() => {
    if (!uploading) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploading]);

  return (
    <RecordingContext.Provider value={{ recorder, target, recordingId, jobs, remote, start, stopAndSave, uploadAudio, process, dismiss, watch }}>
      <RecordingBusyContext.Provider value={!!recordingId || uploading}>
        {children}
        <RecordingIndicator />
      </RecordingBusyContext.Provider>
    </RecordingContext.Provider>
  );
}
