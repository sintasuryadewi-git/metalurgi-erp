'use client';

import { useState, useMemo, useEffect, useCallback, Fragment } from 'react';
import { 
  Search, Filter, Plus, Wallet, X, Save, 
  CreditCard, Scale, CheckCircle2, 
  Loader2, RefreshCw, Layers, SlidersHorizontal, Calendar,
  Printer, TrendingUp, Users, ChevronUp, ChevronDown, 
  FileText, Landmark, PenTool, ArrowUpRight, ArrowDownLeft
} from 'lucide-react';

import { fetchSheetData } from '@/lib/googleSheets';

// --- HELPER: TERBILANG ---
const terbilang = (nilai: number): string => {
  const angka = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
  let temp = "";
  const n = Math.abs(nilai);
  if (n < 12) {
    temp = " " + angka[n];
  } else if (n < 20) {
    temp = terbilang(n - 10) + " Belas";
  } else if (n < 100) {
    temp = terbilang(Math.floor(n / 10)) + " Puluh" + terbilang(n % 10);
  } else if (n < 200) {
    temp = " Seratus" + terbilang(n - 100);
  } else if (n < 1000) {
    temp = terbilang(Math.floor(n / 100)) + " Ratus" + terbilang(n % 100);
  } else if (n < 2000) {
    temp = " Seribu" + terbilang(n - 1000);
  } else if (n < 1000000) {
    temp = terbilang(Math.floor(n / 1000)) + " Ribu" + terbilang(n % 1000);
  } else if (n < 1000000000) {
    temp = terbilang(Math.floor(n / 1000000)) + " Juta" + terbilang(n % 1000000);
  }
  return temp.trim() + " Rupiah";
}

const DEFAULT_ACCOUNTS = {
  AR: { code: '1-1201', name: 'Piutang Usaha (AR)' },
  AP_TRADE: { code: '2-1001', name: 'Hutang Usaha (AP)' },
  AP_EXPENSE: { code: '2-1002', name: 'Hutang Biaya Lainnya' },
  BANK: { code: '1-1002', name: 'Bank BCA' },
  SALES: { code: '4-1001', name: 'Pendapatan Penjualan' },
  INVENTORY: { code: '1-1301', name: 'Persediaan Barang' }
};

export default function TransactionsPage() {
  
  // --- STATE CORE ---
  const [transactions, setTransactions] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]); 
  const [activeTab, setActiveTab] = useState<'sales' | 'purchase' | 'expense' | 'payments'>('sales');
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // --- FILTER & GROUPING ---
  const [groupBy, setGroupBy] = useState<'none' | 'month' | 'partner' | 'product' | 'status' | 'debit_acc' | 'credit_acc'>('none');
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilter, setDraftFilter] = useState({ column: 'all', operator: 'contains', value: '' });
  const [activeFilter, setActiveFilter] = useState(draftFilter);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

  // --- SUMMARY STATES ---
  const [showProductSummary, setShowProductSummary] = useState(false);
  const [showPartnerSummary, setShowPartnerSummary] = useState(false);
  const [summaryDateRange, setSummaryDateRange] = useState({ start: '2025-01-01', end: new Date().toISOString().split('T')[0] });
  const [summarySort, setSummarySort] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'salesVal', direction: 'desc' });

  // --- PRINT WIZARD STATES ---
  const [printWizardOpen, setPrintWizardOpen] = useState(false);
  const [printPreviewMode, setPrintPreviewMode] = useState(false);
  const [selectedTxForPrint, setSelectedTxForPrint] = useState<any>(null);
  const [printConfig, setPrintConfig] = useState({
      npwp: '00.000.000.0-000.000',
      dp: 0,
      terms: 'Pembayaran maksimal 30 hari setelah invoice diterima.',
      bankName: 'BCA',
      bankNo: '123-456-7890',
      bankHolder: 'PT METALURGI INDONESIA',
      signatory: ''
  });

  // --- PERSISTENCE ---
  const [journalOverrides, setJournalOverrides] = useState<Record<string, any[]>>({});
  const [partnersList, setPartnersList] = useState<any[]>([]);
  const [productList, setProductList] = useState<any[]>([]);
  const [coaList, setCoaList] = useState<any[]>([]);

  // Modals
  const [isNewTxModalOpen, setIsNewTxModalOpen] = useState(false);
  const [journalModalData, setJournalModalData] = useState<any | null>(null);
  
  // MANUAL FORM
  const [manualForm, setManualForm] = useState<any>({
     partner: '', product: '', date: new Date().toISOString().split('T')[0], 
     dueDate: '', qty: 1, price: 0, desc: '',
     paymentType: 'Payment In', refNumber: '', maxAmount: 0
  });

  // --- 1. INIT LOAD ---
  useEffect(() => {
    const init = async () => {
      try {
        const [partners, products, coa] = await Promise.all([
          fetchSheetData('Master_Partner'),
          fetchSheetData('Master_Product'),
          fetchSheetData('Master_COA')
        ]);
        setPartnersList(partners as any[]);
        setProductList(products as any[]);
        setCoaList(coa as any[]);

        if (typeof window !== 'undefined') {
           const savedOverrides = localStorage.getItem('METALURGI_JOURNAL_OVERRIDES');
           if (savedOverrides) setJournalOverrides(JSON.parse(savedOverrides));
           
           const savedLogo = localStorage.getItem('METALURGI_SHOP_LOGO');
           if (savedLogo) setLogoUrl(savedLogo);

           const savedPrintConfig = localStorage.getItem('METALURGI_PRINT_CONFIG');
           if (savedPrintConfig) setPrintConfig(JSON.parse(savedPrintConfig));
        }
      } catch (err) { console.error(err); }
    };
    init();
  }, []);

  // --- JOURNAL GENERATOR (FIXED FOR MANUAL PAYMENTS) ---
  const generateJournal = (trx: any) => {
    if (journalOverrides[trx.id]) return journalOverrides[trx.id];
    
    const entries = [];
    const total = parseFloat(trx.amount) || 0; // Ensure number

    // 1. Sales
    if (trx.type === 'sales') {
        entries.push({ pos: 'Debit', acc: DEFAULT_ACCOUNTS.AR, val: total });
        entries.push({ pos: 'Credit', acc: DEFAULT_ACCOUNTS.SALES, val: total });
    } 
    // 2. Purchase
    else if (trx.type === 'purchase') {
        entries.push({ pos: 'Debit', acc: DEFAULT_ACCOUNTS.INVENTORY, val: total });
        entries.push({ pos: 'Credit', acc: DEFAULT_ACCOUNTS.AP_TRADE, val: total });
    } 
    // 3. Expense
    else if (trx.type === 'expense') {
        const expAccCode = trx.items?.[0]?.account || '6-xxxx';
        // @ts-ignore
        const expAccName = coaList.find(c => c.Account_Code === expAccCode)?.Account_Name || 'Beban Ops';
        entries.push({ pos: 'Debit', acc: { code: expAccCode, name: expAccName }, val: total });
        entries.push({ pos: 'Credit', acc: DEFAULT_ACCOUNTS.BANK, val: total });
    } 
    // 4. Payment In / Out (Handles both Sheet and Manual)
    else if (trx.type === 'Payment In' || trx.type === 'Payment Out' || trx.type === 'IN' || trx.type === 'OUT') {
        // Fallback default bank if no source account
        const bankAcc = trx.sourceAccount ? { code: '1-1002', name: trx.sourceAccount } : DEFAULT_ACCOUNTS.BANK;
        
        // Determine Direction
        const isIncoming = trx.type === 'Payment In' || trx.type === 'IN';

        if (isIncoming) {
            // Uang Masuk: Debit Bank, Kredit Piutang (AR)
            entries.push({ pos: 'Debit', acc: bankAcc, val: total });
            entries.push({ pos: 'Credit', acc: DEFAULT_ACCOUNTS.AR, val: total });
        } else {
            // Uang Keluar: Debit Hutang (AP), Kredit Bank
            entries.push({ pos: 'Debit', acc: DEFAULT_ACCOUNTS.AP_TRADE, val: total });
            entries.push({ pos: 'Credit', acc: bankAcc, val: total });
        }
    }

    return entries;
  };

  // --- 2. LOAD TRANSACTIONS ---
  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const [trxSales, trxPurchase, trxExpense, trxPayment] = await Promise.all([
        fetchSheetData('Trx_Sales_Invoice'),
        fetchSheetData('Trx_Purchase_Invoice'),
        fetchSheetData('Trx_Expense'),
        fetchSheetData('Trx_Payment')
      ]);

      const paymentMap: Record<string, number> = {};
      (trxPayment as any[]).forEach(p => {
        if (p.Ref_Number) paymentMap[p.Ref_Number] = (paymentMap[p.Ref_Number] || 0) + parseInt(p.Amount || 0);
      });
      
      // Load Manual Data
      let manualTrx: any[] = [];
      let manualPay: any[] = [];
      if (typeof window !== 'undefined') {
         const savedManuals = localStorage.getItem('METALURGI_MANUAL_TRX');
         if (savedManuals) {
             const allManual = JSON.parse(savedManuals);
             manualTrx = allManual.filter((t:any) => t.type !== 'Payment In' && t.type !== 'Payment Out');
             manualPay = allManual.filter((t:any) => t.type === 'Payment In' || t.type === 'Payment Out');
         }
      }

      // MAP SHEET PAYMENTS
      const mappedPayments = (trxPayment as any[]).map((p, i) => {
        // @ts-ignore
        const accName = coaList.find(c => c.Account_Code === p.Account_Code)?.Account_Name || p.Account_Code;
        return {
          uniqueKey: `PAY-${i}`, id: `PAY-${i}`, date: p.Trx_Date, ref: p.Ref_Number, type: p.Payment_Type || 'Payment In', 
          sourceAccount: accName, amount: parseInt(p.Amount || 0), desc: p.Desc, partner: '-', status: 'Posted'
        };
      });
      
      // Merge Payments
      setPayments([...mappedPayments, ...manualPay]);

      // MAP TRANSACTIONS (Sheet)
      const mappedSales = (trxSales as any[]).map((row: any, idx: number) => {
        const total = (parseInt(row.Qty||0) * parseInt(row.Unit_Price||0));
        const paid = paymentMap[row.Inv_Number] || 0;
        return {
          uniqueKey: `SALES-${row.Inv_Number}-${idx}`, id: row.Inv_Number, date: row.Trx_Date, dueDate: row.Due_Date || '-',
          partner: row.Partner_ID, product: row.Product_SKU, qty: parseInt(row.Qty||0), price: parseInt(row.Unit_Price||0),
          type: 'sales', desc: `Penjualan ${row.Product_SKU}`, amount: total, amountPaid: paid, 
          status: paid >= total ? 'Fully Paid' : paid > 0 ? 'Partial Paid' : 'Unpaid'
        };
      });

      const mappedPurchase = (trxPurchase as any[]).map((row: any, idx: number) => {
        const total = (parseInt(row.Qty||0) * parseInt(row.Unit_Cost||0));
        const paid = paymentMap[row.Bill_Number] || 0;
        return {
          uniqueKey: `PURCH-${row.Bill_Number}-${idx}`, id: row.Bill_Number, date: row.Trx_Date, dueDate: row.Due_Date || '-',
          partner: row.Partner_ID, product: row.Product_SKU, qty: parseInt(row.Qty||0), price: parseInt(row.Unit_Cost||0),
          type: 'purchase', desc: `Pembelian ${row.Product_SKU}`, amount: total, amountPaid: paid, 
          status: paid >= total ? 'Fully Paid' : paid > 0 ? 'Partial Paid' : 'Unpaid'
        };
      });

      const mappedExpense = (trxExpense as any[]).map((row: any, idx: number) => ({
        uniqueKey: `EXP-${idx}`, id: `EXP-${idx+1}`, date: row.Trx_Date, dueDate: row.Trx_Date,
        partner: 'Internal', product: '-', type: 'expense', desc: row.Desc, 
        amount: parseInt(row.Amount||0), amountPaid: parseInt(row.Amount||0), status: 'Fully Paid', items: [{account: row.Expense_Account}]
      }));

      // Merge All
      const allTrx = [...manualTrx, ...mappedSales, ...mappedPurchase, ...mappedExpense];
      setTransactions(allTrx);

      // AUTO SYNC GL
      if (typeof window !== 'undefined') {
          const combinedAll = [...allTrx, ...mappedPayments, ...manualPay];
          const glEntries: any[] = [];
          
          combinedAll.forEach(trx => {
              const entries = generateJournal(trx);
              entries.forEach(j => {
                  glEntries.push({
                      source: 'Transaction', 
                      id: `GL-${trx.id}-${j.pos}`, 
                      date: trx.date, 
                      ref: trx.id, 
                      desc: trx.desc || `Transaction ${trx.id}`,
                      debit_acc: j.pos === 'Debit' ? j.acc.code : '', 
                      credit_acc: j.pos === 'Credit' ? j.acc.code : '', 
                      amount: j.val
                  });
              });
          });
          localStorage.setItem('METALURGI_GL_JOURNALS', JSON.stringify(glEntries));
      }

    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [coaList]);

  useEffect(() => { if (coaList.length > 0) loadTransactions(); }, [loadTransactions, coaList]);

  const getPaymentPartner = (ref: string, defaultPartner: string) => {
      if (!ref || ref === '-') return defaultPartner;
      const trx = transactions.find(t => t.id === ref);
      return trx ? trx.partner : defaultPartner;
  };

  // --- DATA PROCESSING ---
  const processedData = useMemo(() => {
    let data = activeTab === 'payments' ? payments : transactions.filter(t => t.type === activeTab);
    if (activeFilter.value) {
       data = data.filter(item => {
          const col = activeFilter.column;
          let targetValue = col === 'all' ? JSON.stringify(item).toLowerCase() : (item[col] || '').toLowerCase();
          return targetValue.includes(activeFilter.value.toLowerCase());
       });
    }
    if (sortConfig.key) {
      data.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        if (sortConfig.key === 'partner' && activeTab === 'payments') {
            valA = getPaymentPartner(a.ref, a.partner);
            valB = getPaymentPartner(b.ref, b.partner);
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return data;
  }, [transactions, payments, activeTab, activeFilter, sortConfig]);

  const groupedData = useMemo(() => {
     if (groupBy === 'none') return { 'All Data': processedData };
     return processedData.reduce((acc: any, item) => {
        let key = item[groupBy] || 'Others';
        if(groupBy === 'partner' && activeTab === 'payments') {
            key = getPaymentPartner(item.ref, item.partner || 'No Partner');
        }
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
     }, {});
  }, [processedData, groupBy, transactions]);

  // --- SUMMARIES ---
  const summaries = useMemo(() => {
      const prodSum: Record<string, any> = {};
      const partSum: Record<string, any> = {};
      const start = new Date(summaryDateRange.start);
      const end = new Date(summaryDateRange.end);
      end.setHours(23, 59, 59);

      transactions.forEach(t => {
          const tDate = new Date(t.date);
          if (tDate >= start && tDate <= end) {
              if (t.product && t.product !== '-') {
                  if (!prodSum[t.product]) prodSum[t.product] = { name: t.product, salesQty:0, salesVal:0, purQty:0, purVal:0 };
                  if (t.type === 'sales') { prodSum[t.product].salesQty += (t.qty||0); prodSum[t.product].salesVal += (t.amount||0); }
                  else if (t.type === 'purchase') { prodSum[t.product].purQty += (t.qty||0); prodSum[t.product].purVal += (t.amount||0); }
              }
              if (t.partner && t.partner !== '-') {
                  if (!partSum[t.partner]) partSum[t.partner] = { name: t.partner, salesVal:0, purVal:0, expVal:0 };
                  if (t.type === 'sales') { partSum[t.partner].salesVal += (t.amount||0); }
                  else if (t.type === 'purchase') { partSum[t.partner].purVal += (t.amount||0); }
                  else if (t.type === 'expense') { partSum[t.partner].expVal += (t.amount||0); }
              }
          }
      });

      const sortedProd = Object.values(prodSum).sort((a:any, b:any) => {
          if (a[summarySort.key] < b[summarySort.key]) return summarySort.direction === 'asc' ? -1 : 1;
          if (a[summarySort.key] > b[summarySort.key]) return summarySort.direction === 'asc' ? 1 : -1;
          return 0;
      });

      const sortedPart = Object.values(partSum).sort((a:any, b:any) => {
          if (a[summarySort.key] < b[summarySort.key]) return summarySort.direction === 'asc' ? -1 : 1;
          if (a[summarySort.key] > b[summarySort.key]) return summarySort.direction === 'asc' ? 1 : -1;
          return 0;
      });

      return { prod: sortedProd, part: sortedPart };
  }, [transactions, summaryDateRange, summarySort]);

  const totals = useMemo(() => {
    return processedData.reduce((acc, curr) => {
      const due = (curr.amount || 0) - (curr.amountPaid || 0);
      return { amount: acc.amount + (curr.amount || 0), amountDue: acc.amountDue + (due > 0 ? due : 0) };
    }, { amount: 0, amountDue: 0 });
  }, [processedData]);

  const fmtMoney = (n: number) => "Rp " + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const getProductUoM = (productName: string) => productList.find(p => p.Product_Name === productName)?.UoM || 'Pcs';

  // --- HANDLERS ---
  const handleApplyFilter = () => setActiveFilter(draftFilter);
  const handleOpenPrintWizard = (trx: any) => { setSelectedTxForPrint(trx); setPrintWizardOpen(true); setPrintPreviewMode(false); };
  const handleGenerateInvoice = () => { localStorage.setItem('METALURGI_PRINT_CONFIG', JSON.stringify(printConfig)); setPrintPreviewMode(true); };
  const requestSort = (key: string) => { setSortConfig({ key, direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc' }); };
  const requestSummarySort = (key: string) => { setSummarySort({ key, direction: summarySort.key === key && summarySort.direction === 'asc' ? 'desc' : 'asc' }); };

  const handleSaveJournalOverride = () => {
     if (!journalModalData) return;
     const newOverrides = { ...journalOverrides, [journalModalData.trx.id]: journalModalData.journals };
     setJournalOverrides(newOverrides);
     localStorage.setItem('METALURGI_JOURNAL_OVERRIDES', JSON.stringify(newOverrides));
     loadTransactions(); 
     alert("Jurnal Tersimpan & GL Terupdate!");
     setJournalModalData(null);
  };

  const handleUpdateJournalAccount = (index: number, newCode: string) => {
    if (!journalModalData) return;
    // @ts-ignore
    const newAccName = coaList.find(c => c.Account_Code === newCode)?.Account_Name || 'Unknown';
    const updatedJournals = [...journalModalData.journals];
    updatedJournals[index].acc = { code: newCode, name: newAccName };
    setJournalModalData({ ...journalModalData, journals: updatedJournals });
  };

  const handleOpenJournal = (trx: any) => {
      const journals = generateJournal(trx);
      setJournalModalData({ trx, journals });
  };

  const availableInvoices = useMemo(() => {
      if (activeTab !== 'payments') return [];
      const targetType = manualForm.paymentType === 'Payment In' ? 'sales' : 'purchase';
      return transactions.filter(t => t.type === targetType && t.status !== 'Fully Paid');
  }, [transactions, manualForm.paymentType, activeTab]);

  const handleInvoiceSelect = (invId: string) => {
      const inv = availableInvoices.find(t => t.id === invId);
      if (inv) {
          const remaining = inv.amount - (inv.amountPaid || 0);
          setManualForm({
              ...manualForm, refNumber: invId, partner: inv.partner, maxAmount: remaining, price: remaining
          });
      }
  };

  const handlePaymentAmountChange = (val: number) => {
      if (val > manualForm.maxAmount && manualForm.maxAmount > 0) { alert(`Nominal tidak boleh melebihi sisa tagihan (${fmtMoney(manualForm.maxAmount)})`); return; }
      setManualForm({...manualForm, price: val});
  };

  const handleSaveManual = () => {
    const isPayment = activeTab === 'payments';
    
    // Construct Manual Transaction
    const newTx = { 
        uniqueKey: `MANUAL-${Date.now()}`, 
        id: isPayment ? `PAY-MAN-${Date.now().toString().slice(-4)}` : `MAN-${Date.now().toString().slice(-4)}`, 
        date: manualForm.date, 
        ref: isPayment ? manualForm.refNumber : undefined,
        dueDate: manualForm.dueDate, 
        partner: manualForm.partner, 
        product: manualForm.product, 
        type: isPayment ? manualForm.paymentType : activeTab, 
        desc: manualForm.desc || (isPayment ? `Manual ${manualForm.paymentType}` : 'Manual Transaction'), 
        amount: isPayment ? manualForm.price : (manualForm.qty*manualForm.price), 
        qty: manualForm.qty, 
        price: manualForm.price, 
        amountPaid: 0, 
        status: isPayment ? 'Posted' : 'Unpaid',
        sourceAccount: 'Bank BCA' // Explicitly set default source for journal
    };

    const existing = JSON.parse(localStorage.getItem('METALURGI_MANUAL_TRX') || '[]');
    localStorage.setItem('METALURGI_MANUAL_TRX', JSON.stringify([...existing, newTx]));
    
    // Force Refresh / Add to State
    if (isPayment) setPayments(prev => [newTx, ...prev]);
    else setTransactions(prev => [newTx, ...prev]);

    // Update GL Immediately for this new transaction
    if (typeof window !== 'undefined') {
        const glEntries = generateJournal(newTx).map(j => ({
            source: 'Transaction', id: `GL-${newTx.id}-${j.pos}`, date: newTx.date, ref: newTx.id, desc: newTx.desc,
            debit_acc: j.pos === 'Debit' ? j.acc.code : '', credit_acc: j.pos === 'Credit' ? j.acc.code : '', amount: j.val
        }));
        const existingGL = JSON.parse(localStorage.getItem('METALURGI_GL_JOURNALS') || '[]');
        localStorage.setItem('METALURGI_GL_JOURNALS', JSON.stringify([...existingGL, ...glEntries]));
    }

    if (activeTab === 'sales' || activeTab === 'purchase') {
        const moves = JSON.parse(localStorage.getItem('METALURGI_INVENTORY_MOVEMENTS') || '[]');
        moves.push({ id: `MOV-${newTx.id}`, date: newTx.date, type: activeTab==='sales'?'OUT':'IN', sku: manualForm.product, qty: manualForm.qty, ref: newTx.id });
        localStorage.setItem('METALURGI_INVENTORY_MOVEMENTS', JSON.stringify(moves));
    }
    
    setIsNewTxModalOpen(false);
    setManualForm({ partner: '', product: '', date: '', dueDate: '', qty: 1, price: 0, desc: '', refNumber: '', paymentType: 'Payment In', maxAmount: 0 });
  };

  // --- RENDER HELPERS ---
  const SortIcon = ({col}: {col: string}) => (sortConfig.key === col ? (sortConfig.direction === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>) : null);
  const SummarySortIcon = ({col}: {col: string}) => (summarySort.key === col ? (summarySort.direction === 'asc' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>) : null);

  return (
    <div className="space-y-6 pb-20 relative">
      {/* HEADER */}
      <div className="flex justify-between items-center print:hidden">
        <div><h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">Transactions Center {loading && <Loader2 size={16} className="animate-spin text-blue-600"/>}</h1></div>
        <div className="flex gap-2">
           <button onClick={() => setShowProductSummary(true)} className="p-2 border rounded-lg hover:bg-slate-50 text-blue-600 border-blue-200 bg-blue-50 flex items-center gap-2 text-xs font-bold"><TrendingUp size={16}/> Product Summary</button>
           <button onClick={() => setShowPartnerSummary(true)} className="p-2 border rounded-lg hover:bg-slate-50 text-emerald-600 border-emerald-200 bg-emerald-50 flex items-center gap-2 text-xs font-bold"><Users size={16}/> Partner Summary</button>
           <button onClick={loadTransactions} className="p-2 border rounded-lg hover:bg-slate-50 text-slate-600" title="Refresh Sheets"><RefreshCw size={20} className={loading ? 'animate-spin' : ''}/></button>
           <button onClick={() => setIsNewTxModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg shadow-md"><Plus size={16}/> Input Manual</button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><p className="text-slate-500 text-xs font-bold uppercase mb-1">Total Volume</p><h2 className="text-2xl font-bold text-slate-900">{fmtMoney(totals.amount)}</h2></div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><p className="text-slate-500 text-xs font-bold uppercase mb-1">Total Outstanding (Due)</p><h2 className="text-2xl font-bold text-rose-600">{fmtMoney(totals.amountDue)}</h2></div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100"><p className="text-slate-500 text-xs font-bold uppercase mb-1">Collection Rate</p><h2 className="text-2xl font-bold text-emerald-600">{totals.amount > 0 ? Math.round(((totals.amount - totals.amountDue)/totals.amount)*100) : 0}%</h2></div>
      </div>

      {/* MAIN TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:hidden">
        <div className="border-b border-slate-100 px-6 pt-4 bg-slate-50 space-y-4">
           <div className="flex justify-between items-center">
              <div className="flex gap-6">
                {['sales', 'purchase', 'expense', 'payments'].map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab as any)} className={`pb-4 text-sm font-bold capitalize border-b-2 transition-colors ${activeTab === tab ? 'text-blue-600 border-blue-600' : 'text-slate-400 border-transparent'}`}>{tab}</button>
                ))}
              </div>
              <div className="flex items-center gap-2 pb-2">
                 <Layers size={14} className="text-slate-400"/>
                 <span className="text-xs font-bold text-slate-500">Group By:</span>
                 <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)} className="text-xs border-none bg-transparent font-bold text-blue-600 cursor-pointer outline-none focus:ring-0">
                    <option value="none">None</option>
                    <option value="month">Month</option>
                    <option value="partner">Partner</option>
                    <option value="product">Product</option>
                    <option value="status">Status</option>
                    <option value="debit_acc">Debit Account</option>
                    <option value="credit_acc">Credit Account</option>
                 </select>
              </div>
           </div>
           
           {!showFilters && (<button onClick={() => setShowFilters(true)} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-xs font-bold bg-white text-slate-600 mb-4 hover:bg-slate-50"><SlidersHorizontal size={14}/> Show Filters</button>)}

           {showFilters && (
              <div className="flex items-end gap-3 pb-4 animate-in slide-in-from-top-2 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                 <div className="flex-1 grid grid-cols-3 gap-3">
                    <div><label className="text-[10px] uppercase font-bold text-slate-400">Column</label><select className="w-full mt-1 p-2 border rounded text-xs" value={draftFilter.column} onChange={(e) => setDraftFilter({...draftFilter, column: e.target.value})}><option value="all">All Columns</option><option value="partner">Partner</option><option value="product">Product</option><option value="id">ID / Ref</option><option value="status">Status</option></select></div>
                    <div><label className="text-[10px] uppercase font-bold text-slate-400">Value</label><input type="text" className="w-full mt-1 p-2 border rounded text-xs" value={draftFilter.value} onChange={(e) => setDraftFilter({...draftFilter, value: e.target.value})} placeholder="Type value..."/></div>
                 </div>
                 <div className="flex gap-2"><button onClick={handleApplyFilter} className="h-[34px] px-4 bg-blue-600 text-white text-xs font-bold rounded">Apply</button></div>
              </div>
           )}
        </div>

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left text-sm">
             <thead className="bg-white text-slate-500 text-xs uppercase font-bold border-b border-slate-100">
               <tr>
                 <th className="p-4 cursor-pointer" onClick={()=>requestSort('id')}>ID / Ref <SortIcon col='id'/></th>
                 <th className="p-4 cursor-pointer" onClick={()=>requestSort('date')}>Date <SortIcon col='date'/></th>
                 {activeTab === 'payments' && <th className="p-4">Ref Invoice</th>}
                 {activeTab === 'payments' && <th className="p-4 text-center">Type</th>}
                 <th className="p-4 cursor-pointer" onClick={()=>requestSort('partner')}>Partner <SortIcon col='partner'/></th>
                 {activeTab !== 'payments' ? <th className="p-4 cursor-pointer" onClick={()=>requestSort('product')}>Product / Desc <SortIcon col='product'/></th> : <th className="p-4">Description</th>}
                 <th className="p-4 text-center">Status</th>
                 <th className="p-4 text-right cursor-pointer" onClick={()=>requestSort('amount')}>Amount <SortIcon col='amount'/></th>
                 <th className="p-4 text-center">Action</th>
               </tr>
             </thead>
             <tbody className="divide-y divide-slate-50">
               {Object.entries(groupedData).map(([groupKey, items]: any) => {
                  const groupTotalAmount = items.reduce((acc:number, i:any) => acc + i.amount, 0);
                  const calculateFooterColSpan = () => { let cols = 5; if (activeTab === 'payments') cols += 2; return cols; };

                  return (
                  <Fragment key={groupKey}>
                     {groupBy !== 'none' && (<tr className="bg-slate-100"><td colSpan={10} className="p-2 px-4 font-bold text-xs text-slate-600 uppercase tracking-wider">{groupBy}: {groupKey} ({items.length})</td></tr>)}
                     {items.map((row: any) => (
                       <tr key={row.uniqueKey} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 font-mono text-xs font-bold text-slate-700">{row.id}</td>
                          <td className="p-4 text-slate-600 whitespace-nowrap">{row.date}</td>
                          
                          {activeTab === 'payments' && <td className="p-4 font-mono text-xs text-blue-600">{row.ref || '-'}</td>}
                          
                          {activeTab === 'payments' && (
                              <td className="p-4 text-center">
                                  {row.type === 'Payment In' || row.type === 'IN' ? 
                                    <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 w-fit mx-auto"><ArrowDownLeft size={12}/> Masuk</span> :
                                    <span className="bg-rose-100 text-rose-700 px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 w-fit mx-auto"><ArrowUpRight size={12}/> Keluar</span>
                                  }
                              </td>
                          )}

                          <td className="p-4 font-medium text-slate-800">
                              {activeTab === 'payments' ? (row.partner !== '-' ? row.partner : getPaymentPartner(row.ref, '-')) : row.partner}
                          </td>
                          <td className="p-4 text-slate-600 text-xs">{row.product !== '-' ? row.product : row.desc}</td>
                          
                          <td className="p-4 text-center"><span className={`px-2 py-1 rounded text-[10px] font-bold uppercase border ${row.status === 'Fully Paid' || row.status === 'Posted' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>{row.status}</span></td>
                          <td className="p-4 text-right font-bold text-slate-800">{fmtMoney(row.amount)}</td>
                          <td className="p-4 text-center flex gap-1 justify-center">
                              <button onClick={() => handleOpenJournal(row)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-all"><Scale size={16}/></button>
                              {(activeTab === 'sales' || activeTab === 'payments') && <button onClick={() => handleOpenPrintWizard(row)} className="p-2 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded-full transition-all"><Printer size={16}/></button>}
                          </td>
                       </tr>
                     ))}
                     {groupBy !== 'none' && (<tr className="bg-slate-50 border-t font-bold text-xs"><td colSpan={calculateFooterColSpan()} className="p-3 text-right">Total {groupKey}:</td><td className="p-3 text-right">{fmtMoney(groupTotalAmount)}</td><td></td></tr>)}
                  </Fragment>
               )})}
             </tbody>
          </table>
        </div>
      </div>

      {/* --- MODALS (SUMMARY, PRINT, JOURNAL, MANUAL INPUT) KEPT INTACT --- */}
      {/* (Copy pasted relevant modal code from V4.7, ensures all features are present) */}
      
      {showProductSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in zoom-in-95 print:hidden">
              <div className="bg-white rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                  <div className="bg-slate-50 p-5 border-b flex justify-between items-center"><h3 className="font-bold text-lg flex items-center gap-2"><TrendingUp className="text-blue-600"/> Product Performance</h3><button onClick={()=>setShowProductSummary(false)}><X className="text-slate-400 hover:text-slate-700"/></button></div>
                  <div className="p-4 bg-slate-50 border-b flex gap-2 items-center"><input type="date" value={summaryDateRange.start} onChange={e=>setSummaryDateRange({...summaryDateRange, start: e.target.value})} className="text-xs border rounded p-1"/><span>-</span><input type="date" value={summaryDateRange.end} onChange={e=>setSummaryDateRange({...summaryDateRange, end: e.target.value})} className="text-xs border rounded p-1"/></div>
                  <div className="flex-1 overflow-auto p-0">
                      <table className="w-full text-left text-xs">
                          <thead className="bg-white text-slate-500 font-bold sticky top-0 border-b">
                              <tr>
                                  <th className="p-4 cursor-pointer" onClick={()=>requestSummarySort('name')}>Product Name <SummarySortIcon col='name'/></th>
                                  <th className="p-4 text-right cursor-pointer" onClick={()=>requestSummarySort('salesQty')}>Sales Qty <SummarySortIcon col='salesQty'/></th>
                                  <th className="p-4 text-right cursor-pointer" onClick={()=>requestSummarySort('salesVal')}>Sales (Rp) <SummarySortIcon col='salesVal'/></th>
                                  <th className="p-4 text-right cursor-pointer" onClick={()=>requestSummarySort('purQty')}>Purch Qty <SummarySortIcon col='purQty'/></th>
                                  <th className="p-4 text-right cursor-pointer" onClick={()=>requestSummarySort('purVal')}>Purch (Rp) <SummarySortIcon col='purVal'/></th>
                              </tr>
                          </thead>
                          <tbody>{summaries.prod.map((item: any) => (<tr key={item.name} className="hover:bg-slate-50"><td className="p-4 font-bold text-slate-700">{item.name}</td><td className="p-4 text-right">{item.salesQty}</td><td className="p-4 text-right text-emerald-600 font-bold">{fmtMoney(item.salesVal)}</td><td className="p-4 text-right">{item.purQty}</td><td className="p-4 text-right text-rose-600">{fmtMoney(item.purVal)}</td></tr>))}</tbody>
                          <tfoot className="bg-slate-100 font-bold border-t"><tr><td className="p-4">GRAND TOTAL</td><td className="p-4 text-right">{summaries.prod.reduce((a:any,b:any)=>a+b.salesQty,0)}</td><td className="p-4 text-right">{fmtMoney(summaries.prod.reduce((a:any,b:any)=>a+b.salesVal,0))}</td><td className="p-4 text-right">{summaries.prod.reduce((a:any,b:any)=>a+b.purQty,0)}</td><td className="p-4 text-right">{fmtMoney(summaries.prod.reduce((a:any,b:any)=>a+b.purVal,0))}</td></tr></tfoot>
                      </table>
                  </div>
              </div>
          </div>
      )}

      {showPartnerSummary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in zoom-in-95 print:hidden">
              <div className="bg-white rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                  <div className="bg-slate-50 p-5 border-b flex justify-between items-center"><h3 className="font-bold text-lg flex items-center gap-2"><Users className="text-emerald-600"/> Partner/Vendor Summary</h3><button onClick={()=>setShowPartnerSummary(false)}><X className="text-slate-400 hover:text-slate-700"/></button></div>
                  <div className="p-4 bg-slate-50 border-b flex gap-2 items-center"><input type="date" value={summaryDateRange.start} onChange={e=>setSummaryDateRange({...summaryDateRange, start: e.target.value})} className="text-xs border rounded p-1"/><span>-</span><input type="date" value={summaryDateRange.end} onChange={e=>setSummaryDateRange({...summaryDateRange, end: e.target.value})} className="text-xs border rounded p-1"/></div>
                  <div className="flex-1 overflow-auto p-0">
                      <table className="w-full text-left text-xs">
                          <thead className="bg-white text-slate-500 font-bold sticky top-0 border-b">
                              <tr>
                                  <th className="p-4 cursor-pointer" onClick={()=>requestSummarySort('name')}>Partner Name <SummarySortIcon col='name'/></th>
                                  <th className="p-4 text-right cursor-pointer" onClick={()=>requestSummarySort('salesVal')}>Total Sales <SummarySortIcon col='salesVal'/></th>
                                  <th className="p-4 text-right cursor-pointer" onClick={()=>requestSummarySort('purVal')}>Total Purchase <SummarySortIcon col='purVal'/></th>
                                  <th className="p-4 text-right cursor-pointer" onClick={()=>requestSummarySort('expVal')}>Total Expense <SummarySortIcon col='expVal'/></th>
                              </tr>
                          </thead>
                          <tbody>{summaries.part.map((item: any) => (<tr key={item.name} className="hover:bg-slate-50"><td className="p-4 font-bold text-slate-700">{item.name}</td><td className="p-4 text-right text-emerald-600 font-bold">{fmtMoney(item.salesVal)}</td><td className="p-4 text-right text-amber-600">{fmtMoney(item.purVal)}</td><td className="p-4 text-right text-rose-600">{fmtMoney(item.expVal)}</td></tr>))}</tbody>
                          <tfoot className="bg-slate-100 font-bold border-t"><tr><td className="p-4">GRAND TOTAL</td><td className="p-4 text-right">{fmtMoney(summaries.part.reduce((a:any,b:any)=>a+b.salesVal,0))}</td><td className="p-4 text-right">{fmtMoney(summaries.part.reduce((a:any,b:any)=>a+b.purVal,0))}</td><td className="p-4 text-right">{fmtMoney(summaries.part.reduce((a:any,b:any)=>a+b.expVal,0))}</td></tr></tfoot>
                      </table>
                  </div>
              </div>
          </div>
      )}

      {journalModalData && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in zoom-in-95 print:hidden">
           <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
              <div className="bg-slate-50 p-4 border-b flex justify-between items-center"><div><h3 className="font-bold text-slate-800 flex items-center gap-2"><Scale size={18} className="text-blue-600"/> Accounting Journal</h3><p className="text-xs text-slate-500">Review Auto-Generated Entries</p></div><button onClick={() => setJournalModalData(null)}><X size={20} className="text-slate-400 hover:text-slate-700"/></button></div>
              <div className="p-6 bg-slate-50/50">
                 <div className="space-y-2">{journalModalData.journals.map((j: any, i: number) => (<div key={i} className="flex items-center bg-white border border-slate-200 p-2 rounded text-xs shadow-sm"><div className={`w-16 font-bold ${j.pos === 'Debit' ? 'text-emerald-600' : 'text-rose-600'}`}>{j.pos}</div><div className="flex-1 pr-2"><select className="w-full p-1 border border-slate-200 rounded bg-slate-50 text-slate-700 font-medium outline-none focus:border-blue-400" value={j.acc.code} onChange={(e) => handleUpdateJournalAccount(i, e.target.value)}><option value={j.acc.code}>{j.acc.code} - {j.acc.name}</option>{coaList.map((c:any, idx) => (<option key={idx} value={c.Account_Code}>{c.Account_Code} - {c.Account_Name}</option>))}</select></div><div className="w-24 text-right font-mono text-slate-600">{j.pos === 'Debit' ? fmtMoney(j.val) : '-'}</div><div className="w-24 text-right font-mono text-slate-600">{j.pos === 'Credit' ? fmtMoney(j.val) : '-'}</div></div>))}</div>
                 <div className="mt-4 pt-4 border-t border-slate-200 text-center"><button onClick={handleSaveJournalOverride} className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded shadow-lg hover:bg-blue-700">Simpan & Sync ke GL</button></div>
              </div>
           </div>
        </div>
      )}

      {printWizardOpen && selectedTxForPrint && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm p-4 flex items-center justify-center print:hidden">
              {!printPreviewMode ? (
                  <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95">
                      <div className="bg-slate-50 p-5 border-b flex justify-between items-center"><h3 className="font-bold text-lg text-slate-800">Konfigurasi Cetak</h3><button onClick={()=>setPrintWizardOpen(false)}><X className="text-slate-400 hover:text-slate-700"/></button></div>
                      <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto text-sm">
                          <div><label className="block font-bold text-slate-500 mb-1">NPWP Perusahaan</label><input type="text" className="w-full p-2 border rounded" value={printConfig.npwp} onChange={e=>setPrintConfig({...printConfig, npwp:e.target.value})} placeholder="00.000.000.0-000.000"/></div>
                          <div><label className="block font-bold text-slate-500 mb-1">Down Payment (DP)</label><input type="number" className="w-full p-2 border rounded" value={printConfig.dp} onChange={e=>setPrintConfig({...printConfig, dp:parseInt(e.target.value)||0})}/></div>
                          <div className="grid grid-cols-2 gap-2"><div><label className="block font-bold text-slate-500 mb-1">Nama Bank</label><input type="text" className="w-full p-2 border rounded" value={printConfig.bankName} onChange={e=>setPrintConfig({...printConfig, bankName:e.target.value})}/></div><div><label className="block font-bold text-slate-500 mb-1">No Rekening</label><input type="text" className="w-full p-2 border rounded" value={printConfig.bankNo} onChange={e=>setPrintConfig({...printConfig, bankNo:e.target.value})}/></div></div>
                          <div><label className="block font-bold text-slate-500 mb-1">Atas Nama</label><input type="text" className="w-full p-2 border rounded" value={printConfig.bankHolder} onChange={e=>setPrintConfig({...printConfig, bankHolder:e.target.value})}/></div>
                          <div><label className="block font-bold text-slate-500 mb-1">Syarat & Ketentuan</label><textarea rows={3} className="w-full p-2 border rounded" value={printConfig.terms} onChange={e=>setPrintConfig({...printConfig, terms:e.target.value})}></textarea></div>
                          <div><label className="block font-bold text-slate-500 mb-1">Penanda Tangan</label><input type="text" className="w-full p-2 border rounded" value={printConfig.signatory} onChange={e=>setPrintConfig({...printConfig, signatory:e.target.value})} placeholder="Nama Finance Manager"/></div>
                      </div>
                      <div className="p-5 border-t flex justify-end"><button onClick={handleGenerateInvoice} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center gap-2"><FileText size={16}/> Preview Document</button></div>
                  </div>
              ) : (
                  activeTab === 'sales' ? (
                      <div className="bg-white w-[210mm] h-[297mm] shadow-2xl relative p-10 animate-in fade-in overflow-hidden mx-auto my-4 text-slate-800">
                          <div className="absolute top-4 right-4 flex gap-2 print:hidden"><button onClick={()=>window.print()} className="px-4 py-2 bg-blue-600 text-white rounded font-bold shadow flex items-center gap-2"><Printer size={16}/> Print</button><button onClick={()=>setPrintWizardOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded font-bold">Close</button></div>
                          <div className="flex justify-between items-start mb-8"><div className="flex gap-4 items-center">{logoUrl ? <img src={logoUrl} alt="Logo" className="h-20 w-auto object-contain"/> : <div className="h-20 w-20 bg-slate-200 flex items-center justify-center font-bold text-slate-400">LOGO</div>}<div><h2 className="font-bold text-xl uppercase tracking-wider text-slate-900">Metalurgi Indonesia</h2><p className="text-xs text-slate-500">Jalan Raya Industri No 123<br/>Surabaya, Indonesia</p><p className="text-xs text-slate-500 mt-1">Email: info@metalurgi.id</p>{printConfig.npwp && <p className="text-xs text-slate-500">NPWP: {printConfig.npwp}</p>}</div></div><div className="text-right"><h1 className="text-3xl font-bold text-slate-800 mb-1">INVOICE</h1><p className="font-mono text-sm text-slate-600">#{selectedTxForPrint.id}</p></div></div>
                          <div className="grid grid-cols-2 gap-10 mb-8 text-sm"><div><p className="text-xs font-bold text-slate-400 uppercase mb-1">Bill To:</p><p className="font-bold text-lg text-slate-800">{selectedTxForPrint.partner}</p>{(() => {const partnerDetails = partnersList.find(p => p.Name === selectedTxForPrint.partner);return partnerDetails ? (<div className="text-slate-600 text-xs mt-1"><p>{partnerDetails.Address || partnerDetails.Alamat}</p><p>Telp: {partnerDetails.Phone || partnerDetails.No_HP || '-'}</p></div>) : null;})()}</div><div className="text-right space-y-1"><div className="flex justify-between border-b border-slate-100 pb-1"><span>Invoice Date:</span><span className="font-bold">{selectedTxForPrint.date}</span></div>{activeTab==='sales' && <div className="flex justify-between border-b border-slate-100 pb-1 text-rose-600"><span>Due Date:</span><span className="font-bold">{selectedTxForPrint.dueDate}</span></div>}</div></div>
                          <table className="w-full text-left text-sm mb-6 border-collapse"><thead><tr className="bg-slate-800 text-white text-xs uppercase"><th className="py-3 px-4 w-12 text-center">No</th><th className="py-3 px-4">Description</th><th className="py-3 px-4 text-center">Qty</th><th className="py-3 px-4 text-center">Tax</th><th className="py-3 px-4 text-right">Price</th><th className="py-3 px-4 text-right">Total</th></tr></thead><tbody><tr className="border-b border-slate-200"><td className="py-4 px-4 text-center">1</td><td className="py-4 px-4"><p className="font-bold text-slate-800">{selectedTxForPrint.product || 'General Item'}</p><p className="text-xs text-slate-500">{selectedTxForPrint.desc}</p></td><td className="py-4 px-4 text-center whitespace-nowrap">{selectedTxForPrint.qty || 1} {getProductUoM(selectedTxForPrint.product)}</td><td className="py-4 px-4 text-center text-xs text-slate-400">-</td><td className="py-4 px-4 text-right">{fmtMoney(selectedTxForPrint.price || selectedTxForPrint.amount)}</td><td className="py-4 px-4 text-right font-bold">{fmtMoney(selectedTxForPrint.amount)}</td></tr></tbody></table>
                          <div className="flex justify-between items-start mt-8"><div className="w-[50%] text-xs space-y-6"><div className="p-3 bg-slate-50 rounded border border-slate-100"><p className="font-bold text-slate-600 mb-1">Terbilang:</p><p className="italic text-slate-800 leading-relaxed">"{terbilang(selectedTxForPrint.amount - printConfig.dp)} Rupiah"</p></div><div><p className="font-bold text-slate-600 mb-1 border-b border-slate-200 pb-1 w-fit">Instruksi Pembayaran:</p><p className="text-slate-700 mt-1"><span className="font-semibold">{printConfig.bankName}</span> - {printConfig.bankNo}</p><p className="text-slate-700">A/N: {printConfig.bankHolder}</p></div><div><p className="font-bold text-slate-600 mb-1 border-b border-slate-200 pb-1 w-fit">Syarat & Ketentuan:</p><p className="whitespace-pre-line text-slate-500 leading-relaxed">{printConfig.terms}</p></div></div><div className="w-[40%] space-y-2 text-sm"><div className="flex justify-between pt-2"><span>Subtotal</span><span>{fmtMoney(selectedTxForPrint.amount)}</span></div>{printConfig.dp > 0 && <div className="flex justify-between text-rose-600"><span>Down Payment (-)</span><span>{fmtMoney(printConfig.dp)}</span></div>}<div className="flex justify-between text-slate-500"><span>Tax (0%)</span><span>Rp 0</span></div><div className="flex justify-between font-bold text-xl border-t-2 border-slate-800 pt-3 mt-3"><span>TOTAL</span><span>{fmtMoney(selectedTxForPrint.amount - printConfig.dp)}</span></div><div className="mt-16 text-center"><p className="mb-20 text-xs text-slate-500">Hormat Kami,</p><p className="font-bold underline text-slate-800">{printConfig.signatory || '(.........................)'}</p><p className="text-xs text-slate-500">Finance Dept</p></div></div></div>
                      </div>
                  ) : (
                      <div className="bg-white w-[210mm] h-[148mm] shadow-2xl relative p-8 animate-in fade-in overflow-hidden mx-auto my-4 text-slate-800 border-2 border-slate-200">
                          <div className="absolute top-4 right-4 flex gap-2 print:hidden"><button onClick={()=>window.print()} className="px-4 py-2 bg-blue-600 text-white rounded font-bold shadow flex items-center gap-2"><Printer size={16}/> Print</button><button onClick={()=>setPrintWizardOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded font-bold">Close</button></div>
                          <div className="bg-blue-500 text-white p-2 mb-4 text-center font-bold text-lg uppercase tracking-wider">Kwitansi Pembayaran</div>
                          <div className="grid grid-cols-2 gap-4 border border-slate-300"><div className="p-2 border-r border-slate-300 space-y-2 text-sm"><div className="flex"><span className="w-24 font-bold">No.</span><span>: {selectedTxForPrint.id}</span></div><div className="flex"><span className="w-24 font-bold">Tanggal</span><span>: {selectedTxForPrint.date}</span></div><div className="flex"><span className="w-24 font-bold">Terima Dari</span><span>: {selectedTxForPrint.partner || 'Pelanggan Tunai'}</span></div></div><div className="p-2 space-y-2 text-sm"><div className="flex"><span className="w-24 font-bold">Untuk</span><span>: Pembayaran Invoice {selectedTxForPrint.ref || '-'}</span></div><div className="flex"><span className="w-24 font-bold">Keterangan</span><span>: {selectedTxForPrint.desc}</span></div></div></div>
                          <div className="border-x border-b border-slate-300 p-2 text-sm italic bg-slate-50"><span className="font-bold not-italic mr-2">Terbilang:</span> {terbilang(selectedTxForPrint.amount)}</div>
                          <div className="mt-4 grid grid-cols-3 gap-0 border border-slate-300"><div className="p-4 border-r border-slate-300 flex flex-col justify-end"><span className="text-xs text-slate-500 mb-1">Jumlah</span><span className="font-bold text-xl bg-slate-100 p-2 text-center">{fmtMoney(selectedTxForPrint.amount)}</span></div><div className="p-4 border-r border-slate-300 text-center text-xs"><p className="mb-12">Tanda Tangan Penerima</p><p className="font-bold underline">{printConfig.signatory || '(.........................)'}</p></div><div className="p-4 text-center text-xs"><p className="mb-12">Tanda Tangan Penyetor</p><p className="font-bold underline">(.........................)</p></div></div>
                      </div>
                  )
              )}
          </div>
      )}

      {isNewTxModalOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in zoom-in-95 print:hidden">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
                <div className="bg-slate-50 p-5 border-b flex justify-between items-center"><h3 className="font-bold text-lg text-slate-800">Input {activeTab.toUpperCase()} Manual</h3><button onClick={()=>setIsNewTxModalOpen(false)}><X className="text-slate-400 hover:text-slate-700"/></button></div>
                <div className="p-6 space-y-4">
                   {activeTab === 'payments' ? (
                       <>
                       <div className="grid grid-cols-2 gap-4 bg-blue-50 p-4 rounded-xl border border-blue-100 mb-2">
                           <div>
                               <label className="block text-xs font-bold text-slate-500 mb-1">Tipe Payment</label>
                               <select className="w-full p-2 border rounded" onChange={e => setManualForm({...manualForm, paymentType: e.target.value})}>
                                   <option value="Payment In">Payment In (Uang Masuk)</option>
                                   <option value="Payment Out">Payment Out (Uang Keluar)</option>
                               </select>
                           </div>
                           <div>
                               <label className="block text-xs font-bold text-slate-500 mb-1">No. Invoice (Ref)</label>
                               <select className="w-full p-2 border rounded" onChange={e => handleInvoiceSelect(e.target.value)}>
                                   <option value="">Pilih Invoice...</option>
                                   {availableInvoices.map((inv, idx) => (
                                       <option key={idx} value={inv.id}>
                                           {inv.id} - Sisa: {fmtMoney(inv.amount - (inv.amountPaid||0))}
                                       </option>
                                   ))}
                               </select>
                           </div>
                       </div>
                       <div>
                           <label className="block text-xs font-bold text-slate-500 mb-1">Partner / Entity</label>
                           <input type="text" className="w-full p-2 border rounded bg-slate-50" value={manualForm.partner} readOnly placeholder="Otomatis terisi dari Invoice..."/>
                       </div>
                       </>
                   ) : (
                       <div className="grid grid-cols-2 gap-4">
                          <div><label className="block text-xs font-bold text-slate-500 mb-1">Partner</label><select className="w-full p-2 border rounded" onChange={e => setManualForm({...manualForm, partner: e.target.value})}><option value="">Pilih...</option>{partnersList.map((p,i) => <option key={i} value={p.Name}>{p.Name}</option>)}</select></div>
                          <div><label className="block text-xs font-bold text-slate-500 mb-1">Item</label><select className="w-full p-2 border rounded" onChange={e => setManualForm({...manualForm, product: e.target.value})}><option value="">Pilih...</option>{productList.map((p,i) => <option key={i} value={p.Product_Name}>{p.Product_Name}</option>)}</select></div>
                       </div>
                   )}

                   <div className="grid grid-cols-3 gap-4">
                      <div><label className="block text-xs font-bold text-slate-500 mb-1">Tanggal</label><input type="date" className="w-full p-2 border rounded" value={manualForm.date} onChange={e => setManualForm({...manualForm, date: e.target.value})}/></div>
                      {activeTab !== 'payments' && <div><label className="block text-xs font-bold text-slate-500 mb-1">Due Date</label><input type="date" className="w-full p-2 border rounded" value={manualForm.dueDate} onChange={e => setManualForm({...manualForm, dueDate: e.target.value})}/></div>}
                      <div className={activeTab === 'payments' ? 'col-span-2' : ''}><label className="block text-xs font-bold text-slate-500 mb-1">Keterangan</label><input type="text" className="w-full p-2 border rounded" placeholder="Desc..." onChange={e => setManualForm({...manualForm, desc: e.target.value})}/></div>
                   </div>

                   <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      {activeTab !== 'payments' && <div><label className="block text-xs font-bold text-slate-500 mb-1">Qty</label><input type="number" className="w-full p-2 border rounded text-center" value={manualForm.qty} onChange={e => setManualForm({...manualForm, qty: parseInt(e.target.value)||0})}/></div>}
                      <div className={activeTab === 'payments' ? 'col-span-2' : ''}>
                          <label className="block text-xs font-bold text-slate-500 mb-1">Nominal (Rp)</label>
                          <input type="number" className="w-full p-2 border rounded text-right font-bold text-lg" value={manualForm.price} onChange={e => handlePaymentAmountChange(parseInt(e.target.value)||0)}/>
                          {activeTab === 'payments' && manualForm.maxAmount > 0 && <p className="text-[10px] text-rose-500 text-right mt-1">Maksimal: {fmtMoney(manualForm.maxAmount)}</p>}
                      </div>
                   </div>
                </div>
                <div className="p-5 border-t bg-slate-50 flex justify-end gap-3"><button onClick={()=>setIsNewTxModalOpen(false)} className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg">Batal</button><button onClick={handleSaveManual} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg shadow-lg hover:bg-blue-700 flex items-center gap-2"><Save size={16}/> Simpan Lokal</button></div>
            </div>
         </div>
      )}
    </div>
  );
}