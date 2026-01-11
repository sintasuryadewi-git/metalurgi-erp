'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, Calendar, Download, Printer, 
  ArrowUpRight, ArrowDownLeft, FileText, 
  ChevronRight, LayoutGrid, List, Filter, Loader2, RefreshCw, Calculator
} from 'lucide-react';

// Import Jembatan Google Sheets
import { fetchSheetData } from '@/lib/googleSheets';

// --- KONFIGURASI AKUN DEFAULT ---
const DEFAULT_ACCOUNTS = {
  AR: '1-1201', AP_TRADE: '2-1001', AP_EXPENSE: '2-1002', 
  BANK: '1-1002', SALES: '4-1001', INVENTORY: '1-1301'
};

export default function GeneralLedgerPage() {
  
  // --- STATE MANAGEMENT ---
  const [activeAccountCode, setActiveAccountCode] = useState<string>('1-1002'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  
  // FITUR: SALDO AWAL & FILTER TANGGAL
  const [initialBalance, setInitialBalance] = useState<number>(0);
  const [dateRange, setDateRange] = useState({
    start: '2025-01-01', 
    end: '2025-12-31'   
  });

  // --- RAW DATA ---
  const [masterCoa, setMasterCoa] = useState<any[]>([]);
  const [allJournals, setAllJournals] = useState<any[]>([]);

  // --- 1. FETCH & PROCESS ENGINE ---
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // A. Fetch Google Sheets Data
      const [coa, sales, purchase, expense, payment] = await Promise.all([
        fetchSheetData('Master_COA'),
        fetchSheetData('Trx_Sales_Invoice'),
        fetchSheetData('Trx_Purchase_Invoice'),
        fetchSheetData('Trx_Expense'),
        fetchSheetData('Trx_Payment')
      ]);

      setMasterCoa(coa as any[]);

      // --- LOCAL STORAGE DATA ---
      let overrides: Record<string, any[]> = {};
      let manualTrx: any[] = [];
      let posJournals: any[] = []; // [NEW] Variable for POS Data
      
      if (typeof window !== 'undefined') {
         // 1. Ambil Data Overrides
         const savedOverrides = localStorage.getItem('METALURGI_JOURNAL_OVERRIDES');
         if (savedOverrides) overrides = JSON.parse(savedOverrides);

         // 2. Ambil Data Manual Transactions
         const savedManuals = localStorage.getItem('METALURGI_MANUAL_TRX');
         if (savedManuals) manualTrx = JSON.parse(savedManuals);

         // 3. [NEW] Ambil Data POS Auto-Journals
         const savedPos = localStorage.getItem('METALURGI_GL_JOURNALS');
         if (savedPos) posJournals = JSON.parse(savedPos);
      }

      // Helper: Menentukan Akun (Default vs Override)
      const getAccounts = (id: string, defaultDebit: string, defaultCredit: string) => {
         if (overrides[id]) {
            const deb = overrides[id].find((j: any) => j.pos === 'Debit');
            const cred = overrides[id].find((j: any) => j.pos === 'Credit');
            return { 
                debit: deb ? deb.acc.code : defaultDebit, 
                credit: cred ? cred.acc.code : defaultCredit 
            };
         }
         return { debit: defaultDebit, credit: defaultCredit };
      };

      // --- JOURNAL GENERATION ENGINE ---
      let generatedJournals: any[] = [];

      // 1. Process Sales Sheet
      (sales as any[]).forEach(row => {
         const total = parseInt(row.Qty||0) * parseInt(row.Unit_Price||0);
         const accs = getAccounts(row.Inv_Number, DEFAULT_ACCOUNTS.AR, DEFAULT_ACCOUNTS.SALES);
         
         generatedJournals.push({
            date: row.Trx_Date, 
            ref: row.Inv_Number, 
            desc: `Penjualan ${row.Product_SKU}`,
            debit_acc: accs.debit, 
            credit_acc: accs.credit, 
            amount: total
         });
      });

      // 2. Process Purchase Sheet
      (purchase as any[]).forEach(row => {
         const total = parseInt(row.Qty||0) * parseInt(row.Unit_Cost||0);
         const accs = getAccounts(row.Bill_Number, DEFAULT_ACCOUNTS.INVENTORY, DEFAULT_ACCOUNTS.AP_TRADE);

         generatedJournals.push({
            date: row.Trx_Date, 
            ref: row.Bill_Number, 
            desc: `Pembelian ${row.Product_SKU}`,
            debit_acc: accs.debit, 
            credit_acc: accs.credit, 
            amount: total
         });
      });

      // 3. Process Expense Sheet
      (expense as any[]).forEach((row, idx) => {
         const id = `EXP-${idx+1}`; 
         const accs = getAccounts(id, row.Expense_Account || '6-xxxx', DEFAULT_ACCOUNTS.BANK);

         generatedJournals.push({
            date: row.Trx_Date, 
            ref: id, 
            desc: row.Desc,
            debit_acc: accs.debit, 
            credit_acc: accs.credit, 
            amount: parseInt(row.Amount||0)
         });
      });

      // 4. Process Payments Sheet
      (payment as any[]).forEach((row, idx) => {
         const id = `PAY-${idx}`; 
         const amount = parseInt(row.Amount||0);
         const bankAcc = row.Account_Code || DEFAULT_ACCOUNTS.BANK;
         
         if (row.Payment_Type === 'IN') {
            const accs = getAccounts(id, bankAcc, DEFAULT_ACCOUNTS.AR);
            generatedJournals.push({
               date: row.Trx_Date, 
               ref: `PAY-IN-${idx}`, 
               desc: `Terima Pembayaran ${row.Ref_Number}`,
               debit_acc: accs.debit, 
               credit_acc: accs.credit, 
               amount: amount
            });
         } else {
            const accs = getAccounts(id, DEFAULT_ACCOUNTS.AP_TRADE, bankAcc);
            generatedJournals.push({
               date: row.Trx_Date, 
               ref: `PAY-OUT-${idx}`, 
               desc: `Bayar Tagihan ${row.Ref_Number || row.Desc}`,
               debit_acc: accs.debit, 
               credit_acc: accs.credit, 
               amount: amount
            });
         }
      });

      // 5. PROCESS MANUAL TRANSACTIONS
      manualTrx.forEach((tx: any) => {
          let debit = '', credit = '';
          if (tx.type === 'sales') { debit = DEFAULT_ACCOUNTS.AR; credit = DEFAULT_ACCOUNTS.SALES; }
          else if (tx.type === 'purchase') { debit = DEFAULT_ACCOUNTS.INVENTORY; credit = DEFAULT_ACCOUNTS.AP_TRADE; }
          else if (tx.type === 'expense') { debit = '6-xxxx'; credit = DEFAULT_ACCOUNTS.BANK; }
          
          const accs = getAccounts(tx.id, debit, credit);
          
          generatedJournals.push({
             date: tx.date, 
             ref: tx.id, 
             desc: `(Manual) ${tx.desc}`,
             debit_acc: accs.debit, 
             credit_acc: accs.credit, 
             amount: tx.amount
          });
      });

      // 6. [NEW] PROCESS POS JOURNALS (INTEGRATION FIX)
      // Langsung gabungkan array jurnal POS ke dalam generatedJournals
      // Format data POS sudah { date, ref, desc, debit_acc, credit_acc, amount }
      generatedJournals = [...generatedJournals, ...posJournals];

      // Sort by Date (All Sources Combined)
      generatedJournals.sort((a, b) => a.date.localeCompare(b.date));
      setAllJournals(generatedJournals);

    } catch (err) {
      console.error("GL Calculation Error", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => { loadData(); }, [loadData]);

  // --- 2. GROUP COA FOR SIDEBAR ---
  const groupedCoa = useMemo(() => {
    const groups: Record<string, any[]> = {};
    const filtered = masterCoa.filter(c => 
       c.Account_Name.toLowerCase().includes(searchTerm.toLowerCase()) || 
       c.Account_Code.includes(searchTerm)
    );
    filtered.forEach(acc => {
       const cat = acc.Category || 'Uncategorized';
       if (!groups[cat]) groups[cat] = [];
       groups[cat].push(acc);
    });
    return Object.entries(groups).map(([category, accounts]) => ({ category, accounts }));
  }, [masterCoa, searchTerm]);

  // --- 3. FILTER LEDGER FOR SELECTED ACCOUNT ---
  const activeAccountInfo = masterCoa.find(c => c.Account_Code === activeAccountCode);
  
  const ledgerData = useMemo(() => {
    if (!activeAccountCode) return { entries: [], totalDebit: 0, totalCredit: 0, finalBalance: 0 };

    let runningBalance = initialBalance; 
    let totalDebit = 0;
    let totalCredit = 0;
    
    // Tentukan Normal Balance 
    const isNormalDebit = ['Asset', 'Expense', 'Harta', 'Beban', 'Cost of Goods Sold', 'HPP'].includes(activeAccountInfo?.Type || '');

    // Filter by Account AND Date Range
    const entries = allJournals
      .filter(j => 
        (j.debit_acc === activeAccountCode || j.credit_acc === activeAccountCode) &&
        (j.date >= dateRange.start && j.date <= dateRange.end) 
      )
      .map(j => {
         const isDebit = j.debit_acc === activeAccountCode;
         const debitAmount = isDebit ? j.amount : 0;
         const creditAmount = !isDebit ? j.amount : 0;

         // Hitung Mutasi
         if (isNormalDebit) runningBalance += (debitAmount - creditAmount);
         else runningBalance += (creditAmount - debitAmount);

         totalDebit += debitAmount;
         totalCredit += creditAmount;

         return { ...j, debit: debitAmount, credit: creditAmount, balance: runningBalance };
      });

    return { entries, totalDebit, totalCredit, finalBalance: runningBalance };
  }, [allJournals, activeAccountCode, activeAccountInfo, initialBalance, dateRange]);

  const fmtMoney = (n: number) => "Rp " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return (
    <div className="pb-20 h-[calc(100vh-6rem)] flex flex-col">
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="text-blue-600"/> Buku Besar (General Ledger)
            {loading && <Loader2 className="animate-spin text-slate-400" size={18}/>}
          </h1>
          <p className="text-slate-500 text-sm mt-1">Detail mutasi dan saldo per akun akuntansi (Integrated: Sheets + Manual + POS).</p>
        </div>
        <div className="flex gap-2">
           <button onClick={loadData} className="p-2 border rounded-lg hover:bg-slate-50 text-slate-600 bg-white" title="Refresh Data">
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''}/>
           </button>
           <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50">
             <Download size={16}/> Export Excel
           </button>
        </div>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        
        {/* LEFT SIDEBAR: COA NAVIGATOR */}
        <div className="w-80 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-sm">
           <div className="p-4 border-b border-slate-100 bg-slate-50">
              <div className="relative">
                 <Search className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                 <input 
                    type="text" placeholder="Cari Akun..." 
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                 />
              </div>
           </div>
           
           <div className="flex-1 overflow-y-auto p-2 space-y-4">
              {loading ? (
                 <div className="p-4 text-center text-slate-400 text-sm"><Loader2 className="animate-spin mx-auto mb-2"/> Loading COA...</div>
              ) : groupedCoa.map((cat, idx) => (
                 <div key={idx}>
                    <h4 className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{cat.category}</h4>
                    <div className="space-y-0.5">
                       {cat.accounts.map((acc: any) => (
                          <button 
                            key={acc.Account_Code}
                            onClick={() => { setActiveAccountCode(acc.Account_Code); setInitialBalance(0); }} 
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between items-center transition-all ${
                               activeAccountCode === acc.Account_Code 
                               ? 'bg-blue-50 text-blue-700 font-bold ring-1 ring-blue-200' 
                               : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                            }`}
                          >
                             <span>{acc.Account_Name}</span>
                             <span className="text-[10px] font-mono opacity-50">{acc.Account_Code}</span>
                          </button>
                       ))}
                    </div>
                 </div>
              ))}
           </div>
        </div>

        {/* RIGHT CONTENT: LEDGER TABLE */}
        <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
           
           {/* Ledger Header & Controls */}
           <div className="p-6 border-b border-slate-100 bg-white space-y-4">
              <div className="flex justify-between items-start">
                 <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold text-slate-800">{activeAccountInfo?.Account_Name || 'Pilih Akun'}</h2>
                    <span className="bg-slate-100 text-slate-500 text-xs font-mono px-2 py-0.5 rounded font-bold">{activeAccountCode}</span>
                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border`}>Type: {activeAccountInfo?.Type}</span>
                 </div>
                 
                 <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] font-bold text-slate-400 uppercase ml-2">Periode:</span>
                    <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="text-xs bg-white border rounded px-2 py-1 text-slate-600"/>
                    <span className="text-slate-400">-</span>
                    <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="text-xs bg-white border rounded px-2 py-1 text-slate-600"/>
                 </div>
              </div>

              <div className="flex items-center gap-4">
                 
                 <div className="px-4 py-2 bg-amber-50 rounded-xl border border-amber-100 flex items-center gap-3">
                    <div>
                       <p className="text-[10px] text-amber-600 font-bold uppercase flex items-center gap-1"><Calculator size={10}/> Saldo Awal</p>
                       <div className="flex items-center gap-1">
                          <span className="text-xs text-amber-700 font-bold">Rp</span>
                          <input 
                             type="number" 
                             className="bg-transparent border-b border-amber-300 w-28 text-sm font-bold text-amber-800 outline-none focus:border-amber-600"
                             value={initialBalance}
                             onChange={(e) => setInitialBalance(parseInt(e.target.value) || 0)}
                             placeholder="0"
                          />
                       </div>
                    </div>
                 </div>

                 <div className="h-8 w-px bg-slate-200"></div>

                 <div className="px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Mutasi Debit</p>
                    <p className="font-bold text-emerald-600">{fmtMoney(ledgerData.totalDebit)}</p>
                 </div>
                 <div className="px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Mutasi Kredit</p>
                    <p className="font-bold text-rose-600">{fmtMoney(ledgerData.totalCredit)}</p>
                 </div>
                 <div className="px-3 py-1.5 bg-blue-600 rounded-lg border border-blue-600 shadow-md">
                    <p className="text-[10px] text-blue-100 font-bold uppercase">Saldo Akhir</p>
                    <p className="font-bold text-white">{fmtMoney(ledgerData.finalBalance)}</p>
                 </div>
              </div>
           </div>

           {/* Table Area */}
           <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-sm">
                 <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 z-10 border-b border-slate-100">
                    <tr>
                       <th className="p-4 w-[15%]">Tanggal</th>
                       <th className="p-4 w-[15%]">No. Ref</th>
                       <th className="p-4 w-[30%]">Deskripsi</th>
                       <th className="p-4 w-[15%] text-right text-emerald-600">Debit</th>
                       <th className="p-4 w-[15%] text-right text-rose-600">Kredit</th>
                       <th className="p-4 w-[10%] text-right text-slate-800">Saldo</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {loading ? (
                        <tr><td colSpan={6} className="p-20 text-center"><Loader2 className="animate-spin mx-auto text-blue-600 mb-2"/> Menghitung Jurnal...</td></tr>
                    ) : ledgerData.entries.length === 0 ? (
                       <tr><td colSpan={6} className="p-10 text-center text-slate-400">Belum ada transaksi di periode ini.</td></tr>
                    ) : (
                       ledgerData.entries.map((row, idx) => (
                          <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                             <td className="p-4 text-slate-600 font-medium">{row.date}</td>
                             <td className="p-4">
                                <span className="font-mono text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded cursor-pointer hover:bg-blue-100 hover:text-blue-600 flex items-center w-fit gap-1">
                                   {row.ref}
                                </span>
                             </td>
                             <td className="p-4 text-slate-700">{row.desc}</td>
                             <td className="p-4 text-right font-medium text-emerald-600">
                                {row.debit > 0 ? fmtMoney(row.debit) : '-'}
                             </td>
                             <td className="p-4 text-right font-medium text-rose-600">
                                {row.credit > 0 ? fmtMoney(row.credit) : '-'}
                             </td>
                             <td className="p-4 text-right font-bold text-slate-800 bg-slate-50/50">
                                {fmtMoney(row.balance)}
                             </td>
                          </tr>
                       ))
                    )}
                 </tbody>
              </table>
           </div>
        </div>

      </div>
    </div>
  );
}