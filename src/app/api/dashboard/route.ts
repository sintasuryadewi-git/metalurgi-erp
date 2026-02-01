import { NextResponse } from 'next/server';
import { getSheetContext } from '@/lib/sheetAuth'; 

export async function GET(req: Request) {
  const { sheets, sheetId, error } = await getSheetContext(req);

  if (error || !sheets) {
    return NextResponse.json({ success: false, error }, { status: 401 });
  }

  try {
    // Kita ambil 6 Data Penting
    const ranges = [
      "'Trx_Sales_Invoice'!A:Z",     // 0: Sales
      "'Trx_Expense'!A:Z",           // 1: Expense
      "'Master_Product'!A:Z",        // 2: Product (Untuk Costing)
      "'Trx_Purchase_Invoice'!A:Z",  // 3: Purchase
      "'Master_COA'!A:Z",            // 4: COA (Untuk Saldo Awal Kas)
      "'Trx_Payment'!A:Z"            // 5: Payment (Arus Kas Server)
    ];

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId, 
      ranges: ranges,
    });

    const valueRanges = response.data.valueRanges;
    
    return NextResponse.json({
      success: true,
      data: {
        sales: valueRanges?.[0].values || [],
        expenses: valueRanges?.[1].values || [],
        products: valueRanges?.[2].values || [],
        purchases: valueRanges?.[3].values || [],
        coa: valueRanges?.[4].values || [],     // NEW
        payments: valueRanges?.[5].values || [] // NEW
      }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}