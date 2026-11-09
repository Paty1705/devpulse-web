'use client';

import { useRef } from 'react';
import { Loader2, Mic, Pause, Play, Square, Upload } from 'lucide-react';
import { formatElapsed, type useRecorder } from '@/components/juntas/useRecorder';

type Recorder = ReturnType<typeof useRecorder>;

type Props = {
  recorder: Recorder;
  isJefe: boolean;
  canRecord: boolean;
  hasRecording: boolean;
  uploading: boolean;
  onStop: () => void;
  onUploadFile: (file: File) => void;
};

export function RecorderBar({ recorder, isJefe, canRecord, hasRecording, uploading, onStop, onUploadFile }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { state, elapsed, levels, error, start, pause, resume } = recorder;
  const live = state === 'recording';

  const label = uploading
    ? 'Subiendo grabación…'
    : live
      ? 'Grabando'
      : state === 'paused'
        ? 'En pausa'
        : hasRecording
          ? 'Grabación guardada'
          : 'Sin grabar';

  return (
    <section className="glass-panel glass-iridescent thick-iridescent rounded-[26px] px-5 py-4 flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="flex items-center gap-3 min-w-[170px]">
        <span
          aria-hidden="true"
          className={`w-3.5 h-3.5 rounded-full ${live ? 'animate-pulse' : ''}`}
          style={{
            background: live ? '#F43F5E' : state === 'paused' ? 'var(--prio-media-text)' : hasRecording ? 'var(--ok-text)' : 'var(--text-secondary)',
            boxShadow: live ? '0 0 0 6px rgba(244,63,94,0.2), 0 0 14px #F43F5E' : undefined,
          }}
        />
        <span className="flex flex-col">
          <span className="text-sm font-semibold text-[var(--text-primary)]" aria-live="polite">{label}</span>
          <span className="font-mono text-xl font-bold tracking-wide text-[var(--text-primary)]">{formatElapsed(elapsed)}</span>
        </span>
      </div>

      <div aria-hidden="true" className="flex-1 min-w-[160px] h-11 flex items-center justify-between gap-[3px] overflow-hidden" style={{ opacity: live ? 1 : 0.35 }}>
        {levels.map((v, i) => (
          <span
            key={i}
            className="w-1 shrink-0 rounded-full transition-[height] duration-100"
            style={{ height: `${Math.max(10, Math.round(v * 100))}%`, background: 'linear-gradient(180deg, var(--accent-2), var(--accent))' }}
          />
        ))}
      </div>

      {isJefe ? (
        <div className="flex flex-wrap gap-2.5">
          {state === 'idle' && (
            <>
              <button
                onClick={start}
                disabled={!canRecord || uploading}
                title={canRecord ? undefined : 'Inicia la junta para poder grabar'}
                className="nav-active min-h-11 px-4 rounded-[14px] text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mic size={16} /> {hasRecording ? 'Grabar de nuevo' : 'Grabar'}
              </button>
              <button
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="chip-glass min-h-11 px-4 rounded-[14px] text-sm font-semibold border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] inline-flex items-center gap-2 disabled:opacity-50"
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Subir audio
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUploadFile(f);
                  e.target.value = '';
                }}
              />
            </>
          )}
          {state === 'recording' && (
            <button onClick={pause} className="chip-glass min-h-11 px-4 rounded-[14px] text-sm font-semibold border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] inline-flex items-center gap-2">
              <Pause size={16} /> Pausar
            </button>
          )}
          {state === 'paused' && (
            <button onClick={resume} className="chip-glass min-h-11 px-4 rounded-[14px] text-sm font-semibold border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] inline-flex items-center gap-2">
              <Play size={16} /> Reanudar
            </button>
          )}
          {state !== 'idle' && (
            <button onClick={onStop} className="nav-active min-h-11 px-4 rounded-[14px] text-sm font-semibold inline-flex items-center gap-2">
              <Square size={14} fill="currentColor" /> Detener y procesar
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-[var(--text-secondary)] max-w-[260px]">El jefe graba la junta; la IA propone las tareas al terminar.</p>
      )}

      {(error || (isJefe && state !== 'idle')) && (
        <p className="basis-full text-xs" style={{ color: error ? 'var(--prio-alta-text)' : 'var(--text-secondary)' }}>
          {error ?? 'Avisa a los asistentes que la junta se está grabando. No cierres esta pestaña hasta detener la grabación.'}
        </p>
      )}
    </section>
  );
}
