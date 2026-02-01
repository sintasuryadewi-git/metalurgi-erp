'use client';

import { useFetch } from '@/hooks/useFetch';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Database, Link as LinkIcon, CheckCircle, ArrowRight } from 'lucide-react';

export default function SetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [sheetId, setSheetId] = useState('');
  const [userEmail, setUserEmail] = useState('');

  // Ambil email user yang sedang login (dari LocalStorage yang disimpan saat Login tadi)
  useEffect(() => {
      const storedUser = localStorage.getItem('METALURGI_USER');
      if (storedUser) {
          const user = JSON.parse(storedUser);
          setUserEmail(user.email);
      } else {
          // Kalau tidak ada sesi, lempar balik ke login
          router.push('/login');
      }
  }, []);

  const handleConnect = async () => {
      if (!sheetId) return alert("Mohon isi Sheet ID");
      if (!userEmail) return alert("Sesi habis, silakan login ulang");

      setLoading(true);
      try {
          const res = await fetch('/api/setup-db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: userEmail,
                sheetId: sheetId
            })
          });

          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Gagal koneksi');

          // Update LocalStorage agar sesi sekarang punya sheetId
          const storedUser = JSON.parse(localStorage.getItem('METALURGI_USER') || '{}');
          storedUser.sheetId = sheetId; // Inject Sheet ID baru
          localStorage.setItem('METALURGI_USER', JSON.stringify(storedUser));
          
          // Anggap Aktivasi selesai
          localStorage.setItem('METALURGI_ACTIVATED', 'true');

          // Redirect ke Dashboard
          router.push('/');

      } catch (err: any) {
          alert('Error: ' + err.message);
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-sans text-slate-800">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden p-8">
        
        <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Database size={32}/>
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Hubungkan Database</h2>
            <p className="text-slate-500 text-sm mt-2">
                Halo <b>{userEmail}</b>, akun Anda belum terhubung ke database. Silakan masukkan Google Sheet ID Anda.
            </p>
        </div>

        <div className="space-y-4">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
                <p className="font-bold text-slate-800">Cara mendapatkan Sheet ID:</p>
                <ol className="list-decimal pl-4 space-y-1">
                    <li>Buka Google Sheet Template Anda.</li>
                    <li>Pastikan Anda sudah <b>Share Editor</b> ke bot kami.</li>
                    <li>Copy kode acak di URL browser.</li>
                    <li>Contoh: docs.google.com/spreadsheets/d/<b>1xY...z99</b>/edit</li>
                </ol>
            </div>

            <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Google Sheet ID</label>
                <div className="relative">
                    <LinkIcon className="absolute left-3 top-3 text-slate-400" size={18}/>
                    <input 
                        type="text" 
                        className="w-full pl-10 p-3 border rounded-xl font-mono text-sm" 
                        value={sheetId} 
                        onChange={e=>setSheetId(e.target.value)}
                        placeholder="Paste Sheet ID di sini..."
                    />
                </div>
            </div>

            <button 
                onClick={handleConnect} 
                disabled={loading || !sheetId} 
                className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-all flex justify-center gap-2"
            >
                {loading ? "Connecting..." : "Simpan & Lanjutkan"} <ArrowRight size={18}/>
            </button>
        </div>

      </div>
    </div>
  );
}