import { NextResponse } from 'next/server';
import { getSheetContext } from '@/lib/sheetAuth'; 

export const dynamic = 'force-dynamic'; 

export async function GET(req: Request) {
  const url = new URL(req.url);
  const urlSheetId = url.searchParams.get('sheetId');
  const headerSheetId = req.headers.get('x-sheet-id');

  const { sheets, sheetId: contextSheetId, error } = await getSheetContext(req);
  const finalSheetId = contextSheetId || headerSheetId || urlSheetId;

  // --- [FIX TYPESCRIPT] ---
  // Kita ubah menjadi (!sheets || error) agar TypeScript yakin 'sheets' tidak mungkin null
  if (!sheets || error) {
    return NextResponse.json({ success: false, error: error || "Koneksi Google ditolak" }, { status: 401 });
  }

  if (!finalSheetId) {
    return NextResponse.json({ success: false, error: "Database Connection Missing (No Sheet ID)" }, { status: 401 });
  }

  try {
    const ranges = [
      "'Master_Product'!A:Z",    // 0
      "'Inv_Movement'!A:Z",      // 1
      "'Master_COA'!A:Z",        // 2
      "'Master_Cashier'!A:Z",    // 3
      "'Master_Shift'!A:Z",      // 4
      "'Settings_Receipt'!A:Z",  // 5 
      "'Trx_POS'!A:Z"            // 6 [NEW] Ambil Riwayat Transaksi POS
    ];

    // Karena di atas sudah dipastikan 'sheets' ada, TypeScript tidak akan protes lagi di baris ini
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: finalSheetId, 
      ranges: ranges,
    });

    const valueRanges = response.data.valueRanges;
    
    const parseReceiptConfig = (rows: any[]) => {
        if (!rows || rows.length < 2) return {};
        const headers = rows[0];
        const values = rows[1];
        const config: any = {};
        headers.forEach((header: string, index: number) => {
            config[header.trim()] = values[index] || '';
        });
        return config;
    };

    return NextResponse.json({
      success: true,
      data: {
        products: valueRanges?.[0]?.values || [],
        movements: valueRanges?.[1]?.values || [],
        coa: valueRanges?.[2]?.values || [],
        users: valueRanges?.[3]?.values || [], 
        shifts: valueRanges?.[4]?.values || [],
        receipt: parseReceiptConfig(valueRanges?.[5]?.values || []),
        posHistory: valueRanges?.[6]?.values || [] // Kirim riwayat POS ke Frontend
      }
    });

  } catch (error: any) {
    console.error("API POS Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}