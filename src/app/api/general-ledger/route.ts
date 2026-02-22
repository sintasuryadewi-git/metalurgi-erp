import { NextResponse } from 'next/server';
import { getSheetContext } from '@/lib/sheetAuth'; 

// [WAJIB ADA] Instruksi agar Next.js tidak mem-cache API ini
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  // Tambahan log untuk memastikan email terbaca oleh server
  const url = new URL(req.url);
  const email = url.searchParams.get('email');

  const { sheets, sheetId, error } = await getSheetContext(req);

  if (error || !sheets || !sheetId) {
    return NextResponse.json({ success: false, error: error || "Database Connection Missing (No Sheet ID)" }, { status: 401 });
  }

  try {
    const ranges = [
      "'General_Ledger'!A:Z",  // 0: Core Data (Jurnal)
      "'Master_COA'!A:Z",      // 1: Master Data (Nama Akun & Saldo Awal)
    ];

    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: sheetId, 
      ranges: ranges,
    });

    const valueRanges = response.data.valueRanges;
    
    return NextResponse.json({
      success: true,
      data: {
        gl: valueRanges?.[0].values || [],
        coa: valueRanges?.[1].values || [],
      }
    });

  } catch (error: any) {
    console.error("API GL Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}