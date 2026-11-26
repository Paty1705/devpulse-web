'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type Entry = { channel?: RealtimeChannel; cancelled: boolean };

/**
 * Aviso en vivo de "se está grabando" (presencia de Realtime, sin tocar la base).
 * Mantiene un solo canal por junta: la que se está viendo y la que se está
 * grabando. Si quien graba cierra la pestaña o se desconecta, el aviso
 * desaparece solo.
 */
export function useRecordingPresence(userId: string | undefined, watchedId: string | null, recordingId: string | null) {
  const [remote, setRemote] = useState<Record<string, boolean>>({});
  const channels = useRef(new Map<string, Entry>());
  const closing = useRef(new Map<string, Promise<unknown>>());
  const recordingRef = useRef(recordingId);

  const close = useCallback((id: string) => {
    const entry = channels.current.get(id);
    if (!entry) return;
    entry.cancelled = true;
    channels.current.delete(id);
    if (entry.channel) closing.current.set(id, supabase.removeChannel(entry.channel));
  }, []);

  useEffect(() => {
    const wanted = new Set(userId ? [watchedId, recordingId].filter((x): x is string => !!x) : []);
    for (const id of [...channels.current.keys()]) if (!wanted.has(id)) close(id);
    for (const id of wanted) {
      if (channels.current.has(id)) continue;
      const entry: Entry = { cancelled: false };
      channels.current.set(id, entry);
      (async () => {
        // Hasta que termine de cerrarse, supabase.channel() devolvería el canal anterior.
        await closing.current.get(id);
        if (entry.cancelled) return;
        const ch = supabase.channel(`recording_${id}`, { config: { presence: { key: userId! } } });
        entry.channel = ch;
        ch.on('presence', { event: 'sync' }, () => {
          const all = Object.values(ch.presenceState()).flat() as unknown as { recording?: boolean }[];
          setRemote((r) => ({ ...r, [id]: all.some((p) => p.recording) }));
        }).subscribe(async (status) => {
          if (status === 'SUBSCRIBED') await ch.track({ recording: recordingRef.current === id });
        });
      })();
    }
  }, [userId, watchedId, recordingId, close]);

  // Al empezar o detener la grabación se avisa por los canales ya abiertos.
  useEffect(() => {
    recordingRef.current = recordingId;
    for (const [id, { channel }] of channels.current) {
      if (channel?.state === 'joined') channel.track({ recording: recordingId === id });
    }
  }, [recordingId]);

  useEffect(() => {
    const open = channels.current;
    return () => {
      for (const id of [...open.keys()]) close(id);
    };
  }, [close]);

  return remote;
}
