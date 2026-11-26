'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Loader2, Pause, Play, Square, X } from 'lucide-react';
import { useRecording } from '@/components/juntas/RecordingProvider';
import { formatElapsed } from '@/components/juntas/useRecorder';

const card = 'pointer-events-auto flex items-center gap-3 rounded-[16px] pl-4 pr-2 py-2 border border-[var(--border-card)] shadow-[var(--shadow-hover)] bg-[var(--bg-solid,var(--bg-card))] text-sm text-[var(--text-primary)] max-w-full';
const button = 'shrink-0 min-h-9 min-w-9 px-2.5 rounded-[10px] inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold surface-card border border-[var(--border-card)] hover:bg-[var(--bg-card-hover)]';

const JOB_TEXT = {
  subiendo: 'Subiendo grabación…',
  procesando: 'La IA está procesando…',
  listo: 'Tareas propuestas listas',
  error: 'No se pudo procesar',
} as const;

/** Aviso flotante para volver a la junta o detenerla desde cualquier pantalla. */
export function RecordingIndicator() {
  const pathname = usePathname();
  const { recorder, target, recordingId, jobs, stopAndSave, dismiss } = useRecording();
  const href = (id: string) => `/dashboard/juntas/${id}`;
  // En la pantalla de la propia junta ya se ve todo.
  const live = recordingId && target && pathname !== href(target.id) ? target : null;
  const others = Object.values(jobs).filter((j) => pathname !== href(j.id) && j.id !== live?.id);
  if (!live && others.length === 0) return null;
  const paused = recorder.state === 'paused';

  return (
    <div className="print:hidden pointer-events-none fixed z-40 inset-x-3 bottom-3 xl:bottom-auto xl:top-3 flex flex-col items-center gap-2">
      {live && (
        <div className={card}>
          <span aria-hidden="true" className={`shrink-0 w-3 h-3 rounded-full ${paused ? '' : 'animate-pulse'}`} style={{ background: paused ? 'var(--prio-media-text)' : '#F43F5E' }} />
          <Link href={href(live.id)} className="min-w-0 flex items-baseline gap-2 hover:underline underline-offset-2">
            <span className="shrink-0 font-semibold">{paused ? 'En pausa' : 'Grabando'}</span>
            <span className="shrink-0 font-mono font-bold">{formatElapsed(recorder.elapsed)}</span>
            <span className="truncate text-[var(--text-secondary)] max-w-[14rem]">{live.title}</span>
          </Link>
          <button onClick={paused ? recorder.resume : recorder.pause} aria-label={paused ? 'Reanudar grabación' : 'Pausar grabación'} title={paused ? 'Reanudar' : 'Pausar'} className={button}>
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
          <button onClick={stopAndSave} title="Detener y procesar" className="nav-active shrink-0 min-h-9 px-3 rounded-[10px] inline-flex items-center gap-1.5 text-[13px] font-semibold">
            <Square size={12} fill="currentColor" /> Detener
          </button>
          {recorder.warning && <AlertTriangle size={16} aria-label={recorder.warning} className="shrink-0" style={{ color: 'var(--prio-alta-text)' }} />}
        </div>
      )}
      {others.map((j) => (
        <div key={j.id} role="status" className={card}>
          {j.stage === 'listo' ? (
            <CheckCircle2 size={16} className="shrink-0" style={{ color: 'var(--ok-text)' }} />
          ) : j.stage === 'error' ? (
            <AlertTriangle size={16} className="shrink-0" style={{ color: 'var(--prio-alta-text)' }} />
          ) : (
            <Loader2 size={16} className="shrink-0 animate-spin" />
          )}
          <span className="min-w-0 flex items-baseline gap-2">
            <span className="shrink-0 font-semibold">{JOB_TEXT[j.stage]}</span>
            <span className="truncate text-[var(--text-secondary)] max-w-[14rem]" title={j.error}>{j.title}</span>
          </span>
          <Link href={href(j.id)} className={button}>Ver junta</Link>
          {(j.stage === 'listo' || j.stage === 'error') && (
            <button onClick={() => dismiss(j.id)} aria-label="Cerrar aviso" className={button}><X size={15} /></button>
          )}
        </div>
      ))}
    </div>
  );
}
