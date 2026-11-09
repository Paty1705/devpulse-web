'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BookOpen, ExternalLink, FileText, Link2, Pencil, Pin, PinOff, Play, Plus, Search, Trash2, UserRound, type LucideIcon,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/providers/AuthProvider';
import { Avatar } from '@/components/juntas/Avatar';
import { ResourceModal, type PersonOption, type ProjectOption } from '@/components/recursos/ResourceModal';
import { shortName } from '@/lib/meetings';
import { fileNameOf, hostOf, KIND_LABEL, youtubeId, type Resource, type ResourceKind } from '@/lib/resources';

const KIND_ICON: Record<ResourceKind, LucideIcon> = { video: Play, documento: FileText, enlace: Link2 };
const KIND_TILE: Record<ResourceKind, string> = {
  video: 'linear-gradient(150deg, #475569, #1C2230)',
  documento: 'linear-gradient(150deg, var(--accent-2), var(--accent))',
  enlace: 'linear-gradient(150deg, #5EEAD4, #0F766E)',
};
const FILTERS: { value: ResourceKind | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'video', label: 'Videos' },
  { value: 'documento', label: 'Documentos' },
  { value: 'enlace', label: 'Enlaces' },
];

const relative = new Intl.RelativeTimeFormat('es-MX', { numeric: 'auto' });
function ago(iso: string) {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 864e5);
  if (days > -1) return 'hoy';
  if (days > -30) return relative.format(days, 'day');
  if (days > -365) return relative.format(Math.round(days / 30), 'month');
  return relative.format(Math.round(days / 365), 'year');
}

export default function RecursosPage() {
  return (
    <Suspense fallback={<div className="p-8 text-[var(--text-secondary)]">Cargando…</div>}>
      <RecursosBoard />
    </Suspense>
  );
}

function RecursosBoard() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const isJefe = profile?.role === 'jefe';

  const [rows, setRows] = useState<Resource[]>([]);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ResourceKind | 'todos'>('todos');
  const [forMe, setForMe] = useState(params.get('para') === 'mi');
  const [tag, setTag] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  const fetchResources = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('resources')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (err) setError('No se pudieron cargar los recursos.');
    else setError(null);
    setRows((data ?? []) as Resource[]);
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: profs }, { data: projs }] = await Promise.all([
        supabase.from('profiles').select('id, email').eq('status', 'approved').order('email'),
        supabase.from('projects').select('id, name').order('name'),
        fetchResources(),
      ]);
      setPeople((profs ?? []) as PersonOption[]);
      setProjects((projs ?? []) as ProjectOption[]);
    })();
    const channel = supabase
      .channel('resources_board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resources' }, () => fetchResources())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchResources]);

  const emailById = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p.email])), [people]);
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects]);

  const forMeCount = useMemo(() => rows.filter((r) => r.recommended_for === user?.id).length, [rows, user]);

  const topTags = useMemo(() => {
    const count = new Map<string, number>();
    rows.forEach((r) => r.tags.forEach((t) => count.set(t, (count.get(t) ?? 0) + 1)));
    return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([t]) => t);
  }, [rows]);

  const { pinned, rest, kindCount } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (forMe && r.recommended_for !== user?.id) return false;
      if (tag && !r.tags.includes(tag)) return false;
      if (q) {
        const hay = [r.title, r.description ?? '', r.tags.join(' '), hostOf(r.url) ?? '', fileNameOf(r.storage_path) ?? ''].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const counts: Record<string, number> = { todos: base.length, video: 0, documento: 0, enlace: 0 };
    base.forEach((r) => counts[r.kind]++);
    const shown = kind === 'todos' ? base : base.filter((r) => r.kind === kind);
    return { pinned: shown.filter((r) => r.pinned), rest: shown.filter((r) => !r.pinned), kindCount: counts };
  }, [rows, query, kind, forMe, tag, user]);

  const open = async (r: Resource) => {
    if (r.url) {
      window.open(r.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!r.storage_path) return;
    // Se abre la pestaña antes de pedir la URL para que no la bloquee el navegador.
    const tab = window.open('', '_blank');
    const { data, error: err } = await supabase.storage.from('resources').createSignedUrl(r.storage_path, 60 * 60);
    if (err || !data) {
      tab?.close();
      setError('No se pudo abrir el archivo.');
      return;
    }
    if (tab) tab.location.href = data.signedUrl;
    else window.location.assign(data.signedUrl);
  };

  const togglePin = async (r: Resource) => {
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, pinned: !r.pinned } : x)));
    const { error: err } = await supabase.from('resources').update({ pinned: !r.pinned }).eq('id', r.id);
    if (err) {
      setError('No se pudo fijar el recurso.');
      fetchResources();
    }
  };

  const remove = async (r: Resource) => {
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    const { error: err } = await supabase.from('resources').delete().eq('id', r.id);
    if (err) {
      setError('No se pudo borrar el recurso.');
      fetchResources();
      return;
    }
    if (r.storage_path) await supabase.storage.from('resources').remove([r.storage_path]);
  };

  if (loading || !user) return <div className="p-8 text-[var(--text-secondary)]">Cargando…</div>;

  const filtered = query.trim() !== '' || kind !== 'todos' || forMe || tag !== null;
  const nothing = pinned.length === 0 && rest.length === 0;

  const card = (r: Resource) => (
    <ResourceCard
      key={r.id}
      resource={r}
      authorEmail={r.recommended_by ? emailById[r.recommended_by] : undefined}
      forEmail={r.recommended_for ? emailById[r.recommended_for] : undefined}
      projectName={r.project_id ? projectById[r.project_id] : undefined}
      currentUserId={user.id}
      isJefe={isJefe}
      onOpen={() => open(r)}
      onEdit={() => {
        setEditing(r);
        setModalOpen(true);
      }}
      onTogglePin={() => togglePin(r)}
      onDelete={() => remove(r)}
      onTag={(t) => setTag(t)}
    />
  );

  return (
    <div className="max-w-[1400px] flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">Recursos</h1>
          <p className="text-sm text-[var(--text-secondary)]">Videos, documentos y enlaces que el equipo recomienda.</p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="nav-active min-h-11 px-5 rounded-[14px] font-semibold text-sm inline-flex items-center gap-2 active:scale-[0.97] transition-transform"
        >
          <Plus size={16} /> Recomendar
        </button>
      </header>

      {/* Filtros */}
      <div className="glass-panel rounded-[22px] p-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-[1_1_220px] min-w-0">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)] pointer-events-none" />
            <span className="sr-only">Buscar</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por título, etiqueta o sitio…"
              className="w-full min-h-11 rounded-[14px] pl-9 pr-3 text-sm surface-card border border-[var(--border-card)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setKind(f.value)}
                aria-pressed={kind === f.value}
                className={`shrink-0 min-h-11 px-3.5 rounded-[14px] text-sm font-semibold inline-flex items-center gap-1.5 transition-colors ${kind === f.value ? 'nav-active' : 'chip-glass text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'}`}
              >
                {f.label}
                <span className="font-mono text-[11px] opacity-70">{kindCount[f.value]}</span>
              </button>
            ))}
            <button
              onClick={() => setForMe((v) => !v)}
              aria-pressed={forMe}
              className={`shrink-0 min-h-11 px-3.5 rounded-[14px] text-sm font-semibold inline-flex items-center gap-1.5 transition-colors ${forMe ? 'nav-active' : 'chip-glass text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]'}`}
            >
              <UserRound size={15} /> Para mí
              {forMeCount > 0 && <span className="font-mono text-[11px] opacity-70">{forMeCount}</span>}
            </button>
          </div>
        </div>
        {topTags.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {topTags.map((t) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? null : t)}
                aria-pressed={tag === t}
                className={`shrink-0 font-mono text-xs px-2.5 py-1.5 rounded-[10px] transition-colors ${tag === t ? 'nav-active' : 'surface-card border border-[var(--border-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      {dataLoading ? (
        <p className="text-sm text-[var(--text-secondary)]">Cargando…</p>
      ) : nothing ? (
        <div className="glass-panel glass-iridescent rounded-[24px] p-8 text-center flex flex-col items-center gap-3">
          <span className="tile-3d w-14 h-14 rounded-[18px] flex items-center justify-center" style={{ background: 'linear-gradient(150deg, var(--accent-2), var(--accent))' }}>
            <BookOpen size={26} className="text-white" />
          </span>
          {filtered ? (
            <>
              <p className="text-[var(--text-primary)] font-semibold">Nada coincide con esos filtros.</p>
              <button
                onClick={() => {
                  setQuery('');
                  setKind('todos');
                  setForMe(false);
                  setTag(null);
                }}
                className="min-h-10 px-4 rounded-[12px] text-sm font-semibold chip-glass border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
              >
                Quitar filtros
              </button>
            </>
          ) : (
            <>
              <p className="text-[var(--text-primary)] font-semibold">Todavía no hay recursos.</p>
              <p className="text-sm text-[var(--text-secondary)]">Recomienda el primer video, documento o enlace para el equipo.</p>
            </>
          )}
        </div>
      ) : (
        <>
          {pinned.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-[var(--text-primary)] inline-flex items-center gap-2">
                <Pin size={16} /> Fijados
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">{pinned.map(card)}</div>
            </section>
          )}
          {rest.length > 0 && (
            <section className="flex flex-col gap-3">
              {pinned.length > 0 && <h2 className="text-lg font-semibold text-[var(--text-primary)]">Todos</h2>}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">{rest.map(card)}</div>
            </section>
          )}
        </>
      )}

      <ResourceModal
        isOpen={modalOpen}
        resource={editing}
        people={people}
        projects={projects}
        isJefe={isJefe}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          fetchResources();
        }}
      />
    </div>
  );
}

type CardProps = {
  resource: Resource;
  authorEmail?: string;
  forEmail?: string;
  projectName?: string;
  currentUserId: string;
  isJefe: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onTag: (tag: string) => void;
};

function ResourceCard({ resource: r, authorEmail, forEmail, projectName, currentUserId, isJefe, onOpen, onEdit, onTogglePin, onDelete, onTag }: CardProps) {
  const [confirming, setConfirming] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const Icon = KIND_ICON[r.kind];
  const yt = thumbFailed ? null : youtubeId(r.url);
  const canEdit = isJefe || r.recommended_by === currentUserId;
  const forMe = r.recommended_for === currentUserId;
  const where = r.storage_path ? fileNameOf(r.storage_path) : hostOf(r.url);

  return (
    <article className={`glass-panel glass-iridescent ${r.pinned ? 'thick-iridescent' : ''} rounded-[24px] p-3 flex flex-col gap-3`}>
      <button onClick={onOpen} className="group relative block w-full aspect-video rounded-[18px] overflow-hidden text-left" aria-label={`Abrir ${r.title}`}>
        {yt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`} alt="" loading="lazy" onError={() => setThumbFailed(true)} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <span className="tile-3d absolute inset-0 flex items-center justify-center" style={{ background: KIND_TILE[r.kind] }}>
            <Icon size={38} className="text-white/90" fill={r.kind === 'video' ? 'currentColor' : 'none'} />
          </span>
        )}
        {yt && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/25 transition-colors">
            <span className="w-12 h-12 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center">
              <Play size={20} className="text-white ml-0.5" fill="currentColor" />
            </span>
          </span>
        )}
        <span className="absolute left-2 top-2 flex gap-1.5">
          <span className="font-mono text-[11px] px-2 py-0.5 rounded-[8px] bg-black/55 text-white backdrop-blur-sm">
            {KIND_LABEL[r.kind]}{r.duration_minutes ? ` · ${r.duration_minutes} min` : ''}
          </span>
        </span>
        {forMe && (
          <span className="absolute right-2 top-2 text-[11px] font-semibold px-2 py-0.5 rounded-[8px]" style={{ background: 'var(--prio-alta-bg)', color: 'var(--prio-alta-text)' }}>
            Para ti
          </span>
        )}
      </button>

      <div className="px-1 flex flex-col gap-1.5 min-w-0">
        <h3 className="text-[15px] font-semibold leading-snug text-[var(--text-primary)] line-clamp-2">
          <button onClick={onOpen} className="text-left hover:underline underline-offset-2">{r.title}</button>
        </h3>
        {where && (
          <span className="font-mono text-[11px] text-[var(--text-secondary)] truncate inline-flex items-center gap-1">
            <ExternalLink size={11} className="shrink-0" /> {where}
          </span>
        )}
        {r.description && <p className="text-[13px] text-[var(--text-secondary)] line-clamp-3">{r.description}</p>}
        {(r.tags.length > 0 || projectName) && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {projectName && <span className="chip-glass text-[11px] font-semibold px-2 py-0.5 rounded-[8px] text-[var(--text-primary)]">{projectName}</span>}
            {r.tags.map((t) => (
              <button key={t} onClick={() => onTag(t)} className="font-mono text-[11px] px-2 py-0.5 rounded-[8px] surface-card border border-[var(--border-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="mt-auto px-1 pt-2 border-t border-[var(--border-column)] flex items-center gap-2 min-w-0">
        <Avatar email={authorEmail} highlight={r.recommended_by === currentUserId} size={28} />
        <span className="flex-1 min-w-0 text-xs text-[var(--text-secondary)] leading-tight">
          <span className="block truncate text-[var(--text-primary)] font-semibold">{r.recommended_by === currentUserId ? 'Tú' : shortName(authorEmail)}</span>
          <span className="block truncate">
            {ago(r.created_at)}
            {forEmail && !forMe && ` · para ${shortName(forEmail)}`}
          </span>
        </span>
        {confirming ? (
          <span className="flex items-center gap-1">
            <button onClick={onDelete} className="min-h-9 px-2.5 rounded-[10px] text-xs font-semibold bg-red-500/15 text-red-500 hover:bg-red-500/25">Borrar</button>
            <button onClick={() => setConfirming(false)} className="min-h-9 px-2.5 rounded-[10px] text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]">No</button>
          </span>
        ) : (
          <span className="flex items-center">
            {isJefe && (
              <IconButton label={r.pinned ? 'Desfijar' : 'Fijar'} onClick={onTogglePin}>
                {r.pinned ? <PinOff size={15} /> : <Pin size={15} />}
              </IconButton>
            )}
            {canEdit && (
              <>
                <IconButton label="Editar" onClick={onEdit}><Pencil size={15} /></IconButton>
                <IconButton label="Borrar" onClick={() => setConfirming(true)}><Trash2 size={15} /></IconButton>
              </>
            )}
          </span>
        )}
      </footer>
    </article>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="w-9 h-9 rounded-[10px] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-colors">
      {children}
    </button>
  );
}
