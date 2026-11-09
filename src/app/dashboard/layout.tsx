'use client';

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { SettingsModal } from "@/components/layout/SettingsModal";
import { useAuth } from "@/components/providers/AuthProvider";
import { Hourglass, ShieldX } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, loading, signOut } = useAuth();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const openSettings = () => setIsSettingsOpen(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  // Cierra el menú del teléfono al cambiar de página o con Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  return (
    <div className="min-h-screen p-3 sm:p-4 flex gap-4 items-start">
      <div className="hidden lg:block print:hidden"><Sidebar onOpenSettings={openSettings} /></div>

      {/* Menú del teléfono y tableta: panel que sale de la izquierda. */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 print:hidden" role="dialog" aria-modal="true" aria-label="Menú">
          <button aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          {/* Fondo sólido detrás del vidrio para que no se lea la página de abajo. */}
          <div className="relative h-full w-fit p-2 pr-0 animate-fade-in-up">
            <div className="h-full rounded-[24px] bg-[var(--bg-page)]">
              <Sidebar onOpenSettings={openSettings} inDrawer onNavigate={() => setMenuOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 w-full flex flex-col gap-4">
      <div className="contents print:hidden"><Topbar onOpenSettings={openSettings} onOpenMenu={() => setMenuOpen(true)} /></div>
      <main className="flex-1">
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
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
