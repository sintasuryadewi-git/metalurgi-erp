'use client';

import { usePathname, useRouter } from 'next/navigation'; // Tambah useRouter
import { useEffect, useState } from 'react'; // Tambah Hooks
import Sidebar from './Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  const isPublicPage = pathname === '/login'; // Setup skrg jadi semi-private
  const isSetupPage = pathname === '/setup';

  useEffect(() => {
      // Cek status aktivasi hanya jika bukan di halaman login
      if (!isPublicPage) {
          const isActivated = localStorage.getItem('METALURGI_ACTIVATED') === 'true';
          const isDemo = process.env.NEXT_PUBLIC_APP_MODE === 'DEMO';

          // LOGIKA FREEZE:
          // Kalau BUKAN Demo DAN BELUM Aktivasi DAN BUKAN lagi di halaman Setup...
          if (!isDemo && !isActivated && !isSetupPage) {
              // Tendang ke halaman setup
              router.push('/setup');
          }
      }
      setIsChecking(false);
  }, [pathname, isPublicPage, isSetupPage, router]);

  // Render Full Screen untuk Login & Setup
  if (isPublicPage || isSetupPage) {
    return <main className="w-full min-h-screen bg-slate-900">{children}</main>;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 md:ml-64 transition-all duration-300 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}