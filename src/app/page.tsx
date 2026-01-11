'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, TrendingDown, DollarSign, Package, AlertCircle, 
  Calendar, Download, Wallet, Activity, CreditCard,
  Filter, ShoppingCart, Layers, Flame, Clock, ShieldCheck,
  ArrowUpRight, ArrowDownLeft, Briefcase, Factory, Landmark,
  Monitor, Loader2
} from 'lucide-react';

// IMPORT SHEET FETCHER
import { fetchSheetData } from '@/lib/googleSheets';

export default function Dashboard() {
  
  // --- STATE MANAGEMENT ---
  const [dateRange, setDateRange] = useState('30_days'); 
  const [comparePeriod, setComparePeriod] = useState('last_month');
  const [topPerfTab, setTopPerfTab] = useState<'sales' | 'cost'>('sales');
  const [topCount, setTopCount] = useState<number>(5);
  
  // --- DATA STATE (REAL DATA) ---
  const [loading, setLoading] = useState(true);
  const [posTransactions, setPosTransactions] = useState<any[]>([]); // POS Local
  const [sheetSales, setSheetSales] = useState<any[]>([]); // Sheet Sales
  const [sheetPurchase, setSheetPurchase] = useState<any[]>([]); // Sheet Purchase
  const [sheetExpense, setSheetExpense] = useState<any[]>([]); // Sheet Expense
  
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // --- INIT LOAD DATA ---
  useEffect(() => {
    const initData = async () => {
        setLoading(true);
        try {
            // 1. Load Local POS Data
            const savedTrx = localStorage.getItem('METALURGI_POS_TRX');
            if (savedTrx) setPosTransactions(JSON.parse(savedTrx));

            // 2. Load Google Sheets Data
            const [sales, purchase, expense] = await Promise.all([
                fetchSheetData('Trx_Sales_Invoice'),
                fetchSheetData('Trx_Purchase_Invoice'),
                fetchSheetData('Trx_Expense')
            ]);

            setSheetSales(sales as any[]);
            setSheetPurchase(purchase as any[]);
            setSheetExpense(expense as any[]);

        } catch (error) {
            console.error("Error loading dashboard data", error);
        } finally {
            setLoading(false);
        }
    };
    initData();
  }, []);

  // --- HELPER: FORMAT CURRENCY ---
  const formatCurrency = (val: any) => {
    const num = Number(val);
    if (isNaN(num)) return "Rp 0";
    return "Rp " + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  // --- HELPER: DATE FILTER LOGIC ---
  const isWithinRange = (dateString: string) => {
      if (!dateString) return false;
      const date = new Date(dateString);
      const today = new Date();
      today.setHours(23, 59, 59, 999); 
      
      let cutoff = new Date();
      cutoff.setHours(0, 0, 0, 0);

      if (dateRange === 'custom' && customStartDate && customEndDate) {
          const start = new Date(customStartDate);
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59);
          return date >= start && date <= end;
      }

      if (dateRange === '7_days') cutoff.setDate(today.getDate() - 7);
      else if (dateRange === '14_days') cutoff.setDate(today.getDate() - 14);
      else if (dateRange === '30_days') cutoff.setDate(today.getDate() - 30);
      else if (dateRange === '60_days') cutoff.setDate(today.getDate() - 60);
      else if (dateRange === '90_days') cutoff.setDate(today.getDate() - 90);
      else if (dateRange === '6_months') cutoff.setMonth(today.getMonth() - 6);
      else if (dateRange === 'this_year') cutoff.setMonth(0, 1); 

      return date >= cutoff && date <= today;
  };

  // --- ANALYTICS 1: TOP ACCOUNTING SALES (Real Data) ---
  const accountingSalesStats = useMemo(() => {
      const productMap: Record<string, { name: string, value: number, count: number, sku: string }> = {};
      let totalRevenue = 0;

      sheetSales.filter(row => isWithinRange(row.Trx_Date)).forEach(row => {
          const val = (parseInt(row.Qty) || 0) * (parseInt(row.Unit_Price) || 0);
          const name = row.Product_Name || row.Product_SKU || 'Unknown'; 
          
          if (!productMap[row.Product_SKU]) {
              productMap[row.Product_SKU] = { name, value: 0, count: 0, sku: row.Product_SKU };
          }
          productMap[row.Product_SKU].value += val;
          productMap[row.Product_SKU].count += 1;
          totalRevenue += val;
      });

      const sorted = Object.values(productMap).sort((a, b) => b.value - a.value);
      return { list: sorted, total: totalRevenue };
  }, [sheetSales, dateRange, customStartDate, customEndDate]);

  // --- ANALYTICS 2: TOP COST (Real Data) ---
  const accountingCostStats = useMemo(() => {
      const costMap: Record<string, { name: string, value: number, category: string, division: string }> = {};
      let totalCost = 0;

      // A. Purchase (COGS)
      sheetPurchase.filter(row => isWithinRange(row.Trx_Date)).forEach(row => {
          const val = (parseInt(row.Qty) || 0) * (parseInt(row.Unit_Cost) || 0);
          const key = `PUR-${row.Product_SKU}`; 
          if (!costMap[key]) {
              costMap[key] = { 
                  name: row.Product_Name || row.Product_SKU || 'Unknown Item', 
                  value: 0, 
                  category: 'COGS', 
                  division: 'Inventory' 
              };
          }
          costMap[key].value += val;
          totalCost += val;
      });

      // B. Expense (OPEX)
      sheetExpense.filter(row => isWithinRange(row.Trx_Date)).forEach(row => {
          const val = parseInt(row.Amount) || 0;
          const key = `EXP-${row.Desc}`; 
          if (!costMap[key]) {
              costMap[key] = { 
                  name: row.Desc || 'Unknown Expense', 
                  value: 0, 
                  category: 'OPEX', 
                  division: row.Expense_Account || 'General' 
              };
          }
          costMap[key].value += val;
          totalCost += val;
      });

      const sorted = Object.values(costMap).sort((a, b) => b.value - a.value);
      return { list: sorted, total: totalCost };
  }, [sheetPurchase, sheetExpense, dateRange, customStartDate, customEndDate]);

  // --- ANALYTICS 3: POS SALES ANALYTICS (Real Data) ---
  const posAnalytics = useMemo(() => {
      let filtered = posTransactions.filter(t => isWithinRange(t.date));
      const productMap: Record<string, { name: string, qty: number, revenue: number }> = {};
      
      filtered.forEach(trx => {
          trx.items.forEach((item: any) => {
              if (!productMap[item.sku]) {
                  productMap[item.sku] = { name: item.name, qty: 0, revenue: 0 };
              }
              productMap[item.sku].qty += item.qty;
              productMap[item.sku].revenue += (item.price * item.qty);
          });
      });

      const sortedProducts = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);
      const totalRevenue = sortedProducts.reduce((acc, p) => acc + p.revenue, 0);
      const totalQty = sortedProducts.reduce((acc, p) => acc + p.qty, 0);

      return { products: sortedProducts, totalRevenue, totalQty };
  }, [posTransactions, dateRange, customStartDate, customEndDate]);

  // --- MOCK DATA FOR VISUALIZATION (PRESERVED) ---
  const CASH_ON_HAND = 1250000000; 
  const MONTHLY_BURN_RATE = 145000000; 
  const RUNWAY_MONTHS = (CASH_ON_HAND / MONTHLY_BURN_RATE).toFixed(1); 
  const CHART_LABEL = dateRange === '30_days' ? 'Harian (30 Hari)' : '6 Bulan Terakhir';
  const TREND_DATA = [
    { label: 'Jul', rev: 2.1, net: 0.4 }, { label: 'Aug', rev: 2.3, net: 0.5 },
    { label: 'Sep', rev: 2.0, net: 0.3 }, { label: 'Oct', rev: 2.8, net: 0.6 },
    { label: 'Nov', rev: 2.6, net: 0.5 }, { label: 'Dec', rev: 2.85, net: 0.55 },
  ];
  const PNL_DETAILED = { revenue: 'Rp 2.85 M', cogs: 'Rp 1.60 M', gp: 'Rp 1.25 M', opex: 'Rp 700 Jt', net: 'Rp 550 Jt' };
  const CASHFLOW_DATA = {
    operating: { in: 2850000000, out: 2300000000, net: 550000000 },
    investing: { in: 0, out: 150000000, net: -150000000 },
    financing: { in: 500000000, out: 50000000, net: 450000000 },
  };

  return (
    <div className="space-y-8 pb-20">
      
      {/* 1. HEADER & FILTER */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm sticky top-0 z-20">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Executive Cockpit</h1>
            <p className="text-xs text-slate-500 mt-1">Financial & POS Overview</p>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
            <Calendar size={18} className="text-slate-500 ml-2" />
            <select 
              value={dateRange} 
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-700 outline-none p-1 cursor-pointer"
            >
              <option value="7_days">7 Hari Terakhir</option>
              <option value="14_days">14 Hari Terakhir</option>
              <option value="30_days">30 Hari Terakhir</option>
              <option value="6_months">6 Bulan Terakhir</option>
              <option value="this_year">Tahun Ini (YTD)</option>
              <option value="custom">Custom Range...</option>
            </select>
            
            {dateRange === 'custom' && (
                <div className="flex items-center gap-2 border-l border-slate-300 pl-3 ml-2">
                   <input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="text-xs border border-slate-200 rounded px-1 py-1 text-slate-600 bg-white" />
                   <span className="text-xs text-slate-400">-</span>
                   <input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="text-xs border border-slate-200 rounded px-1 py-1 text-slate-600 bg-white" />
                </div>
            )}
            
            <button className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded-md ml-2"><Filter size={14} /></button>
          </div>
          <button className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium hover:bg-slate-50 text-slate-700 shadow-sm"><Download size={14} /> Export Report</button>
        </div>
      </div>

      {/* 2. LIKUIDITAS & KESEHATAN ASET */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all">
          <div className="flex justify-between items-start mb-2"><div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><Wallet size={20}/></div><span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1"><TrendingUp size={12}/> +12%</span></div>
          <p className="text-slate-500 text-xs font-medium uppercase">Cash on Hand</p><p className="text-2xl font-bold text-slate-900">Rp 1.25 M</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all">
          <div className="flex justify-between items-start mb-2"><div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><Package size={20}/></div><span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1"><TrendingDown size={12}/> -2%</span></div>
          <p className="text-slate-500 text-xs font-medium uppercase">Inventory Value</p><p className="text-2xl font-bold text-slate-900">Rp 850 Jt</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all">
          <div className="flex justify-between items-start mb-2"><div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><AlertCircle size={20}/></div><span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">+8%</span></div>
          <p className="text-slate-500 text-xs font-medium uppercase">Piutang (AR)</p><p className="text-2xl font-bold text-slate-900">Rp 320 Jt</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all">
          <div className="flex justify-between items-start mb-2"><div className="p-2 bg-rose-100 text-rose-600 rounded-lg"><CreditCard size={20}/></div><span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded text-xs font-bold">Safe</span></div>
          <p className="text-slate-500 text-xs font-medium uppercase">Hutang (AP)</p><p className="text-2xl font-bold text-slate-900">Rp 210 Jt</p>
        </div>
      </div>

      {/* 3. TREND & INCOME FLOW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <Activity className="text-purple-500" size={20}/> Trend Analysis: Revenue vs Net Profit
            </h3>
            <span className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded font-medium border border-purple-100">Periode: {CHART_LABEL}</span>
          </div>
          <div className="h-64 flex items-end justify-between px-2 gap-4">
             {TREND_DATA.map((data, idx) => (
               <div key={idx} className="w-full flex flex-col justify-end gap-1 group relative cursor-pointer">
                 <div className="w-full bg-blue-100 rounded-t-sm flex items-end relative hover:bg-blue-200 transition-colors" style={{ height: `${data.rev * 30}%` }}>
                    <div className="w-full bg-emerald-500 opacity-90 rounded-t-sm absolute bottom-0 shadow-sm" style={{ height: `${(data.net / data.rev) * 100}%` }}></div>
                 </div>
                 <span className="text-xs text-slate-400 font-medium text-center mt-2">{data.label}</span>
               </div>
             ))}
          </div>
        </div>

        {/* INCOME FLOW */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
           <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Income Flow</h3></div>
           <div className="flex-1 flex flex-col justify-between relative">
              <div className="absolute left-4 top-4 bottom-8 w-0.5 bg-slate-100 -z-0"></div>
              <div className="flex items-center justify-between z-10 bg-white py-1">
                 <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 border-4 border-white"><DollarSign size={14} /></div><div><p className="text-xs text-slate-400 font-bold uppercase">Revenue</p><p className="text-sm font-bold text-slate-800">{PNL_DETAILED.revenue}</p></div></div>
              </div>
              <div className="flex items-center justify-between z-10 bg-white py-1 pl-4">
                 <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-rose-400 border-2 border-white ring-1 ring-rose-100"></div><div><p className="text-[10px] text-rose-500 font-bold uppercase">(-) HPP / COGS</p><p className="text-xs font-semibold text-rose-700">{PNL_DETAILED.cogs}</p></div></div>
              </div>
              <div className="flex items-center justify-between z-10 bg-white py-1 pl-4">
                 <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-emerald-400 border-2 border-white ring-1 ring-emerald-100"></div><div><p className="text-[10px] text-emerald-600 font-bold uppercase">Gross Profit</p><p className="text-xs font-semibold text-emerald-700">{PNL_DETAILED.gp}</p></div></div>
              </div>
              <div className="flex items-center justify-between z-10 bg-white py-1 pl-4">
                 <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-amber-400 border-2 border-white ring-1 ring-amber-100"></div><div><p className="text-[10px] text-amber-500 font-bold uppercase">(-) OPEX</p><p className="text-xs font-semibold text-amber-700">{PNL_DETAILED.opex}</p></div></div>
              </div>
              <div className="mt-2 p-3 bg-slate-900 rounded-xl text-white z-10 relative shadow-lg">
                 <div className="flex justify-between items-center"><div><p className="text-[10px] text-slate-400 font-bold uppercase">Net Profit</p><p className="text-xl font-bold text-white">{PNL_DETAILED.net}</p></div></div>
              </div>
           </div>
        </div>
      </div>

      {/* 4. CASHFLOW STATEMENT (FULL VIEW RESTORED) */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
         <div className="flex justify-between items-center mb-6">
            <div>
               <h3 className="font-bold text-slate-800 text-lg">Cashflow Statement</h3>
               <p className="text-xs text-slate-500 mt-1">Laporan Arus Kas (Operating, Investing, Financing)</p>
            </div>
            <div className="text-right">
               <span className="text-xs font-bold text-slate-400 uppercase">Net Change in Cash</span>
               <p className="text-xl font-bold text-blue-600">+ {formatCurrency(850000000)}</p>
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Operating */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 relative overflow-hidden group">
               <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><Briefcase size={20}/></div>
                  <p className="font-bold text-slate-700 text-sm">Operating</p>
               </div>
               <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                     <span className="text-slate-500 flex items-center gap-1"><ArrowDownLeft size={14} className="text-green-500"/> In</span>
                     <span className="font-semibold text-slate-700">{formatCurrency(CASHFLOW_DATA.operating.in)}</span>
                  </div>
                  <div className="flex justify-between">
                     <span className="text-slate-500 flex items-center gap-1"><ArrowUpRight size={14} className="text-red-500"/> Out</span>
                     <span className="font-semibold text-slate-700">{formatCurrency(CASHFLOW_DATA.operating.out)}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between">
                     <span className="font-bold text-slate-800 text-xs uppercase">Net Operating</span>
                     <span className="font-bold text-emerald-600">{formatCurrency(CASHFLOW_DATA.operating.net)}</span>
                  </div>
               </div>
            </div>

            {/* Investing */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 relative overflow-hidden group">
               <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><Factory size={20}/></div>
                  <p className="font-bold text-slate-700 text-sm">Investing</p>
               </div>
               <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                     <span className="text-slate-500 flex items-center gap-1"><ArrowDownLeft size={14} className="text-green-500"/> In</span>
                     <span className="font-semibold text-slate-700">{formatCurrency(CASHFLOW_DATA.investing.in)}</span>
                  </div>
                  <div className="flex justify-between">
                     <span className="text-slate-500 flex items-center gap-1"><ArrowUpRight size={14} className="text-red-500"/> Out</span>
                     <span className="font-semibold text-slate-700">{formatCurrency(CASHFLOW_DATA.investing.out)}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between">
                     <span className="font-bold text-slate-800 text-xs uppercase">Net Investing</span>
                     <span className="font-bold text-red-500">{formatCurrency(CASHFLOW_DATA.investing.net)}</span>
                  </div>
               </div>
            </div>

            {/* Financing */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 relative overflow-hidden group">
               <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><Landmark size={20}/></div>
                  <p className="font-bold text-slate-700 text-sm">Financing</p>
               </div>
               <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                     <span className="text-slate-500 flex items-center gap-1"><ArrowDownLeft size={14} className="text-green-500"/> In</span>
                     <span className="font-semibold text-slate-700">{formatCurrency(CASHFLOW_DATA.financing.in)}</span>
                  </div>
                  <div className="flex justify-between">
                     <span className="text-slate-500 flex items-center gap-1"><ArrowUpRight size={14} className="text-red-500"/> Out</span>
                     <span className="font-semibold text-slate-700">{formatCurrency(CASHFLOW_DATA.financing.out)}</span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between">
                     <span className="font-bold text-slate-800 text-xs uppercase">Net Financing</span>
                     <span className="font-bold text-emerald-600">{formatCurrency(CASHFLOW_DATA.financing.net)}</span>
                  </div>
               </div>
            </div>

         </div>
      </div>

      {/* 5. COST CONTROL CENTER (FULL VIEW RESTORED) */}
      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
         <ShieldCheck size={16} /> Cost Control Center
      </h3>
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg relative overflow-hidden">
         <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600 rounded-full blur-[100px] opacity-20 pointer-events-none"></div>

         <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
            <div className="flex items-center gap-4 border-r border-slate-700 pr-4">
               <div className="p-3 bg-rose-500/20 rounded-xl text-rose-400">
                  <Flame size={28} />
               </div>
               <div>
                  <p className="text-slate-400 text-xs font-bold uppercase">Avg. Monthly Burn Rate</p>
                  <p className="text-2xl font-bold mt-1">Rp 145 Jt<span className="text-sm text-slate-500 font-normal">/bln</span></p>
                  <p className="text-[10px] text-slate-500 mt-1">Based on 12-month spending history</p>
               </div>
            </div>

            <div className="flex items-center gap-4 border-r border-slate-700 pr-4">
               <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-400">
                  <Clock size={28} />
               </div>
               <div>
                  <p className="text-slate-400 text-xs font-bold uppercase">Cash Runway</p>
                  <p className="text-2xl font-bold mt-1">{RUNWAY_MONTHS} Bulan</p>
                  <p className="text-[10px] text-slate-500 mt-1">Estimasi bertahan tanpa income baru</p>
               </div>
            </div>

            <div className="flex flex-col justify-center">
               <div className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                  <div className="flex items-center gap-2 mb-1">
                     <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                     <p className="text-xs font-bold text-slate-300">Safe Zone</p>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                     Kondisi kas aman (&gt; 6 bulan). Namun burn rate naik 5% dibanding bulan lalu karena pembelian material bulk.
                  </p>
               </div>
            </div>
         </div>
      </div>

      {/* 6. TOP ACCOUNTING SALES & COST (REAL DATA FROM SHEETS) */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
           <div className="flex bg-slate-100 p-1 rounded-lg">
              <button onClick={() => setTopPerfTab('sales')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${topPerfTab === 'sales' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><ShoppingCart size={16}/> Top Accounting Sales</button>
              <button onClick={() => setTopPerfTab('cost')} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${topPerfTab === 'cost' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Layers size={16}/> Top Cost</button>
           </div>
           
           <div className="flex items-center gap-2">
             <span className="text-xs text-slate-500 font-medium">Show:</span>
             {[3, 10, 20].map((num) => (<button key={num} onClick={() => setTopCount(num as number)} className={`px-3 py-1 text-xs font-bold rounded border ${topCount === num ? 'bg-slate-800 text-white' : 'bg-white border-slate-200'}`}>{num}</button>))}
           </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
           {loading ? (
               <div className="p-10 text-center text-slate-400 flex flex-col items-center gap-2"><Loader2 className="animate-spin"/><span className="text-xs">Mengambil data dari Google Sheets...</span></div>
           ) : (
               <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                      <th className="p-4 font-semibold">Rank</th>
                      <th className="p-4 font-semibold">{topPerfTab === 'sales' ? 'Product Name' : 'Item / Expense'}</th>
                      {topPerfTab === 'cost' && <th className="p-4 font-semibold">Type</th>}
                      <th className="p-4 font-semibold">Info</th>
                      <th className="p-4 font-semibold text-right">Value (IDR)</th>
                      <th className="p-4 font-semibold text-right">Contrib.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(topPerfTab === 'sales' ? accountingSalesStats.list : accountingCostStats.list).slice(0, topCount).map((item, idx) => {
                        const totalBase = topPerfTab === 'sales' ? accountingSalesStats.total : accountingCostStats.total;
                        const percent = totalBase > 0 ? ((item.value / totalBase) * 100).toFixed(1) : 0;
                        
                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                             <td className="p-4 text-slate-400 font-mono text-xs">#{idx + 1}</td>
                             <td className="p-4"><p className="font-bold text-slate-800 text-sm">{item.name}</p></td>
                             
                             {topPerfTab === 'cost' && (
                                <td className="p-4">
                                   {/* @ts-ignore */}
                                   <span className={`px-2 py-1 rounded text-[10px] font-bold ${item.category === 'COGS' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{item.category}</span>
                                </td>
                             )}

                             <td className="p-4">
                                {topPerfTab === 'sales' ? 
                                    /* @ts-ignore */
                                    <span className="text-xs text-slate-500">{item.count} Transaksi</span> : 
                                    /* @ts-ignore */
                                    <span className="text-xs text-slate-500">{item.division}</span>
                                }
                             </td>
                             <td className={`p-4 text-right font-bold ${topPerfTab === 'sales' ? 'text-blue-600' : 'text-rose-600'}`}>{formatCurrency(item.value)}</td>
                             <td className="p-4 text-right"><span className={`px-2 py-1 rounded text-xs font-bold ${topPerfTab === 'sales' ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-700'}`}>{percent}%</span></td>
                          </tr>
                        )
                    })}
                  </tbody>
               </table>
           )}
        </div>
      </div>

      {/* 7. POS SALES ANALYTICS (REAL DATA FROM LOCALSTORAGE - MOVED TO BOTTOM) */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100 ring-1 ring-blue-50">
        <div className="flex justify-between items-end mb-6">
            <div>
               <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><Monitor className="text-blue-600" size={20}/> POS Sales Analytics</h3>
               <p className="text-xs text-slate-500 mt-1">Data penjualan real-time dari Mesin Kasir (POS Local) - {dateRange.replace('_', ' ')}.</p>
            </div>
            <div className="text-right">
                <p className="text-xs text-slate-400 font-bold uppercase mb-1">Total POS Revenue</p>
                <p className="text-3xl font-bold text-blue-700">{formatCurrency(posAnalytics.totalRevenue)}</p>
            </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
           <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="p-4 font-semibold">Rank</th>
                  <th className="p-4 font-semibold">Nama Produk</th>
                  <th className="p-4 font-semibold text-center">Qty Terjual</th>
                  <th className="p-4 font-semibold text-right">Avg. Unit Price</th>
                  <th className="p-4 font-semibold text-right">Total Sales</th>
                  <th className="p-4 font-semibold text-right">% Kontribusi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {posAnalytics.products.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-400 text-sm">Belum ada data transaksi POS pada periode ini.</td></tr>
                ) : (
                    posAnalytics.products.slice(0, 10).map((item, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/50 transition-colors text-sm">
                         <td className="p-4 text-slate-400 font-mono text-xs">#{idx + 1}</td>
                         <td className="p-4 font-bold text-slate-700">{item.name}</td>
                         <td className="p-4 text-center"><span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-lg font-bold text-xs">{item.qty}</span></td>
                         <td className="p-4 text-right text-xs text-slate-500 font-mono">{formatCurrency(Math.round(item.revenue / item.qty))}</td>
                         <td className="p-4 text-right font-bold text-emerald-600">{formatCurrency(item.revenue)}</td>
                         <td className="p-4 text-right">
                            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                {posAnalytics.totalRevenue > 0 ? ((item.revenue / posAnalytics.totalRevenue) * 100).toFixed(1) : 0}%
                            </span>
                         </td>
                      </tr>
                    ))
                )}
              </tbody>
           </table>
        </div>
      </div>

    </div>
  );
}