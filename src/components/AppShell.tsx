'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';
import { Menu } from 'lucide-react'; 

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  // STATE UNTUK SIDEBAR RESPONSIVE
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); 

  const isPublicPage = pathname === '/login'; 
  const isSetupPage = pathname === '/setup';

  useEffect(() => {
      if (!isPublicPage) {
          const isActivated = localStorage.getItem('METALURGI_ACTIVATED') === 'true';
          const isDemo = process.env.NEXT_PUBLIC_APP_MODE === 'DEMO';

          if (!isDemo && !isActivated && !isSetupPage) {
              router.push('/setup');
          }
      }
      setIsChecking(false);
      
      // Auto-close sidebar di mobile saat load pertama
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
          setIsSidebarOpen(false);
      }
  }, [pathname, isPublicPage, isSetupPage, router]);

  // Auto-close sidebar di HP setiap kali user ganti halaman
  useEffect(() => {
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
          setIsSidebarOpen(false);
      }
  }, [pathname]);

  if (isPublicPage || isSetupPage) {
    return <main className="w-full min-h-screen bg-slate-900">{children}</main>;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 relative overflow-hidden">
      
      {/* [REVISI]: Tombol Toggle Menu (Desktop & Mobile) */}
      {/* Muncul di kiri BAWAH agar tidak menabrak Header / Judul Halaman */}
      {!isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="fixed bottom-8 left-8 z-[60] p-3.5 bg-slate-900 text-white rounded-full shadow-2xl border-4 border-slate-50/50 hover:bg-slate-800 hover:scale-110 transition-all group animate-in slide-in-from-left-4 fade-in"
            title="Buka Menu Sidebar"
          >
              <Menu size={24} className="group-hover:rotate-90 transition-transform duration-300"/>
          </button>
      )}

      {/* OVERLAY GELAP UNTUK MOBILE */}
      {isSidebarOpen && (
          <div 
              className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm transition-opacity"
              onClick={() => setIsSidebarOpen(false)}
          />
      )}

      {/* SIDEBAR WRAPPER */}
      <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out shadow-2xl md:shadow-none ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <Sidebar 
              isOpen={isSidebarOpen} 
              setIsOpen={setIsSidebarOpen} 
          />
      </div>

      {/* MAIN CONTENT AREA */}
      <main className={`flex-1 transition-all duration-300 overflow-x-hidden w-full ${isSidebarOpen ? 'md:ml-64' : 'ml-0'}`}>
        {children}
      </main>
    </div>
  );
}