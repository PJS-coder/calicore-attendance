// apps/web/src/components/AuthGuard.tsx
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

/**
 * Wraps protected pages. Ensures authentication and guards admin vs employee routes:
 * - Unauthenticated users -> /login
 * - Non-admin users attempting /admin -> /dashboard
 * - Admin users attempting employee routes (/dashboard, /timesheet, /salary) -> /admin
 */
export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }

    const isAdminRoute = pathname.startsWith('/admin');

    if (user?.role !== 'ADMIN' && isAdminRoute) {
      router.replace('/dashboard');
    } else if (user?.role === 'ADMIN' && !isAdminRoute) {
      router.replace('/admin');
    }
  }, [isAuthenticated, user, pathname, router]);

  if (!isAuthenticated) return null;
  const isAdminRoute = pathname.startsWith('/admin');
  if (user?.role !== 'ADMIN' && isAdminRoute) return null;
  if (user?.role === 'ADMIN' && !isAdminRoute) return null;

  return <>{children}</>;
}
