'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Save, Settings as SettingsIcon,
  Users, Package, Coins,
  X, Loader2, ExternalLink, FileJson,
  Store, Receipt, UserCheck, Clock, Percent, Upload, Image as ImageIcon,
  Wallet, ShieldAlert, Trash2, LogOut, Database, User, Key, RefreshCcw, HardDrive
} from 'lucide-react';

export default function SettingsPage() {
  
  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'admin' | 'pos_config' | 'mapping' | 'payroll' | 'finance' | 'inventory' | 'entities'>('admin');
  const [loading, setLoading] = useState(false);
  
  // User State
  const [currentUser, setCurrentUser] = useState({ email: '', name: '', role: '', sheetId: '' });

  // Data Pools (DIVISION REMOVED)
  const [coaList, setCoaList] = useState<any[]>([]);
  const [productList, setProductList] = useState<any[]>([]);
  const [partnerList, setPartnerList] = useState<any[]>([]);
  const [uomList, setUomList] = useState<any[]>([]);
  const [accountMapping, setAccountMapping] = useState<any[]>([]);
  
  // POS & Config
  const [cashierList, setCashierList] = useState<any[]>([]);
  const [shiftList, setShiftList] = useState<any[]>([]);
  const [promoList, setPromoList] = useState<any[]>([]);
  const [receiptConfig, setReceiptConfig] = useState<any>({});
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  
  // Payroll
  const [payrollConfig, setPayrollConfig] = useState({ ptkp_tk0: 54000000, ptkp_k0: 58500000, bpjs_kesehatan_limit: 12000000, bpjs_jp_limit: 9077600, overtime_rate_1: 1.5, overtime_rate_2: 2.0 });

  // Danger Zone
  const [resetMode, setResetMode] = useState<'ALL' | 'MONTH'>('MONTH');
  const [resetMonth, setResetMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [localDataSize, setLocalDataSize] = useState(0);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<string | null>(null);

  // --- INITIALIZE ---
  useEffect(() => {
      // 1. SIMULASI LOGIN (AUTO-FIX GUEST ISSUE)
      // Jika belum ada session, kita set session Ibu Rina agar sync jalan
      let session = localStorage.getItem('METALURGI_USER_SESSION');
      if (!session) {
          const defaultUser = { email: 'rina@cahaya.com', name: 'Ibu Rina', role: 'OWNER', sheetId: '' };
          localStorage.setItem('METALURGI_USER_SESSION', JSON.stringify(defaultUser));
          setCurrentUser(defaultUser);
      } else {
          setCurrentUser(JSON.parse(session));
      }
      
      // 2. Load Local Configs
      const savedLogo = localStorage.getItem('METALURGI_SHOP_LOGO');
      if (savedLogo) setLogoPreview(savedLogo);
      const savedPayroll = localStorage.getItem('METALURGI_PAYROLL_CONFIG');
      if (savedPayroll) setPayrollConfig(JSON.parse(savedPayroll));
      
      // 3. Check POS Data Size
      const posData = localStorage.getItem('METALURGI_POS_TRX');
      if (posData) {
          const parsed = JSON.parse(posData);
          setLocalDataSize(Array.isArray(parsed) ? parsed.length : 0);
      }
  }, []);

  // Trigger Sync Otomatis saat email user terdeteksi
  useEffect(() => {
      if (currentUser.email) {
          loadMasterData(currentUser.email);
      }
  }, [currentUser.email]);

  // --- CORE FUNCTIONS (API BACKEND CONNECTED) ---

  const loadMasterData = useCallback(async (emailToSync: string) => {
    if (!emailToSync) return;
    setLoading(true);
    
    try {
      // PANGGIL API BACKEND BARU KITA
      const res = await fetch('/api/settings/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailToSync })
      });

      const json = await res.json();

      if (json.success) {
          const d = json.data;
          
          // 1. Update State Data
          setCashierList(d.cashiers);
          setShiftList(d.shifts);
          setPromoList(d.promos);
          setReceiptConfig(d.receipt);
          setCoaList(d.coa);
          setProductList(d.products);
          setPartnerList(d.partners);
          setUomList(d.uom);
          setAccountMapping(d.mapping);

          // 2. Update User Profile (Sheet ID Real dari API)
          const updatedUser = { ...currentUser, sheetId: d.user.sheetId, name: d.user.name || currentUser.name, role: d.user.role || currentUser.role, email: emailToSync };
          setCurrentUser(updatedUser);
          localStorage.setItem('METALURGI_USER_SESSION', JSON.stringify(updatedUser));

          // 3. Save Context Locally
          localStorage.setItem('METALURGI_ACCOUNT_MAPPING', JSON.stringify(d.mapping));
          localStorage.setItem('METALURGI_MASTER_COA', JSON.stringify(d.coa));
          localStorage.setItem('METALURGI_POS_MASTERS', JSON.stringify({
             cashiers: d.cashiers, shifts: d.shifts, receipt: d.receipt, promos: d.promos
          }));

      } else {
          console.error("API Error:", json.error);
          alert("Gagal Sync: " + json.error);
      }

    } catch (error) {
      console.error("Network Error", error);
      alert("Gagal menghubungi server. Periksa koneksi.");
    } finally {
      setLoading(false);
    }
  }, []);

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

  const fmtMoney = (val: any) => {
    if (!val) return '-';
    const num = typeof val === 'string' ? parseInt(val.replace(/,/g, '').replace(/\./g, '')) : val;
    return "Rp " + (num||0).toLocaleString('id-ID');
  };

  const handleLogout = () => {
      if(confirm('Anda yakin ingin keluar?')) {
          localStorage.removeItem('METALURGI_USER_SESSION');
          window.location.reload(); 
      }
  };

  const handleClearCache = () => {
      if(confirm('Bersihkan cache browser? (Settingan lokal non-transaksi akan direset)')) {
          localStorage.removeItem('METALURGI_PRICING_CONFIG');
          localStorage.removeItem('METALURGI_COST_HISTORY');
          window.location.reload();
      }
  };

  const handleResetLocalPOS = () => {
      const POS_KEY = 'METALURGI_POS_TRX'; 
      const currentData = localStorage.getItem(POS_KEY);
      
      if (!currentData) { alert("Tidak ada data POS."); return; }
      const transactions = JSON.parse(currentData);

      if (resetMode === 'ALL') {
          if (!confirm(`PERINGATAN! Hapus SEMUA ${transactions.length} transaksi POS?`)) return;
          localStorage.removeItem(POS_KEY);
          setLocalDataSize(0);
          alert("✅ Data POS Bersih.");
      } else {
          if (!confirm(`Hapus transaksi bulan ${resetMonth}?`)) return;
          const filtered = transactions.filter((trx: any) => !trx.date.startsWith(resetMonth));
          const deletedCount = transactions.length - filtered.length;
          if (deletedCount === 0) { alert("Data bulan ini kosong."); return; }
          localStorage.setItem(POS_KEY, JSON.stringify(filtered));
          setLocalDataSize(filtered.length);
          alert(`✅ ${deletedCount} transaksi dihapus.`);
      }
  };

  const handleOpenModal = (type: any) => { setModalType(type); setIsModalOpen(true); };

  return (
    <div className="space-y-6 pb-20 relative">
      
      {/* HEADER */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sticky top-0 z-30">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
           <div>
             <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                Foundation Settings
                {loading && <span className="text-xs font-normal text-blue-600 bg-blue-50 px-2 py-1 rounded-full flex items-center gap-1 animate-pulse"><Loader2 size={12} className="animate-spin"/> Syncing...</span>}
             </h1>
             <p className="text-slate-500 mt-1">Konfigurasi Master Data Multi-Tenant.</p>
           </div>
           <div className="flex gap-2">
             {currentUser.sheetId && (
                 <a href={`https://docs.google.com/spreadsheets/d/${currentUser.sheetId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-bold hover:bg-emerald-100 transition-all text-sm">
                   <ExternalLink size={16} /> Edit My Sheet
                 </a>
             )}
             <button onClick={()=>loadMasterData(currentUser.email)} disabled={loading} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all disabled:opacity-50">
                {loading ? <Loader2 size={18} className="animate-spin"/> : <RefreshCcw size={18} />} 
                {loading ? 'Syncing...' : 'Refresh & Sync'}
             </button>
           </div>
        </div>
        
        <div className="flex bg-slate-50 px-6 pt-2 overflow-x-auto custom-scrollbar">
           <button onClick={() => setActiveTab('admin')} className={`pb-4 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'admin' ? 'text-rose-600 border-rose-600 bg-rose-50/50' : 'text-slate-500 border-transparent hover:text-slate-700'}`}><ShieldAlert size={16} /> Admin & Data</button>
           <button onClick={() => setActiveTab('pos_config')} className={`pb-4 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'pos_config' ? 'text-blue-600 border-blue-600 bg-blue-50/50' : 'text-slate-500 border-transparent hover:text-slate-700'}`}><Store size={16} /> POS Config</button>
           <button onClick={() => setActiveTab('mapping')} className={`pb-4 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'mapping' ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}><FileJson size={16} /> Mapping</button>
           <button onClick={() => setActiveTab('payroll')} className={`pb-4 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'payroll' ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}><Wallet size={16} /> Payroll</button>
           <button onClick={() => setActiveTab('finance')} className={`pb-4 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'finance' ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}><Coins size={16} /> COA</button>
           <button onClick={() => setActiveTab('inventory')} className={`pb-4 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'inventory' ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}><Package size={16} /> Product</button>
           <button onClick={() => setActiveTab('entities')} className={`pb-4 px-4 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${activeTab === 'entities' ? 'text-blue-600 border-blue-600' : 'text-slate-500 border-transparent hover:text-slate-700'}`}><Users size={16} /> Partners</button>
        </div>
      </div>

      {/* --- CONTENT TABS --- */}
      
      {/* 1. ADMIN & PROFILE */}
      {activeTab === 'admin' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10"><User size={120} /></div>
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-6 relative z-10"><UserCheck size={18} className="text-blue-600"/> User Profile</h3>
                  <div className="flex items-center gap-4 mb-6 relative z-10">
                      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-2xl">
                          {currentUser.name ? currentUser.name.charAt(0) : 'U'}
                      </div>
                      <div>
                          <h4 className="font-bold text-lg text-slate-900">{currentUser.name || 'Guest'}</h4>
                          <p className="text-sm text-slate-500">{currentUser.email || 'No Email'}</p>
                          <span className="inline-block mt-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded">{currentUser.role || 'Admin'}</span>
                      </div>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 relative z-10">
                      <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-500 uppercase"><Key size={12}/> Connected Sheet ID</div>
                      <div className="font-mono text-[10px] text-slate-700 break-all bg-white p-2 rounded border">{currentUser.sheetId || 'Not Synced'}</div>
                  </div>
                  <button onClick={handleLogout} className="w-full py-2 bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 rounded-lg font-bold flex items-center justify-center gap-2 transition-all relative z-10"><LogOut size={16}/> Force Logout</button>
              </div>

              <div className="space-y-6">
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><Database size={18} className="text-amber-600"/> Local Storage Status</h3>
                      <div className="flex justify-between items-center bg-amber-50 p-4 rounded-lg border border-amber-100">
                          <div><p className="text-xs font-bold text-amber-800 uppercase">Total POS Transaksi</p><p className="text-xs text-amber-600">Disimpan di browser ini</p></div>
                          <div className="text-2xl font-bold text-amber-700">{localDataSize} <span className="text-sm font-normal">Trx</span></div>
                      </div>
                      <div className="mt-4"><button onClick={handleClearCache} className="w-full px-4 py-2 bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 rounded-lg font-bold text-sm flex items-center justify-center gap-2"><Trash2 size={16}/> Clear System Cache (Refresh)</button></div>
                  </div>

                  <div className="bg-rose-50 p-6 rounded-xl border border-rose-200 shadow-sm">
                      <h3 className="font-bold text-rose-800 flex items-center gap-2 mb-4"><HardDrive size={18}/> Wipe POS Data (Local)</h3>
                      <div className="bg-white p-4 rounded-lg border border-rose-100 mb-4">
                          <div className="flex gap-4 mb-4">
                              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"><input type="radio" name="resetMode" checked={resetMode === 'MONTH'} onChange={()=>setResetMode('MONTH')} className="accent-rose-600"/> Hapus per Bulan</label>
                              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer"><input type="radio" name="resetMode" checked={resetMode === 'ALL'} onChange={()=>setResetMode('ALL')} className="accent-rose-600"/> Wipe All</label>
                          </div>
                          {resetMode === 'MONTH' && (<div className="mb-2"><input type="month" value={resetMonth} onChange={e=>setResetMonth(e.target.value)} className="border p-2 rounded text-sm w-full font-bold text-slate-700"/></div>)}
                      </div>
                      <button onClick={handleResetLocalPOS} className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-md transition-all flex items-center justify-center gap-2"><Trash2 size={18}/> {resetMode === 'ALL' ? 'WIPE ALL LOCAL DATA' : `Hapus Data ${resetMonth}`}</button>
                  </div>
              </div>
          </div>
      )}

      {/* 2. POS CONFIG */}
      {activeTab === 'pos_config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
               <div className="flex justify-between items-center mb-4">
                   <h3 className="font-bold text-slate-800 flex items-center gap-2"><Receipt size={18} className="text-blue-600"/> Receipt Preview</h3>
                   <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg cursor-pointer hover:bg-slate-200"><Upload size={14}/> Upload Logo<input type="file" accept="image/png, image/jpeg" className="hidden" onChange={handleLogoUpload} /></label>
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
                      <div className="mt-4 text-center text-[9px]"><p>{receiptConfig.Footer || 'Terima Kasih'}</p></div>
                  </div>
               </div>
            </div>

            <div className="space-y-6">
               <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><UserCheck size={18} className="text-emerald-600"/> Master Cashier</h3>
                  <div className="overflow-x-auto max-h-40"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0"><tr><th className="p-2">Name</th><th className="p-2">ID</th><th className="p-2">Role</th></tr></thead><tbody className="divide-y divide-slate-100">{cashierList.map((c, i) => (<tr key={i}><td className="p-2 font-medium">{c.Name}</td><td className="p-2 font-mono text-xs">{c.ID}</td><td className="p-2 text-xs">{c.Role}</td></tr>))}</tbody></table></div>
               </div>
               <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><Clock size={18} className="text-amber-600"/> Master Shift</h3>
                  <div className="overflow-x-auto max-h-40"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0"><tr><th className="p-2">Name</th><th className="p-2">Time</th></tr></thead><tbody className="divide-y divide-slate-100">{shiftList.map((s, i) => (<tr key={i}><td className="p-2 font-medium">{s.Shift_Name}</td><td className="p-2 text-xs">{s.Start_Time} - {s.End_Time}</td></tr>))}</tbody></table></div>
               </div>
               <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4"><Percent size={18} className="text-rose-600"/> Active Promos</h3>
                  <div className="overflow-x-auto max-h-40"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0"><tr><th className="p-2">Promo</th><th className="p-2">Value</th><th className="p-2">Target</th></tr></thead><tbody className="divide-y divide-slate-100">{promoList.map((p, i) => (<tr key={i}><td className="p-2 font-medium">{p.Promo_Name}</td><td className="p-2 text-xs font-bold text-rose-600">{p.Value}</td><td className="p-2 text-xs">{p.Target_SKU}</td></tr>))}</tbody></table></div>
               </div>
            </div>
        </div>
      )}

      {/* 3. MAPPING, FINANCE, INVENTORY, ENTITIES (STANDARD TABLES) */}
      {['mapping', 'finance', 'inventory', 'entities'].includes(activeTab) && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in">
            {activeTab === 'mapping' && <SimpleTable headers={['Mapping ID','Type','Identifier','Sales Acc','COGS Acc','Inv Acc']} data={accountMapping} keys={['Mapping_ID','Type','Identifier','Sales_Account','COGS_Account','Inventory_Account']} />}
            {activeTab === 'finance' && <SimpleTable headers={['Kode','Nama Akun','Tipe','Kategori']} data={coaList} keys={['Account_Code','Account_Name','Type','Category']} />}
            {activeTab === 'inventory' && <SimpleTable headers={['SKU','Nama Produk','Kategori','UoM','HPP','Harga Jual']} data={productList} keys={['SKU','Product_Name','Category','UoM','Std_Cost_Budget','Sell_Price_List']} />}
            {activeTab === 'entities' && (
                <div className="grid grid-cols-1 gap-6 p-6">
                    <SimpleTable headers={['Partner ID','Nama','Tipe','No Telp']} data={partnerList} keys={['Partner_ID','Name','Type','Phone']} />
                </div>
            )}
        </div>
      )}

      {activeTab === 'payroll' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-6"><Wallet size={18} className="text-purple-600"/> Payroll Constants (BPJS & Tax)</h3>
                  <div className="space-y-4">
                      <div><label className="text-xs font-bold text-slate-500 uppercase">PTKP (TK/0)</label><input type="number" className="w-full p-2 border rounded mt-1" value={payrollConfig.ptkp_tk0} onChange={(e)=>setPayrollConfig({...payrollConfig, ptkp_tk0: parseInt(e.target.value)})} /></div>
                      <div><label className="text-xs font-bold text-slate-500 uppercase">Batas Upah BPJS Kesehatan</label><input type="number" className="w-full p-2 border rounded mt-1" value={payrollConfig.bpjs_kesehatan_limit} onChange={(e)=>setPayrollConfig({...payrollConfig, bpjs_kesehatan_limit: parseInt(e.target.value)})} /></div>
                  </div>
              </div>
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                  <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-6"><Clock size={18} className="text-amber-600"/> Overtime Rules</h3>
                  <div className="space-y-4">
                      <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100"><span className="text-sm font-medium text-slate-700">Multiplier Jam Pertama</span><input type="number" step="0.1" className="w-20 p-1 border rounded text-center" value={payrollConfig.overtime_rate_1} onChange={(e)=>setPayrollConfig({...payrollConfig, overtime_rate_1: parseFloat(e.target.value)})} /></div>
                      <div className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-100"><span className="text-sm font-medium text-slate-700">Multiplier Jam Berikutnya</span><input type="number" step="0.1" className="w-20 p-1 border rounded text-center" value={payrollConfig.overtime_rate_2} onChange={(e)=>setPayrollConfig({...payrollConfig, overtime_rate_2: parseFloat(e.target.value)})} /></div>
                  </div>
                  <button onClick={handleSavePayrollConfig} className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl mt-6 shadow-lg shadow-purple-200 transition-all flex items-center justify-center gap-2"><Save size={18}/> Simpan Konfigurasi</button>
              </div>
          </div>
      )}

      {/* --- MODAL (TETAP ADA) --- */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
           <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl p-6">
              <h3 className="font-bold text-slate-800 mb-4">Edit via Google Sheets</h3>
              <p className="text-sm text-slate-500 mb-4">Untuk menjaga integritas data Multi-Tenant, penambahan data Master dilakukan langsung di Google Sheets Anda.</p>
              <div className="flex justify-end gap-2">
                  <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-100 rounded text-sm font-bold">Tutup</button>
                  <a href={`https://docs.google.com/spreadsheets/d/${currentUser.sheetId}`} target="_blank" className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-bold">Buka Spreadsheet</a>
              </div>
           </div>
        </div>
      )}

    </div>
  );
}

// Helper Component for Tables
function SimpleTable({headers, data, keys}: any) {
    return (
        <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase"><tr>{headers.map((h:string)=><th key={h} className="p-3">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
                {data.length === 0 ? <tr><td colSpan={headers.length} className="p-4 text-center text-slate-400">Data kosong</td></tr> : 
                data.map((row:any, i:number) => <tr key={i}>{keys.map((k:string)=><td key={k} className="p-3">{row[k]}</td>)}</tr>)}
            </tbody>
        </table>
    )
}