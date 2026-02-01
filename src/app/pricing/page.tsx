'use client';

import { useState, Fragment, useEffect, useMemo } from 'react'; 
import { 
  Tags, Search, TrendingUp, AlertCircle, Save, 
  Calculator, ChevronDown, ChevronUp, Box, ShieldCheck, Loader2, CloudUpload
} from 'lucide-react';
import { useFetch } from '@/hooks/useFetch';

// --- TYPES ---
interface ProductPricing {
  id: string; // SKU
  code: string;
  name: string;
  category: string;
  inventoryCost: number; 
  manualCost: number; 
  useManualCost: boolean; 
  currentPrice: number; 
  masterPrice: number; 
  competitorPrice: number; 
  margin: number; 
}

const fmtMoney = (n: number) => "Rp " + (n||0).toLocaleString('id-ID');
const parseAmount = (val: any) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const clean = val.toString().replace(/[^0-9.-]+/g, ""); 
    return parseFloat(clean) || 0;
};

export default function PricingPage() {
  
  // --- STATE ---
  const [currentUser, setCurrentUser] = useState({ email: 'loading...', name: 'Loading...' });
  const [products, setProducts] = useState<ProductPricing[]>([]);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSyncing, setIsSyncing] = useState<string | null>(null);

  // FETCH DATA
  const { data: apiData, loading } = useFetch<any>('/api/general-ledger'); 

  // 1. INITIALIZE USER
  useEffect(() => {
      const storedUser = localStorage.getItem('METALURGI_USER_SESSION'); 
      if (storedUser) {
          setCurrentUser(JSON.parse(storedUser));
      } else {
          setCurrentUser({ email: 'rina@cahaya.com', name: 'Ibu Rina' }); 
      }
  }, []);

  // KEYS
  const STORAGE_KEY_STD_COST = useMemo(() => `METALURGI_${currentUser.email}_STD_COSTS`, [currentUser.email]);
  const STORAGE_KEY_PRICING = useMemo(() => `METALURGI_${currentUser.email}_PRICING_CONFIG`, [currentUser.email]);

  // 2. LOAD DATA
  useEffect(() => {
    if (!apiData || !apiData.products) return;

    try {
        const rawProducts = Array.isArray(apiData.products) ? apiData.products : [];
        if (rawProducts.length < 2) return;

        const prodList = rawProducts.slice(1);
        const stdCosts = JSON.parse(localStorage.getItem(STORAGE_KEY_STD_COST) || '{}');
        const savedPricing = JSON.parse(localStorage.getItem(STORAGE_KEY_PRICING) || '{}');

        const mappedProducts: ProductPricing[] = prodList.map((row: any) => {
            const sku = row[0] || 'UNK'; 
            const name = row[1] || 'Unknown Product'; 
            const invCost = parseAmount(row[4]); 
            const sellPriceSheet = parseAmount(row[5]); 

            const saved = savedPricing[sku] || {};
            const manualCost = saved.manualCost || stdCosts[sku] || 0; 
            const currentPrice = saved.currentPrice || sellPriceSheet;
            const useManual = saved.useManualCost !== undefined ? saved.useManualCost : (manualCost > 0);
            const activeCost = useManual ? manualCost : invCost;
            const margin = activeCost > 0 ? ((currentPrice - activeCost) / activeCost) * 100 : 0;

            return {
                id: sku, code: sku, name: name, category: row[2] || 'General',
                inventoryCost: invCost, manualCost: manualCost, useManualCost: useManual,
                currentPrice: currentPrice, masterPrice: sellPriceSheet, 
                competitorPrice: saved.competitorPrice || 0,
                margin: parseFloat(margin.toFixed(1))
            };
        });
        setProducts(mappedProducts);
    } catch (err) { console.error("Pricing Logic Error:", err); }
  }, [apiData, STORAGE_KEY_STD_COST, STORAGE_KEY_PRICING]);

  // LOGIC
  const handleToggleSource = (id: string) => {
      setProducts(prev => prev.map(p => {
          if (p.id === id) {
              const newUseManual = !p.useManualCost;
              const newBase = newUseManual ? p.manualCost : p.inventoryCost;
              const newMargin = newBase > 0 ? ((p.currentPrice - newBase) / newBase) * 100 : 0;
              return { ...p, useManualCost: newUseManual, margin: parseFloat(newMargin.toFixed(1)) };
          }
          return p;
      }));
  };

  const handlePriceChange = (id: string, newPrice: number) => {
      setProducts(prev => prev.map(p => {
          if (p.id === id) {
              const base = p.useManualCost ? p.manualCost : p.inventoryCost;
              const newMargin = base > 0 ? ((newPrice - base) / base) * 100 : 100;
              return { ...p, currentPrice: newPrice, margin: parseFloat(newMargin.toFixed(1)) };
          }
          return p;
      }));
  };

  const handleCompetitorChange = (id: string, newCompPrice: number) => {
      setProducts(prev => prev.map(p => {
          if (p.id === id) return { ...p, competitorPrice: newCompPrice };
          return p;
      }));
  };

  // --- SYNC ACTION (MASTER DB LOOKUP) ---
  const handleSyncToMaster = async (p: ProductPricing) => {
      if(!confirm(`Update harga ${p.name} ke ${fmtMoney(p.currentPrice)} di Database Pusat?`)) return;

      setIsSyncing(p.id);

      // Simpan Config Lokal
      const currentConfig = JSON.parse(localStorage.getItem(STORAGE_KEY_PRICING) || '{}');
      currentConfig[p.id] = {
          manualCost: p.manualCost, useManualCost: p.useManualCost,
          currentPrice: p.currentPrice, competitorPrice: p.competitorPrice
      };
      localStorage.setItem(STORAGE_KEY_PRICING, JSON.stringify(currentConfig));

      // API Call (Kirim Email agar Backend Lookup Sheet ID)
      try {
          const res = await fetch('/api/pricing/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  sku: p.id, 
                  newPrice: p.currentPrice,
                  email: currentUser.email // KUNCI UTAMA LOOKUP
              })
          });

          const json = await res.json();

          if (json.success) {
              alert(`✅ Sukses! Harga Master Data telah diperbarui.`);
              setProducts(prev => prev.map(prod => prod.id === p.id ? { ...prod, masterPrice: p.currentPrice } : prod));
          } else {
              alert(`❌ Gagal: ${json.error}`);
          }
      } catch (err) {
          console.error(err);
          alert('Gagal menghubungi server.');
      } finally {
          setIsSyncing(null);
      }
  };

  const filteredProducts = products.filter(p => 
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      p.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Tags className="text-blue-600"/> Pricing Strategy {loading && <Loader2 className="animate-spin" size={16}/>}</h1>
          <p className="text-slate-500 text-xs mt-1">Multi-Tenant Pricing Engine (Integrated with Master DB).</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full border border-blue-100">
            <ShieldCheck size={14} className="text-blue-600"/>
            <span className="text-xs font-bold text-blue-800">Tenant: {currentUser.name}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
         <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
            <div className="relative w-full max-w-md"><Search className="absolute left-3 top-2.5 text-slate-400" size={18}/><input type="text" placeholder="Cari Produk SKU / Nama..." className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white" value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/></div>
         </div>

         <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
               <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-100">
                  <tr><th className="p-4 w-[5%]"></th><th className="p-4">Produk</th><th className="p-4 text-right">Cost Basis (HPP)</th><th className="p-4 text-center w-[120px]">Margin (%)</th><th className="p-4 text-right w-[180px]">Harga Jual</th><th className="p-4 text-center w-[150px]">Kompetitor</th><th className="p-4 text-center">Action</th></tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {filteredProducts.length === 0 ? (<tr><td colSpan={7} className="p-8 text-center text-slate-400 italic">Data kosong.</td></tr>) : filteredProducts.map((p) => {
                     const activeCost = p.useManualCost ? p.manualCost : p.inventoryCost;
                     const profit = p.currentPrice - activeCost;
                     const costSource = p.useManualCost ? 'COSTING APP' : 'INVENTORY';
                     const isPriceChanged = p.currentPrice !== p.masterPrice;
                     return (
                        <Fragment key={p.id}>
                            <tr className={`hover:bg-blue-50/30 transition-colors ${expandedRow === p.id ? 'bg-blue-50/50' : ''}`}>
                                <td className="p-4 text-center"><button onClick={() => setExpandedRow(expandedRow === p.id ? null : p.id)} className="text-slate-400 hover:text-blue-600">{expandedRow === p.id ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}</button></td>
                                <td className="p-4"><div className="font-bold text-slate-800">{p.name}</div><span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">{p.code}</span>{isPriceChanged && <div className="text-[10px] text-amber-600 font-bold mt-1">Master: {fmtMoney(p.masterPrice)}</div>}</td>
                                <td className="p-4 text-right"><div className="flex flex-col items-end gap-1"><div className="font-bold text-slate-700">{fmtMoney(activeCost)}</div><span className={`text-[9px] px-1.5 py-0.5 rounded w-fit font-bold uppercase cursor-pointer flex items-center gap-1 ${p.useManualCost ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`} onClick={() => setExpandedRow(p.id)}>{costSource} <ChevronDown size={10}/></span></div></td>
                                <td className="p-4 text-center"><div className="font-bold text-blue-600">{p.margin}%</div></td>
                                <td className="p-4 text-right"><div className="flex items-center justify-end gap-2"><span className="text-slate-400 text-xs">Rp</span><input type="number" value={Math.round(p.currentPrice)} onChange={(e) => handlePriceChange(p.id, parseFloat(e.target.value))} className={`w-28 text-right text-sm font-bold border rounded p-1.5 outline-none focus:ring-2 focus:ring-blue-500 bg-white ${isPriceChanged ? 'text-amber-700 border-amber-300 bg-amber-50' : 'text-slate-900 border-slate-300'}`}/></div><div className={`text-[10px] font-bold mt-1 ${profit > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>Profit: {fmtMoney(profit)}</div></td>
                                <td className="p-4 text-center"><div className="flex flex-col items-center"><div className="flex items-center gap-1 mb-1"><span className="text-[10px] text-slate-400">Rp</span><input type="number" value={p.competitorPrice} onChange={(e) => handleCompetitorChange(p.id, parseFloat(e.target.value))} placeholder="0" className="w-20 p-1 text-xs border border-slate-200 rounded text-center outline-none focus:border-blue-400"/></div>{p.competitorPrice > 0 && p.currentPrice < p.competitorPrice && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold flex items-center gap-1"><TrendingUp size={10} className="rotate-180"/> Menang</span>}</div></td>
                                <td className="p-4 text-center"><button onClick={() => handleSyncToMaster(p)} disabled={isSyncing === p.id} className={`p-2 rounded-lg shadow-sm transition-all flex items-center justify-center gap-1 text-xs font-bold w-full ${isPriceChanged ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`} title="Simpan ke Master Data">{isSyncing === p.id ? <Loader2 size={16} className="animate-spin"/> : (isPriceChanged ? <><CloudUpload size={16}/> Sync</> : <Save size={16}/>)}</button></td>
                            </tr>
                            {expandedRow === p.id && (
                                <tr className="bg-slate-50 border-b border-slate-200 shadow-inner animate-in slide-in-from-top-2 duration-200"><td colSpan={7} className="p-6"><div className="flex gap-8"><div className={`flex-1 p-5 rounded-xl border-2 transition-all cursor-pointer relative ${!p.useManualCost ? 'bg-white border-blue-500 shadow-md' : 'bg-slate-100 border-transparent hover:border-slate-300'}`} onClick={() => handleToggleSource(p.id)}><div className="flex justify-between mb-4"><h4 className={`font-bold text-sm flex items-center gap-2 ${!p.useManualCost ? 'text-blue-700' : 'text-slate-500'}`}><Box size={16}/> HPP Inventory (Otomatis)</h4>{!p.useManualCost && <CheckCircleBadge color="blue"/>}</div><p className="text-xs text-slate-500 mb-4">Moving Average / Std Cost.</p><div className="text-3xl font-bold text-slate-800 mb-1">{fmtMoney(p.inventoryCost)}</div></div><div className={`flex-1 p-5 rounded-xl border-2 transition-all cursor-pointer relative ${p.useManualCost ? 'bg-white border-purple-500 shadow-md' : 'bg-slate-100 border-transparent hover:border-slate-300'}`} onClick={() => handleToggleSource(p.id)}><div className="flex justify-between mb-4"><h4 className={`font-bold text-sm flex items-center gap-2 ${p.useManualCost ? 'text-purple-700' : 'text-slate-500'}`}><Calculator size={16}/> Costing Intelligence</h4>{p.useManualCost && <CheckCircleBadge color="purple"/>}</div><p className="text-xs text-slate-500 mb-4">Simulasi HPP Costing.</p>{p.manualCost > 0 ? (<div className="text-3xl font-bold text-purple-700 mb-1">{fmtMoney(p.manualCost)}</div>) : (<div className="text-rose-500 text-xs italic bg-rose-50 p-2 rounded border border-rose-200">Belum ada simulasi.</div>)}</div></div></td></tr>
                            )}
                        </Fragment>
                     );
                  })}
               </tbody>
            </table>
         </div>
      </div>
    </div>
  );
}

function CheckCircleBadge({color = "blue"}) {
    return <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex items-center gap-1 w-fit ${color === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>● Active</span>
}