'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, FileText, CheckCircle2, Search, Filter, 
  ChevronRight, ArrowRightLeft, Building2, Receipt, 
  Wallet, Loader2, Info
} from 'lucide-react';
import * as XLSX from 'xlsx'; 

export default function BankRegisterPage() {
  const [statements, setStatements] = useState<any[]>([]);
  const [coaList, setCoaList] = useState<any[]>([]);
  
  // State untuk Data Master Transaksi (Pintar)
  const [inflowTx, setInflowTx] = useState<any[]>([]);  // Untuk Uang Masuk (POS, Sales)
  const [outflowTx, setOutflowTx] = useState<any[]>([]); // Untuk Uang Keluar (Expense, Purchase)

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  
  const [selectedTx, setSelectedTx] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'match' | 'manual'>('match'); // Default langsung ke match
  const [manualAccount, setManualAccount] = useState('');
  const [selectedMatch, setSelectedMatch] = useState<any>(null); // State untuk transaksi yang dipilih di tab Match
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- HELPER 1: KONVERSI TANGGAL EXCEL ---
  const formatTanggal = (val: any) => {
    if (!val) return '-';
    if (typeof val === 'string' && val.includes('-')) return val; // Format yyyy-mm-dd dari CSV
    if (!isNaN(Number(val))) {
        // Rumus sakti konversi Serial Number Excel ke Tanggal JS
        const date = new Date(Math.round((Number(val) - 25569) * 86400 * 1000));
        return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    return String(val);
  };

  const fmtMoney = (n: number) => "Rp " + Math.abs(n).toLocaleString('id-ID');

  // --- HELPER 2: PARSING DATA TRANSAKSI GOOGLE SHEETS ---
  const parseSheetData = (rows: any[], sourceName: string) => {
      if (!rows || rows.length < 2) return [];
      const headers = rows[0].map((h: string) => h?.trim() || '');
      return rows.slice(1).map((row: any) => {
          let obj: any = { _source: sourceName }; // Tambahkan identitas sumber sheet
          headers.forEach((h: string, i: number) => { if(h) obj[h] = row[i]; });
          return obj;
      });
  };

  // --- 1. FETCH DATA (Terpusat) ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const email = localStorage.getItem('METALURGI_USER_EMAIL') || '';
      let sheetId = localStorage.getItem('METALURGI_SHEET_ID') || localStorage.getItem('sheet_id') || ''; 
      
      const reqOptions = { headers: { 'x-sheet-id': sheetId, 'x-user-email': email } };

      const resBs = await fetch(`/api/bank-statements?email=${email}&sheetId=${sheetId}`, reqOptions);
      if (!resBs.ok) throw new Error(`API Bank Statements menolak (Status ${resBs.status})`);
      const jsonBs = await resBs.json();
      
      const resGl = await fetch(`/api/general-ledger?email=${email}&sheetId=${sheetId}`, reqOptions);
      const jsonGl = await resGl.ok ? await resGl.json() : { success: false };

      if (jsonBs.success && jsonBs.data) {
        // 1. Parsing Bank Statements
        const rawBs = jsonBs.data.bankStatements || [];
        if (rawBs.length > 1) {
          const parsedBs = rawBs.slice(1).map((r: any) => ({
            id: r[0] || '', date: formatTanggal(r[1]), label: r[2] || '', partner: r[3] || '',
            amount: parseFloat(r[4]) || 0, balance: parseFloat(r[5]) || 0,
            status: r[6] || '', reconciledBy: r[7] || '', glRef: r[8] || ''
          }));
          setStatements(parsedBs.filter((s:any) => s.status === 'Unreconciled'));
        }

        // 2. Parsing Transaksi Cerdas (Pisahkan Inflow & Outflow)
        const posArr = parseSheetData(jsonBs.data.trxPos, 'POS');
        const salesArr = parseSheetData(jsonBs.data.trxSales, 'Sales Invoice');
        const expenseArr = parseSheetData(jsonBs.data.trxExpense, 'Expense');
        const purchaseArr = parseSheetData(jsonBs.data.trxPurchase, 'Purchase Invoice');

        // Gabungkan berdasarkan sifat arus kasnya
        setInflowTx([...posArr, ...salesArr]);
        setOutflowTx([...expenseArr, ...purchaseArr]);
      }

      if (jsonGl.success && jsonGl.data?.coa) {
          const coaObjs = parseSheetData(jsonGl.data.coa, 'COA');
          setCoaList(coaObjs);
      }
    } catch (err: any) {
      alert("Gagal memuat data dari database: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // --- 2. UPLOAD ENGINE ---
  const handleFileUpload = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    let email = localStorage.getItem('METALURGI_USER_EMAIL') || '';
    let sheetId = localStorage.getItem('METALURGI_SHEET_ID') || localStorage.getItem('sheetId') || localStorage.getItem('sheet_id');

    if (!sheetId || sheetId.length < 30) {
        const manualId = window.prompt("Silakan PASTE Sheet ID asli Anda di kotak ini untuk melanjutkan:");
        if (!manualId || manualId.trim() === '') return alert("Upload dibatalkan karena Sheet ID kosong.");
        sheetId = manualId.trim();
        localStorage.setItem('METALURGI_SHEET_ID', sheetId);
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt: any) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws);

        const rowsToUpload = data.map((row: any) => [
          `BS-${Date.now()}-${Math.floor(Math.random()*1000)}`,
          row.Date || row.Tanggal || new Date().toISOString().split('T')[0],
          row.Label || row.Deskripsi || row.Description || '-',
          row.Partner || '-',
          row.Amount || row.Nominal || 0,
          row['Running Balance'] || row.Saldo || 0,
          'Unreconciled', '', '' 
        ]);

        const res = await fetch(`/api/bank-statements?email=${email}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-sheet-id': sheetId as string },
          body: JSON.stringify({ sheetId: sheetId, rows: rowsToUpload })
        });

        const json = await res.json();
        if (json.success) { alert(`✅ Sukses Upload Mutasi!`); fetchData(); } 
        else { alert("Gagal upload backend: " + json.error); }
      } catch (err) { alert("File Excel tidak valid."); } 
      finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
    };
    reader.readAsBinaryString(file);
  };

  // --- 3. FUNGSI VALIDATE (PREVIEW JURNAL) ---
  const handleValidate = () => {
      if (!selectedTx) return;

      // Susun pesan jurnal untuk ditampilkan ke User
      let previewMsg = `YAKIN INGIN VALIDASI TRANSAKSI INI?\n\n[JURNAL YANG AKAN TERBENTUK DI BUKU BESAR]\n`;
      previewMsg += `-------------------------------------------------\n`;

      if (activeTab === 'manual') {
          if (!manualAccount) return alert("Pilih akun lawan transaksi terlebih dahulu!");
          
          if (selectedTx.amount > 0) {
              previewMsg += `(Debit)  Bank BCA    : ${fmtMoney(selectedTx.amount)}\n`;
              previewMsg += `(Kredit) ${manualAccount} : ${fmtMoney(selectedTx.amount)}\n`;
          } else {
              previewMsg += `(Debit)  ${manualAccount} : ${fmtMoney(selectedTx.amount)}\n`;
              previewMsg += `(Kredit) Bank BCA    : ${fmtMoney(selectedTx.amount)}\n`;
          }
      } 
      else if (activeTab === 'match') {
          if (!selectedMatch) return alert("Pilih salah satu transaksi dari daftar untuk di-match!");
          const matchId = selectedMatch.ID || selectedMatch.id || selectedMatch.No_Transaksi || selectedMatch[Object.keys(selectedMatch)[0]];
          
          previewMsg += `TINDAKAN: MATCHING TRANSAKSI\n`;
          previewMsg += `Mutasi bank ini akan ditautkan ke ID Transaksi Sistem: [${matchId}]\n\n`;
          previewMsg += `*Sistem HANYA akan mengubah status menjadi Reconciled, tanpa menduplikasi jurnal.*\n`;
      }

      previewMsg += `-------------------------------------------------\n\nKlik OK untuk mengeksekusi ke Database.`;

      if (window.confirm(previewMsg)) {
          alert("✅ Simulasi Berhasil! (Sistem Write ke Database akan dipasang di tahap berikutnya).");
          // Reset view setelah sukses
          setSelectedTx(null);
          setSelectedMatch(null);
          setManualAccount('');
      }
  };

  // --- RENDER DAFTAR KANDIDAT MATCHING TRANSAKSI ---
  const renderMatchCandidates = () => {
      // Ambil array yang sesuai berdasarkan sifat mutasi (Uang Masuk / Keluar)
      const candidates = selectedTx?.amount > 0 ? inflowTx : outflowTx;
      
      if (candidates.length === 0) {
          return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center flex flex-col items-center mt-4">
                <Receipt size={48} className="text-slate-200 mb-4"/>
                <h3 className="text-lg font-bold text-slate-800 mb-2">Belum Ada Data Transaksi di Database</h3>
                <p className="text-slate-500 text-sm max-w-md">Sistem belum menemukan data di Sheet (POS/Invoice/Expense). Silakan buat jurnal Manual di tab sebelah kanan.</p>
            </div>
          );
      }

      return (
          <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden bg-white">
              <div className="bg-blue-50 px-4 py-3 border-b border-slate-200 text-xs font-bold text-blue-800 flex items-center gap-2">
                 <Info size={14}/> Sistem menemukan {candidates.length} transaksi {selectedTx?.amount > 0 ? 'Pemasukan' : 'Pengeluaran'} di database.
              </div>
              <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs text-left">
                      <thead className="bg-white text-slate-400 sticky top-0 border-b border-slate-100">
                          <tr><th className="p-3">Pilih</th><th className="p-3">Sumber</th><th className="p-3">Tanggal / Keterangan</th><th className="p-3 text-right">Nominal</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {candidates.map((tx, idx) => {
                              // Pencarian Kolom ID, Tanggal & Total secara dinamis
                              const txId = tx.ID || tx.id || tx.No_Transaksi || tx[Object.keys(tx)[0]];
                              const txDate = tx.Date || tx.Tanggal || '-';
                              const txTotalStr = tx.Total || tx.Amount || tx.Nominal || tx.Grand_Total || '0';
                              // Bersihkan teks "Rp " atau "." jika ada agar jadi angka murni
                              const cleanTotal = parseFloat(String(txTotalStr).replace(/Rp|\./g, '').trim()) || 0;

                              return (
                                  <tr key={idx} onClick={() => setSelectedMatch(tx)} className={`cursor-pointer transition-colors ${selectedMatch === tx ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                                      <td className="p-3 text-center">
                                          <input type="radio" checked={selectedMatch === tx} readOnly className="w-4 h-4 text-blue-600"/>
                                      </td>
                                      <td className="p-3 font-bold text-slate-600"><span className="bg-slate-100 px-2 py-1 rounded">{tx._source}</span></td>
                                      <td className="p-3"><div className="font-bold text-slate-800">{txId}</div><div className="text-slate-500">{formatTanggal(txDate)}</div></td>
                                      <td className="p-3 text-right font-bold font-mono text-slate-700">{fmtMoney(cleanTotal)}</td>
                                  </tr>
                              );
                          })}
                      </tbody>
                  </table>
              </div>
          </div>
      );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] font-sans">
      
      {/* HEADER BAR */}
      <div className="bg-white p-4 border-b border-slate-200 flex justify-between items-center shadow-sm z-10">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Building2 className="text-blue-600"/> Bank Reconciliation
          </h1>
          <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold shadow-sm">
            {statements.length} To Process
          </span>
        </div>

        <div className="flex gap-2">
           <input type="file" accept=".xlsx, .xls, .csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload}/>
           <button 
              onClick={() => fileInputRef.current?.click()} 
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-all shadow-md disabled:opacity-50"
           >
              {uploading ? <Loader2 size={16} className="animate-spin"/> : <UploadCloud size={16}/>}
              {uploading ? 'Uploading...' : 'Upload Statement'}
           </button>
        </div>
      </div>

      {/* WORKSPACE (SPLIT VIEW) */}
      <div className="flex-1 flex overflow-hidden bg-slate-50">
        
        {/* PANEL KIRI: DAFTAR MUTASI */}
        <div className={`w-full ${selectedTx ? 'lg:w-[45%] hidden lg:flex' : 'w-full'} flex-col border-r border-slate-200 bg-white transition-all duration-300`}>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading ? (
               <div className="flex flex-col items-center justify-center h-64 text-slate-400"><Loader2 className="animate-spin mb-2" size={24}/> Memuat mutasi...</div>
            ) : statements.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-64 text-slate-400"><CheckCircle2 size={48} className="mb-4 opacity-20 text-emerald-500"/><p>Semua mutasi sudah beres.</p></div>
            ) : (
              <table className="w-full text-sm text-left">
                 <thead className="bg-white text-slate-500 text-[10px] uppercase font-bold sticky top-0 border-b border-slate-100 shadow-sm z-10">
                    <tr><th className="p-3">Tanggal</th><th className="p-3">Label / Partner</th><th className="p-3 text-right">Nominal</th></tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                    {statements.map((tx, idx) => (
                       <tr key={`${tx.id}-${idx}`} onClick={() => { setSelectedTx(tx); setSelectedMatch(null); setActiveTab('match'); }} className={`cursor-pointer transition-all ${selectedTx?.id === tx.id ? 'bg-blue-50/80 border-l-4 border-blue-600' : 'hover:bg-slate-50 border-l-4 border-transparent'}`}>
                          <td className="p-3 font-mono text-xs text-slate-500 whitespace-nowrap">{tx.date}</td>
                          <td className="p-3">
                             <div className="font-bold text-slate-800 line-clamp-1">{tx.label}</div>
                             <div className="text-[10px] text-slate-500">{tx.partner}</div>
                          </td>
                          <td className={`p-3 text-right font-bold font-mono whitespace-nowrap ${tx.amount > 0 ? 'text-emerald-600' : 'text-slate-800'}`}>
                             {fmtMoney(tx.amount)}
                          </td>
                       </tr>
                    ))}
                 </tbody>
              </table>
            )}
          </div>
        </div>

        {/* PANEL KANAN: RECONCILIATION ACTION */}
        {selectedTx ? (
           <div className="flex-1 flex flex-col bg-slate-50 lg:bg-slate-100 overflow-y-auto">
              
              <div className="bg-white p-6 border-b border-slate-200 shadow-sm m-4 rounded-xl border">
                 <div className="flex justify-between items-start mb-4">
                    <div>
                       <h2 className="text-xl font-bold text-slate-900">{selectedTx.label}</h2>
                       <p className="text-slate-500 text-sm flex items-center gap-2 mt-1"><Wallet size={14}/> {selectedTx.partner} • <span className="font-mono text-xs">{selectedTx.date}</span></p>
                    </div>
                    <div className={`text-2xl font-black tracking-tight ${selectedTx.amount > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
                       {fmtMoney(selectedTx.amount)}
                    </div>
                 </div>

                 <div className="flex gap-4 border-b border-slate-200 mt-6">
                    <button onClick={() => setActiveTab('match')} className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'match' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><ArrowRightLeft size={16}/> Match Entries ({selectedTx.amount > 0 ? inflowTx.length : outflowTx.length})</button>
                    <button onClick={() => setActiveTab('manual')} className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'manual' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><FileText size={16}/> Manual Operations</button>
                 </div>
              </div>

              <div className="px-4 flex-1 pb-10">
                 {/* KONTEN TAB MATCH */}
                 {activeTab === 'match' && renderMatchCandidates()}

                 {/* KONTEN TAB MANUAL */}
                 {activeTab === 'manual' && (
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-4">
                       <div className="p-4 bg-slate-50 border-b border-slate-100 font-bold text-slate-700 text-sm">Create Jurnal Manual</div>
                       <div className="p-6 space-y-4">
                          <div>
                             <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Account (Lawan Transaksi)</label>
                             <select className="w-full p-3 border border-slate-300 rounded-lg text-sm bg-white" value={manualAccount} onChange={(e) => setManualAccount(e.target.value)}>
                                <option value="">-- Pilih Akun --</option>
                                {coaList.map((acc, i) => (
                                   <option key={i} value={acc.Account_Code}>{acc.Account_Code} - {acc.Account_Name}</option>
                                ))}
                             </select>
                          </div>
                          <div>
                             <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Notes</label>
                             <input type="text" className="w-full p-3 border border-slate-300 rounded-lg text-sm" defaultValue={selectedTx.label}/>
                          </div>
                       </div>
                    </div>
                 )}
              </div>

              {/* ACTION BUTTON (VALIDATE) */}
              <div className="p-4 bg-white border-t border-slate-200 mt-auto flex justify-between items-center z-20">
                 <button onClick={() => setSelectedTx(null)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg lg:hidden">Tutup Panel</button>
                 <div className="flex gap-3 ml-auto">
                    <button 
                       onClick={handleValidate}
                       disabled={(activeTab === 'manual' && !manualAccount) || (activeTab === 'match' && !selectedMatch)}
                       className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 disabled:opacity-50 disabled:shadow-none flex items-center gap-2 transition-all"
                    >
                       VALIDATE & PREVIEW <ChevronRight size={18}/>
                    </button>
                 </div>
              </div>
           </div>
        ) : (
           <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-slate-400 bg-slate-100/50">
              <ArrowRightLeft size={64} className="mb-4 opacity-20 text-slate-400"/>
              <h3 className="text-xl font-bold text-slate-500 mb-2">Pilih Transaksi</h3>
              <p className="text-sm">Klik salah satu mutasi di panel kiri untuk memulai.</p>
           </div>
        )}
      </div>
    </div>
  );
}