'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  Factory, Store, Briefcase, Truck, 
  Calculator, Target, TrendingUp, Save, RefreshCw, 
  AlertCircle, CheckCircle2, ArrowRight, DollarSign
} from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area, ComposedChart 
} from 'recharts';

// --- TYPES & DEFAULTS ---
type IndustryType = 'MANUFACTURER' | 'TRADER' | 'SERVICE' | 'SUPPLY_CHAIN';

interface ScenarioParams {
  industry: IndustryType;
  durationMonths: number;
  initialCapex: number; // Modal Awal (Bangunan, Mesin, Renovasi)
  initialOpex: number; // Biaya Tetap per Bulan (Gaji, Sewa)
  variableCostPerUnit: number; // HPP per unit
  sellingPrice: number; // Harga Jual per unit
  startVolume: number; // Volume bulan pertama
  growthRate: number; // Pertumbuhan % per bulan
  targetMargin: number; // Target Profit Margin (%) untuk simulasi efisiensi
}

const DEFAULT_PARAMS: ScenarioParams = {
  industry: 'MANUFACTURER',
  durationMonths: 24,
  initialCapex: 500000000, // 500 Juta
  initialOpex: 25000000,   // 25 Juta/bln
  variableCostPerUnit: 50000,
  sellingPrice: 100000,
  startVolume: 500,
  growthRate: 5, // 5% per bulan
  targetMargin: 20 // Target Net Profit 20%
};

export default function BusinessPlanningPage() {
  
  // STATE
  const [params, setParams] = useState<ScenarioParams>(DEFAULT_PARAMS);
  const [activeTab, setActiveTab] = useState<'SIMULATION' | 'EFFICIENCY'>('SIMULATION');

  // FORMATTER
  const fmtMoney = (n: number) => "Rp " + n.toLocaleString('id-ID');
  const fmtCompact = (n: number) => {
      if (Math.abs(n) >= 1000000000) return (n / 1000000000).toFixed(1) + "M";
      if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(1) + "Jt";
      return (n / 1000).toFixed(0) + "K";
  };

  // --- ENGINE: PROJECTION CALCULATOR ---
  const projection = useMemo(() => {
      const data = [];
      let cumulativeCash = -params.initialCapex; // Start minus modal awal
      let totalRevenue = 0;
      let totalCost = 0;
      let bepMonth = -1;

      for (let m = 1; m <= params.durationMonths; m++) {
          // Growth Logic (Simple Compounding)
          const volume = Math.floor(params.startVolume * Math.pow((1 + params.growthRate/100), m-1));
          
          const revenue = volume * params.sellingPrice;
          const cogs = volume * params.variableCostPerUnit;
          const opex = params.initialOpex; // Simplified fixed opex
          const totalExpense = cogs + opex;
          const netProfit = revenue - totalExpense;

          cumulativeCash += netProfit;

          // Detect BEP (Payback Period)
          if (cumulativeCash >= 0 && bepMonth === -1) bepMonth = m;

          totalRevenue += revenue;
          totalCost += totalExpense;

          data.push({
              month: `M${m}`,
              Volume: volume,
              Revenue: revenue,
              Expense: totalExpense,
              Profit: netProfit,
              Cashflow: cumulativeCash
          });
      }

      // ROI Calculation
      const totalProfit = data.reduce((acc, curr) => acc + curr.Profit, 0);
      const roi = (totalProfit / params.initialCapex) * 100;
      
      // Total Capital Needed (Capex + Burn Rate until Positive Cashflow)
      // Mencari titik terendah cashflow (Valley of death)
      const minCashflow = Math.min(...data.map(d => d.Cashflow));
      const workingCapitalNeeded = minCashflow < -params.initialCapex ? Math.abs(minCashflow + params.initialCapex) : 0;
      const totalInvestment = params.initialCapex + workingCapitalNeeded;

      return { data, bepMonth, roi, totalRevenue, totalCost, totalProfit, totalInvestment, workingCapitalNeeded };
  }, [params]);

  // --- ENGINE: EFFICIENCY SIMULATOR (TARGETING) ---
  const efficiency = useMemo(() => {
      // Current Metrics (Average per month)
      const avgRev = projection.totalRevenue / params.durationMonths;
      const avgCost = projection.totalCost / params.durationMonths;
      const currentMargin = ((avgRev - avgCost) / avgRev) * 100;

      // Target Metrics
      // Target Profit = Revenue * (Target% / 100)
      // Allowable Cost = Revenue - Target Profit
      const targetProfit = avgRev * (params.targetMargin / 100);
      const allowableCost = avgRev - targetProfit;
      const reductionNeeded = avgCost - allowableCost;
      const reductionPercent = (reductionNeeded / avgCost) * 100;

      return { avgRev, avgCost, currentMargin, allowableCost, reductionNeeded, reductionPercent };
  }, [projection, params.targetMargin, params.durationMonths]);

  // --- UI HELPERS ---
  const getIndustryIcon = () => {
      switch (params.industry) {
          case 'MANUFACTURER': return <Factory size={20} className="text-blue-600"/>;
          case 'TRADER': return <Store size={20} className="text-emerald-600"/>;
          case 'SERVICE': return <Briefcase size={20} className="text-purple-600"/>;
          case 'SUPPLY_CHAIN': return <Truck size={20} className="text-amber-600"/>;
      }
  };

  return (
    <div className="space-y-6 pb-20 bg-slate-50 min-h-screen font-sans text-slate-800">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
             <Calculator className="text-blue-600"/> Business Planner & Simulator
          </h1>
          <p className="text-slate-500 text-xs mt-1">Financial Trajectory & Investment Analysis (Sandbox Mode)</p>
        </div>
        
        {/* INDUSTRY SELECTOR */}
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
            {(['MANUFACTURER', 'TRADER', 'SERVICE', 'SUPPLY_CHAIN'] as IndustryType[]).map((ind) => (
                <button 
                    key={ind}
                    onClick={() => setParams({...params, industry: ind})}
                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all ${params.industry === ind ? 'bg-white shadow text-blue-700' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    {ind === 'MANUFACTURER' && <Factory size={12}/>}
                    {ind === 'TRADER' && <Store size={12}/>}
                    {ind === 'SERVICE' && <Briefcase size={12}/>}
                    {ind === 'SUPPLY_CHAIN' && <Truck size={12}/>}
                    {ind.replace('_', ' ')}
                </button>
            ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT: INPUT PARAMETERS */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit">
              <div className="flex justify-between items-center mb-4 border-b pb-2">
                  <h3 className="font-bold text-slate-800">Simulation Variables</h3>
                  <button onClick={()=>setParams(DEFAULT_PARAMS)} title="Reset" className="text-slate-400 hover:text-slate-600"><RefreshCw size={14}/></button>
              </div>
              
              <div className="space-y-4">
                  <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Initial CAPEX (Modal Awal)</label>
                      <div className="flex items-center bg-slate-50 border rounded px-2">
                          <span className="text-xs text-slate-400">Rp</span>
                          <input type="number" className="w-full bg-transparent p-2 text-sm font-mono outline-none" value={params.initialCapex} onChange={e=>setParams({...params, initialCapex: parseInt(e.target.value)||0})}/>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Bangunan, Mesin, Renovasi, License.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Fixed OPEX / Month</label>
                          <input type="number" className="w-full border p-2 text-sm rounded" value={params.initialOpex} onChange={e=>setParams({...params, initialOpex: parseInt(e.target.value)||0})}/>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Var. Cost / Unit</label>
                          <input type="number" className="w-full border p-2 text-sm rounded" value={params.variableCostPerUnit} onChange={e=>setParams({...params, variableCostPerUnit: parseInt(e.target.value)||0})}/>
                      </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Selling Price</label>
                          <input type="number" className="w-full border p-2 text-sm rounded" value={params.sellingPrice} onChange={e=>setParams({...params, sellingPrice: parseInt(e.target.value)||0})}/>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Start Volume</label>
                          <input type="number" className="w-full border p-2 text-sm rounded" value={params.startVolume} onChange={e=>setParams({...params, startVolume: parseInt(e.target.value)||0})}/>
                      </div>
                  </div>

                  <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Monthly Growth Rate (%)</label>
                      <input type="range" min="0" max="50" className="w-full accent-blue-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer" value={params.growthRate} onChange={e=>setParams({...params, growthRate: parseInt(e.target.value)||0})}/>
                      <div className="text-right text-xs font-bold text-blue-600">{params.growthRate}% per month</div>
                  </div>

                  <div className="pt-4 mt-4 border-t">
                      <label className="block text-xs font-bold text-slate-500 mb-1">Target Net Profit Margin (%)</label>
                      <div className="flex items-center gap-2">
                          <input type="number" className="w-20 border p-1 text-sm rounded text-center" value={params.targetMargin} onChange={e=>setParams({...params, targetMargin: parseInt(e.target.value)||0})}/>
                          <span className="text-xs text-slate-400">For efficiency simulation</span>
                      </div>
                  </div>
              </div>
          </div>

          {/* RIGHT: OUTPUT DASHBOARD */}
          <div className="col-span-1 lg:col-span-2 space-y-6">
              
              {/* 1. INVESTMENT VERDICT CARDS */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-slate-900 text-white p-4 rounded-xl shadow-lg">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">Total Investment Needed</p>
                      <h3 className="text-xl font-bold mt-1">{fmtCompact(projection.totalInvestment)}</h3>
                      <p className="text-[10px] text-blue-300 mt-1">CAPEX + {fmtCompact(projection.workingCapitalNeeded)} WC</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">Payback Period (BEP)</p>
                      <h3 className={`text-xl font-bold mt-1 ${projection.bepMonth === -1 ? 'text-slate-400' : 'text-emerald-600'}`}>
                          {projection.bepMonth === -1 ? '> 24 Mo' : `${projection.bepMonth} Months`}
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-1">Time to break even</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">2-Year ROI</p>
                      <h3 className={`text-xl font-bold mt-1 ${projection.roi > 0 ? 'text-blue-600' : 'text-rose-600'}`}>
                          {projection.roi.toFixed(1)}%
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-1">Return on Investment</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total Net Profit</p>
                      <h3 className="text-xl font-bold mt-1 text-slate-800">{fmtCompact(projection.totalProfit)}</h3>
                      <p className="text-[10px] text-slate-400 mt-1">Accumulated (24 Mo)</p>
                  </div>
              </div>

              {/* 2. TABS: SIMULATION vs EFFICIENCY */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-h-[400px]">
                  <div className="flex border-b">
                      <button onClick={()=>setActiveTab('SIMULATION')} className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab==='SIMULATION' ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}>Trajectory Simulation</button>
                      <button onClick={()=>setActiveTab('EFFICIENCY')} className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab==='EFFICIENCY' ? 'bg-purple-50 text-purple-600 border-b-2 border-purple-600' : 'text-slate-500 hover:bg-slate-50'}`}>Target & Cost Efficiency</button>
                  </div>

                  <div className="p-6">
                      {activeTab === 'SIMULATION' && (
                          <div className="space-y-6">
                              <div className="flex justify-between items-center">
                                  <h4 className="font-bold text-slate-700 flex items-center gap-2"><TrendingUp size={18}/> Financial J-Curve (24 Months)</h4>
                                  <div className="flex gap-4 text-xs">
                                      <span className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-full"></div> Revenue</span>
                                      <span className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-full"></div> Cashflow (Kumulatif)</span>
                                  </div>
                              </div>
                              <div className="h-[300px] w-full">
                                  <ResponsiveContainer>
                                      <ComposedChart data={projection.data}>
                                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
                                          <XAxis dataKey="month" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                                          <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                                          {/* FIX: Using 'any' type for formatter to satisfy TS */}
                                          <Tooltip contentStyle={{borderRadius:'8px', fontSize:'12px'}} formatter={(val: any) => fmtCompact(Number(val))}/>
                                          <Area type="monotone" dataKey="Revenue" fill="#10b981" stroke="#10b981" fillOpacity={0.1} />
                                          <Line type="monotone" dataKey="Cashflow" stroke="#3b82f6" strokeWidth={3} dot={false}/>
                                          <Line type="monotone" dataKey="Expense" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" dot={false}/>
                                      </ComposedChart>
                                  </ResponsiveContainer>
                              </div>
                              <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 text-xs text-yellow-800 flex items-start gap-2">
                                  <AlertCircle size={16} className="mt-0.5 shrink-0"/>
                                  <p>Garis Biru (Cashflow) dimulai negatif karena CAPEX. Titik di mana garis biru menembus angka 0 adalah <strong>Break Even Point (BEP)</strong>. Jika garis merah (Expense) di atas hijau (Revenue), bisnis mengalami kerugian operasional (Burn Rate).</p>
                              </div>
                          </div>
                      )}

                      {activeTab === 'EFFICIENCY' && (
                          <div className="space-y-8 animate-in fade-in">
                              <div className="grid grid-cols-2 gap-8">
                                  <div className="space-y-4">
                                      <div className="flex justify-between items-center">
                                          <span className="text-sm font-bold text-slate-500">Current Margin (Avg)</span>
                                          <span className="text-xl font-bold text-slate-800">{efficiency.currentMargin.toFixed(1)}%</span>
                                      </div>
                                      <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden">
                                          <div className={`h-full ${efficiency.currentMargin >= params.targetMargin ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{width: `${Math.min(efficiency.currentMargin, 100)}%`}}></div>
                                      </div>
                                      
                                      <div className="flex justify-between items-center mt-6">
                                          <span className="text-sm font-bold text-slate-500">Target Margin</span>
                                          <span className="text-xl font-bold text-blue-600">{params.targetMargin.toFixed(1)}%</span>
                                      </div>
                                      <div className="w-full bg-slate-100 h-4 rounded-full overflow-hidden relative">
                                          <div className="h-full bg-blue-200 w-full absolute top-0 left-0 opacity-30"></div>
                                          <div className="h-full bg-blue-600" style={{width: `${Math.min(params.targetMargin, 100)}%`}}></div>
                                      </div>
                                  </div>

                                  <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col justify-center">
                                      <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2"><Target size={18} className="text-rose-600"/> Cost Efficiency Required</h4>
                                      
                                      {efficiency.reductionNeeded > 0 ? (
                                          <>
                                            <p className="text-sm text-slate-600 mb-4">Untuk mencapai target profit <strong>{params.targetMargin}%</strong>, Anda harus memangkas biaya sebesar:</p>
                                            <div className="text-3xl font-bold text-rose-600">{fmtMoney(efficiency.reductionNeeded)} <span className="text-sm font-normal text-slate-500">/ bulan</span></div>
                                            <div className="mt-2 text-sm font-bold text-rose-500">
                                                (Turunkan Cost sebesar {efficiency.reductionPercent.toFixed(1)}%)
                                            </div>
                                          </>
                                      ) : (
                                          <div className="text-center py-4">
                                              <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-2"/>
                                              <p className="font-bold text-emerald-700">Target Tercapai!</p>
                                              <p className="text-xs text-emerald-600">Margin saat ini sudah di atas target.</p>
                                          </div>
                                      )}
                                  </div>
                              </div>

                              <div className="bg-white border-t pt-6">
                                  <h4 className="font-bold text-slate-700 mb-4">Simulasi Optimasi Cost (Saran Sistem)</h4>
                                  <div className="grid grid-cols-2 gap-4">
                                      <div className="p-3 border rounded-lg">
                                          <p className="text-xs text-slate-500 font-bold uppercase mb-1">Opsi A: Tekan HPP (Variable)</p>
                                          <p className="text-xs text-slate-600">Harga bahan baku/beli harus turun menjadi:</p>
                                          <p className="text-lg font-bold text-slate-800">{fmtMoney(params.variableCostPerUnit * (1 - efficiency.reductionPercent/100))}</p>
                                      </div>
                                      <div className="p-3 border rounded-lg">
                                          <p className="text-xs text-slate-500 font-bold uppercase mb-1">Opsi B: Tekan Opex (Fixed)</p>
                                          <p className="text-xs text-slate-600">Biaya operasional bulanan max:</p>
                                          <p className="text-lg font-bold text-slate-800">{fmtMoney(params.initialOpex - efficiency.reductionNeeded)}</p>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
              </div>

              {/* 3. INDUSTRY SPECIFIC METRICS */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 text-slate-700">
                      {getIndustryIcon()}
                      <h3 className="font-bold text-lg">
                          {params.industry === 'MANUFACTURER' ? 'Production Metrics' : 
                           params.industry === 'TRADER' ? 'Retail / Trading Metrics' :
                           params.industry === 'SERVICE' ? 'Service Agency Metrics' : 'Supply Chain Metrics'}
                      </h3>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-6 text-sm">
                      {params.industry === 'MANUFACTURER' && (
                          <>
                            <MetricBox label="Avg Production Volume" val={`${Math.round(projection.totalRevenue/params.sellingPrice/params.durationMonths)} units/mo`}/>
                            <MetricBox label="Machine Utilization (Est)" val={`${Math.min(100, (params.startVolume*2/1000)*100).toFixed(0)}%`}/>
                            <MetricBox label="Unit Cost (HPP)" val={fmtMoney(params.variableCostPerUnit)}/>
                          </>
                      )}
                      {params.industry === 'TRADER' && (
                          <>
                            <MetricBox label="Break Even Sales Volume" val={`${Math.round(params.initialOpex / (params.sellingPrice - params.variableCostPerUnit))} units/mo`}/>
                            <MetricBox label="Inventory Turnover (Est)" val="4.5x / year"/>
                            <MetricBox label="Gross Margin per Unit" val={fmtMoney(params.sellingPrice - params.variableCostPerUnit)}/>
                          </>
                      )}
                      {params.industry === 'SERVICE' && (
                          <>
                            <MetricBox label="Min Billable Hours" val={`${Math.round(params.initialOpex / (params.sellingPrice))} hrs`}/>
                            <MetricBox label="Manpower Efficiency" val="85%"/>
                            <MetricBox label="Cost per Service Hour" val={fmtMoney(params.variableCostPerUnit)}/>
                          </>
                      )}
                      {params.industry === 'SUPPLY_CHAIN' && (
                          <>
                            <MetricBox label="Cost per Km / Trip" val={fmtMoney(params.variableCostPerUnit)}/>
                            <MetricBox label="Logistics Volume" val={`${params.startVolume} trips/mo`}/>
                            <MetricBox label="Fleet Optimization" val="High"/>
                          </>
                      )}
                  </div>
              </div>

          </div>
      </div>
    </div>
  );
}

function MetricBox({label, val}: any) {
    return (
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
            <p className="text-xs text-slate-500 mb-1">{label}</p>
            <p className="font-bold text-slate-800 text-lg">{val}</p>
        </div>
    );
}