'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  Printer, Calendar, Download, TrendingUp, TrendingDown, Activity, 
  PieChart as PieIcon, BarChart3, Loader2, Users, Wallet, DollarSign,
  ArrowUpRight, ArrowDownRight, Target, CreditCard, LayoutGrid, Percent,
  FileSpreadsheet, AlertTriangle, CheckCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { 
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, BarChart, Bar, AreaChart, Area
} from 'recharts';
import { useFetch } from '@/hooks/useFetch';

// --- 1. GLOBAL HELPERS & CONSTANTS ---

const COLORS = {
  primary: '#3b82f6', success: '#10b981', warning: '#f59e0b', danger: '#ef4444', 
  purple: '#8b5cf6', dark: '#1e293b', grid: '#e2e8f0'
};

const fmtMoney = (n: number) => "Rp " + (n || 0).toLocaleString('id-ID');
const fmtCompact = (n: number) => {
    if (!n) return "0";
    if (Math.abs(n) >= 1000000000) return (n / 1000000000).toFixed(1) + "M";
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + "Jt";
    return (n / 1000).toFixed(0) + "K";
};

// Helper Kuat untuk Parse Angka (Anti NaN)
const parseAmount = (val: any) => {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return val;
    // Hapus semua karakter kecuali angka dan minus
    const clean = val.toString().replace(/[^0-9.-]+/g, ""); 
    const result = parseFloat(clean);
    return isNaN(result) ? 0 : result;
};

// AKUN STANDARD (FIXED TYPO)
const ACC = {
  AR: '1-1201', AP: '2-1001', BANK: '1-1002', KAS: '1-1001',
  SALES: '4-1001', INVENTORY: '1-1301', HPP: '5-1001', EXP_DEFAULT: '6-0000'
};

// --- 2. MAIN COMPONENT ---

export default function ReportsPage() {
  
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'TB' | 'PL' | 'BS'>('DASHBOARD');
  
  const currentYear = new Date().getFullYear();
  const [filterType, setFilterType] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [isClient, setIsClient] = useState(false);
  
  // DATA STATES
  const [glData, setGlData] = useState<any[]>([]); 
  const [coaList, setCoaList] = useState<any[]>([]);
  const [trxData, setTrxData] = useState<any[]>([]);

  // FETCH DATA
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

  // --- ENGINE 1: DATA CONSOLIDATION ---
  useEffect(() => {
    setIsClient(true);
    if (!apiData) return;

    try {
        const coa = processSheetData(apiData.coa);
        setCoaList(coa);

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

        let journals: any[] = [];

        // 1. SERVER SALES
        sales.forEach((r: any) => {
           const total = parseAmount(r.Qty) * parseAmount(r.Unit_Price);
           journals.push({ date: r.Trx_Date, desc: `Sales ${r.Inv_Number}`, debit_acc: ACC.AR, credit_acc: ACC.SALES, amount: total });
           
           const prod = products.find((p:any) => p.SKU === r.Product_SKU);
           const cost = parseAmount(prod?.Std_Cost_Budget);
           if(cost > 0) {
               journals.push({ date: r.Trx_Date, desc: `COGS ${r.Inv_Number}`, debit_acc: ACC.HPP, credit_acc: ACC.INVENTORY, amount: cost * parseAmount(r.Qty) });
           }
        });

        // 2. SERVER PURCHASE (Fixed TYPO: ACC.INVENTORY)
        purchase.forEach((r: any) => {
           const total = parseAmount(r.Qty) * parseAmount(r.Unit_Cost);
           journals.push({ date: r.Trx_Date, desc: `Purchase ${r.Bill_Number}`, debit_acc: ACC.INVENTORY, credit_acc: ACC.AP, amount: total });
        });

        // 3. SERVER EXPENSE
        expense.forEach((r: any, idx: number) => {
           const amount = parseAmount(r.Amount); 
           if (amount > 0) {
               journals.push({ date: r.Trx_Date, desc: r.Desc, debit_acc: r.Expense_Account || ACC.EXP_DEFAULT, credit_acc: ACC.BANK, amount: amount });
           }
        });

        // 4. SERVER PAYMENT
        payment.forEach((r: any, idx: number) => {
            const amt = parseAmount(r.Amount);
            const bank = r.Account_Code || ACC.BANK;
            if(r.Payment_Type === 'IN') journals.push({ date: r.Trx_Date, desc: 'Payment In', debit_acc: bank, credit_acc: ACC.AR, amount: amt });
            else journals.push({ date: r.Trx_Date, desc: 'Payment Out', debit_acc: ACC.AP, credit_acc: bank, amount: amt });
        });

        // 5. MANUAL TRX (Fixed TYPO: ACC.INVENTORY)
        manualTrx.forEach((tx: any) => {
            let debit = '', credit = '';
            if (tx.type === 'sales') { debit = ACC.AR; credit = ACC.SALES; }
            else if (tx.type === 'purchase') { debit = ACC.INVENTORY; credit = ACC.AP; }
            else if (tx.type === 'expense') { debit = ACC.EXP_DEFAULT; credit = ACC.BANK; }
            const accs = getAccounts(tx.id, debit, credit);
            journals.push({ date: tx.date, desc: `(Manual) ${tx.desc}`, debit_acc: accs.debit, credit_acc: accs.credit, amount: tx.amount });
        });

        // 6. POS TRX (Reconstruct Jurnal)
        posTrx.forEach((trx: any) => {
            const isCash = !trx.paymentMethod || trx.paymentMethod === 'Cash';
            const debitAcc = isCash ? ACC.KAS : ACC.BANK;
            journals.push({ 
                date: trx.date, desc: `POS Sales ${trx.id}`, 
                debit_acc: debitAcc, credit_acc: ACC.SALES, 
                amount: parseFloat(trx.total || 0) 
            });

            trx.items.forEach((item: any) => {
                const prod = products.find((p:any) => p.SKU === item.sku);
                const unitCost = parseAmount(prod?.Std_Cost_Budget);
                if (unitCost > 0) {
                    journals.push({
                        date: trx.date, desc: `POS COGS ${item.sku}`,
                        debit_acc: ACC.HPP, credit_acc: ACC.INVENTORY,
                        amount: unitCost * item.qty
                    });
                }
            });
        });
        
        setGlData(journals);

        const mappedPosTrx = posTrx.map((p: any) => ({
            id: p.id, amount: p.total, amountPaid: p.total, status: 'Fully Paid', type: 'sales'
        }));
        setTrxData([...manualTrx, ...mappedPosTrx]);

    } catch (err) { console.error("Consolidation Error:", err); }
  }, [apiData]);

  // --- ENGINE 2: TRIAL BALANCE & REPORTS ---
  const reportData = useMemo(() => {
      let startDate = '', endDate = '';
      if (filterType === 'MONTHLY') {
          startDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
          const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
          endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${lastDay}`;
      } else {
          startDate = `${selectedYear}-01-01`;
          endDate = `${selectedYear}-12-31`;
      }

      // TB Container
      const tb: Record<string, any> = {};

      const getAcc = (code: string) => {
          if (!code) return null;
          if (!tb[code]) {
              const meta = coaList.find(c => c.Account_Code == code);
              // FIX: Pakai parseAmount untuk hindari NaN dari saldo awal
              const initial = parseAmount(meta?.Opening_Balance || meta?.Saldo_Awal); 
              tb[code] = { 
                  code, name: meta?.Account_Name || `Account ${code}`, 
                  initial: initial, 
                  debit: 0, credit: 0, movement: 0, ending: 0 
              };
          }
          return tb[code];
      };

      // Init COA
      coaList.forEach(c => getAcc(c.Account_Code));

      // Process Journals
      glData.forEach((j:any) => {
          const amt = j.amount || 0;
          const isPeriod = j.date >= startDate && j.date <= endDate;
          const isHistory = j.date < startDate; 
          
          const accD = getAcc(j.debit_acc);
          if (accD) {
              const isNormalDebit = ['1','5','6','7','8','9'].some(p => accD.code.startsWith(p));
              if (isHistory) accD.initial += (isNormalDebit ? amt : -amt);
              if (isPeriod) accD.debit += amt;
          }
          const accC = getAcc(j.credit_acc);
          if (accC) {
              const isNormalDebit = ['1','5','6','7','8','9'].some(p => accC.code.startsWith(p));
              if (isHistory) accC.initial += (isNormalDebit ? -amt : amt);
              if (isPeriod) accC.credit += amt;
          }
      });

      // Calc Movement
      let totalDebitCheck = 0;
      let totalCreditCheck = 0;

      Object.values(tb).forEach((acc:any) => {
          const isNormalDebit = ['1','5','6','7','8','9'].some(p => acc.code.startsWith(p));
          if (isNormalDebit) acc.movement = acc.debit - acc.credit;
          else acc.movement = acc.credit - acc.debit;
          acc.ending = acc.initial + acc.movement;

          if(isNormalDebit) totalDebitCheck += acc.ending;
          else totalCreditCheck += acc.ending;
      });

      const isBalanced = Math.abs(totalDebitCheck - totalCreditCheck) < 100;

      // --- MAPPING ---
      const tbArr = Object.values(tb).sort((a:any,b:any) => a.code.localeCompare(b.code));

      // P&L
      const revenue = tbArr.filter(a => a.code.startsWith('4') && a.movement !== 0);
      const cogs = tbArr.filter(a => a.code.startsWith('5') && a.movement !== 0);
      const opex = tbArr.filter(a => a.code.startsWith('6') && a.movement !== 0);

      const totalRev = revenue.reduce((s,a) => s + a.movement, 0);
      const totalCogs = cogs.reduce((s,a) => s + a.movement, 0);
      const totalOpex = opex.reduce((s,a) => s + a.movement, 0);
      const grossProfit = totalRev - totalCogs;
      const netProfit = grossProfit - totalOpex;

      // BS
      const assetsCurrent = tbArr.filter(a => a.code.startsWith('1-1') && Math.abs(a.ending) > 0);
      const assetsFixed = tbArr.filter(a => a.code.startsWith('1-2') && Math.abs(a.ending) > 0);
      const liabCurrent = tbArr.filter(a => a.code.startsWith('2-1') && Math.abs(a.ending) > 0);
      const liabLong = tbArr.filter(a => a.code.startsWith('2-2') && Math.abs(a.ending) > 0);
      const equity = tbArr.filter(a => a.code.startsWith('3') && Math.abs(a.ending) > 0);

      const tAsset = assetsCurrent.reduce((s,a)=>s+a.ending,0) + assetsFixed.reduce((s,a)=>s+a.ending,0);
      const tLiab = liabCurrent.reduce((s,a)=>s+a.ending,0) + liabLong.reduce((s,a)=>s+a.ending,0);
      const tEquity = equity.reduce((s,a)=>s+a.ending,0);
      const calcRE = tAsset - (tLiab + tEquity);

      // OUTSTANDING (FIXED DEFINITION INSIDE MEMO)
      const outstanding = trxData
          .filter(t => t.type === 'sales' && t.status !== 'Fully Paid')
          .reduce((acc, t) => acc + (t.amount - (t.amountPaid || 0)), 0);

      return {
          tb: tbArr,
          check: { debit: totalDebitCheck, credit: totalCreditCheck, isBalanced },
          pl: { revenue, cogs, opex, totalRev, totalCogs, totalOpex, grossProfit, netProfit },
          bs: { assetsCurrent, assetsFixed, liabCurrent, liabLong, equity, calcRE, tAsset, tLiab, tEquity },
          metrics: { 
              grossMargin: totalRev? (grossProfit/totalRev)*100 : 0, 
              netMargin: totalRev? (netProfit/totalRev)*100 : 0, 
              expenses: totalCogs + totalOpex, 
              outstanding 
          },
          periodLabel: filterType === 'MONTHLY' ? `${selectedMonth}/${selectedYear}` : `${selectedYear}`
      };

  }, [glData, trxData, selectedYear, selectedMonth, filterType, coaList]);

  // VISUALS
  const topExpenses = useMemo(() => [...reportData.pl.opex, ...reportData.pl.cogs].sort((a,b) => b.movement - a.movement).slice(0, 5), [reportData]);
  const paymentStatusData = useMemo(() => [{ name: 'Paid', value: reportData.pl.totalRev, color: COLORS.success }, { name: 'Unpaid', value: reportData.metrics.outstanding, color: COLORS.danger }].filter(d=>d.value>0), [reportData]);
  const budgetData = useMemo(() => [
      { name: 'Sales', Budget: reportData.pl.totalRev * 1.1, Actual: reportData.pl.totalRev },
      { name: 'Expense', Budget: reportData.metrics.expenses * 1.1, Actual: reportData.metrics.expenses },
  ], [reportData]);

  const handleExportXLS = () => {
      const wb = XLSX.utils.book_new();
      const wsTB = XLSX.utils.json_to_sheet(reportData.tb);
      XLSX.utils.book_append_sheet(wb, wsTB, "Trial Balance");
      XLSX.writeFile(wb, `Report_${selectedYear}_${selectedMonth}.xlsx`);
  };

  if (!isClient) return null;

  return (
    <div className="space-y-6 pb-20 bg-slate-50 min-h-screen font-sans text-slate-800">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Activity className="text-blue-600"/> Financial Reports {loading && <Loader2 className="animate-spin"/>}</h1>
          <p className="text-xs text-slate-500">Periode: {reportData.periodLabel}</p>
        </div>
        <div className="flex gap-3 items-center">
           <div className="bg-slate-100 p-1 rounded-lg flex text-xs font-bold">
               <button onClick={() => setFilterType('MONTHLY')} className={`px-3 py-1.5 rounded-md ${filterType === 'MONTHLY' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Monthly</button>
               <button onClick={() => setFilterType('YEARLY')} className={`px-3 py-1.5 rounded-md ${filterType === 'YEARLY' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Yearly</button>
           </div>
           <div className="flex items-center gap-2 bg-slate-100 border rounded-lg px-3 py-1.5">
              <Calendar size={16} className="text-slate-500"/>
              <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="bg-transparent font-bold text-sm outline-none"><option value={2025}>2025</option><option value={2026}>2026</option></select>
              {filterType === 'MONTHLY' && (
                  <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="bg-transparent font-bold text-sm outline-none border-l pl-2 border-slate-300">{[1,2,3,4,5,6,7,8,9,10,11,12].map(m=><option key={m} value={m}>{m}</option>)}</select>
              )}
           </div>
           <button onClick={handleExportXLS} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow hover:bg-emerald-700"><Download size={14}/> XLS</button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-1 bg-white p-1 rounded-lg w-fit border border-slate-200 shadow-sm print:hidden">
          {['DASHBOARD', 'TB', 'PL', 'BS'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-6 py-2 rounded-md text-xs font-bold transition-all ${activeTab === tab ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>
                  {tab === 'TB' ? 'TRIAL BALANCE' : tab === 'PL' ? 'PROFIT & LOSS' : tab === 'BS' ? 'BALANCE SHEET' : 'DASHBOARD'}
              </button>
          ))}
      </div>

      {/* DASHBOARD */}
      {activeTab === 'DASHBOARD' && (
        <div className="space-y-6 animate-in fade-in">
            {/* BALANCE CHECK INDICATOR */}
            {!reportData.check.isBalanced && (
                <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-center gap-3 text-rose-700">
                    <AlertTriangle/>
                    <div>
                        <p className="font-bold">Warning: Trial Balance Tidak Seimbang!</p>
                        <p className="text-xs">Debit: {fmtMoney(reportData.check.debit)} | Kredit: {fmtMoney(reportData.check.credit)} | Selisih: {fmtMoney(reportData.check.debit - reportData.check.credit)}</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <ScoreCard title="Total Income" current={reportData.pl.totalRev} icon={<Wallet/>} color="blue"/>
                <ScoreCard title="Total Expenses" current={reportData.metrics.expenses} icon={<ArrowDownRight/>} color="rose" inverse/>
                <ScoreCard title="Net Profit" current={reportData.pl.netProfit} icon={<DollarSign/>} color="emerald" bg="dark"/>
                <div className="bg-purple-600 p-5 rounded-2xl shadow-lg text-white relative overflow-hidden flex flex-col justify-between">
                    <div><p className="text-xs font-bold opacity-70 uppercase">Outstanding Revenue</p><h3 className="text-2xl font-bold mt-1">{fmtCompact(reportData.metrics.outstanding)}</h3></div>
                    <CreditCard className="absolute right-4 bottom-4 opacity-20" size={48}/>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <h3 className="font-bold text-slate-800 mb-4">Profit Margins</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <GaugeChart label="Gross Margin" value={reportData.metrics.grossMargin} color={COLORS.success} />
                        <GaugeChart label="Net Margin" value={reportData.metrics.netMargin} color={COLORS.warning} />
                    </div>
                </div>
                <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden flex flex-col">
                    <div className="flex justify-between items-center mb-2 z-10"><h3 className="font-bold">Payment Status</h3></div>
                    <div className="h-[180px] w-full z-10">
                        <ResponsiveContainer><PieChart><Pie data={paymentStatusData} innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">{paymentStatusData.map((e, i) => <Cell key={i} fill={e.color} stroke="none"/>)}</Pie><RechartsTooltip/></PieChart></ResponsiveContainer>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><PieIcon size={14}/> Top Expenses</h3>
                    <div className="space-y-3">
                        {topExpenses.length === 0 ? <p className="text-xs text-slate-400 italic">No expenses recorded.</p> : 
                         topExpenses.map((e:any, i:number) => (
                            <div key={i}><div className="flex justify-between text-xs text-slate-600 mb-1"><span>{e.name}</span><span className="font-bold">{fmtCompact(e.movement)}</span></div><div className="w-full bg-slate-100 h-1.5 rounded-full"><div className="h-full bg-rose-500 rounded-full" style={{width: `${(e.movement/reportData.metrics.expenses)*100}%`}}></div></div></div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-[300px]">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Target size={16}/> Budget vs Actual</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={budgetData} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" hide/><YAxis dataKey="name" type="category" width={60} tick={{fontSize:12}}/><RechartsTooltip/><Legend verticalAlign="top"/><Bar dataKey="Budget" fill="#94a3b8" barSize={20} radius={[0,4,4,0]}/><Bar dataKey="Actual" fill={COLORS.primary} barSize={20} radius={[0,4,4,0]}/></BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
      )}

      {/* TRIAL BALANCE */}
      {activeTab === 'TB' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-bold text-slate-700 flex items-center gap-2"><FileSpreadsheet size={18}/> NERACA SALDO</h3>
                  <div className="flex items-center gap-3">
                      {reportData.check.isBalanced ? 
                          <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded"><CheckCircle size={14}/> BALANCED</span> : 
                          <span className="text-xs font-bold text-rose-600 flex items-center gap-1 bg-rose-50 px-2 py-1 rounded"><AlertTriangle size={14}/> NOT BALANCED</span>
                      }
                      <span className="text-xs px-2 py-1 bg-white border rounded shadow-sm">{reportData.periodLabel}</span>
                  </div>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                      <thead className="bg-slate-100 text-slate-500 font-bold text-xs uppercase">
                          <tr>
                              <th className="p-3">Kode</th>
                              <th className="p-3">Nama Akun</th>
                              <th className="p-3 text-right">Saldo Awal</th>
                              <th className="p-3 text-right text-emerald-600">Debit</th>
                              <th className="p-3 text-right text-rose-600">Kredit</th>
                              <th className="p-3 text-right text-blue-600">Movement</th>
                              <th className="p-3 text-right font-bold bg-slate-200">Akhir</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {reportData.tb.filter((r:any) => r.initial!==0 || r.debit!==0 || r.credit!==0).map((row:any, idx:number) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                  <td className="p-3 font-mono text-xs">{row.code}</td>
                                  <td className="p-3 font-medium text-slate-700">{row.name}</td>
                                  <td className="p-3 text-right text-slate-500">{fmtMoney(row.initial)}</td>
                                  <td className="p-3 text-right text-emerald-600">{fmtMoney(row.debit)}</td>
                                  <td className="p-3 text-right text-rose-600">{fmtMoney(row.credit)}</td>
                                  <td className="p-3 text-right font-medium text-blue-600">{fmtMoney(row.movement)}</td>
                                  <td className="p-3 text-right font-bold bg-slate-50/50">{fmtMoney(row.ending)}</td>
                              </tr>
                          ))}
                          <tr className="bg-slate-50 font-bold border-t border-slate-300">
                              <td colSpan={2} className="p-3 text-right">TOTAL CHECK:</td>
                              <td colSpan={5} className="p-3 text-right">{reportData.check.isBalanced ? "OK (Zero Difference)" : "UNBALANCED"}</td>
                          </tr>
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* PROFIT LOSS */}
      {activeTab === 'PL' && (
          <div className="max-w-4xl mx-auto bg-white p-8 border border-slate-200 shadow-lg rounded-xl animate-in slide-in-from-bottom-2">
              <div className="text-center border-b-2 border-slate-800 pb-6 mb-8">
                  <h2 className="text-3xl font-bold text-slate-900 tracking-tight">INCOME STATEMENT</h2>
                  <p className="text-slate-500 uppercase tracking-widest text-xs mt-2">Period: {reportData.periodLabel}</p>
              </div>
              <div className="space-y-1">
                  <PLRow label="REVENUE" value={reportData.pl.totalRev} type="header" color="emerald"/>
                  {reportData.pl.revenue.map((d:any, i:number) => <PLRow key={i} label={d.name} value={d.movement} type="detail"/>)}
                  <div className="h-4"></div>
                  <PLRow label="COST OF GOODS SOLD" value={reportData.pl.totalCogs} type="header" color="rose"/>
                  {reportData.pl.cogs.map((d:any, i:number) => <PLRow key={i} label={d.name} value={d.movement} type="detail"/>)}
                  <div className="py-2"><div className="border-t border-slate-200"></div></div>
                  <PLRow label="GROSS PROFIT" value={reportData.pl.grossProfit} type="subtotal"/>
                  <div className="h-6"></div>
                  <PLRow label="OPERATING EXPENSES" value={reportData.pl.totalOpex} type="header" color="amber"/>
                  {reportData.pl.opex.map((d:any, i:number) => <PLRow key={i} label={d.name} value={d.movement} type="detail"/>)}
                  <div className="h-8"></div>
                  <div className="bg-slate-900 text-white p-4 rounded-lg flex justify-between items-center">
                      <span className="font-bold">NET PROFIT / (LOSS)</span>
                      <span className="font-bold text-xl">{fmtMoney(reportData.pl.netProfit)}</span>
                  </div>
              </div>
          </div>
      )}

      {/* BALANCE SHEET */}
      {activeTab === 'BS' && (
          <div className="max-w-4xl mx-auto bg-white p-10 border border-slate-200 shadow-lg rounded-xl animate-in slide-in-from-bottom-2">
              <div className="text-center border-b pb-6 mb-8">
                  <h2 className="text-3xl font-bold text-slate-800">BALANCE SHEET</h2>
                  <p className="text-slate-500 uppercase tracking-widest text-sm mt-1">Per {reportData.periodLabel}</p>
              </div>
              <div className="grid grid-cols-2 gap-12">
                  <div>
                      <h3 className="text-lg font-bold text-blue-800 uppercase border-b-2 border-blue-800 mb-4 pb-1">Assets</h3>
                      {reportData.bs.assetsCurrent.map((d:any, i:number) => <BSDetailRow key={i} name={d.name} code={d.code} val={d.ending}/>)}
                      {reportData.bs.assetsFixed.map((d:any, i:number) => <BSDetailRow key={i} name={d.name} code={d.code} val={d.ending}/>)}
                      <div className="mt-8 pt-2 border-t-2 border-slate-300 flex justify-between items-center bg-blue-50 p-2 rounded"><span className="font-bold text-blue-900">TOTAL ASSETS</span><span className="font-bold text-blue-900 text-lg">{fmtMoney(reportData.bs.tAsset)}</span></div>
                  </div>
                  <div>
                      <h3 className="text-lg font-bold text-rose-800 uppercase border-b-2 border-rose-800 mb-4 pb-1">Liabilities & Equity</h3>
                      {reportData.bs.liabCurrent.map((d:any, i:number) => <BSDetailRow key={i} name={d.name} code={d.code} val={d.ending}/>)}
                      {reportData.bs.liabLong.map((d:any, i:number) => <BSDetailRow key={i} name={d.name} code={d.code} val={d.ending}/>)}
                      {reportData.bs.equity.map((d:any, i:number) => <BSDetailRow key={i} name={d.name} code={d.code} val={d.ending}/>)}
                      <div className="flex justify-between text-sm py-1 px-2 mb-1 bg-slate-50"><span className="text-slate-700 font-bold">Retained Earnings</span><span className="font-mono text-emerald-600 font-bold">{fmtMoney(reportData.bs.calcRE)}</span></div>
                      <div className="mt-8 pt-2 border-t-2 border-slate-300 flex justify-between items-center bg-rose-50 p-2 rounded"><span className="font-bold text-rose-900">TOTAL PASIVA</span><span className="font-bold text-rose-900 text-lg">{fmtMoney(reportData.bs.tLiab + reportData.bs.tEquity + reportData.bs.calcRE)}</span></div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

// --- 3. SUB COMPONENTS ---

function ScoreCard({ title, current, icon, color, inverse, bg }: any) {
    const isDark = bg === 'dark';
    return (
        <div className={`p-5 rounded-2xl shadow-sm flex flex-col justify-between h-[130px] relative overflow-hidden ${isDark ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200'}`}>
            <div className="flex justify-between items-start z-10"><div><p className={`text-xs font-bold uppercase tracking-wider mb-1 ${isDark?'text-slate-400':'text-slate-500'}`}>{title}</p><h3 className="text-2xl font-bold">{fmtCompact(current)}</h3></div><div className={`p-2 rounded-lg ${isDark?'bg-white/10':'bg-slate-50 text-slate-600'}`}>{icon}</div></div>
        </div>
    );
}

function GaugeChart({ label, value, color }: any) {
    const safeVal = Math.min(100, Math.max(0, value));
    const data = [{ name: 'Val', value: safeVal }, { name: 'Rem', value: 100 - safeVal }];
    return (
        <div className="flex flex-col items-center"><div className="h-[80px] w-full relative"><ResponsiveContainer><PieChart><Pie data={data} cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius={35} outerRadius={50} paddingAngle={0} dataKey="value"><Cell fill={color} /><Cell fill="#f1f5f9" /></Pie></PieChart></ResponsiveContainer><div className="absolute bottom-0 left-0 w-full text-center mb-2"><span className="text-lg font-bold text-slate-800">{safeVal.toFixed(1)}%</span></div></div><span className="text-xs font-bold text-slate-500 mt-1">{label}</span></div>
    );
}

function PLRow({ label, value, type, color }: any) {
    const colorClass = color === 'emerald' ? 'text-emerald-600' : color === 'rose' ? 'text-rose-600' : color === 'amber' ? 'text-amber-600' : 'text-slate-800';
    const isHeader = type === 'header'; const isSubtotal = type === 'subtotal';
    return (
        <div className={`flex justify-between items-center py-1 ${type === 'detail' ? 'pl-4 text-xs text-slate-500' : 'text-sm'}`}><span className={`${isHeader || isSubtotal ? 'font-bold' : ''} ${isHeader ? colorClass : ''} ${isSubtotal ? 'text-slate-900' : ''}`}>{label}</span><span className={`font-mono ${isSubtotal ? 'font-bold text-lg' : ''}`}>{fmtMoney(value)}</span></div>
    );
}

function BSDetailRow({name, code, val}: any) {
    return (
        <div className="flex justify-between text-sm py-1 px-2 border-b border-slate-50 hover:bg-slate-50"><span className="text-slate-600">{name} <span className="text-[10px] text-slate-300">({code})</span></span><span className="font-mono text-slate-800">{fmtMoney(val)}</span></div>
    );
}

function BSSubtotal({val}: any) {
    return (
        <div className="flex justify-end text-sm font-bold pt-1 border-t border-dashed border-slate-300 mt-1"><span>{fmtMoney(val)}</span></div>
    );
}