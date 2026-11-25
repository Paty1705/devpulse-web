'use client';

import { useEffect, useState } from 'react';

/**
 * Lee la duración (ms) del audio en `url` y la entrega a `onDuration`.
 * Devuelve la función para dejar de escuchar.
 */
export function readAudioDuration(url: string, onDuration: (ms: number) => void) {
  const audio = new Audio();
  const onChange = () => {
    if (Number.isFinite(audio.duration) && audio.duration > 0) onDuration(audio.duration * 1000);
  };
  // Las grabaciones webm no traen la duración: saltar al final obliga al
  // navegador a calcularla.
  const onMetadata = () => {
    if (audio.duration === Infinity) audio.currentTime = 1e101;
  };
  audio.addEventListener('loadedmetadata', onMetadata);
  audio.addEventListener('durationchange', onChange);
  audio.preload = 'metadata';
  audio.src = url;
  return () => {
    audio.removeEventListener('loadedmetadata', onMetadata);
    audio.removeEventListener('durationchange', onChange);
    audio.removeAttribute('src');
    audio.load();
  };
}

/** Duración (ms) del audio en `url`; null mientras no se conoce. */
export function useAudioDuration(url: string | null) {
  const [result, setResult] = useState<{ url: string; ms: number } | null>(null);
  useEffect(() => {
    if (!url) return;
    return readAudioDuration(url, (ms) => setResult({ url, ms }));
  }, [url]);
  return result && result.url === url ? result.ms : null;
}
