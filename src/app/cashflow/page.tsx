'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, Wallet, Calendar, 
  AlertCircle, BarChart3, PieChart as PieIcon, 
  Filter, Loader2, DollarSign, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { fetchSheetData } from '@/lib/googleSheets';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';

export default function CashflowPage() {
  
  // --- STATE ---
  const [agingType, setAgingType] = useState<'AR' | 'AP'>('AR');
  const [loading, setLoading] = useState(true);
  
  // Sorting State
  const [sortConfigIn, setSortConfigIn] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'date', direction: 'asc' });
  const [sortConfigOut, setSortConfigOut] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'date', direction: 'asc' });

  // DATA POOLS
  const [glData, setGlData] = useState<any[]>([]);
  const [trxData, setTrxData] = useState<any[]>([]);
  const [coaList, setCoaList] = useState<any[]>([]);
  
  // Filter Tanggal (Default: Hari ini s/d 30 hari ke depan untuk proyeksi)
  const today = new Date().toISOString().split('T')[0];
  const next30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [dateRange, setDateRange] = useState({ start: today, end: next30Days });

  // COLORS
  const COLORS = {
      safe: '#10b981', warning: '#f59e0b', danger: '#ef4444', critical: '#be123c',
      blue: '#3b82f6', slate: '#64748b', purple: '#8b5cf6', teal: '#14b8a6'
  };
  const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'];

  // --- 1. LOAD DATA ---
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const coaRaw = await fetchSheetData('Master_COA');
        setCoaList(coaRaw as any[]);

        const storedGL = localStorage.getItem('METALURGI_GL_JOURNALS');
        if (storedGL) setGlData(JSON.parse(storedGL));

        const storedManualTrx = localStorage.getItem('METALURGI_MANUAL_TRX');
        const manualTrx = storedManualTrx ? JSON.parse(storedManualTrx) : [];
        
        const [sheetSales, sheetPurch] = await Promise.all([
            fetchSheetData('Trx_Sales_Invoice'),
            fetchSheetData('Trx_Purchase_Invoice')
        ]);

        const mappedSales = (sheetSales as any[]).map(row => ({
            id: row.Inv_Number, date: row.Trx_Date, dueDate: row.Due_Date,
            partner: row.Partner_ID, desc: `Sales ${row.Product_SKU}`, product: row.Product_SKU,
            amount: (parseInt(row.Qty||0) * parseInt(row.Unit_Price||0)),
            type: 'sales', status: 'Unpaid' 
        }));

        const mappedPurch = (sheetPurch as any[]).map(row => ({
            id: row.Bill_Number, date: row.Trx_Date, dueDate: row.Due_Date,
            partner: row.Partner_ID, desc: `Purch ${row.Product_SKU}`, product: row.Product_SKU,
            amount: (parseInt(row.Qty||0) * parseInt(row.Unit_Cost||0)),
            type: 'purchase', status: 'Unpaid'
        }));

        const allTrx = [...manualTrx, ...mappedSales, ...mappedPurch].filter(t => 
            (t.type === 'sales' || t.type === 'purchase') && t.status !== 'Fully Paid'
        );
        
        setTrxData(allTrx);

      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    initData();
  }, []);

  // --- 2. ENGINE: CASH METRICS ---
  
  // A. REAL CASH SCORECARD (From GL)
  const cashScorecard = useMemo(() => {
      let totalIn = 0;
      let totalOut = 0;
      // Filter Akun Kepala 1-10 (Kas & Bank)
      const cashAccounts = glData.filter(j => j.debit_acc?.startsWith('1-10') || j.credit_acc?.startsWith('1-10'));
      
      cashAccounts.forEach(j => {
          const amt = parseFloat(j.amount) || 0;
          if (j.debit_acc?.startsWith('1-10')) totalIn += amt; // Debit Kas = Uang Masuk
          if (j.credit_acc?.startsWith('1-10')) totalOut += amt; // Kredit Kas = Uang Keluar
      });
      
      const initialBalance = 0; // Asumsi start 0, atau bisa diinput manual nantinya
      const endingBalance = initialBalance + totalIn - totalOut;

      return { initialBalance, totalIn, totalOut, endingBalance };
  }, [glData]);

  // B. FORECAST & AGING (From Open Transactions)
  const forecast = useMemo(() => {
      const arBuckets = { current: 0, d30: 0, d60: 0, d90: 0 };
      const apBuckets = { current: 0, d30: 0, d60: 0, d90: 0 };
      const inEvents: any[] = [];
      const outEvents: any[] = [];

      trxData.forEach(t => {
          const due = new Date(t.dueDate || t.date);
          const now = new Date();
          const diffTime = due.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          const amountDue = t.amount - (t.amountPaid || 0);

          // 1. Calendar Logic
          if (t.dueDate >= dateRange.start && t.dueDate <= dateRange.end) {
              const event = {
                  id: t.id, date: t.dueDate, title: t.partner, 
                  desc: t.desc, amount: amountDue, status: t.status
              };
              if (t.type === 'sales') inEvents.push(event);
              else outEvents.push(event);
          }

          // 2. Aging Logic
          const bucket = diffDays >= 0 ? 'current' : diffDays >= -30 ? 'd30' : diffDays >= -60 ? 'd60' : 'd90';
          if (t.type === 'sales') arBuckets[bucket] += amountDue;
          else apBuckets[bucket] += amountDue;
      });

      // Sorting Logic Helper
      const sortData = (data: any[], config: any) => {
          return [...data].sort((a, b) => {
              if (a[config.key] < b[config.key]) return config.direction === 'asc' ? -1 : 1;
              if (a[config.key] > b[config.key]) return config.direction === 'asc' ? 1 : -1;
              return 0;
          });
      };

      const sortedIn = sortData(inEvents, sortConfigIn);
      const sortedOut = sortData(outEvents, sortConfigOut);

      const agingChartData = [
          { name: 'Belum JT', AR: arBuckets.current, AP: apBuckets.current },
          { name: '1-30 Hari', AR: arBuckets.d30, AP: apBuckets.d30 },
          { name: '30-60 Hari', AR: arBuckets.d60, AP: apBuckets.d60 },
          { name: '> 60 Hari', AR: arBuckets.d90, AP: apBuckets.d90 },
      ];

      return { 
          inEvents: sortedIn, outEvents: sortedOut, 
          totalIn: sortedIn.reduce((a,b)=>a+b.amount,0), 
          totalOut: sortedOut.reduce((a,b)=>a+b.amount,0),
          agingChartData, arBuckets, apBuckets 
      };
  }, [trxData, dateRange, sortConfigIn, sortConfigOut]);

  // C. ANATOMIES (CASH IN & CASH OUT)
  const anatomies = useMemo(() => {
      // 1. CASH OUT (From GL)
      const hppMap: Record<string, number> = {};
      const opexMap: Record<string, number> = {};
      
      glData.forEach(j => {
          const amt = parseFloat(j.amount)||0;
          if (j.debit_acc?.startsWith('5')) { // HPP
             // @ts-ignore
             const name = coaList.find(c=>c.Account_Code==j.debit_acc)?.Account_Name || j.debit_acc;
             hppMap[name] = (hppMap[name]||0) + amt;
          }
          if (j.debit_acc?.startsWith('6')) { // OPEX
             // @ts-ignore
             const name = coaList.find(c=>c.Account_Code==j.debit_acc)?.Account_Name || j.debit_acc;
             opexMap[name] = (opexMap[name]||0) + amt;
          }
      });

      // 2. CASH IN (From Transactions - Sales Only for Product/Partner)
      const productMap: Record<string, number> = {};
      const partnerMap: Record<string, number> = {};
      
      // Use All Sales (History included) for Anatomy
      trxData.filter(t => t.type === 'sales').forEach(t => {
          const prod = t.product || 'Services';
          const part = t.partner || 'General';
          productMap[prod] = (productMap[prod]||0) + t.amount;
          partnerMap[part] = (partnerMap[part]||0) + t.amount;
      });

      const toArray = (map: Record<string,number>) => Object.keys(map).map(k => ({ name: k, value: map[k] })).sort((a,b)=>b.value-a.value);

      return {
          hpp: toArray(hppMap),
          opex: toArray(opexMap),
          inProduct: toArray(productMap).slice(0, 5), // Top 5
          inPartner: toArray(partnerMap).slice(0, 5)  // Top 5
      };
  }, [glData, trxData, coaList]);

  // UI Helpers
  const fmtMoney = (n: number) => "Rp " + n.toLocaleString('id-ID');
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const requestSortIn = (key: string) => setSortConfigIn({ key, direction: sortConfigIn.key === key && sortConfigIn.direction === 'asc' ? 'desc' : 'asc' });
  const requestSortOut = (key: string) => setSortConfigOut({ key, direction: sortConfigOut.key === key && sortConfigOut.direction === 'asc' ? 'desc' : 'asc' });
  const SortIcon = ({config, col}: any) => config.key === col ? (config.direction === 'asc' ? <ArrowUp size={12}/> : <ArrowDown size={12}/>) : <ArrowUpDown size={12} className="text-slate-300"/>;

  return (
    <div className="space-y-6 pb-20 bg-slate-50 min-h-screen font-sans text-slate-800">
      
      {/* HEADER & FILTER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="text-blue-600"/> Cashflow Monitor {loading && <Loader2 className="animate-spin" size={16}/>}
          </h1>
          <p className="text-slate-500 text-xs mt-1">Real-time Liquidity & Forecast based on GL & Invoices.</p>
        </div>
        
        <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
           <div className="flex items-center gap-2 px-2 border-r border-slate-200">
              <span className="text-[10px] uppercase font-bold text-slate-400">Projection Start</span>
              <input type="date" className="text-xs font-bold text-slate-700 bg-transparent outline-none" value={dateRange.start} onChange={(e) => setDateRange({...dateRange, start: e.target.value})}/>
           </div>
           <div className="flex items-center gap-2 px-2">
              <span className="text-[10px] uppercase font-bold text-slate-400">End</span>
              <input type="date" className="text-xs font-bold text-slate-700 bg-transparent outline-none" value={dateRange.end} onChange={(e) => setDateRange({...dateRange, end: e.target.value})}/>
           </div>
        </div>
      </div>

      {/* 1. CASH SCORECARD (REAL) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] uppercase font-bold text-slate-400">Initial Balance (Start)</p>
              <h3 className="text-xl font-bold text-slate-700 mt-1">{fmtMoney(cashScorecard.initialBalance)}</h3>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] uppercase font-bold text-emerald-600">Total Cash In (Real)</p>
              <h3 className="text-xl font-bold text-emerald-600 mt-1">+{fmtMoney(cashScorecard.totalIn)}</h3>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-[10px] uppercase font-bold text-rose-600">Total Cash Out (Real)</p>
              <h3 className="text-xl font-bold text-rose-600 mt-1">-{fmtMoney(cashScorecard.totalOut)}</h3>
          </div>
          <div className="bg-slate-900 text-white p-4 rounded-xl shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500 rounded-full blur-2xl opacity-20 -mr-6 -mt-6"></div>
              <p className="text-[10px] uppercase font-bold text-slate-400 relative z-10">Current Ending Balance</p>
              <h3 className="text-2xl font-bold mt-1 relative z-10">{fmtMoney(cashScorecard.endingBalance)}</h3>
          </div>
      </div>

      {/* 2. ANATOMIES (IN & OUT) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* CASH IN ANATOMY */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><PieIcon size={18} className="text-emerald-500"/> Cash In Anatomy (Revenue Source)</h3>
              <div className="grid grid-cols-2 gap-4">
                  {/* By Product */}
                  <div className="flex flex-col items-center">
                      <p className="text-xs font-bold text-slate-500 mb-2">By Product (Top 5)</p>
                      <div className="h-[150px] w-full">
                          <ResponsiveContainer><PieChart><Pie data={anatomies.inProduct} innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">{anatomies.inProduct.map((e,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}</Pie><Tooltip formatter={(v:any)=>fmtMoney(v)}/></PieChart></ResponsiveContainer>
                      </div>
                      <div className="w-full space-y-1 mt-2">{anatomies.inProduct.map((e,i)=><LegendItem key={i} color={PIE_COLORS[i%PIE_COLORS.length]} label={e.name} val={e.value}/>)}</div>
                  </div>
                  {/* By Partner */}
                  <div className="flex flex-col items-center border-l border-slate-100 pl-4">
                      <p className="text-xs font-bold text-slate-500 mb-2">By Partner (Top 5)</p>
                      <div className="h-[150px] w-full">
                          <ResponsiveContainer><PieChart><Pie data={anatomies.inPartner} innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">{anatomies.inPartner.map((e,i)=><Cell key={i} fill={PIE_COLORS[(i+2)%PIE_COLORS.length]}/>)}</Pie><Tooltip formatter={(v:any)=>fmtMoney(v)}/></PieChart></ResponsiveContainer>
                      </div>
                      <div className="w-full space-y-1 mt-2">{anatomies.inPartner.map((e,i)=><LegendItem key={i} color={PIE_COLORS[(i+2)%PIE_COLORS.length]} label={e.name} val={e.value}/>)}</div>
                  </div>
              </div>
          </div>

          {/* CASH OUT ANATOMY (SPLIT HPP vs OPEX) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><PieIcon size={18} className="text-rose-500"/> Cash Out Anatomy (Expense)</h3>
              <div className="grid grid-cols-2 gap-4">
                  {/* HPP */}
                  <div className="flex flex-col items-center">
                      <p className="text-xs font-bold text-slate-500 mb-2">HPP Breakdown</p>
                      <div className="h-[150px] w-full">
                          <ResponsiveContainer><PieChart><Pie data={anatomies.hpp} innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">{anatomies.hpp.map((e,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}</Pie><Tooltip formatter={(v:any)=>fmtMoney(v)}/></PieChart></ResponsiveContainer>
                      </div>
                      <div className="w-full space-y-1 mt-2 max-h-[100px] overflow-y-auto custom-scrollbar">{anatomies.hpp.length===0?<p className="text-[10px] text-slate-400 italic text-center">No Data</p>:anatomies.hpp.map((e,i)=><LegendItem key={i} color={PIE_COLORS[i%PIE_COLORS.length]} label={e.name} val={e.value}/>)}</div>
                  </div>
                  {/* OPEX */}
                  <div className="flex flex-col items-center border-l border-slate-100 pl-4">
                      <p className="text-xs font-bold text-slate-500 mb-2">OPEX Breakdown</p>
                      <div className="h-[150px] w-full">
                          <ResponsiveContainer><PieChart><Pie data={anatomies.opex} innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value">{anatomies.opex.map((e,i)=><Cell key={i} fill={PIE_COLORS[(i+3)%PIE_COLORS.length]}/>)}</Pie><Tooltip formatter={(v:any)=>fmtMoney(v)}/></PieChart></ResponsiveContainer>
                      </div>
                      <div className="w-full space-y-1 mt-2 max-h-[100px] overflow-y-auto custom-scrollbar">{anatomies.opex.length===0?<p className="text-[10px] text-slate-400 italic text-center">No Data</p>:anatomies.opex.map((e,i)=><LegendItem key={i} color={PIE_COLORS[(i+3)%PIE_COLORS.length]} label={e.name} val={e.value}/>)}</div>
                  </div>
              </div>
          </div>

      </div>

      {/* 3. AGING ANALYSIS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
               <h3 className="font-bold text-slate-800 flex items-center gap-2"><BarChart3 size={18} className="text-blue-600"/> Aging Analysis (Kesehatan)</h3>
               <div className="bg-slate-100 p-1 rounded-lg flex">
                  <button onClick={() => setAgingType('AR')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${agingType === 'AR' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Piutang (AR)</button>
                  <button onClick={() => setAgingType('AP')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${agingType === 'AP' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Hutang (AP)</button>
               </div>
          </div>
          <div className="h-[250px] w-full">
                <ResponsiveContainer>
                    <BarChart data={forecast.agingChartData} layout="vertical" margin={{top:5, right:30, left:20, bottom:5}}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false}/>
                        <XAxis type="number" hide/>
                        <YAxis dataKey="name" type="category" width={80} tick={{fontSize:11}}/>
                        <Tooltip cursor={{fill: 'transparent'}} formatter={(val:any)=>fmtMoney(val)}/>
                        <Legend/>
                        <Bar dataKey={agingType} fill={agingType==='AR'?COLORS.blue:COLORS.danger} radius={[0,4,4,0]} barSize={20} name={agingType==='AR'?'Piutang Customer':'Hutang Supplier'}/>
                    </BarChart>
                </ResponsiveContainer>
          </div>
      </div>

      {/* 4. SPLIT CALENDAR (IN & OUT) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* INFLOW TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
             <div className="p-4 border-b border-slate-100 bg-emerald-50/50">
                <h3 className="font-bold text-emerald-800 flex items-center gap-2"><ArrowDown size={16}/> Estimasi Masuk (Inflow)</h3>
             </div>
             <div className="overflow-x-auto flex-1">
                <table className="w-full text-left text-xs">
                   <thead className="bg-slate-50 text-slate-500 font-bold uppercase">
                      <tr>
                         <th className="p-3 cursor-pointer hover:bg-slate-100" onClick={()=>requestSortIn('date')}>Tgl <SortIcon config={sortConfigIn} col='date'/></th>
                         <th className="p-3 cursor-pointer hover:bg-slate-100" onClick={()=>requestSortIn('title')}>Partner <SortIcon config={sortConfigIn} col='title'/></th>
                         <th className="p-3 text-right cursor-pointer hover:bg-slate-100" onClick={()=>requestSortIn('amount')}>Nominal <SortIcon config={sortConfigIn} col='amount'/></th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                      {forecast.inEvents.map((item, idx) => (
                         <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-3 font-mono text-slate-600">{fmtDate(item.date)}</td>
                            <td className="p-3 font-medium text-slate-800">{item.title}</td>
                            <td className="p-3 text-right font-bold text-emerald-600">{fmtMoney(item.amount)}</td>
                         </tr>
                      ))}
                   </tbody>
                   <tfoot className="bg-emerald-50 border-t border-emerald-100">
                      <tr>
                         <td colSpan={2} className="p-3 font-bold text-emerald-800 text-right">GRAND TOTAL MASUK</td>
                         <td className="p-3 font-bold text-emerald-800 text-right">{fmtMoney(forecast.totalIn)}</td>
                      </tr>
                   </tfoot>
                </table>
             </div>
          </div>

          {/* OUTFLOW TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
             <div className="p-4 border-b border-slate-100 bg-rose-50/50">
                <h3 className="font-bold text-rose-800 flex items-center gap-2"><ArrowUp size={16}/> Estimasi Keluar (Outflow)</h3>
             </div>
             <div className="overflow-x-auto flex-1">
                <table className="w-full text-left text-xs">
                   <thead className="bg-slate-50 text-slate-500 font-bold uppercase">
                      <tr>
                         <th className="p-3 cursor-pointer hover:bg-slate-100" onClick={()=>requestSortOut('date')}>Tgl <SortIcon config={sortConfigOut} col='date'/></th>
                         <th className="p-3 cursor-pointer hover:bg-slate-100" onClick={()=>requestSortOut('title')}>Partner / Ket <SortIcon config={sortConfigOut} col='title'/></th>
                         <th className="p-3 text-right cursor-pointer hover:bg-slate-100" onClick={()=>requestSortOut('amount')}>Nominal <SortIcon config={sortConfigOut} col='amount'/></th>
                      </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                      {forecast.outEvents.map((item, idx) => (
                         <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-3 font-mono text-slate-600">{fmtDate(item.date)}</td>
                            <td className="p-3 font-medium text-slate-800">{item.title}</td>
                            <td className="p-3 text-right font-bold text-rose-600">{fmtMoney(item.amount)}</td>
                         </tr>
                      ))}
                   </tbody>
                   <tfoot className="bg-rose-50 border-t border-rose-100">
                      <tr>
                         <td colSpan={2} className="p-3 font-bold text-rose-800 text-right">GRAND TOTAL KELUAR</td>
                         <td className="p-3 font-bold text-rose-800 text-right">{fmtMoney(forecast.totalOut)}</td>
                      </tr>
                   </tfoot>
                </table>
             </div>
          </div>

      </div>

    </div>
  );
}

// --- SUB COMPONENTS ---
function LegendItem({color, label, val}: any) {
    return (
        <div className="flex justify-between items-center text-[10px]">
            <span className="flex items-center gap-2 text-slate-600"><div className="w-2 h-2 rounded-full" style={{backgroundColor: color}}></div> {label}</span>
            <span className="font-bold text-slate-800">{val >= 1000000 ? (val/1000000).toFixed(1)+'Jt' : (val/1000).toFixed(0)+'K'}</span>
        </div>
    )
}