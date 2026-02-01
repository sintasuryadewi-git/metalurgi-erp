'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Package, Search, Filter, 
  ClipboardCheck, AlertTriangle, 
  Download, Loader2, RefreshCw,
  BookOpen, X, FileText, Calendar, ArrowRight, TrendingUp, TrendingDown,
  ChevronLeft, ChevronRight, Box as BoxIcon, FileBarChart
} from 'lucide-react';

import { useFetch } from '@/hooks/useFetch'; // ✅ Hook Baru

export default function InventoryPage() {
  
  // --- STATE CONFIG ---
  const [activeTab, setActiveTab] = useState<'valuation' | 'stock_card'>('valuation');
  const [dateRange, setDateRange] = useState({
    start: '2025-01-01', 
    end: new Date().toISOString().split('T')[0] 
  });

  // --- MODAL STATES ---
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [selectedItemJournals, setSelectedItemJournals] = useState<any[]>([]);
  const [selectedItemName, setSelectedItemName] = useState('');
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);

  // --- STATE DATA ---
  const [masterProducts, setMasterProducts] = useState<any[]>([]);
  const [allMovements, setAllMovements] = useState<any[]>([]); 
  const [accountMapping, setAccountMapping] = useState<any[]>([]);
  const [coaList, setCoaList] = useState<any[]>([]);
  
  // --- STATE STOCK CARD ---
  const [selectedSku, setSelectedSku] = useState<string>(''); 
  const [stockPage, setStockPage] = useState(1); 
  const ITEMS_PER_PAGE = 100;

  // --- 1. DATA FETCHING (NEW ARCHITECTURE) ---
  const { data: apiData, loading, error } = useFetch<any>('/api/inventory');

  // --- 2. DATA PARSER ---
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

  // --- 3. CORE ENGINE: PROCESS DATA ---
  useEffect(() => {
    if (!apiData) return;

    try {
        // A. Parse API Data
        const products = processSheetData(apiData.products);
        const sheetMovements = processSheetData(apiData.movements);
        const mapping = processSheetData(apiData.mapping);
        const coa = processSheetData(apiData.coa);

        setMasterProducts(products);
        setAccountMapping(mapping);
        setCoaList(coa);

        // B. Fetch Data Lokal dari POS (REAL-TIME SYNC)
        // Kita gabungkan data Sheet (Server) + Data Local (Belum Sync)
        let localMoves: any[] = [];
        if (typeof window !== 'undefined') {
            const localMovesRaw = localStorage.getItem('METALURGI_INVENTORY_MOVEMENTS');
            localMoves = localMovesRaw ? JSON.parse(localMovesRaw) : [];
        }

        const formattedLocalMoves = localMoves.map((m:any) => ({
            Trx_Date: m.date,
            Ref_Number: m.ref || m.id, 
            Movement_Type: m.type, 
            Product_SKU: m.sku,
            Qty: m.qty,
            Notes: 'Transaksi POS (Local)'
        }));

        // C. MERGE DATA MOVEMENT (Untuk Stok Fisik)
        // Filter duplikat (jika data lokal sudah masuk ke sheet via sync)
        const sheetRefs = new Set(sheetMovements.map((m: any) => m.Ref_Number));
        const uniqueLocalMoves = formattedLocalMoves.filter((m:any) => !sheetRefs.has(m.Ref_Number));
        
        const mergedMovements = [...sheetMovements, ...uniqueLocalMoves];
        setAllMovements(mergedMovements);

    } catch (err) {
        console.error("Failed processing inventory:", err);
    }
  }, [apiData]);


  // --- HELPER ---
  const fmtMoney = (val: number) => "Rp " + Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  
  const getAccName = (code: string) => {
      if (!coaList || coaList.length === 0) return code;
      const acc = coaList.find(c => {
          // Robust comparison for code columns
          const cCode = c.KODE || c.Kode || c.Account_Code || c.Code || c.code;
          return String(cCode).trim() === String(code).trim();
      });
      if (acc) {
          const name = acc['NAMA AKUN'] || acc.NAMA_AKUN || acc.Nama_Akun || acc.Account_Name || acc.Name || acc.name || code;
          return `${name}`; 
      }
      return code; 
  };

  // --- 2. LOGIC STOCK VALUATION ---
  const valuationReport = useMemo(() => {
      const report: any[] = [];
      const startDate = new Date(dateRange.start);
      const endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59);

      const isBeforeStart = (d: string) => new Date(d) < startDate;
      const isInRange = (d: string) => {
          const date = new Date(d);
          return date >= startDate && date <= endDate;
      };

      masterProducts.forEach(prod => {
          if (prod.Category === 'Service' || prod.Category === 'Jasa') return;

          const sku = prod.SKU;
          const stdCost = parseInt(prod.Std_Cost_Budget) || 0;
          const initialMaster = parseInt(prod.Initial_Stock) || 0;
          const skuMoves = allMovements.filter(m => m.Product_SKU === sku);

          let qtyOpening = initialMaster;
          skuMoves.filter(m => isBeforeStart(m.Trx_Date)).forEach(m => {
              const q = parseInt(m.Qty) || 0;
              if (m.Movement_Type === 'IN') qtyOpening += q;
              else if (m.Movement_Type === 'OUT') qtyOpening -= q;
          });
          const valOpening = qtyOpening * stdCost;

          let qtyIn = 0;
          let qtyOut = 0;
          skuMoves.filter(m => isInRange(m.Trx_Date)).forEach(m => {
              const q = parseInt(m.Qty) || 0;
              if (m.Movement_Type === 'IN') qtyIn += q;
              else if (m.Movement_Type === 'OUT') qtyOut += q;
          });
          const valIn = qtyIn * stdCost;
          const valOut = qtyOut * stdCost;

          const qtyEnding = qtyOpening + qtyIn - qtyOut;
          const valEnding = qtyEnding * stdCost;

          report.push({
              sku, name: prod.Product_Name, category: prod.Category, uom: prod.UoM, cost: stdCost,
              opening: { qty: qtyOpening, val: valOpening },
              in: { qty: qtyIn, val: valIn },
              out: { qty: qtyOut, val: valOut },
              ending: { qty: qtyEnding, val: valEnding }
          });
      });

      return report;
  }, [masterProducts, allMovements, dateRange]);

  // --- 3. SCORECARD SUMMARY ---
  const scorecard = useMemo(() => {
      return valuationReport.reduce((acc, item) => {
          acc.openingVal += item.opening.val; acc.openingQty += item.opening.qty;
          acc.inVal += item.in.val; acc.inQty += item.in.qty;
          acc.outVal += item.out.val; acc.outQty += item.out.qty;
          acc.endingVal += item.ending.val; acc.endingQty += item.ending.qty;
          return acc;
      }, { openingVal: 0, openingQty: 0, inVal: 0, inQty: 0, outVal: 0, outQty: 0, endingVal: 0, endingQty: 0 });
  }, [valuationReport]);

  // --- 4. STOCK CARD DATA ---
  const stockCardData = useMemo(() => {
      if (!selectedSku) return null;
      const product = masterProducts.find(p => p.SKU === selectedSku);
      const moves = allMovements.filter(m => m.Product_SKU === selectedSku);
      moves.sort((a, b) => a.Trx_Date.localeCompare(b.Trx_Date));

      let runningQty = parseInt(product?.Initial_Stock || '0');
      const details = moves.map(m => {
          const qty = parseInt(m.Qty) || 0;
          const isIn = m.Movement_Type === 'IN';
          if (isIn) runningQty += qty; else runningQty -= qty;
          return { ...m, qtyIn: isIn ? qty : 0, qtyOut: !isIn ? qty : 0, balance: runningQty };
      });

      const totals = details.reduce((acc, curr) => ({ in: acc.in + curr.qtyIn, out: acc.out + curr.qtyOut }), { in: 0, out: 0 });

      return { product, allDetails: details, initial: parseInt(product?.Initial_Stock || '0'), totals };
  }, [selectedSku, masterProducts, allMovements]);

  const currentStockDetails = useMemo(() => {
      if (!stockCardData) return [];
      const start = (stockPage - 1) * ITEMS_PER_PAGE;
      return stockCardData.allDetails.slice(start, start + ITEMS_PER_PAGE);
  }, [stockCardData, stockPage]);

  // --- ACTIONS ---
  const handleViewJournal = (sku: string, name: string) => {
      const glJournalsRaw = localStorage.getItem('METALURGI_GL_JOURNALS');
      
      if (glJournalsRaw) {
          const allGlJournals = JSON.parse(glJournalsRaw);
          // Simple logic: Cari jurnal yang desc-nya mengandung nama produk
          const itemJournals = allGlJournals.filter((j: any) => {
              if (j.sku && j.sku === sku) return true;
              if (j.desc && j.desc.toLowerCase().includes(name.toLowerCase())) return true;
              return false;
          });

          itemJournals.sort((a:any, b:any) => b.date.localeCompare(a.date));
          
          setSelectedItemJournals(itemJournals);
          setSelectedItemName(name);
          setShowJournalModal(true);
      } else {
          // Fallback legacy logic
          const invJournalsRaw = localStorage.getItem('METALURGI_INVENTORY_JOURNALS');
          if(invJournalsRaw) {
             const jnls = JSON.parse(invJournalsRaw).filter((j:any) => j.sku === sku);
             setSelectedItemJournals(jnls);
             setSelectedItemName(name);
             setShowJournalModal(true);
          } else {
             alert("Belum ada data jurnal GL yang ditemukan.");
          }
      }
  };

  return (
    <div className="space-y-6 pb-20">
      
      {/* HEADER & FILTER */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm sticky top-0 z-20">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
               <Package className="text-blue-600"/> Laporan Posisi Stok
               {loading && <Loader2 className="animate-spin text-slate-400" size={18}/>}
            </h1>
            <p className="text-xs text-slate-500 mt-1">Valuasi persediaan & integrasi jurnal otomatis (GL Sync).</p>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
            <span className="text-xs font-bold text-slate-500 pl-2">Periode:</span>
            <input type="date" value={dateRange.start} onChange={(e) => setDateRange({...dateRange, start: e.target.value})} className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium"/>
            <span className="text-slate-400">-</span>
            <input type="date" value={dateRange.end} onChange={(e) => setDateRange({...dateRange, end: e.target.value})} className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 font-medium"/>
            <button className="bg-blue-600 hover:bg-blue-700 text-white p-1.5 rounded-md ml-2"><Filter size={14} /></button>
          </div>
        </div>
      </div>

      {/* --- SCORECARD (Qty & Value) --- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-slate-400"></div>
              <p className="text-xs text-slate-500 font-bold uppercase mb-1">Saldo Awal</p>
              <p className="text-lg font-bold text-slate-700">{fmtMoney(scorecard.openingVal)}</p>
              <p className="text-xs font-mono text-slate-500 mt-1">Vol: {scorecard.openingQty} Unit</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-emerald-100 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
              <p className="text-xs text-emerald-600 font-bold uppercase mb-1">Masuk (In)</p>
              <p className="text-lg font-bold text-emerald-700">+{fmtMoney(scorecard.inVal)}</p>
              <p className="text-xs font-mono text-emerald-600 mt-1">Vol: +{scorecard.inQty} Unit</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-rose-100 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
              <p className="text-xs text-rose-600 font-bold uppercase mb-1">Keluar (Out)</p>
              <p className="text-lg font-bold text-rose-700">-{fmtMoney(scorecard.outVal)}</p>
              <p className="text-xs font-mono text-rose-600 mt-1">Vol: -{scorecard.outQty} Unit</p>
          </div>
          <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 shadow-lg relative overflow-hidden text-white">
              <div className="absolute -right-4 -top-4 w-20 h-20 bg-blue-500 rounded-full blur-[40px] opacity-30"></div>
              <p className="text-xs text-slate-400 font-bold uppercase mb-1">Saldo Akhir</p>
              <p className="text-2xl font-bold text-white">{fmtMoney(scorecard.endingVal)}</p>
              <p className="text-xs font-mono text-slate-400 mt-1">Vol: {scorecard.endingQty} Unit</p>
          </div>
      </div>

      {/* --- CONTENT SWITCHER --- */}
      <div className="flex gap-4 border-b border-slate-200">
          <button onClick={() => { setActiveTab('valuation'); setSelectedSku(''); }} className={`pb-3 text-sm font-bold flex items-center gap-2 transition-all ${activeTab === 'valuation' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}><FileText size={16}/> Laporan Posisi Stok</button>
          {selectedSku && (<button className={`pb-3 text-sm font-bold flex items-center gap-2 transition-all text-blue-600 border-b-2 border-blue-600`}><BookOpen size={16}/> Kartu Stok: {selectedSku}</button>)}
      </div>

      {/* --- TABLE: VALUATION REPORT --- */}
      {activeTab === 'valuation' && !selectedSku && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase border-b border-slate-200">
                        <tr>
                            <th className="p-4 w-10">No</th><th className="p-4">Produk / Item</th><th className="p-4 text-center">Satuan</th>
                            <th className="p-4 text-center bg-slate-100 border-x border-slate-200" colSpan={2}>Saldo Awal</th>
                            <th className="p-4 text-center bg-emerald-50 border-x border-emerald-100 text-emerald-700" colSpan={2}>Masuk</th>
                            <th className="p-4 text-center bg-rose-50 border-x border-rose-100 text-rose-700" colSpan={2}>Keluar</th>
                            <th className="p-4 text-center bg-blue-50 border-x border-blue-100 text-blue-700" colSpan={2}>Saldo Akhir</th>
                            <th className="p-4 text-center">Action</th>
                        </tr>
                        <tr className="text-[10px]">
                            <th className="p-0"/><th className="p-0"/><th className="p-0"/>
                            <th className="p-2 text-right bg-slate-100 border-r border-slate-200 text-slate-400">Qty</th><th className="p-2 text-right bg-slate-100 border-r border-slate-200 text-slate-400">Rp</th>
                            <th className="p-2 text-right bg-emerald-50 border-r border-emerald-100 text-emerald-600">Qty</th><th className="p-2 text-right bg-emerald-50 border-r border-emerald-100 text-emerald-600">Rp</th>
                            <th className="p-2 text-right bg-rose-50 border-r border-rose-100 text-rose-600">Qty</th><th className="p-2 text-right bg-rose-50 border-r border-rose-100 text-rose-600">Rp</th>
                            <th className="p-2 text-right bg-blue-50 border-r border-blue-100 text-blue-600">Qty</th><th className="p-2 text-right bg-blue-50 border-r border-blue-100 text-blue-600">Rp</th>
                            <th className="p-0"/>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {valuationReport.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 text-slate-400">{idx + 1}</td>
                                <td className="p-4"><div className="font-bold text-slate-700">{item.name}</div><div className="text-[10px] text-slate-400">{item.sku} • {item.category}</div></td>
                                <td className="p-4 text-center text-slate-500">{item.uom}</td>
                                
                                <td className="p-4 text-right font-mono bg-slate-50/50 border-l border-slate-100">{item.opening.qty}</td><td className="p-4 text-right font-mono bg-slate-50/50 border-r border-slate-200 text-slate-500">{fmtMoney(item.opening.val)}</td>
                                <td className="p-4 text-right font-mono text-emerald-600 bg-emerald-50/30">{item.in.qty > 0 ? `+${item.in.qty}` : '-'}</td><td className="p-4 text-right font-mono text-emerald-600 bg-emerald-50/30 border-r border-emerald-100">{item.in.val > 0 ? fmtMoney(item.in.val) : '-'}</td>
                                <td className="p-4 text-right font-mono text-rose-600 bg-rose-50/30">{item.out.qty > 0 ? `-${item.out.qty}` : '-'}</td><td className="p-4 text-right font-mono text-rose-600 bg-rose-50/30 border-r border-rose-100">{item.out.val > 0 ? fmtMoney(item.out.val) : '-'}</td>
                                <td className="p-4 text-right font-bold text-blue-700 bg-blue-50/30">{item.ending.qty}</td><td className="p-4 text-right font-bold text-blue-700 bg-blue-50/30">{fmtMoney(item.ending.val)}</td>

                                <td className="p-4 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <button onClick={() => { setSelectedSku(item.sku); setActiveTab('stock_card'); setStockPage(1); }} className="p-2 bg-white border border-slate-200 rounded hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all" title="Lihat Kartu Stok"><ArrowRight size={14}/></button>
                                        <button onClick={() => handleViewJournal(item.sku, item.name)} className="p-2 bg-white border border-slate-200 rounded hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200 transition-all" title="Lihat Jurnal Akuntansi"><FileBarChart size={14}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* --- CONTENT B: STOCK CARD DETAIL --- */}
      {selectedSku && stockCardData && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
                  <div>
                      <div className="flex items-center gap-2 mb-1"><span className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded font-bold">KARTU STOK</span><span className="text-slate-400 text-xs font-mono">{stockCardData.product.SKU}</span></div>
                      <h2 className="text-xl font-bold text-slate-800">{stockCardData.product.Product_Name}</h2>
                      <div className="flex gap-4 mt-2 text-xs text-slate-500"><span>Kategori: <strong>{stockCardData.product.Category}</strong></span><span>Satuan: <strong>{stockCardData.product.UoM}</strong></span><span>Costing: <strong>Standard ({fmtMoney(parseInt(stockCardData.product.Std_Cost_Budget))})</strong></span></div>
                  </div>
                  <div className="text-right"><p className="text-xs text-slate-400 uppercase font-bold">Stok Saat Ini</p><p className="text-3xl font-bold text-blue-600">{stockCardData.allDetails.length > 0 ? stockCardData.allDetails[stockCardData.allDetails.length-1].balance : stockCardData.initial} <span className="text-sm font-normal text-slate-500 ml-1">{stockCardData.product.UoM}</span></p></div>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                      <thead className="bg-white text-slate-500 font-bold border-b border-slate-200">
                          <tr><th className="p-4">Tanggal</th><th className="p-4">No. Ref</th><th className="p-4">Keterangan / Partner</th><th className="p-4 text-right text-emerald-600 bg-emerald-50/50">Masuk</th><th className="p-4 text-right text-rose-600 bg-rose-50/50">Keluar</th><th className="p-4 text-right text-slate-800 bg-slate-50">Saldo</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          <tr className="bg-slate-50/30 italic text-slate-500"><td className="p-4">-</td><td className="p-4">OP-STOCK</td><td className="p-4">Saldo Awal Master</td><td className="p-4 text-right">-</td><td className="p-4 text-right">-</td><td className="p-4 text-right font-bold">{stockCardData.initial}</td></tr>
                          {currentStockDetails.map((row:any, idx:number) => (
                              <tr key={idx} className="hover:bg-blue-50/20 transition-colors">
                                  <td className="p-4 font-mono text-slate-600">{row.Trx_Date}</td>
                                  <td className="p-4"><span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 text-[10px] font-mono">{row.Ref_Number}</span></td>
                                  <td className="p-4 text-slate-700">{row.Notes || '-'}</td>
                                  <td className="p-4 text-right font-bold text-emerald-600 bg-emerald-50/10">{row.qtyIn > 0 ? `+${row.qtyIn}` : ''}</td>
                                  <td className="p-4 text-right font-bold text-rose-600 bg-rose-50/10">{row.qtyOut > 0 ? `-${row.qtyOut}` : ''}</td>
                                  <td className="p-4 text-right font-bold text-slate-800 bg-slate-50">{row.balance}</td>
                              </tr>
                          ))}
                      </tbody>
                      <tfoot className="bg-slate-50 font-bold border-t border-slate-200 text-slate-700">
                          <tr><td colSpan={3} className="p-4 text-right uppercase text-[10px]">Total Mutasi (All Time):</td><td className="p-4 text-right text-emerald-700">+{stockCardData.totals.in}</td><td className="p-4 text-right text-rose-700">-{stockCardData.totals.out}</td><td className="p-4 text-right bg-slate-100 text-blue-600">{stockCardData.allDetails.length > 0 ? stockCardData.allDetails[stockCardData.allDetails.length-1].balance : stockCardData.initial}</td></tr>
                      </tfoot>
                  </table>
              </div>
              {stockCardData.allDetails.length > ITEMS_PER_PAGE && (
                  <div className="p-4 border-t border-slate-200 bg-white flex justify-between items-center text-xs">
                      <span className="text-slate-500">Menampilkan {((stockPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(stockPage * ITEMS_PER_PAGE, stockCardData.allDetails.length)} dari {stockCardData.allDetails.length} transaksi</span>
                      <div className="flex gap-2"><button disabled={stockPage === 1} onClick={() => setStockPage(p => p - 1)} className="p-2 border rounded hover:bg-slate-50 disabled:opacity-50"><ChevronLeft size={14}/></button><span className="p-2 font-bold">{stockPage}</span><button disabled={stockPage * ITEMS_PER_PAGE >= stockCardData.allDetails.length} onClick={() => setStockPage(p => p + 1)} className="p-2 border rounded hover:bg-slate-50 disabled:opacity-50"><ChevronRight size={14}/></button></div>
                  </div>
              )}
          </div>
      )}

      {/* --- MODAL: JOURNAL HISTORY (VIEW ONLY & GL SOURCED) --- */}
      {showJournalModal && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in zoom-in-95">
           <div className="bg-white rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
              <div className="bg-white p-5 border-b flex justify-between items-center sticky top-0 z-10">
                 <div><h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><FileBarChart className="text-purple-600"/> Jurnal Pergerakan Stok</h3><p className="text-sm text-slate-500">History akuntansi untuk: <strong>{selectedItemName}</strong></p></div>
                 <button onClick={() => setShowJournalModal(false)}><X className="text-slate-400 hover:text-slate-700"/></button>
              </div>
              <div className="flex-1 overflow-y-auto p-0">
                 <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase sticky top-0"><tr><th className="p-4">Tanggal / Ref</th><th className="p-4">Keterangan</th><th className="p-4">Akun Debit</th><th className="p-4">Akun Kredit</th><th className="p-4 text-right">Nilai (Rp)</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                       {selectedItemJournals.length === 0 ? (<tr><td colSpan={5} className="p-8 text-center text-slate-400">Belum ada jurnal ditemukan di General Ledger.</td></tr>) : selectedItemJournals.map((j, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                             <td className="p-4"><div className="text-slate-700 font-bold">{j.date}</div><div className="text-[10px] text-slate-400 font-mono">{j.ref}</div></td>
                             <td className="p-4 text-slate-600">{j.desc}</td>
                             <td className="p-4">
                                <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-100 font-bold block w-fit">{getAccName(j.debit_acc)}</span>
                             </td>
                             <td className="p-4">
                                <span className="bg-rose-50 text-rose-700 px-2 py-1 rounded border border-rose-100 font-bold block w-fit">{getAccName(j.credit_acc)}</span>
                             </td>
                             <td className="p-4 text-right font-bold text-slate-800">
                                {fmtMoney(j.amount)}
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {/* --- MODAL ADJUSTMENT --- */}
      {showAdjustmentModal && (<div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl"><div className="p-6 border-b"><h3 className="font-bold">Stock Opname</h3></div><div className="p-6"><p>Fitur penyesuaian stok manual.</p></div><div className="p-6 border-t flex justify-end gap-3"><button onClick={() => setShowAdjustmentModal(false)} className="px-4 py-2 border rounded">Batal</button></div></div></div>)}
    </div>
  );
}