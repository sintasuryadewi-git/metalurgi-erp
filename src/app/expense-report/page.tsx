'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { apiClient } from '@/lib/apiClient';
import {
    Receipt, Building2, Wallet, Search, Filter,
    ChevronRight, ChevronLeft, Loader2, CheckCircle2,
    AlertCircle, FileText, PieChart, X, ShieldAlert,
    Calendar, LayoutList, List, ArrowLeft, BarChart3,
    Tags, UserCheck, Scale, UploadCloud, Activity, Save, LinkIcon, Unlink, Plus
} from 'lucide-react';
import * as XLSX from 'xlsx';

export default function ExpenseReportPage() {
    const [expenses, setExpenses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState('');

    // STATE FILTER & SEARCH
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
    const [activeQuickFilter, setActiveQuickFilter] = useState('all');
    const [selectedCostCenter, setSelectedCostCenter] = useState('Semua');

    // STATE VIEW MODE & SELECTION
    const [viewMode, setViewMode] = useState<'list' | 'macro_summary' | 'time_summary'>('macro_summary');
    const [selectedTx, setSelectedTx] = useState<any>(null);

    // STATE MOBILE RESPONSIVE
    const [showMobileDetail, setShowMobileDetail] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    // Hapus getApiHeaders karena apiClient sudah meng-handle itu otomatis
    const getApiPayload = (action: string, payloadData: any) => {
        const base: any = { action, payload: payloadData };
        if (typeof window !== 'undefined') {
            const sheetId = localStorage.getItem('METALURGI_SHEET_ID');
            if (sheetId) base.sheetId = sheetId;
        }
        return JSON.stringify(base);
    };

    const fmtMoney = (n: number) => "Rp " + Math.abs(n).toLocaleString('id-ID');

    // ==========================================
    // FETCH DATA GLOBAL MENGGUNAKAN apiClient
    // ==========================================
    const fetchData = async () => {
        setLoading(true);
        setFetchError('');
        try {
            // ✨ FIX: Menggunakan apiClient
            const res = await apiClient(`/api/expense-report`, { cache: 'no-store' });
            const json = await res.json();

            if (json.success) {
                const enrichedData = (json.data || []).map((tx: any) => {
                    const catLower = (tx.expenseCategory || '').toLowerCase();
                    const descLower = (tx.desc || '').toLowerCase();

                    let macro = 'OPEX (Biaya Operasional)';
                    if (catLower.includes('hpp') || catLower.includes('pokok') || descLower.includes('bahan')) macro = 'COGS (Harga Pokok)';
                    if (catLower.includes('aset') || catLower.includes('inventaris')) macro = 'CAPEX (Aset Modal)';
                    if (catLower.includes('pajak') || catLower.includes('bunga')) macro = 'Non-Operational';

                    let behavior = 'Variable Cost';
                    if (catLower.includes('sewa') || catLower.includes('gaji') || catLower.includes('internet') || catLower.includes('langganan')) behavior = 'Fixed Cost';

                    let center = 'HO - Pusat';
                    if (descLower.includes('shopee') || descLower.includes('iklan') || descLower.includes('marketing')) center = 'MKT - Pemasaran';
                    if (descLower.includes('pabrik') || descLower.includes('produksi')) center = 'PRD - Produksi';

                    const isTaxable = !catLower.includes('gaji') && !catLower.includes('bank');
                    const gross = tx.amount;
                    const tax = isTaxable ? Math.round(gross * (11 / 111)) : 0;
                    const net = gross - tax;

                    return {
                        ...tx,
                        macroCategory: tx.macroCategory || macro,
                        costBehavior: tx.costBehavior || behavior,
                        costCenter: tx.costCenter || center,
                        amountGross: gross,
                        amountTax: tx.amountTax || tax,
                        amountNet: tx.amountNet || net,
                        approvedBy: tx.approvedBy || 'Sinta S. Dewi (Auto)',
                    };
                });
                setExpenses(enrichedData);
            } else {
                setFetchError(json.error || 'Server gagal merespons data yang valid.');
            }
        } catch (err: any) {
            setFetchError('Koneksi ke server API gagal/terputus.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    // ==========================================
    // LOGIKA SMART QUICK FILTER TANGGAL
    // ==========================================
    const applyQuickFilter = (preset: string) => {
        setActiveQuickFilter(preset);
        setCurrentPage(1);

        if (preset === 'all') return setDateFilter({ start: '', end: '' });

        const today = new Date();
        const fmtDate = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };

        let start = new Date(today);
        let end = new Date(today);

        switch (preset) {
            case 'today': break;
            case 'yesterday':
                start.setDate(today.getDate() - 1); end.setDate(today.getDate() - 1); break;
            case 'this_week':
                const day = today.getDay();
                const diffToMonday = today.getDate() - day + (day === 0 ? -6 : 1);
                start.setDate(diffToMonday); break;
            case 'last_week':
                const lastWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
                const lwDay = lastWeek.getDay();
                start = new Date(lastWeek.getFullYear(), lastWeek.getMonth(), lastWeek.getDate() - lwDay + (lwDay === 0 ? -6 : 1));
                end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6); break;
            case 'this_month':
                start = new Date(today.getFullYear(), today.getMonth(), 1); break;
            case 'last_month':
                start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                end = new Date(today.getFullYear(), today.getMonth(), 0); break;
            case 'this_year':
                start = new Date(today.getFullYear(), 0, 1); break;
            case 'last_year':
                start = new Date(today.getFullYear() - 1, 0, 1);
                end = new Date(today.getFullYear() - 1, 11, 31); break;
        }
        setDateFilter({ start: fmtDate(start), end: fmtDate(end) });
    };

    // ==========================================
    // DATA PROCESSING & FILTERING UTAMA
    // ==========================================
    const filteredExpenses = useMemo(() => {
        return expenses.filter(tx => {
            const matchSearch = tx.refId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                tx.desc.toLowerCase().includes(searchTerm.toLowerCase()) ||
                tx.expenseCategory.toLowerCase().includes(searchTerm.toLowerCase());

            const matchCenter = selectedCostCenter === 'Semua' || tx.costCenter === selectedCostCenter;

            let matchDate = true;
            if (dateFilter.start || dateFilter.end) {
                const txDate = new Date(tx.date);
                txDate.setHours(0, 0, 0, 0);
                if (dateFilter.start) {
                    const start = new Date(dateFilter.start); start.setHours(0, 0, 0, 0);
                    matchDate = matchDate && txDate >= start;
                }
                if (dateFilter.end) {
                    const end = new Date(dateFilter.end); end.setHours(0, 0, 0, 0);
                    matchDate = matchDate && txDate <= end;
                }
            }
            return matchSearch && matchCenter && matchDate;
        });
    }, [expenses, searchTerm, dateFilter, selectedCostCenter]);

    // ==========================================
    // GROUPING: BIG PICTURE (MACRO & BEHAVIOR)
    // ==========================================
    const pieColors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

    const macroSummary = useMemo(() => {
        const grouped = filteredExpenses.reduce((acc, tx) => {
            const cat = tx.macroCategory;
            if (!acc[cat]) acc[cat] = 0;
            acc[cat] += tx.amountGross;
            return acc;
        }, {} as Record<string, number>);

        let colorIndex = 0;
        return Object.entries(grouped).map(([category, amount]) => ({
            category, amount: Number(amount), color: pieColors[colorIndex++ % pieColors.length]
        })).sort((a, b) => b.amount - a.amount);
    }, [filteredExpenses]);

    // DAFTAR UNIK COST CENTER UNTUK DROPDOWN
    const uniqueCostCenters = useMemo(() => {
        const centers = new Set(expenses.map(tx => tx.costCenter));
        return ['Semua', ...Array.from(centers)];
    }, [expenses]);

    // ==========================================
    // GROUPING: REKAP WAKTU (BULAN/TAHUN)
    // ==========================================
    const summaryByTime = useMemo(() => {
        const grouped = filteredExpenses.reduce((acc, tx) => {
            if (!tx.date) return acc;
            const d = new Date(tx.date);
            const monthYear = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
            const sortKey = `${d.getFullYear()}${String(d.getMonth()).padStart(2, '0')}`;

            if (!acc[sortKey]) acc[sortKey] = { label: monthYear, amount: 0, count: 0, fixed: 0, variable: 0, bankAmount: 0, reconciledCount: 0 };
            acc[sortKey].amount += tx.amountGross;
            acc[sortKey].count += 1;

            if (tx.costBehavior === 'Fixed Cost') acc[sortKey].fixed += tx.amountGross;
            else acc[sortKey].variable += tx.amountGross;

            if (tx.paymentMethod?.toLowerCase().includes('bank')) acc[sortKey].bankAmount += tx.amountGross;
            if (tx.isBankReconciled) acc[sortKey].reconciledCount += 1;

            return acc;
        }, {} as Record<string, any>);

        return Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map(key => grouped[key]);
    }, [filteredExpenses]);

    // PERHITUNGAN METRIK KEUANGAN
    const totalGross = filteredExpenses.reduce((sum, tx) => sum + tx.amountGross, 0);
    const totalTax = filteredExpenses.reduce((sum, tx) => sum + tx.amountTax, 0);
    const totalNet = filteredExpenses.reduce((sum, tx) => sum + tx.amountNet, 0);
    const totalFixed = filteredExpenses.filter(tx => tx.costBehavior === 'Fixed Cost').reduce((sum, tx) => sum + tx.amountGross, 0);
    const totalVariable = totalGross - totalFixed;

    // PAGINATION UNTUK LIST VIEW
    const totalPages = Math.ceil(filteredExpenses.length / itemsPerPage);
    const paginatedExpenses = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredExpenses.slice(start, start + itemsPerPage);
    }, [filteredExpenses, currentPage]);

    const handleNextPage = () => { if (currentPage < totalPages) setCurrentPage(p => p + 1); };
    const handlePrevPage = () => { if (currentPage > 1) setCurrentPage(p => p - 1); };

    const handleSelectTx = (tx: any) => {
        setSelectedTx(tx);
        setShowMobileDetail(true);
    };

    // LOGIKA PEMBUATAN DONUT CHART CSS
    const getConicGradient = (data: any[], total: number) => {
        let cumulativePercent = 0;
        const stops = data.map(item => {
            const percent = total > 0 ? (item.amount / total) * 100 : 0;
            const stop = `${item.color} ${cumulativePercent}% ${cumulativePercent + percent}%`;
            cumulativePercent += percent;
            return stop;
        });
        return `conic-gradient(${stops.join(', ')})`;
    };

    return (
        <div className="flex flex-col h-[calc(100vh-2rem)] font-sans relative bg-slate-50">

            {/* HEADER & FINANCIAL METRICS */}
            <div className="bg-white px-4 md:px-6 pt-5 pb-5 border-b border-slate-200 shadow-sm z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
                <div>
                    <h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">
                        <Scale className="text-rose-500" /> Financial Control
                    </h1>
                    <p className="text-xs md:text-sm text-slate-500 mt-1">
                        Analisis Arus Kas Keluar (Cost Composition & Compliance).
                    </p>
                </div>

                <div className="flex gap-2 w-full md:w-auto overflow-x-auto custom-scrollbar pb-1 md:pb-0">
                    <div className="bg-rose-50 border border-rose-100 px-4 py-2 rounded-xl flex flex-col items-end min-w-[140px] shrink-0">
                        <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest whitespace-nowrap">Gross (Total Keluar)</p>
                        <p className="font-mono font-black text-rose-700 text-base md:text-lg">{fmtMoney(totalGross)}</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl flex flex-col items-end min-w-[120px] shrink-0">
                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Estimasi Pajak</p>
                        <p className="font-mono font-black text-amber-700 text-sm md:text-base">{fmtMoney(totalTax)}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl flex flex-col items-end min-w-[120px] shrink-0">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Biaya Netto</p>
                        <p className="font-mono font-black text-slate-700 text-sm md:text-base">{fmtMoney(totalNet)}</p>
                    </div>
                </div>
            </div>

            {/* TOOLBAR FILTER & SEARCH */}
            <div className="bg-white px-4 md:px-6 py-3 border-b border-slate-200 z-10 flex flex-col gap-3 shrink-0">

                {/* BARIS 1: SMART QUICK FILTERS & COST CENTER */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-2 md:pb-0 w-full md:w-auto">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0 mr-1">Filter Waktu:</span>
                        {[
                            { id: 'all', label: 'Semua' }, { id: 'this_month', label: 'Bulan Ini' },
                            { id: 'last_month', label: 'Bulan Lalu' }, { id: 'this_year', label: 'Tahun Ini' }
                        ].map(preset => (
                            <button
                                key={preset.id} onClick={() => applyQuickFilter(preset.id)}
                                className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] md:text-xs font-bold transition-colors ${activeQuickFilter === preset.id ? 'bg-slate-800 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200'}`}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 w-full md:w-auto bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                        <Building2 size={14} className="text-slate-400 ml-1" />
                        <select
                            className="bg-transparent text-xs font-bold text-slate-700 outline-none w-full py-1 cursor-pointer"
                            value={selectedCostCenter}
                            onChange={(e) => { setSelectedCostCenter(e.target.value); setCurrentPage(1); }}
                        >
                            {uniqueCostCenters.map((cc, i) => <option key={i} value={cc}>{cc === 'Semua' ? 'Semua Cost Center' : cc}</option>)}
                        </select>
                    </div>
                </div>

                {/* BARIS 2: SEARCH & VIEW TOGGLE */}
                <div className="flex flex-col md:flex-row gap-3 items-center">
                    <div className="relative w-full md:flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Cari Ref ID, Deskripsi, atau Kategori COA..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-lg py-2 pl-9 pr-3 text-xs outline-none focus:ring-2 ring-rose-400 font-medium"
                            value={searchTerm}
                            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        />
                    </div>

                    <div className="flex w-full md:w-auto items-center gap-2 bg-slate-50 border border-slate-200 p-1 rounded-lg shrink-0">
                        <input type="date" className="bg-transparent text-xs outline-none font-bold text-slate-600 px-1" value={dateFilter.start} onChange={e => { setDateFilter({ ...dateFilter, start: e.target.value }); setActiveQuickFilter('custom'); setCurrentPage(1); }} />
                        <span className="text-slate-300 font-bold">-</span>
                        <input type="date" className="bg-transparent text-xs outline-none font-bold text-slate-600 px-1" value={dateFilter.end} onChange={e => { setDateFilter({ ...dateFilter, end: e.target.value }); setActiveQuickFilter('custom'); setCurrentPage(1); }} />
                    </div>

                    {/* Toggle Tampilan */}
                    <div className="flex w-full md:w-auto bg-slate-200 p-1 rounded-lg border border-slate-300 shrink-0">
                        <button
                            onClick={() => { setViewMode('macro_summary'); setSelectedTx(null); setShowMobileDetail(false); }}
                            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${viewMode === 'macro_summary' ? 'bg-white shadow-sm text-rose-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <PieChart size={14} /> Komposisi
                        </button>
                        <button
                            onClick={() => { setViewMode('time_summary'); setSelectedTx(null); setShowMobileDetail(false); }}
                            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${viewMode === 'time_summary' ? 'bg-white shadow-sm text-rose-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <BarChart3 size={14} /> Tren Waktu
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-rose-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <List size={14} /> Riwayat
                        </button>
                    </div>
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="flex-1 flex overflow-hidden">

                {/* PANEL KIRI: DAFTAR TRANSAKSI, REKAP KOMPOSISI, ATAU REKAP WAKTU */}
                <div className={`w-full ${selectedTx && showMobileDetail ? 'hidden lg:flex' : 'flex'} ${viewMode === 'list' ? 'lg:w-[55%]' : 'w-full'} flex-col border-r border-slate-200 bg-white shadow-sm z-10`}>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400"><Loader2 className="animate-spin mb-2" size={24} /> Memuat data...</div>
                    ) : fetchError ? (
                        <div className="flex flex-col items-center justify-center h-full text-rose-500 text-center px-4"><AlertCircle size={32} className="mb-2 opacity-50" /><p className="font-bold text-sm">Gagal Menarik Data</p><p className="text-xs mt-1">{fetchError}</p></div>
                    ) : viewMode === 'macro_summary' ? (

                        <div className="flex-1 overflow-auto custom-scrollbar p-4 md:p-8 bg-slate-50/50">
                            <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-8 items-start">

                                {macroSummary.length > 0 && (
                                    <div className="w-full md:w-1/3 flex flex-col gap-4 shrink-0">
                                        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center">
                                            <h3 className="font-black text-slate-700 text-center mb-6">Struktur Makro (Gross)</h3>
                                            <div className="relative w-48 h-48 rounded-full shadow-inner flex items-center justify-center transition-all duration-1000" style={{ background: getConicGradient(macroSummary, totalGross) }}>
                                                <div className="w-32 h-32 bg-white rounded-full flex flex-col items-center justify-center shadow-lg text-center z-10 p-2">
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</p>
                                                    <p className="text-base font-black text-rose-600 truncate w-full">{fmtMoney(totalGross).replace('Rp ', '')}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                                            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Cost Behavior</h3>
                                            <div className="space-y-3">
                                                <div>
                                                    <div className="flex justify-between text-xs font-bold mb-1"><span className="text-slate-700">Fixed Cost</span><span className="text-blue-600">{totalGross > 0 ? Math.round((totalFixed / totalGross) * 100) : 0}%</span></div>
                                                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div className="bg-blue-500 h-full" style={{ width: `${totalGross > 0 ? (totalFixed / totalGross) * 100 : 0}%` }}></div></div>
                                                    <p className="text-[10px] text-slate-400 font-mono mt-1">{fmtMoney(totalFixed)}</p>
                                                </div>
                                                <div>
                                                    <div className="flex justify-between text-xs font-bold mb-1"><span className="text-slate-700">Variable Cost</span><span className="text-amber-500">{totalGross > 0 ? Math.round((totalVariable / totalGross) * 100) : 0}%</span></div>
                                                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden"><div className="bg-amber-400 h-full" style={{ width: `${totalGross > 0 ? (totalVariable / totalGross) * 100 : 0}%` }}></div></div>
                                                    <p className="text-[10px] text-slate-400 font-mono mt-1">{fmtMoney(totalVariable)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="w-full md:w-2/3">
                                    <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2"><LayoutList className="text-blue-500" /> Rincian Makro Kategori</h2>
                                    {macroSummary.length === 0 ? (
                                        <div className="p-8 text-center text-slate-400 font-bold bg-white rounded-2xl border border-slate-200">Tidak ada pengeluaran pada periode ini.</div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-3">
                                            {macroSummary.map((item, idx) => {
                                                const percentage = totalGross > 0 ? (item.amount / totalGross) * 100 : 0;
                                                return (
                                                    <div key={idx} className="bg-white p-4 md:p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4">
                                                        <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: item.color }}></div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex justify-between items-start mb-2">
                                                                <p className="font-black text-slate-800 text-xs md:text-sm truncate pr-4">{item.category}</p>
                                                                <p className="font-mono font-black text-slate-700 text-sm md:text-base whitespace-nowrap">{fmtMoney(item.amount)}</p>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                                                                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${percentage}%`, backgroundColor: item.color }}></div>
                                                                </div>
                                                                <span className="text-[10px] font-bold text-slate-500 w-10 text-right">{percentage.toFixed(1)}%</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                    ) : viewMode === 'time_summary' ? (

                        <div className="flex-1 overflow-auto custom-scrollbar p-4 md:p-6 bg-slate-50/50">
                            <div className="max-w-5xl mx-auto">
                                <h2 className="text-lg font-black text-slate-800 mb-1 flex items-center gap-2">
                                    <BarChart3 className="text-rose-500" /> Tren Pengeluaran per Periode
                                </h2>
                                <p className="text-xs text-slate-400 mb-5">Analisis kesehatan biaya bulanan — tren, rasio Fixed/Variable, dan status kepatuhan.</p>
                                {summaryByTime.length === 0 ? (
                                    <div className="p-8 text-center text-slate-400 font-bold bg-white rounded-2xl border border-slate-200">Tidak ada data untuk ditampilkan.</div>
                                ) : (
                                    <div className="flex flex-col gap-4">
                                        {summaryByTime.map((item, idx) => {
                                            const prev = summaryByTime[idx + 1];
                                            const momChange = prev && prev.amount > 0 ? ((item.amount - prev.amount) / prev.amount) * 100 : null;
                                            const isUp = momChange !== null && momChange > 0;
                                            const fixPct = item.amount > 0 ? Math.round((item.fixed / item.amount) * 100) : 0;

                                            return (
                                                <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                                    <div className="flex items-center gap-4 w-full md:w-auto">
                                                        <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
                                                            <Calendar size={20} className="text-rose-500" />
                                                        </div>
                                                        <div>
                                                            <p className="font-black text-slate-800 text-base md:text-lg capitalize">{item.label}</p>
                                                            <div className="flex items-center gap-3 mt-1">
                                                                <span className="bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded text-[10px]">{item.count} Transaksi</span>
                                                                <span className="text-[10px] font-bold text-blue-600 border border-blue-200 bg-blue-50 px-2 py-0.5 rounded">{fixPct}% Fixed Cost</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-col items-end w-full md:w-auto border-t md:border-t-0 border-slate-100 pt-3 md:pt-0">
                                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Gross</p>
                                                        <div className="flex items-center gap-3">
                                                            {momChange !== null && (
                                                                <span className={`flex items-center gap-0.5 text-xs font-black ${isUp ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                                    {isUp ? '▲' : '▼'} {Math.abs(momChange).toFixed(1)}%
                                                                </span>
                                                            )}
                                                            <p className="font-mono font-black text-rose-600 text-xl md:text-2xl">{fmtMoney(item.amount)}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                    ) : (

                        <>
                            <div className="flex-1 overflow-auto custom-scrollbar relative">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-black sticky top-0 border-b border-slate-200 z-10 shadow-sm">
                                        <tr>
                                            <th className="p-4 w-[120px]">Ref ID & Tgl</th>
                                            <th className="p-4">Keterangan & Pusat Biaya</th>
                                            <th className="p-4 hidden md:table-cell">Kategori Makro</th>
                                            <th className="p-4 text-right">Nominal (Gross)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {paginatedExpenses.length === 0 ? (
                                            <tr><td colSpan={4} className="p-10 text-center text-slate-400 font-bold text-sm">Tidak ada data pengeluaran ditemukan.</td></tr>
                                        ) : paginatedExpenses.map((tx, idx) => (
                                            <tr
                                                key={idx}
                                                onClick={() => handleSelectTx(tx)}
                                                className={`cursor-pointer transition-colors ${selectedTx?.refId === tx.refId ? 'bg-rose-50 ring-1 ring-rose-300' : 'hover:bg-slate-50'}`}
                                            >
                                                <td className="p-4">
                                                    <p className="font-bold text-rose-600 text-xs">{tx.refId}</p>
                                                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">{tx.date}</p>
                                                </td>
                                                <td className="p-4">
                                                    <p className="font-bold text-slate-800 text-xs line-clamp-1 mb-1">{tx.desc}</p>
                                                    <div className="flex gap-2 items-center flex-wrap">
                                                        <span className="bg-slate-100 border border-slate-200 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                                                            <Building2 size={10} /> {tx.costCenter}
                                                        </span>
                                                        {tx.costBehavior === 'Fixed Cost' && <span className="bg-blue-50 text-blue-600 border border-blue-200 text-[9px] font-black px-1.5 py-0.5 rounded">FIXED</span>}
                                                    </div>
                                                </td>
                                                <td className="p-4 hidden md:table-cell">
                                                    <span className={`px-2 py-1 rounded-md text-[9px] font-black tracking-widest ${tx.macroCategory.includes('COGS') ? 'bg-orange-100 text-orange-700 border border-orange-200' : tx.macroCategory.includes('CAPEX') ? 'bg-purple-100 text-purple-700 border border-purple-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                                                        {tx.macroCategory.split(' ')[0]}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="font-black font-mono text-slate-800 text-sm">{fmtMoney(tx.amountGross)}</div>
                                                    <span className="text-[9px] font-black text-slate-400 mt-1 flex items-center justify-end gap-1">
                                                        <UserCheck size={10} /> {tx.approvedBy.split(' ')[0]}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {filteredExpenses.length > 0 && (
                                <div className="p-3.5 bg-white border-t border-slate-200 flex justify-between items-center z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
                                    <button onClick={handlePrevPage} disabled={currentPage === 1} className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-100 transition-colors"><ChevronLeft size={16} /></button>
                                    <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg">Hal {currentPage} dari {totalPages || 1}</span>
                                    <button onClick={handleNextPage} disabled={currentPage >= totalPages} className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-100 transition-colors"><ChevronRight size={16} /></button>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* PANEL KANAN: DETAIL, OTORISASI, PAJAK, & JEJAK AUDIT */}
                {selectedTx && viewMode === 'list' && (
                    <div className={`flex-1 flex-col bg-slate-50 overflow-y-auto custom-scrollbar p-4 md:p-6 ${!showMobileDetail ? 'hidden lg:flex' : 'flex w-full absolute inset-0 z-50 lg:relative lg:z-auto lg:w-auto'}`}>

                        <div className="lg:hidden mb-4 flex items-center gap-2">
                            <button onClick={() => setShowMobileDetail(false)} className="p-2 bg-white rounded-lg border border-slate-200 shadow-sm text-slate-600 flex items-center gap-2 text-xs font-bold hover:bg-rose-50 hover:text-rose-600">
                                <ArrowLeft size={16} /> Kembali ke Daftar
                            </button>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-5 shrink-0">
                            <div className="bg-rose-50 border-b border-rose-100 p-5 flex justify-between items-start">
                                <div>
                                    <span className="px-2 py-1 rounded text-[9px] font-black tracking-widest bg-rose-200 text-rose-800 mb-2 inline-block mr-2">{selectedTx.paymentMethod.toUpperCase()} OUT</span>
                                    <span className={`px-2 py-1 rounded text-[9px] font-black tracking-widest mb-2 inline-block border ${selectedTx.costBehavior === 'Fixed Cost' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>{selectedTx.costBehavior.toUpperCase()}</span>
                                    <h2 className="text-base md:text-lg font-black text-slate-900 leading-tight pr-4 mt-1">{selectedTx.desc}</h2>
                                    <p className="text-xs font-bold text-rose-600 mt-1.5">{selectedTx.refId}</p>
                                </div>
                                <button onClick={() => { setSelectedTx(null); setShowMobileDetail(false); }} className="p-2 bg-white rounded-full hover:bg-rose-100 text-rose-500 hidden lg:block shadow-sm border border-rose-100"><X size={16} /></button>
                            </div>

                            <div className="p-4 bg-slate-50 border-b border-slate-100 flex gap-4">
                                <div className="flex-1">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Cost Center (Pusat Biaya)</p>
                                    <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><Building2 size={12} className="text-slate-400" /> {selectedTx.costCenter}</p>
                                </div>
                                <div className="flex-1">
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tanggal</p>
                                    <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5"><Calendar size={12} className="text-slate-400" /> {selectedTx.date}</p>
                                </div>
                            </div>
                        </div>

                        <h3 className="font-black text-slate-800 text-sm mb-3 flex items-center gap-2 shrink-0"><Tags size={16} className="text-blue-500" /> Rincian Pajak & Otorisasi</h3>
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6 flex flex-col md:flex-row gap-5">
                            <div className="flex-1 space-y-3 border-b md:border-b-0 md:border-r border-slate-100 pb-4 md:pb-0 md:pr-4">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-slate-500">Nilai Netto (DPP)</span>
                                    <span className="font-mono font-bold text-slate-700">{fmtMoney(selectedTx.amountNet)}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="font-bold text-amber-500">Estimasi Pajak</span>
                                    <span className="font-mono font-bold text-amber-600">{fmtMoney(selectedTx.amountTax)}</span>
                                </div>
                                <div className="flex justify-between items-center pt-2 border-t border-slate-100 border-dashed">
                                    <span className="font-black text-slate-800 text-sm">TOTAL GROSS</span>
                                    <span className="font-mono font-black text-rose-600 text-lg">{fmtMoney(selectedTx.amountGross)}</span>
                                </div>
                            </div>
                            <div className="flex-1 flex flex-col justify-center">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5"><UserCheck size={12} /> Otorisasi Oleh</p>
                                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-black text-xs">SD</div>
                                    <div>
                                        <p className="text-xs font-black text-slate-800">{selectedTx.approvedBy}</p>
                                        <p className="text-[9px] text-emerald-600 font-bold mt-0.5 flex items-center gap-1"><CheckCircle2 size={10} /> Verified Approval</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <h3 className="font-black text-slate-800 text-sm mb-3 flex items-center gap-2 shrink-0"><ShieldAlert size={16} className="text-blue-500" /> Jejak Audit Akuntansi (3-Way Match)</h3>
                        <div className="space-y-3 pb-6">
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start md:items-center gap-4 flex-col md:flex-row">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${selectedTx.isBalanced ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                                    {selectedTx.isBalanced ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                                </div>
                                <div className="flex-1 w-full">
                                    <p className="text-xs font-bold text-slate-800">Jurnal Buku Besar (General Ledger)</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
                                        {selectedTx.isBalanced
                                            ? `Valid. Terdapat ${selectedTx.glCount} baris jurnal berpasangan (Double-Entry Balanced).`
                                            : `Peringatan! Jurnal tidak seimbang atau belum di-posting ke Buku Besar.`}
                                    </p>
                                </div>
                            </div>

                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start md:items-center gap-4 flex-col md:flex-row">
                                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                    <PieChart size={20} />
                                </div>
                                <div className="flex-1 w-full overflow-hidden">
                                    <p className="text-xs font-bold text-slate-800">Kategori Pembebanan Biaya (Debit)</p>
                                    <p className="text-[11px] font-bold text-blue-600 mt-0.5 truncate">{selectedTx.expenseCategory}</p>
                                </div>
                            </div>

                            {selectedTx.paymentMethod.toLowerCase().includes('bank') ? (
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start md:items-center gap-4 flex-col md:flex-row">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${selectedTx.isBankReconciled ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                                        {selectedTx.isBankReconciled ? <CheckCircle2 size={20} /> : <Loader2 size={20} className="animate-spin" />}
                                    </div>
                                    <div className="flex-1 w-full">
                                        <p className="text-xs font-bold text-slate-800">Rekonsiliasi Mutasi Bank</p>
                                        {selectedTx.isBankReconciled ? (
                                            <div className="text-[10px] text-emerald-600 mt-1 font-bold flex items-center gap-1.5 flex-wrap">
                                                Cocok dengan ID: <span className="font-mono bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-emerald-700">{selectedTx.bankStatementId}</span>
                                            </div>
                                        ) : (
                                            <p className="text-[10px] text-amber-600 mt-1 font-bold leading-relaxed">
                                                Masih In-Transit. Menunggu konfirmasi aliran uang dari mutasi Bank Register.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 border-dashed flex items-center justify-center text-center">
                                    <p className="text-xs font-bold text-slate-400">Pembayaran Tunai (Cash). Tidak butuh rekonsiliasi mutasi Bank.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {!selectedTx && viewMode === 'list' && (
                    <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-slate-400 bg-slate-100/50 p-6 text-center">
                        <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-200 mb-6">
                            <Receipt size={48} className="text-slate-300" />
                        </div>
                        <h3 className="text-2xl font-black text-slate-500 mb-2">Audit Pengeluaran</h3>
                        <p className="text-sm text-slate-400 max-w-sm">Klik salah satu transaksi pengeluaran di sebelah kiri untuk melihat detail otorisasi, pajak, dan rekonsiliasinya.</p>
                    </div>
                )}

            </div>
        </div>
    );
}