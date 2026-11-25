'use client';

import { useCallback, useEffect, useState } from 'react';
import { Cake, Heart, Mail, Pencil, Phone, Plus, X, type LucideIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/providers/AuthProvider';
import { Avatar } from '@/components/juntas/Avatar';
import {
  birthdayLabel, daysInMonth, displayName, isBirthdayToday, MAX_SPECIALTIES, MONTHS, ROLE_NAME, SPECIALTY_SUGGESTIONS,
  type Member, type ProfileInfo,
} from '@/lib/profile';

const inputClass =
  'w-full min-h-11 rounded-[12px] px-3 text-sm surface-card border border-[var(--border-card)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]';

const secondaryButton =
  'min-h-11 px-4 rounded-[12px] text-sm font-semibold chip-glass border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]';

/** Perfil de un integrante. Solo su dueño puede editarlo. */
export function ProfileView({ userId }: { userId: string }) {
  const { user } = useAuth();
  const [member, setMember] = useState<Member | null>(null);
  const [info, setInfo] = useState<ProfileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const [person, details] = await Promise.all([
      supabase.from('profiles').select('id, email, role').eq('id', userId).maybeSingle(),
      supabase.from('profile_info').select('*').eq('user_id', userId).maybeSingle(),
    ]);
    setError(person.error || details.error ? 'No se pudo cargar el perfil.' : null);
    setMember(person.data as Member | null);
    setInfo(details.data as ProfileInfo | null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      await load();
    })();
  }, [user, load]);

  if (loading) return <div className="p-8 text-[var(--text-secondary)]">Cargando…</div>;
  if (!member) return <p role="alert" className="p-8 text-[var(--text-secondary)]">{error ?? 'No se encontró este perfil.'}</p>;

  const own = user?.id === member.id;
  const name = displayName(member.email, info);

  if (editing && own) {
    return (
      <ProfileForm
        member={member}
        info={info}
        onCancel={() => setEditing(false)}
        onSaved={async () => {
          await load();
          setEditing(false);
        }}
      />
    );
  }

  const birthday = birthdayLabel(info);
  const empty = !info?.about && !info?.specialties.length && !birthday && !info?.hobbies && !info?.phone;

  return (
    <div className="max-w-3xl flex flex-col gap-4">
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      <section className="glass-panel glass-iridescent rounded-[28px] p-6 flex flex-wrap items-center gap-5">
        <Avatar email={member.email} highlight={own} size={84} />
        <div className="flex-[1_1_220px] min-w-0 flex flex-col gap-1">
          <h1 className="text-2xl sm:text-[1.75rem] font-bold tracking-tight text-[var(--text-primary)] break-words">{name}</h1>
          <p className="text-sm text-[var(--text-secondary)]">{ROLE_NAME[member.role] ?? member.role}</p>
          {isBirthdayToday(info) && <p className="text-sm font-semibold text-[var(--text-primary)]">🎉 ¡Hoy es {own ? 'tu' : 'su'} cumpleaños!</p>}
        </div>
        {own && (
          <button onClick={() => setEditing(true)} className="nav-active min-h-11 px-5 rounded-[14px] font-semibold text-sm inline-flex items-center gap-2">
            <Pencil size={15} /> Editar mi perfil
          </button>
        )}
      </section>

      {empty && (
        <p className="glass-panel rounded-[22px] p-6 text-sm text-[var(--text-secondary)]">
          {own ? 'Todavía no te presentas. Usa “Editar mi perfil” para que el equipo te conozca.' : `${name} todavía no ha completado su perfil.`}
        </p>
      )}

      {info?.about && (
        <section className="glass-panel rounded-[22px] p-6 flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Presentación</h2>
          <p className="text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap break-words">{info.about}</p>
        </section>
      )}

      {!!info?.specialties.length && (
        <section className="glass-panel rounded-[22px] p-6 flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Especialidades</h2>
          <ul className="flex flex-wrap gap-2">
            {info.specialties.map((s) => (
              <li key={s} className="chip-glass border border-[var(--border-card)] rounded-[10px] px-3 py-1.5 text-sm text-[var(--text-primary)] break-all">{s}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="glass-panel rounded-[22px] p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Detail icon={Mail} label="Correo" value={member.email} />
        {birthday && <Detail icon={Cake} label="Cumpleaños" value={birthday} />}
        {info?.phone && <Detail icon={Phone} label="Teléfono" value={info.phone} />}
        {info?.hobbies && <Detail icon={Heart} label="Gustos y pasatiempos" value={info.hobbies} />}
      </section>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <span className="chip-glass w-10 h-10 shrink-0 rounded-[12px] flex items-center justify-center text-[var(--text-secondary)]">
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex flex-col">
        <span className="text-xs text-[var(--text-secondary)]">{label}</span>
        <span className="text-sm font-semibold text-[var(--text-primary)] break-words">{value}</span>
      </span>
    </div>
  );
}

function ProfileForm({ member, info, onCancel, onSaved }: { member: Member; info: ProfileInfo | null; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [fullName, setFullName] = useState(info?.full_name ?? '');
  const [about, setAbout] = useState(info?.about ?? '');
  const [specialties, setSpecialties] = useState<string[]>(info?.specialties ?? []);
  const [draft, setDraft] = useState('');
  const [day, setDay] = useState(info?.birth_day ? String(info.birth_day) : '');
  const [month, setMonth] = useState(info?.birth_month ? String(info.birth_month) : '');
  const [hobbies, setHobbies] = useState(info?.hobbies ?? '');
  const [phone, setPhone] = useState(info?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const has = (list: string[], value: string) => list.some((x) => x.toLowerCase() === value.toLowerCase());
  const withSpecialty = (list: string[], value: string) => {
    const clean = value.trim().slice(0, 40);
    return !clean || has(list, clean) || list.length >= MAX_SPECIALTIES ? list : [...list, clean];
  };
  const addSpecialty = (value: string) => setSpecialties((prev) => withSpecialty(prev, value));
  const full = specialties.length >= MAX_SPECIALTIES;
  const maxDay = month ? daysInMonth(Number(month)) : 31;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) return setError('Escribe tu nombre.');
    if (!!day !== !!month) return setError('Para el cumpleaños elige día y mes (o deja ambos vacíos).');
    setSaving(true);
    const { error: err } = await supabase.from('profile_info').upsert({
      user_id: member.id,
      full_name: fullName.trim(),
      about: about.trim() || null,
      // Incluye lo que quedó escrito en el campo sin presionar "Agregar".
      specialties: withSpecialty(specialties, draft),
      birth_day: day ? Number(day) : null,
      birth_month: month ? Number(month) : null,
      hobbies: hobbies.trim() || null,
      phone: phone.trim() || null,
      updated_at: new Date().toISOString(),
    });
    if (err) {
      setSaving(false);
      return setError('No se pudieron guardar los cambios. Intenta de nuevo.');
    }
    await onSaved();
  };

  return (
    <form onSubmit={save} className="max-w-3xl glass-panel glass-iridescent rounded-[28px] p-6 flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Editar mi perfil</h1>
        <p className="text-sm text-[var(--text-secondary)]">Todo lo que escribas aquí lo puede ver el resto del equipo.</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-[var(--text-primary)]">Nombre</span>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} autoComplete="name" className={inputClass} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-[var(--text-primary)]">Preséntate <span className="font-normal text-[var(--text-secondary)]">(opcional)</span></span>
        <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={5} maxLength={600} placeholder="Quién eres, en qué estás trabajando, en qué te pueden pedir ayuda…" className={`${inputClass} py-2.5 resize-y`} />
        <span className="self-end font-mono text-[11px] text-[var(--text-secondary)]">{about.length}/600</span>
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">Especialidades</legend>
        {specialties.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {specialties.map((s) => (
              <li key={s} className="chip-glass border border-[var(--accent)] rounded-[10px] pl-3 pr-1.5 py-1 text-sm text-[var(--text-primary)] inline-flex items-center gap-1.5">
                <span className="break-all">{s}</span>
                <button type="button" aria-label={`Quitar ${s}`} onClick={() => setSpecialties((prev) => prev.filter((x) => x !== s))} className="p-1 rounded-[8px] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]">
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              addSpecialty(draft);
              setDraft('');
            }}
            maxLength={40}
            disabled={full}
            aria-label="Nueva especialidad"
            placeholder={full ? `Máximo ${MAX_SPECIALTIES}` : 'Escribe una y presiona Enter'}
            className={inputClass}
          />
          <button
            type="button"
            disabled={full || !draft.trim()}
            onClick={() => {
              addSpecialty(draft);
              setDraft('');
            }}
            className={`${secondaryButton} shrink-0 inline-flex items-center gap-1.5 disabled:opacity-50`}
          >
            <Plus size={15} /> Agregar
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SPECIALTY_SUGGESTIONS.filter((s) => !has(specialties, s)).map((s) => (
            <button key={s} type="button" disabled={full} onClick={() => addSpecialty(s)} className="font-mono text-xs px-2.5 py-1.5 rounded-[10px] surface-card border border-[var(--border-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50">
              + {s}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold text-[var(--text-primary)] mb-1.5">Cumpleaños <span className="font-normal text-[var(--text-secondary)]">(opcional, sin año)</span></legend>
        <div className="grid grid-cols-[100px_1fr] gap-2 max-w-sm">
          <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Día" className={inputClass}>
            <option value="">Día</option>
            {Array.from({ length: maxDay }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              // Si el día ya no existe en ese mes, se pide elegirlo otra vez.
              if (e.target.value && Number(day) > daysInMonth(Number(e.target.value))) setDay('');
            }}
            aria-label="Mes"
            className={inputClass}
          >
            <option value="">Mes</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Gustos y pasatiempos <span className="font-normal text-[var(--text-secondary)]">(opcional)</span></span>
          <input value={hobbies} onChange={(e) => setHobbies(e.target.value)} maxLength={200} placeholder="Música, videojuegos, café…" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-[var(--text-primary)]">Teléfono <span className="font-normal text-[var(--text-secondary)]">(opcional)</span></span>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} autoComplete="tel" className={inputClass} />
        </label>
      </div>

      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className={secondaryButton}>Cancelar</button>
        <button type="submit" disabled={saving} className="nav-active min-h-11 px-5 rounded-[12px] text-sm font-semibold disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
