'use client';

import { useState, useRef, useMemo } from 'react';
import { UploadCloud, Database, Loader2, CheckCircle2, ArrowRight, Package, Banknote } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function OdooMigrationPage() {
  const [uploading, setUploading] = useState(false);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fmtMoney = (n: number) => "Rp " + Math.abs(n).toLocaleString('id-ID');

  const cleanNum = (val: any) => {
      if (val === undefined || val === null || val === '') return 0;
      if (typeof val === 'number') return val;
      const cleaned = String(val).replace(/,/g, '').trim();
      return parseFloat(cleaned) || 0;
  };

  const parseExcelDate = (excelDate: any) => {
      if (!excelDate) return new Date();
      if (typeof excelDate === 'number') {
          const excelEpoch = new Date(1899, 11, 30); 
          const days = Math.floor(excelDate);
          const ms = Math.round((excelDate - days) * 86400000);
          return new Date(excelEpoch.getTime() + days * 86400000 + ms);
      }
      const d = new Date(excelDate);
      return isNaN(d.getTime()) ? new Date() : d;
  };

  const summary = useMemo(() => {
      let totalRevenue = 0;
      let totalItemsQty = 0;

      parsedData.forEach(trx => {
          totalRevenue += (parseFloat(trx.Total_Amount) || 0);
          try {
              // [UPDATE] Menggunakan kunci items_json (pakai 's')
              const items = JSON.parse(trx.items_json || '[]');
              items.forEach((item: any) => {
                  totalItemsQty += (parseFloat(item.qty) || 0);
              });
          } catch (e) {}
      });
      return { totalRevenue, totalItemsQty, totalTrx: parsedData.length };
  }, [parsedData]);

  const handleFileUpload = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    
    reader.onload = async (evt: any) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws);

        let finalRows: any[] = [];
        let currentOrder: any = null;

        rawData.forEach((row: any) => {
           const orderNumRaw = row['Order Number'] || row['Order Number '] || '';
           const dateRaw = row['Date'] || row['Date '] || '';
           const sessionRaw = row['Session'] || row['Session '] || '';

           if (orderNumRaw !== '' || dateRaw !== '') {
               let rawMethod = String(row['Payment Method'] || 'Cash').trim();
               let paymentMethod = rawMethod.toLowerCase() === 'card' ? 'QRIS' : rawMethod;

               const dateObj = parseExcelDate(dateRaw);
               
               const year = dateObj.getFullYear();
               const month = String(dateObj.getMonth() + 1).padStart(2, '0');
               const day = String(dateObj.getDate()).padStart(2, '0');
               const hours = String(dateObj.getHours()).padStart(2, '0');
               const mins = String(dateObj.getMinutes()).padStart(2, '0');
               const secs = String(dateObj.getSeconds()).padStart(2, '0');

               const finalDate = `${year}-${month}-${day}`;
               const finalTime = `${hours}:${mins}:${secs}`;

               const sessionClean = String(sessionRaw).replace('POS/', '');
               const uniqueSuffix = Math.floor(Math.random() * 10000); 
               const orderTotal = cleanNum(row['Total']);
               
               currentOrder = {
                   ID: `ODOO-${sessionClean}-${orderNumRaw}-${uniqueSuffix}`,
                   Date: finalDate, 
                   Timestamp: finalTime, 
                   Cashier: row['Cashier'] || 'Dinda',
                   Payment_Method: paymentMethod,
                   
                   Total_Amount: orderTotal,
                   Amount_Paid: orderTotal, 
                   Change: 0,
                   Shift: sessionRaw || 'Odoo Session',
                   Shift_ID: `SHIFT-${sessionRaw || 'ODOO'}`,
                   
                   // --- [FIX KUNCI KOLOM] ---
                   // Menggunakan nama persis dengan yang ada di Sheet
                   items_json: [], 
                   item_json: [] // Backup jika sheet masih pakai format tanpa 's'
               };
               finalRows.push(currentOrder);
           }

           if (!currentOrder) return; 

           const rawProduct = row['Order Lines/Product'] || row['Product'] || '';
           if (rawProduct) {
               // Memecah "[DRB001] Dawet Rengganis" menjadi SKU & Nama
               const match = rawProduct.match(/\[(.*?)\]\s*(.*)/);
               const sku = match ? match[1] : 'UNKNOWN';
               const name = match ? match[2] : rawProduct;
               const qty = cleanNum(row['Order Quantity']) || 1;
               const price = cleanNum(row['Unit Price']) || 0;

               // --- [FIX STRUKTUR JSON] ---
               // Menambahkan originalPrice agar 100% sama dengan format Metalurgi POS
               const itemObj = { 
                   sku: sku, 
                   name: name, 
                   price: price, 
                   originalPrice: price, // <--- Penambahan ini yang penting!
                   qty: qty, 
                   discount: 0, 
                   isPromo: false 
               };
               
               currentOrder.items_json.push(itemObj);
               currentOrder.item_json.push(itemObj);
           }
        });

        // Mengubah Array (Object) kembali menjadi format Teks/String JSON 
        finalRows = finalRows.map(trx => ({
            ...trx,
            items_json: JSON.stringify(trx.items_json),
            item_json: JSON.stringify(trx.item_json)
        }));

        setParsedData(finalRows);
      } catch (err) {
        alert("Gagal membaca file Odoo. Pastikan formatnya benar.");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handlePushToCloud = async () => {
    if (parsedData.length === 0) return alert("Belum ada data.");
    
    const email = localStorage.getItem('METALURGI_USER_EMAIL') || '';
    const sheetId = localStorage.getItem('METALURGI_SHEET_ID') || '';
    
    if (!sheetId) return alert("Sheet ID tidak ditemukan.");

    setUploading(true);
    try {
        const res = await fetch(`/api/odoo-migration?email=${email}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-sheet-id': sheetId },
          body: JSON.stringify({ sheetId, rows: parsedData })
        });

        const json = await res.json();
        if (json.success) {
            alert(`✅ SUKSES: ${json.message}`);
            setParsedData([]); 
        } else {
            alert(`❌ GAGAL: ${json.error}`);
        }
    } catch (err) {
        alert("Gagal koneksi ke server.");
    } finally {
        setUploading(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto bg-slate-50 min-h-screen">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 mb-2">
            <Database className="text-blue-600"/> Odoo POS Migration Tool
        </h1>
        <p className="text-slate-500 text-sm mb-6">Upload raw export Excel dari Odoo Anda. Otomatis membersihkan koma, meluruskan format tanggal, dan memetakan items_json.</p>
        
        <div className="flex flex-wrap gap-4 mb-8">
            <input type="file" accept=".xlsx, .xls, .csv" className="hidden" ref={fileInputRef} onChange={handleFileUpload}/>
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="px-6 py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 flex items-center gap-2 transition-all shadow-sm">
                {uploading ? <Loader2 size={18} className="animate-spin"/> : <UploadCloud size={18}/>} 
                1. Upload Excel Odoo
            </button>
            
            <button onClick={handlePushToCloud} disabled={uploading || parsedData.length === 0} className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:shadow-none flex items-center gap-2 transition-all shadow-md shadow-emerald-200">
                2. Push ke Database <ArrowRight size={18}/>
            </button>
        </div>

        {parsedData.length > 0 && (
            <div className="border border-emerald-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="bg-emerald-50 border-b border-emerald-100 p-4 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="text-emerald-800 font-bold text-base flex items-center gap-2">
                        <CheckCircle2 size={24}/> {summary.totalTrx} Transaksi Siap Dimigrasi!
                    </div>
                    
                    <div className="flex gap-6 md:gap-10 text-emerald-900">
                        <div className="flex flex-col">
                            <span className="text-emerald-600/80 font-bold text-xs uppercase flex items-center gap-1 mb-1"><Package size={14}/> Total Qty Item</span>
                            <span className="text-2xl font-black font-mono leading-none">{summary.totalItemsQty}</span>
                        </div>
                        <div className="w-px bg-emerald-200"></div>
                        <div className="flex flex-col">
                            <span className="text-emerald-600/80 font-bold text-xs uppercase flex items-center gap-1 mb-1"><Banknote size={14}/> Total Payment (Rp)</span>
                            <span className="text-2xl font-black font-mono leading-none">{fmtMoney(summary.totalRevenue)}</span>
                        </div>
                    </div>
                </div>

                <div className="max-h-96 overflow-auto custom-scrollbar">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-white text-slate-500 sticky top-0 border-b shadow-sm z-10 uppercase">
                            <tr>
                                <th className="p-4">ID Baru</th>
                                <th className="p-4">Tanggal (Tepat)</th>
                                <th className="p-4">Kasir</th>
                                <th className="p-4 text-center">Item Qty</th>
                                <th className="p-4 text-right">Total Amount</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {parsedData.map((d, i) => {
                                let qtyPerTrx = 0;
                                try {
                                    // Sudah menyesuaikan dengan kunci items_json
                                    const items = JSON.parse(d.items_json);
                                    qtyPerTrx = items.reduce((acc: number, item: any) => acc + (parseFloat(item.qty) || 0), 0);
                                } catch(e){}

                                return (
                                <tr key={i} className="hover:bg-emerald-50/30 transition-colors">
                                    <td className="p-4 font-mono font-bold text-slate-700">{d.ID}</td>
                                    <td className="p-4 text-slate-500">
                                        <div>{d.Date}</div>
                                        <div className="text-blue-500">{d.Timestamp}</div>
                                    </td>
                                    <td className="p-4 font-medium">{d.Cashier}</td>
                                    <td className="p-4 text-center font-bold">{qtyPerTrx}</td>
                                    <td className="p-4 font-mono font-bold text-right text-slate-900">{fmtMoney(d.Total_Amount)}</td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
      </div>
    </div>
  );
}