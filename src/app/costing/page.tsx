'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  Calculator, TrendingUp, Layers, 
  CheckCircle2, XCircle, Search, Filter, 
  AlertTriangle, Loader2, Factory, Store, Users, Plus, Save,
  History, Eye, FileCheck, Bot, Briefcase, Truck, Box
} from 'lucide-react';
import { fetchSheetData } from '@/lib/googleSheets';

// --- TYPES ---
type IndustryMode = 'MANUFACTURER' | 'TRADER' | 'SERVICE';
type CostType = 'MATERIAL' | 'LABOR' | 'OVERHEAD';
type CalcMethod = 'MANUAL_RATE' | 'MONTHLY_SALARY' | 'DAILY_OUTPUT' | 'MONTHLY_ALLOCATION';

interface CostItem {
  id: string; 
  coaCode: string;
  coaName: string;
  type: CostType;
  description: string; 
  calcMethod: CalcMethod; 
  baseCost: number; 
  capacity: number; 
  allocPercent: number; 
  qty: number; 
  rate: number; 
  total: number;
}

interface CostSimulation {
  simId: string;
  date: string;
  productSku: string;
  productName: string;
  items: CostItem[];
  yieldPercent: number;
  totalHPP: number;
  industryMode: IndustryMode;
  context: 'MTS' | 'MTO'; 
  buyerName?: string; 
  isActive: boolean;
}

// --- AI CHAT TYPES ---
interface ChatMessage {
  role: 'system' | 'user';
  content: React.ReactNode;
}

export default function CostingPage() {
  const [activeTab, setActiveTab] = useState<'SIMULATOR' | 'REGISTRY' | 'MONITORING' | 'GUIDE'>('SIMULATOR');
  const [simSubTab, setSimSubTab] = useState<'MATERIAL' | 'LABOR' | 'OVERHEAD'>('MATERIAL');
  
  const [industryMode, setIndustryMode] = useState<IndustryMode>('MANUFACTURER');
  const [loading, setLoading] = useState(true);
  
  // DATA POOLS
  const [coaList, setCoaList] = useState<any[]>([]);
  const [productList, setProductList] = useState<any[]>([]);
  const [glData, setGlData] = useState<any[]>([]);
  const [simHistory, setSimHistory] = useState<CostSimulation[]>([]);

  // SIMULATOR STATE
  const [selectedProduct, setSelectedProduct] = useState<string>(''); 
  const [simContext, setSimContext] = useState<'MTS' | 'MTO'>('MTS');
  const [buyerName, setBuyerName] = useState('');
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [targetMargin, setTargetMargin] = useState(30);
  const [yieldPercent, setYieldPercent] = useState(100);

  const fmtMoney = (n: number) => "Rp " + n.toLocaleString('id-ID');
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'});

  // --- 1. LOAD DATA ---
  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      try {
        const [coaRaw, prodRaw] = await Promise.all([
            fetchSheetData('Master_COA'),
            fetchSheetData('Master_Product')
        ]);
        setCoaList(coaRaw as any[]);
        setProductList(prodRaw as any[]);

        const storedGL = localStorage.getItem('METALURGI_GL_JOURNALS');
        if (storedGL) setGlData(JSON.parse(storedGL));

        const storedHistory = localStorage.getItem('METALURGI_COST_HISTORY');
        if (storedHistory) setSimHistory(JSON.parse(storedHistory));

      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    initData();
  }, []);

  // --- 2. ENGINE: SIMULATOR LOGIC ---
  const handleAddRow = (type: CostType) => {
      const defaultMethod = type === 'LABOR' ? 'MONTHLY_SALARY' : type === 'OVERHEAD' ? 'MONTHLY_ALLOCATION' : 'MANUAL_RATE';
      const newItem: CostItem = {
          id: Date.now().toString(),
          coaCode: '', coaName: '', type, description: '',
          calcMethod: defaultMethod, baseCost: 0, capacity: 1, allocPercent: 100,
          qty: 1, rate: 0, total: 0
      };
      setCostItems([...costItems, newItem]);
  };

  const updateRow = (id: string, field: keyof CostItem, val: any) => {
      const updated = costItems.map(item => {
          if (item.id === id) {
              const newItem = { ...item, [field]: val };
              if (field === 'baseCost' || field === 'capacity' || field === 'allocPercent' || field === 'calcMethod') {
                  // Re-calculate Rate Logic
                  if (newItem.type === 'LABOR') {
                      if (newItem.calcMethod === 'MONTHLY_SALARY' || newItem.calcMethod === 'DAILY_OUTPUT') {
                          newItem.rate = newItem.capacity > 0 ? newItem.baseCost / newItem.capacity : 0;
                      } else { newItem.rate = newItem.baseCost; }
                  } else if (newItem.type === 'OVERHEAD') {
                      if (newItem.calcMethod === 'MONTHLY_ALLOCATION') {
                          const allocatedCost = newItem.baseCost * (newItem.allocPercent / 100);
                          newItem.rate = newItem.capacity > 0 ? allocatedCost / newItem.capacity : 0;
                      } else { newItem.rate = newItem.baseCost; }
                  } else { newItem.rate = newItem.baseCost; }
              }
              if (field === 'coaCode') {
                  // @ts-ignore
                  const coa = coaList.find(c => c.Account_Code == val);
                  if (coa) newItem.coaName = coa.Account_Name;
              }
              newItem.total = newItem.qty * newItem.rate;
              return newItem;
          }
          return item;
      });
      setCostItems(updated);
  };

  const removeRow = (id: string) => setCostItems(costItems.filter(i => i.id !== id));

  const simResult = useMemo(() => {
      const materialCost = costItems.filter(i => i.type === 'MATERIAL').reduce((a, b) => a + b.total, 0);
      const laborCost = costItems.filter(i => i.type === 'LABOR').reduce((a, b) => a + b.total, 0);
      const overheadCost = costItems.filter(i => i.type === 'OVERHEAD').reduce((a, b) => a + b.total, 0);
      
      const baseHPP = materialCost + laborCost + overheadCost;
      let yieldImpact = 0;
      let effectiveHPP = baseHPP;

      if (industryMode === 'MANUFACTURER' && yieldPercent < 100 && yieldPercent > 0) {
          const effectiveMaterial = materialCost / (yieldPercent / 100);
          yieldImpact = effectiveMaterial - materialCost;
          effectiveHPP = effectiveMaterial + laborCost + overheadCost;
      }
      const suggestedPrice = effectiveHPP / (1 - (targetMargin / 100));
      return { materialCost, laborCost, overheadCost, yieldImpact, effectiveHPP, suggestedPrice };
  }, [costItems, yieldPercent, targetMargin, industryMode]);

  const handleSaveSimulation = () => {
      if (!selectedProduct) return alert("Pilih produk dulu!");
      const newSim: CostSimulation = {
          simId: `SIM-${Date.now()}`, date: new Date().toISOString(),
          productSku: selectedProduct, productName: selectedProduct,
          items: costItems, yieldPercent: yieldPercent, totalHPP: simResult.effectiveHPP,
          industryMode: industryMode, context: simContext, buyerName: simContext === 'MTO' ? buyerName : undefined, isActive: false 
      };
      const updatedHistory = [newSim, ...simHistory];
      setSimHistory(updatedHistory);
      localStorage.setItem('METALURGI_COST_HISTORY', JSON.stringify(updatedHistory));
      alert("Simulasi tersimpan di HPP Registry!");
  };

  const handleLoadSimulation = (sim: CostSimulation) => {
      setSelectedProduct(sim.productName); setCostItems(sim.items); setYieldPercent(sim.yieldPercent || 100);
      setIndustryMode(sim.industryMode); setSimContext(sim.context); if(sim.buyerName) setBuyerName(sim.buyerName);
      setActiveTab('SIMULATOR');
  };

  const handleAssignHPP = (targetSim: CostSimulation) => {
      const updatedHistory = simHistory.map(sim => {
          if (sim.productName === targetSim.productName) {
              return { ...sim, isActive: sim.simId === targetSim.simId };
          }
          return sim;
      });
      setSimHistory(updatedHistory);
      localStorage.setItem('METALURGI_COST_HISTORY', JSON.stringify(updatedHistory));
      const assignedMap = JSON.parse(localStorage.getItem('METALURGI_ASSIGNED_HPP') || '{}');
      assignedMap[targetSim.productName] = targetSim.totalHPP;
      localStorage.setItem('METALURGI_ASSIGNED_HPP', JSON.stringify(assignedMap));
      alert(`HPP Active Updated for ${targetSim.productName}`);
  };

  const getCoaOptions = (type: CostType) => {
      if (type === 'MATERIAL') return coaList.filter((c:any) => c.Account_Code.startsWith('5-1')); 
      if (type === 'LABOR') return coaList.filter((c:any) => c.Account_Code.startsWith('5-2')); 
      if (type === 'OVERHEAD') return coaList.filter((c:any) => c.Account_Code.startsWith('6')); 
      return [];
  };

  // --- DYNAMIC LABELS ---
  const getTabLabel = (subTab: string) => {
      if (industryMode === 'MANUFACTURER') {
          if (subTab === 'MATERIAL') return '1. Raw Materials (BOM)';
          if (subTab === 'LABOR') return '2. Direct Labor';
          if (subTab === 'OVERHEAD') return '3. Factory Overhead';
      } else if (industryMode === 'TRADER') {
          if (subTab === 'MATERIAL') return '1. Purchase & Landed Cost';
          if (subTab === 'LABOR') return '2. Handling & Packing';
          if (subTab === 'OVERHEAD') return '3. Warehouse Ops';
      } else { // SERVICE
          if (subTab === 'MATERIAL') return '1. Consumables & Tools';
          if (subTab === 'LABOR') return '2. Manpower (Experts)';
          if (subTab === 'OVERHEAD') return '3. Support & Admin';
      }
      return subTab;
  };

  return (
    <div className="space-y-6 pb-20 bg-slate-50 min-h-screen font-sans text-slate-800">
      
      {/* HEADER */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="text-blue-600"/> Costing Expert V5.1 {loading && <Loader2 className="animate-spin" size={16}/>}
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            Tri-Model Simulator: Manufacturing, Trading (Landed Cost) & Services (Billable).
          </p>
        </div>
        <button onClick={()=>setActiveTab('GUIDE')} className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg hover:shadow-xl transition-all">
            <Bot size={18}/> Tanya AI Costing
        </button>
      </div>

      {/* TABS */}
      <div className="flex justify-center mb-6">
         <div className="bg-slate-100 p-1 rounded-xl flex gap-1 shadow-inner">
            <button onClick={() => setActiveTab('GUIDE')} className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'GUIDE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Bot size={16}/> Panduan AI</button>
            <button onClick={() => setActiveTab('SIMULATOR')} className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'SIMULATOR' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Layers size={16}/> Simulator</button>
            <button onClick={() => setActiveTab('REGISTRY')} className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'REGISTRY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><History size={16}/> HPP Registry</button>
            <button onClick={() => setActiveTab('MONITORING')} className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'MONITORING' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><TrendingUp size={16}/> Monitoring</button>
         </div>
      </div>

      {/* ======================= TAB: AI GUIDE ======================= */}
      {activeTab === 'GUIDE' && <AiCostingGuide />}

      {/* ======================= TAB: SIMULATOR ======================= */}
      {activeTab === 'SIMULATOR' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
           
           <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm min-h-[600px] flex flex-col">
                 
                 {/* 1. CONTEXT SETUP */}
                 <div className="flex flex-col gap-4 mb-4 border-b border-slate-100 pb-4">
                    <div className="flex justify-between items-start">
                        <div className="space-y-1 w-2/3">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Target Product (Master)</label>
                            <select className="w-full p-2 border rounded-lg text-sm bg-slate-50 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100" value={selectedProduct} onChange={(e)=>setSelectedProduct(e.target.value)}>
                                <option value="">-- Select Product --</option>
                                {productList.map((p:any) => <option key={p.Product_Name} value={p.Product_Name}>{p.Product_Name} ({p.SKU})</option>)}
                            </select>
                        </div>
                        <div className="space-y-1 text-right">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Industry Model</label>
                            <div className="flex bg-slate-100 rounded-lg p-1">
                                <button onClick={()=>setIndustryMode('MANUFACTURER')} className={`px-3 py-1.5 text-xs font-bold rounded flex gap-1 ${industryMode === 'MANUFACTURER' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}><Factory size={14}/> Mfg</button>
                                <button onClick={()=>setIndustryMode('TRADER')} className={`px-3 py-1.5 text-xs font-bold rounded flex gap-1 ${industryMode === 'TRADER' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}><Store size={14}/> Trade</button>
                                <button onClick={()=>setIndustryMode('SERVICE')} className={`px-3 py-1.5 text-xs font-bold rounded flex gap-1 ${industryMode === 'SERVICE' ? 'bg-white shadow text-purple-600' : 'text-slate-500'}`}><Users size={14}/> Svc</button>
                            </div>
                        </div>
                    </div>
                 </div>

                 {/* 2. SUB-TABS (ADAPTIVE) */}
                 <div className="flex border-b border-slate-200 mb-6">
                     <button onClick={()=>setSimSubTab('MATERIAL')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${simSubTab==='MATERIAL'?'border-blue-600 text-blue-600':'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        {getTabLabel('MATERIAL')}
                     </button>
                     <button onClick={()=>setSimSubTab('LABOR')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${simSubTab==='LABOR'?'border-amber-500 text-amber-600':'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        {getTabLabel('LABOR')}
                     </button>
                     <button onClick={()=>setSimSubTab('OVERHEAD')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${simSubTab==='OVERHEAD'?'border-purple-500 text-purple-600':'border-transparent text-slate-400 hover:text-slate-600'}`}>
                        {getTabLabel('OVERHEAD')}
                     </button>
                 </div>

                 {/* 3. DYNAMIC CONTENT AREA */}
                 <div className="flex-1">
                    
                    {/* A. MATERIAL / LANDED COST / CONSUMABLES TAB */}
                    {simSubTab === 'MATERIAL' && (
                        <div className="animate-in fade-in slide-in-from-left-2">
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h4 className="text-sm font-bold text-slate-700 uppercase">{getTabLabel('MATERIAL')}</h4>
                                    <p className="text-[10px] text-slate-400">
                                        {industryMode === 'TRADER' ? 'Harga Beli, Freight, Pajak, dll.' : 
                                         industryMode === 'SERVICE' ? 'Bahan habis pakai per project.' : 
                                         'Bahan baku utama sesuai Bill of Material.'}
                                    </p>
                                </div>
                                <button onClick={()=>handleAddRow('MATERIAL')} className="text-xs flex items-center gap-1 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-bold"><Plus size={14}/> Add Item</button>
                            </div>
                            <div className="space-y-3">
                                {costItems.filter(i => i.type === 'MATERIAL').map((item) => (
                                    <CostRow key={item.id} item={item} coaOptions={getCoaOptions('MATERIAL')} onUpdate={updateRow} onRemove={removeRow} />
                                ))}
                                {costItems.filter(i => i.type === 'MATERIAL').length === 0 && <EmptyState text="Belum ada komponen biaya."/>}
                            </div>
                            
                            {/* YIELD SLIDER (Manufacturing Only) */}
                            {industryMode === 'MANUFACTURER' && (
                                <div className="mt-8 p-4 bg-rose-50 border border-rose-100 rounded-xl">
                                    <div className="flex items-center gap-2 mb-2">
                                        <AlertTriangle size={16} className="text-rose-600"/>
                                        <h4 className="text-sm font-bold text-rose-800">Yield Factor (Rendemen)</h4>
                                    </div>
                                    <p className="text-xs text-rose-600 mb-4">Berapa % bahan baku yang benar-benar jadi produk (sisanya waste)?</p>
                                    <div className="flex items-center gap-4">
                                        <input type="range" min="50" max="100" value={yieldPercent} onChange={e=>setYieldPercent(parseInt(e.target.value))} className="flex-1 h-2 bg-rose-200 rounded-lg appearance-none cursor-pointer accent-rose-600"/>
                                        <span className="text-xl font-bold text-rose-800 w-16 text-center">{yieldPercent}%</span>
                                    </div>
                                    <div className="mt-2 text-right">
                                        <span className="text-xs font-bold text-rose-500">Waste Cost: {fmtMoney(simResult.yieldImpact)}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* B. LABOR / HANDLING / MANPOWER TAB */}
                    {simSubTab === 'LABOR' && (
                        <div className="animate-in fade-in slide-in-from-left-2">
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h4 className="text-sm font-bold text-slate-700 uppercase">{getTabLabel('LABOR')}</h4>
                                    <p className="text-[10px] text-slate-400">
                                        {industryMode === 'SERVICE' ? 'Hitung Rate tenaga ahli per jam.' : 
                                         industryMode === 'TRADER' ? 'Biaya orang gudang / packing per unit.' : 
                                         'Upah langsung operator produksi.'}
                                    </p>
                                </div>
                                <button onClick={()=>handleAddRow('LABOR')} className="text-xs flex items-center gap-1 bg-amber-50 text-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-100 font-bold"><Plus size={14}/> Add Labor</button>
                            </div>
                            <div className="space-y-3">
                                {costItems.filter(i => i.type === 'LABOR').map((item) => (
                                    <SmartCostRow key={item.id} item={item} coaOptions={getCoaOptions('LABOR')} onUpdate={updateRow} onRemove={removeRow} mode="LABOR" />
                                ))}
                                {costItems.filter(i => i.type === 'LABOR').length === 0 && <EmptyState text="Belum ada tenaga kerja."/>}
                            </div>
                        </div>
                    )}

                    {/* C. OVERHEAD / STORAGE / SUPPORT TAB */}
                    {simSubTab === 'OVERHEAD' && (
                        <div className="animate-in fade-in slide-in-from-left-2">
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h4 className="text-sm font-bold text-slate-700 uppercase">{getTabLabel('OVERHEAD')}</h4>
                                    <p className="text-[10px] text-slate-400">Tentukan alokasi biaya pendukung (listrik, sewa, admin) ke per unit produk.</p>
                                </div>
                                <button onClick={()=>handleAddRow('OVERHEAD')} className="text-xs flex items-center gap-1 bg-purple-50 text-purple-600 px-3 py-1.5 rounded-lg hover:bg-purple-100 font-bold"><Plus size={14}/> Add FOH</button>
                            </div>
                            <div className="space-y-3">
                                {costItems.filter(i => i.type === 'OVERHEAD').map((item) => (
                                    <SmartCostRow key={item.id} item={item} coaOptions={getCoaOptions('OVERHEAD')} onUpdate={updateRow} onRemove={removeRow} mode="OVERHEAD" />
                                ))}
                                {costItems.filter(i => i.type === 'OVERHEAD').length === 0 && <EmptyState text="Belum ada overhead."/>}
                            </div>
                        </div>
                    )}

                 </div>
              </div>
           </div>

           {/* RIGHT: RESULT SIDEBAR */}
           <div className="space-y-6">
              <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl sticky top-6">
                 <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><TrendingUp size={20} className="text-emerald-400"/> Cost Summary</h3>
                 
                 <div className="mb-6">
                    <div className="flex justify-between text-xs mb-1"><span className="text-slate-400">Target Margin</span><span className="font-bold text-emerald-400">{targetMargin}%</span></div>
                    <input type="range" min="0" max="100" value={targetMargin} onChange={(e)=>setTargetMargin(parseInt(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"/>
                 </div>

                 <div className="space-y-3 pt-4 border-t border-slate-700">
                    <div className="flex justify-between text-sm text-slate-400"><span>1. {industryMode==='TRADER'?'Landed Cost':'Material'}</span><span>{fmtMoney(simResult.materialCost)}</span></div>
                    {simResult.yieldImpact > 0 && <div className="flex justify-between text-sm text-rose-400 font-bold"><span>+ Waste Cost</span><span>+{fmtMoney(simResult.yieldImpact)}</span></div>}
                    <div className="flex justify-between text-sm text-slate-400"><span>2. {industryMode==='TRADER'?'Handling':'Labor'}</span><span>{fmtMoney(simResult.laborCost)}</span></div>
                    <div className="flex justify-between text-sm text-slate-400"><span>3. {industryMode==='TRADER'?'Storage':'Overhead'}</span><span>{fmtMoney(simResult.overheadCost)}</span></div>
                    
                    <div className="h-px bg-slate-700 my-2"></div>
                    <div className="flex justify-between text-lg font-bold"><span className="text-slate-200">Total HPP / Unit</span><span>{fmtMoney(simResult.effectiveHPP)}</span></div>
                    
                    <div className="bg-white/10 p-3 rounded-lg mt-4 space-y-2">
                       <p className="text-[10px] text-slate-400 uppercase font-bold">Recommended Price</p>
                       <div className="flex justify-between items-center"><span className="text-2xl font-bold text-emerald-400">{fmtMoney(simResult.suggestedPrice)}</span></div>
                    </div>

                    <button onClick={handleSaveSimulation} className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all mt-4"><Save size={16}/> Save to Registry</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* ======================= TAB: REGISTRY ======================= */}
      {activeTab === 'REGISTRY' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div><h3 className="font-bold text-lg text-slate-800">HPP Registry</h3><p className="text-sm text-slate-500">History of approved Standard Costs.</p></div>
                  <div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={16}/><input type="text" placeholder="Search Product..." className="pl-9 pr-4 py-2 border rounded-lg text-sm w-64"/></div>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Sim Date</th><th className="p-4">Product Context</th><th className="p-4">Model</th><th className="p-4 text-right">Standard HPP</th><th className="p-4 text-center">Status</th><th className="p-4 text-center">Action</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                          {simHistory.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-slate-400 italic">No history found.</td></tr> : 
                          simHistory.map((sim, idx) => (
                              <tr key={idx} className={`hover:bg-slate-50 transition-colors ${sim.isActive ? 'bg-blue-50/30' : ''}`}>
                                  <td className="p-4"><div className="font-bold text-slate-700">{fmtDate(sim.date)}</div><div className="text-[10px] font-mono text-slate-400">{sim.simId}</div></td>
                                  <td className="p-4"><div className="font-bold text-slate-800">{sim.productName}</div>{sim.context === 'MTO' && <div className="text-[10px] text-purple-600 bg-purple-50 px-1 rounded w-fit">Buyer: {sim.buyerName}</div>}</td>
                                  <td className="p-4"><span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold">{sim.industryMode}</span></td>
                                  <td className="p-4 text-right font-mono text-slate-800">{fmtMoney(sim.totalHPP)}</td>
                                  <td className="p-4 text-center">{sim.isActive ? <span className="flex items-center justify-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full"><FileCheck size={12}/> Active</span> : <span className="text-xs text-slate-400">Archived</span>}</td>
                                  <td className="p-4 text-center flex justify-center gap-2"><button onClick={()=>handleLoadSimulation(sim)} className="p-2 bg-white border rounded-lg hover:bg-slate-50 text-slate-500" title="Load"><Eye size={16}/></button>{!sim.isActive && <button onClick={()=>handleAssignHPP(sim)} className="p-2 bg-blue-600 rounded-lg hover:bg-blue-700 text-white shadow-sm flex items-center gap-1 text-xs font-bold px-3"><CheckCircle2 size={14}/> Set Active</button>}</td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* ======================= TAB: MONITORING (PLACEHOLDER) ======================= */}
      {activeTab === 'MONITORING' && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200">
            <TrendingUp size={48} className="text-slate-300 mb-4"/>
            <h3 className="text-lg font-bold text-slate-600">Efficiency Dashboard</h3>
            <p className="text-sm text-slate-400">Data will appear once Job Orders are processed in Transactions.</p>
        </div>
      )}

    </div>
  );
}

// --- AI GUIDE COMPONENT ---
function AiCostingGuide() {
    const [messages, setMessages] = useState<ChatMessage[]>([
        { role: 'system', content: "Halo! Saya Assistant Costing. Bingung cara hitung HPP? Ceritakan produk Anda." }
    ]);
    const [step, setStep] = useState(0);

    const handleOption = (opt: string) => {
        const newMsgs = [...messages, { role: 'user', content: opt } as ChatMessage];
        
        if (step === 0) {
            newMsgs.push({ role: 'system', content: `Oke, untuk ${opt}. Apakah ini produk 'Make to Stock' (Produksi massal rutin) atau 'Make to Order' (Custom per pesanan)?` });
            setStep(1);
        } else if (step === 1) {
            if (opt.includes('Stock')) {
                newMsgs.push({ role: 'system', content: "Untuk **Make to Stock**: \n1. **Direct Labor**: Gunakan metode 'Monthly Salary'. Hitung total gaji tim produksi sebulan dibagi rata-rata output produksi sebulan.\n2. **Overhead (FOH)**: Gunakan 'Monthly Allocation'. Masukkan total tagihan listrik/sewa, lalu bagi dengan total output semua produk." });
            } else {
                newMsgs.push({ role: 'system', content: "Untuk **Make to Order**: \n1. **Direct Labor**: Gunakan metode 'Manual Rate' atau 'Daily Output'. Catat jam kerja spesifik untuk pesanan tersebut.\n2. **Overhead (FOH)**: Tetap gunakan alokasi, tapi bebankan % lebih besar ke produk yang memakan waktu mesin lebih lama." });
            }
            newMsgs.push({ role: 'system', content: "Silakan kembali ke tab **Simulator** dan coba input sesuai saran di atas. Ada lagi?" });
            setStep(2);
        } else {
            newMsgs.push({ role: 'system', content: "Baik, silakan coba simulasi sekarang." });
        }
        setMessages(newMsgs);
    };

    return (
        <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[500px]">
            <div className="bg-slate-50 p-4 border-b flex items-center gap-2">
                <div className="bg-blue-600 p-2 rounded-full text-white"><Bot size={20}/></div>
                <div><h3 className="font-bold text-slate-800">AI Costing Assistant</h3><p className="text-xs text-slate-500">Panduan interaktif</p></div>
            </div>
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
                {messages.map((m, i) => (
                    <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`p-3 rounded-2xl text-sm max-w-[80%] whitespace-pre-line ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                            {m.content}
                        </div>
                    </div>
                ))}
            </div>
            <div className="p-4 border-t bg-slate-50">
                {step === 0 && <div className="flex gap-2"><button onClick={()=>handleOption('Saya Produksi Barang (Manufaktur)')} className="px-4 py-2 bg-white border border-slate-300 rounded-full text-xs font-bold hover:bg-blue-50">Manufaktur</button><button onClick={()=>handleOption('Saya Trading Barang Jadi (Retail)')} className="px-4 py-2 bg-white border border-slate-300 rounded-full text-xs font-bold hover:bg-blue-50">Retail / Trading</button><button onClick={()=>handleOption('Saya Menjual Jasa (Services)')} className="px-4 py-2 bg-white border border-slate-300 rounded-full text-xs font-bold hover:bg-blue-50">Jasa / Service</button></div>}
                {step === 1 && <div className="flex gap-2"><button onClick={()=>handleOption('Make to Stock (Rutin)')} className="px-4 py-2 bg-white border border-slate-300 rounded-full text-xs font-bold hover:bg-blue-50">Make to Stock</button><button onClick={()=>handleOption('Make to Order (Custom)')} className="px-4 py-2 bg-white border border-slate-300 rounded-full text-xs font-bold hover:bg-blue-50">Make to Order</button></div>}
                {step === 2 && <button onClick={()=>{setStep(0); setMessages([{role:'system', content:"Halo! Ada yang bisa dibantu lagi?"}])}} className="px-4 py-2 bg-slate-200 rounded-full text-xs font-bold">Reset Chat</button>}
            </div>
        </div>
    );
}

// --- SMART ROW COMPONENT ---
function SmartCostRow({ item, coaOptions, onUpdate, onRemove, mode }: any) {
    return (
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-3 relative group hover:border-blue-300 transition-colors">
            
            <div className="grid grid-cols-12 gap-4 mb-4">
                <div className="col-span-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">{mode} Account (COA)</label>
                    <select className="w-full p-2 text-xs border rounded-lg outline-none font-bold text-slate-700 bg-white" value={item.coaCode} onChange={(e)=>onUpdate(item.id, 'coaCode', e.target.value)}>
                        <option value="">-- Select --</option>
                        {coaOptions.map((c:any) => <option key={c.Account_Code} value={c.Account_Code}>{c.Account_Name}</option>)}
                    </select>
                </div>
                <div className="col-span-5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Activity / Description</label>
                    <input type="text" className="w-full p-2 text-xs border rounded-lg outline-none bg-white" placeholder="Contoh: Potong, Finishing, Listrik Pabrik..." value={item.description} onChange={(e)=>onUpdate(item.id, 'description', e.target.value)}/>
                </div>
                <div className="col-span-3">
                    <label className="text-[10px] font-bold text-blue-500 uppercase mb-1 block flex items-center gap-1"><Calculator size={10}/> Calc Method</label>
                    <select className="w-full p-2 text-[10px] border border-blue-200 bg-blue-50/50 rounded-lg outline-none font-bold text-blue-700" value={item.calcMethod} onChange={(e)=>onUpdate(item.id, 'calcMethod', e.target.value)}>
                        {mode === 'LABOR' ? (
                            <><option value="MONTHLY_SALARY">Monthly Salary (Gaji Bulanan)</option><option value="DAILY_OUTPUT">Daily Output (Upah Harian)</option><option value="MANUAL_RATE">Manual Rate (Borongan)</option></>
                        ) : (
                            <><option value="MONTHLY_ALLOCATION">Monthly Allocation (Tagihan Bln)</option><option value="MANUAL_RATE">Manual Rate</option></>
                        )}
                    </select>
                </div>
            </div>

            <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-dashed border-slate-300">
                <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">
                        {item.calcMethod === 'MONTHLY_SALARY' ? 'Total Gaji / Bln' : 
                         item.calcMethod === 'DAILY_OUTPUT' ? 'Upah / Hari' : 
                         item.calcMethod === 'MONTHLY_ALLOCATION' ? 'Total Tagihan / Bln' : 'Rate / Unit'}
                    </span>
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-400">Rp</span>
                        <input type="number" className="w-24 p-1 text-sm font-mono border-b border-slate-300 focus:border-blue-500 outline-none" value={item.baseCost} onChange={(e)=>onUpdate(item.id, 'baseCost', parseFloat(e.target.value)||0)}/>
                    </div>
                </div>

                {item.calcMethod !== 'MANUAL_RATE' && <span className="text-slate-300 text-lg">/</span>}

                {item.calcMethod !== 'MANUAL_RATE' && (
                    <div className="flex flex-col">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">
                            {item.calcMethod.includes('MONTHLY') ? 'Est. Output / Bln (Unit)' : 'Output / Hari (Unit)'}
                        </span>
                        <input type="number" className="w-20 p-1 text-sm font-mono border-b border-slate-300 focus:border-blue-500 outline-none bg-amber-50" value={item.capacity} onChange={(e)=>onUpdate(item.id, 'capacity', parseFloat(e.target.value)||1)}/>
                    </div>
                )}

                {item.calcMethod === 'MONTHLY_ALLOCATION' && (
                    <>
                        <span className="text-slate-300 text-lg">x</span>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Alloc %</span>
                            <div className="flex items-center gap-1">
                                <input type="number" className="w-12 p-1 text-sm font-mono border-b border-slate-300 outline-none" value={item.allocPercent} onChange={(e)=>onUpdate(item.id, 'allocPercent', parseFloat(e.target.value)||0)}/>
                                <span className="text-xs text-slate-400">%</span>
                            </div>
                        </div>
                    </>
                )}

                <div className="flex-1"></div>

                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-[9px] text-slate-400 uppercase">Result Rate / Unit</p>
                        <p className="text-sm font-bold text-slate-700">{item.rate.toLocaleString('id-ID')}</p>
                    </div>
                    <div className="text-right pl-4 border-l">
                        <div className="flex items-center gap-2 mb-1 justify-end">
                            <span className="text-[9px] text-slate-400 uppercase">Qty Used</span>
                            <input type="number" className="w-10 p-0.5 text-center text-xs border rounded" value={item.qty} onChange={(e)=>onUpdate(item.id, 'qty', parseFloat(e.target.value)||0)}/>
                        </div>
                        <p className="text-base font-bold text-blue-700">Total: {(item.qty * item.rate).toLocaleString('id-ID')}</p>
                    </div>
                    <button onClick={()=>onRemove(item.id)} className="p-2 text-rose-400 hover:bg-rose-50 rounded-full transition-colors"><XCircle size={18}/></button>
                </div>
            </div>
        </div>
    );
}

function CostRow({ item, coaOptions, onUpdate, onRemove }: any) {
    return (
        <div className="grid grid-cols-12 gap-2 items-center bg-white p-2 rounded border border-slate-200 shadow-sm">
            <div className="col-span-3">
                <select className="w-full p-1 text-xs border rounded outline-none" value={item.coaCode} onChange={(e)=>onUpdate(item.id, 'coaCode', e.target.value)}>
                    <option value="">-- COA --</option>
                    {coaOptions.map((c:any) => <option key={c.Account_Code} value={c.Account_Code}>{c.Account_Name}</option>)}
                </select>
            </div>
            <div className="col-span-3"><input type="text" placeholder="Desc..." className="w-full p-1 text-xs border rounded outline-none" value={item.description} onChange={(e)=>onUpdate(item.id, 'description', e.target.value)}/></div>
            <div className="col-span-2"><input type="number" className="w-full p-1 text-xs border rounded text-center outline-none" value={item.qty} onChange={(e)=>onUpdate(item.id, 'qty', parseFloat(e.target.value)||0)}/></div>
            <div className="col-span-2"><input type="number" className="w-full p-1 text-xs border rounded text-right outline-none" value={item.baseCost} onChange={(e)=>onUpdate(item.id, 'baseCost', parseFloat(e.target.value)||0)}/></div>
            <div className="col-span-2 flex justify-between items-center pl-2">
                <span className="text-xs font-mono font-bold text-slate-600">{(item.qty * item.baseCost).toLocaleString('id-ID')}</span>
                <button onClick={()=>onRemove(item.id)} className="text-rose-400 hover:text-rose-600"><XCircle size={14}/></button>
            </div>
        </div>
    );
}

function EmptyState({text}: {text:string}) {
    return <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 italic bg-slate-50">{text}</div>;
}