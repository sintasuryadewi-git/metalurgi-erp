'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  BarChart3, Calendar, FileText, Database, Laptop2, 
  Smartphone, Wallet, Package, ArrowRight, 
  CheckCircle2, Clock, AlertCircle, Save, Loader2, RefreshCw,
  Banknote, Store, TrendingUp, CreditCard, ShoppingBag, Info, PieChart, Activity, UploadCloud
} from 'lucide-react';

import { useFetch } from '@/hooks/useFetch'; 

// ==========================================
// 1. DATA CLEANER & PARSER
// ==========================================
const parseNumberClean = (val: any) => {
    if (val === undefined || val === null || val === '' || val === '-') return 0;
    if (typeof val === 'number') return val;
    let s = String(val).trim();
    const isNegative = s.includes('(') || s.startsWith('-');
    s = s.replace(/Rp/ig, '').replace(/\s/g, '');
    s = s.replace(/[,.]00$/, ''); 
    s = s.replace(/[^0-9]/g, ''); 
    const num = Number(s) || 0;
    return isNegative ? -Math.abs(num) : num;
};

const normalizeDateStr = (raw: any) => {
    if (!raw) return '';
    let s = String(raw).trim();
    const numDate = Number(s);
    if (!isNaN(numDate) && numDate > 30000 && numDate < 60000) {
        const excelEpoch = new Date(1899, 11, 30); 
        return new Date(excelEpoch.getTime() + Math.floor(numDate) * 86400000).toISOString().split('T')[0];
    }
    if (s.includes('/')) {
        const parts = s.split('/');
        if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return s.split('T')[0];
};

const getTrxDate = (trx: any) => {
    let rawDate = trx.Date || trx.date || trx.Tanggal || Object.values(trx)[1] || null;
    return normalizeDateStr(rawDate || new Date().toISOString());
};

const getTrxTotal = (trx: any) => parseNumberClean(trx.Total_Amount || trx.Total || trx.total || Object.values(trx)[5]);

const getTrxMethod = (trx: any) => {
    const m = trx.Payment_Meth || trx.paymentMethod || trx.Metode || Object.values(trx)[4] || 'CASH';
    return String(m).trim().toUpperCase();
};

const getTrxItems = (trx: any) => {
    if (!trx) return [];
    if (Array.isArray(trx.items)) return trx.items;
    let rawData = null;
    for (const key in trx) {
        if (key.toLowerCase().includes('item')) { rawData = trx[key]; break; }
    }
    if (!rawData || rawData === '[]') return [];
    try {
        let cleanStr = typeof rawData === 'string' ? rawData.replace(/""/g, '"') : rawData;
        let parsed = typeof cleanStr === 'string' ? JSON.parse(cleanStr) : cleanStr;
        if (typeof parsed === 'string') parsed = JSON.parse(parsed); 
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
};

const fmtMoney = (n: any) => "Rp " + (Number(n) || 0).toLocaleString('id-ID');
const fmtMoneyShort = (n: any) => {
    const num = Number(n) || 0;
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
    return num.toString();
};
const formatDateShort = (dStr: string) => {
    const d = new Date(dStr);
    return isNaN(d.getTime()) ? dStr : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

const METHOD_COLORS: Record<string, string> = {
    'CASH': '#10b981', 'QRIS': '#3b82f6', 'TRANSFER': '#a855f7', 
    'SHOPEEFOOD': '#f97316', 'GRABFOOD': '#16a34a', 'GOFOOD': '#ef4444', 'LAINNYA': '#94a3b8' 
};

export default function SalesReportPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'qris' | 'retail' | 'b2b'>('overview');
  const [sheetId, setSheetId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [fetchStatus, setFetchStatus] = useState({ pos: 'idle', qris: 'idle', qrisErrorMsg: '' });

  const [posData, setPosData] = useState<any[]>([]);
  const [qrisReconData, setQrisReconData] = useState<any[]>([]);

  const [editQrisDate, setEditQrisDate] = useState<string | null>(null);
  const [inputCair, setInputCair] = useState<number>(0);
  const [inputKet, setInputKet] = useState<string>('');

  const [dateRange, setDateRange] = useState({ start: '2020-01-01', end: new Date().toISOString().split('T')[0] });
  const [trendFilter, setTrendFilter] = useState<'1m' | '3m' | '6m' | 'ytd'>('1m');

  const [csvSummary, setCsvSummary] = useState<any>(null);
  const [isProcessingCsv, setIsProcessingCsv] = useState(false);

  const processSheetData = (rows: any[]) => {
      if (!rows || rows.length < 2) return [];
      const headers = rows[0].map((h: string) => h.trim()); 
      return rows.slice(1).map((row: any) => {
          let obj: any = {};
          headers.forEach((header: string, index: number) => { obj[header] = row[index] || ''; });
          obj['_raw'] = row;
          return obj;
      });
  };

  // ==========================================
  // 2. DATA FETCHING
  // ==========================================
  const { data: posApiData, loading: posLoading } = useFetch<any>('/api/pos');

  const fetchQrisRecon = async (sid: string) => {
      if (!sid) return;
      setFetchStatus(prev => ({ ...prev, qris: 'loading', qrisErrorMsg: '' }));
      try {
          const resQris = await fetch(`/api/recon-qris?sheetId=${sid}&t=${Date.now()}`, { headers: { 'x-sheet-id': sid }, cache: 'no-store' });
          const textRes = await resQris.text(); 
          try {
              const jsonQris = JSON.parse(textRes);
              if (jsonQris.success) {
                  setQrisReconData(processSheetData(jsonQris.data));
                  setFetchStatus(prev => ({ ...prev, qris: 'success' }));
              } else {
                  setFetchStatus(prev => ({ ...prev, qris: 'error', qrisErrorMsg: jsonQris.error || 'Server menolak koneksi' }));
              }
          } catch (parseError) { setFetchStatus(prev => ({ ...prev, qris: 'error', qrisErrorMsg: 'Format Data API Rusak' })); }
      } catch (err: any) { setFetchStatus(prev => ({ ...prev, qris: 'error', qrisErrorMsg: err.message })); }
  };

  useEffect(() => {
      const sid = localStorage.getItem('METALURGI_SHEET_ID') || '';
      setSheetId(sid);
      if (sid) fetchQrisRecon(sid);
  }, []);

  useEffect(() => {
      if (posApiData) {
          const rawHistory = posApiData.posHistory || (posApiData.data && posApiData.data.posHistory);
          if (rawHistory) {
              setPosData(processSheetData(rawHistory));
              setFetchStatus(prev => ({ ...prev, pos: 'success' }));
          } else setFetchStatus(prev => ({ ...prev, pos: 'error' }));
      }
  }, [posApiData]);

  const handleRefresh = () => { if(sheetId) fetchQrisRecon(sheetId); };

  const handleQuickFilter = (preset: string) => {
      const dateNow = new Date();
      const formatDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      let start = new Date(dateNow), end = new Date(dateNow);

      if (preset === 'all') { start = new Date('2020-01-01'); end = new Date(dateNow); } 
      else if (preset === 'yesterday') { start.setDate(dateNow.getDate() - 1); end.setDate(dateNow.getDate() - 1); } 
      else if (preset === 'thisWeek') { const day = dateNow.getDay(); const diff = dateNow.getDate() - day + (day === 0 ? -6 : 1); start.setDate(diff); end = new Date(start); end.setDate(start.getDate() + 6); } 
      else if (preset === 'thisMonth') { start = new Date(dateNow.getFullYear(), dateNow.getMonth(), 1); end = new Date(dateNow.getFullYear(), dateNow.getMonth() + 1, 0); } 
      else if (preset === 'lastMonth') { start = new Date(dateNow.getFullYear(), dateNow.getMonth() - 1, 1); end = new Date(dateNow.getFullYear(), dateNow.getMonth(), 0); }
      setDateRange({ start: formatDate(start), end: formatDate(end) });
  };

  // ==========================================
  // 3. ENGINE PENGOLAH DATA
  // ==========================================
  const dashboardData = useMemo(() => {
      const startStr = dateRange.start;
      const endStr = dateRange.end;
      const activePos = posData.filter((t: any) => { const dStr = getTrxDate(t); return dStr >= startStr && dStr <= endStr; });

      const methodBreakdown: Record<string, { unit: number, nominal: number }> = {};
      let totalPosSales = 0, totalPosQty = 0;

      activePos.forEach((trx: any) => {
          const mName = getTrxMethod(trx);
          const nominal = getTrxTotal(trx);
          let unit = 0;
          getTrxItems(trx).forEach((item: any) => unit += (Number(item.qty) || 0));

          totalPosSales += nominal; totalPosQty += unit;

          const cat = Object.keys(METHOD_COLORS).includes(mName) ? mName : 'LAINNYA';
          if (!methodBreakdown[cat]) methodBreakdown[cat] = { unit: 0, nominal: 0 };
          methodBreakdown[cat].unit += unit;
          methodBreakdown[cat].nominal += nominal;
      });

      const qrisGrouped: Record<string, { inAmount: number, cairAmount: number, selisih: number, ket: string }> = {};
      activePos.forEach((trx: any) => {
          if (getTrxMethod(trx) === 'QRIS') {
              const dStr = getTrxDate(trx);
              if (!qrisGrouped[dStr]) qrisGrouped[dStr] = { inAmount: 0, cairAmount: 0, selisih: 0, ket: '' };
              qrisGrouped[dStr].inAmount += getTrxTotal(trx);
          }
      });

      qrisReconData.forEach((row: any) => {
          const rawDate = row['Tanggal'] || row['tanggal'] || row['Date'] || (row._raw && row._raw[0]);
          const rawIn = row['IN'] || row['In'] || row['in'] || (row._raw && row._raw[1]);
          const rawCair = row['CAIR'] || row['Cair'] || row['cair'] || (row._raw && row._raw[2]);
          const rawKet = row['KETERANGAN'] || row['keterangan'] || (row._raw && row._raw[4]);

          const dStr = normalizeDateStr(rawDate);
          if (!dStr) return;

          if ((dStr >= startStr && dStr <= endStr) || qrisGrouped[dStr]) {
              if (!qrisGrouped[dStr]) qrisGrouped[dStr] = { inAmount: 0, cairAmount: 0, selisih: 0, ket: '' };
              const sheetIn = parseNumberClean(rawIn);
              const sheetCair = parseNumberClean(rawCair);
              if (qrisGrouped[dStr].inAmount === 0 && sheetIn !== 0) qrisGrouped[dStr].inAmount = sheetIn;
              qrisGrouped[dStr].cairAmount = sheetCair;
              qrisGrouped[dStr].ket = rawKet || '';
          }
      });

      Object.keys(qrisGrouped).forEach(k => { qrisGrouped[k].selisih = qrisGrouped[k].inAmount - qrisGrouped[k].cairAmount; });
      const qrisTableArray = Object.keys(qrisGrouped).map(date => ({ date, ...qrisGrouped[date] })).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      const skuMap: Record<string, any> = {};
      activePos.forEach((t: any) => {
          getTrxItems(t).forEach((item: any) => {
              const key = item.sku || item.name;
              if (!skuMap[key]) skuMap[key] = { name: item.name, qty: 0, total: 0 };
              skuMap[key].qty += Number(item.qty || 0);
              skuMap[key].total += (Number(item.qty || 0) * Number(item.price || 0));
          });
      });

      return { 
          qrisTableArray, totalIn: qrisTableArray.reduce((acc, r) => acc + r.inAmount, 0), totalCair: qrisTableArray.reduce((acc, r) => acc + r.cairAmount, 0), 
          totalPosSales, totalPosQty, methodBreakdown, rankedItems: Object.values(skuMap).sort((a,b)=>b.qty - a.qty)
      };
  }, [posData, qrisReconData, dateRange]);

  const trendData = useMemo(() => {
      let tStart = new Date();
      if (trendFilter === '1m') tStart.setMonth(tStart.getMonth() - 1);
      else if (trendFilter === '3m') tStart.setMonth(tStart.getMonth() - 3);
      else if (trendFilter === '6m') tStart.setMonth(tStart.getMonth() - 6);
      else if (trendFilter === 'ytd') tStart = new Date(tStart.getFullYear(), 0, 1);

      const tStartStr = tStart.toISOString().split('T')[0];
      const tMap: Record<string, Record<string, number>> = {};
      const activeMethods = new Set<string>();

      posData.forEach(trx => {
          const dStr = getTrxDate(trx);
          if (dStr >= tStartStr) {
              const mName = getTrxMethod(trx); const nominal = getTrxTotal(trx);
              const cat = Object.keys(METHOD_COLORS).includes(mName) ? mName : 'LAINNYA';
              if (!tMap[dStr]) tMap[dStr] = {}; if (!tMap[dStr][cat]) tMap[dStr][cat] = 0;
              tMap[dStr][cat] += nominal; activeMethods.add(cat);
          }
      });

      const dates = Object.keys(tMap).sort();
      let maxVal = 1;
      dates.forEach(d => { Object.values(tMap[d]).forEach(v => { if (v > maxVal) maxVal = v; }); });
      return { dates, tMap, activeMethods: Array.from(activeMethods), maxVal };
  }, [posData, trendFilter]);

  const handleSaveRecon = async (dateStr: string, inAmount: number) => {
      if (!sheetId) return alert("Sheet ID tidak valid.");
      setIsSaving(true);
      try {
          const res = await fetch('/api/recon-qris', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sheet-id': sheetId },
              body: JSON.stringify({ sheetId, tanggal: dateStr.split('-').reverse().join('/'), inAmount, cairAmount: inputCair, selisih: inAmount - inputCair, keterangan: inputKet })
          });
          const json = await res.json();
          if (json.success) { setEditQrisDate(null); fetchQrisRecon(sheetId); } else { alert("Gagal menyimpan: " + json.error); }
      } catch (err) { alert("Terjadi kesalahan."); } finally { setIsSaving(false); }
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
          const text = event.target?.result as string;
          const lines = text.split(/\r?\n/);
          if (lines.length < 2) return alert("File CSV kosong atau tidak valid.");

          const headers = lines[0].split(',');
          const idxGross = headers.findIndex(h => h.includes('Order Amount'));
          const idxNet = headers.findIndex(h => h.includes('Net Income'));
          const idxComm = headers.findIndex(h => h.includes('Commission'));
          const idxPromo = headers.findIndex(h => h.includes('Merchant Food Voucher'));
          
          if (idxGross === -1 || idxNet === -1) return alert("Format CSV tidak dikenali. Pastikan ini file ShopeeFood.");

          let totalGross = 0, totalNet = 0, totalComm = 0, totalPromo = 0, count = 0;
          
          for(let i=1; i<lines.length; i++) {
              if(!lines[i].trim()) continue;
              const cols = lines[i].split(',');
              totalGross += Number(cols[idxGross]) || 0;
              totalNet += Number(cols[idxNet]) || 0;
              totalComm += Number(cols[idxComm]) || 0;
              totalPromo += Number(cols[idxPromo]) || 0;
              count++;
          }

          setCsvSummary({
              filename: file.name,
              channel: 'ShopeeFood',
              date: new Date().toISOString().split('T')[0], 
              count, totalGross, totalNet, totalComm, totalPromo
          });
      };
      reader.readAsText(file);
  };

  const processCsvToDatabase = async () => {
      if (!csvSummary || !sheetId) return;
      setIsProcessingCsv(true);

      const uniqueId = `SHP_${Date.now().toString().slice(-6)}`;
      const invNumber = `INV-${uniqueId}`;

      const payload = {
          invoiceData: [
              csvSummary.date, csvSummary.date, invNumber, 'ShopeeFood', 'Bulk Settlement', csvSummary.count, 
              0, '', uniqueId, 'Paid', csvSummary.totalGross, (csvSummary.totalComm + csvSummary.totalPromo), csvSummary.totalNet
          ],
          paymentData: [
              csvSummary.date, uniqueId, 'IN', '1-1002', csvSummary.totalNet, `Settlement ShopeeFood (${csvSummary.count} Trx)`, 'Matched', invNumber
          ],
          expenseData: [
              [csvSummary.date, `Komisi ShopeeFood (${invNumber})`, '6-1001', csvSummary.totalComm, invNumber],
              [csvSummary.date, `Promo Merchant ShopeeFood (${invNumber})`, '6-1002', csvSummary.totalPromo, invNumber]
          ]
      };

      try {
          const res = await fetch('/api/b2b', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-sheet-id': sheetId },
              body: JSON.stringify({ action: 'PROCESS_MARKETPLACE_CSV', payload })
          });
          const json = await res.json();
          if (json.success) { alert(json.message); setCsvSummary(null); } else { alert("Gagal memproses: " + json.error); }
      } catch (e) { alert("Terjadi kesalahan jaringan."); }
      finally { setIsProcessingCsv(false); }
  };


  return (
    <div className="p-2 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 bg-slate-50 min-h-screen">
      
      {/* HEADER KONSOLIDASI */}
      <div className="bg-white p-4 md:p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
              <div>
                  <h1 className="text-xl md:text-2xl font-bold text-slate-800 flex items-center gap-2"><BarChart3 className="text-blue-600"/> Omnichannel Sales Report</h1>
                  <p className="text-slate-500 text-xs md:text-sm mt-1">Konsolidasi Omzet POS Ritel, B2B Invoice, dan Pelacakan QRIS</p>
              </div>
              <button onClick={handleRefresh} className="p-2 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-2 text-sm font-bold text-slate-600 w-full md:w-auto justify-center">
                  <RefreshCw size={16} className={`${posLoading || fetchStatus.qris==='loading' ? 'animate-spin' : ''}`} /> Refresh Data
              </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-100">
              <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar w-full md:w-max">
                  {['Semua Waktu', 'Hari ini', 'Kemarin', 'Minggu ini', 'Bulan ini', 'Bulan lalu'].map((label: string) => {
                      const keys: Record<string, string> = { 'Semua Waktu':'all', 'Hari ini':'today', 'Kemarin':'yesterday', 'Minggu ini':'thisWeek', 'Bulan ini':'thisMonth', 'Bulan lalu':'lastMonth' };
                      return (
                          <button key={label} onClick={() => handleQuickFilter(keys[label])} className="px-3 md:px-4 py-2 bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-600 rounded-xl text-xs font-bold whitespace-nowrap transition-colors border border-slate-200 shadow-sm flex-shrink-0">
                              {label}
                          </button>
                      );
                  })}
              </div>
              <div className="flex items-center justify-between gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm w-full md:w-max">
                  <Calendar size={16} className="text-slate-400 flex-shrink-0"/>
                  <input type="date" className="text-xs font-bold text-slate-700 bg-transparent outline-none w-full" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})}/>
                  <span className="text-xs font-bold text-slate-400 flex-shrink-0">-</span>
                  <input type="date" className="text-xs font-bold text-slate-700 bg-transparent outline-none w-full" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})}/>
              </div>
          </div>

          <div className="pt-3 mt-2 flex flex-wrap items-center gap-2 md:gap-4 text-[10px] font-mono text-slate-400">
              <span className="flex items-center gap-1"><Info size={12}/> DATA STATUS:</span>
              <span className={`px-2 py-0.5 rounded ${fetchStatus.pos === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  POS: {posLoading ? 'Loading...' : `${posData.length} baris`}
              </span>
              <span className={`px-2 py-0.5 rounded ${fetchStatus.qris === 'success' ? 'bg-emerald-50 text-emerald-600' : fetchStatus.qris === 'error' ? 'bg-rose-50 text-rose-600 border border-rose-200 font-bold' : 'bg-slate-100'}`}>
                  RECON_QRIS: {fetchStatus.qris === 'loading' ? 'Loading...' : fetchStatus.qris === 'error' ? `ERROR: ${fetchStatus.qrisErrorMsg}` : `${qrisReconData.length} baris`}
              </span>
          </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-12 h-12 md:w-16 md:h-16 bg-blue-50 rounded-full flex items-center justify-center"><Wallet className="text-blue-500 w-5 h-5 md:w-6 md:h-6 mr-2 mt-2"/></div>
              <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Revenue</p>
              <h3 className="text-lg md:text-2xl font-black text-slate-800 truncate">{fmtMoney(dashboardData.totalPosSales)}</h3>
          </div>
          <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-12 h-12 md:w-16 md:h-16 bg-emerald-50 rounded-full flex items-center justify-center"><Banknote className="text-emerald-500 w-5 h-5 md:w-6 md:h-6 mr-2 mt-2"/></div>
              <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cash Collected</p>
              <h3 className="text-lg md:text-2xl font-black text-emerald-600 truncate">{fmtMoney(dashboardData.totalPosSales)}</h3>
          </div>
          <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-12 h-12 md:w-16 md:h-16 bg-rose-50 rounded-full flex items-center justify-center"><AlertCircle className="text-rose-500 w-5 h-5 md:w-6 md:h-6 mr-2 mt-2"/></div>
              <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Outstanding AR</p>
              <h3 className="text-lg md:text-2xl font-black text-rose-600 truncate">Rp 0</h3>
          </div>
          <div className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center relative overflow-hidden">
              <div className="absolute -right-4 -top-4 w-12 h-12 md:w-16 md:h-16 bg-indigo-50 rounded-full flex items-center justify-center"><Package className="text-indigo-500 w-5 h-5 md:w-6 md:h-6 mr-2 mt-2"/></div>
              <p className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Items Sold</p>
              <h3 className="text-lg md:text-2xl font-black text-indigo-600 truncate">{dashboardData.totalPosQty} <span className="text-xs md:text-sm font-medium text-slate-500">Pcs</span></h3>
          </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex border-b border-slate-100 overflow-x-auto custom-scrollbar bg-slate-50/50">
              <button onClick={() => setActiveTab('overview')} className={`px-4 md:px-6 py-3 md:py-4 text-xs md:text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 border-b-2 flex-shrink-0 ${activeTab === 'overview' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500'}`}><BarChart3 size={16}/> Overview Ritel</button>
              <button onClick={() => setActiveTab('qris')} className={`px-4 md:px-6 py-3 md:py-4 text-xs md:text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 border-b-2 flex-shrink-0 ${activeTab === 'qris' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500'}`}><Smartphone size={16}/> QRIS Settlement Radar</button>
              <button onClick={() => setActiveTab('retail')} className={`px-4 md:px-6 py-3 md:py-4 text-xs md:text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 border-b-2 flex-shrink-0 ${activeTab === 'retail' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500'}`}><TrendingUp size={16}/> Product Performance</button>
              <button onClick={() => setActiveTab('b2b')} className={`px-4 md:px-6 py-3 md:py-4 text-xs md:text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 border-b-2 flex-shrink-0 ${activeTab === 'b2b' ? 'border-blue-600 text-blue-600 bg-white' : 'border-transparent text-slate-500'}`}><FileText size={16}/> B2B Invoice & AR</button>
          </div>

          <div className="p-4 md:p-6">
              
              {/* TAB 1: OVERVIEW RITEL */}
              {activeTab === 'overview' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                      <h3 className="text-base md:text-lg font-bold text-slate-800 flex items-center gap-2"><PieChart size={20} className="text-blue-500"/> Breakdown Penjualan per Metode Distribusi</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {Object.entries(dashboardData.methodBreakdown).map(([method, data]) => {
                              if (data.nominal === 0 && data.unit === 0) return null;
                              const pctNominal = (data.nominal / (dashboardData.totalPosSales || 1)) * 100;
                              const colorClass = METHOD_COLORS[method] || '#94a3b8';
                              return (
                                  <div key={method} className="bg-slate-50 p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                                      <div className="absolute top-0 left-0 w-1.5 h-full" style={{ backgroundColor: colorClass }}></div>
                                      <div className="pl-3">
                                          <p className="font-black text-slate-800 text-sm mb-2">{method}</p>
                                          <div className="flex justify-between items-end mb-1">
                                              <span className="text-[10px] md:text-xs font-bold text-slate-500">Nominal</span>
                                              <span className="text-base md:text-lg font-black" style={{ color: colorClass }}>{fmtMoney(data.nominal)}</span>
                                          </div>
                                          <div className="flex justify-between items-end mb-4 pb-3 border-b border-slate-200">
                                              <span className="text-[10px] md:text-xs font-bold text-slate-500">Unit Terjual</span>
                                              <span className="text-xs md:text-sm font-bold text-slate-700">{data.unit} Pcs</span>
                                          </div>
                                          <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
                                              <span>Kontribusi Total Omzet</span><span>{pctNominal.toFixed(1)}%</span>
                                          </div>
                                          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                              <div className="h-full" style={{ width: `${pctNominal}%`, backgroundColor: colorClass }}></div>
                                          </div>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              )}

              {/* TAB 2: QRIS SETTLEMENT RADAR */}
              {activeTab === 'qris' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 bg-slate-900 rounded-2xl p-4 md:p-6 text-white shadow-lg">
                          <div><p className="text-[10px] md:text-xs font-bold text-blue-300 uppercase mb-1 flex items-center gap-1"><Smartphone size={14}/> Total QRIS IN</p><p className="text-xl md:text-3xl font-mono font-bold truncate">{fmtMoney(dashboardData.totalIn)}</p></div>
                          <div className="border-t md:border-t-0 md:border-l border-slate-700 pt-3 md:pt-0 md:pl-6"><p className="text-[10px] md:text-xs font-bold text-emerald-400 uppercase mb-1 flex items-center gap-1"><CheckCircle2 size={14}/> Total Cair</p><p className="text-xl md:text-3xl font-mono font-bold truncate">{fmtMoney(dashboardData.totalCair)}</p></div>
                          <div className="border-t md:border-t-0 md:border-l border-slate-700 pt-3 md:pt-0 md:pl-6"><p className="text-[10px] md:text-xs font-bold text-rose-400 uppercase mb-1 flex items-center gap-1"><AlertCircle size={14}/> Uang Mengendap</p><p className="text-xl md:text-3xl font-mono font-bold truncate">{fmtMoney(dashboardData.totalIn - dashboardData.totalCair)}</p></div>
                      </div>
                      
                      {/* FIX: WRAPPER SCROLL HORIZONTAL UNTUK TABEL QRIS */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <div className="overflow-x-auto custom-scrollbar w-full max-h-[600px] overflow-y-auto">
                              <table className="w-full text-sm text-left min-w-[800px]">
                                  <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold border-b border-slate-200 sticky top-0 z-10">
                                      <tr><th className="p-4">Tanggal Trx</th><th className="p-4 text-right">QRIS IN (Sistem)</th><th className="p-4 text-right">Nominal Cair</th><th className="p-4 text-right">Selisih</th><th className="p-4 text-center">Status</th><th className="p-4 text-center">Aksi</th></tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white">
                                      {dashboardData.qrisTableArray.length === 0 ? (
                                          <tr><td colSpan={6} className="p-8 text-center text-slate-400">Tidak ada transaksi QRIS di rentang tanggal ini.</td></tr>
                                      ) : (
                                          dashboardData.qrisTableArray.map((row: any, idx: number) => {
                                              const isEditing = editQrisDate === row.date;
                                              const isSettled = row.inAmount > 0 && row.selisih <= 0; 
                                              const isPending = row.cairAmount === 0 && row.inAmount > 0;
                                              return (
                                                  <tr key={idx} className="hover:bg-blue-50/30">
                                                      <td className="p-4 font-bold text-slate-700 whitespace-nowrap">{row.date}</td>
                                                      <td className="p-4 text-right font-mono font-bold text-blue-600 whitespace-nowrap">{fmtMoney(row.inAmount)}</td>
                                                      <td className="p-4 text-right whitespace-nowrap">
                                                          {isEditing ? (
                                                              <div className="flex flex-col items-end gap-2">
                                                                  <input type="number" className="w-32 p-2 border-2 border-emerald-400 rounded-lg text-right font-mono font-bold text-slate-800 focus:outline-none" value={inputCair || ''} onChange={e => setInputCair(Number(e.target.value) || 0)} autoFocus/>
                                                                  <input type="text" className="w-40 p-1.5 border border-slate-300 rounded-md text-xs text-slate-600" value={inputKet} onChange={e => setInputKet(e.target.value)} placeholder="Keterangan (Opsional)"/>
                                                              </div>
                                                          ) : (<span className="font-mono font-bold text-emerald-600">{fmtMoney(row.cairAmount)}</span>)}
                                                      </td>
                                                      <td className={`p-4 text-right font-mono font-bold whitespace-nowrap ${row.selisih > 0 ? 'text-rose-500' : 'text-slate-400'}`}>{isEditing ? fmtMoney(row.inAmount - inputCair) : fmtMoney(row.selisih)}</td>
                                                      <td className="p-4 text-center whitespace-nowrap"><span className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase ${isSettled ? 'bg-emerald-100 text-emerald-700' : isPending ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{isSettled ? 'Settled' : isPending ? 'Pending' : 'Partial'}</span></td>
                                                      <td className="p-4 text-center whitespace-nowrap">
                                                          {isEditing ? (
                                                              <div className="flex justify-center gap-2"><button onClick={() => setEditQrisDate(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 bg-slate-100 rounded-lg hover:bg-slate-200">Batal</button><button onClick={() => handleSaveRecon(row.date, row.inAmount)} disabled={isSaving} className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 flex items-center gap-1 shadow-md">{isSaving ? <Loader2 size={12} className="animate-spin"/> : <Save size={12}/>} Simpan</button></div>
                                                          ) : (
                                                              <button onClick={() => {setEditQrisDate(row.date); setInputCair(row.cairAmount); setInputKet(row.ket);}} className="px-3 py-1.5 text-xs font-bold text-blue-600 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100">{row.cairAmount === 0 ? '+ Input Cair' : 'Edit'}</button>
                                                          )}
                                                      </td>
                                                  </tr>
                                              )
                                          })
                                      )}
                                  </tbody>
                              </table>
                          </div>
                      </div>
                  </div>
              )}

              {/* TAB 3: PRODUCT RETAIL */}
              {activeTab === 'retail' && (
                  <div className="animate-in fade-in duration-300">
                      
                      {/* FIX: WRAPPER SCROLL HORIZONTAL & VERTICAL UNTUK TABEL PRODUK */}
                      <div className="border border-slate-200 rounded-2xl overflow-hidden">
                          <div className="overflow-x-auto custom-scrollbar w-full max-h-[600px] overflow-y-auto">
                              <table className="w-full text-sm text-left min-w-[600px]">
                                  <thead className="bg-slate-50 text-slate-400 font-bold text-xs uppercase border-b sticky top-0 z-10 shadow-sm">
                                      <tr><th className="p-4">Rank</th><th className="p-4">Nama Barang</th><th className="p-4 text-center">Total Unit Terjual</th><th className="p-4 text-right">Total Nominal</th></tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white">
                                      {dashboardData.rankedItems.map((item: any, i: number) => (
                                          <tr key={i} className="hover:bg-blue-50/30">
                                              <td className="p-4 text-slate-400 font-bold whitespace-nowrap">#{i+1}</td>
                                              <td className="p-4 font-bold text-slate-700">{item.name}</td>
                                              <td className="p-4 text-center whitespace-nowrap"><span className="px-3 py-1 bg-slate-100 rounded-lg font-bold text-slate-600">{item.qty} Pcs</span></td>
                                              <td className="p-4 text-right font-bold text-blue-600 whitespace-nowrap">{fmtMoney(item.total)}</td>
                                          </tr>
                                      ))}
                                  </tbody>
                                  <tfoot className="bg-slate-800 text-white sticky bottom-0 z-10">
                                      <tr>
                                          <th colSpan={2} className="p-4 text-right font-black uppercase text-slate-300 tracking-widest text-xs md:text-sm">TOTAL KESELURUHAN:</th>
                                          <th className="p-4 text-center font-black text-sm md:text-lg whitespace-nowrap">{dashboardData.totalPosQty} Pcs</th>
                                          <th className="p-4 text-right font-black text-emerald-400 text-sm md:text-lg whitespace-nowrap">{fmtMoney(dashboardData.totalPosSales)}</th>
                                      </tr>
                                  </tfoot>
                              </table>
                          </div>
                      </div>
                  </div>
              )}

              {/* TAB 4: B2B INVOICE & MARKETPLACE RECONCILIATION */}
              {activeTab === 'b2b' && (
                  <div className="animate-in fade-in duration-300 space-y-8">
                      <div className="bg-orange-50/50 p-4 md:p-6 rounded-2xl border-2 border-dashed border-orange-200 text-center relative overflow-hidden">
                          <UploadCloud className="mx-auto text-orange-400 mb-3 opacity-50 w-10 h-10 md:w-12 md:h-12"/>
                          <h3 className="text-base md:text-lg font-bold text-slate-800 mb-1">Marketplace Auto-Clearing (CSV)</h3>
                          <p className="text-xs md:text-sm text-slate-500 mb-4 max-w-lg mx-auto">Tarik & Lepas file laporan CSV dari ShopeeFood di sini. Sistem akan otomatis memecah pendapatan bersih, potongan komisi, dan biaya diskon ke dalam buku besar.</p>
                          <label className="bg-white border border-slate-300 shadow-sm px-4 md:px-6 py-2 rounded-xl text-xs md:text-sm font-bold text-blue-600 cursor-pointer hover:bg-blue-50 transition-colors inline-block relative z-10">
                              Pilih File CSV ShopeeFood
                              <input type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
                          </label>
                      </div>

                      {csvSummary && (
                          <div className="bg-white border-2 border-emerald-400 rounded-2xl p-4 md:p-6 shadow-xl relative animate-in slide-in-from-bottom-4 overflow-x-auto">
                              <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-xl">FILE TERBACA</div>
                              <h4 className="font-bold text-slate-800 border-b border-slate-100 pb-3 mb-4 flex items-center gap-2 text-sm md:text-base"><CheckCircle2 className="text-emerald-500"/> Validasi Data: {csvSummary.filename}</h4>
                              
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6 min-w-[500px]">
                                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                      <p className="text-[9px] md:text-[10px] font-bold text-slate-500 uppercase">Total Transaksi</p>
                                      <p className="text-lg md:text-xl font-black text-slate-800">{csvSummary.count} <span className="text-xs md:text-sm font-medium">Trx</span></p>
                                  </div>
                                  <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                                      <p className="text-[9px] md:text-[10px] font-bold text-blue-500 uppercase">Gross Amount (POS)</p>
                                      <p className="text-lg md:text-xl font-black text-blue-700 truncate" title={fmtMoney(csvSummary.totalGross)}>{fmtMoney(csvSummary.totalGross)}</p>
                                  </div>
                                  <div className="bg-rose-50 p-3 rounded-xl border border-rose-100">
                                      <p className="text-[9px] md:text-[10px] font-bold text-rose-500 uppercase">Potongan (Beban)</p>
                                      <p className="text-lg md:text-xl font-black text-rose-600 truncate" title={fmtMoney(csvSummary.totalComm + csvSummary.totalPromo)}>{fmtMoney(csvSummary.totalComm + csvSummary.totalPromo)}</p>
                                  </div>
                                  <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                                      <p className="text-[9px] md:text-[10px] font-bold text-emerald-600 uppercase">Net Income (Cair Bank)</p>
                                      <p className="text-lg md:text-xl font-black text-emerald-700 truncate" title={fmtMoney(csvSummary.totalNet)}>{fmtMoney(csvSummary.totalNet)}</p>
                                  </div>
                              </div>

                              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                                  <button onClick={() => setCsvSummary(null)} className="px-4 md:px-5 py-2 text-xs md:text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">Batal</button>
                                  <button onClick={processCsvToDatabase} disabled={isProcessingCsv} className="px-4 md:px-6 py-2 text-xs md:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md flex items-center gap-2 transition-colors">
                                      {isProcessingCsv ? <Loader2 size={16} className="animate-spin"/> : <Save size={16}/>} <span className="hidden md:inline">Proses & Jurnal Semua</span><span className="md:hidden">Proses</span>
                                  </button>
                              </div>
                          </div>
                      )}
                  </div>
              )}
          </div>
      </div>

      {/* GRAFIK TREND LINE CHART INTERAKTIF */}
      <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm mt-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-6">
              <div>
                  <h3 className="text-base md:text-xl font-bold text-slate-800 flex items-center gap-2"><Activity size={20} className="text-blue-500"/> Tren Omzet by Distribusi</h3>
                  <p className="text-[10px] md:text-xs text-slate-500 mt-1">Pergerakan nominal penjualan harian (Line Chart).</p>
              </div>
              <div className="flex gap-2 bg-slate-100 p-1.5 rounded-lg border border-slate-200 overflow-x-auto w-full md:w-auto custom-scrollbar">
                  {[{ id: '1m', label: '1 Bulan' }, { id: '3m', label: '3 Bulan (Q)' }, { id: '6m', label: '6 Bulan (SM)' }, { id: 'ytd', label: 'Tahun Ini' }].map(f => (
                      <button key={f.id} onClick={() => setTrendFilter(f.id as any)} className={`px-3 md:px-4 py-1.5 text-[10px] md:text-xs font-bold rounded-md transition-colors whitespace-nowrap ${trendFilter === f.id ? 'bg-white text-blue-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-200'}`}>{f.label}</button>
                  ))}
              </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:gap-4 mb-4 text-[10px] md:text-xs font-bold uppercase pb-4 border-b border-slate-100">
              {trendData.activeMethods.map(m => (
                  <div key={m} className="flex items-center gap-1.5 md:gap-2"><span className="w-3 h-1 md:w-4 md:h-1 rounded-full" style={{ backgroundColor: METHOD_COLORS[m] || '#94a3b8' }}></span> {m}</div>
              ))}
          </div>

          <div className="relative w-full h-[250px] md:h-[350px] pt-4 font-sans select-none overflow-x-auto custom-scrollbar">
              <div className="min-w-[600px] h-full relative">
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6 md:pb-8 ml-8 md:ml-10">
                      {[0, 1, 2, 3, 4].map(i => {
                          const val = trendData.maxVal - (trendData.maxVal / 4) * i;
                          return (
                              <div key={i} className="w-full border-t border-slate-100 border-dashed relative flex items-center">
                                  <span className="absolute -left-2 -translate-x-full text-[8px] md:text-[10px] font-bold text-slate-400">{i === 4 ? '0' : fmtMoneyShort(val)}</span>
                              </div>
                          )
                      })}
                  </div>

                  {trendData.dates.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-400 font-medium text-xs md:text-sm">Tidak ada data untuk periode ini.</div>
                  ) : (
                      <div className="relative w-full h-full flex flex-col ml-8 md:ml-10" style={{ width: 'calc(100% - 32px)' }}>
                          <svg viewBox="0 0 1000 300" preserveAspectRatio="none" className="w-full h-full pb-6 md:pb-8 overflow-visible">
                              {trendData.activeMethods.map(m => {
                                  const points = trendData.dates.map((d, i) => {
                                      const x = (i / Math.max(trendData.dates.length - 1, 1)) * 1000;
                                      const val = trendData.tMap[d][m] || 0;
                                      const y = 300 - ((val / (trendData.maxVal || 1)) * 300);
                                      return `${x},${y}`;
                                  }).join(' L ');
                                  return (<path key={m} d={`M ${points}`} fill="none" stroke={METHOD_COLORS[m] || '#94a3b8'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-sm opacity-80 hover:opacity-100 transition-opacity" />);
                              })}
                          </svg>

                          <div className="absolute inset-0 w-full h-full pb-6 md:pb-8 flex">
                              {trendData.dates.map((d, i) => {
                                  const showDate = i % Math.ceil(trendData.dates.length / 8) === 0 || i === trendData.dates.length - 1;
                                  return (
                                      <div key={d} className="flex-1 h-full group relative flex justify-center cursor-crosshair">
                                          <div className="w-px h-full bg-slate-300 opacity-0 group-hover:opacity-100 transition-opacity absolute"></div>
                                          <div className="absolute bottom-full mb-2 bg-slate-900 border border-slate-700 text-white p-2 md:p-3 rounded-xl text-[10px] md:text-xs min-w-[140px] md:min-w-[160px] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 shadow-2xl -translate-x-1/2 left-1/2">
                                              <p className="font-bold border-b border-slate-700 pb-1.5 mb-2 text-slate-300">{formatDateShort(d)}</p>
                                              {trendData.activeMethods.map(m => {
                                                  const val = trendData.tMap[d][m] || 0;
                                                  if (val === 0) return null;
                                                  return (
                                                      <div key={m} className="flex justify-between items-center gap-3 md:gap-4 mb-1">
                                                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: METHOD_COLORS[m] }}></span> {m}</span>
                                                          <span className="font-mono font-bold text-white">{fmtMoney(val)}</span>
                                                      </div>
                                                  )
                                              })}
                                          </div>
                                          {showDate && (<div className="absolute -bottom-4 md:-bottom-6 text-[8px] md:text-[10px] font-bold text-slate-400 whitespace-nowrap">{formatDateShort(d)}</div>)}
                                      </div>
                                  )
                              })}
                          </div>
                      </div>
                  )}
              </div>
          </div>
      </div>

    </div>
  );
}