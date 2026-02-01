'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  Factory, Store, Briefcase, Truck, 
  Calculator, Target, TrendingUp, Save, RefreshCw, 
  AlertCircle, CheckCircle2, ArrowRight, DollarSign, 
  ShieldCheck, FolderOpen, FileText, PlusCircle, Trash2, PieChart
} from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ComposedChart 
} from 'recharts';

// --- TYPES ---
type IndustryType = 'MANUFACTURER' | 'TRADER' | 'SERVICE' | 'SUPPLY_CHAIN';
type SimulationMode = 'NEW_BUSINESS' | 'BRANCH_EXPANSION' | 'PRODUCT_LAUNCH';

interface ScenarioParams {
  id?: string;
  name: string;
  mode: SimulationMode;
  industry: IndustryType;
  durationMonths: number;
  
  // Financials
  initialCapex: number; // Modal Awal
  initialOpex: number; // Biaya Tetap per Bulan
  variableCostPerUnit: number; // HPP
  sellingPrice: number; // Harga Jual
  
  // Growth
  startVolume: number; 
  growthRate: number; // %
  targetMargin: number; // %
}

interface SavedScenario {
  id: string;
  name: string;
  date: string;
  params: ScenarioParams;
}

const DEFAULT_PARAMS: ScenarioParams = {
  name: 'Skenario Tanpa Judul',
  mode: 'NEW_BUSINESS',
  industry: 'MANUFACTURER',
  durationMonths: 36, // 3 Tahun default
  initialCapex: 500000000, 
  initialOpex: 25000000,   
  variableCostPerUnit: 50000,
  sellingPrice: 100000,
  startVolume: 500,
  growthRate: 5, 
  targetMargin: 20 
};

// --- HELPER ---
const fmtMoney = (n: number) => "Rp " + n.toLocaleString('id-ID');
const fmtCompact = (n: number) => {
    if (Math.abs(n) >= 1000000000) return (n / 1000000000).toFixed(1) + "M";
    if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + "Jt";
    return (n / 1000).toFixed(0) + "K";
};

export default function BusinessPlanningPage() {
  
  // STATE
  const [currentUser, setCurrentUser] = useState({ email: 'loading...', name: 'Loading...' });
  const [params, setParams] = useState<ScenarioParams>(DEFAULT_PARAMS);
  const [activeTab, setActiveTab] = useState<'SIMULATION' | 'PNL' | 'EFFICIENCY'>('SIMULATION');
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [showLoadMenu, setShowLoadMenu] = useState(false);

  // --- 1. INITIALIZE & STORAGE ---
  useEffect(() => {
      const storedUser = localStorage.getItem('METALURGI_USER_SESSION'); 
      if (storedUser) setCurrentUser(JSON.parse(storedUser));
      else setCurrentUser({ email: 'rina@cahaya.com', name: 'Ibu Rina' }); 
  }, []);

  const STORAGE_KEY = useMemo(() => `METALURGI_${currentUser.email}_SCENARIOS`, [currentUser.email]);

  // Load Saved Scenarios
  useEffect(() => {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setSavedScenarios(JSON.parse(saved));
  }, [STORAGE_KEY]);

  // --- ACTIONS ---
  const handleSaveScenario = () => {
      const name = prompt("Beri nama untuk skenario ini:", params.name);
      if (!name) return;

      const newScenario: SavedScenario = {
          id: Date.now().toString(),
          name: name,
          date: new Date().toISOString(),
          params: { ...params, name }
      };

      const updated = [newScenario, ...savedScenarios];
      setSavedScenarios(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setParams({ ...params, name });
      alert("Skenario berhasil disimpan!");
  };

  const handleLoadScenario = (s: SavedScenario) => {
      setParams(s.params);
      setShowLoadMenu(false);
  };

  const handleDeleteScenario = (id: string, e: any) => {
      e.stopPropagation();
      if(!confirm("Hapus skenario ini?")) return;
      const updated = savedScenarios.filter(s => s.id !== id);
      setSavedScenarios(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  // --- ENGINE: MONTHLY PROJECTION ---
  const projection = useMemo(() => {
      const data = [];
      let cumulativeCash = -params.initialCapex; 
      let totalRevenue = 0;
      let totalCost = 0;
      let totalNetProfit = 0;
      let bepMonth = -1;

      for (let m = 1; m <= params.durationMonths; m++) {
          // Growth Logic
          const volume = Math.floor(params.startVolume * Math.pow((1 + params.growthRate/100), m-1));
          
          const revenue = volume * params.sellingPrice;
          const cogs = volume * params.variableCostPerUnit;
          const grossProfit = revenue - cogs;
          const opex = params.initialOpex; 
          const netProfit = grossProfit - opex;

          cumulativeCash += netProfit;

          if (cumulativeCash >= 0 && bepMonth === -1) bepMonth = m;

          totalRevenue += revenue;
          totalCost += (cogs + opex);
          totalNetProfit += netProfit;

          data.push({
              month: m,
              label: `Bln ${m}`,
              Volume: volume,
              Revenue: revenue,
              COGS: cogs,
              GrossProfit: grossProfit,
              Opex: opex,
              NetProfit: netProfit,
              Cashflow: cumulativeCash
          });
      }

      // ROI Calculation
      const roi = params.initialCapex > 0 ? (totalNetProfit / params.initialCapex) * 100 : 0;
      
      // Valley of Death (Max Capital Needed)
      const minCashflow = Math.min(...data.map(d => d.Cashflow));
      const workingCapitalNeeded = minCashflow < -params.initialCapex ? Math.abs(minCashflow + params.initialCapex) : 0;
      const totalInvestment = params.initialCapex + workingCapitalNeeded;

      return { data, bepMonth, roi, totalRevenue, totalCost, totalNetProfit, totalInvestment, workingCapitalNeeded };
  }, [params]);

  // --- ENGINE: PRO FORMA P&L (YEARLY) ---
  const proForma = useMemo(() => {
      const yearly: any[] = [];
      const years = Math.ceil(params.durationMonths / 12);

      for (let y = 1; y <= years; y++) {
          const startM = (y - 1) * 12 + 1;
          const endM = Math.min(y * 12, params.durationMonths);
          
          const slice = projection.data.filter(d => d.month >= startM && d.month <= endM);
          
          const rev = slice.reduce((a,b)=>a+b.Revenue,0);
          const cogs = slice.reduce((a,b)=>a+b.COGS,0);
          const gp = rev - cogs;
          const opex = slice.reduce((a,b)=>a+b.Opex,0);
          const net = gp - opex;

          yearly.push({
              year: `Tahun ${y}`,
              revenue: rev,
              cogs: cogs,
              grossProfit: gp,
              grossMargin: rev > 0 ? (gp/rev)*100 : 0,
              opex: opex,
              netProfit: net,
              netMargin: rev > 0 ? (net/rev)*100 : 0
          });
      }
      return yearly;
  }, [projection, params.durationMonths]);

  // --- ENGINE: EFFICIENCY ---
  const efficiency = useMemo(() => {
      const avgRev = projection.totalRevenue / params.durationMonths;
      const avgCost = projection.totalCost / params.durationMonths;
      const currentMargin = avgRev > 0 ? ((avgRev - avgCost) / avgRev) * 100 : 0;

      const targetProfit = avgRev * (params.targetMargin / 100);
      const allowableCost = avgRev - targetProfit;
      const reductionNeeded = avgCost - allowableCost;
      const reductionPercent = avgCost > 0 ? (reductionNeeded / avgCost) * 100 : 0;

      return { avgRev, avgCost, currentMargin, allowableCost, reductionNeeded, reductionPercent };
  }, [projection, params.targetMargin, params.durationMonths]);

  // UI Helper
  const getContextLabel = () => {
      if (params.mode === 'BRANCH_EXPANSION') return { capex: 'Biaya Renovasi & Sewa', opex: 'Gaji Staff Cabang', product: 'Unit Terjual' };
      if (params.mode === 'PRODUCT_LAUNCH') return { capex: 'R&D & Moulding Cost', opex: 'Marketing Budget', product: 'Qty Sales' };
      return { capex: 'Modal Awal (Bangunan/Mesin)', opex: 'Fixed Cost (Gaji/Sewa)', product: 'Sales Volume' };
  };
  const labels = getContextLabel();

  return (
    <div className="space-y-6 pb-20 bg-slate-50 min-h-screen font-sans text-slate-800">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-5 rounded-xl border border-slate-200 shadow-sm gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
             <Calculator className="text-blue-600"/> Business Planner & Simulator
          </h1>
          <p className="text-slate-500 text-xs mt-1">Simulasi Investasi: Buka Cabang, Produk Baru, atau Bisnis Baru.</p>
        </div>
        
        <div className="flex items-center gap-3">
             <div className="relative">
                <button onClick={()=>setShowLoadMenu(!showLoadMenu)} className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700 transition-all border border-slate-300">
                    <FolderOpen size={14}/> {params.name} <ArrowRight size={10} className="rotate-90"/>
                </button>
                
                {/* LOAD MENU DROPDOWN */}
                {showLoadMenu && (
                    <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                        <div className="p-3 border-b bg-slate-50 text-xs font-bold text-slate-500">SAVED SCENARIOS</div>
                        <div className="max-h-60 overflow-y-auto">
                            {savedScenarios.length === 0 && <div className="p-4 text-center text-xs text-slate-400">Belum ada simpanan.</div>}
                            {savedScenarios.map(s => (
                                <div key={s.id} onClick={()=>handleLoadScenario(s)} className="p-3 hover:bg-blue-50 cursor-pointer border-b border-slate-50 flex justify-between group">
                                    <div>
                                        <div className="font-bold text-slate-700 text-xs">{s.name}</div>
                                        <div className="text-[10px] text-slate-400">{new Date(s.date).toLocaleDateString()}</div>
                                    </div>
                                    <button onClick={(e)=>handleDeleteScenario(s.id, e)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100"><Trash2 size={14}/></button>
                                </div>
                            ))}
                        </div>
                        <button onClick={()=>{setParams({...DEFAULT_PARAMS, id: undefined}); setShowLoadMenu(false)}} className="w-full p-2 text-center text-xs font-bold text-blue-600 hover:bg-blue-50 border-t flex items-center justify-center gap-1"><PlusCircle size={12}/> Buat Baru</button>
                    </div>
                )}
             </div>

             <button onClick={handleSaveScenario} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-bold text-white transition-all shadow-sm">
                <Save size={14}/> Simpan Skenario
             </button>

             <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full border border-blue-100">
                <ShieldCheck size={14} className="text-blue-600"/>
                <span className="text-xs font-bold text-blue-800">Tenant: {currentUser.name}</span>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT: INPUT PARAMETERS */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
              <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2"><PieChart size={18} className="text-slate-400"/> Parameter</h3>
                  <div className="bg-slate-100 p-1 rounded-lg flex gap-1">
                      <select 
                        className="bg-transparent text-[10px] font-bold text-slate-600 outline-none"
                        value={params.industry} 
                        onChange={e=>setParams({...params, industry: e.target.value as IndustryType})}
                      >
                          <option value="MANUFACTURER">🏭 Manufacture</option>
                          <option value="TRADER">🏪 Retail/Trader</option>
                          <option value="SERVICE">💼 Service</option>
                      </select>
                  </div>
              </div>

              {/* SIMULATION MODE */}
              <div className="mb-6 bg-blue-50 p-3 rounded-xl border border-blue-100">
                  <label className="text-[10px] font-bold text-blue-600 uppercase mb-1 block">Tipe Simulasi</label>
                  <div className="flex flex-wrap gap-2">
                      <button onClick={()=>setParams({...params, mode: 'NEW_BUSINESS'})} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${params.mode==='NEW_BUSINESS'?'bg-white border-blue-300 text-blue-700 shadow-sm':'border-transparent text-slate-400 hover:bg-white/50'}`}>Bisnis Baru</button>
                      <button onClick={()=>setParams({...params, mode: 'BRANCH_EXPANSION'})} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${params.mode==='BRANCH_EXPANSION'?'bg-white border-blue-300 text-blue-700 shadow-sm':'border-transparent text-slate-400 hover:bg-white/50'}`}>Buka Cabang</button>
                      <button onClick={()=>setParams({...params, mode: 'PRODUCT_LAUNCH'})} className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${params.mode==='PRODUCT_LAUNCH'?'bg-white border-blue-300 text-blue-700 shadow-sm':'border-transparent text-slate-400 hover:bg-white/50'}`}>Produk Baru</button>
                  </div>
              </div>
              
              <div className="space-y-4">
                  <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">{labels.capex}</label>
                      <div className="flex items-center bg-slate-50 border rounded-lg px-2 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                          <span className="text-xs text-slate-400 font-bold">Rp</span>
                          <input type="number" className="w-full bg-transparent p-2 text-sm font-bold text-slate-700 outline-none" value={params.initialCapex} onChange={e=>setParams({...params, initialCapex: parseInt(e.target.value)||0})}/>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">{labels.opex} / Bln</label>
                          <input type="number" className="w-full border p-2 text-sm rounded-lg font-bold text-slate-700" value={params.initialOpex} onChange={e=>setParams({...params, initialOpex: parseInt(e.target.value)||0})}/>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">HPP Variable / Unit</label>
                          <input type="number" className="w-full border p-2 text-sm rounded-lg font-bold text-slate-700" value={params.variableCostPerUnit} onChange={e=>setParams({...params, variableCostPerUnit: parseInt(e.target.value)||0})}/>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Harga Jual / Unit</label>
                          <input type="number" className="w-full border p-2 text-sm rounded-lg font-bold text-slate-700" value={params.sellingPrice} onChange={e=>setParams({...params, sellingPrice: parseInt(e.target.value)||0})}/>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Awal {labels.product}</label>
                          <input type="number" className="w-full border p-2 text-sm rounded-lg font-bold text-slate-700" value={params.startVolume} onChange={e=>setParams({...params, startVolume: parseInt(e.target.value)||0})}/>
                      </div>
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Pertumbuhan Volume / Bulan (%)</label>
                      <div className="flex items-center gap-3">
                        <input type="range" min="0" max="50" className="flex-1 accent-blue-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" value={params.growthRate} onChange={e=>setParams({...params, growthRate: parseInt(e.target.value)||0})}/>
                        <div className="w-12 text-right text-xs font-bold text-blue-600 bg-blue-50 px-1 py-0.5 rounded">{params.growthRate}%</div>
                      </div>
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Durasi Simulasi (Bulan)</label>
                      <input type="range" min="12" max="60" step="12" className="w-full accent-slate-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" value={params.durationMonths} onChange={e=>setParams({...params, durationMonths: parseInt(e.target.value)||12})}/>
                      <div className="flex justify-between text-[10px] text-slate-400 font-bold px-1 mt-1">
                          <span>1 Thn</span><span>2 Thn</span><span>3 Thn</span><span>4 Thn</span><span>5 Thn</span>
                      </div>
                  </div>
              </div>
          </div>

          {/* RIGHT: OUTPUT DASHBOARD */}
          <div className="col-span-1 lg:col-span-2 space-y-6">
              
              {/* 1. INVESTMENT VERDICT CARDS */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-900 text-white p-4 rounded-xl shadow-lg relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-16 h-16 bg-white/10 rounded-full -mr-8 -mt-8 blur-xl"></div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Total Investment</p>
                      <h3 className="text-xl font-bold mt-1">{fmtCompact(projection.totalInvestment)}</h3>
                      <p className="text-[10px] text-blue-300 mt-1">Capex + Working Capital</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Payback (BEP)</p>
                      <h3 className={`text-xl font-bold mt-1 ${projection.bepMonth === -1 ? 'text-slate-400' : 'text-emerald-600'}`}>
                          {projection.bepMonth === -1 ? 'Never' : `Bulan ke-${projection.bepMonth}`}
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-1">Balik Modal</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">ROI (Total)</p>
                      <h3 className={`text-xl font-bold mt-1 ${projection.roi > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                          {projection.roi.toFixed(1)}%
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-1">Return on Investment</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Net Profit</p>
                      <h3 className={`text-xl font-bold mt-1 ${projection.totalNetProfit > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{fmtCompact(projection.totalNetProfit)}</h3>
                      <p className="text-[10px] text-slate-400 mt-1">Akumulasi {params.durationMonths} Bulan</p>
                  </div>
              </div>

              {/* 2. TABS: SIMULATION vs PNL vs EFFICIENCY */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-h-[400px]">
                  <div className="flex border-b bg-slate-50/50">
                      <button onClick={()=>setActiveTab('SIMULATION')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-all ${activeTab==='SIMULATION' ? 'bg-white text-blue-600 border-b-2 border-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Grafik Proyeksi</button>
                      <button onClick={()=>setActiveTab('PNL')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-all ${activeTab==='PNL' ? 'bg-white text-emerald-600 border-b-2 border-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Pro Forma P&L</button>
                      <button onClick={()=>setActiveTab('EFFICIENCY')} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-all ${activeTab==='EFFICIENCY' ? 'bg-white text-purple-600 border-b-2 border-purple-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>Analisa Target</button>
                  </div>

                  <div className="p-6">
                      {/* TAB 1: CHART */}
                      {activeTab === 'SIMULATION' && (
                          <div className="space-y-6 animate-in fade-in">
                              <div className="flex justify-between items-center">
                                  <h4 className="font-bold text-slate-700 flex items-center gap-2"><TrendingUp size={18}/> Financial Trajectory</h4>
                                  <div className="flex gap-4 text-[10px] font-bold">
                                      <span className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-full"></div> Revenue</span>
                                      <span className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-full"></div> Cashflow</span>
                                  </div>
                              </div>
                              <div className="h-[300px] w-full">
                                  <ResponsiveContainer>
                                      <ComposedChart data={projection.data}>
                                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                                          <XAxis dataKey="label" tick={{fontSize:10}} axisLine={false} tickLine={false} interval={Math.floor(params.durationMonths/6)}/>
                                          <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} tickFormatter={(val)=>fmtCompact(Number(val))}/>
                                          <Tooltip contentStyle={{borderRadius:'8px', fontSize:'12px'}} formatter={(val: any) => fmtMoney(Number(val))}/>
                                          <Area type="monotone" dataKey="Revenue" fill="#10b981" stroke="#10b981" fillOpacity={0.1} />
                                          <Line type="monotone" dataKey="Cashflow" stroke="#3b82f6" strokeWidth={3} dot={false}/>
                                          <Line type="monotone" dataKey="NetProfit" name="Net Profit" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 5" dot={false}/>
                                      </ComposedChart>
                                  </ResponsiveContainer>
                              </div>
                              <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-xs text-blue-800 flex items-start gap-2">
                                  <AlertCircle size={16} className="mt-0.5 shrink-0"/>
                                  <p>Garis <strong>Biru (Cashflow)</strong> dimulai negatif sebesar modal awal. Titik potong garis biru dengan angka 0 adalah BEP. Garis <strong>Ungu putus-putus</strong> adalah Profit Bulanan.</p>
                              </div>
                          </div>
                      )}

                      {/* TAB 2: PRO FORMA P&L */}
                      {activeTab === 'PNL' && (
                          <div className="animate-in fade-in">
                             <div className="flex justify-between items-end mb-4">
                                <h4 className="font-bold text-slate-700 flex items-center gap-2"><FileText size={18}/> Proyeksi Laba Rugi Tahunan</h4>
                                <span className="text-[10px] text-slate-400 italic">*Angka dalam format (Juta/Miliar)</span>
                             </div>
                             <div className="overflow-x-auto border border-slate-200 rounded-xl">
                                <table className="w-full text-sm text-right">
                                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                                        <tr>
                                            <th className="p-3 text-left w-40">Item</th>
                                            {proForma.map(y => <th key={y.year} className="p-3 bg-slate-100 border-l border-white">{y.year}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        <tr>
                                            <td className="p-3 text-left font-bold text-slate-700">Revenue (Omzet)</td>
                                            {proForma.map(y => <td key={y.year} className="p-3 font-bold text-slate-800 border-l border-slate-50">{fmtCompact(y.revenue)}</td>)}
                                        </tr>
                                        <tr className="text-slate-500">
                                            <td className="p-3 text-left pl-6">COGS (HPP)</td>
                                            {proForma.map(y => <td key={y.year} className="p-3 border-l border-slate-50 text-rose-500">({fmtCompact(y.cogs)})</td>)}
                                        </tr>
                                        <tr className="bg-slate-50/50">
                                            <td className="p-3 text-left font-bold text-slate-600">Gross Profit</td>
                                            {proForma.map(y => <td key={y.year} className="p-3 font-bold text-slate-700 border-l border-slate-50">{fmtCompact(y.grossProfit)}</td>)}
                                        </tr>
                                        <tr>
                                            <td className="p-3 text-left text-[10px] text-slate-400 uppercase font-bold">Gross Margin %</td>
                                            {proForma.map(y => <td key={y.year} className="p-3 text-xs text-slate-400 border-l border-slate-50 italic">{y.grossMargin.toFixed(1)}%</td>)}
                                        </tr>
                                        <tr className="text-slate-500">
                                            <td className="p-3 text-left pl-6">OPEX (Fixed)</td>
                                            {proForma.map(y => <td key={y.year} className="p-3 border-l border-slate-50 text-rose-500">({fmtCompact(y.opex)})</td>)}
                                        </tr>
                                        <tr className={`bg-slate-100 font-bold border-t-2 border-slate-200`}>
                                            <td className="p-3 text-left text-slate-800">NET PROFIT</td>
                                            {proForma.map(y => <td key={y.year} className={`p-3 border-l border-white ${y.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{fmtCompact(y.netProfit)}</td>)}
                                        </tr>
                                    </tbody>
                                </table>
                             </div>
                          </div>
                      )}

                      {/* TAB 3: EFFICIENCY */}
                      {activeTab === 'EFFICIENCY' && (
                          <div className="space-y-8 animate-in fade-in">
                              <div className="flex items-center justify-between border-b pb-4">
                                 <div>
                                    <h4 className="font-bold text-slate-700">Simulator Efisiensi</h4>
                                    <p className="text-xs text-slate-500">Berapa biaya yang harus dipangkas untuk mencapai target margin?</p>
                                 </div>
                                 <div className="text-right">
                                    <p className="text-[10px] font-bold uppercase text-slate-400">Target Net Margin</p>
                                    <div className="flex items-center gap-2 justify-end">
                                        <input type="number" className="w-16 border rounded p-1 text-right font-bold text-blue-600 text-sm" value={params.targetMargin} onChange={e=>setParams({...params, targetMargin: parseFloat(e.target.value)||0})}/>
                                        <span className="font-bold text-slate-600">%</span>
                                    </div>
                                 </div>
                              </div>

                              <div className="grid grid-cols-2 gap-8">
                                  <div className="space-y-4">
                                      <div className="flex justify-between items-center">
                                          <span className="text-sm font-bold text-slate-500">Current Margin (Avg)</span>
                                          <span className="text-xl font-bold text-slate-800">{efficiency.currentMargin.toFixed(1)}%</span>
                                      </div>
                                      <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden">
                                          <div className={`h-full ${efficiency.currentMargin >= params.targetMargin ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{width: `${Math.min(efficiency.currentMargin, 100)}%`}}></div>
                                      </div>
                                  </div>

                                  <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col justify-center text-center">
                                      {efficiency.reductionNeeded > 0 ? (
                                          <>
                                            <div className="text-3xl font-bold text-rose-600 mb-1">{fmtMoney(efficiency.reductionNeeded)}</div>
                                            <p className="text-xs text-slate-500">Penghematan per bulan yang dibutuhkan</p>
                                            <div className="mt-4 text-xs font-bold text-rose-500 bg-rose-50 px-3 py-1 rounded-full w-fit mx-auto">
                                                (Turunkan Cost sebesar {efficiency.reductionPercent.toFixed(1)}%)
                                            </div>
                                          </>
                                      ) : (
                                          <>
                                              <CheckCircle2 size={40} className="text-emerald-500 mx-auto mb-2"/>
                                              <p className="font-bold text-emerald-700">Target Tercapai!</p>
                                          </>
                                      )}
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
              </div>

          </div>
      </div>
    </div>
  );
}