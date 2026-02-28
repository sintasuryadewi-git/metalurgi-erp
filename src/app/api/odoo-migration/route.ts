import { NextRequest, NextResponse } from 'next/server';
import { getSheetContext } from '@/lib/sheetAuth'; 

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
      const authReq = req.clone();
      const body = await req.json();
      const { rows, sheetId: bodySheetId } = body; 
  
      if (!rows || rows.length === 0) return NextResponse.json({ success: false, error: "Tidak ada data." }, { status: 400 });
  
      const { sheets, sheetId: contextSheetId } = await getSheetContext(authReq);
      const finalSheetId = contextSheetId || bodySheetId || req.headers.get('x-sheet-id');
  
      if (!sheets || !finalSheetId) return NextResponse.json({ success: false, error: "Koneksi ditolak" }, { status: 401 });
  
      const headerRes = await sheets.spreadsheets.values.get({
          spreadsheetId: finalSheetId,
          range: "'Trx_POS'!A1:Z1", 
      });
      
      const headers = headerRes.data.values?.[0] || [];
      if (headers.length === 0) return NextResponse.json({ success: false, error: "Header tidak ditemukan!" }, { status: 400 });
  
      // [FIX] FUNGSI CERDAS: Menghapus spasi, underscore, dan huruf besar agar selalu cocok!
      const normalize = (str: string) => String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
  
      const rowsToAppend = rows.map((obj: any) => {
          // Normalisasi data dari frontend
          const normalizedObj: any = {};
          for (const key in obj) {
              normalizedObj[normalize(key)] = obj[key];
          }
  
          // Cocokkan dengan header di Google Sheets yang sudah dinormalisasi
          return headers.map(header => {
              const normHeader = normalize(header);
              return normalizedObj[normHeader] !== undefined ? normalizedObj[normHeader] : '';
          });
      });
  
      await sheets.spreadsheets.values.append({
        spreadsheetId: finalSheetId,
        range: "'Trx_POS'!A:A",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: rowsToAppend },
      });
  
      return NextResponse.json({ success: true, message: `Berhasil migrasi!` });
  
    } catch (error: any) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }