import { NextResponse } from 'next/server';
import { getSheetContext } from '@/lib/sheetAuth'; 

export async function GET(req: Request) {
  const { sheets, sheetId, error } = await getSheetContext(req);

  if (error || !sheets) {
    return NextResponse.json({ success: false, error }, { status: 401 });
  }

  try {
    // We need 4 distinct data sources for the Inventory Page
    const ranges = [
      "'Master_Product'!A:Z",           // 0: For SKU, Name, Cost, Initial Stock
      "'Inv_Movement'!A:Z",             // 1: For Historical Movements
      "'Master_COA'!A:Z",               // 2: For Account Names (Journal View)
      "'Settings_Account_Mapping'!A:Z"  // 3: For GL Mapping Config
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
        mapping: valueRanges?.[3].values || []
      }
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}