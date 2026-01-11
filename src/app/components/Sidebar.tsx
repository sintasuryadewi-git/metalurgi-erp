'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, ArrowRightLeft, Package, BookOpen, Tags, 
  LineChart, PieChart, Settings, LogOut, Calculator, Store, 
  Target, Users, Menu, X // Import Icon Menu & X
} from 'lucide-react';

const MENU_ITEMS = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'POS System', path: '/pos', icon: Store },
  { name: 'Transactions', path: '/transactions', icon: ArrowRightLeft },
  { name: 'Inventory', path: '/inventory', icon: Package },
  { name: 'General Ledger', path: '/general-ledger', icon: BookOpen },
  { name: 'Pricing Strategy', path: '/pricing', icon: Tags },
  { name: 'Costing Intelligence', path: '/costing', icon: Calculator },
  { name: 'Payroll Intelligence', path: '/payroll', icon: Users },
  { name: 'Cashflow Monitor', path: '/cashflow', icon: LineChart },
  { name: 'Financial Reports', path: '/report', icon: PieChart },
  { name: 'Business Planning', path: '/planning', icon: Target },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <>
      {/* --- MOBILE TOGGLE BUTTON (Hanya muncul di Mobile) --- */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <button 
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          className="p-2 bg-slate-900 text-white rounded-lg shadow-lg hover:bg-slate-800 transition-colors"
        >
          {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* --- OVERLAY (Gelap-gelap di background saat menu terbuka di HP) --- */}
      {isMobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsMobileOpen(false)}
        ></div>
      )}

      {/* --- SIDEBAR COMPONENT --- */}
      <aside 
        className={`
          fixed top-0 left-0 z-50 h-screen w-64 bg-slate-900 text-white flex flex-col transition-transform duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'} 
          md:translate-x-0 
        `}
      >
        {/* LOGO AREA */}
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-xl text-white shadow-lg shadow-blue-900/50">
              M
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-wide text-slate-100">METALURGI</h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">CFO Platform V3.5</p>
            </div>
          </div>
          {/* Tombol Close di dalam Sidebar (Mobile Only) */}
          <button onClick={() => setIsMobileOpen(false)} className="md:hidden text-slate-400 hover:text-white">
            <X size={20}/>
          </button>
        </div>

        {/* NAVIGATION MENU */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
          <p className="text-xs font-bold text-slate-500 uppercase px-3 mb-2 mt-2 tracking-wider">Main Modules</p>
          
          {MENU_ITEMS.map((item) => {
            const isActive = pathname === item.path || (item.path !== '/' && pathname?.startsWith(item.path));
            return (
              <Link 
                key={item.path} 
                href={item.path}
                onClick={() => setIsMobileOpen(false)} // Auto close saat menu diklik di HP
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group relative ${
                  isActive 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' 
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white/20 rounded-r-full"></div>}
                <item.icon size={18} className={isActive ? 'text-white' : 'text-slate-500 group-hover:text-white transition-colors'} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* FOOTER / USER PROFILE */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3 mb-4 px-2">
             <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-xs font-bold text-slate-300">AD</div>
             <div className="overflow-hidden">
                <p className="text-sm font-bold text-white truncate">Admin User</p>
                <p className="text-xs text-slate-500 truncate">admin@metalurgi.id</p>
             </div>
          </div>
          <button className="flex items-center gap-3 w-full px-3 py-2 rounded-xl text-slate-400 hover:bg-rose-900/20 hover:text-rose-500 transition-all text-sm font-medium border border-transparent hover:border-rose-900/30">
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}