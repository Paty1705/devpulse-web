'use client';

import { useEffect, useRef, useState } from 'react';
import { FileUp, Link2, Pin, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  fileNameOf, formatBytes, guessKind, KIND_LABEL, MAX_FILE_BYTES, parseTags, safeFileName, youtubeId,
  type Resource, type ResourceKind,
} from '@/lib/resources';

export type PersonOption = { id: string; email: string };
export type ProjectOption = { id: string; name: string };

type Props = {
  isOpen: boolean;
  /** Recurso a editar; null para uno nuevo. */
  resource: Resource | null;
  people: PersonOption[];
  projects: ProjectOption[];
  isJefe: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const inputClass =
  'w-full min-h-11 rounded-[12px] px-3 text-sm surface-card border border-[var(--border-card)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]';

const KINDS: ResourceKind[] = ['video', 'documento', 'enlace'];

export function ResourceModal(props: Props) {
  if (!props.isOpen) return null;
  // La key reinicia el formulario cada vez que se abre con otro recurso.
  return <ResourceForm key={props.resource?.id ?? 'nuevo'} {...props} />;
}

function ResourceForm({ resource, people, projects, isJefe, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const editing = !!resource;
  const [source, setSource] = useState<'link' | 'archivo'>(resource?.storage_path ? 'archivo' : 'link');
  const [kind, setKind] = useState<ResourceKind>(resource?.kind ?? 'video');
  const [kindTouched, setKindTouched] = useState(editing);
  const [title, setTitle] = useState(resource?.title ?? '');
  const [url, setUrl] = useState(resource?.url ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState(resource?.description ?? '');
  const [tags, setTags] = useState((resource?.tags ?? []).join(', '));
  const [duration, setDuration] = useState(resource?.duration_minutes ? String(resource.duration_minutes) : '');
  const [projectId, setProjectId] = useState(resource?.project_id ?? '');
  const [recommendedFor, setRecommendedFor] = useState(resource?.recommended_for ?? '');
  const [pinned, setPinned] = useState(resource?.pinned ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onUrlChange = (value: string) => {
    setUrl(value);
    if (!kindTouched && value.trim()) setKind(guessKind(value.trim()));
  };

  const pickFile = (f: File | null) => {
    setError(null);
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setError(`El archivo pesa ${formatBytes(f.size)}; el límite es 50 MB. Súbelo a Drive o YouTube y pega el link.`);
      return;
    }
    setFile(f);
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    if (!kindTouched) setKind(f.type.startsWith('video/') ? 'video' : 'documento');
  };

  const save = async () => {
    if (!user) return;
    setError(null);
    if (!title.trim()) return setError('Ponle un título.');
    const cleanUrl = url.trim();
    if (source === 'link') {
      try {
        const u = new URL(cleanUrl);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
      } catch {
        return setError('Pega un link completo, que empiece con https://');
      }
    } else if (!file && !resource?.storage_path) {
      return setError('Elige un archivo.');
    }
    const minutes = duration.trim() ? Number(duration) : null;
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 999)) {
      return setError('La duración va en minutos, entre 1 y 999.');
    }

    setSaving(true);
    let uploadedPath: string | null = null;
    if (source === 'archivo' && file) {
      uploadedPath = `${user.id}/${Date.now()}-${safeFileName(file.name)}`;
      const { error: upErr } = await supabase.storage.from('resources').upload(uploadedPath, file, { contentType: file.type || undefined });
      if (upErr) {
        setSaving(false);
        return setError('No se pudo subir el archivo. Revisa tu conexión e intenta de nuevo.');
      }
    }

    const values = {
      title: title.trim(),
      kind,
      url: source === 'link' ? cleanUrl : null,
      storage_path: source === 'archivo' ? uploadedPath ?? resource?.storage_path ?? null : null,
      description: description.trim() || null,
      tags: parseTags(tags),
      duration_minutes: kind === 'video' ? minutes : null,
      project_id: projectId || null,
      recommended_for: recommendedFor || null,
      ...(isJefe ? { pinned } : {}),
    };

    const { error: err } = editing
      ? await supabase.from('resources').update(values).eq('id', resource.id)
      : await supabase.from('resources').insert(values);

    if (err) {
      if (uploadedPath) await supabase.storage.from('resources').remove([uploadedPath]);
      setSaving(false);
      return setError(editing ? 'No se pudieron guardar los cambios.' : 'No se pudo guardar el recurso.');
    }
    // Si se reemplazó el archivo o se cambió a link, se borra el anterior.
    if (editing && resource.storage_path && resource.storage_path !== values.storage_path) {
      await supabase.storage.from('resources').remove([resource.storage_path]);
    }
    setSaving(false);
    onSaved();
  };

  const ytId = source === 'link' ? youtubeId(url.trim()) : null;
  const currentFile = file ? `${file.name} · ${formatBytes(file.size)}` : fileNameOf(resource?.storage_path ?? null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="resource-title" className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[24px] shadow-[var(--shadow-hover)] w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 flex justify-between items-center border-b border-[var(--border-column)]">
          <h2 id="resource-title" className="text-xl font-bold text-[var(--text-primary)]">{editing ? 'Editar recurso' : 'Recomendar recurso'}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 rounded-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Origen: link o archivo */}
          <div role="tablist" aria-label="Origen" className="grid grid-cols-2 gap-1 p-1 rounded-[14px] surface-card border border-[var(--border-card)]">
            {([['link', 'Pegar link', Link2], ['archivo', 'Subir archivo', FileUp]] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                role="tab"
                aria-selected={source === value}
                onClick={() => setSource(value)}
                className={`min-h-10 rounded-[10px] text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${source === value ? 'nav-active' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>

          {source === 'link' ? (
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Link</span>
              <input
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                inputMode="url"
                autoFocus={!editing}
                className={inputClass}
              />
              {ytId && (
                <span className="flex items-center gap-3 pt-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} className="w-28 aspect-video rounded-[10px] object-cover border border-[var(--border-card)]" />
                  <span className="text-xs text-[var(--text-secondary)]">Video de YouTube detectado.</span>
                </span>
              )}
            </label>
          ) : (
            <div className="space-y-1.5">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Archivo</span>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  pickFile(e.dataTransfer.files?.[0] ?? null);
                }}
                className="w-full rounded-[16px] border-2 border-dashed border-[var(--border-card)] hover:border-[var(--accent)] p-5 flex flex-col items-center gap-1.5 text-center transition-colors"
              >
                <FileUp size={22} className="text-[var(--text-secondary)]" />
                <span className="text-sm font-semibold text-[var(--text-primary)] break-all">{currentFile ?? 'Elige o arrastra un archivo'}</span>
                <span className="text-xs text-[var(--text-secondary)]">PDF, documentos, presentaciones o video · máximo 50 MB</span>
              </button>
              <input ref={fileInput} type="file" className="hidden" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
            </div>
          )}

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">Tipo</legend>
            <div className="flex gap-2">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => {
                    setKind(k);
                    setKindTouched(true);
                  }}
                  className={`flex-1 min-h-10 rounded-[12px] text-sm font-semibold border transition-colors ${kind === k ? 'border-[var(--accent)] chip-glass text-[var(--text-primary)]' : 'border-[var(--border-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'}`}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Título</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} className={inputClass} />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-[var(--text-primary)]">¿Por qué lo recomiendas? <span className="font-normal text-[var(--text-secondary)]">(opcional)</span></span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={600} className={`${inputClass} py-2.5 resize-none`} />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Etiquetas</span>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="react, supabase, git" className={inputClass} />
            </label>
            {kind === 'video' && (
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold text-[var(--text-primary)]">Minutos</span>
                <input type="number" min={1} max={999} value={duration} onChange={(e) => setDuration(e.target.value)} className={inputClass} />
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Para</span>
              <select value={recommendedFor} onChange={(e) => setRecommendedFor(e.target.value)} className={inputClass}>
                <option value="">Todo el equipo</option>
                {people.filter((p) => p.id !== user?.id).map((p) => <option key={p.id} value={p.id}>{p.email}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-[var(--text-primary)]">Proyecto</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputClass}>
                <option value="">Ninguno</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>

          {isJefe && (
            <label className="flex items-center gap-3 p-3 rounded-[14px] chip-glass border border-[var(--border-card)] cursor-pointer">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
              <Pin size={15} className="text-[var(--text-secondary)]" />
              <span className="text-sm text-[var(--text-primary)]">Fijar arriba del tablero</span>
            </label>
          )}

          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-[var(--border-column)] flex justify-end gap-3">
          <button onClick={onClose} className="min-h-11 px-4 rounded-[12px] text-sm font-semibold chip-glass border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]">
            Cancelar
          </button>
          <button onClick={save} disabled={saving} className="nav-active min-h-11 px-5 rounded-[12px] text-sm font-semibold disabled:opacity-60">
            {saving ? (file ? 'Subiendo…' : 'Guardando…') : editing ? 'Guardar cambios' : 'Recomendar'}
          </button>
        </div>
      </div>
    </div>
  );
}
