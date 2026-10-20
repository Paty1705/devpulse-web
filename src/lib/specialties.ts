// Especialidades que se pueden elegir (el valor es lo que guarda la base de datos)
export const SPECIALTIES = ['frontend', 'backend', 'fullstack', 'bases_de_datos', 'devops', 'movil'] as const;
export type Specialty = (typeof SPECIALTIES)[number];

export const SPECIALTY_LABELS: Record<Specialty, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  fullstack: 'Full Stack',
  bases_de_datos: 'Bases de datos',
  devops: 'DevOps',
  movil: 'Móvil',
};

export function specialtyLabel(specialty?: string | null): string | null {
  return specialty && specialty in SPECIALTY_LABELS ? SPECIALTY_LABELS[specialty as Specialty] : null;
}

// "developer · Frontend" (o solo el rol si no tiene especialidad)
export function roleWithSpecialty(role: string, specialty?: string | null): string {
  const label = specialtyLabel(specialty);
  return label ? `${role} · ${label}` : role;
}
