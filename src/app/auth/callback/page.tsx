'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Supabase client automatically handles the token in the URL hash.
    // We just need to wait a moment for it to process it and then redirect.
    const handleAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/dashboard');
      } else {
        // En caso de que tarde un milisegundo más en procesar el hash
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (session) {
            router.push('/dashboard');
          }
        });
        return () => subscription.unsubscribe();
      }
    };

    handleAuth();
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg-page)]">
      <div className="text-[var(--text-primary)]">
        <h2 className="text-xl font-bold mb-2">Completando inicio de sesión...</h2>
        <p className="text-[var(--text-secondary)]">Serás redirigido en un momento.</p>
      </div>
    </div>
  );
}
