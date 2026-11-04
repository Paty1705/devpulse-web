'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'recording' | 'paused';

// Formatos en orden de preferencia: ogg/mp4 los acepta Gemini tal cual;
// webm es lo que graba Chrome/Brave.
const MIME_CANDIDATES = ['audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
// Voz con calidad suficiente para transcribir: ~15 MB por hora.
const BITS_PER_SECOND = 32000;
const LEVEL_BARS = 64;

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

export function extensionFor(mime: string) {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  return 'webm';
}

/**
 * Graba audio del micrófono con MediaRecorder.
 * - `levels`: niveles recientes (0-1) para dibujar la onda en vivo.
 * - `stop()` resuelve con el archivo final.
 */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(LEVEL_BARS).fill(0));
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);
  const accumulated = useRef(0);

  const cleanup = useCallback(() => {
    if (tick.current) clearInterval(tick.current);
    tick.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Avisa antes de cerrar la pestaña con una grabación sin subir.
  useEffect(() => {
    if (state === 'idle') return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Este navegador no permite grabar audio.');
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = media;
      const mime = pickMime();
      const rec = new MediaRecorder(media, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: BITS_PER_SECOND });
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.start(1000);
      recorder.current = rec;

      // Medidor de nivel para la onda.
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(media).connect(analyser);
      audioCtx.current = ctx;
      const buf = new Uint8Array(analyser.fftSize);

      accumulated.current = 0;
      startedAt.current = Date.now();
      tick.current = setInterval(() => {
        if (recorder.current?.state === 'recording') {
          setElapsed(accumulated.current + (Date.now() - startedAt.current));
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += ((v - 128) / 128) ** 2;
          const rms = Math.min(1, Math.sqrt(sum / buf.length) * 4);
          setLevels((prev) => [...prev.slice(1), rms]);
        }
      }, 100);
      setElapsed(0);
      setState('recording');
    } catch (e) {
      cleanup();
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      setError(denied ? 'Da permiso al navegador para usar el micrófono.' : 'No se pudo iniciar la grabación.');
    }
  }, [cleanup]);

  const pause = useCallback(() => {
    if (recorder.current?.state !== 'recording') return;
    recorder.current.pause();
    accumulated.current += Date.now() - startedAt.current;
    setLevels(Array(LEVEL_BARS).fill(0));
    setState('paused');
  }, []);

  const resume = useCallback(() => {
    if (recorder.current?.state !== 'paused') return;
    recorder.current.resume();
    startedAt.current = Date.now();
    setState('recording');
  }, []);

  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const rec = recorder.current;
        if (!rec || rec.state === 'inactive') {
          resolve(null);
          return;
        }
        rec.onstop = () => {
          const type = rec.mimeType || 'audio/webm';
          const blob = new Blob(chunks.current, { type });
          chunks.current = [];
          recorder.current = null;
          cleanup();
          setState('idle');
          setLevels(Array(LEVEL_BARS).fill(0));
          resolve(blob.size > 0 ? blob : null);
        };
        rec.stop();
      }),
    [cleanup],
  );

  return { state, elapsed, levels, error, start, pause, resume, stop };
}

export function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
