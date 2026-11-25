'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { ProfileView } from '@/components/equipo/ProfileView';

export default function MiPerfilPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.push('/');
  }, [user, loading, router]);

  if (loading || !user) return <div className="p-8 text-[var(--text-secondary)]">Cargando…</div>;

  return <ProfileView key={user.id} userId={user.id} />;
}
