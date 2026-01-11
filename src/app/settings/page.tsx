'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Save, Settings as SettingsIcon,
  Users, Package, Coins,
  X, Loader2, ExternalLink, FileJson,
  Store, Receipt, UserCheck, Clock, Percent, Upload, Image as ImageIcon,
  Wallet 
} from 'lucide-react';

import { fetchSheetData } from '@/lib/googleSheets'; 

export default function SettingsPage() {
  
  // --- STATE MANAGEMENT ---
  // System Logic removed from tabs
  const [activeTab, setActiveTab] = useState<'pos_config' | 'mapping' | 'payroll' | 'finance' | 'inventory' | 'entities'>('pos_config');
  const [loading, setLoading] = useState(false);

  // --- DATA STATE ---
  const [coaList, setCoaList] = useState<any[]>([]);
  const [partnerList, setPartnerList] = useState<any[]>([]);
  const [productList, setProductList] = useState<any[]>([]);
  const [uomList, setUomList] = useState<any[]>([]);
  const [divisionList, setDivisionList] = useState<any[]>([]); 
  const [accountMapping, setAccountMapping] = useState<any[]>([]);
  
  // --- POS DATA STATE ---
  const [cashierList, setCashierList] = useState<any[]>([]);
  const [shiftList, setShiftList] = useState<any[]>([]);
  const [promoList, setPromoList] = useState<any[]>([]);
  const [receiptConfig, setReceiptConfig] = useState<any>({});
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // --- PAYROLL CONFIG STATE ---
  const [payrollConfig, setPayrollConfig] = useState({
      ptkp_tk0: 54000000,
      ptkp_k0: 58500000,
      bpjs_kesehatan_limit: 12000000,
      bpjs_jp_limit: 9077600,
      overtime_rate_1: 1.5,
      overtime_rate_2: 2.0
  });

  // --- MODAL STATE ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'product' | 'partner' | 'coa' | 'uom' | null>(null);
  const [formData, setFormData] = useState<any>({});

  // --- FUNCTION: LOAD DATA ---
  const loadMasterData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Load LocalStorage
      if (typeof window !== 'undefined') {
          const savedLogo = localStorage.getItem('METALURGI_SHOP_LOGO');
          if (savedLogo) setLogoPreview(savedLogo);

          const savedPayroll = localStorage.getItem('METALURGI_PAYROLL_CONFIG');
          if (savedPayroll) setPayrollConfig(JSON.parse(savedPayroll));
      }

      // 2. Fetch Sheets
      const [
          products, partners, coa, uom, divisions, mapping, 
          cashiers, shifts, receipt, promos
      ] = await Promise.all([
        fetchSheetData('Master_Product'),
        fetchSheetData('Master_Partner'),
        fetchSheetData('Master_COA'),
        fetchSheetData('Master_UoM'),
        fetchSheetData('Master_Division'),
        fetchSheetData('Settings_Account_Mapping'),
        fetchSheetData('Master_Cashier'),
        fetchSheetData('Master_Shift'),
        fetchSheetData('Settings_Receipt'),
        fetchSheetData('Master_Promo')
      ]);

      setProductList(products as any[]);
      setPartnerList(partners as any[]);
      setCoaList(coa as any[]);
      setUomList(uom as any[]);
      setDivisionList(divisions as any[]);
      setAccountMapping(mapping as any[]);

      setCashierList(cashiers as any[]);
      setShiftList(shifts as any[]);
      setPromoList(promos as any[]);
      setReceiptConfig((receipt as any[])[0] || { Store_Name: 'Metalurgi Store', Address: 'Surabaya', Footer: 'Terima Kasih' });

      // 3. Save Context
      if (typeof window !== 'undefined') {
         localStorage.setItem('METALURGI_ACCOUNT_MAPPING', JSON.stringify(mapping));
         localStorage.setItem('METALURGI_MASTER_COA', JSON.stringify(coa));
         localStorage.setItem('METALURGI_POS_MASTERS', JSON.stringify({
             cashiers, shifts, receipt: (receipt as any[])[0], promos
         }));
      }

    } catch (error) {
      console.error("Gagal sync data", error);
      alert("Gagal mengambil data. Pastikan semua Sheet ID & Nama Sheet benar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMasterData(); }, [loadMasterData]);

  // --- ACTIONS ---
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              const base64String = reader.result as string;
              setLogoPreview(base64String);
              localStorage.setItem('METALURGI_SHOP_LOGO', base64String);
          };
          reader.readAsDataURL(file);
      }
  };

  const handleSavePayrollConfig = () => {
      localStorage.setItem('METALURGI_PAYROLL_CONFIG', JSON.stringify(payrollConfig));
      alert("Konfigurasi Payroll Disimpan!");
  };

  const fmtMoney = (val: string | number) => {
    if (!val) return '-';
    const num = typeof val === 'string' ? parseInt(val.replace(/,/g, '').replace(/\./g, '')) : val;
    if (isNaN(num)) return '-';
    return "Rp " + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const handleOpenModal = (type: any) => { setModalType(type); setFormData({}); setIsModalOpen(true); };
  const handleSaveData = () => { setIsModalOpen(false); alert("Data disimpan sementara."); };

  return (
    <div className="space-y-6 pb-20 relative">
      
      {/* HEADER & TABS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sticky top-0 z-30">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
           <div>
             <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                Foundation Settings
                {loading && <span className="text-xs font-normal text-blue-600 bg-blue-50 px-2 py-1 rounded-full flex items-center gap-1 animate-pulse"><Loader2 size={12} className="animate-spin"/> Syncing...</span>}
             </h1>
             <p className="text-slate-500 mt-1">Konfigurasi Master Data, POS, Promo & Mapping Akun.</p>
           </div>
           <div className="flex gap-2">
             <a href="https://docs.google.com/spreadsheets" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-bold hover:bg-emerald-100 transition-all text-sm">
               <ExternalLink size={16} /> Edit Sheets
             </a>
             <button onClick={loadMasterData} disabled={loading} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all disabled:opacity-50">
                {loading ? <Loader2 size={18} className="animate-spin"/> : <Save size={18} />} 
                {loading ? 'Loading...' : 'Refresh & Sync'}
             </button>
           </div>
        </div>
        
        <div className="flex bg-slate-50 px-6 pt-2 overflow-x-auto">
           <button onClick={() => setActiveTab('pos_config')} className={`pb-4 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'pos_config' ? 'text-blue-600 border-blue-600 bg-blue-50/50' : 'text-slate-500 border-transparent hover:text-slate-700'}`}><Store size={16} /> POS Config</button>
           <button onClick={() => setActiveTab('mapping')} className={`pb-4 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'mapping' ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}><FileJson size={16} /> Journal Mapping</button>
           <button onClick={() => setActiveTab('payroll')} className={`pb-4 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'payroll' ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}><Wallet size={16} /> Payroll Config</button>
           <button onClick={() => setActiveTab('finance')} className={`pb-4 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'finance' ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}><Coins size={16} /> Finance (COA)</button>
           <button onClick={() => setActiveTab('inventory')} className={`pb-4 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'inventory' ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}><Package size={16} /> Product & UoM</button>
           <button onClick={() => setActiveTab('entities')} className={`pb-4 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'entities' ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}><Users size={16} /> Partner & Div</button>
        </div>
      </div>

      {/* --- TAB: POS CONFIGURATION --- */}
      {activeTab === 'pos_config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
            {/* Receipt Preview */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
               <div className="flex justify-between items-center mb-4">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2"><Receipt size={18} className="text-blue-600"/> Receipt Preview</h3>
                   <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg cursor-pointer hover:bg-slate-200">
                       <Upload size={14}/> Upload Logo
                       <input type="file" accept="image/png, image/jpeg" className="hidden" onChange={handleLogoUpload} />
                   </label>
               </div>
               <div className="flex justify-center bg-slate-100 p-6 rounded-xl border border-slate-200">
                  <div className="bg-white p-4 w-[280px] shadow-lg text-[10px] font-mono leading-tight text-slate-800">
                      <div className="text-center mb-3">
                          {logoPreview ? <img src={logoPreview} alt="Logo" className="h-12 mx-auto mb-2 object-contain" /> : <div className="w-12 h-12 bg-slate-100 mx-auto mb-2 flex items-center justify-center rounded text-slate-300"><ImageIcon size={20}/></div>}
                          <div className="font-bold text-sm uppercase text-black">{receiptConfig.Store_Name || 'NAMA TOKO'}</div>
                          <div>{receiptConfig.Address || 'Alamat Toko'}</div>
                          <div>{receiptConfig.Phone || 'No Telp'}</div>
                      </div>
                      <div className="border-b border-black border-dashed mb-2 pb-2">
                          <div className="flex justify-between"><span>Tgl:</span> <span>2026-01-01 14:30</span></div>
                          <div className="flex justify-between"><span>Kasir:</span> <span>Budi (Admin)</span></div>
                      </div>
                      <div className="space-y-1 mb-2">
                          <div className="font-bold mb-1">Items:</div>
                          <div className="flex justify-between"><span>1x Kopi Susu</span><span>15.000</span></div>
                      </div>
                      <div className="border-t border-black border-dashed pt-2 space-y-1">
                          <div className="flex justify-between font-bold text-sm"><span>TOTAL</span><span>15.000</span></div>
                      </div>
                      <div className="mt-4 text-center text-[9px]"><p>{receiptConfig.Footer || 'Terima Kasih'}</p></div>
                  </div>
               </div>
            </div>

            {/* Masters Section */}
            <div className="space-y-6">
               {/* Cashiers */}
               <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><UserCheck size={18} className="text-emerald-600"/> Master Cashier</h3>
                  <div className="overflow-x-auto max-h-40">
                     <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0"><tr><th className="p-2">Name</th><th className="p-2">ID</th><th className="p-2">Role</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                           {cashierList.length === 0 && !loading && <tr><td colSpan={3} className="p-3 text-center text-slate-400">Kosong (Cek Sheet)</td></tr>}
                           {cashierList.map((c, i) => (<tr key={i}><td className="p-2 font-medium">{c.Name}</td><td className="p-2 font-mono text-xs">{c.ID}</td><td className="p-2 text-xs">{c.Role}</td></tr>))}
                        </tbody>
                     </table>
                  </div>
               </div>

               {/* Shifts */}
               <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><Clock size={18} className="text-amber-600"/> Master Shift</h3>
                  <div className="overflow-x-auto max-h-40">
                     <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0"><tr><th className="p-2">Name</th><th className="p-2">Time</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                           {shiftList.length === 0 && !loading && <tr><td colSpan={2} className="p-3 text-center text-slate-400">Kosong (Cek Sheet)</td></tr>}
                           {shiftList.map((s, i) => (<tr key={i}><td className="p-2 font-medium">{s.Shift_Name}</td><td className="p-2 text-xs">{s.Start_Time} - {s.End_Time}</td></tr>))}
                        </tbody>
                     </table>
                  </div>
               </div>

               {/* Promos */}
               <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><Percent size={18} className="text-rose-600"/> Active Promos</h3>
                  <div className="overflow-x-auto max-h-40">
                     <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0"><tr><th className="p-2">Promo</th><th className="p-2">Value</th><th className="p-2">Target</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                           {promoList.length === 0 && !loading && <tr><td colSpan={3} className="p-3 text-center text-slate-400">Belum ada promo aktif</td></tr>}
                           {promoList.map((p, i) => (<tr key={i}><td className="p-2 font-medium">{p.Promo_Name}</td><td className="p-2 text-xs font-bold text-rose-600">{p.Value}</td><td className="p-2 text-xs">{p.Target_SKU}</td></tr>))}
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>
        </div>
      )}

      {/* --- TAB: JOURNAL MAPPING --- */}
      {activeTab === 'mapping' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-start gap-3">
               <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><FileJson size={20}/></div>
               <div><h4 className="font-bold text-blue-800 text-sm">Centralized Journal Rules</h4><p className="text-xs text-blue-600 mt-1">Source: <strong>Settings_Account_Mapping</strong></p></div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                    <tr><th className="p-4">Mapping ID</th><th className="p-4">Type</th><th className="p-4">Identifier</th><th className="p-4 text-emerald-600">Sales Acc</th><th className="p-4 text-rose-600">COGS Acc</th><th className="p-4 text-blue-600">Inv Acc</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(!accountMapping || accountMapping.length === 0) ? (
                        <tr><td colSpan={6} className="p-8 text-center text-slate-400">{loading ? 'Loading...' : 'Data mapping kosong atau gagal dimuat.'}</td></tr>
                    ) : (
                        accountMapping.map((map, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                            <td className="p-4 font-mono text-xs font-bold text-slate-600">{map.Mapping_ID}</td>
                            <td className="p-4"><span className="bg-slate-100 px-2 py-1 rounded text-xs font-bold">{map.Type}</span></td>
                            <td className="p-4 font-medium text-slate-800">{map.Identifier}</td>
                            <td className="p-4 font-mono text-xs text-emerald-600">{map.Sales_Account || '-'}</td>
                            <td className="p-4 font-mono text-xs text-rose-600">{map.COGS_Account || '-'}</td>
                            <td className="p-4 font-mono text-xs text-blue-600">{map.Inventory_Account || '-'}</td>
                        </tr>
                        ))
                    )}
                  </tbody>
                </table>
            </div>
        </div>
      )}

      {/* --- TAB: PAYROLL CONFIG (NEW) --- */}
      {activeTab === 'payroll' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
              {/* BPJS & TAX */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-6"><Wallet size={18} className="text-purple-600"/> Payroll Constants (BPJS & Tax)</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase">PTKP (TK/0)</label>
                          <input type="number" className="w-full p-2 border rounded mt-1" value={payrollConfig.ptkp_tk0} onChange={(e)=>setPayrollConfig({...payrollConfig, ptkp_tk0: parseInt(e.target.value)})} />
                          <p className="text-[10px] text-slate-400 mt-1">Penghasilan Tidak Kena Pajak (Single)</p>
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase">Batas Upah BPJS Kesehatan</label>
                          <input type="number" className="w-full p-2 border rounded mt-1" value={payrollConfig.bpjs_kesehatan_limit} onChange={(e)=>setPayrollConfig({...payrollConfig, bpjs_kesehatan_limit: parseInt(e.target.value)})} />
                      </div>
                      <div>
                          <label className="text-xs font-bold text-slate-500 uppercase">Batas Upah BPJS JP (Pensiun)</label>
                          <input type="number" className="w-full p-2 border rounded mt-1" value={payrollConfig.bpjs_jp_limit} onChange={(e)=>setPayrollConfig({...payrollConfig, bpjs_jp_limit: parseInt(e.target.value)})} />
                      </div>
                  </div>
              </div>

              {/* OVERTIME RULES */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div>
                      <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-6"><Clock size={18} className="text-amber-600"/> Overtime Rules</h3>
                      <div className="space-y-4">
                          <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                              <span className="text-sm font-medium text-slate-700">Multiplier Jam Pertama</span>
                              <input type="number" step="0.1" className="w-20 p-1 border rounded text-center" value={payrollConfig.overtime_rate_1} onChange={(e)=>setPayrollConfig({...payrollConfig, overtime_rate_1: parseFloat(e.target.value)})} />
                          </div>
                          <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100">
                              <span className="text-sm font-medium text-slate-700">Multiplier Jam Berikutnya</span>
                              <input type="number" step="0.1" className="w-20 p-1 border rounded text-center" value={payrollConfig.overtime_rate_2} onChange={(e)=>setPayrollConfig({...payrollConfig, overtime_rate_2: parseFloat(e.target.value)})} />
                          </div>
                      </div>
                  </div>
                  <button onClick={handleSavePayrollConfig} className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl mt-6 shadow-lg shadow-purple-200 transition-all flex items-center justify-center gap-2">
                      <Save size={18}/> Simpan Konfigurasi
                  </button>
              </div>
          </div>
      )}

      {/* --- TAB: FINANCE --- */}
      {activeTab === 'finance' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
           <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                    <tr><th className="p-3">Kode</th><th className="p-3">Nama Akun</th><th className="p-3">Tipe</th><th className="p-3">Kategori</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {coaList.map((acc, i) => (
                      <tr key={i}>
                        <td className="p-3 font-mono text-slate-600">{acc.Account_Code}</td>
                        <td className="p-3 font-medium">{acc.Account_Name}</td>
                        <td className="p-3"><span className="bg-slate-100 px-2 py-0.5 rounded text-xs">{acc.Type}</span></td>
                        <td className="p-3 text-xs text-slate-500">{acc.Category}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
           </div>
        </div>
      )}

      {/* --- TAB: INVENTORY --- */}
      {activeTab === 'inventory' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
           <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
             <table className="w-full text-left text-sm">
               <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="p-3">SKU & Nama</th><th className="p-3">Kategori</th><th className="p-3 text-right">Budget HPP</th><th className="p-3 text-right">List Price</th></tr></thead>
               <tbody className="divide-y divide-slate-100">
                 {productList.map((prod, i) => (<tr key={i}><td className="p-3"><div className="font-medium text-slate-900">{prod.Product_Name}</div><div className="text-[10px] font-mono text-slate-400">{prod.SKU}</div></td><td className="p-3"><span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-600">{prod.Category}</span></td><td className="p-3 text-right font-mono text-rose-600">{fmtMoney(prod.Std_Cost_Budget)}</td><td className="p-3 text-right font-mono text-emerald-600">{fmtMoney(prod.Sell_Price_List)}</td></tr>))}
               </tbody>
             </table>
           </div>
           <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="p-3">Unit</th><th className="p-3 text-right">Ratio</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{uomList.map((u, i) => (<tr key={i}><td className="p-3 font-medium">{u.Unit_Name}</td><td className="p-3 text-right font-mono text-xs">{u.Ratio}</td></tr>))}</tbody>
              </table>
           </div>
        </div>
      )}

      {/* --- TAB: ENTITIES --- */}
      {activeTab === 'entities' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
           <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
             <table className="w-full text-left text-sm">
               <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="p-3">Nama Partner</th><th className="p-3">Tipe</th><th className="p-3">Kontak</th></tr></thead>
               <tbody className="divide-y divide-slate-100">{partnerList.map((p, i) => (<tr key={i}><td className="p-3 font-medium"><div>{p.Name}</div><div className="text-[10px] text-slate-400 font-mono">{p.Partner_ID}</div></td><td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${p.Type === 'Supplier' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{p.Type}</span></td><td className="p-3 text-xs text-slate-500"><div>{p.Phone}</div><div>{p.Email}</div></td></tr>))}</tbody>
             </table>
           </div>
           <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr><th className="p-3">Divisi</th><th className="p-3 text-right">Kode</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{divisionList.map((d, i) => (<tr key={i}><td className="p-3 font-medium">{d.Division_Name}</td><td className="p-3 text-right font-mono text-xs">{d.Division_Code}</td></tr>))}</tbody>
              </table>
           </div>
        </div>
      )}

      {/* --- MODAL (TETAP ADA) --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
           <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
              <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center"><h3 className="font-bold text-slate-800 uppercase">Tambah {modalType}</h3><button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full"><X size={20}/></button></div>
              <div className="p-6 space-y-4">
                 <div className="bg-blue-50 border border-blue-100 p-3 rounded text-xs text-blue-700"><strong>Info:</strong> Data yang ditambah di sini hanya sementara. Untuk permanen, silakan edit di Google Sheets.</div>
                 {modalType === 'product' && (<div><label className="block text-xs font-bold text-slate-500 mb-1">Nama Produk</label><input type="text" className="w-full p-2 border rounded" onChange={e => setFormData({...formData, name: e.target.value})}/></div>)}
              </div>
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3"><button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg text-sm">Batal</button><button onClick={handleSaveData} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-md text-sm">Simpan Sementara</button></div>
           </div>
        </div>
      )}

    </div>
  );
}