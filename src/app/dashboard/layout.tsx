'use client';

import { Navbar } from "@/components/layout/Navbar";
import { useAuth } from "@/components/providers/AuthProvider";
import { Hourglass, ShieldX } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, loading, signOut } = useAuth();

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
