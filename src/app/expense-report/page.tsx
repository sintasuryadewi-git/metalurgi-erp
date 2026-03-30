'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Receipt, Building2, Wallet, Search, Filter, 
  ChevronRight, ChevronLeft, Loader2, CheckCircle2, 
  AlertCircle, FileText, PieChart, X, ShieldAlert,
  Calendar, LayoutList, List, ArrowLeft, BarChart3
} from 'lucide-react';

export default function ExpenseReportPage() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  
  // STATE FILTER & SEARCH
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
  const [activeQuickFilter, setActiveQuickFilter] = useState('all'); // ✨ FIX: Quick Filter State
  
  // STATE VIEW MODE & SELECTION
  // ✨ FIX: Tambah mode 'time_summary'
  const [viewMode, setViewMode] = useState<'list' | 'coa_summary' | 'time_summary'>('list');
  const [selectedTx, setSelectedTx] = useState<any>(null);
  
  // STATE MOBILE RESPONSIVE
  const [showMobileDetail, setShowMobileDetail] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const getApiHeaders = () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (typeof window !== 'undefined') {
        const sheetId = localStorage.getItem('METALURGI_SHEET_ID');
        if (sheetId) headers['x-sheet-id'] = sheetId;
    }
    return headers;
  };

  const fmtMoney = (n: number) => "Rp " + Math.abs(n).toLocaleString('id-ID');

  const fetchData = async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await fetch(`/api/expense-report`, { headers: getApiHeaders(), cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        setExpenses(json.data || []);
      } else {
        setFetchError(json.error || 'Server gagal merespons data yang valid.');
      }
    } catch (err: any) { 
        setFetchError('Koneksi ke server API gagal/terputus.');
    } finally { 
        setLoading(false); 
    }
  };

  useEffect(() => { fetchData(); }, []);

  // ==========================================
  // LOGIKA SMART QUICK FILTER TANGGAL
  // ==========================================
  const applyQuickFilter = (preset: string) => {
      setActiveQuickFilter(preset);
      setCurrentPage(1);

      if (preset === 'all') {
          return setDateFilter({ start: '', end: '' });
      }

      const today = new Date();
      const fmtDate = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
      };

      let start = new Date(today);
      let end = new Date(today);

      switch (preset) {
          case 'today':
              break; // start & end is today
          case 'yesterday':
              start.setDate(today.getDate() - 1);
              end.setDate(today.getDate() - 1);
              break;
          case 'this_week':
              const day = today.getDay();
              const diffToMonday = today.getDate() - day + (day === 0 ? -6 : 1);
              start.setDate(diffToMonday);
              break;
          case 'last_week':
              const lastWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
              const lwDay = lastWeek.getDay();
              start = new Date(lastWeek.getFullYear(), lastWeek.getMonth(), lastWeek.getDate() - lwDay + (lwDay === 0 ? -6 : 1));
              end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
              break;
          case 'this_month':
              start = new Date(today.getFullYear(), today.getMonth(), 1);
              break;
          case 'last_month':
              start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
              end = new Date(today.getFullYear(), today.getMonth(), 0);
              break;
          case 'this_year':
              start = new Date(today.getFullYear(), 0, 1);
              break;
          case 'last_year':
              start = new Date(today.getFullYear() - 1, 0, 1);
              end = new Date(today.getFullYear() - 1, 11, 31);
              break;
      }

      setDateFilter({ start: fmtDate(start), end: fmtDate(end) });
  };

  // ==========================================
  // DATA PROCESSING & FILTERING UTAMA
  // ==========================================
  const filteredExpenses = useMemo(() => {
      return expenses.filter(tx => {
          const matchSearch = tx.refId.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              tx.desc.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              tx.expenseCategory.toLowerCase().includes(searchTerm.toLowerCase());
          
          let matchDate = true;
          if (dateFilter.start || dateFilter.end) {
              const txDate = new Date(tx.date);
              txDate.setHours(0, 0, 0, 0); 
              
              if (dateFilter.start) {
                  const start = new Date(dateFilter.start);
                  start.setHours(0, 0, 0, 0);
                  matchDate = matchDate && txDate >= start;
              }
              if (dateFilter.end) {
                  const end = new Date(dateFilter.end);
                  end.setHours(0, 0, 0, 0);
                  matchDate = matchDate && txDate <= end;
              }
          }
          return matchSearch && matchDate;
      });
  }, [expenses, searchTerm, dateFilter]);

  // ==========================================
  // GROUPING: REKAP KATEGORI (PIE CHART DATA)
  // ==========================================
  const pieColors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

  const summaryByCOA = useMemo(() => {
      const grouped = filteredExpenses.reduce((acc, tx) => {
          const cat = tx.expenseCategory || 'Tanpa Kategori Biaya';
          if (!acc[cat]) acc[cat] = 0;
          acc[cat] += tx.amount;
          return acc;
      }, {} as Record<string, number>);
      
      let colorIndex = 0;
      return Object.entries(grouped)
          .map(([category, amount]) => ({ 
              category, 
              amount: Number(amount),
              color: pieColors[colorIndex++ % pieColors.length]
          }))
          .sort((a, b) => b.amount - a.amount);
  }, [filteredExpenses]);

  // ==========================================
  // GROUPING: REKAP WAKTU (BULAN/TAHUN)
  // ==========================================
  const summaryByTime = useMemo(() => {
      const grouped = filteredExpenses.reduce((acc, tx) => {
          if (!tx.date) return acc;
          const d = new Date(tx.date);
          const monthYear = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
          const sortKey = `${d.getFullYear()}${String(d.getMonth()).padStart(2,'0')}`; // Untuk sorting YYYYMM
          
          if (!acc[sortKey]) acc[sortKey] = { label: monthYear, amount: 0, count: 0 };
          acc[sortKey].amount += tx.amount;
          acc[sortKey].count += 1;
          return acc;
      }, {} as Record<string, { label: string, amount: number, count: number }>);

      // Urutkan dari bulan terbaru ke terlama
      return Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map(key => grouped[key]);
  }, [filteredExpenses]);

  // PERHITUNGAN METRIK BERDASARKAN FILTER
  const totalFilteredExpense = filteredExpenses.reduce((sum, tx) => sum + tx.amount, 0);
  const totalBank = filteredExpenses.filter(tx => tx.paymentMethod.toLowerCase().includes('bank')).reduce((sum, tx) => sum + tx.amount, 0);
  const totalCash = filteredExpenses.filter(tx => !tx.paymentMethod.toLowerCase().includes('bank')).reduce((sum, tx) => sum + tx.amount, 0);

  // PAGINATION UNTUK LIST VIEW
  const totalPages = Math.ceil(filteredExpenses.length / itemsPerPage);
  const paginatedExpenses = useMemo(() => {
      const start = (currentPage - 1) * itemsPerPage;
      return filteredExpenses.slice(start, start + itemsPerPage);
  }, [filteredExpenses, currentPage]);

  const handleNextPage = () => { if (currentPage < totalPages) setCurrentPage(p => p + 1); };
  const handlePrevPage = () => { if (currentPage > 1) setCurrentPage(p => p - 1); };

  const handleSelectTx = (tx: any) => {
      setSelectedTx(tx);
      setShowMobileDetail(true);
  };

  // LOGIKA PEMBUATAN DONUT CHART CSS
  const getConicGradient = () => {
      let cumulativePercent = 0;
      const stops = summaryByCOA.map(item => {
          const percent = (item.amount / totalFilteredExpense) * 100;
          const stop = `${item.color} ${cumulativePercent}% ${cumulativePercent + percent}%`;
          cumulativePercent += percent;
          return stop;
      });
      return `conic-gradient(${stops.join(', ')})`;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] font-sans relative bg-slate-50">
      
      {/* HEADER & METRICS */}
      <div className="bg-white px-4 md:px-6 pt-5 pb-5 border-b border-slate-200 shadow-sm z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">
                <Receipt className="text-rose-500"/> Expense Report
            </h1>
            <p className="text-xs md:text-sm text-slate-500 mt-1">
                Analisis arus kas keluar operasional perusahaan.
            </p>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto custom-scrollbar pb-1 md:pb-0">
            <div className="bg-rose-50 border border-rose-100 px-4 py-2 rounded-xl flex flex-col items-end min-w-[140px]">
                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest whitespace-nowrap">Total Keluar</p>
                <p className="font-mono font-black text-rose-700 text-base md:text-lg">{fmtMoney(totalFilteredExpense)}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl flex flex-col items-end min-w-[120px]">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Via Bank</p>
                <p className="font-mono font-black text-slate-700 text-base md:text-lg">{fmtMoney(totalBank)}</p>
            </div>
            <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl flex flex-col items-end min-w-[120px]">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Via Kas/Tunai</p>
                <p className="font-mono font-black text-slate-700 text-base md:text-lg">{fmtMoney(totalCash)}</p>
            </div>
        </div>
      </div>

      {/* TOOLBAR FILTER & SEARCH */}
      <div className="bg-white px-4 md:px-6 py-3 border-b border-slate-200 z-10 flex flex-col gap-3 shrink-0">
          
          {/* BARIS 1: SMART QUICK FILTERS */}
          <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0 mr-1">Filter Waktu:</span>
              {[
                  { id: 'all', label: 'Semua Waktu' },
                  { id: 'today', label: 'Hari Ini' },
                  { id: 'yesterday', label: 'Kemarin' },
                  { id: 'this_week', label: 'Minggu Ini' },
                  { id: 'last_week', label: 'Minggu Lalu' },
                  { id: 'this_month', label: 'Bulan Ini' },
                  { id: 'last_month', label: 'Bulan Lalu' },
                  { id: 'this_year', label: 'Tahun Ini' },
                  { id: 'last_year', label: 'Tahun Lalu' }
              ].map(preset => (
                  <button 
                      key={preset.id}
                      onClick={() => applyQuickFilter(preset.id)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] md:text-xs font-bold transition-colors ${activeQuickFilter === preset.id ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200'}`}
                  >
                      {preset.label}
                  </button>
              ))}
          </div>

          {/* BARIS 2: SEARCH & VIEW TOGGLE */}
          <div className="flex flex-col md:flex-row gap-3 items-center">
              <div className="relative w-full md:flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input 
                    type="text" 
                    placeholder="Cari Ref ID, Deskripsi, atau Kategori COA..." 
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs outline-none focus:ring-2 ring-rose-400 font-medium" 
                    value={searchTerm} 
                    onChange={e => {setSearchTerm(e.target.value); setCurrentPage(1);}}
                  />
              </div>
              
              <div className="flex w-full md:w-auto items-center gap-2 bg-slate-50 border border-slate-200 p-1 rounded-lg shrink-0">
                  <input type="date" className="bg-transparent text-xs outline-none font-bold text-slate-600 px-1" value={dateFilter.start} onChange={e => {setDateFilter({...dateFilter, start: e.target.value}); setActiveQuickFilter('custom'); setCurrentPage(1);}}/>
                  <span className="text-slate-300 font-bold">-</span>
                  <input type="date" className="bg-transparent text-xs outline-none font-bold text-slate-600 px-1" value={dateFilter.end} onChange={e => {setDateFilter({...dateFilter, end: e.target.value}); setActiveQuickFilter('custom'); setCurrentPage(1);}}/>
              </div>

              {/* Toggle Tampilan */}
              <div className="flex w-full md:w-auto bg-slate-200 p-1 rounded-lg border border-slate-300 shrink-0">
                  <button 
                      onClick={() => setViewMode('list')}
                      className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-rose-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      <List size={14}/> Riwayat
                  </button>
                  <button 
                      onClick={() => {setViewMode('coa_summary'); setSelectedTx(null); setShowMobileDetail(false);}}
                      className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${viewMode === 'coa_summary' ? 'bg-white shadow-sm text-rose-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      <PieChart size={14}/> Analisis COA
                  </button>
                  <button 
                      onClick={() => {setViewMode('time_summary'); setSelectedTx(null); setShowMobileDetail(false);}}
                      className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${viewMode === 'time_summary' ? 'bg-white shadow-sm text-rose-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                      <BarChart3 size={14}/> Rekap Periode
                  </button>
              </div>
          </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* ============================================================================== */}
        {/* PANEL KIRI: DAFTAR TRANSAKSI, REKAP COA, ATAU REKAP WAKTU                      */}
        {/* ============================================================================== */}
        <div className={`w-full ${selectedTx && showMobileDetail ? 'hidden lg:flex' : 'flex'} ${viewMode === 'list' ? 'lg:w-[60%]' : 'w-full'} flex-col border-r border-slate-200 bg-white shadow-sm z-10`}>
          
          {loading ? ( 
              <div className="flex flex-col items-center justify-center h-full text-slate-400"><Loader2 className="animate-spin mb-2" size={24}/> Memuat data...</div>
          ) : fetchError ? (
              <div className="flex flex-col items-center justify-center h-full text-rose-500 text-center px-4"><AlertCircle size={32} className="mb-2 opacity-50"/><p className="font-bold text-sm">Gagal Menarik Data</p><p className="text-xs mt-1">{fetchError}</p></div>
          ) : viewMode === 'coa_summary' ? (
              
              // ------------------------------------
              // TAMPILAN REKAPITULASI COA & PIE CHART
              // ------------------------------------
              <div className="flex-1 overflow-auto custom-scrollbar p-4 md:p-8 bg-slate-50/50">
                  <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-8 items-start">
                      
                      {/* Grafik Donut (Kiri) */}
                      {summaryByCOA.length > 0 && (
                          <div className="w-full md:w-1/3 flex flex-col items-center bg-white p-6 rounded-3xl border border-slate-200 shadow-sm shrink-0">
                              <h3 className="font-black text-slate-700 text-center mb-6">Komposisi Biaya Terbesar</h3>
                              <div className="relative w-48 h-48 md:w-64 md:h-64 rounded-full shadow-inner flex items-center justify-center transition-all duration-1000" style={{ background: getConicGradient() }}>
                                  <div className="w-32 h-32 md:w-44 md:h-44 bg-white rounded-full flex flex-col items-center justify-center shadow-lg text-center z-10 p-2">
                                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</p>
                                      <p className="text-base md:text-xl font-black text-rose-600 truncate w-full">{fmtMoney(totalFilteredExpense).replace('Rp ', '')}</p>
                                  </div>
                              </div>
                          </div>
                      )}

                      {/* Tabel Bar (Kanan) */}
                      <div className="w-full md:w-2/3">
                          <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><LayoutList className="text-blue-500"/> Detail per Kategori Akun</h2>
                          {summaryByCOA.length === 0 ? (
                              <div className="p-8 text-center text-slate-400 font-bold bg-white rounded-2xl border border-slate-200">Tidak ada pengeluaran pada periode ini.</div>
                          ) : (
                              <div className="grid grid-cols-1 gap-3">
                                  {summaryByCOA.map((item, idx) => {
                                      const percentage = totalFilteredExpense > 0 ? (item.amount / totalFilteredExpense) * 100 : 0;
                                      return (
                                          <div key={idx} className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4">
                                              <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: item.color }}></div>
                                              <div className="flex-1 min-w-0">
                                                  <div className="flex justify-between items-start mb-2">
                                                      <p className="font-black text-slate-800 text-xs md:text-sm truncate pr-4">{item.category}</p>
                                                      <p className="font-mono font-black text-slate-700 text-sm md:text-base whitespace-nowrap">{fmtMoney(item.amount)}</p>
                                                  </div>
                                                  <div className="flex items-center gap-3">
                                                      <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                                                          <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${percentage}%`, backgroundColor: item.color }}></div>
                                                      </div>
                                                      <span className="text-[10px] font-bold text-slate-500 w-10 text-right">{percentage.toFixed(1)}%</span>
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                  })}
                              </div>
                          )}
                      </div>
                  </div>
              </div>

          ) : viewMode === 'time_summary' ? (
              
              // ------------------------------------
              // TAMPILAN REKAPITULASI WAKTU (BULAN/TAHUN)
              // ------------------------------------
              <div className="flex-1 overflow-auto custom-scrollbar p-4 md:p-8 bg-slate-50/50">
                  <div className="max-w-4xl mx-auto">
                      <h2 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                          <Calendar className="text-blue-500"/> Tren Pengeluaran per Bulan
                      </h2>
                      {summaryByTime.length === 0 ? (
                          <div className="p-8 text-center text-slate-400 font-bold bg-white rounded-2xl border border-slate-200">Tidak ada data untuk ditampilkan.</div>
                      ) : (
                          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
                              <table className="w-full text-sm text-left">
                                 <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-black border-b border-slate-200">
                                     <tr>
                                         <th className="p-4">Periode Waktu</th>
                                         <th className="p-4 text-center">Jumlah Trx</th>
                                         <th className="p-4 text-right">Total Uang Keluar</th>
                                     </tr>
                                 </thead>
                                 <tbody className="divide-y divide-slate-100">
                                    {summaryByTime.map((item, idx) => (
                                       <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                          <td className="p-4 font-black text-slate-800">{item.label}</td>
                                          <td className="p-4 text-center">
                                              <span className="bg-blue-50 text-blue-600 font-bold px-3 py-1 rounded-full text-xs border border-blue-100">{item.count} Trx</span>
                                          </td>
                                          <td className="p-4 text-right font-mono font-black text-rose-600 text-base">{fmtMoney(item.amount)}</td>
                                       </tr>
                                    ))}
                                 </tbody>
                              </table>
                          </div>
                      )}
                  </div>
              </div>

          ) : (
              
              // ------------------------------------
              // TAMPILAN DAFTAR TRANSAKSI (LIST VIEW)
              // ------------------------------------
              <>
                  <div className="flex-1 overflow-auto custom-scrollbar relative">
                      <table className="w-full text-sm text-left">
                         <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-black sticky top-0 border-b border-slate-200 z-10 shadow-sm">
                             <tr>
                                 <th className="p-4 w-[120px]">Ref ID & Tgl</th>
                                 <th className="p-4">Keterangan Biaya</th>
                                 <th className="p-4 hidden md:table-cell">Metode</th>
                                 <th className="p-4 text-right">Nominal</th>
                             </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                            {paginatedExpenses.length === 0 ? (
                                <tr><td colSpan={4} className="p-10 text-center text-slate-400 font-bold text-sm">Tidak ada data pengeluaran ditemukan.</td></tr>
                            ) : paginatedExpenses.map((tx, idx) => (
                               <tr 
                                    key={idx} 
                                    onClick={() => handleSelectTx(tx)} 
                                    className={`cursor-pointer transition-colors ${selectedTx?.refId === tx.refId ? 'bg-rose-50 ring-1 ring-rose-300' : 'hover:bg-slate-50'}`}
                               >
                                  <td className="p-4">
                                      <p className="font-bold text-rose-600 text-xs">{tx.refId}</p>
                                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{tx.date}</p>
                                  </td>
                                  <td className="p-4">
                                      <p className="font-bold text-slate-800 text-xs line-clamp-1">{tx.desc}</p>
                                      <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                                          <PieChart size={10} className="shrink-0"/> <span className="truncate">{tx.expenseCategory}</span>
                                      </p>
                                  </td>
                                  <td className="p-4 hidden md:table-cell">
                                      <span className={`px-2 py-1 rounded text-[9px] font-black tracking-widest ${tx.paymentMethod.toLowerCase().includes('bank') ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                          {tx.paymentMethod.toLowerCase().includes('bank') ? 'BANK' : 'CASH'}
                                      </span>
                                  </td>
                                  <td className="p-4 text-right">
                                      <div className="font-black font-mono text-slate-800 text-sm">{fmtMoney(tx.amount)}</div>
                                      {tx.isBankReconciled ? (
                                          <span className="text-[9px] font-black text-emerald-500 flex items-center justify-end gap-1 mt-1"><CheckCircle2 size={10}/> LUNAS</span>
                                      ) : (
                                          <span className="text-[9px] font-black text-slate-400 flex items-center justify-end gap-1 mt-1"><Loader2 size={10}/> IN-TRANSIT</span>
                                      )}
                                  </td>
                               </tr>
                            ))}
                         </tbody>
                      </table>
                  </div>
                  
                  {/* PAGINATION CONTROL (Hanya tampil di List View) */}
                  {filteredExpenses.length > 0 && (
                      <div className="p-3.5 bg-white border-t border-slate-200 flex justify-between items-center z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
                          <button onClick={handlePrevPage} disabled={currentPage === 1} className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-100 transition-colors"><ChevronLeft size={16}/></button>
                          <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">Hal {currentPage} dari {totalPages || 1}</span>
                          <button onClick={handleNextPage} disabled={currentPage >= totalPages} className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-100 transition-colors"><ChevronRight size={16}/></button>
                      </div>
                  )}
              </>
          )}
        </div>

        {/* ============================================================================== */}
        {/* PANEL KANAN: DETAIL & JEJAK AUDIT (Bisa tampil penuh di Mobile)              */}
        {/* ============================================================================== */}
        {selectedTx && viewMode === 'list' && (
           <div className={`flex-1 flex-col bg-slate-50 overflow-y-auto custom-scrollbar p-4 md:p-6 ${!showMobileDetail ? 'hidden lg:flex' : 'flex w-full absolute inset-0 z-50 lg:relative lg:z-auto lg:w-auto'}`}>
               
               {/* Mobile Back Button */}
               <div className="lg:hidden mb-4 flex items-center gap-2">
                   <button onClick={() => setShowMobileDetail(false)} className="p-2 bg-white rounded-lg border border-slate-200 shadow-sm text-slate-600 flex items-center gap-2 text-xs font-bold hover:bg-rose-50 hover:text-rose-600">
                       <ArrowLeft size={16}/> Kembali ke Daftar
                   </button>
               </div>

               <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6 shrink-0">
                   <div className="bg-rose-50 border-b border-rose-100 p-5 flex justify-between items-start">
                       <div>
                           <span className="px-2 py-1 rounded text-[9px] font-black tracking-widest bg-rose-200 text-rose-800 mb-2 inline-block">EXPENSE OUT</span>
                           <h2 className="text-base md:text-lg font-black text-slate-900 leading-tight pr-4">{selectedTx.desc}</h2>
                           <p className="text-xs font-bold text-rose-600 mt-1.5">{selectedTx.refId}</p>
                       </div>
                       <button onClick={() => {setSelectedTx(null); setShowMobileDetail(false);}} className="p-2 bg-white rounded-full hover:bg-rose-100 text-rose-500 hidden lg:block shadow-sm border border-rose-100"><X size={16}/></button>
                   </div>
                   <div className="p-5 flex flex-col md:flex-row gap-6">
                       <div className="flex-1 space-y-4">
                           <div>
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tanggal Bayar</p>
                               <p className="text-sm font-bold text-slate-800 flex items-center gap-2"><Calendar size={14} className="text-slate-400"/> {selectedTx.date}</p>
                           </div>
                           <div>
                               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Sumber Dana (Kredit)</p>
                               <p className="text-sm font-bold text-slate-800 flex items-center gap-2"><Wallet size={14} className="text-slate-400"/> <span className="truncate">{selectedTx.sourceAccount}</span></p>
                           </div>
                       </div>
                       <div className="flex-1 bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col justify-center items-end text-right">
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Nominal</p>
                           <p className="text-2xl font-black font-mono text-rose-600 truncate max-w-full">{fmtMoney(selectedTx.amount)}</p>
                       </div>
                   </div>
               </div>

               <h3 className="font-black text-slate-800 text-sm mb-3 flex items-center gap-2 shrink-0"><ShieldAlert size={16} className="text-blue-500"/> Jejak Audit Akuntansi (3-Way Match)</h3>
               
               <div className="space-y-3 pb-6">
                   {/* 1. STATUS GL */}
                   <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start md:items-center gap-4 flex-col md:flex-row">
                       <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${selectedTx.isBalanced ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                           {selectedTx.isBalanced ? <CheckCircle2 size={20}/> : <AlertCircle size={20}/>}
                       </div>
                       <div className="flex-1 w-full">
                           <p className="text-xs font-bold text-slate-800">Jurnal Buku Besar (General Ledger)</p>
                           <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                               {selectedTx.isBalanced 
                                   ? `Valid. Terdapat ${selectedTx.glCount} baris jurnal berpasangan (Double-Entry Balanced).` 
                                   : `Peringatan! Jurnal tidak seimbang atau belum di-posting ke Buku Besar.`}
                           </p>
                       </div>
                   </div>

                   {/* 2. KATEGORI BIAYA */}
                   <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start md:items-center gap-4 flex-col md:flex-row">
                       <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                           <PieChart size={20}/>
                       </div>
                       <div className="flex-1 w-full overflow-hidden">
                           <p className="text-xs font-bold text-slate-800">Kategori Pembebanan Biaya (Debit)</p>
                           <p className="text-[11px] font-bold text-blue-600 mt-0.5 truncate">{selectedTx.expenseCategory}</p>
                       </div>
                   </div>

                   {/* 3. STATUS REKONSILIASI BANK */}
                   {selectedTx.paymentMethod.toLowerCase().includes('bank') ? (
                       <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start md:items-center gap-4 flex-col md:flex-row">
                           <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${selectedTx.isBankReconciled ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                               {selectedTx.isBankReconciled ? <CheckCircle2 size={20}/> : <Loader2 size={20} className="animate-spin"/>}
                           </div>
                           <div className="flex-1 w-full">
                               <p className="text-xs font-bold text-slate-800">Rekonsiliasi Mutasi Bank</p>
                               {selectedTx.isBankReconciled ? (
                                   <div className="text-[10px] text-emerald-600 mt-1 font-bold flex items-center gap-1.5 flex-wrap">
                                       Cocok dengan ID: <span className="font-mono bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-emerald-700">{selectedTx.bankStatementId}</span>
                                   </div>
                               ) : (
                                   <p className="text-[10px] text-amber-600 mt-1 font-bold leading-relaxed">
                                       Masih In-Transit. Menunggu konfirmasi aliran uang dari mutasi Bank Register.
                                   </p>
                               )}
                           </div>
                       </div>
                   ) : (
                       <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 border-dashed flex items-center justify-center text-center">
                           <p className="text-xs font-bold text-slate-400">Pembayaran Tunai (Cash). Tidak butuh rekonsiliasi mutasi Bank.</p>
                       </div>
                   )}
               </div>
           </div>
        )}
        
        {/* Placeholder panel kanan jika tidak ada yang dipilih */}
        {!selectedTx && viewMode === 'list' && (
           <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-slate-400 bg-slate-100/50 p-6 text-center">
              <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-200 mb-6">
                  <Receipt size={48} className="text-slate-300"/>
              </div>
              <h3 className="text-2xl font-black text-slate-500 mb-2">Audit Pengeluaran</h3>
              <p className="text-sm text-slate-400 max-w-sm">Klik salah satu transaksi pengeluaran di sebelah kiri untuk melihat detail alur pencatatan dan status rekonsiliasinya.</p>
           </div>
        )}

      </div>
    </div>
  );
}