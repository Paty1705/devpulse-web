'use client';

import { Navbar } from "@/components/layout/Navbar";
import { useAuth, RequestableRole } from "@/components/providers/AuthProvider";
import { Hourglass, ShieldX } from "lucide-react";
import { useState } from "react";

const ROLE_LABELS: Record<RequestableRole, string> = { developer: 'Developer', qa: 'QA', pasante: 'Pasante' };

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, loading, signOut, setRequestedRole } = useAuth();
  const [roleError, setRoleError] = useState<string | null>(null);

  const chooseRole = async (role: RequestableRole) => {
    setRoleError(null);
    const error = await setRequestedRole(role);
    if (error) setRoleError(error);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 p-6">
        {!loading && profile?.status === 'pending' ? (
          <div className="max-w-lg mx-auto mt-16 text-center bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-8 shadow-[var(--shadow-subtle)]">
            <Hourglass size={40} className="mx-auto mb-4 text-[var(--btn-primary-bg)]" />
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Cuenta pendiente de aprobación</h2>
            <p className="text-[var(--text-secondary)] mb-6">
              Tu cuenta ({profile.email}) fue creada, pero todavía no tiene acceso.
              Un jefe tiene que aprobarla antes de que puedas ver proyectos o tareas.
            </p>
            {profile.requested_role ? (
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                Rol solicitado: <span className="font-bold text-[var(--text-primary)]">{ROLE_LABELS[profile.requested_role]}</span>
              </p>
            ) : (
              <div className="mb-6">
                <p className="text-sm text-[var(--text-secondary)] mb-3">¿Qué rol solicitas?</p>
                <div className="flex justify-center gap-2">
                  {(Object.keys(ROLE_LABELS) as RequestableRole[]).map(r => (
                    <button
                      key={r}
                      onClick={() => chooseRole(r)}
                      className="px-3 py-1.5 text-sm font-bold bg-[var(--bg-page)] border border-[var(--border-card)] text-[var(--text-primary)] hover:border-[var(--btn-primary-bg)] rounded-[6px] transition-colors"
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
                {roleError && <p className="text-sm text-[#EF4444] mt-2">{roleError}</p>}
              </div>
            )}
            <button
              onClick={signOut}
              className="px-4 py-2 font-bold text-sm bg-[var(--bg-page)] border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] rounded-[6px] transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        ) : !loading && profile?.status === 'rejected' ? (
          <div className="max-w-lg mx-auto mt-16 text-center bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[8px] p-8 shadow-[var(--shadow-subtle)]">
            <ShieldX size={40} className="mx-auto mb-4 text-[#EF4444]" />
            <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Acceso rechazado</h2>
            <p className="text-[var(--text-secondary)] mb-6">
              Tu cuenta ({profile.email}) no tiene acceso a esta aplicación.
            </p>
            <button
              onClick={signOut}
              className="px-4 py-2 font-bold text-sm bg-[var(--bg-page)] border border-[var(--border-card)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] rounded-[6px] transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
