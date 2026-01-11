'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  Printer, Calendar, Download, TrendingUp, TrendingDown, Activity, 
  PieChart as PieIcon, BarChart3, Loader2, Users, Wallet, DollarSign,
  ArrowUpRight, ArrowDownRight, Target, CreditCard, LayoutGrid, Percent
} from 'lucide-react';
import { fetchSheetData } from '@/lib/googleSheets';
import * as XLSX from 'xlsx';
import { 
  PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, BarChart, Bar, AreaChart, Area
} from 'recharts';

export default function ReportsPage() {
  
  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'PL' | 'BS'>('DASHBOARD');
  
  // FILTER
  const currentYear = new Date().getFullYear();
  const [filterType, setFilterType] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);

  const [loading, setLoading] = useState(true);
  
  // DATA SOURCES
  const [glData, setGlData] = useState<any[]>([]); // Accounting Data
  const [trxData, setTrxData] = useState<any[]>([]); // Transaction Data
  const [coaList, setCoaList] = useState<any[]>([]);

  // COLORS & FORMATTERS
  const COLORS = {
    primary: '#3b82f6', success: '#10b981', warning: '#f59e0b', danger: '#ef4444', 
    purple: '#8b5cf6', dark: '#1e293b', grid: '#e2e8f0'
  };
  const fmtMoney = (n: number) => "Rp " + n.toLocaleString('id-ID');
  const fmtCompact = (n: number) => {
      if (Math.abs(n) >= 1000000000) return (n / 1000000000).toFixed(1) + "M";
      if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + "Jt";
      return (n / 1000).toFixed(0) + "K";
  };

  // --- 1. LOAD DATA ---
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const coaRaw = await fetchSheetData('Master_COA');
        setCoaList(coaRaw as any[]);

        const storedGL = localStorage.getItem('METALURGI_GL_JOURNALS');
        if (storedGL) setGlData(JSON.parse(storedGL));

        const storedTrx = localStorage.getItem('METALURGI_MANUAL_TRX');
        const manualTrx = storedTrx ? JSON.parse(storedTrx) : [];
        const sheetSales = await fetchSheetData('Trx_Sales_Invoice'); 
        
        const mappedSheetSales = (sheetSales as any[]).map(row => ({
            id: row.Inv_Number,
            date: row.Trx_Date,
            amount: (parseInt(row.Qty||0) * parseInt(row.Unit_Price||0)),
            amountPaid: 0, status: 'Unpaid', type: 'sales'
        }));
        setTrxData([...manualTrx, ...mappedSheetSales]);

      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    initData();
  }, []);

  // --- 2. ENGINE: ACCOUNTING LOGIC (CORE) ---

  // Helper: Ambil Nama Akun
  const getAccName = (code: string) => {
      // @ts-ignore
      const acc = coaList.find(c => c.Account_Code == code || c.KODE == code);
      // @ts-ignore
      return acc ? (acc.Account_Name || acc.NAMA_AKUN) : code;
  };

  // LOGIC A: PERIODIC FLOW (Untuk Profit & Loss)
  // Menghitung mutasi saldo HANYA dalam rentang waktu tertentu
  const calculatePeriodFlow = (startDate: string, endDate: string) => {
      // Filter transaksi yang terjadi di antara start dan end
      const filtered = glData.filter(j => j.date >= startDate && j.date <= endDate);
      const balances: Record<string, number> = {};

      filtered.forEach(j => {
          const amt = parseFloat(j.amount) || 0;
          if (j.debit_acc) balances[j.debit_acc] = (balances[j.debit_acc] || 0) + amt;
          if (j.credit_acc) balances[j.credit_acc] = (balances[j.credit_acc] || 0) - amt;
      });

      const getSum = (prefixes: string[], normal: 'D'|'C') => {
          let total = 0;
          const details: any[] = [];
          Object.keys(balances).forEach(acc => {
              if (prefixes.some(p => acc.startsWith(p))) {
                  const val = (normal === 'D' ? balances[acc] : -balances[acc]);
                  total += val;
                  if (val !== 0) details.push({ code: acc, name: getAccName(acc), value: val });
              }
          });
          return { total, details: details.sort((a,b) => b.value - a.value) };
      };

      const revenue = getSum(['4'], 'C');
      const cogs = getSum(['5'], 'D');
      const opex = getSum(['6'], 'D');
      const otherExp = getSum(['7', '8', '9'], 'D'); // Biaya Lain

      const grossProfit = revenue.total - cogs.total;
      const netProfit = grossProfit - opex.total - otherExp.total;

      return { revenue, cogs, opex, otherExp, grossProfit, netProfit, raw: balances };
  };

  // LOGIC B: CUMULATIVE SNAPSHOT (Untuk Balance Sheet)
  // Menghitung saldo akumulasi dari AWAL WAKTU sampai endDate
  const calculateCumulativeSnapshot = (endDate: string) => {
      // Filter: Semua transaksi <= endDate
      const filtered = glData.filter(j => j.date <= endDate);
      const balances: Record<string, number> = {};

      filtered.forEach(j => {
          const amt = parseFloat(j.amount) || 0;
          if (j.debit_acc) balances[j.debit_acc] = (balances[j.debit_acc] || 0) + amt;
          if (j.credit_acc) balances[j.credit_acc] = (balances[j.credit_acc] || 0) - amt;
      });

      const getDetails = (prefix: string, normal: 'D'|'C') => {
          let total = 0;
          const details: any[] = [];
          Object.keys(balances).forEach(acc => {
              if (acc.startsWith(prefix)) {
                  const val = (normal === 'D' ? balances[acc] : -balances[acc]);
                  total += val;
                  if (val !== 0) details.push({ code: acc, name: getAccName(acc), value: val });
              }
          });
          return { total, details: details.sort((a,b) => a.code.localeCompare(b.code)) };
      };

      // Komponen Neraca
      const assetsLancar = getDetails('1-1', 'D');
      const assetsTetap = getDetails('1-2', 'D');
      const liabLancar = getDetails('2-1', 'C');
      const liabPanjang = getDetails('2-2', 'C');
      const equity = getDetails('3', 'C');

      // Hitung Retained Earnings (Laba Ditahan) secara otomatis
      // Rumus: Total Aset - (Total Liabilitas + Total Modal Saham)
      // Atau: Akumulasi (Rev - Exp) dari awal waktu sampai endDate
      const totalAssets = assetsLancar.total + assetsTetap.total;
      const totalLiab = liabLancar.total + liabPanjang.total;
      const retainedEarnings = totalAssets - totalLiab - equity.total;

      return { assetsLancar, assetsTetap, liabLancar, liabPanjang, equity, retainedEarnings };
  };

  // --- 3. METRICS GENERATOR ---
  
  const reportData = useMemo(() => {
      // Tentukan Rentang Waktu berdasarkan Filter
      let startDatePnl = '';
      let endDate = '';

      if (filterType === 'MONTHLY') {
          // Awal bulan s/d Akhir bulan
          startDatePnl = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
          // End date logic: Last day of month
          const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
          endDate = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${lastDay}`;
      } else {
          // Awal tahun s/d Akhir tahun
          startDatePnl = `${selectedYear}-01-01`;
          endDate = `${selectedYear}-12-31`;
      }

      // 1. Calculate P&L (Flow)
      const pl = calculatePeriodFlow(startDatePnl, endDate);

      // 2. Calculate BS (Snapshot)
      const bs = calculateCumulativeSnapshot(endDate);

      // 3. Comparison Data (Last Period)
      let prevStartDate = '';
      let prevEndDate = '';
      if (filterType === 'MONTHLY') {
          const d = new Date(selectedYear, selectedMonth - 2, 1); // Mundur 1 bulan
          prevStartDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
          const lastDay = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
          prevEndDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${lastDay}`;
      } else {
          prevStartDate = `${selectedYear-1}-01-01`;
          prevEndDate = `${selectedYear-1}-12-31`;
      }
      const prevPl = calculatePeriodFlow(prevStartDate, prevEndDate);

      // 4. Ratios
      const grossMargin = pl.revenue.total ? (pl.grossProfit / pl.revenue.total) * 100 : 0;
      const netMargin = pl.revenue.total ? (pl.netProfit / pl.revenue.total) * 100 : 0;
      const expenses = pl.cogs.total + pl.opex.total;
      const expenseRatio = pl.revenue.total ? (expenses / pl.revenue.total) * 100 : 0;
      
      const totalAssets = bs.assetsLancar.total + bs.assetsTetap.total;
      const totalLiab = bs.liabLancar.total + bs.liabPanjang.total;
      const totalEquity = bs.equity.total + bs.retainedEarnings;
      
      const currentRatio = bs.liabLancar.total ? (bs.assetsLancar.total / bs.liabLancar.total) : 0;
      const debtToEquity = totalEquity ? (totalLiab / totalEquity) : 0;

      // 5. Outstanding (From Trx)
      const outstanding = trxData
          .filter(t => t.type === 'sales' && t.status !== 'Fully Paid')
          .reduce((acc, t) => acc + (t.amount - (t.amountPaid || 0)), 0);

      return {
          pl, bs, prevPl, 
          metrics: { 
              grossMargin, netMargin, expenseRatio, currentRatio, debtToEquity, 
              outstanding, expenses 
          },
          periodLabel: filterType === 'MONTHLY' ? `${selectedMonth}/${selectedYear}` : `${selectedYear}`
      };
  }, [glData, trxData, selectedYear, selectedMonth, filterType, coaList]);

  // PAYMENT STATUS DATA
  const paymentStatusData = useMemo(() => {
      const counts = { Paid: 0, Partial: 0, Unpaid: 0 };
      trxData.filter(t => t.type === 'sales').forEach(t => {
          if (t.status === 'Fully Paid') counts.Paid += t.amount;
          else if (t.status === 'Partial Paid') counts.Partial += t.amount;
          else counts.Unpaid += t.amount;
      });
      return [
          { name: 'Paid', value: counts.Paid, color: COLORS.success },
          { name: 'Partial', value: counts.Partial, color: COLORS.purple },
          { name: 'Unpaid', value: counts.Unpaid, color: COLORS.danger }
      ].filter(d => d.value > 0);
  }, [trxData]);

  // TREND DATA GENERATOR
  const trendData = useMemo(() => {
      const arr = [];
      const isYearly = filterType === 'YEARLY';
      const loops = isYearly ? 12 : 6;

      for (let i = loops - 1; i >= 0; i--) {
          let d, start, end, label;
          
          if (isYearly) {
              // Jan - Dec of selected Year
              d = new Date(selectedYear, i, 1); // i = 0..11
              start = `${selectedYear}-${String(i+1).padStart(2,'0')}-01`;
              const lastDay = new Date(selectedYear, i+1, 0).getDate();
              end = `${selectedYear}-${String(i+1).padStart(2,'0')}-${lastDay}`;
              label = d.toLocaleString('default', { month: 'short' });
          } else {
              // Last 6 Months
              d = new Date(selectedYear, selectedMonth - 1 - i, 1);
              start = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`;
              const lastDay = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
              end = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${lastDay}`;
              label = d.toLocaleString('default', { month: 'short' });
          }

          const flow = calculatePeriodFlow(start, end);
          arr.push({ name: label, Income: flow.revenue.total, Expense: flow.cogs.total + flow.opex.total, Net: flow.netProfit });
      }
      return isYearly ? arr.reverse() : arr; // Reorder if needed
  }, [glData, selectedYear, selectedMonth, filterType]);

  // BUDGET DATA
  const budgetData = useMemo(() => [
      { name: 'Sales', Budget: reportData.pl.revenue.total * 1.1, Actual: reportData.pl.revenue.total },
      { name: 'COGS', Budget: reportData.pl.revenue.total * 0.4, Actual: reportData.pl.cogs.total },
      { name: 'Opex', Budget: reportData.pl.opex.total * 0.9, Actual: reportData.pl.opex.total },
  ], [reportData]);

  // --- ACTIONS ---
  const handleExportXLS = () => {
      const wb = XLSX.utils.book_new();
      
      // PL Sheet
      const wsPL = XLSX.utils.json_to_sheet([
          { A: 'PROFIT & LOSS', B: reportData.periodLabel },
          { A: '' },
          { A: 'REVENUE', B: reportData.pl.revenue.total },
          { A: 'COGS', B: reportData.pl.cogs.total },
          { A: 'GROSS PROFIT', B: reportData.pl.grossProfit },
          { A: 'OPEX', B: reportData.pl.opex.total },
          { A: 'NET PROFIT', B: reportData.pl.netProfit }
      ], { skipHeader: true });
      XLSX.utils.book_append_sheet(wb, wsPL, "Profit Loss");

      // BS Sheet
      const bs = reportData.bs;
      const wsBS = XLSX.utils.json_to_sheet([
          { A: 'BALANCE SHEET', B: reportData.periodLabel },
          { A: '' },
          { A: 'ASSETS', B: '' },
          { A: 'Current Assets', B: bs.assetsLancar.total },
          { A: 'Fixed Assets', B: bs.assetsTetap.total },
          { A: 'TOTAL ASSETS', B: bs.assetsLancar.total + bs.assetsTetap.total },
          { A: '' },
          { A: 'LIABILITIES & EQUITY', B: '' },
          { A: 'Current Liab', B: bs.liabLancar.total },
          { A: 'Long Term Liab', B: bs.liabPanjang.total },
          { A: 'Equity', B: bs.equity.total },
          { A: 'Retained Earnings', B: bs.retainedEarnings },
          { A: 'TOTAL PASIVA', B: bs.liabLancar.total + bs.liabPanjang.total + bs.equity.total + bs.retainedEarnings }
      ], { skipHeader: true });
      XLSX.utils.book_append_sheet(wb, wsBS, "Balance Sheet");

      XLSX.writeFile(wb, `Financial_Report_${selectedYear}_${selectedMonth}.xlsx`);
  };

  return (
    <div className="space-y-6 pb-20 bg-slate-50 min-h-screen font-sans text-slate-800">
      
      {/* 1. TOP BAR */}
      <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Activity className="text-blue-600"/> Financial Reports {loading && <Loader2 className="animate-spin"/>}</h1>
          <p className="text-xs text-slate-500">Overview & Analysis per {filterType} Closing</p>
        </div>
        <div className="flex gap-3 items-center">
           {/* TYPE TOGGLE (RESTORED) */}
           <div className="bg-slate-100 p-1 rounded-lg flex text-xs font-bold">
               <button onClick={() => setFilterType('MONTHLY')} className={`px-3 py-1.5 rounded-md transition-all ${filterType === 'MONTHLY' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Monthly</button>
               <button onClick={() => setFilterType('YEARLY')} className={`px-3 py-1.5 rounded-md transition-all ${filterType === 'YEARLY' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}>Yearly</button>
           </div>

           <div className="flex items-center gap-2 bg-slate-100 border rounded-lg px-3 py-1.5">
              <Calendar size={16} className="text-slate-500"/>
              <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="bg-transparent font-bold text-sm outline-none cursor-pointer">
                  {[0,1,2].map(i => <option key={i} value={currentYear-i}>{currentYear-i}</option>)}
              </select>
              {filterType === 'MONTHLY' && (
                  <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="bg-transparent font-bold text-sm outline-none border-l pl-2 cursor-pointer border-slate-300">
                      {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m,i) => (<option key={i} value={i+1}>{m}</option>))}
                  </select>
              )}
           </div>
           <button onClick={handleExportXLS} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow hover:bg-emerald-700"><Download size={14}/> XLS</button>
           <button onClick={()=>window.print()} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold shadow hover:bg-slate-900"><Printer size={14}/> Print</button>
        </div>
      </div>

      {/* 2. TABS */}
      <div className="flex gap-1 bg-white p-1 rounded-lg w-fit border border-slate-200 shadow-sm print:hidden">
          {['DASHBOARD', 'PL', 'BS'].map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-6 py-2 rounded-md text-xs font-bold transition-all ${activeTab === tab ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:bg-slate-50'}`}>{tab === 'PL' ? 'PROFIT & LOSS' : tab === 'BS' ? 'BALANCE SHEET' : 'DASHBOARD'}</button>
          ))}
      </div>

      {/* ======================= DASHBOARD VIEW ======================= */}
      {activeTab === 'DASHBOARD' && (
        <div className="space-y-6 animate-in fade-in">
            {/* ROW 1: SCORECARDS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <ScoreCard title="Total Income" current={reportData.pl.revenue.total} last={reportData.prevPl.revenue.total} icon={<Wallet/>} color="blue"/>
                <ScoreCard title="Total Expenses" current={reportData.metrics.expenses} last={reportData.prevPl.cogs.total + reportData.prevPl.opex.total} icon={<ArrowDownRight/>} color="rose" inverse/>
                <ScoreCard title="Net Profit" current={reportData.pl.netProfit} last={reportData.prevPl.netProfit} icon={<DollarSign/>} color="emerald" bg="dark"/>
                <div className="bg-purple-600 p-5 rounded-2xl shadow-lg text-white relative overflow-hidden flex flex-col justify-between">
                    <div><p className="text-xs font-bold opacity-70 uppercase">Outstanding Revenue</p><h3 className="text-2xl font-bold mt-1">{fmtCompact(reportData.metrics.outstanding)}</h3></div>
                    <CreditCard className="absolute right-4 bottom-4 opacity-20" size={48}/>
                </div>
            </div>

            {/* ROW 2: CHARTS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                    <h3 className="font-bold text-slate-800 mb-4">Overall Profit Margin</h3>
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
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><PieIcon size={14}/> Top 5 Opex</h3>
                    <div className="space-y-3">
                        {reportData.pl.opex.details.slice(0,5).map((e:any, i:number) => (
                            <div key={i}><div className="flex justify-between text-xs text-slate-600 mb-1"><span>{e.name}</span><span className="font-bold">{fmtCompact(e.value)}</span></div><div className="w-full bg-slate-100 h-1.5 rounded-full"><div className="h-full bg-rose-500 rounded-full" style={{width: `${(e.value/reportData.metrics.expenses)*100}%`}}></div></div></div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ROW 3: TREND & BUDGET */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-[300px]">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><TrendingUp size={16}/> Profit & Loss Trend</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trendData}><defs><linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.success} stopOpacity={0.2}/><stop offset="95%" stopColor={COLORS.success} stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COLORS.grid}/><XAxis dataKey="name" tick={{fontSize:10}} axisLine={false} tickLine={false} dy={10}/><YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/><RechartsTooltip/><Area type="monotone" dataKey="Income" stroke={COLORS.success} fill="url(#gInc)" strokeWidth={2}/><Area type="monotone" dataKey="Expense" stroke={COLORS.danger} fill="none" strokeWidth={2}/></AreaChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-[300px]">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><Target size={16}/> Budget vs Actual</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={budgetData} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" hide/><YAxis dataKey="name" type="category" width={50} tick={{fontSize:11}}/><RechartsTooltip/><Legend verticalAlign="top"/><Bar dataKey="Budget" fill="#94a3b8" barSize={12} radius={[0,4,4,0]}/><Bar dataKey="Actual" fill={COLORS.primary} barSize={12} radius={[0,4,4,0]}/></BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* RATIO CARDS */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center"><p className="text-xs font-bold text-blue-500 uppercase">Current Ratio</p><h4 className="text-2xl font-bold text-blue-700">{reportData.metrics.currentRatio.toFixed(2)}</h4></div>
                <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 text-center"><p className="text-xs font-bold text-rose-500 uppercase">Debt to Equity</p><h4 className="text-2xl font-bold text-rose-700">{reportData.metrics.debtToEquity.toFixed(2)}</h4></div>
            </div>
        </div>
      )}

      {/* ======================= DETAIL PL ======================= */}
      {activeTab === 'PL' && (
          <div className="max-w-4xl mx-auto bg-white p-8 border border-slate-200 shadow-lg rounded-xl print:shadow-none print:w-full animate-in slide-in-from-bottom-2">
              <div className="text-center border-b-2 border-slate-800 pb-6 mb-8">
                  <h2 className="text-3xl font-bold text-slate-900 tracking-tight">PROFIT & LOSS</h2>
                  <p className="text-slate-500 uppercase tracking-widest text-xs mt-2">Period: {reportData.periodLabel}</p>
              </div>
              <div className="space-y-1">
                  <PLRow label="REVENUE" value={reportData.pl.revenue.total} type="header" color="emerald"/>
                  {reportData.pl.revenue.details.map((d:any, i:number) => <PLRow key={i} label={d.name} value={d.value} type="detail"/>)}
                  
                  <div className="h-4"></div>
                  <PLRow label="COST OF GOODS SOLD" value={reportData.pl.cogs.total} type="header" color="rose"/>
                  {reportData.pl.cogs.details.map((d:any, i:number) => <PLRow key={i} label={d.name} value={d.value} type="detail"/>)}

                  <div className="py-2"><div className="border-t border-slate-200"></div></div>
                  <PLRow label="GROSS PROFIT" value={reportData.pl.grossProfit} type="subtotal"/>
                  
                  <div className="h-6"></div>
                  <PLRow label="OPERATING EXPENSES" value={reportData.pl.opex.total} type="header" color="amber"/>
                  {reportData.pl.opex.details.map((d:any, i:number) => <PLRow key={i} label={d.name} value={d.value} type="detail"/>)}
                  
                  <div className="h-8"></div>
                  <div className="bg-slate-900 text-white p-4 rounded-lg flex justify-between items-center">
                      <span className="font-bold">NET PROFIT / (LOSS)</span>
                      <span className="font-bold text-xl">{fmtMoney(reportData.pl.netProfit)}</span>
                  </div>
              </div>
          </div>
      )}

      {/* ======================= DETAIL BS (FIXED) ======================= */}
      {activeTab === 'BS' && (
          <div className="max-w-4xl mx-auto bg-white p-10 border border-slate-200 shadow-lg rounded-xl animate-in slide-in-from-bottom-2 print:shadow-none print:w-full">
              <div className="text-center border-b pb-6 mb-8">
                  <h2 className="text-3xl font-bold text-slate-800">BALANCE SHEET</h2>
                  <p className="text-slate-500 uppercase tracking-widest text-sm mt-1">Per {reportData.periodLabel}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-12">
                  {/* ASSETS */}
                  <div>
                      <h3 className="text-lg font-bold text-blue-800 uppercase border-b-2 border-blue-800 mb-4 pb-1">Assets</h3>
                      <div className="mb-6"><h4 className="font-bold text-sm text-slate-600 mb-2">Current Assets</h4>{reportData.bs.assetsLancar.details.map((d:any, i:number) => <BSDetailRow key={i} name={d.name} code={d.code} val={d.value}/>)}<BSSubtotal val={reportData.bs.assetsLancar.total}/></div>
                      <div className="mb-6"><h4 className="font-bold text-sm text-slate-600 mb-2">Fixed Assets</h4>{reportData.bs.assetsTetap.details.map((d:any, i:number) => <BSDetailRow key={i} name={d.name} code={d.code} val={d.value}/>)}<BSSubtotal val={reportData.bs.assetsTetap.total}/></div>
                      <div className="mt-8 pt-2 border-t-2 border-slate-300 flex justify-between items-center bg-blue-50 p-2 rounded"><span className="font-bold text-blue-900">TOTAL ASSETS</span><span className="font-bold text-blue-900 text-lg">{fmtMoney(reportData.bs.assetsLancar.total + reportData.bs.assetsTetap.total)}</span></div>
                  </div>

                  {/* LIAB & EQUITY */}
                  <div>
                      <h3 className="text-lg font-bold text-rose-800 uppercase border-b-2 border-rose-800 mb-4 pb-1">Liabilities & Equity</h3>
                      <div className="mb-6"><h4 className="font-bold text-sm text-slate-600 mb-2">Liabilities</h4>{reportData.bs.liabLancar.details.map((d:any, i:number) => <BSDetailRow key={i} name={d.name} code={d.code} val={d.value}/>)}{reportData.bs.liabPanjang.details.map((d:any, i:number) => <BSDetailRow key={i} name={d.name} code={d.code} val={d.value}/>)}<BSSubtotal val={reportData.bs.liabLancar.total + reportData.bs.liabPanjang.total}/></div>
                      <div className="mb-6">
                          <h4 className="font-bold text-sm text-slate-600 mb-2">Equity</h4>
                          {reportData.bs.equity.details.map((d:any, i:number) => <BSDetailRow key={i} name={d.name} code={d.code} val={d.value}/>)}
                          <div className="flex justify-between text-sm py-1 px-2 mb-1"><span className="text-slate-700">Retained Earnings (Calc)</span><span className="font-mono text-emerald-600 font-bold">{fmtMoney(reportData.bs.retainedEarnings)}</span></div>
                          <BSSubtotal val={reportData.bs.equity.total + reportData.bs.retainedEarnings}/>
                      </div>
                      <div className="mt-8 pt-2 border-t-2 border-slate-300 flex justify-between items-center bg-rose-50 p-2 rounded"><span className="font-bold text-rose-900">TOTAL PASIVA</span><span className="font-bold text-rose-900 text-lg">{fmtMoney(reportData.bs.liabLancar.total + reportData.bs.liabPanjang.total + reportData.bs.equity.total + reportData.bs.retainedEarnings)}</span></div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

// --- SUB COMPONENTS ---
function ScoreCard({ title, current, last, icon, color, inverse, bg }: any) {
    const isDark = bg === 'dark';
    const diff = current - last;
    const percent = last > 0 ? (diff / last) * 100 : 0;
    const isGood = inverse ? diff < 0 : diff > 0;
    
    return (
        <div className={`p-5 rounded-2xl shadow-sm flex flex-col justify-between h-[130px] relative overflow-hidden ${isDark ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200'}`}>
            <div className="flex justify-between items-start z-10"><div><p className={`text-xs font-bold uppercase tracking-wider mb-1 ${isDark?'text-slate-400':'text-slate-500'}`}>{title}</p><h3 className="text-2xl font-bold">{current >= 1000000000 ? (current/1000000000).toFixed(2)+'M' : (current/1000000).toFixed(1)+'Jt'}</h3></div><div className={`p-2 rounded-lg ${isDark?'bg-white/10':'bg-slate-50 text-slate-600'}`}>{icon}</div></div>
            <div className="flex items-center gap-2 mt-auto z-10"><span className={`text-xs font-bold px-1.5 py-0.5 rounded flex items-center ${isGood ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{isGood ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>} {Math.abs(percent).toFixed(1)}%</span><span className={`text-[10px] ${isDark?'text-slate-500':'text-slate-400'}`}>vs last period</span></div>
        </div>
    );
}

function GaugeChart({ label, value, color }: any) {
    const data = [{ name: 'Val', value: value }, { name: 'Rem', value: 100 - value }];
    return (
        <div className="flex flex-col items-center"><div className="h-[80px] w-full relative"><ResponsiveContainer><PieChart><Pie data={data} cx="50%" cy="100%" startAngle={180} endAngle={0} innerRadius={35} outerRadius={50} paddingAngle={0} dataKey="value"><Cell fill={color} /><Cell fill="#f1f5f9" /></Pie></PieChart></ResponsiveContainer><div className="absolute bottom-0 left-0 w-full text-center mb-2"><span className="text-lg font-bold text-slate-800">{value.toFixed(1)}%</span></div></div><span className="text-xs font-bold text-slate-500 mt-1">{label}</span></div>
    );
}

function PLRow({ label, value, type, color }: any) {
    const colorClass = color === 'emerald' ? 'text-emerald-600' : color === 'rose' ? 'text-rose-600' : color === 'amber' ? 'text-amber-600' : 'text-slate-800';
    const isHeader = type === 'header'; const isSubtotal = type === 'subtotal';
    return (
        <div className={`flex justify-between items-center py-1 ${type === 'detail' ? 'pl-4 text-xs text-slate-500' : 'text-sm'}`}><span className={`${isHeader || isSubtotal ? 'font-bold' : ''} ${isHeader ? colorClass : ''} ${isSubtotal ? 'text-slate-900' : ''}`}>{label}</span><span className={`font-mono ${isSubtotal ? 'font-bold text-lg' : ''}`}>{value.toLocaleString('id-ID', {style:'currency', currency:'IDR'})}</span></div>
    );
}

function BSDetailRow({name, code, val}: any) {
    return (
        <div className="flex justify-between text-sm py-1 px-2 border-b border-slate-50 hover:bg-slate-50"><span className="text-slate-600">{name} <span className="text-[10px] text-slate-300">({code})</span></span><span className="font-mono text-slate-800">{parseInt(val).toLocaleString('id-ID')}</span></div>
    );
}

function BSSubtotal({val}: any) {
    return (
        <div className="flex justify-end text-sm font-bold pt-1 border-t border-dashed border-slate-300 mt-1"><span>{parseInt(val).toLocaleString('id-ID')}</span></div>
    );
}