'use client';

import { useState, Fragment } from 'react'; // Tambahkan import Fragment
import { 
  Tags, Search, TrendingUp, AlertCircle, Save, 
  Calculator, RefreshCw, ChevronDown, ChevronUp, Plus, Trash2, Box, ArrowRight 
} from 'lucide-react';

// --- MOCK DATA (Synced with Master Product) ---
const INITIAL_PRODUCTS = [
  { 
    id: 1, code: 'FG-PAGAR-01', name: 'Pagar Minimalis Type A', category: 'Finished Good', 
    inventoryCost: 1250000, 
    manualCost: 0, 
    useManualCost: false, 
    costComponents: [] as any[], 
    currentPrice: 1500000, competitorPrice: 1600000, margin: 20 
  },
  { 
    id: 2, code: 'SRV-LAS', name: 'Jasa Las Per Titik', category: 'Service', 
    inventoryCost: 0, 
    manualCost: 15000, 
    useManualCost: true, 
    costComponents: [
        { name: 'Kawat Las', val: 5000 },
        { name: 'Listrik', val: 2000 },
        { name: 'Upah Tukang', val: 8000 }
    ],
    currentPrice: 25000, competitorPrice: 30000, margin: 66.6 
  },
  { 
    id: 3, code: 'RM-PLT-05', name: 'Plat Besi Hitam 5mm', category: 'Raw Material', 
    inventoryCost: 450000, 
    manualCost: 480000, 
    useManualCost: false,
    costComponents: [
       { name: 'Harga Pasar Baru', val: 480000 }
    ],
    currentPrice: 500000, competitorPrice: 490000, margin: 11.1
  }
];

export default function PricingPage() {
  const [products, setProducts] = useState(INITIAL_PRODUCTS);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Helper Formatter
  const fmtMoney = (n: number) => "Rp " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  // --- LOGIC ---
  const toggleCostSource = (id: number) => {
    setProducts(products.map(p => {
        if(p.id === id) return { ...p, useManualCost: !p.useManualCost };
        return p;
    }));
  };

  const addCostComponent = (id: number) => {
      setProducts(products.map(p => {
          if(p.id === id) return { ...p, costComponents: [...p.costComponents, { name: 'Biaya Tambahan', val: 0 }] };
          return p;
      }));
  };

  const removeCostComponent = (prodId: number, compIdx: number) => {
      setProducts(products.map(p => {
          if(p.id === prodId) {
              const newComps = p.costComponents.filter((_, i) => i !== compIdx);
              const totalManual = newComps.reduce((acc, curr) => acc + (parseInt(curr.val)||0), 0);
              return { ...p, costComponents: newComps, manualCost: totalManual };
          }
          return p;
      }));
  };

  const updateComponent = (prodId: number, compIdx: number, field: string, val: any) => {
      setProducts(products.map(p => {
          if(p.id === prodId) {
              const newComps = [...p.costComponents];
              newComps[compIdx] = { ...newComps[compIdx], [field]: val };
              const totalManual = newComps.reduce((acc, curr) => acc + (parseInt(curr.val)||0), 0);
              return { ...p, costComponents: newComps, manualCost: totalManual };
          }
          return p;
      }));
  };

  const handleMarginChange = (id: number, newMargin: number) => {
    setProducts(products.map(p => {
      if (p.id === id) {
        const baseCost = p.useManualCost ? p.manualCost : p.inventoryCost;
        const newPrice = baseCost + (baseCost * (newMargin / 100));
        return { ...p, margin: newMargin, currentPrice: newPrice };
      }
      return p;
    }));
  };

  const handlePriceChange = (id: number, newPrice: number) => {
    setProducts(products.map(p => {
      if (p.id === id) {
        const baseCost = p.useManualCost ? p.manualCost : p.inventoryCost;
        if(baseCost === 0) return { ...p, currentPrice: newPrice, margin: 100 };
        const profit = newPrice - baseCost;
        const newMargin = (profit / baseCost) * 100;
        return { ...p, currentPrice: newPrice, margin: parseFloat(newMargin.toFixed(1)) };
      }
      return p;
    }));
  };

  const saveToMaster = (p: any) => {
      alert(`SUCCESS!\n\nData Produk: ${p.name}\nTelah diupdate di Master Data.\n\nNew Sell Price: ${fmtMoney(p.currentPrice)}\nBasis Cost: ${p.useManualCost ? 'Manual Simulation' : 'Inventory System'}`);
  };

  return (
    <div className="space-y-6 pb-20">
      
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Tags className="text-blue-600"/> Pricing Strategy Simulator</h1>
          <p className="text-slate-500 text-sm mt-1">Simulasi harga jual optimal berdasarkan Cost Structure dan Kompetitor.</p>
        </div>
      </div>

      {/* MAIN TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
         <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
            <div className="relative w-full max-w-md">
               <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
               <input type="text" placeholder="Cari Produk..." className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"/>
            </div>
         </div>

         <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
               <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-100">
                  <tr>
                     <th className="p-4 w-[5%]"></th>
                     <th className="p-4">Produk / Layanan</th>
                     <th className="p-4 text-right">Cost Basis (HPP)</th>
                     <th className="p-4 text-center w-[120px]">Margin (%)</th>
                     <th className="p-4 text-right w-[180px]">Harga Jual</th>
                     <th className="p-4 text-center">Kompetitor</th>
                     <th className="p-4 text-center">Action</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {products.map((p) => {
                     const activeCost = p.useManualCost ? p.manualCost : p.inventoryCost;
                     const profit = p.currentPrice - activeCost;
                     const isCheaper = p.currentPrice < p.competitorPrice;
                     const isProfitable = profit > 0;
                     
                     return (
                        /* FIX: Gunakan Fragment dengan Key di sini */
                        <Fragment key={p.id}>
                            {/* MAIN ROW */}
                            <tr className={`hover:bg-blue-50/30 transition-colors ${expandedRow === p.id ? 'bg-blue-50/50' : ''}`}>
                                <td className="p-4 text-center">
                                    <button onClick={() => setExpandedRow(expandedRow === p.id ? null : p.id)} className="text-slate-400 hover:text-blue-600 transition-transform duration-200">
                                        {expandedRow === p.id ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                                    </button>
                                </td>
                                <td className="p-4">
                                    <div className="font-bold text-slate-800">{p.name}</div>
                                    <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">{p.code}</span>
                                </td>
                                
                                {/* COST COLUMN */}
                                <td className="p-4 text-right">
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="font-bold text-slate-700">{fmtMoney(activeCost)}</div>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded w-fit font-bold uppercase cursor-pointer flex items-center gap-1 ${p.useManualCost ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`} onClick={() => setExpandedRow(p.id)}>
                                            {p.useManualCost ? 'Manual' : 'Inventory'} <ChevronDown size={10}/>
                                        </span>
                                    </div>
                                </td>

                                {/* MARGIN */}
                                <td className="p-4 text-center">
                                    <div className="flex items-center justify-center">
                                        <input 
                                            type="number" value={p.margin}
                                            onChange={(e) => handleMarginChange(p.id, parseFloat(e.target.value))}
                                            className="w-16 text-center text-sm font-bold text-blue-600 border border-slate-300 rounded p-1.5 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </td>

                                {/* PRICE RESULT */}
                                <td className="p-4 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                        <span className="text-slate-400 text-xs">Rp</span>
                                        <input 
                                            type="number" value={Math.round(p.currentPrice)}
                                            onChange={(e) => handlePriceChange(p.id, parseFloat(e.target.value))}
                                            className="w-24 text-right text-sm font-bold text-slate-900 border border-slate-300 rounded p-1.5 outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div className={`text-[10px] font-bold mt-1 ${isProfitable ? 'text-emerald-600' : 'text-rose-600'}`}>
                                        Profit: {fmtMoney(profit)}
                                    </div>
                                </td>

                                {/* COMPETITOR */}
                                <td className="p-4 text-center">
                                    <div className="flex flex-col items-center">
                                        <span className="text-xs text-slate-400">{fmtMoney(p.competitorPrice)}</span>
                                        {isCheaper ? 
                                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold flex items-center gap-1 mt-1"><TrendingUp size={10} className="rotate-180"/> Win</span> : 
                                            <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-bold flex items-center gap-1 mt-1"><AlertCircle size={10}/> Lose</span>
                                        }
                                    </div>
                                </td>

                                <td className="p-4 text-center">
                                    <button onClick={() => saveToMaster(p)} className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg shadow-sm transition-all" title="Simpan ke Master Product">
                                        <Save size={16}/>
                                    </button>
                                </td>
                            </tr>

                            {/* EXPANDED ROW: COST SIMULATOR */}
                            {expandedRow === p.id && (
                                <tr className="bg-slate-50 border-b border-slate-200 shadow-inner animate-in slide-in-from-top-2 duration-200">
                                    <td colSpan={7} className="p-6">
                                        <div className="flex gap-8">
                                            {/* OPTION A: INVENTORY */}
                                            <div className={`flex-1 p-5 rounded-xl border-2 transition-all cursor-pointer ${!p.useManualCost ? 'bg-white border-blue-500 shadow-md' : 'bg-slate-100 border-transparent hover:border-slate-300'}`} onClick={() => { if(p.useManualCost) toggleCostSource(p.id) }}>
                                                <div className="flex justify-between mb-4">
                                                    <h4 className={`font-bold text-sm flex items-center gap-2 ${!p.useManualCost ? 'text-blue-700' : 'text-slate-500'}`}><Box size={16}/> HPP Inventory (Otomatis)</h4>
                                                    {!p.useManualCost && <CheckCircleBadge color="blue"/>}
                                                </div>
                                                <p className="text-xs text-slate-500 mb-4">Mengambil data rata-rata (Moving Average) atau Standard Cost terkini dari modul Inventory.</p>
                                                <div className="text-3xl font-bold text-slate-800 mb-1">{fmtMoney(p.inventoryCost)}</div>
                                            </div>

                                            {/* OPTION B: MANUAL */}
                                            <div className={`flex-1 p-5 rounded-xl border-2 transition-all ${p.useManualCost ? 'bg-white border-purple-500 shadow-md' : 'bg-slate-100 border-transparent hover:border-slate-300'}`} onClick={() => { if(!p.useManualCost) toggleCostSource(p.id) }}>
                                                <div className="flex justify-between mb-4">
                                                    <h4 className={`font-bold text-sm flex items-center gap-2 ${p.useManualCost ? 'text-purple-700' : 'text-slate-500'}`}><Calculator size={16}/> Simulasi Manual (Costing)</h4>
                                                    {p.useManualCost && <CheckCircleBadge color="purple"/>}
                                                </div>
                                                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
                                                    <table className="w-full text-xs">
                                                        <thead className="bg-slate-50 text-slate-500"><tr><th className="p-2 text-left pl-3">Komponen Biaya</th><th className="p-2 text-right">Nilai (Rp)</th><th className="w-8"></th></tr></thead>
                                                        <tbody onClick={(e) => e.stopPropagation()}>
                                                            {p.costComponents.map((comp, idx) => (
                                                                <tr key={idx} className="border-t border-slate-100 group/row">
                                                                    <td className="p-1 pl-2"><input type="text" value={comp.name} onChange={(e)=>updateComponent(p.id, idx, 'name', e.target.value)} className="w-full p-1.5 outline-none hover:bg-slate-50 rounded"/></td>
                                                                    <td className="p-1"><input type="number" value={comp.val} onChange={(e)=>updateComponent(p.id, idx, 'val', e.target.value)} className="w-full p-1.5 text-right outline-none hover:bg-slate-50 rounded font-mono"/></td>
                                                                    <td className="p-1 text-center"><button onClick={() => removeCostComponent(p.id, idx)} className="text-slate-300 hover:text-rose-500"><Trash2 size={12}/></button></td>
                                                                </tr>
                                                            ))}
                                                            {p.costComponents.length === 0 && <tr><td colSpan={3} className="p-3 text-center text-slate-400 italic">Belum ada komponen.</td></tr>}
                                                        </tbody>
                                                    </table>
                                                </div>
                                                <div className="flex justify-between items-center" onClick={(e) => e.stopPropagation()}>
                                                    <button onClick={() => addCostComponent(p.id)} className="text-xs bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg font-bold text-slate-600 hover:bg-slate-100 flex items-center gap-1"><Plus size={12}/> Tambah Baris</button>
                                                    <div className="text-right"><p className="text-[10px] text-slate-400 uppercase font-bold">Total Manual</p><div className="text-xl font-bold text-purple-700">{fmtMoney(p.manualCost)}</div></div>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
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