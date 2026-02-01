'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Search, Calendar, Download, FileText, 
  ChevronRight, List, Loader2, RefreshCw, Calculator, Filter
} from 'lucide-react';

import { useFetch } from '@/hooks/useFetch'; 

// --- KONFIGURASI AKUN STANDAR ---
const ACC = {
  AR: '1-1201', AP: '2-1001', BANK: '1-1002', KAS: '1-1001',
  SALES: '4-1001', INVENTORY: '1-1301', HPP: '5-1001', EXP_DEFAULT: '6-0000'
};

const fmtMoney = (n: number) => "Rp " + n.toLocaleString('id-ID');

const parseAmount = (val: any) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const clean = val.toString().replace(/[^0-9.-]+/g, ""); 
    return parseFloat(clean) || 0;
};

export default function GeneralLedgerPage() {
  
  // --- STATE ---
  const [activeAccountCode, setActiveAccountCode] = useState<string>('1-1001'); 
  const [searchTerm, setSearchTerm] = useState('');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false); 
  
  // Filter Tanggal
  const [dateRange, setDateRange] = useState({
    start: '2026-01-01', // Default awal tahun ini
    end: new Date().toISOString().split('T')[0]
  });

  const [masterCoa, setMasterCoa] = useState<any[]>([]);
  const [allJournals, setAllJournals] = useState<any[]>([]);
  const [isClient, setIsClient] = useState(false);

  // --- DATA FETCHING ---
  const { data: apiData, loading } = useFetch<any>('/api/general-ledger');

  const processSheetData = (rows: any[]) => {
      if (!rows || rows.length < 2) return [];
      const headers = rows[0].map((h: string) => h.trim()); 
      return rows.slice(1).map((row) => {
          let obj: any = {};
          headers.forEach((header: string, index: number) => {
              obj[header] = row[index] || ''; 
          });
          return obj;
      });
  };

  // --- ENGINE: CONSOLIDATION (SERVER + POS) ---
  useEffect(() => {
    setIsClient(true);
    if (!apiData) return;

    try {
        const coa = processSheetData(apiData.coa);
        setMasterCoa(coa);

        const sales = processSheetData(apiData.sales);
        const purchase = processSheetData(apiData.purchases);
        const expense = processSheetData(apiData.expenses);
        const payment = processSheetData(apiData.payments);
        const products = processSheetData(apiData.products); 

        // Load Local Data
        let overrides: Record<string, any[]> = {};
        let manualTrx: any[] = [];
        let posTrx: any[] = []; 
        
        if (typeof window !== 'undefined') {
           const savedOverrides = localStorage.getItem('METALURGI_JOURNAL_OVERRIDES');
           if (savedOverrides) overrides = JSON.parse(savedOverrides);

           const savedManuals = localStorage.getItem('METALURGI_MANUAL_TRX');
           if (savedManuals) manualTrx = JSON.parse(savedManuals);

           const savedPosTrx = localStorage.getItem('METALURGI_POS_TRX');
           if (savedPosTrx) posTrx = JSON.parse(savedPosTrx);
        }

        const getAccounts = (id: string, defDebit: string, defCredit: string) => {
           if (overrides[id]) {
              const deb = overrides[id].find((j: any) => j.pos === 'Debit');
              const cred = overrides[id].find((j: any) => j.pos === 'Credit');
              return { debit: deb ? deb.acc.code : defDebit, credit: cred ? cred.acc.code : defCredit };
           }
           return { debit: defDebit, credit: defCredit };
        };

        let generatedJournals: any[] = [];

        // 1. SALES (Server)
        sales.forEach((r: any) => {
           const total = parseAmount(r.Qty) * parseAmount(r.Unit_Price);
           const accs = getAccounts(r.Inv_Number, ACC.AR, ACC.SALES);
           generatedJournals.push({ date: r.Trx_Date, ref: r.Inv_Number, desc: `Sales Invoice`, debit_acc: accs.debit, credit_acc: accs.credit, amount: total });
           
           const prod = products.find((p:any) => p.SKU === r.Product_SKU);
           const cost = parseAmount(prod?.Std_Cost_Budget);
           if(cost > 0) {
               generatedJournals.push({ date: r.Trx_Date, ref: r.Inv_Number, desc: `COGS`, debit_acc: ACC.HPP, credit_acc: ACC.INVENTORY, amount: cost * parseAmount(r.Qty) });
           }
        });

        // 2. PURCHASE (Server)
        purchase.forEach((r: any) => {
           const total = parseAmount(r.Qty) * parseAmount(r.Unit_Cost);
           const accs = getAccounts(r.Bill_Number, ACC.INVENTORY, ACC.AP);
           generatedJournals.push({ date: r.Trx_Date, ref: r.Bill_Number, desc: `Purchase Stock`, debit_acc: accs.debit, credit_acc: accs.credit, amount: total });
        });

        // 3. EXPENSE (Server)
        expense.forEach((r: any, idx: number) => {
           const id = `EXP-${idx+1}`; 
           const amount = parseAmount(r.Amount);
           const accs = getAccounts(id, r.Expense_Account || ACC.EXP_DEFAULT, ACC.BANK);
           if (amount > 0) {
               generatedJournals.push({ date: r.Trx_Date, ref: id, desc: r.Desc, debit_acc: accs.debit, credit_acc: accs.credit, amount: amount });
           }
        });

        // 4. PAYMENT (Server)
        payment.forEach((r: any, idx: number) => {
           const id = `PAY-${idx}`; 
           const amt = parseAmount(r.Amount);
           const bank = r.Account_Code || ACC.BANK;
           if(r.Payment_Type === 'IN') {
              const accs = getAccounts(id, bank, ACC.AR);
              generatedJournals.push({ date: r.Trx_Date, ref: id, desc: `Payment In`, debit_acc: accs.debit, credit_acc: accs.credit, amount: amt });
           } else {
              const accs = getAccounts(id, ACC.AP, bank);
              generatedJournals.push({ date: r.Trx_Date, ref: id, desc: `Payment Out`, debit_acc: accs.debit, credit_acc: accs.credit, amount: amt });
           }
        });

        // 5. MANUAL TRX
        manualTrx.forEach((tx: any) => {
            let debit = '', credit = '';
            if (tx.type === 'sales') { debit = ACC.AR; credit = ACC.SALES; }
            else if (tx.type === 'purchase') { debit = ACC.INVENTORY; credit = ACC.AP; }
            else if (tx.type === 'expense') { debit = ACC.EXP_DEFAULT; credit = ACC.BANK; }
            const accs = getAccounts(tx.id, debit, credit);
            generatedJournals.push({ date: tx.date, ref: tx.id, desc: `Manual: ${tx.desc}`, debit_acc: accs.debit, credit_acc: accs.credit, amount: tx.amount });
        });

        // 6. POS TRANSACTIONS
        posTrx.forEach((trx: any) => {
            const isCash = !trx.paymentMethod || trx.paymentMethod === 'Cash';
            const debitAcc = isCash ? ACC.KAS : ACC.BANK;
            
            generatedJournals.push({
                date: trx.date, ref: trx.id, 
                desc: `POS Sales (${trx.items.length} items)`,
                debit_acc: debitAcc, credit_acc: ACC.SALES, 
                amount: parseFloat(trx.total || 0)
            });

            trx.items.forEach((item: any) => {
                const prod = products.find((p:any) => p.SKU === item.sku);
                const unitCost = parseAmount(prod?.Std_Cost_Budget);
                if (unitCost > 0) {
                    generatedJournals.push({
                        date: trx.date, ref: trx.id, 
                        desc: `Cost: ${item.name}`,
                        debit_acc: ACC.HPP, credit_acc: ACC.INVENTORY,
                        amount: unitCost * item.qty
                    });
                }
            });
        });
        
        generatedJournals.sort((a, b) => a.date.localeCompare(b.date));
        setAllJournals(generatedJournals);

    } catch (err) {
        console.error("GL Calculation Error", err);
    }
  }, [apiData]);

  // --- GROUP COA FOR SIDEBAR ---
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

  // --- FILTER LEDGER FOR SELECTED ACCOUNT ---
  const activeAccountInfo = masterCoa.find((c:any) => c.Account_Code === activeAccountCode);
  
  const ledgerData = useMemo(() => {
    if (!activeAccountCode) return { entries: [], totalDebit: 0, totalCredit: 0, finalBalance: 0, startBalance: 0 };

    // 1. Ambil Saldo Awal dari Master COA
    const initialFromCOA = parseAmount(activeAccountInfo?.Opening_Balance || activeAccountInfo?.Saldo_Awal);
    
    // Tentukan Normal Balance
    const isNormalDebit = ['1','5','6','Harta','Beban'].some(p => activeAccountCode.startsWith(p) || activeAccountInfo?.Type?.includes(p));

    // 2. Logic Running Balance "Carry Over"
    // Kita harus hitung dari awal waktu sampai hari ini, tapi pisahkan mana yg "Saldo Awal" mana yg "Mutasi Periode Ini"
    
    let runningBalance = initialFromCOA;
    let periodStartBalance = initialFromCOA; // Ini saldo per tanggal start filter
    
    let totalDebit = 0;
    let totalCredit = 0;
    let displayEntries: any[] = [];

    // Loop SEMUA jurnal (sudah urut tanggal)
    allJournals.forEach((j:any) => {
        // Cek apakah jurnal ini melibatkan akun aktif
        const isDebit = j.debit_acc === activeAccountCode;
        const isCredit = j.credit_acc === activeAccountCode;

        if (!isDebit && !isCredit) return;

        const amount = j.amount || 0;
        const debitAmount = isDebit ? amount : 0;
        const creditAmount = isCredit ? amount : 0;

        // Update Running Balance Global
        if (isNormalDebit) runningBalance += (debitAmount - creditAmount);
        else runningBalance += (creditAmount - debitAmount);

        // Logic Pemisahan Periode
        if (j.date < dateRange.start) {
            // Transaksi MASA LALU -> Update saldo awal periode saja
            periodStartBalance = runningBalance;
        } else if (j.date <= dateRange.end) {
            // Transaksi DALAM PERIODE -> Masukkan ke tabel
            totalDebit += debitAmount;
            totalCredit += creditAmount;
            
            displayEntries.push({
                ...j,
                debit: debitAmount,
                credit: creditAmount,
                balance: runningBalance
            });
        }
    });

    // Tambahkan "Saldo Awal Periode" sebagai baris pertama
    const entriesWithOpening = [
        {
            date: dateRange.start,
            ref: '-',
            desc: 'Saldo Awal Periode (Opening Balance)',
            debit: 0,
            credit: 0,
            balance: periodStartBalance,
            isSystemRow: true
        },
        ...displayEntries
    ];

    return { 
        entries: entriesWithOpening, 
        totalDebit, 
        totalCredit, 
        finalBalance: runningBalance, 
        startBalance: periodStartBalance 
    };

  }, [allJournals, activeAccountCode, activeAccountInfo, dateRange]);

  if (!isClient) return null;

  return (
    <div className="pb-20 h-[calc(100vh-6rem)] flex flex-col font-sans">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="text-blue-600"/> Buku Besar
            {loading && <Loader2 className="animate-spin text-slate-400" size={18}/>}
          </h1>
          <p className="text-slate-500 text-xs mt-1">Detail mutasi & saldo per akun (Real-time Integration).</p>
        </div>
        
        <div className="flex gap-2 w-full md:w-auto">
           <button onClick={() => setShowMobileSidebar(!showMobileSidebar)} className="md:hidden flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 text-blue-700 font-bold rounded-lg border border-blue-200 text-sm">
             <List size={16}/> {showMobileSidebar ? 'Tutup Akun' : 'Pilih Akun'}
           </button>
           <button onClick={() => window.location.reload()} className="p-2 border rounded-lg hover:bg-slate-50 text-slate-600 bg-white" title="Refresh Data"><RefreshCw size={20}/></button>
           <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50"><Download size={16}/> <span className="hidden md:inline">Export</span></button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex flex-col md:flex-row flex-1 gap-6 overflow-hidden relative">
        
        {/* SIDEBAR COA */}
        <div className={`absolute md:relative z-20 top-0 left-0 h-full w-full md:w-80 bg-white rounded-2xl border border-slate-200 flex flex-col overflow-hidden shadow-lg md:shadow-sm transition-transform duration-300 ${showMobileSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
           <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div className="relative flex-1 mr-2">
                 <Search className="absolute left-3 top-2.5 text-slate-400" size={16}/>
                 <input type="text" placeholder="Cari Akun..." className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}/>
              </div>
              <button onClick={() => setShowMobileSidebar(false)} className="md:hidden p-2 bg-slate-200 rounded-full"><ChevronRight size={16}/></button>
           </div>
           
           <div className="flex-1 overflow-y-auto p-2 space-y-4">
              {loading ? (
                 <div className="p-4 text-center text-slate-400 text-sm"><Loader2 className="animate-spin mx-auto mb-2"/> Loading COA...</div>
              ) : groupedCoa.map((cat, idx) => (
                 <div key={idx}>
                    <h4 className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{cat.category}</h4>
                    <div className="space-y-0.5">
                       {cat.accounts.map((acc: any) => (
                          <button key={acc.Account_Code} onClick={() => { setActiveAccountCode(acc.Account_Code); setShowMobileSidebar(false); }} className={`w-full text-left px-3 py-3 md:py-2 rounded-lg text-sm flex justify-between items-center transition-all ${activeAccountCode === acc.Account_Code ? 'bg-blue-50 text-blue-700 font-bold ring-1 ring-blue-200' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                             <span>{acc.Account_Name}</span><span className="text-[10px] font-mono opacity-50">{acc.Account_Code}</span>
                          </button>
                       ))}
                    </div>
                 </div>
              ))}
           </div>
        </div>

        {/* RIGHT CONTENT: LEDGER TABLE */}
        <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden w-full">
           <div className="p-4 md:p-6 border-b border-slate-100 bg-white space-y-4">
              <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                 <div className="flex flex-col gap-1">
                    <h2 className="text-lg md:text-xl font-bold text-slate-800">{activeAccountInfo?.Account_Name || 'Pilih Akun'}</h2>
                    <div className="flex gap-2"><span className="bg-slate-100 text-slate-500 text-xs font-mono px-2 py-0.5 rounded font-bold">{activeAccountCode}</span><span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border`}>{activeAccountInfo?.Type || '-'}</span></div>
                 </div>
                 
                 <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200 w-full md:w-auto">
                    <span className="text-[10px] font-bold text-slate-400 uppercase ml-2 hidden md:inline">Periode:</span>
                    <input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="text-xs bg-white border rounded px-2 py-2 text-slate-600 flex-1"/>
                    <span className="text-slate-400">-</span>
                    <input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="text-xs bg-white border rounded px-2 py-2 text-slate-600 flex-1"/>
                 </div>
              </div>

              <div className="flex overflow-x-auto gap-4 pb-2 md:pb-0 items-center no-scrollbar">
                 <div className="px-4 py-2 bg-amber-50 rounded-xl border border-amber-100 flex-shrink-0">
                    <p className="text-[10px] text-amber-600 font-bold uppercase flex items-center gap-1"><Calculator size={10}/> Saldo Awal</p>
                    <div className="flex items-center gap-1 mt-1"><span className="text-xs text-amber-700 font-bold">Rp</span><p className="text-sm font-bold text-amber-800">{fmtMoney(ledgerData.startBalance).replace('Rp ', '')}</p></div>
                 </div>
                 <div className="h-8 w-px bg-slate-200 hidden md:block"></div>
                 <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0"><p className="text-[10px] text-slate-400 font-bold uppercase">Mutasi Debit</p><p className="font-bold text-emerald-600 text-sm">{fmtMoney(ledgerData.totalDebit)}</p></div>
                 <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 flex-shrink-0"><p className="text-[10px] text-slate-400 font-bold uppercase">Mutasi Kredit</p><p className="font-bold text-rose-600 text-sm">{fmtMoney(ledgerData.totalCredit)}</p></div>
                 <div className="px-3 py-2 bg-blue-600 rounded-lg border border-blue-600 shadow-md flex-shrink-0"><p className="text-[10px] text-blue-100 font-bold uppercase">Saldo Akhir</p><p className="font-bold text-white text-sm">{fmtMoney(ledgerData.finalBalance)}</p></div>
              </div>
           </div>

           <div className="flex-1 overflow-auto bg-slate-50/30">
              <table className="w-full text-left text-sm min-w-[600px]">
                 <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold sticky top-0 z-10 border-b border-slate-100 shadow-sm">
                    <tr><th className="p-4 w-[15%]">Tanggal</th><th className="p-4 w-[15%]">No. Ref</th><th className="p-4 w-[30%]">Deskripsi</th><th className="p-4 w-[15%] text-right text-emerald-600">Debit</th><th className="p-4 w-[15%] text-right text-rose-600">Kredit</th><th className="p-4 w-[10%] text-right text-slate-800">Saldo</th></tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 bg-white">
                    {ledgerData.entries.length === 0 ? (
                       <tr><td colSpan={6} className="p-10 text-center text-slate-400 italic">Belum ada transaksi di periode ini.</td></tr>
                    ) : (
                       ledgerData.entries.map((row:any, idx:number) => (
                          <tr key={idx} className={`transition-colors group ${row.isSystemRow ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-blue-50/30'}`}>
                             <td className="p-4 text-slate-600 font-medium whitespace-nowrap">{row.date}</td>
                             <td className="p-4"><span className={`font-mono text-[10px] px-1.5 py-0.5 rounded flex items-center w-fit gap-1 whitespace-nowrap ${row.isSystemRow ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{row.ref}</span></td>
                             <td className={`p-4 min-w-[200px] ${row.isSystemRow ? 'font-bold text-amber-800 italic' : 'text-slate-700'}`}>{row.desc}</td>
                             <td className="p-4 text-right font-medium text-emerald-600 whitespace-nowrap">{row.debit > 0 ? fmtMoney(row.debit) : '-'}</td>
                             <td className="p-4 text-right font-medium text-rose-600 whitespace-nowrap">{row.credit > 0 ? fmtMoney(row.credit) : '-'}</td>
                             <td className="p-4 text-right font-bold text-slate-800 bg-slate-50/50 whitespace-nowrap">{fmtMoney(row.balance)}</td>
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