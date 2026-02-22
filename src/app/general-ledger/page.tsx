'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Search, Calendar, Download, FileText, 
  ChevronRight, List, Loader2, RefreshCw, Calculator, Filter,
  Lock, ShieldCheck, ChevronLeft 
} from 'lucide-react';

import { useFetch } from '@/hooks/useFetch'; 

// --- HELPER FORMATTING ---
const fmtMoney = (n: number) => "Rp " + n.toLocaleString('id-ID');

const parseAmount = (val: any) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const clean = val.toString().replace(/[^0-9.-]+/g, ""); 
    return parseFloat(clean) || 0;
};

// Helper parsing tanggal Sheet
const parseSheetDate = (dateStr: string) => {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr; 
    return d.toISOString().split('T')[0]; 
};

export default function GeneralLedgerPage() {
  
  // --- STATE UI ---
  const [activeAccountCode, setActiveAccountCode] = useState<string>('1-1001'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false); 
  
  // --- STATE PAGINATION ---
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50); 

  // --- STATE DATA ---
  const [dateRange, setDateRange] = useState({
    start: '2026-01-01', 
    end: new Date().toISOString().split('T')[0]
  });

  const [masterCoa, setMasterCoa] = useState<any[]>([]);
  const [glRawData, setGlRawData] = useState<any[]>([]); 
  const [isClient, setIsClient] = useState(false);

  // --- DATA FETCHING ---
  const { data: apiData, loading } = useFetch<any>('/api/general-ledger');

  // --- ENGINE: LOAD DATA ---
  useEffect(() => {
    setIsClient(true);
    if (!apiData) return;

    try {
        // 1. Process COA
        const coaRows = apiData.coa || [];
        if (coaRows.length > 1) {
            const headers = coaRows[0].map((h:string) => h.trim());
            const coaObjs = coaRows.slice(1).map((row:any) => {
                let obj:any = {};
                headers.forEach((h:string, i:number) => obj[h] = row[i]);
                return obj;
            });
            setMasterCoa(coaObjs);
        }

        // 2. Process General Ledger
        const glRows = apiData.gl || [];
        const dataRows = glRows.slice(1);
        
        const formattedGL = dataRows.map((row: any) => ({
            journal_id: row[0],
            date: parseSheetDate(row[1]),
            account_code: String(row[2]),
            desc: row[3],
            debit: parseAmount(row[4]),
            credit: parseAmount(row[5]),
            ref_id: row[6]
        }));

        formattedGL.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        setGlRawData(formattedGL);

    } catch (err) {
        console.error("GL Calculation Error", err);
    }
  }, [apiData]);

  // --- SIDEBAR GROUPING ---
  const groupedCoa = useMemo(() => {
    const groups: Record<string, any[]> = {};
    const filtered = masterCoa.filter((c:any) => 
       (c.Account_Name||'').toLowerCase().includes(searchTerm.toLowerCase()) || 
       (c.Account_Code||'').includes(searchTerm)
    );
    filtered.forEach((acc:any) => {
       const cat = acc.Category || 'Uncategorized';
       if (!groups[cat]) groups[cat] = [];
       groups[cat].push(acc);
    });
    return Object.entries(groups).map(([category, accounts]) => ({ category, accounts }));
  }, [masterCoa, searchTerm]);

  // --- CALCULATION ENGINE ---
  const activeAccountInfo = masterCoa.find((c:any) => c.Account_Code === activeAccountCode);
  
  const fullLedgerData = useMemo(() => {
    if (!activeAccountCode) return { entries: [], totalDebit: 0, totalCredit: 0, finalBalance: 0, startBalance: 0 };

    const initialFromCOA = parseAmount(activeAccountInfo?.Opening_Balance || activeAccountInfo?.Saldo_Awal);
    const isNormalDebit = ['1','5','6','Harta','Beban','Asset','Expense'].some(p => activeAccountCode.startsWith(p) || (activeAccountInfo?.Type || '').includes(p));

    let runningBalance = initialFromCOA;
    let periodStartBalance = initialFromCOA; 
    
    let totalDebit = 0;
    let totalCredit = 0;
    let periodEntries: any[] = [];

    glRawData.forEach((j:any) => {
        if (j.account_code !== activeAccountCode) return;

        const debitAmount = j.debit || 0;
        const creditAmount = j.credit || 0;

        if (isNormalDebit) runningBalance += (debitAmount - creditAmount);
        else runningBalance += (creditAmount - debitAmount);

        if (j.date < dateRange.start) {
            periodStartBalance = runningBalance;
        } else if (j.date <= dateRange.end) {
            totalDebit += debitAmount;
            totalCredit += creditAmount;
            
            periodEntries.push({
                ...j,
                balance: runningBalance 
            });
        }
    });

    return { 
        entries: periodEntries, 
        totalDebit, 
        totalCredit, 
        finalBalance: runningBalance, 
        startBalance: periodStartBalance 
    };

  }, [glRawData, activeAccountCode, activeAccountInfo, dateRange]);

  // --- PAGINATION LOGIC ---
  const paginatedData = useMemo(() => {
      const startEntry = {
          journal_id: 'SYS-OPEN',
          date: dateRange.start,
          ref_id: '-',
          desc: 'Saldo Awal Periode (Opening Balance)',
          debit: 0,
          credit: 0,
          balance: fullLedgerData.startBalance,
          isSystemRow: true
      };

      const allRows = [startEntry, ...fullLedgerData.entries];
      const startIndex = (currentPage - 1) * itemsPerPage;
      const sliced = allRows.slice(startIndex, startIndex + itemsPerPage);
      
      return {
          rows: sliced,
          totalPages: Math.ceil(allRows.length / itemsPerPage),
          totalItems: allRows.length
      };
  }, [fullLedgerData, currentPage, itemsPerPage, dateRange.start]);

  useEffect(() => { setCurrentPage(1); }, [activeAccountCode, dateRange, itemsPerPage]);

  if (!isClient) return null;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col font-sans bg-slate-50/50">
      
      {/* HEADER PAGE */}
      <div className="px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="text-blue-600"/> Buku Besar
            {loading && <Loader2 className="animate-spin text-slate-400" size={16}/>}
          </h1>
          <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
            <ShieldCheck size={12} className="text-emerald-600"/> 
            Source: <span className="font-mono font-bold bg-slate-100 px-1 rounded">General_Ledger</span>
          </p>
        </div>
        
        <div className="flex gap-2">
           <button onClick={() => setShowMobileSidebar(!showMobileSidebar)} className="md:hidden px-3 py-2 bg-blue-50 text-blue-700 font-bold rounded-lg text-xs border border-blue-200">
             <List size={14}/> Akun
           </button>
           <button onClick={() => window.location.reload()} className="p-2 border rounded-lg hover:bg-slate-50 text-slate-600 bg-white" title="Sync Data"><RefreshCw size={16}/></button>
           <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 shadow-sm"><Download size={14}/> Export</button>
        </div>
      </div>

      {/* MAIN CONTENT WRAPPER */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* SIDEBAR COA (LEFT) */}
        <div className={`fixed inset-y-0 left-0 z-30 w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 md:relative md:translate-x-0 ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full'}`}>
           <div className="p-4 border-b border-slate-100 bg-slate-50">
              <div className="relative">
                 <Search className="absolute left-3 top-2.5 text-slate-400" size={14}/>
                 <input type="text" placeholder="Cari Akun..." className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white font-medium" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
              </div>
           </div>
           <div className="overflow-y-auto h-full pb-20 p-2 space-y-1">
              {loading ? <div className="p-4 text-center text-xs text-slate-400">Loading...</div> : groupedCoa.map((cat, idx) => (
                 <div key={idx} className="mb-2">
                    <h4 className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 rounded mb-1">{cat.category}</h4>
                    {cat.accounts.map((acc: any) => (
                        <button key={acc.Account_Code} onClick={() => { setActiveAccountCode(acc.Account_Code); setShowMobileSidebar(false); }} className={`w-full text-left px-3 py-2 rounded-md text-xs flex justify-between items-center transition-all ${activeAccountCode === acc.Account_Code ? 'bg-blue-600 text-white font-bold shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>
                            <span className="truncate w-40">{acc.Account_Name}</span>
                            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${activeAccountCode === acc.Account_Code ? 'bg-blue-500/50 text-white' : 'bg-slate-200 text-slate-500'}`}>{acc.Account_Code}</span>
                        </button>
                    ))}
                 </div>
              ))}
           </div>
        </div>

        {/* DATA TABLE (RIGHT) */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white w-full">
           
           {/* INFO BAR & FILTER */}
           <div className="px-6 py-4 border-b border-slate-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 bg-white">
              {/* Selected Account */}
              <div className="lg:col-span-2">
                 <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    {activeAccountInfo?.Account_Name || 'Pilih Akun'}
                    <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded border border-slate-200">{activeAccountCode}</span>
                 </h2>
                 <div className="flex gap-4 mt-2">
                    <div><p className="text-[10px] text-slate-400 font-bold uppercase">Saldo Awal</p><p className="text-sm font-bold text-amber-600">{fmtMoney(fullLedgerData.startBalance)}</p></div>
                    <div><p className="text-[10px] text-slate-400 font-bold uppercase">Mutasi Debit</p><p className="text-sm font-bold text-emerald-600">{fmtMoney(fullLedgerData.totalDebit)}</p></div>
                    <div><p className="text-[10px] text-slate-400 font-bold uppercase">Mutasi Kredit</p><p className="text-sm font-bold text-rose-600">{fmtMoney(fullLedgerData.totalCredit)}</p></div>
                 </div>
              </div>

              {/* Date Filter & Saldo Akhir */}
              <div className="lg:col-span-2 flex flex-col items-end justify-between">
                 <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                    <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="bg-transparent text-xs font-bold text-slate-600 px-2 outline-none cursor-pointer"/>
                    <span className="text-slate-300">|</span>
                    <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="bg-transparent text-xs font-bold text-slate-600 px-2 outline-none cursor-pointer"/>
                 </div>
                 <div className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-md text-right mt-2 w-full md:w-auto">
                    <p className="text-[10px] font-bold opacity-80 uppercase">Saldo Akhir</p>
                    <p className="text-lg font-bold">{fmtMoney(fullLedgerData.finalBalance)}</p>
                 </div>
              </div>
           </div>

           {/* TABLE AREA - FULL HEIGHT */}
           <div className="flex-1 overflow-auto bg-slate-50/30">
              <table className="w-full text-left text-xs min-w-[900px]">
                 <thead className="bg-slate-50 text-slate-500 font-bold sticky top-0 z-10 border-b border-slate-200 shadow-sm">
                    <tr>
                        <th className="px-4 py-3 w-[100px]">Tanggal</th>
                        <th className="px-4 py-3 w-[140px]">Journal ID <Lock size={10} className="inline ml-1 opacity-40"/></th>
                        <th className="px-4 py-3 w-[120px]">Ref ID</th>
                        <th className="px-4 py-3">Deskripsi</th>
                        <th className="px-4 py-3 text-right w-[120px]">Debit</th>
                        <th className="px-4 py-3 text-right w-[120px]">Kredit</th>
                        <th className="px-4 py-3 text-right w-[140px]">Saldo</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 bg-white">
                    {paginatedData.rows.length === 0 ? (
                       <tr><td colSpan={7} className="p-10 text-center text-slate-400 italic">Tidak ada transaksi.</td></tr>
                    ) : (
                       paginatedData.rows.map((row:any, idx:number) => (
                          <tr key={idx} className={`hover:bg-blue-50/50 transition-colors ${row.isSystemRow ? 'bg-amber-50 font-bold text-amber-900' : ''}`}>
                             <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.date}</td>
                             <td className="px-4 py-3 font-mono text-[10px] text-slate-500">{row.journal_id}</td>
                             <td className="px-4 py-3">
                                 {!row.isSystemRow && <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">{row.ref_id}</span>}
                             </td>
                             <td className="px-4 py-3 text-slate-700 truncate max-w-[300px]" title={row.desc}>{row.desc}</td>
                             <td className="px-4 py-3 text-right font-medium text-emerald-600">{row.debit > 0 ? fmtMoney(row.debit) : '-'}</td>
                             <td className="px-4 py-3 text-right font-medium text-rose-600">{row.credit > 0 ? fmtMoney(row.credit) : '-'}</td>
                             <td className="px-4 py-3 text-right font-bold text-slate-800 bg-slate-50/30">{fmtMoney(row.balance)}</td>
                          </tr>
                       ))
                    )}
                 </tbody>
              </table>
           </div>

           {/* PAGINATION FOOTER */}
           <div className="px-6 py-3 border-t border-slate-200 bg-white flex justify-between items-center text-xs">
                <div className="flex items-center gap-2 text-slate-500">
                    <span>Show:</span>
                    <select 
                        value={itemsPerPage} 
                        onChange={(e) => setItemsPerPage(Number(e.target.value))} 
                        className="bg-slate-50 border border-slate-200 rounded p-1 font-bold outline-none"
                    >
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={500}>500</option>
                    </select>
                    <span>Rows / Page</span>
                </div>

                <div className="flex items-center gap-4">
                    <span className="text-slate-500">
                        Page <b>{currentPage}</b> of <b>{paginatedData.totalPages}</b> (Total {paginatedData.totalItems})
                    </span>
                    <div className="flex gap-1">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 border rounded hover:bg-slate-50 disabled:opacity-50"><ChevronLeft size={14}/></button>
                        <button onClick={() => setCurrentPage(p => Math.min(paginatedData.totalPages, p + 1))} disabled={currentPage === paginatedData.totalPages} className="p-2 border rounded hover:bg-slate-50 disabled:opacity-50"><ChevronRight size={14}/></button>
                    </div>
                </div>
           </div>

        </div>
      </div>
    </div>
  );
}