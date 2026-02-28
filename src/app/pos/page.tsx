'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Search, ShoppingCart, Trash2, CreditCard, Banknote, QrCode, 
  Store, LogOut, Printer, X, Loader2,
  User, Clock, Calendar, CheckCircle2,
  FileDown, ClipboardList, Box, CloudUpload, RefreshCw, Database, Laptop2, Eraser, UploadCloud, ImageIcon,
  ChevronLeft, ChevronRight,
  Smartphone, BarChart3, ShieldAlert, CheckCircle, PieChart 
} from 'lucide-react';

import { useFetch } from '@/hooks/useFetch'; 

// --- KONSTANTA KOMISI MARKETPLACE ---
const MARKETPLACE_COMMISSION = {
    ShopeeFood: 0.42, // 42%
    GrabFood: 0.26,   // 26%
    GoFood: 0.22,     // 22%
    Cash: 0,
    QRIS: 0,
    Transfer: 0
};

type PaymentMethodType = 'Cash' | 'QRIS' | 'Transfer' | 'ShopeeFood' | 'GrabFood' | 'GoFood';

export default function PosPage() {
  // --- STATE CORE ---
  const [activeView, setActiveView] = useState<'cashier' | 'transactions' | 'shifts' | 'analysis'>('cashier');
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  
  // --- STATE USER & SYNC ---
  const [ownerEmail, setOwnerEmail] = useState<string>(''); 
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // --- STATE CLOUD DASHBOARD & GL AUDIT ---
  const [viewSource, setViewSource] = useState<'local' | 'cloud'>('local');
  const [cloudTransactions, setCloudTransactions] = useState<any[]>([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  
  // State for GL Audit
  const [isAuditingGL, setIsAuditingGL] = useState(false);
  const [unsyncedGLIds, setUnsyncedGLIds] = useState<string[]>([]);
  const [auditDone, setAuditDone] = useState(false);

  // --- STATE MASTERS ---
  const [masterCashiers, setMasterCashiers] = useState<any[]>([]);
  const [masterShifts, setMasterShifts] = useState<any[]>([]);
  
  // STATE CONFIG STRUK
  const [receiptConfig, setReceiptConfig] = useState<any>({
      Store_Name: 'METALURGI POS',
      Address: '',
      Phone: '',
      Footer: 'Terima Kasih'
  });
  
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [calculatedStockMap, setCalculatedStockMap] = useState<Record<string, number>>({});
  const [localSoldQtyMap, setLocalSoldQtyMap] = useState<Record<string, number>>({});

  // --- STATE SHIFT & CLOSING ---
  const [isShiftOpen, setIsShiftOpen] = useState(false);
  const [shiftData, setShiftData] = useState<any>({ 
      id: '', startTime: null, startCash: 0, totalSales: 0, 
      cashierName: '', shiftName: '' 
  });
  const [shiftHistory, setShiftHistory] = useState<any[]>([]);
  
  const [showShiftModal, setShowShiftModal] = useState(true);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  
  const [selectedCashier, setSelectedCashier] = useState('');
  const [selectedShift, setSelectedShift] = useState('');
  const [startCashInput, setStartCashInput] = useState(0);
  const [endCashInput, setEndCashInput] = useState(0); 
  const [cashOutInput, setCashOutInput] = useState(0);
  const [closingNote, setClosingNote] = useState('');

  // --- STATE PAYMENT ---
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false); 
  const [showReceiptPreview, setShowReceiptPreview] = useState(false); 
  
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('Cash');
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [currentTrx, setCurrentTrx] = useState<any>(null); 

  // --- STATE HISTORY & FILTER ---
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState({ 
    start: new Date().toISOString().split('T')[0], 
    end: new Date().toISOString().split('T')[0] 
  });
  const [shiftFilter, setShiftFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'timestamp', direction: 'desc' });

  // STATE PAGINATION
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // --- STATE MISC ---
  const [printType, setPrintType] = useState<'receipt' | 'shift_report' | null>(null);
  const [shiftReportData, setShiftReportData] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  // --- DATA FETCHING ---
  const { data: apiData, loading } = useFetch<any>('/api/pos');
  const { data: glApiData } = useFetch<any>('/api/general-ledger');

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

  // --- PENGEKSTRAK DATA CERDAS ANTI-BLANK ---
  const getTrxItems = (trx: any) => {
      if (!trx) return [];
      let raw = trx.items || trx.items_json || trx.Item_JSON || trx.Items || '[]';
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string') {
          try {
              let parsed = JSON.parse(raw);
              if (typeof parsed === 'string') parsed = JSON.parse(parsed); // Jaga-jaga jika ter-stringify ganda
              if (Array.isArray(parsed)) return parsed;
          } catch(e) {}
      }
      return [];
  };
  const getTrxTotal = (trx: any) => Number(trx.total || trx.Total_Amount || trx.Total || 0);
  const getTrxMethod = (trx: any) => trx.paymentMethod || trx.Payment_Method || 'Cash';
  const getTrxDate = (trx: any) => trx.date || trx.Date || new Date().toISOString();

  useEffect(() => {
    if (typeof window !== 'undefined') {
        const savedLogo = localStorage.getItem('METALURGI_SHOP_LOGO');
        if (savedLogo) setLogoPreview(savedLogo);

        const savedMasters = localStorage.getItem('METALURGI_POS_MASTERS');
        if (savedMasters) {
            try {
                const parsedMasters = JSON.parse(savedMasters);
                if (parsedMasters.receipt) setReceiptConfig(parsedMasters.receipt);
            } catch (e) { }
        }

        const directEmail = localStorage.getItem('METALURGI_USER_EMAIL');
        if (directEmail) {
            setOwnerEmail(directEmail);
        } else {
            const userObj = localStorage.getItem('METALURGI_USER');
            if (userObj) {
                try {
                    const parsed = JSON.parse(userObj);
                    if(parsed.email) setOwnerEmail(parsed.email);
                    setCurrentUser(parsed);
                } catch(e) {}
            }
        }

        const savedShiftHistory = JSON.parse(localStorage.getItem('METALURGI_POS_SHIFT_HISTORY') || '[]');
        setShiftHistory(savedShiftHistory.reverse()); 

        const savedShift = localStorage.getItem('METALURGI_POS_SHIFT');
        if (savedShift) {
           const parsed = JSON.parse(savedShift);
           if (parsed.status === 'OPEN') {
              setIsShiftOpen(true);
              setShiftData(parsed);
              setShowShiftModal(false);
           }
        }

        const allTrx = JSON.parse(localStorage.getItem('METALURGI_POS_TRX') || '[]');
        setAllTransactions(allTrx);

        const localMoves = JSON.parse(localStorage.getItem('METALURGI_INVENTORY_MOVEMENTS') || '[]');
        const soldMap: Record<string, number> = {};
        localMoves.forEach((m: any) => {
            if (m.type === 'OUT' && m.id && String(m.id).startsWith('MOV-POS-')) {
                soldMap[m.sku] = (soldMap[m.sku] || 0) + m.qty;
            }
        });
        setLocalSoldQtyMap(soldMap);
    }
  }, []);

  useEffect(() => {
    if (!apiData) return;
    try {
        const rawProducts = processSheetData(apiData.products);
        const rawMovements = processSheetData(apiData.movements);
        const users = processSheetData(apiData.users); 
        const shifts = processSheetData(apiData.shifts); 
        const rawCloudTrx = processSheetData(apiData.posHistory);

        if (apiData.receipt) setReceiptConfig(apiData.receipt);

        setProducts(rawProducts);
        
        if (users.length > 0) setMasterCashiers(users);
        else setMasterCashiers([{Name: 'Kasir 1'}, {Name: 'Kasir 2'}, {Name: 'Admin'}]); 

        if (shifts.length > 0) setMasterShifts(shifts);
        else setMasterShifts([{Shift_Name: 'Pagi', Start_Time: '08:00', End_Time: '16:00'}, {Shift_Name: 'Sore', Start_Time: '16:00', End_Time: '22:00'}]);

        if (rawCloudTrx.length > 0) {
            const parsedCloudTrx = rawCloudTrx.map((row: any) => {
                return {
                    id: row.ID,
                    date: row.Date,
                    timestamp: row.Timestamp,
                    total: parseFloat(row.Total_Amount || row.Total) || 0,
                    paymentMethod: row.Payment_Method,
                    amountPaid: parseFloat(row.Amount_Paid) || 0,
                    change: parseFloat(row.Change) || 0,
                    cashier: row.Cashier,
                    shift: row.Shift,
                    shiftId: row.Shift_ID,
                    items: getTrxItems(row), // Pastikan items terbaca
                    isCloud: true 
                };
            });
            setCloudTransactions(parsedCloudTrx.reverse());
        }

        const stockMap: Record<string, number> = {};
        rawProducts.forEach((p: any) => {
             stockMap[p.SKU] = parseInt(p.Initial_Stock || '0');
        });
        rawMovements.forEach((m: any) => {
             const qty = parseInt(m.Qty || '0');
             const sku = m.Product_SKU;
             if (stockMap[sku] !== undefined) {
                 if (m.Movement_Type === 'IN') { stockMap[sku] += qty; } 
                 else if (m.Movement_Type === 'OUT') { stockMap[sku] -= qty; }
             }
        });
        setCalculatedStockMap(stockMap); 
    } catch (err) {
        console.error("Gagal parsing data awal:", err);
    }
  }, [apiData]);

  // --- HELPER ---
  const fmtMoney = (n: any) => {
    const num = Number(n) || 0; 
    return "Rp " + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };
  
  const getProductPromo = (sku: string, basePrice: number) => {
      return { hasPromo: false, finalPrice: basePrice, discountVal: 0, label: '', minQty: 1 };
  };

  const getLiveStock = (product: any) => {
      const sheetStock = calculatedStockMap[product.SKU] || 0;
      const soldLocally = localSoldQtyMap[product.SKU] || 0;
      const inCart = cart.find(c => c.sku === product.SKU)?.qty || 0;
      const cat = (product.Category || '').toLowerCase();
      if (cat.includes('jasa') || cat.includes('service')) return 9999;
      return Math.max(0, sheetStock - soldLocally - inCart);
  };

  // --- [FIX] MENGUBAH JALUR FETCH AGAR BYPASS BUG BACKEND ---
  const fetchCloudData = async () => {
    setIsLoadingCloud(true);
    setAuditDone(false); 
    try {
        const res = await fetch('/api/pos');
        const json = await res.json();
        
        if (json && json.posHistory) {
            const rawCloud = processSheetData(json.posHistory);
            const parsed = rawCloud.map((row: any) => ({
                id: row.ID,
                date: row.Date,
                timestamp: row.Timestamp,
                total: parseFloat(row.Total_Amount || row.Total) || 0,
                paymentMethod: row.Payment_Method,
                amountPaid: parseFloat(row.Amount_Paid) || 0,
                change: parseFloat(row.Change) || 0,
                cashier: row.Cashier,
                shift: row.Shift,
                shiftId: row.Shift_ID,
                items: getTrxItems(row),
                isCloud: true
            }));
            setCloudTransactions(parsed.reverse());
        }
    } catch (err) {} 
    finally { setIsLoadingCloud(false); }
  };

  useEffect(() => {
    if (viewSource === 'cloud' && (activeView === 'transactions' || activeView === 'analysis')) fetchCloudData();
  }, [viewSource, activeView]);

  const runGLAudit = async () => {
      setIsAuditingGL(true);
      await new Promise(resolve => setTimeout(resolve, 600));

      try {
          if (!glApiData || !glApiData.gl) {
              alert("Data General Ledger belum siap atau gagal dimuat. Silakan refresh halaman (F5) dan coba lagi.");
              setIsAuditingGL(false);
              return;
          }
          
          const glRows = glApiData.gl || [];
          const glRefIds = new Set(glRows.slice(1).map((r:any) => String(r[6])));
          
          const missingIds: string[] = [];
          cloudTransactions.forEach(trx => {
              if (!glRefIds.has(trx.id)) {
                  missingIds.push(trx.id);
              }
          });
          
          setUnsyncedGLIds(missingIds);
          setAuditDone(true);

          if (missingIds.length === 0) {
              alert("✅ Audit Selesai: Semua transaksi Cloud sudah masuk ke General Ledger!");
          } else {
              alert(`⚠️ Peringatan: Ditemukan ${missingIds.length} transaksi yang belum masuk ke General Ledger. Silakan cek tabel untuk tracing.`);
          }
      } catch (e) {
          alert("Gagal memproses audit General Ledger.");
      } finally {
          setIsAuditingGL(false);
      }
  };

  // --- FUNGSI FILTER CEPAT ---
  const handleQuickFilter = (preset: string) => {
      const dateNow = new Date();
      const formatDate = (date: Date) => {
          const y = date.getFullYear();
          const m = String(date.getMonth() + 1).padStart(2, '0');
          const d = String(date.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
      };

      let start = new Date(dateNow);
      let end = new Date(dateNow);

      if (preset === 'yesterday') {
          start.setDate(dateNow.getDate() - 1);
          end.setDate(dateNow.getDate() - 1);
      } else if (preset === 'thisWeek') {
          const day = dateNow.getDay();
          const diff = dateNow.getDate() - day + (day === 0 ? -6 : 1);
          start.setDate(diff);
          end = new Date(start);
          end.setDate(start.getDate() + 6);
      } else if (preset === 'thisMonth') {
          start = new Date(dateNow.getFullYear(), dateNow.getMonth(), 1);
          end = new Date(dateNow.getFullYear(), dateNow.getMonth() + 1, 0);
      } else if (preset === 'lastMonth') {
          start = new Date(dateNow.getFullYear(), dateNow.getMonth() - 1, 1);
          end = new Date(dateNow.getFullYear(), dateNow.getMonth(), 0);
      }

      setDateRange({ start: formatDate(start), end: formatDate(end) });
  };


  const filteredHistory = useMemo(() => {
      const sourceData = viewSource === 'local' ? allTransactions : cloudTransactions;
      let data = [...sourceData];
      
      const start = new Date(dateRange.start); 
      const end = new Date(dateRange.end); 
      end.setHours(23, 59, 59, 999);

      data = data.filter(t => { 
          const tDate = new Date(getTrxDate(t)); 
          return tDate >= start && tDate <= end; 
      });

      if (shiftFilter !== 'all') data = data.filter(t => t.shift === shiftFilter);
      if (historySearch) { 
          const lower = historySearch.toLowerCase(); 
          data = data.filter(t => (t.id||'').toLowerCase().includes(lower) || getTrxItems(t).some((i:any) => (i.name||'').toLowerCase().includes(lower)));
      }

      data.sort((a, b) => {
          let aVal = a[sortConfig.key];
          let bVal = b[sortConfig.key];
          if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
      });
      return data;
  }, [allTransactions, cloudTransactions, viewSource, dateRange, shiftFilter, historySearch, sortConfig]);

  const paginatedHistory = useMemo(() => {
      const startIndex = (currentPage - 1) * itemsPerPage;
      return filteredHistory.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredHistory, currentPage]);
  const totalPages = Math.ceil(filteredHistory.length / itemsPerPage);

  // --- LOGIC: POS ANALYSIS ---
  const analysisData = useMemo(() => {
      const start = new Date(dateRange.start); start.setHours(0,0,0,0);
      const end = new Date(dateRange.end); end.setHours(23,59,59,999);

      // 1. RECONCILIATION: Fokus ke data Cloud + Unit/Pcs
      const methods = ['Cash', 'QRIS', 'Transfer', 'ShopeeFood', 'GrabFood', 'GoFood'];
      const reconcileStats: any[] = [];
      let totalCloud = 0;
      let totalCloudQty = 0;

      const cldTrx = cloudTransactions.filter(t => {
          const d = new Date(getTrxDate(t));
          return d >= start && d <= end;
      });

      methods.forEach(m => {
          const trxs = cldTrx.filter(t => getTrxMethod(t) === m);
          const c = trxs.reduce((a,b) => a + getTrxTotal(b), 0);
          
          let cQty = 0;
          trxs.forEach(trx => {
              const items = getTrxItems(trx);
              items.forEach((item: any) => {
                  cQty += (Number(item.qty) || 0);
              });
          });
          
          if (c > 0 || cQty > 0) {
              reconcileStats.push({ method: m, cloud: c, qty: cQty });
          }
          totalCloud += c;
          totalCloudQty += cQty;
      });

      // 2. SKU PERFORMANCE
      const skuStats: Record<string, { name: string, qty: number, total: number }> = {};
      const activeTrx = viewSource === 'local' 
          ? allTransactions.filter(t => {
                const d = new Date(getTrxDate(t));
                return d >= start && d <= end;
            }) 
          : cldTrx;
      
      activeTrx.forEach(trx => {
          const items = getTrxItems(trx);
          items.forEach((item: any) => {
              const sku = item.sku || 'UNKNOWN';
              if (!skuStats[sku]) skuStats[sku] = { name: item.name || 'Unknown Item', qty: 0, total: 0 };
              skuStats[sku].qty += (Number(item.qty) || 0);
              skuStats[sku].total += ((Number(item.qty) || 0) * (Number(item.price) || 0));
          });
      });

      const rankedSKU = Object.values(skuStats)
          .filter(s => s.qty > 0)
          .sort((a, b) => b.total - a.total);
          
      const grandTotalQty = rankedSKU.reduce((sum, item) => sum + item.qty, 0);
      const grandTotalAmount = rankedSKU.reduce((sum, item) => sum + item.total, 0);

      // 3. MARKETPLACE EST. PROFIT -> PENCAIRAN MARKETPLACE
      const getMpTotal = (mName: string) => cldTrx.filter(t => getTrxMethod(t) === mName).reduce((a,b) => a + getTrxTotal(b), 0);
      const cloudShopee = getMpTotal('ShopeeFood');
      const cloudGrab = getMpTotal('GrabFood');
      const cloudGoFood = getMpTotal('GoFood');

      const calcMp = (gross: number, commRate: number) => ({
          Gross: gross,
          Commission: gross * commRate,
          Net: gross - (gross * commRate)
      });

      const estCommission = {
          Shopee: calcMp(cloudShopee, MARKETPLACE_COMMISSION.ShopeeFood),
          Grab: calcMp(cloudGrab, MARKETPLACE_COMMISSION.GrabFood),
          GoFood: calcMp(cloudGoFood, MARKETPLACE_COMMISSION.GoFood),
          TotalGross: cloudShopee + cloudGrab + cloudGoFood,
          TotalCommission: (cloudShopee * MARKETPLACE_COMMISSION.ShopeeFood) + (cloudGrab * MARKETPLACE_COMMISSION.GrabFood) + (cloudGoFood * MARKETPLACE_COMMISSION.GoFood)
      };
      
      const TotalNet = estCommission.TotalGross - estCommission.TotalCommission;

      return { reconcileStats, totalCloud, totalCloudQty, rankedSKU, grandTotalQty, grandTotalAmount, estCommission, TotalNet };
  }, [allTransactions, cloudTransactions, dateRange, viewSource]);


  // --- SYNC & ACTION LOGIC ---
  const runAutoSync = async (transaction: any) => {
    if (!ownerEmail) return; 
    setIsSyncing(true);
    try {
       await fetch('/api/pos/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ownerEmail, transactions: [transaction] }) });
    } catch (err) {} finally { setIsSyncing(false); }
  };

  const handleSyncShifts = async () => {
      if (!ownerEmail) return alert("Sesi Owner tidak valid.");
      if (shiftHistory.length === 0) return alert("Tidak ada data shift.");
      setIsSyncing(true);
      try {
          const res = await fetch('/api/pos/shift', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ownerEmail, shiftData: shiftHistory }) });
          const json = await res.json();
          if (json.success) alert(`✅ Laporan Shift Terupload!`);
          else alert(`❌ Gagal: ${json.error}`);
      } catch (err) { alert("Gagal koneksi server."); }
      finally { setIsSyncing(false); }
  };

  const handleDeleteTransaction = (id: string) => {
      if(viewSource !== 'local') return alert("Data Cloud tidak bisa dihapus dari sini.");
      if(confirm("Hapus transaksi ini? Stok tidak akan dikembalikan otomatis.")) {
          const newTrx = allTransactions.filter(t => t.id !== id);
          setAllTransactions(newTrx);
          localStorage.setItem('METALURGI_POS_TRX', JSON.stringify(newTrx));
      }
  };

  const handleResetTransactions = () => {
      if (viewSource !== 'local') return;
      if (allTransactions.length === 0) return alert("Data kosong.");
      if (confirm("⚠️ Hapus SEMUA riwayat transaksi LOKAL?")) {
          setAllTransactions([]); localStorage.removeItem('METALURGI_POS_TRX');
      }
  };

  const handleResetShifts = () => {
      if (shiftHistory.length === 0) return alert("Data kosong.");
      if(confirm("⚠️ Hapus semua riwayat Shift LOKAL?")) {
          setShiftHistory([]); localStorage.removeItem('METALURGI_POS_SHIFT_HISTORY');
      }
  };

  const addToCart = (product: any) => {
     if (!isShiftOpen) { alert("Buka Shift Kasir terlebih dahulu!"); return setShowShiftModal(true); }
     const currentStock = getLiveStock(product);
     if (currentStock <= 0) { alert(`Stok "${product.Product_Name}" Habis!`); return; }
     const basePrice = parseInt(product.Sell_Price_List) || 0;
     setCart(prev => {
        const existing = prev.find(item => item.sku === product.SKU);
        return existing ? prev.map(item => item.sku === product.SKU ? { ...item, qty: existing.qty + 1 } : item) : 
        [...prev, { sku: product.SKU, name: product.Product_Name, price: basePrice, qty: 1, discount: 0, isPromo: false }];
     });
  };

  const updateQty = (sku: string, d: number) => {
     const p = products.find(p => p.SKU === sku);
     if (d > 0 && getLiveStock(p) <= 0) return alert("Stok tidak mencukupi!");
     setCart(prev => prev.map(item => item.sku === sku ? { ...item, qty: Math.max(1, item.qty + d) } : item));
  };

  const removeFromCart = (sku: string) => setCart(prev => prev.filter(i => i.sku !== sku));
  const cartTotal = useMemo(() => cart.reduce((acc, item) => acc + (item.price * item.qty), 0), [cart]);
  const changeDue = amountPaid - cartTotal;

  const handleSyncToCloud = async () => {
      const localData = localStorage.getItem('METALURGI_POS_TRX');
      if (!localData) return alert("Belum ada data.");
      const trxs = JSON.parse(localData);
      if (trxs.length === 0) return alert("Data kosong.");
      if (!ownerEmail) return alert("Sesi Owner tidak valid.");
      if(!confirm(`Upload ${trxs.length} transaksi?`)) return;

      setIsSyncing(true);
      try {
          const res = await fetch('/api/pos/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ownerEmail, transactions: trxs }) });
          const json = await res.json();
          if (json.success) alert(`✅ SUKSES: ${json.message}`);
          else alert(`❌ GAGAL: ${json.error}`);
      } catch (err) { alert("Gagal koneksi."); } 
      finally { setIsSyncing(false); }
  };

  const handleOpenShift = () => {
     if (!selectedCashier || !selectedShift) { alert("Pilih Nama Kasir dan Shift!"); return; }
     const newShift = { id: `SHIFT-${Date.now()}`, status: 'OPEN', startTime: new Date().toISOString(), startCash: startCashInput, totalSales: 0, cashierName: selectedCashier, shiftName: selectedShift };
     setShiftData(newShift); setIsShiftOpen(true); localStorage.setItem('METALURGI_POS_SHIFT', JSON.stringify(newShift)); setShowShiftModal(false);
  };

  const handleCloseShift = () => {
     if(!confirm("Proses Tutup Shift? Pastikan laci kasir sudah dihitung.")) return;
     
     const shiftTrx = allTransactions.filter(t => t.shiftId === shiftData.id);
     
     const grossSales = shiftTrx.reduce((acc, t) => acc + (t.total || 0), 0);
     const totalDiscount = 0; 
     const totalTax = 0; 
     const netSales = grossSales - totalDiscount + totalTax;

     let totalItemQty = 0;

     const paymentBreakdown = { Cash: 0, QRIS: 0, Transfer: 0, ShopeeFood: 0, GrabFood: 0, GoFood: 0 };
     const shiftItemsMap: Record<string, {name: string, qty: number, total: number}> = {};

     shiftTrx.forEach(t => {
         const method = t.paymentMethod as PaymentMethodType;
         if (paymentBreakdown[method] !== undefined) paymentBreakdown[method] += (t.total || 0);

         t.items.forEach((item: any) => {
             totalItemQty += item.qty;
             if (!shiftItemsMap[item.sku]) shiftItemsMap[item.sku] = { name: item.name, qty: 0, total: 0 };
             shiftItemsMap[item.sku].qty += item.qty;
             shiftItemsMap[item.sku].total += (item.qty * item.price);
         });
     });

     const shiftItemsArray = Object.values(shiftItemsMap).sort((a,b) => b.total - a.total);

     const cashIn = paymentBreakdown.Cash;
     const expectedCashEnd = shiftData.startCash + cashIn - cashOutInput;
     const variance = endCashInput - expectedCashEnd;

     const closingData = { 
         ...shiftData, status: 'CLOSED', endTime: new Date().toISOString(), 
         grossSales, totalDiscount, totalTax, netSales, totalItemQty,
         paymentBreakdown, shiftItemsArray, 
         cashIn, cashOut: cashOutInput, expectedCashEnd, endCashActual: endCashInput, variance, note: closingNote, changeGiven: 0
     };
     
     const history = JSON.parse(localStorage.getItem('METALURGI_POS_SHIFT_HISTORY') || '[]');
     const newHistory = [closingData, ...history];
     localStorage.setItem('METALURGI_POS_SHIFT_HISTORY', JSON.stringify(newHistory));
     setShiftHistory(newHistory); 
     localStorage.removeItem('METALURGI_POS_SHIFT');
     
     if (ownerEmail) {
         fetch('/api/pos/shift', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ownerEmail, shiftData: closingData }) }).catch(()=>{});
     }

     setIsShiftOpen(false); setShiftData({ startTime: null, startCash: 0, totalSales: 0 }); setCart([]); setShowCloseShiftModal(false);
     setShiftReportData(closingData); setPrintType('shift_report'); setShowReceiptPreview(true);
  };

  const handleProcessPayment = () => {
     if (amountPaid < cartTotal && paymentMethod === 'Cash') return alert("Uang pembayaran kurang!");
     const liveDate = new Date(); 
     const trx = {
        id: `POS-${Math.floor(Math.random()*1000000)}`, date: liveDate.toISOString(), timestamp: liveDate.toLocaleTimeString(), 
        items: cart, total: cartTotal, paymentMethod, 
        amountPaid: ['QRIS','Transfer','ShopeeFood','GrabFood','GoFood'].includes(paymentMethod) ? cartTotal : amountPaid,
        change: ['QRIS','Transfer','ShopeeFood','GrabFood','GoFood'].includes(paymentMethod) ? 0 : Math.max(0, changeDue), 
        cashier: shiftData.cashierName, shift: shiftData.shiftName, shiftId: shiftData.id, isPrinted: false
     };
     const newHistory = [trx, ...allTransactions];
     localStorage.setItem('METALURGI_POS_TRX', JSON.stringify(newHistory));
     setAllTransactions(newHistory); 
     const updatedShift = { ...shiftData, totalSales: shiftData.totalSales + cartTotal };
     setShiftData(updatedShift); localStorage.setItem('METALURGI_POS_SHIFT', JSON.stringify(updatedShift));

     generatePOSJournals(trx); updateInventoryStock(trx); runAutoSync(trx);
     setCurrentTrx(trx); setShowPaymentModal(false); setCart([]); setShowSuccessModal(true);
  };

  const generatePOSJournals = (trx: any) => { 
      try { 
          const journals: any[] = []; 
          let debitAcc = '1-1001'; 
          if (trx.paymentMethod === 'QRIS') debitAcc = '1-1201'; 
          else if (trx.paymentMethod === 'ShopeeFood') debitAcc = '1-1202';
          else if (trx.paymentMethod === 'GoFood') debitAcc = '1-1203';
          else if (trx.paymentMethod === 'GrabFood') debitAcc = '1-1204';
          else if (trx.paymentMethod === 'Transfer') debitAcc = '1-1002'; 

          const dateStr = trx.date.split('T')[0]; 
          journals.push({ source: 'POS', id: `JNL-${trx.id}-SALES`, date: dateStr, ref: trx.id, desc: `Penjualan POS - ${trx.paymentMethod}`, debit_acc: debitAcc, credit_acc: '4-1000', amount: trx.total }); 
          trx.items.forEach((item: any) => { 
              const prod = products.find(p => p.SKU === item.sku); 
              const cost = parseInt(prod?.Std_Cost_Budget || '0'); 
              if (cost > 0) journals.push({ source: 'POS', id: `JNL-${trx.id}-COGS-${item.sku}`, date: dateStr, ref: trx.id, desc: `HPP - ${item.name}`, debit_acc: '5-1000', credit_acc: '1-1003', amount: cost * item.qty }); 
          }); 
          const existingRaw = localStorage.getItem('METALURGI_GL_JOURNALS'); 
          let existingGL = existingRaw ? JSON.parse(existingRaw) : []; 
          if (!Array.isArray(existingGL)) existingGL = []; 
          localStorage.setItem('METALURGI_GL_JOURNALS', JSON.stringify([...existingGL, ...journals])); 
      } catch (err) {} 
  };
  
  const updateInventoryStock = (trx: any) => { const dateStr = trx.date.split('T')[0]; const moves = trx.items.map((item: any) => ({ id: `MOV-POS-${trx.id}-${item.sku}`, date: dateStr, type: 'OUT', sku: item.sku, qty: item.qty, cost: 0, ref: trx.id })); const existingMoves = JSON.parse(localStorage.getItem('METALURGI_INVENTORY_MOVEMENTS') || '[]'); const newMoves = [...existingMoves, ...moves]; localStorage.setItem('METALURGI_INVENTORY_MOVEMENTS', JSON.stringify(newMoves)); const newSoldMap = { ...localSoldQtyMap }; moves.forEach((m: any) => { newSoldMap[m.sku] = (newSoldMap[m.sku] || 0) + m.qty; }); setLocalSoldQtyMap(newSoldMap); };
  const handlePrintReceipt = () => { if(!currentTrx) return; const allTrx = JSON.parse(localStorage.getItem('METALURGI_POS_TRX') || '[]'); const updatedTrx = allTrx.map((t:any) => t.id === currentTrx.id ? { ...t, isPrinted: true } : t); localStorage.setItem('METALURGI_POS_TRX', JSON.stringify(updatedTrx)); setAllTransactions(updatedTrx); setShowSuccessModal(false); setPrintType('receipt'); setShowReceiptPreview(true); };

  const categories = ['All', ...Array.from(new Set(products.map(p => p.Category)))];
  const filteredProducts = products.filter(p => (activeCategory === 'All' || p.Category === activeCategory) && (p.Product_Name.toLowerCase().includes(searchTerm.toLowerCase()) || p.SKU.toLowerCase().includes(searchTerm.toLowerCase())));

  // --- TEMPLATE STRUK CETAK ---
  const ShiftReportTemplate = ({ data }: { data: any }) => (
      <>
         <div className="text-center mb-3">
             {logoPreview && <img src={logoPreview} alt="Logo" className="h-10 mx-auto mb-1 object-contain"/>}
             <h2 className="font-bold text-sm uppercase">{receiptConfig.Store_Name || 'Metalurgi POS'}</h2>
             <div className="text-[9px] font-bold border border-black px-1 inline-block mt-1">OBJECTIVE SHIFT REPORT</div>
         </div>
         <div className="grid grid-cols-2 gap-y-1 mb-2 text-[9px]">
             <span>ID Sesi:</span><span className="text-right font-mono">{data.id}</span>
             <span>Tanggal:</span><span className="text-right">{new Date(data.startTime).toLocaleDateString()}</span>
             <span>Shift / Kasir:</span><span className="text-right">{data.shiftName} / {data.cashierName}</span>
         </div>
         
         <div className="border-t border-black border-dashed pt-1 mb-1 font-bold text-[9px] uppercase">A. Sales Performance</div>
         <div className="grid grid-cols-2 gap-y-1 mb-2 text-[9px]">
             <span>Total Item (Qty):</span><span className="text-right font-bold">{data.totalItemQty} Item</span>
             <span>Gross Sales:</span><span className="text-right">{fmtMoney(data.grossSales)}</span>
             <span>Discount:</span><span className="text-right">{fmtMoney(data.totalDiscount)}</span>
             <span>Tax:</span><span className="text-right">{fmtMoney(data.totalTax)}</span>
             <span className="font-bold border-t border-black border-dashed pt-0.5">Net Sales:</span>
             <span className="text-right font-bold border-t border-black border-dashed pt-0.5">{fmtMoney(data.netSales)}</span>
         </div>

         <div className="border-t border-black border-dashed pt-1 mb-1 font-bold text-[9px] uppercase">B. Payment Breakdown</div>
         <div className="grid grid-cols-2 gap-y-1 mb-2 text-[9px]">
             <span>Cash:</span><span className="text-right">{fmtMoney(data.paymentBreakdown?.Cash || 0)}</span>
             <span>QRIS:</span><span className="text-right">{fmtMoney(data.paymentBreakdown?.QRIS || 0)}</span>
             <span>Transfer Bank:</span><span className="text-right">{fmtMoney(data.paymentBreakdown?.Transfer || 0)}</span>
             <span>ShopeeFood:</span><span className="text-right">{fmtMoney(data.paymentBreakdown?.ShopeeFood || 0)}</span>
             <span>GrabFood:</span><span className="text-right">{fmtMoney(data.paymentBreakdown?.GrabFood || 0)}</span>
             <span>GoFood:</span><span className="text-right">{fmtMoney(data.paymentBreakdown?.GoFood || 0)}</span>
         </div>

         <div className="border-t border-black border-dashed pt-1 mb-1 font-bold text-[9px] uppercase">C. Cash Control (Fisik)</div>
         <div className="grid grid-cols-2 gap-y-1 mb-2 text-[9px]">
             <span>Start Cash:</span><span className="text-right">{fmtMoney(data.startCash)}</span>
             <span>(+) Cash In:</span><span className="text-right">{fmtMoney(data.cashIn)}</span>
             <span>(-) Cash Out:</span><span className="text-right">{fmtMoney(data.cashOut)}</span>
             <span className="font-bold border-t border-black border-dashed pt-0.5">Expected Cash:</span><span className="text-right font-bold border-t border-black border-dashed pt-0.5">{fmtMoney(data.expectedCashEnd)}</span>
             <span className="font-bold">Actual Cash:</span><span className="text-right font-bold">{fmtMoney(data.endCashActual)}</span>
             <span className="font-bold">Variance:</span><span className="text-right font-bold">{fmtMoney(data.variance)}</span>
         </div>

         <div className="mt-6 flex justify-between text-center pt-4 text-[9px]">
             <div className="w-1/3"><p className="mb-8">Dibuat Oleh,</p><p className="border-t border-black pt-1 font-bold">{data.cashierName}</p></div>
             <div className="w-1/3"><p className="mb-8">Diketahui Oleh,</p><p className="border-t border-black pt-1 font-bold">SPV</p></div>
         </div>
      </>
  );

  const ReceiptTemplate = ({ trx }: { trx: any }) => (
      <>
         <div className="text-center mb-4">{logoPreview ? (<img src={logoPreview} alt="Logo" className="h-10 mx-auto mb-2 object-contain"/>) : (<div className="mb-2 text-2xl">🏪</div>)}<h2 className="font-bold text-sm uppercase text-black">{receiptConfig.Store_Name || 'METALURGI POS'}</h2>{receiptConfig.Address && <div className="text-[10px] text-slate-600">{receiptConfig.Address}</div>}{receiptConfig.Phone && <div className="text-[10px] text-slate-600">{receiptConfig.Phone}</div>}<div className="mt-2 text-left border-t border-black border-dashed pt-2"><div className="flex justify-between"><span>Trx:</span> <span>{trx.id}</span></div><div className="flex justify-between"><span>Date:</span> <span>{trx.date.split('T')[0]} {trx.timestamp}</span></div><div className="flex justify-between"><span>Kasir:</span> <span>{trx.cashier}</span></div><div className="flex justify-between"><span>Shift:</span> <span>{trx.shift}</span></div><div className="flex justify-between"><span>Metode:</span> <span>{trx.paymentMethod}</span></div></div></div><div className="border-b border-black border-dashed mb-2"></div>{(trx.items||[]).map((item:any, i:number)=>(<div key={i} className="mb-1"><div>{item.name}</div><div className="flex justify-between"><span>{item.qty} x {fmtMoney(item.price)}</span><span>{fmtMoney(item.qty*item.price)}</span></div></div>))}<div className="border-b border-black border-dashed my-2"></div><div className="space-y-1"><div className="flex justify-between font-bold text-sm border-t border-black border-dashed pt-1"><span>TOTAL</span><span>{fmtMoney(trx.total)}</span></div><div className="flex justify-between mt-2"><span>Bayar</span><span>{fmtMoney(trx.amountPaid)}</span></div><div className="flex justify-between"><span>Kembali</span><span>{fmtMoney(trx.change)}</span></div></div><div className="text-center mt-4 text-[10px]"><p>{receiptConfig.Footer || 'Terima Kasih'}</p>{receiptConfig.Instagram && <p className="mt-1 font-bold">{receiptConfig.Instagram}</p>}</div>
      </>
  );

  const renderPaymentOptions = () => {
    const basicMethods = ['Cash', 'QRIS', 'Transfer'];
    const marketMethods = ['ShopeeFood', 'GrabFood', 'GoFood'];
    
    return (
        <div className="space-y-4">
            <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Direct Payment</p>
                <div className="grid grid-cols-3 gap-3">
                    {basicMethods.map(m => (
                        <button 
                            key={m} 
                            onClick={() => setPaymentMethod(m as any)} 
                            className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                                paymentMethod === m ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-sm' : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                            }`}
                        >
                            {m === 'Cash' ? <Banknote size={20}/> : m === 'QRIS' ? <QrCode size={20}/> : <CreditCard size={20}/>}
                            <span className="text-xs font-bold">{m}</span>
                        </button>
                    ))}
                </div>
            </div>
            
            <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Marketplace</p>
                <div className="grid grid-cols-3 gap-3">
                    {marketMethods.map(m => (
                        <button 
                            key={m} 
                            onClick={() => setPaymentMethod(m as any)} 
                            className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                                paymentMethod === m ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm' : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                            }`}
                        >
                            <Smartphone size={20}/>
                            <span className="text-[10px] font-bold whitespace-nowrap">{m}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] gap-4 pb-4">
      {/* TOP NAVIGATION */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm print:hidden flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-0">
         
         <div className="flex justify-between items-center w-full md:w-auto md:gap-4">
            <h1 className="text-lg md:text-xl font-bold text-slate-900 flex items-center gap-2">
               <Store className="text-blue-600"/> Metalurgi POS
            </h1>
            
            <div className="flex md:hidden items-center gap-2">
                {isShiftOpen && (<div className="flex items-center gap-1 text-[10px] font-medium text-slate-600 bg-slate-50 px-2 py-1 rounded-md border border-slate-200"><User size={10} className="text-blue-500"/> {shiftData.cashierName}</div>)}
                {isShiftOpen ? <button onClick={() => setShowCloseShiftModal(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-100 text-rose-700">Tutup</button> : <button onClick={() => setShowShiftModal(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700">Buka</button>}
            </div>
         </div>

         <div className="w-full md:w-auto overflow-x-auto custom-scrollbar pb-1 md:pb-0">
            <div className="flex bg-slate-100 p-1 rounded-lg w-max md:w-auto">
                <button onClick={() => setActiveView('cashier')} className={`px-4 py-1.5 rounded-md text-sm font-bold whitespace-nowrap transition-all ${activeView === 'cashier' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Mesin Kasir</button>
                <button onClick={() => setActiveView('transactions')} className={`px-4 py-1.5 rounded-md text-sm font-bold whitespace-nowrap transition-all ${activeView === 'transactions' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Riwayat Transaksi</button>
                <button onClick={() => setActiveView('shifts')} className={`px-4 py-1.5 rounded-md text-sm font-bold whitespace-nowrap transition-all ${activeView === 'shifts' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Riwayat Shift</button>
                <button onClick={() => setActiveView('analysis')} className={`px-4 py-1.5 rounded-md text-sm font-bold whitespace-nowrap transition-all ${activeView === 'analysis' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>POS Analysis</button>
            </div>
         </div>

         <div className="hidden md:flex items-center gap-3">
             {isShiftOpen && (<div className="flex items-center gap-4 text-xs font-medium text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200"><span className="flex items-center gap-1"><User size={14} className="text-blue-500"/> {shiftData.cashierName}</span><span className="w-px h-3 bg-slate-300"></span><span className="flex items-center gap-1"><Clock size={14} className="text-amber-500"/> {shiftData.shiftName}</span></div>)}
             {isShiftOpen ? <button onClick={() => setShowCloseShiftModal(true)} className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-100 text-rose-700 hover:bg-rose-200">Tutup Shift</button> : <button onClick={() => setShowShiftModal(true)} className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200">Buka Kasir</button>}
         </div>

      </div>

      {/* VIEW 1: CASHIER MACHINE */}
      {activeView === 'cashier' && (
        <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden print:hidden">
            <div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 space-y-3">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-2.5 text-slate-400" size={18}/>
                            <input type="text" placeholder="Cari Produk..." className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                        </div>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                        {categories.map(c => (
                            <button key={c} onClick={() => setActiveCategory(c as string)} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${activeCategory === c ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{c as string}</button>
                        ))}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 bg-slate-50">
                    {loading ? (
                        <div className="flex justify-center p-10"><Loader2 className="animate-spin text-slate-400"/></div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {filteredProducts.map((prod, i) => { 
                                const promo = getProductPromo(prod.SKU, parseInt(prod.Sell_Price_List)||0); 
                                const liveStock = getLiveStock(prod);
                                const isJasa = ['Jasa', 'Service'].includes(prod.Category);
                                return (
                                    <div key={i} onClick={() => addToCart(prod)} className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition-all flex flex-col justify-between h-full relative overflow-hidden group ${!isJasa && liveStock <= 0 ? 'opacity-60 grayscale' : ''}`}>
                                        {!isJasa && (<div className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold z-10 flex items-center gap-1 ${liveStock > 10 ? 'bg-emerald-100 text-emerald-700' : liveStock > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}><Box size={10}/> {liveStock > 0 ? `${liveStock} Stok` : 'Habis'}</div>)}
                                        <div>
                                            <div className="text-[10px] text-slate-400 mb-1 mt-6">{prod.Category}</div>
                                            <div className="font-bold text-slate-800 text-sm leading-tight mb-2 line-clamp-2">{prod.Product_Name}</div>
                                        </div>
                                        <div className="mt-auto">
                                            {promo.hasPromo ? (
                                                <div className="flex flex-col"><span className="text-[10px] text-slate-400 line-through">{fmtMoney(parseInt(prod.Sell_Price_List))}</span><span className="text-rose-600 font-bold">{fmtMoney(promo.finalPrice)}</span></div>
                                            ) : (
                                                <div className="text-blue-600 font-bold">{fmtMoney(parseInt(prod.Sell_Price_List))}</div>
                                            )}
                                        </div>
                                    </div>
                                ); 
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="w-full lg:w-[350px] h-[45%] lg:h-full flex-shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50">
                    <h2 className="font-bold text-slate-800 flex items-center gap-2"><ShoppingCart size={18}/> Keranjang</h2>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {cart.length === 0 ? (
                        <div className="text-center text-slate-400 mt-6 flex flex-col items-center">
                            <ShoppingCart size={40} className="mb-2 opacity-20"/>
                            <p className="text-sm">Keranjang Kosong</p>
                        </div>
                    ) : (
                        cart.map((item, i) => (
                            <div key={i} className="flex justify-between items-start border-b border-slate-100 pb-2">
                                <div className="flex-1">
                                    <div className="text-sm font-bold text-slate-800">{item.name}</div>
                                    <div className="text-xs text-blue-600">{fmtMoney(item.price)}</div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-1">
                                        <button onClick={() => updateQty(item.sku, -1)} className="p-1 text-slate-500 hover:text-rose-600 font-bold">-</button>
                                        <span className="text-xs font-bold w-4 text-center">{item.qty}</span>
                                        <button onClick={() => updateQty(item.sku, 1)} className="p-1 text-slate-500 hover:text-emerald-600 font-bold">+</button>
                                    </div>
                                    <button onClick={() => removeFromCart(item.sku)} className="text-slate-300 hover:text-rose-500"><Trash2 size={16}/></button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3">
                    <div className="flex justify-between text-lg font-bold text-slate-900">
                        <span>Total</span><span>{fmtMoney(cartTotal)}</span>
                    </div>
                    <button onClick={() => cartTotal > 0 && setShowPaymentModal(true)} disabled={cartTotal === 0} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-50 disabled:shadow-none transition-all">
                        Bayar Sekarang
                    </button>
                </div>
            </div>
        </div>
      )}
      
      {/* VIEW 2: TRANSACTIONS */}
      {activeView === 'transactions' && (
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col print:hidden">
            <div className="p-4 border-b border-slate-100 bg-white space-y-4">
                <div className="flex flex-wrap items-center gap-3 justify-between">
                    <div className="flex gap-3">
                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                            <Calendar size={14} className="text-slate-400"/>
                            <span className="text-xs font-bold text-slate-500">From</span>
                            <input type="date" className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer" value={dateRange.start || ''} onChange={e => setDateRange({...dateRange, start: e.target.value})}/>
                            <span className="text-xs font-bold text-slate-500">To</span>
                            <input type="date" className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer" value={dateRange.end || ''} onChange={e => setDateRange({...dateRange, end: e.target.value})}/>
                        </div>
                        <select className="text-xs p-2 rounded-lg border border-slate-200" value={shiftFilter} onChange={e => setShiftFilter(e.target.value)}>
                            <option value="all">Semua Shift</option>{masterShifts.map((s,i) => <option key={i} value={s.Shift_Name}>{s.Shift_Name}</option>)}
                        </select>
                    </div>

                    <div className="flex items-center bg-slate-100 p-1 rounded-lg">
                      <button onClick={() => setViewSource('local')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewSource === 'local' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}><Database size={14}/> Lokal (Tab)</button>
                      <button onClick={() => setViewSource('cloud')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewSource === 'cloud' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500'}`}><Laptop2 size={14}/> Cloud (Report)</button>
                    </div>
                </div>
                
                <div className="flex justify-between items-center gap-3">
                  <div className="flex-1 relative">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={14}/>
                        <input type="text" placeholder="Cari Transaksi..." className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200" value={historySearch} onChange={e => setHistorySearch(e.target.value)}/>
                  </div>
                  
                  {viewSource === 'local' && (
                    <>
                    <button onClick={handleResetTransactions} className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all bg-rose-100 text-rose-600 hover:bg-rose-200" title="Hapus Semua Data Lokal"><Trash2 size={16}/> Reset All</button>
                    <button onClick={handleSyncToCloud} disabled={isSyncing} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm ${isSyncing ? 'bg-slate-100 text-slate-400' : 'bg-emerald-500 hover:bg-emerald-600 text-white'}`}>{isSyncing ? <Loader2 size={14} className="animate-spin"/> : <CloudUpload size={14}/>} {isSyncing ? 'Uploading...' : 'Manual Sync'}</button>
                    </>
                  )}
                  {viewSource === 'cloud' && (
                     <div className="flex items-center gap-2">
                         <button onClick={runGLAudit} disabled={isAuditingGL} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${isAuditingGL ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 shadow-sm'}`}>
                             {isAuditingGL ? <Loader2 size={14} className="animate-spin"/> : <ShieldAlert size={14} className={auditDone && unsyncedGLIds.length > 0 ? "text-rose-500" : "text-blue-500"}/>} 
                             {isAuditingGL ? 'Checking GL...' : 'Audit GL Sync'}
                         </button>
                         <button onClick={fetchCloudData} disabled={isLoadingCloud} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 border border-slate-200 shadow-sm"><RefreshCw size={16} className={isLoadingCloud ? "animate-spin" : ""}/></button>
                     </div>
                  )}
                </div>
            </div>
            
            <div className="flex-1 overflow-auto p-0 flex flex-col justify-between">
                {isLoadingCloud ? (
                   <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2"><Loader2 size={32} className="animate-spin"/><p className="text-sm">Mengambil data dari Cloud...</p></div>
                ) : (
                <>
                <table className="w-full text-sm text-left">
                    <thead className="bg-white text-slate-500 text-xs uppercase border-b border-slate-100 font-bold sticky top-0 z-10">
                        <tr><th className="p-4">No. Transaksi</th><th className="p-4">Waktu</th><th className="p-4">Produk</th><th className="p-4 text-center">Qty</th><th className="p-4 text-right">Total (Rp)</th><th className="p-4 text-center">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {paginatedHistory.map((trx, idx) => {
                            const isGLMissing = auditDone && unsyncedGLIds.includes(trx.id);
                            return (
                            <tr key={idx} className={`hover:bg-blue-50/50 ${isGLMissing ? 'bg-rose-50/30' : ''}`}>
                                <td className="p-4 font-mono font-bold text-xs text-slate-600 align-top">
                                  {trx.id} 
                                  {trx.isCloud && <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-[9px]">CLOUD</span>}
                                  
                                  {auditDone && viewSource === 'cloud' && (
                                      isGLMissing 
                                      ? <span className="ml-2 px-1.5 py-0.5 bg-rose-100 text-rose-700 border border-rose-200 rounded text-[9px] font-bold flex items-center w-fit mt-1 gap-1"><ShieldAlert size={10}/> GL Missing</span>
                                      : <span className="ml-2 px-1.5 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded text-[9px] font-bold flex items-center w-fit mt-1 gap-1"><CheckCircle size={10}/> GL Synced</span>
                                  )}

                                  <div className="mt-1 text-[10px] font-normal text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded w-fit">{getTrxMethod(trx)}</div>
                                </td>
                                <td className="p-4 text-slate-500 text-xs align-top">
                                    <div>{new Date(getTrxDate(trx)).toLocaleDateString()}</div>
                                    <div>{new Date(getTrxDate(trx)).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                </td>
                                <td className="p-4 align-top"><div className="flex flex-col gap-1">{(getTrxItems(trx)).map((it:any, i:number) => (<span key={i} className="text-xs text-slate-700">• {it.name} <span className="text-slate-400">x{it.qty}</span></span>))}</div></td>
                                <td className="p-4 text-center font-bold align-top">{(getTrxItems(trx)).reduce((a:any,b:any)=>a+(Number(b.qty)||0),0)}</td>
                                <td className="p-4 text-right font-bold text-slate-900 align-top">{fmtMoney(getTrxTotal(trx))}</td>
                                <td className="p-4 text-center align-top flex gap-2 justify-center">
                                    <button onClick={() => { setCurrentTrx(trx); setPrintType('receipt'); setShowReceiptPreview(true); }} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-800" title="Preview & Print"><Printer size={16}/></button>
                                    {viewSource === 'local' && (
                                        <button onClick={() => handleDeleteTransaction(trx.id)} className="p-2 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 text-rose-500 hover:text-rose-700" title="Hapus Transaksi Ini"><Trash2 size={16}/></button>
                                    )}
                                </td>
                            </tr>
                        )})}
                    </tbody>
                </table>
                {totalPages > 1 && (
                    <div className="p-4 border-t border-slate-100 flex justify-between items-center bg-slate-50">
                        <span className="text-xs text-slate-500">Page <b>{currentPage}</b> of <b>{totalPages}</b> ({filteredHistory.length} Total)</span>
                        <div className="flex gap-2">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 bg-white border rounded hover:bg-slate-100 disabled:opacity-50"><ChevronLeft size={16}/></button>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 bg-white border rounded hover:bg-slate-100 disabled:opacity-50"><ChevronRight size={16}/></button>
                        </div>
                    </div>
                )}
                </>
                )}
            </div>
        </div>
      )}

      {/* VIEW 3: SHIFTS */}
      {activeView === 'shifts' && (<div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col print:hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><ClipboardList size={18}/> Riwayat Shift Kasir</h3>
            <div className="flex gap-2">
                <button onClick={handleSyncShifts} disabled={isSyncing} className="px-3 py-1.5 bg-white border border-blue-300 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-50 flex items-center gap-2 transition-all">
                    {isSyncing ? <Loader2 size={14} className="animate-spin"/> : <UploadCloud size={14}/>} Sync Shift
                </button>
                <button onClick={handleResetShifts} className="px-3 py-1.5 bg-white border border-slate-300 text-slate-600 rounded-lg text-xs font-bold hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 flex items-center gap-2 transition-all">
                    <Eraser size={14}/> Reset History
                </button>
            </div>
        </div>
        <div className="flex-1 overflow-auto p-0"><table className="w-full text-sm text-left"><thead className="bg-white text-slate-500 text-xs uppercase border-b border-slate-100 font-bold sticky top-0 z-10"><tr><th className="p-4">Tanggal</th><th className="p-4">Shift</th><th className="p-4 text-right">Gross Sales</th><th className="p-4 text-right">Fisik Akhir</th><th className="p-4 text-right">Selisih</th><th className="p-4 text-center">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{shiftHistory.map((s, i) => (<tr key={i} className="hover:bg-blue-50"><td className="p-4 font-mono text-xs">{new Date(s.startTime).toLocaleDateString()}</td><td className="p-4 font-bold text-slate-700">{s.shiftName} / {s.cashierName}</td><td className="p-4 text-right font-bold text-blue-600">{fmtMoney(s.grossSales || s.totalSales)}</td><td className="p-4 text-right font-bold">{fmtMoney(s.endCashActual)}</td><td className={`p-4 text-right font-bold ${s.variance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtMoney(s.variance)}</td><td className="p-4 text-center"><button onClick={() => { setShiftReportData(s); setPrintType('shift_report'); setShowReceiptPreview(true); }} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-blue-600"><Printer size={16}/></button></td></tr>))}</tbody></table></div></div>)}

      {/* --- VIEW 4: POS ANALYSIS --- */}
      {activeView === 'analysis' && (
        <div className="flex-1 overflow-hidden flex flex-col print:hidden space-y-4">
            
            {/* Filter Bar dengan Tombol Quick Filter */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div>
                    <h2 className="font-bold text-slate-800 flex items-center gap-2"><BarChart3 className="text-blue-600"/> POS Analysis (Daily)</h2>
                    <p className="text-xs text-slate-500 mt-1 mb-3">Data filter: {dateRange.start} s/d {dateRange.end} | Sumber Data: {viewSource === 'cloud' ? 'Google Sheets (Cloud)' : 'Device Memory (Local)'}</p>
                    
                    {/* Tombol Quick Filter bisa digeser di HP */}
                    <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar w-full max-w-[90vw] md:w-max">
                        {['Hari ini', 'Kemarin', 'Minggu ini', 'Bulan ini', 'Bulan lalu'].map((label, i) => {
                            const keys = ['today', 'yesterday', 'thisWeek', 'thisMonth', 'lastMonth'];
                            return (
                                <button key={i} onClick={() => handleQuickFilter(keys[i])} className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors border border-blue-100 shadow-sm">
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                </div>
                
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <div className="flex items-center bg-slate-100 p-1 rounded-lg">
                      <button onClick={() => setViewSource('local')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewSource === 'local' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}><Database size={14}/> Lokal</button>
                      <button onClick={() => setViewSource('cloud')} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewSource === 'cloud' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500'}`}><Laptop2 size={14}/> Cloud</button>
                    </div>

                    {/* KOMBO SELECT BULAN & TAHUN NATIVE */}
                    {(() => {
                        const [startYear, startMonth] = (dateRange.start || new Date().toISOString().split('T')[0]).split('-');
                        const yearNum = parseInt(startYear) || new Date().getFullYear();
                        
                        return (
                            <div className="flex items-center gap-1 bg-blue-50 px-2 py-1.5 rounded-lg border border-blue-200 shadow-sm mt-2 md:mt-0">
                                <Calendar size={14} className="text-blue-500 ml-1"/>
                                <span className="text-[10px] font-bold text-blue-700 uppercase hidden sm:block ml-1">Bulan:</span>
                                
                                <select 
                                    className="text-xs font-bold text-blue-800 bg-transparent outline-none cursor-pointer px-1"
                                    value={startMonth}
                                    onChange={(e) => {
                                        const m = e.target.value;
                                        const start = new Date(yearNum, parseInt(m) - 1, 1);
                                        const end = new Date(yearNum, parseInt(m), 0);
                                        const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                                        setDateRange({ start: fmt(start), end: fmt(end) });
                                    }}
                                >
                                    <option value="01">Jan</option><option value="02">Feb</option><option value="03">Mar</option>
                                    <option value="04">Apr</option><option value="05">Mei</option><option value="06">Jun</option>
                                    <option value="07">Jul</option><option value="08">Agu</option><option value="09">Sep</option>
                                    <option value="10">Okt</option><option value="11">Nov</option><option value="12">Des</option>
                                </select>

                                <select 
                                    className="text-xs font-bold text-blue-800 bg-transparent outline-none cursor-pointer pr-1"
                                    value={startYear}
                                    onChange={(e) => {
                                        const y = e.target.value;
                                        const start = new Date(parseInt(y), parseInt(startMonth) - 1, 1);
                                        const end = new Date(parseInt(y), parseInt(startMonth), 0);
                                        const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                                        setDateRange({ start: fmt(start), end: fmt(end) });
                                    }}
                                >
                                    {[yearNum + 1, yearNum, yearNum - 1, yearNum - 2, yearNum - 3].map(y => (
                                        <option key={y} value={y}>{y}</option>
                                    ))}
                                </select>
                            </div>
                        )
                    })()}

                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 mt-2 md:mt-0">
                        <span className="text-[10px] font-bold text-slate-400 uppercase hidden md:block">Kustom:</span>
                        <input type="date" className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer w-auto" value={dateRange.start || ''} onChange={e => setDateRange({...dateRange, start: e.target.value})}/>
                        <span className="text-xs font-bold text-slate-400">-</span>
                        <input type="date" className="text-xs font-bold text-slate-700 bg-transparent outline-none cursor-pointer w-auto" value={dateRange.end || ''} onChange={e => setDateRange({...dateRange, end: e.target.value})}/>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col md:flex-row gap-4 pb-4">
                {/* --- UI TERBARU: REKONSILIASI & MARKETPLACE --- */}
                <div className="w-full md:w-[45%] flex flex-col gap-4">
                    
                    {/* RECONCILIATION TABLE (UNIT & CLOUD ONLY) */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                        <h3 className="text-sm font-bold text-slate-800 mb-4 uppercase flex items-center gap-2"><PieChart size={16}/> Payment Reconciliation</h3>
                        <div className="flex-1 overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-500 border-b border-slate-100">
                                    <tr>
                                        <th className="p-2">Metode</th>
                                        <th className="p-2 text-center">Unit / Pcs</th>
                                        <th className="p-2 text-right">Nominal (Cloud)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {analysisData.reconcileStats.map((stat, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="p-2 font-bold text-slate-700">{stat.method}</td>
                                            <td className="p-2 text-center font-bold text-slate-600">{stat.qty}</td>
                                            <td className="p-2 text-right font-mono text-blue-600">{fmtMoney(stat.cloud)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-slate-200">
                                        <th className="p-2 font-bold text-slate-800">TOTAL</th>
                                        <th className="p-2 text-center font-bold text-slate-800">{analysisData.totalCloudQty}</th>
                                        <th className="p-2 text-right font-bold text-blue-700">{fmtMoney(analysisData.totalCloud)}</th>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>

                    {/* MARKETPLACE PENCAIRAN CARD (GROSS, COMMISSION, NET) */}
                    <div className="bg-slate-900 text-white p-5 rounded-xl shadow-md border border-slate-800 flex flex-col">
                        <h3 className="text-sm font-bold text-slate-300 mb-4 uppercase flex items-center gap-2"><Smartphone size={16}/> Pencairan Marketplace</h3>
                        <div className="space-y-4 flex-1 text-sm">
                            {['Shopee', 'Grab', 'GoFood'].map((mp) => {
                                const data = analysisData.estCommission[mp as keyof typeof analysisData.estCommission] as any;
                                if (data.Gross === 0) return null;
                                
                                return (
                                    <div key={mp} className="border-b border-slate-700/50 pb-3">
                                        <div className="font-bold text-blue-400 mb-1">{mp === 'Shopee' ? 'ShopeeFood' : mp === 'Grab' ? 'GrabFood' : 'GoFood'}</div>
                                        <div className="flex justify-between text-slate-400 text-xs mb-0.5"><span>Gross AR:</span><span className="font-mono">{fmtMoney(data.Gross)}</span></div>
                                        <div className="flex justify-between text-rose-400 text-xs mb-0.5"><span>(-) Commission:</span><span className="font-mono">{fmtMoney(data.Commission)}</span></div>
                                        <div className="flex justify-between text-emerald-400 text-xs font-bold mt-1 pt-1 border-t border-slate-700/50"><span>Net Receivable:</span><span className="font-mono">{fmtMoney(data.Net)}</span></div>
                                    </div>
                                );
                            })}
                            
                            {analysisData.estCommission.TotalGross === 0 && (
                                <div className="text-center text-slate-500 py-4 italic text-xs">Belum ada transaksi marketplace</div>
                            )}
                        </div>
                        
                        {analysisData.estCommission.TotalGross > 0 && (
                            <div className="pt-4 border-t-2 border-slate-600 mt-4 space-y-1.5">
                                <div className="flex justify-between text-slate-300 text-xs font-bold"><span>Total Gross AR:</span><span className="font-mono">{fmtMoney(analysisData.estCommission.TotalGross)}</span></div>
                                <div className="flex justify-between text-rose-400 text-xs font-bold"><span>Total Commission:</span><span className="font-mono">-{fmtMoney(analysisData.estCommission.TotalCommission)}</span></div>
                                <div className="flex justify-between items-center font-bold text-emerald-400 mt-2 text-base border-t border-slate-700 pt-2">
                                    <span>Total Net Recv:</span>
                                    <span>{fmtMoney(analysisData.TotalNet)}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Kolom Kanan: SKU Breakdown */}
                <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-h-[500px] md:min-h-0">
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2"><Box size={16}/> Daily SKU Performance</h3>
                    </div>
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-sm text-left relative">
                            <thead className="bg-white text-slate-500 text-xs uppercase border-b border-slate-100 font-bold sticky top-0 z-10">
                                <tr><th className="p-4">Rank</th><th className="p-4">Nama Produk</th><th className="p-4 text-center">Qty</th><th className="p-4 text-right">Total Nominal</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 pb-10">
                                {analysisData.rankedSKU.length === 0 ? (
                                    <tr><td colSpan={4} className="p-8 text-center text-slate-400">Belum ada penjualan.</td></tr>
                                ) : (
                                    analysisData.rankedSKU.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-blue-50/50">
                                            <td className="p-4 text-slate-400 font-mono text-xs">#{idx + 1}</td>
                                            <td className="p-4 font-bold text-slate-700">{item.name}</td>
                                            <td className="p-4 text-center"><span className="bg-slate-100 px-2 py-1 rounded-md font-bold">{item.qty}</span></td>
                                            <td className="p-4 text-right font-bold text-emerald-600">{fmtMoney(item.total)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            <tfoot className="bg-blue-50 border-t-2 border-blue-200 sticky bottom-0 z-10">
                                <tr>
                                    <th colSpan={2} className="p-4 text-right font-bold text-blue-900 uppercase">TOTAL KESELURUHAN</th>
                                    <th className="p-4 text-center font-bold text-blue-900 text-lg">{analysisData.grandTotalQty}</th>
                                    <th className="p-4 text-right font-bold text-blue-700 text-lg">{fmtMoney(analysisData.grandTotalAmount)}</th>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* MODALS & POPUPS */}
      {showShiftModal && (<div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden"><div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center animate-in zoom-in-95"><div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4"><Store size={32}/></div><h3 className="font-bold text-xl text-slate-900 mb-2">Buka Shift Kasir</h3><div className="space-y-3 text-left"><div><label className="text-xs font-bold text-slate-500">Pilih Kasir</label><select className="w-full p-2 border rounded-lg mt-1 bg-white" onChange={e => setSelectedCashier(e.target.value)}><option value="">-- Pilih --</option>{masterCashiers.map((c, i) => <option key={i} value={c.Name}>{c.Name}</option>)}</select></div><div><label className="text-xs font-bold text-slate-500">Pilih Shift</label><select className="w-full p-2 border rounded-lg mt-1 bg-white" onChange={e => setSelectedShift(e.target.value)}><option value="">-- Pilih --</option>{masterShifts.map((s, i) => <option key={i} value={s.Shift_Name}>{s.Shift_Name} ({s.Start_Time || '00:00'}-{s.End_Time || '23:59'})</option>)}</select></div><div><label className="text-xs font-bold text-slate-500">Saldo Awal (Modal)</label><input type="number" className="w-full p-2 border rounded-lg mt-1" placeholder="Rp" value={startCashInput === 0 ? '' : startCashInput} onChange={e => setStartCashInput(parseInt(e.target.value)||0)}/></div><button onClick={handleOpenShift} className="w-full py-3 mt-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700">Buka Toko</button></div></div></div>)}
      
      {/* MODAL TUTUP SHIFT */}
      {showCloseShiftModal && (<div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
        <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 max-h-[95vh] flex flex-col">
            <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><LogOut className="text-rose-600"/> Objective Shift Closing</h3>
                <button onClick={() => setShowCloseShiftModal(false)}><X className="text-slate-400"/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 flex flex-col lg:flex-row gap-6">
                <div className="flex-1 flex flex-col gap-4">
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                        <h4 className="text-xs font-bold text-blue-800 mb-2 uppercase border-b border-blue-200 pb-1">A. Sales Performance</h4>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="flex justify-between"><span>Gross Sales</span><span className="font-mono">{fmtMoney(allTransactions.filter(t => t.shiftId === shiftData.id).reduce((acc, t) => acc + t.total, 0))}</span></div>
                            <div className="flex justify-between"><span>Discount</span><span className="font-mono text-rose-600">Rp 0</span></div>
                            <div className="flex justify-between"><span>Tax</span><span className="font-mono">Rp 0</span></div>
                            <div className="flex justify-between font-bold text-blue-900 border-t border-blue-200 pt-1"><span>Net Sales</span><span className="font-mono text-lg">{fmtMoney(allTransactions.filter(t => t.shiftId === shiftData.id).reduce((acc, t) => acc + t.total, 0))}</span></div>
                        </div>
                    </div>

                    <div className="flex-1 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden min-h-[200px]">
                        <h4 className="text-xs font-bold text-slate-500 uppercase bg-slate-50 p-3 border-b border-slate-200">Itemized Sales (Cek Fisik)</h4>
                        <div className="flex-1 overflow-y-auto p-0">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-white text-slate-400 sticky top-0 border-b border-slate-100">
                                    <tr><th className="p-2 pl-3 font-normal">Nama Item</th><th className="p-2 text-center font-normal">Qty</th><th className="p-2 pr-3 text-right font-normal">Nominal</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {(() => {
                                        const shiftItemsMap: Record<string, {name: string, qty: number, total: number}> = {};
                                        allTransactions.filter(t => t.shiftId === shiftData.id).forEach(t => {
                                            (t.items || []).forEach((item:any) => {
                                                if (!shiftItemsMap[item.sku]) shiftItemsMap[item.sku] = { name: item.name, qty: 0, total: 0 };
                                                shiftItemsMap[item.sku].qty += item.qty;
                                                shiftItemsMap[item.sku].total += (item.qty * item.price);
                                            });
                                        });
                                        const mappedItems = Object.values(shiftItemsMap).sort((a,b)=>b.total - a.total);
                                        
                                        if (mappedItems.length === 0) return <tr><td colSpan={3} className="p-4 text-center text-slate-400">Kosong</td></tr>;
                                        
                                        return mappedItems.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="p-2 pl-3 font-medium text-slate-700">{item.name}</td>
                                                <td className="p-2 text-center font-bold">{item.qty}</td>
                                                <td className="p-2 pr-3 text-right text-emerald-600">{fmtMoney(item.total)}</td>
                                            </tr>
                                        ));
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="flex-1 flex flex-col gap-6">
                    <div>
                        <h4 className="text-xs font-bold text-slate-500 mb-2 uppercase border-b pb-1">B. Payment Breakdown</h4>
                        <div className="space-y-1 text-sm bg-slate-50 p-4 rounded-xl border border-slate-100">
                            {['Cash', 'QRIS', 'Transfer', 'ShopeeFood', 'GrabFood', 'GoFood'].map(method => (
                                <div key={method} className="flex justify-between items-center">
                                    <span className="text-slate-600">{method}</span>
                                    <span className="font-mono font-bold">{fmtMoney(allTransactions.filter(t => t.shiftId === shiftData.id && t.paymentMethod === method).reduce((acc, t) => acc + t.total, 0))}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-bold text-amber-600 mb-2 uppercase border-b border-amber-200 pb-1">C. Cash Control (Fisik)</h4>
                        <div className="space-y-3 bg-amber-50/50 p-4 rounded-xl border border-amber-100">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-600">Start Cash (Modal)</span>
                                <span className="font-mono font-bold">{fmtMoney(shiftData.startCash)}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase">Cash Out / Keluar</label>
                                    <input type="number" className="w-full p-2 border border-slate-300 rounded-lg text-sm mt-1 text-rose-600 font-bold bg-white" placeholder="0" value={cashOutInput === 0 ? '' : cashOutInput} onChange={e => setCashOutInput(parseInt(e.target.value)||0)}/>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-emerald-600 uppercase">Actual Cash (Laci)</label>
                                    <input type="number" className="w-full p-2 border-2 border-emerald-300 bg-white rounded-lg text-sm mt-1 text-emerald-700 font-bold shadow-sm focus:ring-2 ring-emerald-200 outline-none" placeholder="Hitung Fisik" value={endCashInput === 0 ? '' : endCashInput} onChange={e => setEndCashInput(parseInt(e.target.value)||0)}/>
                                </div>
                            </div>
                            
                            <div className={`p-3 rounded-lg text-sm flex justify-between items-center shadow-inner ${
                                endCashInput - (shiftData.startCash + allTransactions.filter(t => t.shiftId === shiftData.id && t.paymentMethod === 'Cash').reduce((acc, t) => acc + t.total, 0) - cashOutInput) === 0 
                                ? 'bg-emerald-500 text-white font-bold' 
                                : 'bg-rose-500 text-white font-bold'
                            }`}>
                                <span className="uppercase text-xs tracking-wider">Variance (Selisih)</span>
                                <span className="text-lg">{fmtMoney(endCashInput - (shiftData.startCash + allTransactions.filter(t => t.shiftId === shiftData.id && t.paymentMethod === 'Cash').reduce((acc, t) => acc + t.total, 0) - cashOutInput))}</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-600 uppercase">Catatan Closing</label>
                        <textarea className="w-full p-2 border border-slate-300 rounded-lg text-sm mt-1 bg-slate-50" rows={2} placeholder="Tulis alasan jika ada selisih kas..." onChange={e => setClosingNote(e.target.value)}></textarea>
                    </div>
                </div>
            </div>

            <div className="p-5 border-t bg-slate-50 flex gap-3 mt-auto">
                <button onClick={() => setShowCloseShiftModal(false)} className="flex-1 py-3 bg-white border border-slate-300 font-bold text-slate-600 rounded-xl hover:bg-slate-50">Batal</button>
                <button onClick={handleCloseShift} className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 shadow-lg shadow-rose-200">Tutup & Cetak Laporan</button>
            </div>
        </div>
      </div>)}
      
      {showPaymentModal && (
          <div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden">
              <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-5 border-b flex justify-between items-center">
                      <h3 className="font-bold text-lg text-slate-800">Pilih Metode Pembayaran</h3>
                      <button onClick={() => setShowPaymentModal(false)}><X className="text-slate-400"/></button>
                  </div>
                  <div className="p-6 space-y-6">
                      <div className="text-center">
                          <p className="text-sm text-slate-500 mb-1">Total Tagihan</p>
                          <h2 className="text-3xl font-bold text-slate-900">{fmtMoney(cartTotal)}</h2>
                      </div>
                      
                      {renderPaymentOptions()}

                      {paymentMethod === 'Cash' && (
                          <div>
                              <label className="block text-xs font-bold text-slate-500 mb-1">Uang Diterima</label>
                              <input type="number" autoFocus className="w-full p-3 border border-slate-300 rounded-xl text-lg font-bold" value={amountPaid === 0 ? '' : amountPaid} onChange={e => setAmountPaid(parseInt(e.target.value) || 0)} placeholder="0"/>
                              <div className="flex gap-2 mt-2">
                                  {[cartTotal, 50000, 100000].map(amt => (
                                      <button key={amt} onClick={() => setAmountPaid(amt)} className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200">
                                          {fmtMoney(amt)}
                                      </button>
                                  ))}
                              </div>
                          </div>
                      )}
                      
                      <div className="bg-slate-50 p-4 rounded-xl flex justify-between items-center">
                          <span className="text-sm font-bold text-slate-600">Kembalian</span>
                          <span className={`text-xl font-bold ${changeDue < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {changeDue < 0 ? '-' : fmtMoney(changeDue)}
                          </span>
                      </div>
                  </div>
                  <div className="p-5 border-t">
                      <button onClick={handleProcessPayment} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200">
                          Selesaikan Transaksi
                      </button>
                  </div>
              </div>
          </div>
      )}
      
      {showSuccessModal && (<div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden"><div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl text-center p-8 animate-in zoom-in-95"><div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle2 size={32}/></div><h3 className="font-bold text-xl text-slate-900 mb-2">Transaksi Berhasil!</h3><p className="text-sm text-slate-500 mb-6">Total Transaksi: <span className="font-bold text-slate-800">{fmtMoney(currentTrx?.total || 0)}</span></p><div className="space-y-3"><button onClick={() => setShowSuccessModal(false)} className="w-full py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200">Simpan Transaksi Saja</button><button onClick={handlePrintReceipt} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center justify-center gap-2"><Printer size={18}/> Preview & Cetak Nota</button></div></div></div>)}
      
      {showReceiptPreview && (<div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden"><div className="bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"><div className="p-4 border-b flex justify-between items-center bg-slate-50"><h3 className="font-bold text-slate-800">Preview Cetakan</h3><button onClick={() => setShowReceiptPreview(false)}><X className="text-slate-400"/></button></div><div className="p-8 bg-slate-200 overflow-y-auto flex justify-center"><div className="bg-white p-4 w-[300px] shadow-sm text-[10px] font-mono leading-tight">{printType === 'receipt' && currentTrx && <ReceiptTemplate trx={currentTrx}/>}{printType === 'shift_report' && shiftReportData && <ShiftReportTemplate data={shiftReportData}/>}</div></div><div className="p-4 border-t bg-white flex justify-end gap-2"><button onClick={() => setShowReceiptPreview(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-50 rounded-lg">Batal</button><button onClick={() => window.print()} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center gap-2"><Printer size={16}/><FileDown size={16}/> Cetak / Simpan PDF</button></div></div></div>)}
      
      {/* --- PRINT AREA --- */}
      <div className="hidden print:block print:w-full">
        <style jsx global>{`
          @media print {
            @page { margin: 0; size: auto; }
            body { margin: 0; padding: 0; }
            body > *:not(.print\\:block) { display: none; }
          }
        `}</style>
        <div className="w-[58mm] bg-white text-black p-1 text-[10px] font-mono leading-tight mx-auto">
            {printType === 'receipt' && currentTrx && <ReceiptTemplate trx={currentTrx}/>}
            {printType === 'shift_report' && shiftReportData && <ShiftReportTemplate data={shiftReportData}/>}
        </div>
      </div>
    </div>
  );
}