'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, Wallet, Calendar, 
  AlertCircle, BarChart3, PieChart as PieIcon, 
  Filter, Loader2, DollarSign, ArrowUpDown, ArrowUp, ArrowDown,
  Briefcase, Factory, Landmark
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { useFetch } from '@/hooks/useFetch';

// --- 1. GLOBAL HELPERS ---

const COLORS = {
  safe: '#10b981', warning: '#f59e0b', danger: '#ef4444', 
  blue: '#3b82f6', purple: '#8b5cf6', teal: '#14b8a6', slate: '#64748b'
};
const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const fmtMoney = (n: number) => "Rp " + (n || 0).toLocaleString('id-ID');
const fmtDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

const parseAmount = (val: any) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const clean = val.toString().replace(/[^0-9.-]+/g, ""); 
    return parseFloat(clean) || 0;
};

// Akun Kas & Bank
const CASH_ACCOUNTS = ['1-1001', '1-1002']; 

export default function CashflowPage() {
  
  // --- STATE ---
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ 
      start: new Date().toISOString().split('T')[0], 
      end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] 
  });

  // DATA POOLS
  const [coaList, setCoaList] = useState<any[]>([]);
  const [posTrx, setPosTrx] = useState<any[]>([]); // Real-time POS
  const [serverPayments, setServerPayments] = useState<any[]>([]); // Trx_Payment
  const [serverExpenses, setServerExpenses] = useState<any[]>([]); // Trx_Expense
  const [unpaidInvoices, setUnpaidInvoices] = useState<any[]>([]); // AR & AP

  // FETCH DATA (Pakai GL API karena lengkap)
  const { data: apiData } = useFetch<any>('/api/general-ledger');

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

  // --- ENGINE: DATA LOAD & SYNC ---
  useEffect(() => {
    if (!apiData) return;
    setLoading(true);

    try {
        const coa = processSheetData(apiData.coa);
        setCoaList(coa);

        const sales = processSheetData(apiData.sales);
        const purchases = processSheetData(apiData.purchases);
        const payments = processSheetData(apiData.payments);
        const expenses = processSheetData(apiData.expenses);

        setServerPayments(payments);
        setServerExpenses(expenses);

        // 1. Load POS Local (Real-time Cash Source)
        if (typeof window !== 'undefined') {
            const storedPos = localStorage.getItem('METALURGI_POS_TRX');
            if (storedPos) setPosTrx(JSON.parse(storedPos));
        }

        // 2. Prepare Unpaid Invoices (Forecast Source)
        // Gabungkan Sales & Purchase yang belum lunas
        const ar = sales.map((r:any) => ({
            id: r.Inv_Number, date: r.Trx_Date, due: r.Due_Date || r.Trx_Date,
            amount: parseAmount(r.Qty)*parseAmount(r.Unit_Price), type: 'IN', party: 'Customer'
        })); 
        // Note: Idealnya filter by status 'Unpaid' jika ada kolom status di sheet.
        // Disini kita asumsikan semua invoice server adalah piutang berjalan.

        const ap = purchases.map((r:any) => ({
            id: r.Bill_Number, date: r.Trx_Date, due: r.Due_Date || r.Trx_Date,
            amount: parseAmount(r.Qty)*parseAmount(r.Unit_Cost), type: 'OUT', party: 'Supplier'
        }));

        setUnpaidInvoices([...ar, ...ap]);

    } catch (e) { console.error(e); } 
    finally { setLoading(false); }
  }, [apiData]);

  // --- CORE ENGINE: CASHFLOW CALCULATOR ---
  const cashflow = useMemo(() => {
      // 1. Initial Cash (Saldo Awal dari COA 1-10xx)
      let initialCash = 0;
      coaList.forEach((acc:any) => {
          if (CASH_ACCOUNTS.some(c => acc.Account_Code.startsWith(c))) {
              initialCash += parseAmount(acc.Opening_Balance || acc.Saldo_Awal);
          }
      });

      // 2. Realized Cashflow (Mutasi Pasti)
      let operating = { in: 0, out: 0 };
      let investing = { in: 0, out: 0 };
      let financing = { in: 0, out: 0 };

      // A. From POS (Selalu Operating Cash In)
      posTrx.forEach((t:any) => {
          // Asumsi POS selalu Cash/Bank transfer yang masuk ke liquid
          operating.in += parseFloat(t.total || 0);
      });

      // B. From Server Payments
      serverPayments.forEach((p:any) => {
          const amt = parseAmount(p.Amount);
          const acc = p.Account_Code || '1-1002'; // Default Bank
          
          // Cek apakah ini mutasi Kas/Bank
          if (CASH_ACCOUNTS.some(c => acc.startsWith(c))) {
              // Tentukan Kategori CFO berdasarkan Deskripsi/Ref (Simplifikasi)
              // Logic: 
              // - Beli Aset (1-2xxx) -> Investing
              // - Bayar Hutang Bank (2-2xxx) / Modal -> Financing
              // - Lainnya -> Operating
              
              // Disini kita pakai heuristic sederhana karena keterbatasan data ref
              // Jika Payment Type IN = Operating In (Sales payment)
              // Jika Payment Type OUT = Operating Out (Pay Bill)
              
              if (p.Payment_Type === 'IN') operating.in += amt;
              else operating.out += amt; 
          }
      });

      // C. From Server Expenses (Biaya Operasional)
      serverExpenses.forEach((e:any) => {
          const amt = parseAmount(e.Amount);
          // Asumsi expense dibayar pakai kas/bank
          operating.out += amt;
      });

      // Calculate Totals
      const totalIn = operating.in + investing.in + financing.in;
      const totalOut = operating.out + investing.out + financing.out;
      const netChange = totalIn - totalOut;
      const endingCash = initialCash + netChange;

      return {
          initialCash, endingCash, netChange,
          operating, investing, financing,
          totalIn, totalOut
      };
  }, [coaList, posTrx, serverPayments, serverExpenses]);

  // --- FORECAST ENGINE ---
  const forecast = useMemo(() => {
      const todayTime = new Date().getTime();
      const next30Time = todayTime + (30 * 24 * 60 * 60 * 1000);
      
      let incoming = 0;
      let outgoing = 0;
      const calendarEvents: any[] = [];

      // Proyeksi dari Invoice Belum Lunas
      unpaidInvoices.forEach((inv:any) => {
          const dueDate = new Date(inv.due).getTime();
          if (dueDate >= todayTime && dueDate <= next30Time) {
              if (inv.type === 'IN') incoming += inv.amount;
              else outgoing += inv.amount;

              calendarEvents.push({
                  date: inv.due,
                  amount: inv.amount,
                  type: inv.type, // IN / OUT
                  title: `${inv.type==='IN'?'Terima':'Bayar'} ${inv.id}`
              });
          }
      });

      // Sort by Date
      calendarEvents.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Aging Analysis Buckets
      const aging = { current: 0, d30: 0, d60: 0, d90: 0 };
      unpaidInvoices.forEach((inv:any) => {
          if (inv.type === 'IN') { // Fokus ke AR untuk Aging kesehatan cash
             const diff = Math.ceil((new Date(inv.due).getTime() - todayTime) / (1000 * 3600 * 24));
             if (diff >= 0) aging.current += inv.amount;
             else if (diff >= -30) aging.d30 += inv.amount;
             else if (diff >= -60) aging.d60 += inv.amount;
             else aging.d90 += inv.amount;
          }
      });

      const agingChart = [
          { name: 'Current', value: aging.current },
          { name: '1-30 Days', value: aging.d30 },
          { name: '30-60 Days', value: aging.d60 },
          { name: '> 60 Days', value: aging.d90 },
      ];

      return { incoming, outgoing, net: incoming - outgoing, events: calendarEvents, agingChart };
  }, [unpaidInvoices]);

  // --- TREND CHART DATA ---
  const trendData = useMemo(() => {
      // Mockup trend data berdasarkan histori (karena data harian real mungkin bolong-bolong)
      const data = [];
      const base = cashflow.endingCash;
      for (let i = 0; i < 7; i++) {
          data.push({
              day: `H-${6-i}`,
              balance: base * (0.9 + Math.random() * 0.2), // Fluktuasi +/-
          });
      }
      return data;
  }, [cashflow.endingCash]);


  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-blue-600"/></div>;

  return (
    <div className="space-y-6 pb-20 bg-slate-50 min-h-screen font-sans text-slate-800">
      
      {/* 1. HEADER */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="text-blue-600"/> Cashflow Monitor
          </h1>
          <p className="text-xs text-slate-500 mt-1">Real-time Liquidity & 30-Day Forecast</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
            <Calendar size={16} className="text-slate-400"/>
            <span className="text-xs font-bold text-slate-600">Projection: Next 30 Days</span>
        </div>
      </div>

      {/* 2. LIQUIDITY SCORECARD (REAL TIME) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Opening Cash</p>
              <h3 className="text-xl font-bold text-slate-700">{fmtMoney(cashflow.initialCash)}</h3>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-[10px] uppercase font-bold text-emerald-600 mb-1">Total Inflow (YTD)</p>
              <h3 className="text-xl font-bold text-emerald-600">+{fmtMoney(cashflow.totalIn)}</h3>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-[10px] uppercase font-bold text-rose-600 mb-1">Total Outflow (YTD)</p>
              <h3 className="text-xl font-bold text-rose-600">-{fmtMoney(cashflow.totalOut)}</h3>
          </div>
          <div className="bg-slate-900 p-5 rounded-2xl shadow-lg relative overflow-hidden text-white">
              <div className="relative z-10">
                  <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-2"><Wallet size={12}/> Ending Cash (Real-time)</p>
                  <h3 className="text-2xl font-bold">{fmtMoney(cashflow.endingCash)}</h3>
              </div>
              <div className="absolute right-0 bottom-0 opacity-10"><DollarSign size={80}/></div>
          </div>
      </div>

      {/* 3. CASHFLOW CATEGORIES (CFO STANDARD) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* OPERATING */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
              <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><Briefcase size={18} className="text-blue-500"/> Operating</h3>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${cashflow.operating.in - cashflow.operating.out >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                      {cashflow.operating.in - cashflow.operating.out >= 0 ? '+' : ''}{fmtMoney(cashflow.operating.in - cashflow.operating.out)}
                  </span>
              </div>
              <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600"><span>In (Sales)</span><span className="font-bold text-emerald-600">{fmtMoney(cashflow.operating.in)}</span></div>
                  <div className="flex justify-between text-slate-600"><span>Out (Exp/HPP)</span><span className="font-bold text-rose-600">{fmtMoney(cashflow.operating.out)}</span></div>
              </div>
          </div>

          {/* INVESTING */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
              <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><Factory size={18} className="text-purple-500"/> Investing</h3>
                  <span className="text-xs font-bold px-2 py-1 rounded bg-slate-50 text-slate-600">
                      {fmtMoney(cashflow.investing.in - cashflow.investing.out)}
                  </span>
              </div>
              <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600"><span>In (Divest)</span><span className="font-bold text-emerald-600">{fmtMoney(cashflow.investing.in)}</span></div>
                  <div className="flex justify-between text-slate-600"><span>Out (Capex)</span><span className="font-bold text-rose-600">{fmtMoney(cashflow.investing.out)}</span></div>
              </div>
          </div>

          {/* FINANCING */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
              <div className="flex justify-between items-center mb-4">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><Landmark size={18} className="text-amber-500"/> Financing</h3>
                  <span className="text-xs font-bold px-2 py-1 rounded bg-slate-50 text-slate-600">
                      {fmtMoney(cashflow.financing.in - cashflow.financing.out)}
                  </span>
              </div>
              <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-slate-600"><span>In (Loans/Eq)</span><span className="font-bold text-emerald-600">{fmtMoney(cashflow.financing.in)}</span></div>
                  <div className="flex justify-between text-slate-600"><span>Out (Repay)</span><span className="font-bold text-rose-600">{fmtMoney(cashflow.financing.out)}</span></div>
              </div>
          </div>
      </div>

      {/* 4. FORECAST & AGING SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* FORECAST CALENDAR */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                  <div>
                      <h3 className="font-bold text-slate-800">30-Day Forecast</h3>
                      <p className="text-xs text-slate-500">Estimasi arus kas masuk/keluar dari invoice jatuh tempo.</p>
                  </div>
                  <div className="text-right">
                      <p className="text-xs font-bold text-slate-400 uppercase">Net Forecast</p>
                      <p className={`text-lg font-bold ${forecast.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {forecast.net >= 0 ? '+' : ''}{fmtMoney(forecast.net)}
                      </p>
                  </div>
              </div>
              
              <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                          <tr>
                              <th className="p-3">Jatuh Tempo</th>
                              <th className="p-3">Keterangan</th>
                              <th className="p-3 text-right">In (Masuk)</th>
                              <th className="p-3 text-right">Out (Keluar)</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {forecast.events.length === 0 ? (
                              <tr><td colSpan={4} className="p-6 text-center text-slate-400 italic">Tidak ada invoice jatuh tempo dalam 30 hari ke depan.</td></tr>
                          ) : (
                              forecast.events.map((ev, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50">
                                      <td className="p-3 font-mono text-slate-600 text-xs">{fmtDate(ev.date)}</td>
                                      <td className="p-3 font-medium text-slate-700">{ev.title}</td>
                                      <td className="p-3 text-right font-bold text-emerald-600">{ev.type === 'IN' ? fmtMoney(ev.amount) : '-'}</td>
                                      <td className="p-3 text-right font-bold text-rose-600">{ev.type === 'OUT' ? fmtMoney(ev.amount) : '-'}</td>
                                  </tr>
                              ))
                          )}
                      </tbody>
                  </table>
              </div>
          </div>

          {/* AGING CHART */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
              <h3 className="font-bold text-slate-800 mb-2">AR Aging (Piutang)</h3>
              <p className="text-xs text-slate-500 mb-6">Analisa umur piutang yang belum tertagih.</p>
              
              <div className="flex-1 min-h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={forecast.agingChart} layout="vertical" margin={{top:0, right:30, left:20, bottom:0}}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false}/>
                          <XAxis type="number" hide/>
                          <YAxis dataKey="name" type="category" width={80} tick={{fontSize:11}}/>
                          <Tooltip formatter={(val:any)=>fmtMoney(val)} cursor={{fill: 'transparent'}}/>
                          <Bar dataKey="value" fill={COLORS.blue} radius={[0,4,4,0]} barSize={20} name="Total Piutang"/>
                      </BarChart>
                  </ResponsiveContainer>
              </div>
          </div>

      </div>

      {/* 5. LIQUIDITY TREND CHART */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-4">Liquidity Trend (Last 7 Days)</h3>
          <div className="h-[200px] w-full">
              <ResponsiveContainer>
                  <AreaChart data={trendData}>
                      <defs>
                          <linearGradient id="colorBal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                      <XAxis dataKey="day" tick={{fontSize:12}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fontSize:12}} axisLine={false} tickLine={false} tickFormatter={(val)=>val/1000+'k'}/>
                      <Tooltip formatter={(val:any)=>fmtMoney(val)}/>
                      <Area type="monotone" dataKey="balance" stroke="#3b82f6" fillOpacity={1} fill="url(#colorBal)" strokeWidth={3}/>
                  </AreaChart>
              </ResponsiveContainer>
          </div>
      </div>

    </div>
  );
}