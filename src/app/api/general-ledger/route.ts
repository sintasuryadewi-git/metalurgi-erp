import { NextResponse } from 'next/server';
import { getSheetContext } from '@/lib/sheetAuth'; 

export async function GET(req: Request) {
  const { sheets, sheetId, error } = await getSheetContext(req);

  if (error || !sheets) {
    return NextResponse.json({ success: false, error }, { status: 401 });
  }

  try {
    // TAMBAHKAN INDEX 5: Master_Product
    const ranges = [
      "'Master_COA'!A:Z",            // 0
      "'Trx_Sales_Invoice'!A:Z",     // 1
      "'Trx_Purchase_Invoice'!A:Z",  // 2
      "'Trx_Expense'!A:Z",           // 3
      "'Trx_Payment'!A:Z",           // 4
      "'Master_Product'!A:Z"         // 5 -> PENTING UNTUK HPP
    ];

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId, 
      ranges: ranges,
    });

    const valueRanges = response.data.valueRanges;
    
    return NextResponse.json({
      success: true,
      data: {
        coa: valueRanges?.[0].values || [],
        sales: valueRanges?.[1].values || [],
        purchases: valueRanges?.[2].values || [],
        expenses: valueRanges?.[3].values || [],
        payments: valueRanges?.[4].values || [],
        products: valueRanges?.[5].values || [] // NEW DATA
      }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}