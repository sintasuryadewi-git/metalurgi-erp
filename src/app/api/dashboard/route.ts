import { NextResponse } from 'next/server';
import { getSheetContext } from '@/lib/sheetAuth'; 

export async function GET(req: Request) {
  const { sheets, sheetId, error } = await getSheetContext(req);

  if (error || !sheets) {
    return NextResponse.json({ success: false, error }, { status: 401 });
  }

  try {
    // [REVISI] Mengambil Data dari Sumber Baru (POS & GL)
    const ranges = [
      "'Trx_POS'!A:Z",            // 0: Log Transaksi POS (Pengganti Sales Invoice Lama)
      "'General_Ledger'!A:Z",     // 1: [BARU] Jurnal Akuntansi (Pusat Data Keuangan)
      "'Trx_Expense'!A:Z",        // 2: Pengeluaran Operasional
      "'Master_Product'!A:Z",     // 3: Master Produk (Untuk Cek HPP/Cost)
      "'Master_COA'!A:Z",         // 4: Saldo Awal Akun
      "'Trx_Purchase_Invoice'!A:Z"// 5: Pembelian Stok (Menambah Nilai Aset Inventory)
    ];

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId, 
      ranges: ranges,
    });

    const valueRanges = response.data.valueRanges;
    
    return NextResponse.json({
      success: true,
      data: {
        // Mapping Data ke Frontend
        sales: valueRanges?.[0].values || [],    // Data POS (Detail Item)
        gl: valueRanges?.[1].values || [],       // Data GL (Keuangan Real) -> Kunci Dashboard
        expenses: valueRanges?.[2].values || [], // Biaya Operasional
        products: valueRanges?.[3].values || [], // Info Produk
        coa: valueRanges?.[4].values || [],      // Saldo Awal
        purchases: valueRanges?.[5].values || [] // Data Pembelian
      }
    });

  } catch (error: any) {
    console.error("Dashboard API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}