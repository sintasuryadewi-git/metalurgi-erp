import { NextResponse } from 'next/server';
import { getSheetContext } from '@/lib/sheetAuth'; 

export async function GET(req: Request) {
  const { sheets, sheetId, error } = await getSheetContext(req);

  if (error || !sheets) {
    return NextResponse.json({ success: false, error }, { status: 401 });
  }

  try {
    // KITA TARIK 7 SHEET SEKALIGUS (Batch Get)
    const ranges = [
      // --- TRANSACTION DATA (Index 0-3) ---
      "'Trx_Sales_Invoice'!A:Z",     // 0
      "'Trx_Purchase_Invoice'!A:Z",  // 1
      "'Trx_Expense'!A:Z",           // 2
      "'Trx_Payment'!A:Z",           // 3
      
      // --- MASTER DATA (Index 4-6) ---
      "'Master_Partner'!A:Z",        // 4
      "'Master_Product'!A:Z",        // 5
      "'Master_COA'!A:Z"             // 6
    ];

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId, 
      ranges: ranges,
    });

    const valueRanges = response.data.valueRanges;
    
    return NextResponse.json({
      success: true,
      data: {
        // Mapping sesuai urutan index ranges di atas
        sales: valueRanges?.[0].values || [],
        purchases: valueRanges?.[1].values || [],
        expenses: valueRanges?.[2].values || [],
        payments: valueRanges?.[3].values || [],
        
        partners: valueRanges?.[4].values || [],
        products: valueRanges?.[5].values || [],
        coa: valueRanges?.[6].values || []
      }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}