'use client';

import { useState, useMemo, useEffect } from 'react';
import { 
  Calculator, TrendingUp, Layers, 
  CheckCircle2, XCircle, Search, Filter, 
  AlertTriangle, Loader2, Factory, Store, Users, Plus, Save,
  History, Eye, FileCheck, Bot, Briefcase, Truck, Box, ShieldCheck, Trash2
} from 'lucide-react';
import { useFetch } from '@/hooks/useFetch';

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
  tenantId: string; 
  date: string;
  productSku: string;
  productName: string;
  items: CostItem[];
  yieldPercent: number;
  totalHPP: number;
  industryMode: IndustryMode;
  isActive: boolean;
}

// --- CHAT INTERFACE ---
interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

// Helper Parse
const parseAmount = (val: any) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const clean = val.toString().replace(/[^0-9.-]+/g, ""); 
    return parseFloat(clean) || 0;
};

const fmtMoney = (n: number) => "Rp " + n.toLocaleString('id-ID');
const fmtDate = (d: string) => new Date(d).toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'});

export default function CostingPage() {
  const [activeTab, setActiveTab] = useState<'SIMULATOR' | 'REGISTRY' | 'MONITORING' | 'GUIDE'>('SIMULATOR');
  const [simSubTab, setSimSubTab] = useState<'MATERIAL' | 'LABOR' | 'OVERHEAD'>('MATERIAL');
  const [industryMode, setIndustryMode] = useState<IndustryMode>('MANUFACTURER');
  
  // SESSION (MULTI-TENANT SIMULATION)
  const [currentUser, setCurrentUser] = useState({ email: 'loading...', name: 'Loading...' });

  // DATA
  const [coaList, setCoaList] = useState<any[]>([]);
  const [productList, setProductList] = useState<any[]>([]);
  const [simHistory, setSimHistory] = useState<CostSimulation[]>([]);

  // SIMULATOR
  const [selectedProductSku, setSelectedProductSku] = useState<string>(''); 
  const [costItems, setCostItems] = useState<CostItem[]>([]);
  const [targetMargin, setTargetMargin] = useState(30);
  const [yieldPercent, setYieldPercent] = useState(100);

  // --- 1. INITIALIZE ---
  useEffect(() => {
      const storedUser = localStorage.getItem('METALURGI_USER_SESSION'); 
      if (storedUser) setCurrentUser(JSON.parse(storedUser));
      else setCurrentUser({ email: 'rina@cahaya.com', name: 'Ibu Rina' }); 
  }, []);

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

  // MULTI-TENANT KEYS
  const STORAGE_KEY_HISTORY = useMemo(() => `METALURGI_${currentUser.email}_COST_HISTORY`, [currentUser.email]);
  const STORAGE_KEY_STD = useMemo(() => `METALURGI_${currentUser.email}_STD_COSTS`, [currentUser.email]);

  useEffect(() => {
    if (!apiData) return;
    try {
        const coa = processSheetData(apiData.coa);
        const prods = processSheetData(apiData.products);
        setCoaList(coa);
        setProductList(prods);

        const storedHistory = localStorage.getItem(STORAGE_KEY_HISTORY);
        if (storedHistory) setSimHistory(JSON.parse(storedHistory));
        else setSimHistory([]); 

    } catch (err) { console.error("Costing Data Error:", err); }
  }, [apiData, STORAGE_KEY_HISTORY]);

  // --- 2. LOGIC ---
  
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
              if (field === 'coaCode') {
                  const coa = coaList.find(c => c.Account_Code == val);
                  if (coa) newItem.coaName = coa.Account_Name;
              }
              if (['baseCost', 'capacity', 'allocPercent', 'calcMethod', 'qty'].includes(field)) {
                  let rate = newItem.baseCost; 
                  if (newItem.calcMethod === 'MONTHLY_SALARY' || newItem.calcMethod === 'DAILY_OUTPUT') {
                      rate = newItem.capacity > 0 ? newItem.baseCost / newItem.capacity : 0;
                  } else if (newItem.calcMethod === 'MONTHLY_ALLOCATION') {
                      const allocatedCost = newItem.baseCost * (newItem.allocPercent / 100);
                      rate = newItem.capacity > 0 ? allocatedCost / newItem.capacity : 0;
                  }
                  newItem.rate = rate;
                  newItem.total = newItem.qty * newItem.rate;
              }
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

  // --- ACTIONS ---

  const handleSaveSimulation = () => {
      if (!selectedProductSku) return alert("Pilih produk dulu!");
      const prod = productList.find(p => p.SKU === selectedProductSku);
      
      const newSim: CostSimulation = {
          simId: `SIM-${Date.now()}`,
          tenantId: currentUser.email,
          date: new Date().toISOString(),
          productSku: selectedProductSku, 
          productName: prod?.Product_Name || selectedProductSku,
          items: costItems, yieldPercent: yieldPercent, 
          totalHPP: simResult.effectiveHPP,
          industryMode: industryMode, isActive: false 
      };

      const updatedHistory = [newSim, ...simHistory];
      setSimHistory(updatedHistory);
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updatedHistory));
      alert(`Simulasi tersimpan!`);
  };

  const handleSetStandard = (targetSim: CostSimulation) => {
      // 1. Set Active in History
      const updatedHistory = simHistory.map(sim => ({
          ...sim, isActive: (sim.productSku === targetSim.productSku && sim.simId === targetSim.simId)
      }));
      setSimHistory(updatedHistory);
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updatedHistory));

      // 2. Set GLOBAL STANDARD (Ini yang akan dibaca Pricing Strategy)
      const stdCosts = JSON.parse(localStorage.getItem(STORAGE_KEY_STD) || '{}');
      stdCosts[targetSim.productSku] = targetSim.totalHPP;
      localStorage.setItem(STORAGE_KEY_STD, JSON.stringify(stdCosts));

      alert(`HPP Standar ${targetSim.productName} diupdate! Pricing Strategy akan menggunakan nilai ini.`);
  };

  const handleDeleteSimulation = (targetId: string) => {
      if(!confirm("Yakin ingin menghapus simulasi ini?")) return;
      
      const updatedHistory = simHistory.filter(s => s.simId !== targetId);
      setSimHistory(updatedHistory);
      localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(updatedHistory));
  };

  const handleLoadSimulation = (sim: CostSimulation) => {
      setSelectedProductSku(sim.productSku);
      setCostItems(sim.items); 
      setYieldPercent(sim.yieldPercent || 100);
      setIndustryMode(sim.industryMode);
      setActiveTab('SIMULATOR');
  };

  const getCoaOptions = (type: CostType) => {
      if (type === 'MATERIAL') return coaList.filter((c:any) => c.Account_Code.startsWith('5') || c.Account_Code.startsWith('1-13')); 
      if (type === 'LABOR') return coaList.filter((c:any) => c.Account_Code.startsWith('5') || c.Account_Code.startsWith('6')); 
      if (type === 'OVERHEAD') return coaList.filter((c:any) => c.Account_Code.startsWith('6')); 
      return [];
  };

  return (
    <div className="space-y-6 pb-20 bg-slate-50 min-h-screen font-sans text-slate-800">
      
      {/* HEADER */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Calculator className="text-blue-600"/> Costing Intelligence {loading && <Loader2 className="animate-spin" size={16}/>}
          </h1>
          <p className="text-slate-500 text-xs mt-1">
            HPP Generator & Simulator (Tenant Isolated).
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full border border-blue-100">
            <ShieldCheck size={14} className="text-blue-600"/>
            <span className="text-xs font-bold text-blue-800">Tenant: {currentUser.name}</span>
        </div>
      </div>

      {/* TABS */}
      <div className="flex justify-center mb-6">
         <div className="bg-slate-100 p-1 rounded-xl flex gap-1 shadow-inner">
            <button onClick={() => setActiveTab('SIMULATOR')} className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'SIMULATOR' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Layers size={16}/> Simulator</button>
            <button onClick={() => setActiveTab('REGISTRY')} className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'REGISTRY' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><History size={16}/> HPP Registry</button>
            <button onClick={() => setActiveTab('MONITORING')} className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'MONITORING' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><TrendingUp size={16}/> Monitoring</button>
            <button onClick={() => setActiveTab('GUIDE')} className={`px-6 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'GUIDE' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Bot size={16}/> Panduan AI</button>
         </div>
      </div>

      {/* ======================= SIMULATOR ======================= */}
      {activeTab === 'SIMULATOR' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in">
           
           <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm min-h-[600px] flex flex-col">
                 
                 {/* SETUP */}
                 <div className="flex flex-col gap-4 mb-4 border-b border-slate-100 pb-4">
                    <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1 flex-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Pilih Produk (Master)</label>
                            <select className="w-full p-2 border rounded-lg text-sm bg-slate-50 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100" value={selectedProductSku} onChange={(e)=>setSelectedProductSku(e.target.value)}>
                                <option value="">-- Pilih Produk --</option>
                                {productList.map((p:any) => <option key={p.SKU} value={p.SKU}>{p.Product_Name} ({p.SKU})</option>)}
                            </select>
                        </div>
                        <div className="space-y-1 text-right">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Model Bisnis</label>
                            <div className="flex bg-slate-100 rounded-lg p-1">
                                <button onClick={()=>setIndustryMode('MANUFACTURER')} className={`px-3 py-1.5 text-xs font-bold rounded flex gap-1 ${industryMode === 'MANUFACTURER' ? 'bg-white shadow text-blue-600' : 'text-slate-500'}`}><Factory size={14}/> Mfg</button>
                                <button onClick={()=>setIndustryMode('TRADER')} className={`px-3 py-1.5 text-xs font-bold rounded flex gap-1 ${industryMode === 'TRADER' ? 'bg-white shadow text-emerald-600' : 'text-slate-500'}`}><Store size={14}/> Trade</button>
                                <button onClick={()=>setIndustryMode('SERVICE')} className={`px-3 py-1.5 text-xs font-bold rounded flex gap-1 ${industryMode === 'SERVICE' ? 'bg-white shadow text-purple-600' : 'text-slate-500'}`}><Users size={14}/> Svc</button>
                            </div>
                        </div>
                    </div>
                 </div>

                 {/* SUB-TABS */}
                 <div className="flex border-b border-slate-200 mb-6">
                     <button onClick={()=>setSimSubTab('MATERIAL')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${simSubTab==='MATERIAL'?'border-blue-600 text-blue-600':'border-transparent text-slate-400 hover:text-slate-600'}`}>1. Bahan Baku (Material)</button>
                     <button onClick={()=>setSimSubTab('LABOR')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${simSubTab==='LABOR'?'border-amber-500 text-amber-600':'border-transparent text-slate-400 hover:text-slate-600'}`}>2. Tenaga Kerja (Labor)</button>
                     <button onClick={()=>setSimSubTab('OVERHEAD')} className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${simSubTab==='OVERHEAD'?'border-purple-500 text-purple-600':'border-transparent text-slate-400 hover:text-slate-600'}`}>3. Overhead (FOH)</button>
                 </div>

                 {/* INPUT */}
                 <div className="flex-1">
                    {simSubTab === 'MATERIAL' && (
                        <div className="animate-in fade-in">
                            <div className="flex justify-between items-center mb-4">
                                <p className="text-xs text-slate-500 italic">Input bahan baku utama (BOM) atau harga beli barang dagang.</p>
                                <button onClick={()=>handleAddRow('MATERIAL')} className="text-xs flex items-center gap-1 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-bold"><Plus size={14}/> Tambah Item</button>
                            </div>
                            <div className="space-y-3">
                                {costItems.filter(i => i.type === 'MATERIAL').map((item) => (
                                    <SmartCostRow key={item.id} item={item} coaOptions={getCoaOptions('MATERIAL')} onUpdate={updateRow} onRemove={removeRow} mode="MATERIAL" />
                                ))}
                                {costItems.filter(i => i.type === 'MATERIAL').length === 0 && <EmptyState text="Belum ada komponen biaya."/>}
                            </div>
                            {industryMode === 'MANUFACTURER' && (
                                <div className="mt-8 p-4 bg-rose-50 border border-rose-100 rounded-xl">
                                    <div className="flex items-center gap-2 mb-2">
                                        <AlertTriangle size={16} className="text-rose-600"/>
                                        <h4 className="text-sm font-bold text-rose-800">Yield Factor (Rendemen)</h4>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <input type="range" min="50" max="100" value={yieldPercent} onChange={e=>setYieldPercent(parseInt(e.target.value))} className="flex-1 h-2 bg-rose-200 rounded-lg appearance-none cursor-pointer accent-rose-600"/>
                                        <span className="text-xl font-bold text-rose-800 w-16 text-center">{yieldPercent}%</span>
                                    </div>
                                    <p className="text-[10px] text-rose-500 mt-1 text-right">Biaya Waste: {fmtMoney(simResult.yieldImpact)}</p>
                                </div>
                            )}
                        </div>
                    )}
                    {simSubTab === 'LABOR' && (
                        <div className="animate-in fade-in">
                            <div className="flex justify-between items-center mb-4">
                                <p className="text-xs text-slate-500 italic">Upah tenaga kerja langsung / orang gudang.</p>
                                <button onClick={()=>handleAddRow('LABOR')} className="text-xs flex items-center gap-1 bg-amber-50 text-amber-600 px-3 py-1.5 rounded-lg hover:bg-amber-100 font-bold"><Plus size={14}/> Tambah Labor</button>
                            </div>
                            <div className="space-y-3">
                                {costItems.filter(i => i.type === 'LABOR').map((item) => (
                                    <SmartCostRow key={item.id} item={item} coaOptions={getCoaOptions('LABOR')} onUpdate={updateRow} onRemove={removeRow} mode="LABOR" />
                                ))}
                            </div>
                        </div>
                    )}
                    {simSubTab === 'OVERHEAD' && (
                        <div className="animate-in fade-in">
                            <div className="flex justify-between items-center mb-4">
                                <p className="text-xs text-slate-500 italic">Listrik, Sewa, Penyusutan Mesin, dll.</p>
                                <button onClick={()=>handleAddRow('OVERHEAD')} className="text-xs flex items-center gap-1 bg-purple-50 text-purple-600 px-3 py-1.5 rounded-lg hover:bg-purple-100 font-bold"><Plus size={14}/> Tambah Overhead</button>
                            </div>
                            <div className="space-y-3">
                                {costItems.filter(i => i.type === 'OVERHEAD').map((item) => (
                                    <SmartCostRow key={item.id} item={item} coaOptions={getCoaOptions('OVERHEAD')} onUpdate={updateRow} onRemove={removeRow} mode="OVERHEAD" />
                                ))}
                            </div>
                        </div>
                    )}
                 </div>
              </div>
           </div>

           {/* RESULT */}
           <div className="space-y-6">
              <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl sticky top-6">
                 <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><TrendingUp size={20} className="text-emerald-400"/> Cost Structure</h3>
                 
                 <div className="mb-6">
                    <div className="flex justify-between text-xs mb-1"><span className="text-slate-400">Target Profit Margin</span><span className="font-bold text-emerald-400">{targetMargin}%</span></div>
                    <input type="range" min="0" max="100" value={targetMargin} onChange={(e)=>setTargetMargin(parseInt(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"/>
                 </div>

                 <div className="space-y-3 pt-4 border-t border-slate-700">
                    <div className="flex justify-between text-sm text-slate-400"><span>Material Cost</span><span>{fmtMoney(simResult.materialCost)}</span></div>
                    {simResult.yieldImpact > 0 && <div className="flex justify-between text-sm text-rose-400 font-bold"><span>+ Waste (Yield)</span><span>+{fmtMoney(simResult.yieldImpact)}</span></div>}
                    <div className="flex justify-between text-sm text-slate-400"><span>Direct Labor</span><span>{fmtMoney(simResult.laborCost)}</span></div>
                    <div className="flex justify-between text-sm text-slate-400"><span>Factory Overhead</span><span>{fmtMoney(simResult.overheadCost)}</span></div>
                    
                    <div className="h-px bg-slate-700 my-2"></div>
                    <div className="flex justify-between text-lg font-bold"><span className="text-slate-200">HPP / Unit</span><span>{fmtMoney(simResult.effectiveHPP)}</span></div>
                    
                    <div className="bg-white/10 p-3 rounded-lg mt-4 space-y-2">
                       <p className="text-[10px] text-slate-400 uppercase font-bold">Harga Jual Disarankan</p>
                       <div className="flex justify-between items-center"><span className="text-2xl font-bold text-emerald-400">{fmtMoney(simResult.suggestedPrice)}</span></div>
                    </div>

                    <button onClick={handleSaveSimulation} className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all mt-4"><Save size={16}/> Simpan HPP</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* ======================= REGISTRY ======================= */}
      {activeTab === 'REGISTRY' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div><h3 className="font-bold text-lg text-slate-800">HPP Registry</h3><p className="text-sm text-slate-500">Riwayat simulasi biaya produksi (Tenant: {currentUser.name}).</p></div>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-4">Tanggal</th><th className="p-4">Produk</th><th className="p-4">Model</th><th className="p-4 text-right">Nilai HPP</th><th className="p-4 text-center">Status</th><th className="p-4 text-center">Aksi</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                          {simHistory.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-slate-400 italic">Belum ada riwayat.</td></tr> : 
                          simHistory.map((sim, idx) => (
                              <tr key={idx} className={`hover:bg-slate-50 transition-colors ${sim.isActive ? 'bg-blue-50/30' : ''}`}>
                                  <td className="p-4"><div className="font-bold text-slate-700">{fmtDate(sim.date)}</div><div className="text-[10px] font-mono text-slate-400">{sim.simId}</div></td>
                                  <td className="p-4 font-bold text-slate-800">{sim.productName}</td>
                                  <td className="p-4"><span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold">{sim.industryMode}</span></td>
                                  <td className="p-4 text-right font-mono text-slate-800">{fmtMoney(sim.totalHPP)}</td>
                                  <td className="p-4 text-center">{sim.isActive ? <span className="flex items-center justify-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full"><FileCheck size={12}/> Aktif</span> : <span className="text-xs text-slate-400">Arsip</span>}</td>
                                  <td className="p-4 text-center flex justify-center gap-2">
                                      <button onClick={()=>handleLoadSimulation(sim)} className="p-2 bg-white border rounded-lg hover:bg-slate-50 text-slate-500" title="Load"><Eye size={16}/></button>
                                      {!sim.isActive && <button onClick={()=>handleSetStandard(sim)} className="p-2 bg-blue-600 rounded-lg hover:bg-blue-700 text-white shadow-sm flex items-center gap-1 text-xs font-bold px-3"><CheckCircle2 size={14}/> Set Standar</button>}
                                      <button onClick={()=>handleDeleteSimulation(sim.simId)} className="p-2 bg-rose-50 border border-rose-200 rounded-lg hover:bg-rose-100 text-rose-600" title="Hapus"><Trash2 size={16}/></button>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* ======================= GUIDE ======================= */}
      {activeTab === 'GUIDE' && <AiCostingGuide />}

      {/* ======================= MONITORING ======================= */}
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

// --- SUB COMPONENTS ---

function SmartCostRow({ item, coaOptions, onUpdate, onRemove, mode }: any) {
    return (
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-3 relative group hover:border-blue-300 transition-colors">
            <div className="grid grid-cols-12 gap-4 mb-4">
                <div className="col-span-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Akun Biaya (COA)</label>
                    <select className="w-full p-2 text-xs border rounded-lg outline-none font-bold text-slate-700 bg-white" value={item.coaCode} onChange={(e)=>onUpdate(item.id, 'coaCode', e.target.value)}>
                        <option value="">-- Pilih Akun --</option>
                        {coaOptions.map((c:any) => <option key={c.Account_Code} value={c.Account_Code}>{c.Account_Code} - {c.Account_Name}</option>)}
                    </select>
                </div>
                <div className="col-span-5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Deskripsi Aktivitas</label>
                    <input type="text" className="w-full p-2 text-xs border rounded-lg outline-none bg-white" placeholder="Contoh: Pembelian Bahan, Gaji Operator..." value={item.description} onChange={(e)=>onUpdate(item.id, 'description', e.target.value)}/>
                </div>
                <div className="col-span-3">
                    <label className="text-[10px] font-bold text-blue-500 uppercase mb-1 block flex items-center gap-1"><Calculator size={10}/> Metode Hitung</label>
                    <select className="w-full p-2 text-[10px] border border-blue-200 bg-blue-50/50 rounded-lg outline-none font-bold text-blue-700" value={item.calcMethod} onChange={(e)=>onUpdate(item.id, 'calcMethod', e.target.value)}>
                        <option value="MANUAL_RATE">Rate Manual (Per Unit)</option>
                        <option value="MONTHLY_SALARY">Gaji Bulanan / Output</option>
                        <option value="MONTHLY_ALLOCATION">Alokasi Bulanan / Output</option>
                    </select>
                </div>
            </div>

            <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-dashed border-slate-300">
                <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Biaya Dasar (Base)</span>
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-400">Rp</span>
                        <input type="number" className="w-24 p-1 text-sm font-mono border-b border-slate-300 focus:border-blue-500 outline-none" value={item.baseCost} onChange={(e)=>onUpdate(item.id, 'baseCost', parseFloat(e.target.value)||0)}/>
                    </div>
                </div>

                {item.calcMethod !== 'MANUAL_RATE' && (
                    <>
                        <span className="text-slate-300">/</span>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-bold text-slate-400 uppercase">Kapasitas Output</span>
                            <input type="number" className="w-20 p-1 text-sm font-mono border-b border-slate-300 focus:border-blue-500 outline-none bg-amber-50" value={item.capacity} onChange={(e)=>onUpdate(item.id, 'capacity', parseFloat(e.target.value)||1)}/>
                        </div>
                    </>
                )}

                <div className="flex-1"></div>

                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-[9px] text-slate-400 uppercase">Rate / Unit</p>
                        <p className="text-sm font-bold text-slate-700">{item.rate.toLocaleString('id-ID')}</p>
                    </div>
                    <div className="text-right pl-4 border-l">
                        <div className="flex items-center gap-2 mb-1 justify-end">
                            <span className="text-[9px] text-slate-400 uppercase">Qty</span>
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

function EmptyState({text}: {text:string}) {
    return <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 italic bg-slate-50">{text}</div>;
}

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