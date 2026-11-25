// Tipos y utilidades del apartado de perfiles (tabla `profile_info`).

import { shortName } from '@/lib/meetings';

export type ProfileInfo = {
  user_id: string;
  full_name: string | null;
  specialties: string[];
  about: string | null;
  birth_day: number | null;
  birth_month: number | null;
  hobbies: string | null;
  phone: string | null;
};

export type Member = { id: string; email: string; role: string };

export const ROLE_NAME: Record<string, string> = {
  jefe: 'Jefatura',
  developer: 'Desarrollo',
  qa: 'QA',
  pasante: 'Pasante',
  empleado: 'Empleado',
  usuario: 'Usuario',
};

export const SPECIALTY_SUGGESTIONS = [
  'Frontend', 'Backend', 'Full stack', 'Bases de datos', 'DevOps', 'Móvil', 'QA', 'Diseño UI/UX', 'Redes', 'Soporte',
];

export const MAX_SPECIALTIES = 12;

export const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Febrero admite el 29: no se guarda el año. */
export function daysInMonth(month: number) {
  return new Date(2000, month, 0).getDate();
}

export function birthdayLabel(info?: Pick<ProfileInfo, 'birth_day' | 'birth_month'> | null) {
  if (!info?.birth_day || !info.birth_month) return null;
  return `${info.birth_day} de ${MONTHS[info.birth_month - 1]}`;
}

export function isBirthdayToday(info?: Pick<ProfileInfo, 'birth_day' | 'birth_month'> | null, today = new Date()) {
  return info?.birth_day === today.getDate() && info?.birth_month === today.getMonth() + 1;
}

/** Nombre para mostrar: el que la persona escribió o, si no, el de su correo. */
export function displayName(email: string, info?: Pick<ProfileInfo, 'full_name'> | null) {
  const name = info?.full_name?.trim();
  if (name) return name;
  const short = shortName(email);
  return short.charAt(0).toUpperCase() + short.slice(1);
}
