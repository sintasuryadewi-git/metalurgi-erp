'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, User, Loader2, Shield, Users } from 'lucide-react';
import { seedDemoData } from '@/lib/demoData'; 

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  // State untuk mendeteksi Mode Demo
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
      // Cek Environment Variable (diset di Vercel / .env.local)
      if (process.env.NEXT_PUBLIC_APP_MODE === 'DEMO') {
          setIsDemo(true);
      }
  }, []);

  // --- LOGIC 1: COMMERCIAL LOGIN (Cek ke Google Sheet) ---
  // ... import dan kode lainnya tetap sama
  const handleCommercialLogin = async () => {
    if(!email || !password) return alert("Mohon isi email dan password");
    
    setLoading(true);
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await res.json();
        
        if(!res.ok) throw new Error(data.error || "Login Gagal");

        // --- [NEW] BERSIH-BERSIH DATA LAMA ---
        // Kita hapus semua data transaksi lokal supaya bersih 0
        localStorage.removeItem('METALURGI_GL_JOURNALS');
        localStorage.removeItem('METALURGI_MANUAL_TRX');
        localStorage.removeItem('METALURGI_DEMO_EMPLOYEES');
        localStorage.removeItem('METALURGI_IS_DEMO_DATA'); // Hapus flag demo

        // --- SIMPAN SESI BARU ---
        localStorage.setItem('METALURGI_USER', JSON.stringify(data.user));
        
        // Cek status aktivasi dari respon server (nanti kita update API loginnya)
        // Jika belum aktif, set false.
        const isLicenseActive = data.isActivated || false; 
        localStorage.setItem('METALURGI_ACTIVATED', isLicenseActive.toString());
        
        // Redirect
        if (!isLicenseActive) {
            router.push('/setup'); // Paksa ke aktivasi jika belum punya lisensi
        } else {
            router.push('/');
        }

    } catch (err: any) {
        alert(err.message);
    } finally {
        setLoading(false);
    }
 };

  // --- LOGIC 2: DEMO LOGIN (Tanpa Password) ---
  const handleDemoLogin = (role: string) => {
      setLoading(true);
      seedDemoData(); // Masukkan data dummy
      
      let user = {};
      // Set user dummy sesuai role
      if (role === 'OWNER') user = { name: 'Demo CEO', role: 'OWNER', email: 'ceo@demo.com' };
      else if (role === 'INVESTOR') user = { name: 'Demo Investor', role: 'INVESTOR', email: 'vc@demo.com' };
      
      localStorage.setItem('METALURGI_USER', JSON.stringify(user));
      localStorage.setItem('METALURGI_ACTIVATED', 'true'); 
      
      // Redirect sesuai role
      setTimeout(() => {
          if (role === 'INVESTOR') router.push('/investor');
          else router.push('/');
      }, 500);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md relative overflow-hidden">
        
        {/* Banner Pita Demo (Hanya muncul jika mode DEMO) */}
        {isDemo && (
            <div className="absolute top-0 right-0 bg-amber-400 text-amber-900 text-[10px] font-bold px-8 py-1 rotate-45 translate-x-8 translate-y-4 shadow-sm">
                DEMO MODE
            </div>
        )}

        <div className="text-center mb-8">
            <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-blue-500/50 shadow-lg">M</div>
            <h1 className="text-2xl font-bold text-slate-800">{isDemo ? 'Live Demo Access' : 'Welcome Back'}</h1>
            <p className="text-slate-500 text-sm">{isDemo ? 'Pilih peran untuk simulasi fitur.' : 'Sign in to Command Center'}</p>
        </div>

        {/* TAMPILAN 1: MODE DEMO (Tombol Langsung) */}
        {isDemo ? (
            <div className="space-y-3">
                <button onClick={() => handleDemoLogin('OWNER')} className="w-full flex items-center gap-4 p-4 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 transition-all group text-left">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors"><Shield size={20}/></div>
                    <div><h4 className="font-bold text-slate-800 text-sm">Login sebagai CEO/Owner</h4><p className="text-xs text-slate-500">Akses Penuh: Dashboard, Costing, Settings.</p></div>
                </button>
                <button onClick={() => handleDemoLogin('INVESTOR')} className="w-full flex items-center gap-4 p-4 border border-slate-200 rounded-xl hover:bg-emerald-50 hover:border-emerald-300 transition-all group text-left">
                    <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors"><Users size={20}/></div>
                    <div><h4 className="font-bold text-slate-800 text-sm">Login sebagai Investor</h4><p className="text-xs text-slate-500">View Only: Burn Rate, Runway, Reports.</p></div>
                </button>
                {loading && <div className="text-center text-xs text-slate-400 mt-2"><Loader2 className="animate-spin inline mr-1" size={12}/> Preparing Demo Environment...</div>}
            </div>
        ) : (
            /* TAMPILAN 2: MODE COMMERCIAL (Form Email Password) */
            <div className="space-y-4 animate-in fade-in">
                <div className="relative">
                    <User className="absolute left-3 top-3 text-slate-400" size={20}/>
                    <input 
                        type="email" 
                        placeholder="Email Address" 
                        className="w-full pl-10 p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm" 
                        value={email} 
                        onChange={e=>setEmail(e.target.value)}
                    />
                </div>
                <div className="relative">
                    <Lock className="absolute left-3 top-3 text-slate-400" size={20}/>
                    <input 
                        type="password" 
                        placeholder="Password" 
                        className="w-full pl-10 p-3 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm" 
                        value={password} 
                        onChange={e=>setPassword(e.target.value)}
                    />
                </div>
                <button 
                    onClick={handleCommercialLogin} 
                    disabled={loading} 
                    className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex justify-center gap-2"
                >
                    {loading ? <Loader2 className="animate-spin"/> : "Sign In"}
                </button>
            </div>
        )}
      </div>
    </div>
  );
}