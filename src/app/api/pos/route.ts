import { NextResponse } from 'next/server';
import { getSheetContext } from '@/lib/sheetAuth'; 

export async function GET(req: Request) {
  const { sheets, sheetId, error } = await getSheetContext(req);

  if (error || !sheets) {
    return NextResponse.json({ success: false, error }, { status: 401 });
  }

  try {
    // UPDATE: Menggunakan 'Master_Cashier' sesuai sheet kamu
    const ranges = [
      "'Master_Product'!A:Z",    // 0: Produk
      "'Inv_Movement'!A:Z",      // 1: Stok Server
      "'Master_COA'!A:Z",         // 2: Akun GL
      "'Master_Cashier'!A:Z",     // 3: DATA KASIR (Updated)
      "'Master_Shift'!A:Z"        // 4: DATA SHIFT
    ];

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId, 
      ranges: ranges,
    });

    const valueRanges = response.data.valueRanges;
    
    return NextResponse.json({
      success: true,
      data: {
        products: valueRanges?.[0].values || [],
        movements: valueRanges?.[1].values || [],
        coa: valueRanges?.[2].values || [],
        // Kita tetap namakan 'users' agar frontend tidak perlu diubah banyak
        users: valueRanges?.[3].values || [], 
        shifts: valueRanges?.[4].values || []
      }
    });

  } catch (error: any) {
    console.error("API POS Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}