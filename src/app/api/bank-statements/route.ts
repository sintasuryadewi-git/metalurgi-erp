import { NextRequest, NextResponse } from 'next/server';
import { getSheetContext } from '@/lib/sheetAuth'; 

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Ambil parameter dengan aman
    const urlSheetId = req.nextUrl.searchParams.get('sheetId');
    const headerSheetId = req.headers.get('x-sheet-id');

    // Minta Satpam membuka akses database
    const { sheets, sheetId: contextSheetId, error } = await getSheetContext(req);

    // Kumpulkan Sheet ID dari mana saja yang berhasil lolos
    const finalSheetId = contextSheetId || headerSheetId || urlSheetId;

    if (!sheets || !finalSheetId) {
      return NextResponse.json({ success: false, error: error || "Database Connection Missing" }, { status: 401 });
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: finalSheetId,
      range: "'Bank_Statements'!A:I", 
    });

    return NextResponse.json({ success: true, data: response.data.values || [] });
  } catch (err: any) {
    console.error("API GET Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authReq = req.clone();
    const body = await req.json();
    const { rows, sheetId: bodySheetId } = body; 

    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, error: "Tidak ada data." }, { status: 400 });
    }

    const { sheets, sheetId: contextSheetId } = await getSheetContext(authReq);
    const finalSheetId = contextSheetId || bodySheetId || req.headers.get('x-sheet-id') || req.nextUrl.searchParams.get('sheetId');

    if (!sheets || !finalSheetId) {
        return NextResponse.json({ success: false, error: "Koneksi Google ditolak." }, { status: 401 });
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: finalSheetId,
      range: "'Bank_Statements'!A:A",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows },
    });

    return NextResponse.json({ success: true, message: `Upload berhasil!` });

  } catch (err: any) {
    console.error("API POST Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}