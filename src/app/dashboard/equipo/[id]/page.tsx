'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { ProfileView } from '@/components/equipo/ProfileView';

export default function PerfilDeIntegrantePage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  if (loading || !user) return <div className="p-8 text-[var(--text-secondary)]">Cargando…</div>;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/dashboard/equipo" className="self-start inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
        <ArrowLeft size={16} /> Equipo
      </Link>
      <ProfileView key={id} userId={id} />
    </div>
  );
}
