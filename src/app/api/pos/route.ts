import { NextResponse } from 'next/server';
import { getSheetContext } from '@/lib/sheetAuth'; 

export async function GET(req: Request) {
  const { sheets, sheetId, error } = await getSheetContext(req);

  if (error || !sheets) {
    return NextResponse.json({ success: false, error }, { status: 401 });
  }

  try {
    const ranges = [
      "'Master_Product'!A:Z",    // 0
      "'Inv_Movement'!A:Z",      // 1
      "'Master_COA'!A:Z",        // 2
      "'Master_Cashier'!A:Z",    // 3
      "'Master_Shift'!A:Z",      // 4
      "'Settings_Receipt'!A:Z"   // 5 [NEW] - Ambil Config Struk
    ];

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId, 
      ranges: ranges,
    });

    const valueRanges = response.data.valueRanges;
    
    // Helper untuk mengubah array of arrays menjadi object
    // Contoh: [['Store_Name', 'Address'], ['Toko A', 'Jl. B']] -> { Store_Name: 'Toko A', Address: 'Jl. B' }
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
        products: valueRanges?.[0].values || [],
        movements: valueRanges?.[1].values || [],
        coa: valueRanges?.[2].values || [],
        users: valueRanges?.[3].values || [], 
        shifts: valueRanges?.[4].values || [],
        receipt: parseReceiptConfig(valueRanges?.[5].values || []) // [NEW] Parse Config
      }
    });

  } catch (error: any) {
    console.error("API POS Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}