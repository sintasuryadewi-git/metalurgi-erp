'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
    UploadCloud, FileText, CheckCircle2, Search, Filter,
    ChevronRight, ChevronLeft, ArrowRightLeft, Building2, Receipt,
    Wallet, Loader2, Info, X, Save, FileImage, ShieldAlert,
    History, Calendar, Unlink, FileBox, Plus, Activity, LinkIcon
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { apiClient } from '@/lib/apiClient';

export default function BankRegisterPage() {
    // ==========================================
    // STATE STRUKTUR UI UTAMA
    // ==========================================
    const [mainTab, setMainTab] = useState<'extract' | 'recon' | 'history'>('recon');

    // ==========================================
    // STATE EKSTRAK / UPLOAD
    // ==========================================
    const [stagedFile, setStagedFile] = useState<File | null>(null);
    const [extractBank, setExtractBank] = useState('');
    const [extractDateRange, setExtractDateRange] = useState({ start: '', end: '' });
    const [previewExtract, setPreviewExtract] = useState<any[]>([]);
    const [extractionProgress, setExtractionProgress] = useState(0);
    const [extractionStatus, setExtractionStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
    const [extractionMessage, setExtractionMessage] = useState('');

    // ==========================================
    // STATE DATA GLOBAL
    // ==========================================
    const [statements, setStatements] = useState<any[]>([]);
    const [coaList, setCoaList] = useState<any[]>([]);
    const [inflowTx, setInflowTx] = useState<any[]>([]);
    const [outflowTx, setOutflowTx] = useState<any[]>([]);

    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [scanning, setScanning] = useState(false);

    // ==========================================
    // STATE REKONSILIASI
    // ==========================================
    const [selectedTx, setSelectedTx] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'match' | 'manual'>('match');

    // ✨ FIX 3: Menggunakan Array untuk Multi-Select Match
    const [selectedMatches, setSelectedMatches] = useState<any[]>([]);
    const [smartFilter, setSmartFilter] = useState(true);
    const [searchMatch, setSearchMatch] = useState('');

    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    // ==========================================
    // STATE WIZARD
    // ==========================================
    const [showWizard, setShowWizard] = useState(false);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [wizardData, setWizardData] = useState({ date: '', type: '', debitAcc: '', creditAcc: '', amount: 0, desc: '' });

    const fileInputRef = useRef<HTMLInputElement>(null);

    // ==========================================
    // HELPER: SMART API HEADERS
    // ==========================================
    const getApiHeaders = () => {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (typeof window !== 'undefined') {
            const sheetId = localStorage.getItem('METALURGI_SHEET_ID');
            if (sheetId) headers['x-sheet-id'] = sheetId;
        }
        return headers;
    };

    const getApiPayload = (action: string, payloadData: any) => {
        const base: any = { action, payload: payloadData };
        if (typeof window !== 'undefined') {
            const sheetId = localStorage.getItem('METALURGI_SHEET_ID');
            if (sheetId) base.sheetId = sheetId;
        }
        return JSON.stringify(base);
    };

    // ==========================================
    // HELPERS FORMATTER
    // ==========================================
    const formatTanggalStandard = (val: any) => {
        if (!val) return '';
        let d;
        if (typeof val === 'string' && val.includes('-')) d = new Date(val);
        else if (!isNaN(Number(val))) d = new Date(Math.round((Number(val) - 25569) * 86400 * 1000));
        else return String(val);
        return isNaN(d.getTime()) ? String(val) : d.toISOString().split('T')[0];
    };

    const formatTanggalText = (val: any) => {
        const dStr = formatTanggalStandard(val);
        if (!dStr || dStr === String(val)) return String(val);
        return new Date(dStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    };

    const fmtMoney = (n: number) => "Rp " + Math.abs(n).toLocaleString('id-ID');

    const parseSheetData = (rows: any[], sourceName: string) => {
        if (!rows || rows.length < 2) return [];
        const headers = rows[0].map((h: string) => h?.trim() || '');
        return rows.slice(1).map((row: any) => {
            let obj: any = { _source: sourceName };
            headers.forEach((h: string, i: number) => { if (h) obj[h] = row[i]; });
            return obj;
        });
    };

    // ==========================================
    // FETCH DATA GLOBAL (DIKUNCI ANTI-ERROR)
    // ==========================================
    const fetchData = async () => {
        setLoading(true);
        setFetchError(''); // Reset error
        try {
            const res = await apiClient(`/api/bank-recon`, {
                headers: getApiHeaders(),
                cache: 'no-store'
            });
            const json = await res.json();

            if (json.success && json.data) {
                const rawBs = json.data.bankStatements || [];
                if (rawBs.length > 1) {
                    const parsedBs = rawBs.slice(1).map((r: any) => {
                        const parseMoneySafe = (val: string) => parseFloat(val.replace(/Rp\s?/ig, '').replace(/\./g, '').replace(/,/g, '.')) || 0;

                        const mutIn = parseMoneySafe(String(r[5] || '0'));  // F
                        const mutOut = parseMoneySafe(String(r[6] || '0')); // G

                        return {
                            id: r[0] || '',
                            rawDate: r[1],
                            date: formatTanggalText(r[1]),
                            bank: r[3] || '', // D
                            label: r[4] || '-', // E (Description)
                            amount: mutIn > 0 ? mutIn : Math.abs(mutOut),
                            type: mutIn > 0 ? 'IN' : 'OUT',
                            balance: parseFloat(r[7]) || 0, // H
                            status: r[8] || 'Unreconciled', // I (Recon_Status)
                            linkedId: r[9] || '', // J (Linked_Payment_ID)
                            partner: r[10] || '-', // K (Partner)
                            glRefId: r[11] || '' // L (GL_Ref)
                        };
                    });
                    setStatements(parsedBs.reverse());
                } else {
                    setStatements([]); // Pastikan state bersih jika Sheet kosong
                }

                const rawGl = json.data.trxGL || [];
                if (rawGl.length > 1) {
                    const parsedGl = rawGl.slice(1).map((r: any) => {
                        return {
                            glId: r[0], trxDate: r[1], refId: r[2], desc: r[3], partner: r[4],
                            debit: parseFloat(r[5]) || 0, kredit: parseFloat(r[6]) || 0,
                            total: parseFloat(r[5]) || parseFloat(r[6]) || 0,
                            type: parseFloat(r[5]) > 0 ? 'IN' : 'OUT',
                            status: r[8], jurnalType: r[9]
                        };
                    });
                    setInflowTx(parsedGl.filter((gl: any) => gl.type === 'IN' && gl.status !== 'Reconciled Bank'));
                    setOutflowTx(parsedGl.filter((gl: any) => gl.type === 'OUT' && gl.status !== 'Reconciled Bank'));
                }
                if (json.data.coa) setCoaList(parseSheetData(json.data.coa, 'COA'));
            } else {
                // Tangkap error langsung dari Backend
                setFetchError(json.error || 'Server gagal merespons data yang valid.');
            }
        } catch (err: any) {
            console.error(err);
            setFetchError('Koneksi ke server API gagal/terputus.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);

    const totalPages = Math.ceil(statements.length / itemsPerPage);
    const paginatedStatements = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return statements.slice(start, start + itemsPerPage);
    }, [statements, currentPage]);

    const handleNextPage = () => { if (currentPage < totalPages) setCurrentPage(p => p + 1); };
    const handlePrevPage = () => { if (currentPage > 1) setCurrentPage(p => p - 1); };

    // ==========================================
    // LOGIKA EKSTRAK PDF/FILE
    // ==========================================
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setStagedFile(file);
            setExtractBank('');
            setExtractDateRange({ start: '', end: '' });
            setPreviewExtract([]);
        }
    };

    const processExtraction = async () => {
        if (!stagedFile || !extractBank || !extractDateRange.start || !extractDateRange.end) {
            return alert("Lengkapi Rekening Bank dan Rentang Tanggal terlebih dahulu!");
        }

        setExtractionStatus('processing');
        setExtractionProgress(10);
        setExtractionMessage('Menyiapkan dokumen untuk AI...');

        const fileExt = stagedFile.name.split('.').pop()?.toLowerCase();

        if (['xlsx', 'xls', 'csv'].includes(fileExt || '')) {
            const reader = new FileReader();
            reader.onload = async (evt: any) => {
                try {
                    setExtractionProgress(50);
                    const wb = XLSX.read(evt.target.result, { type: 'binary' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const data = XLSX.utils.sheet_to_json(ws);

                    const extracted = data.map((row: any) => {
                        const mutIn = row.Credit || row['Uang Masuk'] || (row.Amount > 0 ? row.Amount : 0) || 0;
                        const mutOut = row.Debit || row['Uang Keluar'] || (row.Amount < 0 ? Math.abs(row.Amount) : 0) || 0;
                        const tglRaw = row.Date || row.Tanggal || new Date().toISOString().split('T')[0];
                        const tglStd = formatTanggalStandard(tglRaw);

                        return [
                            `BS-${Date.now()}-${Math.floor(Math.random() * 1000)}`, // A
                            tglStd, // B
                            new Date().toISOString().split('T')[0], // C
                            extractBank, // D
                            row.Label || row.Description || row.Deskripsi || '-', // E
                            mutIn, // F
                            mutOut, // G
                            row['Running Balance'] || row.Saldo || 0, // H
                            'Unreconciled', // I
                            '', // J
                            row.Partner || '-', // K
                            '' // L
                        ];
                    }).filter((row: any[]) => row[1] >= extractDateRange.start && row[1] <= extractDateRange.end);

                    setTimeout(() => {
                        setPreviewExtract(extracted);
                        setExtractionProgress(100);
                        setExtractionStatus('success');
                    }, 800);
                } catch (err) {
                    setExtractionStatus('error');
                    setExtractionMessage('Gagal mengekstrak Excel/CSV.');
                }
            };
            reader.readAsBinaryString(stagedFile);
        } else {
            setExtractionProgress(30);
            setExtractionMessage('Mengirim file ke AI Server...');

            const reader = new FileReader();
            reader.onload = async (evt: any) => {
                const base64String = evt.target.result;
                try {
                    setExtractionProgress(60);
                    setExtractionMessage('Menganalisa tabel BCA...');

                    const res = await apiClient('/api/bank-recon', {
                        method: 'POST',
                        headers: getApiHeaders(),
                        body: getApiPayload('EXTRACT_PDF', {
                            fileBase64: base64String,
                            bank: extractBank,
                            startDate: extractDateRange.start,
                            endDate: extractDateRange.end
                        })
                    });

                    const json = await res.json();

                    if (json.success) {
                        setExtractionProgress(90);
                        setTimeout(() => {
                            setPreviewExtract(json.data);
                            setExtractionProgress(100);
                            setExtractionStatus('success');
                        }, 800);
                    } else {
                        setExtractionStatus('error');
                        setExtractionMessage(json.error || 'Server gagal membedah PDF.');
                    }
                } catch (err) {
                    setExtractionStatus('error');
                    setExtractionMessage('Koneksi server terputus.');
                }
            };
            reader.readAsDataURL(stagedFile);
        }
    };

    const handleSaveExtraction = async () => {
        if (previewExtract.length === 0) return;
        setIsSaving(true);
        try {
            const res = await apiClient(`/api/bank-recon`, {
                method: 'POST',
                headers: getApiHeaders(),
                body: getApiPayload('UPLOAD', { rows: previewExtract })
            });
            const json = await res.json();
            if (json.success) {
                alert(`✅ ${previewExtract.length} Mutasi berhasil ditarik!`);
                setStagedFile(null);
                setPreviewExtract([]);
                setExtractBank('');
                setExtractDateRange({ start: '', end: '' });
                setExtractionStatus('idle');
                fetchData();
                setMainTab('recon');
            } else {
                alert("Gagal menyimpan: " + json.error);
            }
        } catch (e) {
            alert("Gagal koneksi server.");
        } finally {
            setIsSaving(false);
        }
    };

    // ==========================================
    // REKONSILIASI & MANUAL JURNAL (MULTI-MATCH)
    // ==========================================

    // ✨ FIX 3: Fungsi Toggle untuk Multi-Select Checkbox
    const toggleMatch = (gl: any) => {
        setSelectedMatches(prev => {
            const isSelected = prev.find(m => m.refId === gl.refId);
            if (isSelected) return prev.filter(m => m.refId !== gl.refId);
            return [...prev, gl];
        });
    };

    const executeMatch = async () => {
        if (!selectedTx || selectedMatches.length === 0) return;
        setIsSaving(true);

        // Gabungkan data dari semua match yang dipilih
        const combinedRefId = selectedMatches.map(m => m.refId).join(', ');
        const combinedPartner = Array.from(new Set(selectedMatches.map(m => m.partner).filter(p => p && p !== '-'))).join(', ') || '-';

        try {
            const res = await apiClient('/api/bank-recon', {
                method: 'POST',
                headers: getApiHeaders(),
                body: getApiPayload('MATCH', {
                    statementId: selectedTx.id,
                    glRefId: combinedRefId,
                    linkedPartner: combinedPartner,
                    idPasangan: combinedRefId
                })
            });
            const json = await res.json();
            if (json.success) {
                alert('✅ Rekonsiliasi Sukses!');
                setSelectedTx(null);
                setSelectedMatches([]);
                setSearchMatch('');
                fetchData();
            } else {
                alert("Gagal Match: " + json.error);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const executeUnreconcile = async () => {
        if (!selectedTx || !confirm("Batalkan tautan?")) return;
        setIsSaving(true);
        try {
            const res = await apiClient('/api/bank-recon', {
                method: 'POST',
                headers: getApiHeaders(),
                body: getApiPayload('UNRECONCILE', { statementId: selectedTx.id })
            });
            const json = await res.json();
            if (json.success) {
                alert('✅ Pembatalan sukses.');
                setSelectedTx(null);
                fetchData();
            } else {
                alert("Gagal Unreconcile: " + json.error);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const openWizard = () => {
        setWizardData({
            date: formatTanggalStandard(selectedTx.rawDate) || new Date().toISOString().split('T')[0],
            type: selectedTx.type,
            debitAcc: selectedTx.type === 'IN' ? '1-1002 - Bank' : '',
            creditAcc: selectedTx.type === 'OUT' ? '1-1002 - Bank' : '',
            amount: Math.abs(selectedTx.amount),
            desc: selectedTx.label
        });
        setShowWizard(true);
    };

    const handleReviewTrigger = () => {
        if (!wizardData.debitAcc || !wizardData.creditAcc) {
            return alert('Pilih Akun Debit dan Kredit!');
        }
        setShowReviewModal(true);
    };

    const executeManualWrite = async () => {
        setIsSaving(true);
        const refGen = `MAN-${Date.now().toString().slice(-6)}`;
        const glData = [[
            refGen, wizardData.date, refGen, wizardData.desc, '-',
            wizardData.amount, 0, 0, 'Reconciled Bank', 'Manual'
        ]];
        const paymentData = [
            wizardData.date, refGen, wizardData.type,
            wizardData.type === 'IN' ? wizardData.creditAcc : wizardData.debitAcc,
            wizardData.amount, wizardData.desc, 'Matched', '-'
        ];

        try {
            const res = await apiClient('/api/bank-recon', {
                method: 'POST',
                headers: getApiHeaders(),
                body: getApiPayload('WRITE_JURNAL', {
                    glData: [glData],
                    paymentData,
                    subLedgerSheetName: 'Bank_Statements',
                    subLedgerId: selectedTx.id,
                    glRefId: refGen
                })
            });
            const json = await res.json();
            if (json.success) {
                setShowReviewModal(false);
                setShowWizard(false);
                setSelectedTx(null);
                alert('✅ Jurnal Manual Sukses!');
                fetchData();
            } else {
                alert("Gagal Write Jurnal: " + json.error);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSaving(false);
        }
    };

    const renderMatchCandidates = () => {
        let candidates = selectedTx?.type === 'IN' ? inflowTx : outflowTx;

        if (searchMatch.trim()) {
            const q = searchMatch.toLowerCase();
            candidates = candidates.filter(tx =>
                (tx.refId && tx.refId.toLowerCase().includes(q)) ||
                (tx.desc && tx.desc.toLowerCase().includes(q)) ||
                (tx.partner && tx.partner.toLowerCase().includes(q)) ||
                (tx.jurnalType && tx.jurnalType.toLowerCase().includes(q))
            );
        }

        if (smartFilter && !searchMatch.trim()) {
            candidates = candidates.filter(tx => formatTanggalStandard(tx.trxDate) === formatTanggalStandard(selectedTx.rawDate));
        }

        // ✨ FIX 3: Perhitungan Total untuk Multi-Match
        const matchAmount = selectedMatches.reduce((sum, m) => sum + parseFloat(m.total || 0), 0);
        const diff = Math.abs(selectedTx.amount - matchAmount);
        const isNominalMatch = selectedMatches.length > 0 && diff < 0.1; // Tolerance for floating point

        return (
            <div className="mt-4 flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

                <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex flex-col gap-3">
                    <div className="flex items-start md:items-center justify-between gap-2 flex-col md:flex-row">
                        <div className="flex items-center gap-2">
                            <Info size={16} className="text-blue-600 flex-shrink-0" />
                            <div>
                                <p className="text-xs font-bold text-blue-800">Daftar Buku Besar ({selectedTx.type === 'IN' ? 'Uang Masuk' : 'Uang Keluar'})</p>
                                <p className="text-[10px] text-blue-600 font-normal">Pilih satu atau beberapa transaksi yang sesuai.</p>
                            </div>
                        </div>
                        <label className="flex items-center gap-2 text-[10px] bg-white px-3 py-1.5 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-100 font-bold text-blue-700">
                            <input
                                type="checkbox"
                                checked={smartFilter}
                                onChange={() => { setSmartFilter(!smartFilter); setSelectedMatches([]); }}
                                className="accent-blue-600"
                            />
                            Tgl Sama Saja
                        </label>
                    </div>
                    <div className="relative w-full">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" />
                        <input
                            type="text"
                            placeholder="Cari ID Jurnal, Nama Partner, Metode, atau Deskripsi..."
                            className="w-full bg-white border border-blue-200 rounded-lg py-2 pl-9 pr-3 text-xs outline-none focus:ring-2 ring-blue-400 font-medium"
                            value={searchMatch}
                            onChange={e => { setSearchMatch(e.target.value); setSelectedMatches([]); }}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto overflow-y-auto max-h-64 custom-scrollbar">
                    <table className="w-full text-xs text-left min-w-[600px]">
                        <thead className="bg-slate-50 text-slate-500 sticky top-0 border-b border-slate-200 z-10 shadow-sm">
                            <tr>
                                <th className="p-3 w-10 text-center">Pilih</th>
                                <th className="p-3">Metode/Jurnal</th>
                                <th className="p-3">Partner & Deskripsi</th>
                                <th className="p-3 text-right">Nominal GL</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {candidates.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="p-8 text-center text-slate-400 font-bold">
                                        Tidak ada transaksi ditemukan. Coba hapus pencarian atau matikan filter tanggal.
                                    </td>
                                </tr>
                            ) : candidates.map((gl, idx) => {
                                // Cek apakah item ini ada di dalam array pilihan
                                const isChecked = selectedMatches.some(m => m.refId === gl.refId);
                                return (
                                    <tr
                                        key={idx}
                                        onClick={() => toggleMatch(gl)}
                                        className={`cursor-pointer transition-colors ${isChecked ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                                    >
                                        <td className="p-3 text-center">
                                            <input type="checkbox" checked={isChecked} readOnly className="w-4 h-4 text-blue-600 accent-blue-600 cursor-pointer rounded" />
                                        </td>
                                        <td className="p-3">
                                            <span className="font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded border border-slate-200 whitespace-nowrap">
                                                {gl.jurnalType}
                                            </span>
                                            <p className="text-[10px] text-slate-400 mt-1">{formatTanggalText(gl.trxDate)}</p>
                                        </td>
                                        <td className="p-3">
                                            <div className="font-bold text-slate-800 flex items-center gap-1.5">
                                                <span className="text-xs text-blue-600 font-black">{gl.refId}</span>
                                            </div>
                                            <div className="text-[11px] text-slate-600 mt-0.5 flex flex-col">
                                                <span className="font-bold text-emerald-600">{gl.partner || '-'}</span>
                                                <span className="truncate max-w-[200px]">{gl.desc}</span>
                                            </div>
                                        </td>
                                        <td className="p-3 text-right font-bold font-mono text-slate-700">
                                            {fmtMoney(gl.total)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-3">
                    <div className="w-full md:w-auto">
                        {selectedMatches.length > 0 && !isNominalMatch && (
                            <p className="text-xs font-bold text-amber-600 flex items-center gap-1.5 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                                <ShieldAlert size={14} /> Terpilih: {fmtMoney(matchAmount)} (Selisih: {fmtMoney(diff)})
                            </p>
                        )}
                        {isNominalMatch && (
                            <p className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200">
                                <CheckCircle2 size={14} /> Nominal Valid. Siap Dijodohkan.
                            </p>
                        )}
                    </div>
                    <div className="flex gap-2 w-full md:w-auto ml-auto">
                        <button
                            onClick={() => { setSelectedTx(null); setSelectedMatches([]); setSearchMatch(''); }}
                            className="px-4 py-2.5 text-slate-500 font-bold hover:bg-white rounded-xl border border-slate-200 transition-colors text-xs w-full md:w-auto shadow-sm"
                        >
                            Batal
                        </button>
                        <button
                            onClick={executeMatch}
                            disabled={!isNominalMatch || isSaving}
                            className="w-full md:w-auto px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-md transition-all text-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <LinkIcon size={16} />}
                            KUNCI PASANGAN (MATCH)
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-[calc(100vh-2rem)] font-sans relative">

            {/* HEADER SECTION */}
            <div className="bg-white px-4 pt-4 border-b border-slate-200 shadow-sm z-10">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="text-lg md:text-xl font-bold text-slate-800 flex items-center gap-2">
                            <Building2 className="text-blue-600" /> Bank Register System
                        </h1>
                        <p className="text-[10px] md:text-xs text-slate-500 mt-0.5">
                            Sub-Ledger Rekonsiliasi Kas & Bank
                        </p>
                    </div>
                    <div className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg flex items-center gap-2 border border-slate-200 shadow-sm">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                        {statements.filter(s => s.status.toLowerCase() === 'unreconciled').length} Butuh Rekonsiliasi
                    </div>
                </div>

                <div className="flex gap-1 overflow-x-auto custom-scrollbar">
                    <button
                        onClick={() => setMainTab('extract')}
                        className={`px-5 py-3 text-xs md:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${mainTab === 'extract' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <UploadCloud size={16} /> 1. Ekstrak Rek. Koran
                    </button>
                    <button
                        onClick={() => setMainTab('recon')}
                        className={`px-5 py-3 text-xs md:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${mainTab === 'recon' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <ArrowRightLeft size={16} /> 2. Biro Jodoh Bank
                    </button>
                    <button
                        onClick={() => setMainTab('history')}
                        className={`px-5 py-3 text-xs md:text-sm font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap ${mainTab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <History size={16} /> 3. Jejak Audit Jurnal
                    </button>
                </div>
            </div>

            {/* OVERLAY SCANNING (OPTIONAL) */}
            {(scanning) && (
                <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex flex-col items-center justify-center text-white">
                    <FileImage size={64} className="mb-4 animate-pulse text-blue-400" />
                    <h2 className="text-2xl font-black mb-2">AI Document Scanner</h2>
                    <p className="text-sm text-slate-200 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Mengekstrak data mutasi dari PDF / Gambar...</p>
                </div>
            )}

            {/* ========================================================= */}
            {/* TAB 1: EKSTRAK MUTASI UPLOAD */}
            {/* ========================================================= */}
            {mainTab === 'extract' && (
                <div className="flex-1 p-4 md:p-6 bg-slate-50 overflow-y-auto">
                    <div className="max-w-3xl mx-auto bg-white p-6 md:p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">

                        {extractionStatus === 'processing' && (
                            <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-8 text-center">
                                <Activity size={48} className="text-blue-500 mb-4 animate-bounce" />
                                <h3 className="text-xl font-black text-slate-800 mb-2">Memproses Dokumen</h3>
                                <p className="text-sm text-slate-500 mb-6">{extractionMessage}</p>
                                <div className="w-full max-w-md bg-slate-100 h-3 rounded-full overflow-hidden shadow-inner">
                                    <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${extractionProgress}%` }}></div>
                                </div>
                            </div>
                        )}

                        {extractionStatus === 'error' && (
                            <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-20 flex flex-col items-center justify-center p-8 text-center">
                                <ShieldAlert size={48} className="text-rose-500 mb-4" />
                                <h3 className="text-xl font-black text-slate-800 mb-2">Ekstraksi Gagal</h3>
                                <p className="text-sm text-slate-500 mb-6 max-w-sm bg-rose-50 p-2 rounded text-rose-700">{extractionMessage}</p>
                                <button onClick={() => setExtractionStatus('idle')} className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg">Coba Ulang</button>
                            </div>
                        )}

                        <h2 className="text-xl md:text-2xl font-black text-slate-800 mb-2">Tarik Data Rekening Koran</h2>
                        <p className="text-xs md:text-sm text-slate-500 mb-8">Unggah dokumen asli Bank Anda dan atur parameter tanggal untuk proses integrasi ke sistem.</p>

                        {!stagedFile ? (
                            <div className="bg-blue-50/50 p-8 rounded-2xl border-2 border-dashed border-blue-200 text-center relative hover:bg-blue-50 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                <UploadCloud className="mx-auto text-blue-400 mb-4 w-12 h-12 md:w-16 md:h-16" />
                                <h3 className="text-base md:text-lg font-bold text-slate-800 mb-2">Klik untuk Memilih File</h3>
                                <p className="text-[10px] md:text-xs text-slate-500 mb-6">Mendukung PDF Asli BCA, CSV, atau Excel (XLSX).</p>
                                <input type="file" accept=".xlsx, .csv, .pdf" className="hidden" ref={fileInputRef} onChange={handleFileSelect} />
                                <button className="px-6 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition-all flex items-center gap-2 mx-auto text-sm">
                                    Browse Files
                                </button>
                            </div>
                        ) : (
                            <div className="animate-in slide-in-from-bottom-4">
                                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-4 rounded-xl mb-6 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <FileBox size={24} className="text-slate-400" />
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">Dokumen Terpilih</p>
                                            <p className="text-sm font-bold text-slate-800 truncate max-w-[200px] md:max-w-xs">{stagedFile.name}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => { setStagedFile(null); setPreviewExtract([]); }} className="text-xs font-bold text-rose-500 hover:bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-100 transition-colors">Ganti File</button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6 p-5 bg-white border border-slate-200 shadow-sm rounded-2xl">
                                    <div>
                                        <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase mb-2">Sumber Bank <span className="text-rose-500">*</span></label>
                                        <select className="w-full p-2.5 md:p-3 border border-slate-300 rounded-xl text-xs md:text-sm bg-slate-50 outline-none font-bold" value={extractBank} onChange={e => setExtractBank(e.target.value)}>
                                            <option value="">-- Pilih Rekening --</option>
                                            <option value="BCA">Bank BCA</option>
                                        </select>
                                    </div>
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                            <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase mb-2">Mulai Tgl <span className="text-rose-500">*</span></label>
                                            <input type="date" className="w-full p-2.5 md:p-3 border border-slate-300 rounded-xl text-xs md:text-sm bg-slate-50 font-bold" value={extractDateRange.start} onChange={e => setExtractDateRange({ ...extractDateRange, start: e.target.value })} />
                                        </div>
                                        <div className="flex-1">
                                            <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase mb-2">Sampai Tgl <span className="text-rose-500">*</span></label>
                                            <input type="date" className="w-full p-2.5 md:p-3 border border-slate-300 rounded-xl text-xs md:text-sm bg-slate-50 font-bold" value={extractDateRange.end} onChange={e => setExtractDateRange({ ...extractDateRange, end: e.target.value })} />
                                        </div>
                                    </div>
                                </div>

                                {previewExtract.length === 0 && (
                                    <button onClick={processExtraction} className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg hover:bg-blue-700 flex justify-center gap-2">
                                        <Activity size={18} /> Mulai Ekstraksi
                                    </button>
                                )}

                                {previewExtract.length > 0 && (
                                    <div className="mt-8 animate-in zoom-in-95">
                                        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4 shadow-sm">
                                            <div>
                                                <p className="text-emerald-800 font-black flex items-center gap-1.5"><CheckCircle2 size={18} /> Selesai!</p>
                                                <p className="text-[10px] md:text-xs text-emerald-600 mt-1">Ditemukan {previewExtract.length} baris mutasi.</p>
                                            </div>
                                            <button onClick={handleSaveExtraction} disabled={isSaving} className="w-full md:w-auto px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl shadow-md hover:bg-emerald-700 flex justify-center items-center gap-2 disabled:opacity-50">
                                                {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Simpan ke Database
                                            </button>
                                        </div>

                                        <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded-xl custom-scrollbar shadow-inner bg-white">
                                            <table className="w-full text-xs text-left min-w-[600px]">
                                                <thead className="bg-slate-100 text-slate-500 sticky top-0 border-b border-slate-200 z-10">
                                                    <tr>
                                                        <th className="p-3">Tgl Bank</th>
                                                        <th className="p-3">Keterangan</th>
                                                        <th className="p-3">Partner</th>
                                                        <th className="p-3 text-right">Mutasi (In/Out)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {previewExtract.map((r, i) => (
                                                        <tr key={i} className="hover:bg-slate-50">
                                                            <td className="p-3 font-mono text-[11px] text-slate-600">{r[1]}</td>
                                                            <td className="p-3 font-bold truncate max-w-[150px]">{r[4]}</td>
                                                            <td className="p-3 text-slate-500">{r[10]}</td>
                                                            <td className="p-3 text-right font-mono font-bold">
                                                                {r[5] > 0 ? (
                                                                    <span className="text-emerald-600">{fmtMoney(r[5])} <span className="text-[9px] ml-1">IN</span></span>
                                                                ) : (
                                                                    <span className="text-rose-600">{fmtMoney(r[6])} <span className="text-[9px] ml-1">OUT</span></span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* TAB 2: REKONSILIASI & BIRO JODOH */}
            {/* ========================================================= */}
            {mainTab === 'recon' && (
                <div className="flex-1 flex overflow-hidden bg-slate-50">
                    {/* PANEL KIRI */}
                    <div className={`w-full ${selectedTx ? 'lg:w-[45%] hidden lg:flex' : 'w-full'} flex-col border-r border-slate-200 bg-white transition-all duration-300 shadow-[2px_0_15px_rgba(0,0,0,0.02)] z-10`}>
                        <div className="p-4 border-b border-slate-100 bg-white z-10 flex justify-between items-center shadow-sm">
                            <div>
                                <h3 className="font-black text-slate-800 text-sm md:text-base">Semua Daftar Mutasi Bank</h3>
                                <p className="text-[10px] text-slate-500 mt-0.5">Daftar seluruh transaksi (Belum maupun Lunas).</p>
                            </div>
                            <div className="text-[10px] font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                                Total: {statements.length} Data
                            </div>
                        </div>

                        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar p-3">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400 min-h-[300px]">
                                    <Loader2 className="animate-spin mb-2" size={24} /> Memuat data mutasi dari Sheet...
                                </div>
                            ) : fetchError ? (
                                <div className="flex flex-col items-center justify-center h-full text-rose-500 min-h-[300px] text-center px-4">
                                    <ShieldAlert size={32} className="mb-2 opacity-50" />
                                    <p className="font-bold text-sm">Gagal Menarik Data</p>
                                    <p className="text-xs mt-1">{fetchError}</p>
                                </div>
                            ) : statements.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-slate-400 min-h-[300px] text-center px-4">
                                    <FileText size={32} className="mb-2 opacity-50" />
                                    <p className="font-bold text-sm">Belum Ada Mutasi</p>
                                    <p className="text-xs mt-1">Silakan ekstrak rekening koran Anda terlebih dahulu di Tab 1.</p>
                                </div>
                            ) : (
                                <table className="w-full text-sm text-left min-w-[350px]">
                                    <tbody className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden block w-full">
                                        {paginatedStatements.map((tx, idx) => {
                                            const isRecon = tx.status.toLowerCase() === 'reconciled';
                                            return (
                                                <tr
                                                    key={`${tx.id}-${idx}`}
                                                    onClick={() => { setSelectedTx(tx); setSelectedMatches([]); setSearchMatch(''); setActiveTab('match'); }}
                                                    className={`cursor-pointer transition-all block w-full ${isRecon ? 'bg-slate-50/70' : 'bg-white hover:bg-blue-50'} ${selectedTx?.id === tx.id ? 'ring-2 ring-blue-500 bg-blue-50 shadow-md relative z-10' : ''}`}
                                                >
                                                    <td className="p-3.5 flex justify-between items-start w-full gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <span className="text-[9px] font-bold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">{tx.bank}</span>
                                                                <p className="font-bold text-[10px] md:text-[11px] text-slate-600 truncate">{tx.date}</p>
                                                                {isRecon && <span className="bg-emerald-100 text-emerald-700 text-[8px] px-1.5 py-0.5 rounded font-black uppercase flex items-center gap-1"><CheckCircle2 size={10} /> Lunas</span>}
                                                            </div>
                                                            <div className={`font-bold line-clamp-2 leading-tight text-[11px] md:text-xs pr-2 ${isRecon ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                                                {tx.label}
                                                            </div>
                                                        </div>
                                                        <div className="text-right flex-shrink-0 flex flex-col justify-start">
                                                            <div className={`font-black font-mono whitespace-nowrap text-xs md:text-sm ${tx.type === 'IN' ? 'text-emerald-600' : 'text-rose-600'} ${isRecon ? 'opacity-50' : ''}`}>
                                                                {fmtMoney(tx.amount)}
                                                            </div>
                                                            <span className={`text-[8px] font-black uppercase mt-1 inline-block text-right ${tx.type === 'IN' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                {tx.type}
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {statements.length > 0 && (
                            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
                                <button onClick={handlePrevPage} disabled={currentPage === 1} className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-100 transition-colors shadow-sm"><ChevronLeft size={16} /></button>
                                <span className="text-[11px] font-bold text-slate-500 bg-slate-200/50 px-3 py-1.5 rounded-lg">Hal {currentPage} dari {totalPages}</span>
                                <button onClick={handleNextPage} disabled={currentPage === totalPages} className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-100 transition-colors shadow-sm"><ChevronRight size={16} /></button>
                            </div>
                        )}
                    </div>

                    {/* PANEL KANAN */}
                    {selectedTx ? (
                        <div className="flex-1 flex flex-col bg-slate-50 overflow-y-auto custom-scrollbar relative p-3 md:p-5">
                            <div className="bg-white p-5 md:p-6 border border-slate-200 shadow-sm rounded-2xl relative overflow-hidden mb-4">
                                <div className={`absolute top-0 left-0 w-2 h-full ${selectedTx.status.toLowerCase() === 'reconciled' ? 'bg-slate-400' : selectedTx.type === 'IN' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                                <div className="pl-2">
                                    <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-3">
                                        <div className="w-full md:w-auto">
                                            <div className="flex gap-2 mb-2 items-center">
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-black tracking-wider inline-block ${selectedTx.type === 'IN' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-rose-100 text-rose-700 border border-rose-200'}`}>
                                                    MUTASI {selectedTx.type}
                                                </span>
                                                <span className="bg-slate-100 text-slate-500 text-[9px] font-bold px-2 py-0.5 rounded border border-slate-200">
                                                    {selectedTx.bank}
                                                </span>
                                            </div>
                                            <h2 className="text-sm md:text-lg font-black leading-tight text-slate-900">
                                                {selectedTx.label}
                                            </h2>
                                        </div>
                                        {/* ✨ FIX 2: Teks Angka Raksasa dipotong agar tidak mendesak UI */}
                                        <div className={`text-xl md:text-2xl font-black tracking-tighter truncate max-w-[200px] md:max-w-[300px] text-right ${selectedTx.type === 'IN' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {fmtMoney(selectedTx.amount)}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                                        <p className="text-slate-500 text-[11px] md:text-xs font-bold flex items-center gap-1.5">
                                            <Calendar size={14} className="text-slate-400" /> {selectedTx.date}
                                        </p>
                                        {selectedTx.partner && selectedTx.partner !== '-' && (
                                            <p className="text-blue-600 text-[11px] md:text-xs font-bold flex items-center gap-1.5">
                                                <Wallet size={14} /> {selectedTx.partner}
                                            </p>
                                        )}
                                    </div>

                                    {selectedTx.status.toLowerCase() === 'reconciled' && (
                                        <div className="mt-4 pt-4 border-t border-slate-100">
                                            <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                                <div>
                                                    <p className="text-xs font-black text-emerald-800 flex items-center gap-1.5 mb-1">
                                                        <CheckCircle2 size={16} /> Rekonsiliasi Balanced!
                                                    </p>
                                                    <p className="text-[10px] text-emerald-600 mt-1">
                                                        ID Tautan GL: <span className="font-mono font-black bg-white border border-emerald-200 px-1.5 py-0.5 rounded ml-1 text-emerald-700">{selectedTx.glRefId}</span>
                                                    </p>
                                                </div>
                                                <button onClick={executeUnreconcile} disabled={isSaving} className="w-full md:w-auto px-4 py-2.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 font-bold rounded-lg flex items-center justify-center gap-2 text-xs shadow-sm disabled:opacity-50">
                                                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />} Batal & Unreconcile
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {selectedTx.status.toLowerCase() !== 'reconciled' && (
                                <div className="flex-1 flex flex-col">
                                    <div className="flex gap-2 border-b border-slate-200 mb-4 px-2">
                                        <button onClick={() => setActiveTab('match')} className={`pb-3 text-xs md:text-sm font-bold flex items-center gap-2 border-b-[3px] transition-colors px-2 ${activeTab === 'match' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                                            <ArrowRightLeft size={16} /> Jodohkan (Match) ke Buku Besar
                                        </button>
                                        <button onClick={() => setActiveTab('manual')} className={`pb-3 text-xs md:text-sm font-bold flex items-center gap-2 border-b-[3px] transition-colors px-2 ${activeTab === 'manual' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                                            <FileText size={16} /> Catat Jurnal Baru
                                        </button>
                                    </div>

                                    {activeTab === 'match' && renderMatchCandidates()}

                                    {activeTab === 'manual' && (
                                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm mt-2 p-8 text-center flex flex-col items-center flex-1 justify-center">
                                            <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-5">
                                                <FileText size={36} className="text-blue-400" />
                                            </div>
                                            <h3 className="text-xl font-black text-slate-800 mb-2">Mutasi Belum Tercatat</h3>
                                            <p className="text-slate-500 text-xs md:text-sm max-w-md mb-8 leading-relaxed">
                                                Gunakan fitur ini untuk mencatat mutasi Bank (Biaya Admin, dll) yang belum pernah diinput.
                                            </p>
                                            <button onClick={openWizard} className="px-8 py-3.5 bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors flex items-center gap-2">
                                                <Plus size={18} /> Buat Jurnal Baru
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-slate-400 bg-slate-100/50 p-6 text-center">
                            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-200 mb-6">
                                <ArrowRightLeft size={48} className="text-slate-300" />
                            </div>
                            <h3 className="text-2xl font-black text-slate-500 mb-2">Biro Jodoh Bank</h3>
                            <p className="text-sm text-slate-400 max-w-xs">Klik mutasi bank di panel kiri untuk mulai mencocokkan dengan Buku Besar.</p>
                        </div>
                    )}
                </div>
            )}

            {/* ========================================================= */}
            {/* TAB 3: HISTORY / ARSIP */}
            {/* ========================================================= */}
            {mainTab === 'history' && (
                <div className="flex-1 p-4 md:p-6 bg-slate-50 overflow-y-auto custom-scrollbar">
                    <div className="max-w-6xl mx-auto bg-white p-5 md:p-8 rounded-3xl border border-slate-200 shadow-sm">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-100 pb-5 mb-5 gap-4">
                            <div>
                                <h2 className="text-xl md:text-2xl font-black text-slate-800">Arsip Jejak Audit (Balanced)</h2>
                                <p className="text-[10px] md:text-xs text-slate-500 mt-1.5 max-w-xl leading-relaxed">
                                    Mutasi rekening bank yang telah memiliki tautan valid (balance) dengan ID Jurnal Buku Besar.
                                </p>
                            </div>
                            <span className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl text-xs md:text-sm font-bold border border-emerald-200 flex items-center gap-2 w-full md:w-auto justify-center shadow-sm">
                                <ShieldAlert size={16} /> {statements.filter(s => s.status.toLowerCase() === 'reconciled').length} Rekonsiliasi Valid
                            </span>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-slate-200 custom-scrollbar shadow-inner bg-slate-50/50">
                            <table className="w-full text-xs md:text-sm text-left min-w-[900px]">
                                <thead className="bg-white text-slate-500 text-[10px] md:text-xs uppercase font-black sticky top-0 border-b border-slate-200 shadow-sm">
                                    <tr>
                                        <th className="p-4 border-r border-slate-100 bg-slate-50"># Tautan Audit GL</th>
                                        <th className="p-4 w-[120px]">Tgl Transaksi</th>
                                        <th className="p-4">Keterangan Mutasi</th>
                                        <th className="p-4">Partner</th>
                                        <th className="p-4 text-center border-l border-slate-100">Tipe</th>
                                        <th className="p-4 text-right">Nilai Balanced</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {statements.filter(s => s.status.toLowerCase() === 'reconciled').length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="p-10 text-center text-slate-400 font-bold text-sm">
                                                Belum ada histori rekonsiliasi yang Balanced.
                                            </td>
                                        </tr>
                                    ) : statements.filter(s => s.status.toLowerCase() === 'reconciled').map((tx, i) => (
                                        <tr key={i} className="hover:bg-blue-50/50 cursor-pointer transition-colors" onClick={() => { setSelectedTx(tx); setMainTab('recon'); }}>
                                            <td className="p-4 font-mono font-black text-blue-600 text-[11px] md:text-xs border-r border-slate-50">
                                                <div className="flex items-center gap-1.5">
                                                    <CheckCircle2 size={14} className="text-emerald-500" />
                                                    <span className="bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">{tx.glRefId}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-slate-500 font-mono text-[10px] md:text-[11px]">
                                                {tx.date}
                                            </td>
                                            <td className="p-4">
                                                <p className="font-bold text-slate-800 text-[11px] md:text-xs line-clamp-2 pr-4">{tx.label}</p>
                                                <span className="text-[9px] md:text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded mt-1.5 inline-block border border-slate-200">{tx.bank}</span>
                                            </td>
                                            <td className="p-4">
                                                <span className="text-[10px] md:text-[11px] font-bold text-blue-600">{tx.partner || '-'}</span>
                                            </td>
                                            <td className="p-4 text-center border-l border-slate-50">
                                                <span className={`px-2 py-1 rounded text-[9px] md:text-[10px] font-black tracking-widest ${tx.type === 'IN' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{tx.type}</span>
                                            </td>
                                            <td className="p-4 text-right font-mono font-black text-slate-700 text-sm md:text-base">
                                                {fmtMoney(tx.amount)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL WIZARD */}
            {/* ========================================================= */}
            {showWizard && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 my-auto border border-slate-200">
                        <div className="bg-blue-600 p-5 text-white flex justify-between items-center shadow-md rounded-t-3xl">
                            <h2 className="font-black text-lg flex items-center gap-2"><FileText size={20} /> Form Jurnal Baru</h2>
                            <button onClick={() => setShowWizard(false)} className="text-blue-200 hover:text-white bg-blue-700 hover:bg-blue-800 p-1.5 rounded-lg transition-colors"><X size={20} /></button>
                        </div>
                        <div className="p-6 md:p-8 space-y-6">
                            <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div className="w-full md:w-auto">
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">Nilai Mutasi ({wizardData.type})</p>
                                    <p className="text-2xl md:text-3xl font-black text-slate-800 tracking-tighter truncate max-w-[200px]">{fmtMoney(wizardData.amount)}</p>
                                </div>
                                <div className="text-left md:text-right w-full md:w-auto">
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1.5">Tanggal Akuntansi</p>
                                    <input type="date" className="w-full md:w-auto p-2 text-xs md:text-sm font-bold border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 ring-blue-400 text-slate-700 shadow-sm" value={wizardData.date} onChange={e => setWizardData({ ...wizardData, date: e.target.value })} />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* ✨ FIX 1: Smart Dropdown (Otomatis deteksi nama kolom) */}
                                <div className="bg-rose-50/50 p-4 rounded-xl border border-rose-100">
                                    <label className="block text-[10px] md:text-xs font-black text-rose-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Activity size={14} /> Akun Debit (DB)</label>
                                    <select className="w-full p-2.5 text-[10px] md:text-xs font-bold border border-rose-200 rounded-lg outline-none focus:ring-2 ring-rose-400 bg-white text-slate-700 shadow-sm" value={wizardData.debitAcc} onChange={e => setWizardData({ ...wizardData, debitAcc: e.target.value })}>
                                        <option value="">-- Pilih COA Debit --</option>
                                        {coaList.map((acc, i) => {
                                            const keys = Object.keys(acc).filter(k => k !== '_source');
                                            const code = acc.Account_Code || acc['Kode Akun'] || acc[keys[0]];
                                            const name = acc.Account_Name || acc['Nama Akun'] || acc[keys[1]];
                                            if (!code) return null;
                                            return <option key={i} value={`${code} - ${name}`}>{code} - {name}</option>;
                                        })}
                                    </select>
                                </div>
                                <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100">
                                    <label className="block text-[10px] md:text-xs font-black text-emerald-600 uppercase tracking-wider mb-2 flex items-center gap-1.5"><Activity size={14} /> Akun Kredit (CR)</label>
                                    <select className="w-full p-2.5 text-[10px] md:text-xs font-bold border border-emerald-200 rounded-lg outline-none focus:ring-2 ring-emerald-400 bg-white text-slate-700 shadow-sm" value={wizardData.creditAcc} onChange={e => setWizardData({ ...wizardData, creditAcc: e.target.value })}>
                                        <option value="">-- Pilih COA Kredit --</option>
                                        {coaList.map((acc, i) => {
                                            const keys = Object.keys(acc).filter(k => k !== '_source');
                                            const code = acc.Account_Code || acc['Kode Akun'] || acc[keys[0]];
                                            const name = acc.Account_Name || acc['Nama Akun'] || acc[keys[1]];
                                            if (!code) return null;
                                            return <option key={i} value={`${code} - ${name}`}>{code} - {name}</option>;
                                        })}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Keterangan Jurnal Buku Besar</label>
                                <input type="text" className="w-full p-3 text-xs md:text-sm font-medium border border-slate-300 rounded-xl outline-none focus:ring-2 ring-blue-400 text-slate-800 shadow-sm" value={wizardData.desc} onChange={e => setWizardData({ ...wizardData, desc: e.target.value })} placeholder="Contoh: Biaya Admin Bank Bulan Januari..." />
                            </div>
                            <div className="pt-4 flex flex-col md:flex-row gap-3">
                                <button onClick={() => setShowWizard(false)} className="w-full md:w-1/3 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors text-xs md:text-sm border border-slate-200">Batalkan</button>
                                <button onClick={handleReviewTrigger} className="w-full md:w-2/3 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200 flex justify-center items-center gap-2 text-xs md:text-sm transition-all"><ChevronRight size={18} /> Review Jurnal Akhir</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================= */}
            {/* MODAL REVIEW */}
            {/* ========================================================= */}
            {showReviewModal && (
                <div className="fixed inset-0 bg-slate-900/85 backdrop-blur-md z-[110] flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 border border-slate-200 my-auto">
                        <div className="bg-slate-900 p-6 md:p-8 text-white flex flex-col items-center text-center relative">
                            <button onClick={() => setShowReviewModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full transition-colors"><X size={16} /></button>
                            <ShieldAlert size={56} className="text-amber-400 mb-4 drop-shadow-[0_0_15px_rgba(251,191,36,0.4)]" />
                            <h2 className="font-black text-xl md:text-2xl mb-1.5 tracking-tight">Tinjauan Jurnal Akhir</h2>
                            <p className="text-[10px] md:text-xs text-slate-400 max-w-xs leading-relaxed">Sistem akan menulis jurnal ini permanen ke Buku Besar.</p>
                        </div>
                        <div className="p-6 md:p-8 space-y-5 bg-slate-50">

                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tanggal Jurnal</span>
                                    <span className="text-xs font-black text-slate-800 bg-slate-100 px-2 py-1 rounded">{formatTanggalText(wizardData.date)}</span>
                                </div>
                                <div className="flex justify-between items-start pt-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Deskripsi Audit</span>
                                    <span className="text-[10px] font-bold text-slate-700 text-right max-w-[200px]">{wizardData.desc}</span>
                                </div>
                            </div>

                            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-rose-50/40">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center font-black text-[10px]">DB</div>
                                        <div>
                                            <p className="text-[9px] font-bold text-rose-500 uppercase tracking-wider">Debit Account</p>
                                            <p className="text-[10px] md:text-xs font-black text-slate-700 truncate w-[130px] md:w-[160px]">{wizardData.debitAcc}</p>
                                        </div>
                                    </div>
                                    <p className="font-mono font-black text-slate-800 text-sm md:text-base truncate max-w-[120px] text-right">{fmtMoney(wizardData.amount)}</p>
                                </div>
                                <div className="p-4 flex justify-between items-center bg-emerald-50/40">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center font-black text-[10px]">CR</div>
                                        <div>
                                            <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">Credit Account</p>
                                            <p className="text-[10px] md:text-xs font-black text-slate-700 truncate w-[130px] md:w-[160px]">{wizardData.creditAcc}</p>
                                        </div>
                                    </div>
                                    <p className="font-mono font-black text-slate-800 text-sm md:text-base truncate max-w-[120px] text-right">{fmtMoney(wizardData.amount)}</p>
                                </div>
                            </div>

                            <div className="pt-4 flex flex-col md:flex-row gap-3">
                                <button onClick={() => setShowReviewModal(false)} className="w-full md:w-1/3 py-3.5 rounded-xl font-bold text-slate-600 bg-white border border-slate-300 hover:bg-slate-50 transition-colors text-xs md:text-sm">Edit</button>
                                <button onClick={executeManualWrite} disabled={isSaving} className="w-full md:w-2/3 py-3.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all disabled:opacity-50 disabled:shadow-none flex justify-center items-center gap-2 text-xs md:text-sm">
                                    {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />} Kunci & Reconcile
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}