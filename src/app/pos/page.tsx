'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Search, ShoppingCart, Trash2, CreditCard, Banknote, QrCode, 
  Store, LogOut, Printer, X, Loader2,
  User, Clock, Calendar, CheckCircle2,
  FileDown, ClipboardList, Box, CloudUpload, RefreshCw, Database, Laptop2, Eraser
} from 'lucide-react';

import { useFetch } from '@/hooks/useFetch'; 

export default function PosPage() {
  // --- STATE CORE ---
  const [activeView, setActiveView] = useState<'cashier' | 'transactions' | 'shifts'>('cashier');
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  
  // --- STATE USER & SYNC ---
  const [ownerEmail, setOwnerEmail] = useState<string>(''); 
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // --- STATE CLOUD DASHBOARD ---
  const [viewSource, setViewSource] = useState<'local' | 'cloud'>('local');
  const [cloudTransactions, setCloudTransactions] = useState<any[]>([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);

  // --- STATE MASTERS ---
  const [masterCashiers, setMasterCashiers] = useState<any[]>([]);
  const [masterShifts, setMasterShifts] = useState<any[]>([]);
  const [receiptConfig, setReceiptConfig] = useState<any>({});
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
  
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'QRIS' | 'Transfer'>('Cash');
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

  // --- STATE MISC ---
  const [printType, setPrintType] = useState<'receipt' | 'shift_report' | null>(null);
  const [shiftReportData, setShiftReportData] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  // --- DATA FETCHING ---
  const { data: apiData, loading } = useFetch<any>('/api/pos');

  // --- DATA PARSER ---
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

  // --- LOAD & PROCESS DATA ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
        const savedLogo = localStorage.getItem('METALURGI_SHOP_LOGO');
        if (savedLogo) setLogoPreview(savedLogo);

        // --- LOAD OWNER EMAIL ---
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

        setProducts(rawProducts);
        
        if (users.length > 0) setMasterCashiers(users);
        else setMasterCashiers([{Name: 'Kasir 1'}, {Name: 'Kasir 2'}, {Name: 'Admin'}]); 

        if (shifts.length > 0) setMasterShifts(shifts);
        else setMasterShifts([{Shift_Name: 'Pagi', Start_Time: '08:00', End_Time: '16:00'}, {Shift_Name: 'Sore', Start_Time: '16:00', End_Time: '22:00'}]);

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
        console.error("POS Data Error", err);
    }
  }, [apiData]);

  // --- HELPER & LOGIC ---
  const fmtMoney = (n: number) => "Rp " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  
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

  // --- FETCH CLOUD DATA ---
  const fetchCloudData = async () => {
    if (!ownerEmail) return alert("Sesi Owner tidak terdeteksi. Silakan Login ulang di halaman utama.");
    
    setIsLoadingCloud(true);
    try {
      const res = await fetch(`/api/pos/report?email=${ownerEmail}`);
      const json = await res.json();
      if (json.success) {
        setCloudTransactions(json.data);
      } else {
        console.error(json.error);
        alert("Gagal mengambil data Cloud: " + json.error);
      }
    } catch (err) {
      console.error(err);
      alert("Koneksi gagal.");
    } finally {
      setIsLoadingCloud(false);
    }
  };

  useEffect(() => {
    if (viewSource === 'cloud' && activeView === 'transactions') {
      fetchCloudData();
    }
  }, [viewSource, activeView]);

  const filteredHistory = useMemo(() => {
      const sourceData = viewSource === 'local' ? allTransactions : cloudTransactions;
      let data = [...sourceData];
      
      const start = new Date(dateRange.start); 
      const end = new Date(dateRange.end); 
      end.setHours(23, 59, 59, 999);

      data = data.filter(t => { 
          const tDate = new Date(t.date); 
          return tDate >= start && tDate <= end; 
      });

      if (shiftFilter !== 'all') data = data.filter(t => t.shift === shiftFilter);
      
      if (historySearch) { 
          const lower = historySearch.toLowerCase(); 
          data = data.filter(t => t.id.toLowerCase().includes(lower) || t.items.some((i:any) => i.name.toLowerCase().includes(lower)));
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

  // --- AUTO SYNC ---
  const runAutoSync = async (transaction: any) => {
    if (!ownerEmail) return; 
    
    setIsSyncing(true);
    try {
       await fetch('/api/pos/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
              email: ownerEmail, 
              transactions: [transaction] 
          })
       });
    } catch (err) {
       console.error("Auto-sync failed (Background):", err);
    } finally {
       setIsSyncing(false);
    }
  };

  // --- [NEW FEATURE] RESET DATA LOKAL ---
  const handleResetTransactions = () => {
      if (viewSource !== 'local') return alert("Hanya bisa menghapus data lokal (tab). Data cloud aman.");
      if (allTransactions.length === 0) return alert("Data transaksi lokal sudah kosong.");

      const isSure = confirm("⚠️ PERINGATAN PENTING:\n\nAnda akan menghapus SEMUA riwayat transaksi yang tersimpan di Tablet ini.\n\nPastikan Anda SUDAH melakukan SYNC ke Cloud agar data penjualan tidak hilang.\n\nApakah Anda yakin ingin melanjutkan?");
      
      if (isSure) {
          setAllTransactions([]);
          localStorage.removeItem('METALURGI_POS_TRX');
          // Reset juga inventory movement lokal jika mau benar-benar bersih
          // localStorage.removeItem('METALURGI_INVENTORY_MOVEMENTS'); 
          alert("✅ Riwayat transaksi lokal berhasil dibersihkan.");
      }
  };

  const handleResetShifts = () => {
      if (shiftHistory.length === 0) return alert("Riwayat shift sudah kosong.");
      
      if(confirm("⚠️ Hapus semua riwayat Shift di perangkat ini?")) {
          setShiftHistory([]);
          localStorage.removeItem('METALURGI_POS_SHIFT_HISTORY');
          alert("✅ Riwayat shift berhasil dibersihkan.");
      }
  };

  // --- ACTION HANDLERS ---
  const addToCart = (product: any) => {
     if (!isShiftOpen) { alert("Buka Shift Kasir terlebih dahulu!"); return setShowShiftModal(true); }
     const currentStock = getLiveStock(product);
     if (currentStock <= 0) { alert(`Stok "${product.Product_Name}" Habis!`); return; }

     const basePrice = parseInt(product.Sell_Price_List) || 0;
     setCart(prev => {
        const existing = prev.find(item => item.sku === product.SKU);
        let newQty = 1;
        if (existing) { newQty = existing.qty + 1; }
        return existing ? prev.map(item => item.sku === product.SKU ? { ...item, qty: newQty } : item) : 
        [...prev, { sku: product.SKU, name: product.Product_Name, price: basePrice, originalPrice: basePrice, qty: 1, discount: 0, isPromo: false }];
     });
  };

  const updateQty = (sku: string, delta: number) => {
     const product = products.find(p => p.SKU === sku);
     if (!product) return;
     if (delta > 0) {
         const currentStock = getLiveStock(product);
         if (currentStock <= 0) { alert("Stok tidak mencukupi!"); return; }
     }
     setCart(prev => prev.map(item => item.sku === sku ? { ...item, qty: Math.max(1, item.qty + delta) } : item));
  };

  const removeFromCart = (sku: string) => setCart(prev => prev.filter(i => i.sku !== sku));
  const cartTotal = useMemo(() => cart.reduce((acc, item) => acc + (item.price * item.qty), 0), [cart]);
  const changeDue = amountPaid - cartTotal;

  // --- MANUAL SYNC ---
  const handleSyncToCloud = async () => {
      const localData = localStorage.getItem('METALURGI_POS_TRX');
      if (!localData) return alert("Belum ada data transaksi.");
      const transactions = JSON.parse(localData);
      if (transactions.length === 0) return alert("Data transaksi kosong.");

      if (!ownerEmail) return alert("Sesi Owner tidak valid. Silakan Logout dan Login kembali.");

      if(!confirm(`Upload ${transactions.length} transaksi ke Cloud?`)) return;

      setIsSyncing(true);
      try {
          const res = await fetch('/api/pos/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  email: ownerEmail, 
                  transactions: transactions 
              })
          });
          const json = await res.json();
          if (json.success) alert(`✅ SUKSES: ${json.message}`);
          else alert(`❌ GAGAL: ${json.error}`);
      } catch (err) {
          alert("Gagal koneksi ke server.");
      } finally {
          setIsSyncing(false);
      }
  };

  const handleOpenShift = () => {
     if (!selectedCashier || !selectedShift) { alert("Pilih Nama Kasir dan Shift!"); return; }
     const newShift = { id: `SHIFT-${Date.now()}`, status: 'OPEN', startTime: new Date().toISOString(), startCash: startCashInput, totalSales: 0, cashierName: selectedCashier, shiftName: selectedShift };
     setShiftData(newShift); setIsShiftOpen(true); localStorage.setItem('METALURGI_POS_SHIFT', JSON.stringify(newShift)); setShowShiftModal(false);
  };

  const handleCloseShift = () => {
     if(!confirm("Proses Tutup Shift?")) return;
     const shiftTrx = allTransactions.filter(t => t.shiftId === shiftData.id);
     const cashIn = shiftTrx.filter(t => t.paymentMethod === 'Cash').reduce((acc, t) => acc + t.total, 0);
     const qrisIn = shiftTrx.filter(t => t.paymentMethod === 'QRIS').reduce((acc, t) => acc + t.total, 0);
     const transferIn = shiftTrx.filter(t => t.paymentMethod === 'Transfer').reduce((acc, t) => acc + t.total, 0);
     const totalDiscount = shiftTrx.reduce((acc, t) => acc + t.items.reduce((ia:number, it:any) => ia + (it.discount*it.qty),0), 0);
     const totalNetSales = cashIn + qrisIn + transferIn;
     const totalGrossSales = totalNetSales + totalDiscount;
     const totalTax = Math.round(totalNetSales * 0.11); 
     const changeGiven = shiftTrx.reduce((acc, t) => acc + t.change, 0);
     const expectedCashEnd = shiftData.startCash + cashIn - cashOutInput; 
     const variance = endCashInput - expectedCashEnd;

     const closingData = { 
         ...shiftData, status: 'CLOSED', endTime: new Date().toISOString(), 
         endCashActual: endCashInput, variance: variance, note: closingNote,
         cashIn, qrisIn, transferIn, cashOut: cashOutInput, changeGiven, expectedCashEnd,
         totalDiscount, totalNetSales, totalGrossSales, totalTax
     };
     
     const history = JSON.parse(localStorage.getItem('METALURGI_POS_SHIFT_HISTORY') || '[]');
     const newHistory = [closingData, ...history];
     localStorage.setItem('METALURGI_POS_SHIFT_HISTORY', JSON.stringify(newHistory));
     setShiftHistory(newHistory); 
     localStorage.removeItem('METALURGI_POS_SHIFT');
     setIsShiftOpen(false); setShiftData({ startTime: null, startCash: 0, totalSales: 0 }); setCart([]); setShowCloseShiftModal(false);
     setShiftReportData(closingData); setPrintType('shift_report'); setShowReceiptPreview(true);
  };

  const handleProcessPayment = () => {
     if (amountPaid < cartTotal && paymentMethod === 'Cash') return alert("Uang pembayaran kurang!");
     
     const trx = {
        id: `POS-${Math.floor(Math.random()*1000000)}`,
        date: new Date().toISOString(), 
        timestamp: new Date().toLocaleTimeString(), 
        items: cart, 
        total: cartTotal,
        paymentMethod, 
        amountPaid, 
        change: Math.max(0, changeDue), 
        cashier: shiftData.cashierName, 
        shift: shiftData.shiftName, 
        shiftId: shiftData.id, 
        isPrinted: false
     };

     const posHistory = JSON.parse(localStorage.getItem('METALURGI_POS_TRX') || '[]');
     const newHistory = [trx, ...posHistory];
     localStorage.setItem('METALURGI_POS_TRX', JSON.stringify(newHistory));
     setAllTransactions(newHistory); 

     const updatedShift = { ...shiftData, totalSales: shiftData.totalSales + cartTotal };
     setShiftData(updatedShift); localStorage.setItem('METALURGI_POS_SHIFT', JSON.stringify(updatedShift));

     generatePOSJournals(trx);
     updateInventoryStock(trx);
     
     runAutoSync(trx);

     setCurrentTrx(trx); setShowPaymentModal(false); setCart([]); setShowSuccessModal(true);
  };

  const generatePOSJournals = (trx: any) => {
    try {
        const journals: any[] = [];
        const debitAcc = trx.paymentMethod === 'Cash' ? '1-1001' : '1-1002'; 
        const dateStr = trx.date.split('T')[0];
        
        journals.push({ 
            source: 'POS', id: `JNL-${trx.id}-SALES`, date: dateStr, ref: trx.id, 
            desc: `Penjualan POS - ${trx.items.length} Items`, debit_acc: debitAcc, credit_acc: '4-1001', amount: trx.total 
        });

        trx.items.forEach((item: any) => {
           const prod = products.find(p => p.SKU === item.sku);
           const cost = parseInt(prod?.Std_Cost_Budget || '0');
           if (cost > 0) { 
               journals.push({ 
                   source: 'POS', id: `JNL-${trx.id}-COGS-${item.sku}`, date: dateStr, ref: trx.id, 
                   desc: `HPP - ${item.name}`, debit_acc: '5-1000', credit_acc: '1-1300', amount: cost * item.qty 
               }); 
           }
        });
        
        const existingRaw = localStorage.getItem('METALURGI_GL_JOURNALS');
        let existingGL = existingRaw ? JSON.parse(existingRaw) : [];
        if (!Array.isArray(existingGL)) existingGL = [];
        localStorage.setItem('METALURGI_GL_JOURNALS', JSON.stringify([...existingGL, ...journals]));
    } catch (err) { console.error("Gagal generate jurnal POS:", err); }
 };

  const updateInventoryStock = (trx: any) => {
     const dateStr = trx.date.split('T')[0];
     const moves = trx.items.map((item: any) => ({ id: `MOV-POS-${trx.id}-${item.sku}`, date: dateStr, type: 'OUT', sku: item.sku, qty: item.qty, cost: 0, ref: trx.id }));
     const existingMoves = JSON.parse(localStorage.getItem('METALURGI_INVENTORY_MOVEMENTS') || '[]');
     const newMoves = [...existingMoves, ...moves];
     localStorage.setItem('METALURGI_INVENTORY_MOVEMENTS', JSON.stringify(newMoves));
     
     const newSoldMap = { ...localSoldQtyMap };
     moves.forEach((m: any) => { newSoldMap[m.sku] = (newSoldMap[m.sku] || 0) + m.qty; });
     setLocalSoldQtyMap(newSoldMap);
  };

  const handlePrintReceipt = () => {
      if(!currentTrx) return;
      const allTrx = JSON.parse(localStorage.getItem('METALURGI_POS_TRX') || '[]');
      const updatedTrx = allTrx.map((t:any) => t.id === currentTrx.id ? { ...t, isPrinted: true } : t);
      localStorage.setItem('METALURGI_POS_TRX', JSON.stringify(updatedTrx));
      setAllTransactions(updatedTrx); 
      setShowSuccessModal(false); setPrintType('receipt'); setShowReceiptPreview(true);
  };

  const categories = ['All', ...Array.from(new Set(products.map(p => p.Category)))];
  const filteredProducts = products.filter(p => (activeCategory === 'All' || p.Category === activeCategory) && (p.Product_Name.toLowerCase().includes(searchTerm.toLowerCase()) || p.SKU.toLowerCase().includes(searchTerm.toLowerCase())));

  // --- TEMPLATES ---
  const ShiftReportTemplate = ({ data }: { data: any }) => (
      <>
         <div className="text-center mb-3">
             {logoPreview && <img src={logoPreview} alt="Logo" className="h-10 mx-auto mb-1 object-contain"/>}
             <h2 className="font-bold text-sm uppercase">{receiptConfig.Store_Name || 'Metalurgi POS'}</h2>
             <div className="text-[9px] font-bold border border-black px-1 inline-block mt-1">LAPORAN TUTUP SHIFT</div>
         </div>
         <div className="grid grid-cols-2 gap-y-1 mb-2 text-[9px]">
             <span>ID Sesi:</span><span className="text-right font-mono">{data.id}</span>
             <span>Tanggal:</span><span className="text-right">{new Date(data.startTime).toLocaleDateString()}</span>
             <span>Shift / Kasir:</span><span className="text-right">{data.shiftName} / {data.cashierName}</span>
             <span>Waktu Buka:</span><span className="text-right">{new Date(data.startTime).toLocaleTimeString()}</span>
             <span>Waktu Tutup:</span><span className="text-right">{new Date(data.endTime).toLocaleTimeString()}</span>
         </div>
         <div className="border-t border-black border-dashed pt-1 mb-1 font-bold text-[9px] uppercase">Arus Kas Tunai</div>
         <div className="grid grid-cols-2 gap-y-1 mb-2 text-[9px]">
             <span>Saldo Awal:</span><span className="text-right">{fmtMoney(data.startCash)}</span>
             <span>(+) Penjualan Tunai:</span><span className="text-right">{fmtMoney(data.cashIn)}</span>
             <span>(-) Cash Out (Keluar):</span><span className="text-right">{fmtMoney(data.cashOut)}</span>
             <span className="text-slate-500 italic">(-) Info Kembalian:</span><span className="text-right text-slate-500 italic">{fmtMoney(data.changeGiven)}</span>
             <div className="border-t border-black border-dashed col-span-2 my-1"></div>
             <span className="font-bold">Saldo Akhir (Sistem):</span><span className="text-right font-bold">{fmtMoney(data.expectedCashEnd)}</span>
             <span className="font-bold">Saldo Fisik (Aktual):</span><span className="text-right font-bold">{fmtMoney(data.endCashActual)}</span>
             <span className="font-bold">Selisih (Var):</span><span className="text-right font-bold">{fmtMoney(data.variance)}</span>
         </div>
         <div className="mt-6 flex justify-between text-center pt-4 text-[9px]">
             <div className="w-1/3"><p className="mb-8">Dibuat Oleh,</p><p className="border-t border-black pt-1 font-bold">{data.cashierName}</p></div>
             <div className="w-1/3"><p className="mb-8">Diketahui Oleh,</p><p className="border-t border-black pt-1 font-bold">SPV</p></div>
         </div>
      </>
  );

  const ReceiptTemplate = ({ trx }: { trx: any }) => (
      <>
         <div className="text-center mb-4">
             {logoPreview && <img src={logoPreview} alt="Logo" className="h-10 mx-auto mb-2 object-contain"/>}
             <h2 className="font-bold text-sm uppercase">{receiptConfig.Store_Name || 'Metalurgi POS'}</h2>
             <div className="mt-2 text-left border-t border-black border-dashed pt-2">
                 <div className="flex justify-between"><span>Trx:</span> <span>{trx.id}</span></div>
                 <div className="flex justify-between"><span>Date:</span> <span>{trx.date.split('T')[0]} {trx.timestamp}</span></div>
                 <div className="flex justify-between"><span>Kasir:</span> <span>{trx.cashier}</span></div>
                 <div className="flex justify-between"><span>Shift:</span> <span>{trx.shift}</span></div>
                 <div className="flex justify-between"><span>Metode:</span> <span>{trx.paymentMethod}</span></div>
             </div>
         </div>
         <div className="border-b border-black border-dashed mb-2"></div>
         {trx.items.map((item:any, i:number)=>(<div key={i} className="mb-1"><div>{item.name}</div><div className="flex justify-between"><span>{item.qty} x {fmtMoney(item.price)}</span><span>{fmtMoney(item.qty*item.price)}</span></div></div>))}
         <div className="border-b border-black border-dashed my-2"></div>
         <div className="space-y-1">
             <div className="flex justify-between font-bold text-sm border-t border-black border-dashed pt-1"><span>TOTAL</span><span>{fmtMoney(trx.total)}</span></div>
             <div className="flex justify-between mt-2"><span>Bayar</span><span>{fmtMoney(trx.amountPaid)}</span></div>
             <div className="flex justify-between"><span>Kembali</span><span>{fmtMoney(trx.change)}</span></div>
         </div>
         <div className="text-center mt-4"><p>{receiptConfig.Footer || 'Terima Kasih'}</p></div>
      </>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] gap-4 pb-4">
      {/* TOP NAVIGATION */}
      <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm print:hidden">
         <div className="flex items-center gap-4"><h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Store className="text-blue-600"/> Metalurgi POS</h1><div className="flex bg-slate-100 p-1 rounded-lg"><button onClick={() => setActiveView('cashier')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeView === 'cashier' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Mesin Kasir</button><button onClick={() => setActiveView('transactions')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeView === 'transactions' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Riwayat Transaksi</button><button onClick={() => setActiveView('shifts')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${activeView === 'shifts' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Riwayat Shift</button></div></div>
         <div className="flex items-center gap-3">{isShiftOpen && (<div className="flex items-center gap-4 text-xs font-medium text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200"><span className="flex items-center gap-1"><User size={14} className="text-blue-500"/> {shiftData.cashierName}</span><span className="w-px h-3 bg-slate-300"></span><span className="flex items-center gap-1"><Clock size={14} className="text-amber-500"/> {shiftData.shiftName}</span></div>)}{isShiftOpen ? <button onClick={() => setShowCloseShiftModal(true)} className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-100 text-rose-700 hover:bg-rose-200">Tutup Shift</button> : <button onClick={() => setShowShiftModal(true)} className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-700 hover:bg-emerald-200">Buka Kasir</button>}</div>
      </div>

      {/* VIEW 1: CASHIER MACHINE */}
      {activeView === 'cashier' && (<div className="flex-1 flex gap-4 overflow-hidden print:hidden"><div className="flex-1 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"><div className="p-4 border-b border-slate-100 space-y-3"><div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={18}/><input type="text" placeholder="Cari Produk..." className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/></div></div><div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">{categories.map(c => (<button key={c} onClick={() => setActiveCategory(c as string)} className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${activeCategory === c ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{c as string}</button>))}</div></div><div className="flex-1 overflow-y-auto p-4 bg-slate-50">{loading ? <div className="flex justify-center p-10"><Loader2 className="animate-spin text-slate-400"/></div> : <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{filteredProducts.map((prod, i) => { 
      const promo = getProductPromo(prod.SKU, parseInt(prod.Sell_Price_List)||0); 
      const liveStock = getLiveStock(prod);
      const isJasa = ['Jasa', 'Service'].includes(prod.Category);
      return (<div key={i} onClick={() => addToCart(prod)} className={`bg-white p-3 rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-blue-500 hover:shadow-md transition-all flex flex-col justify-between h-full relative overflow-hidden group ${!isJasa && liveStock <= 0 ? 'opacity-60 grayscale' : ''}`}>
          {!isJasa && (<div className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold z-10 flex items-center gap-1 ${liveStock > 10 ? 'bg-emerald-100 text-emerald-700' : liveStock > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}><Box size={10}/> {liveStock > 0 ? `${liveStock} Stok` : 'Habis'}</div>)}
          <div><div className="text-[10px] text-slate-400 mb-1 mt-6">{prod.Category}</div><div className="font-bold text-slate-800 text-sm leading-tight mb-2 line-clamp-2">{prod.Product_Name}</div></div><div className="mt-auto">{promo.hasPromo ? (<div className="flex flex-col"><span className="text-[10px] text-slate-400 line-through">{fmtMoney(parseInt(prod.Sell_Price_List))}</span><span className="text-rose-600 font-bold">{fmtMoney(promo.finalPrice)}</span></div>) : (<div className="text-blue-600 font-bold">{fmtMoney(parseInt(prod.Sell_Price_List))}</div>)}</div></div>); })}</div>}</div></div><div className="w-[350px] bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden"><div className="p-4 border-b border-slate-100 bg-slate-50"><h2 className="font-bold text-slate-800 flex items-center gap-2"><ShoppingCart size={18}/> Keranjang</h2></div><div className="flex-1 overflow-y-auto p-4 space-y-3">{cart.length === 0 ? (<div className="text-center text-slate-400 mt-10 flex flex-col items-center"><ShoppingCart size={40} className="mb-2 opacity-20"/><p className="text-sm">Keranjang Kosong</p></div>) : cart.map((item, i) => (<div key={i} className="flex justify-between items-start border-b border-slate-100 pb-2"><div className="flex-1"><div className="text-sm font-bold text-slate-800">{item.name}</div><div className="text-xs text-blue-600">{fmtMoney(item.price)}</div></div><div className="flex items-center gap-3"><div className="flex items-center gap-2 bg-slate-100 rounded-lg px-1"><button onClick={() => updateQty(item.sku, -1)} className="p-1 text-slate-500 hover:text-rose-600 font-bold">-</button><span className="text-xs font-bold w-4 text-center">{item.qty}</span><button onClick={() => updateQty(item.sku, 1)} className="p-1 text-slate-500 hover:text-emerald-600 font-bold">+</button></div><button onClick={() => removeFromCart(item.sku)} className="text-slate-300 hover:text-rose-500"><Trash2 size={16}/></button></div></div>))}</div><div className="p-4 bg-slate-50 border-t border-slate-200 space-y-3"><div className="flex justify-between text-lg font-bold text-slate-900"><span>Total</span><span>{fmtMoney(cartTotal)}</span></div><button onClick={() => cartTotal > 0 && setShowPaymentModal(true)} disabled={cartTotal === 0} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 disabled:opacity-50 disabled:shadow-none transition-all">Bayar Sekarang</button></div></div></div>)}
      
      {/* VIEW 2: TRANSACTIONS (WITH CLOUD TOGGLE) */}
      {activeView === 'transactions' && (
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col print:hidden">
            <div className="p-4 border-b border-slate-100 bg-white space-y-4">
                <div className="flex flex-wrap items-center gap-3 justify-between">
                    <div className="flex gap-3">
                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                            <Calendar size={14} className="text-slate-400"/>
                            <span className="text-xs font-bold text-slate-500">From</span>
                            <input type="date" className="text-xs font-bold text-slate-700 bg-transparent outline-none" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})}/>
                            <span className="text-xs font-bold text-slate-500">To</span>
                            <input type="date" className="text-xs font-bold text-slate-700 bg-transparent outline-none" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})}/>
                        </div>
                        <select className="text-xs p-2 rounded-lg border border-slate-200" value={shiftFilter} onChange={e => setShiftFilter(e.target.value)}>
                            <option value="all">Semua Shift</option>{masterShifts.map((s,i) => <option key={i} value={s.Shift_Name}>{s.Shift_Name}</option>)}
                        </select>
                    </div>

                    {/* CLOUD DASHBOARD TOGGLE */}
                    <div className="flex items-center bg-slate-100 p-1 rounded-lg">
                      <button 
                        onClick={() => setViewSource('local')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewSource === 'local' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                      >
                        <Database size={14}/> Data Lokal (Tab)
                      </button>
                      <button 
                        onClick={() => setViewSource('cloud')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${viewSource === 'cloud' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500'}`}
                      >
                        <Laptop2 size={14}/> Data Cloud (Report)
                      </button>
                    </div>
                </div>
                
                <div className="flex justify-between items-center gap-3">
                  <div className="flex-1 relative">
                        <Search className="absolute left-3 top-2.5 text-slate-400" size={14}/>
                        <input type="text" placeholder="Cari Transaksi..." className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200" value={historySearch} onChange={e => setHistorySearch(e.target.value)}/>
                  </div>
                  
                  {/* [REVISI] TOMBOL HAPUS DATA LOKAL */}
                  {viewSource === 'local' && (
                    <button 
                        onClick={handleResetTransactions}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all bg-rose-100 text-rose-600 hover:bg-rose-200"
                        title="Hapus riwayat transaksi lokal"
                    >
                        <Trash2 size={16}/> Reset Data
                    </button>
                  )}

                  {/* TOMBOL MANUAL SYNC (Hanya muncul jika view local) */}
                  {viewSource === 'local' && (
                    <button 
                        onClick={handleSyncToCloud}
                        disabled={isSyncing}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all shadow-sm ${isSyncing ? 'bg-slate-100 text-slate-400' : 'bg-emerald-500 hover:bg-emerald-600 text-white'}`}
                    >
                        {isSyncing ? <Loader2 size={14} className="animate-spin"/> : <CloudUpload size={14}/>}
                        {isSyncing ? 'Uploading...' : 'Manual Sync'}
                    </button>
                  )}
                  {viewSource === 'cloud' && (
                     <button onClick={fetchCloudData} disabled={isLoadingCloud} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600">
                       <RefreshCw size={16} className={isLoadingCloud ? "animate-spin" : ""}/>
                     </button>
                  )}
                </div>
            </div>
            
            <div className="flex-1 overflow-auto p-0">
                {isLoadingCloud ? (
                   <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                      <Loader2 size={32} className="animate-spin"/>
                      <p className="text-sm">Mengambil data dari Cloud...</p>
                   </div>
                ) : (
                <table className="w-full text-sm text-left">
                    <thead className="bg-white text-slate-500 text-xs uppercase border-b border-slate-100 font-bold sticky top-0 z-10">
                        <tr><th className="p-4">No. Transaksi</th><th className="p-4">Waktu</th><th className="p-4">Produk</th><th className="p-4 text-center">Qty</th><th className="p-4 text-right">Total (Rp)</th><th className="p-4 text-center">Action</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filteredHistory.map((trx, idx) => (
                            <tr key={idx} className="hover:bg-blue-50/50">
                                <td className="p-4 font-mono font-bold text-xs text-slate-600 align-top">
                                  {trx.id}
                                  {trx.isCloud && <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-[9px]">CLOUD</span>}
                                </td>
                                <td className="p-4 text-slate-500 text-xs align-top"><div>{trx.date.split('T')[0]}</div><div>{trx.timestamp}</div></td>
                                <td className="p-4 align-top"><div className="flex flex-col gap-1">{trx.items.map((it:any, i:number) => (<span key={i} className="text-xs text-slate-700">• {it.name} <span className="text-slate-400">x{it.qty}</span></span>))}</div></td>
                                <td className="p-4 text-center font-bold align-top">{trx.items.reduce((a:any,b:any)=>a+b.qty,0)}</td>
                                <td className="p-4 text-right font-bold text-slate-900 align-top">{fmtMoney(trx.total)}</td>
                                <td className="p-4 text-center align-top"><button onClick={() => { setCurrentTrx(trx); setPrintType('receipt'); setShowReceiptPreview(true); }} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-800" title="Preview & Print"><Printer size={16}/></button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                )}
            </div>
        </div>
      )}

      {/* VIEW 3: SHIFTS (SAME) */}
      {activeView === 'shifts' && (<div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col print:hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><ClipboardList size={18}/> Riwayat Shift Kasir</h3>
            {/* [REVISI] TOMBOL HAPUS SHIFT */}
            <button onClick={handleResetShifts} className="px-3 py-1.5 bg-white border border-slate-300 text-slate-600 rounded-lg text-xs font-bold hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 flex items-center gap-2 transition-all">
                <Eraser size={14}/> Reset History
            </button>
        </div>
        <div className="flex-1 overflow-auto p-0"><table className="w-full text-sm text-left"><thead className="bg-white text-slate-500 text-xs uppercase border-b border-slate-100 font-bold sticky top-0 z-10"><tr><th className="p-4">Tanggal</th><th className="p-4">Shift</th><th className="p-4 text-right">Total Penjualan</th><th className="p-4 text-right">Fisik Akhir</th><th className="p-4 text-right">Selisih</th><th className="p-4 text-center">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{shiftHistory.map((s, i) => (<tr key={i} className="hover:bg-blue-50"><td className="p-4 font-mono text-xs">{new Date(s.startTime).toLocaleDateString()}</td><td className="p-4 font-bold text-slate-700">{s.shiftName} / {s.cashierName}</td><td className="p-4 text-right font-bold text-emerald-600">{fmtMoney(s.totalSales)}</td><td className="p-4 text-right font-bold">{fmtMoney(s.endCashActual)}</td><td className={`p-4 text-right font-bold ${s.variance < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtMoney(s.variance)}</td><td className="p-4 text-center"><button onClick={() => { setShiftReportData(s); setPrintType('shift_report'); setShowReceiptPreview(true); }} className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-blue-600"><Printer size={16}/></button></td></tr>))}</tbody></table></div></div>)}

      {/* MODALS & POPUPS (SAME AS BEFORE) */}
      {showShiftModal && (<div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden"><div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center animate-in zoom-in-95"><div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4"><Store size={32}/></div><h3 className="font-bold text-xl text-slate-900 mb-2">Buka Shift Kasir</h3><div className="space-y-3 text-left"><div><label className="text-xs font-bold text-slate-500">Pilih Kasir</label><select className="w-full p-2 border rounded-lg mt-1 bg-white" onChange={e => setSelectedCashier(e.target.value)}><option value="">-- Pilih --</option>{masterCashiers.map((c, i) => <option key={i} value={c.Name}>{c.Name}</option>)}</select></div><div><label className="text-xs font-bold text-slate-500">Pilih Shift</label><select className="w-full p-2 border rounded-lg mt-1 bg-white" onChange={e => setSelectedShift(e.target.value)}><option value="">-- Pilih --</option>{masterShifts.map((s, i) => <option key={i} value={s.Shift_Name}>{s.Shift_Name} ({s.Start_Time || '00:00'}-{s.End_Time || '23:59'})</option>)}</select></div><div><label className="text-xs font-bold text-slate-500">Saldo Awal (Modal)</label><input type="number" className="w-full p-2 border rounded-lg mt-1" placeholder="Rp" onChange={e => setStartCashInput(parseInt(e.target.value)||0)}/></div><button onClick={handleOpenShift} className="w-full py-3 mt-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700">Buka Toko</button></div></div></div>)}
      
      {showCloseShiftModal && (<div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden"><div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95"><div className="p-5 border-b flex justify-between items-center bg-slate-50"><h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><LogOut className="text-rose-600"/> Tutup Shift</h3><button onClick={() => setShowCloseShiftModal(false)}><X className="text-slate-400"/></button></div><div className="p-6 space-y-4"><div className="bg-blue-50 p-4 rounded-xl space-y-2 text-sm border border-blue-100"><div className="flex justify-between"><span>Saldo Awal (Modal)</span><span className="font-mono">{fmtMoney(shiftData.startCash)}</span></div><div className="flex justify-between"><span>Total Penjualan</span><span className="font-mono">{fmtMoney(shiftData.totalSales)}</span></div><div className="border-t border-blue-200 pt-2 flex justify-between font-bold text-blue-800"><span>Total Seharusnya</span><span>{fmtMoney(shiftData.startCash + shiftData.totalSales)}</span></div></div><div className="grid grid-cols-2 gap-3"><div><label className="text-[10px] font-bold text-slate-500 uppercase">Cash Out / Keluar</label><input type="number" className="w-full p-2 border border-slate-300 rounded-lg text-sm mt-1 text-rose-600 font-bold" placeholder="0" onChange={e => setCashOutInput(parseInt(e.target.value)||0)}/></div><div><label className="text-[10px] font-bold text-slate-500 uppercase">Total Kembalian</label><div className="w-full p-2 border border-slate-200 bg-slate-50 rounded-lg text-sm mt-1 text-slate-600 font-mono">{fmtMoney(allTransactions.filter(t => t.shiftId === shiftData.id).reduce((acc, t) => acc + t.change, 0))}</div></div></div><div><label className="text-xs font-bold text-slate-600 uppercase">Saldo Fisik Aktual</label><input type="number" autoFocus className="w-full p-3 border border-slate-300 rounded-xl text-lg font-bold mt-1" placeholder="Masukkan total uang di laci" onChange={e => setEndCashInput(parseInt(e.target.value)||0)}/><div className={`text-right text-xs mt-1 font-bold ${endCashInput - (shiftData.startCash + allTransactions.filter(t => t.shiftId === shiftData.id && t.paymentMethod === 'Cash').reduce((acc, t) => acc + t.total, 0) - cashOutInput) !== 0 ? 'text-rose-600' : 'text-emerald-600'}`}>Selisih: {fmtMoney(endCashInput - (shiftData.startCash + allTransactions.filter(t => t.shiftId === shiftData.id && t.paymentMethod === 'Cash').reduce((acc, t) => acc + t.total, 0) - cashOutInput))}</div></div><div><label className="text-xs font-bold text-slate-600 uppercase">Catatan / Keterangan</label><textarea className="w-full p-2 border border-slate-300 rounded-lg text-sm mt-1" rows={2} placeholder="Alasan selisih, dll..." onChange={e => setClosingNote(e.target.value)}></textarea></div></div><div className="p-5 border-t flex gap-3"><button onClick={() => setShowCloseShiftModal(false)} className="flex-1 py-3 bg-white border border-slate-300 font-bold text-slate-600 rounded-xl hover:bg-slate-50">Batal</button><button onClick={handleCloseShift} className="flex-1 py-3 bg-rose-600 text-white font-bold rounded-xl hover:bg-rose-700 shadow-lg shadow-rose-200">Tutup & Cetak Laporan</button></div></div></div>)}
      
      {showPaymentModal && (<div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden"><div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"><div className="p-5 border-b flex justify-between items-center"><h3 className="font-bold text-lg text-slate-800">Pembayaran</h3><button onClick={() => setShowPaymentModal(false)}><X className="text-slate-400"/></button></div><div className="p-6 space-y-6"><div className="text-center"><p className="text-sm text-slate-500 mb-1">Total Tagihan</p><h2 className="text-3xl font-bold text-slate-900">{fmtMoney(cartTotal)}</h2></div><div className="grid grid-cols-3 gap-3">{['Cash', 'QRIS', 'Transfer'].map(m => (<button key={m} onClick={() => setPaymentMethod(m as any)} className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all ${paymentMethod === m ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 hover:bg-slate-50 text-slate-600'}`}>{m === 'Cash' ? <Banknote size={20}/> : m === 'QRIS' ? <QrCode size={20}/> : <CreditCard size={20}/>}<span className="text-xs font-bold">{m}</span></button>))}</div>{paymentMethod === 'Cash' && (<div><label className="block text-xs font-bold text-slate-500 mb-1">Uang Diterima</label><input type="number" autoFocus className="w-full p-3 border border-slate-300 rounded-xl text-lg font-bold" value={amountPaid} onChange={e => setAmountPaid(parseInt(e.target.value) || 0)} placeholder="0"/><div className="flex gap-2 mt-2">{[cartTotal, 50000, 100000].map(amt => (<button key={amt} onClick={() => setAmountPaid(amt)} className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200">{fmtMoney(amt)}</button>))}</div></div>)}<div className="bg-slate-50 p-4 rounded-xl flex justify-between items-center"><span className="text-sm font-bold text-slate-600">Kembalian</span><span className={`text-xl font-bold ${changeDue < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{changeDue < 0 ? '-' : fmtMoney(changeDue)}</span></div></div><div className="p-5 border-t"><button onClick={handleProcessPayment} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200">Selesaikan Transaksi</button></div></div></div>)}
      
      {showSuccessModal && (<div className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden"><div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl text-center p-8 animate-in zoom-in-95"><div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle2 size={32}/></div><h3 className="font-bold text-xl text-slate-900 mb-2">Transaksi Berhasil!</h3><p className="text-sm text-slate-500 mb-6">Total Transaksi: <span className="font-bold text-slate-800">{fmtMoney(currentTrx?.total || 0)}</span></p><div className="space-y-3"><button onClick={() => setShowSuccessModal(false)} className="w-full py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200">Simpan Transaksi Saja</button><button onClick={handlePrintReceipt} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 flex items-center justify-center gap-2"><Printer size={18}/> Preview & Cetak Nota</button></div></div></div>)}
      
      {/* PREVIEW MODAL */}
      {showReceiptPreview && (<div className="fixed inset-0 bg-slate-900/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm print:hidden"><div className="bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"><div className="p-4 border-b flex justify-between items-center bg-slate-50"><h3 className="font-bold text-slate-800">Preview Cetakan</h3><button onClick={() => setShowReceiptPreview(false)}><X className="text-slate-400"/></button></div><div className="p-8 bg-slate-200 overflow-y-auto flex justify-center"><div className="bg-white p-4 w-[300px] shadow-sm text-[10px] font-mono leading-tight">{printType === 'receipt' && currentTrx && <ReceiptTemplate trx={currentTrx}/>}{printType === 'shift_report' && shiftReportData && <ShiftReportTemplate data={shiftReportData}/>}</div></div><div className="p-4 border-t bg-white flex justify-end gap-2"><button onClick={() => setShowReceiptPreview(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-50 rounded-lg">Batal</button><button onClick={() => window.print()} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center gap-2"><Printer size={16}/><FileDown size={16}/> Cetak / Simpan PDF</button></div></div></div>)}
      
      {/* HIDDEN PRINT AREA */}
      <div className="hidden print:block fixed top-0 left-0 w-[58mm] bg-white text-black p-2 text-[10px] font-mono leading-tight">{printType === 'receipt' && currentTrx && <ReceiptTemplate trx={currentTrx}/>}{printType === 'shift_report' && shiftReportData && <ShiftReportTemplate data={shiftReportData}/>}</div>
    </div>
  );
}