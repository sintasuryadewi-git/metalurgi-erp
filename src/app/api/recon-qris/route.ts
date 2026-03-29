import { NextResponse } from 'next/server';
// 1. IMPORT SANG SATPAM (Sama seperti di POS)
import { getSheetContext } from '@/lib/sheetAuth'; 

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        // 2. MINTA KUNCI DARI SATPAM
        const { sheets, sheetId: contextSheetId, error } = await getSheetContext(req);
        
        if (!sheets || error) {
            return NextResponse.json({ success: false, error: error || "Koneksi Google ditolak Auth" }, { status: 401 });
        }

        const url = new URL(req.url);
        const headerSheetId = req.headers.get('x-sheet-id');
        const urlSheetId = url.searchParams.get('sheetId');
        
        const finalSheetId = contextSheetId || headerSheetId || urlSheetId;

        if (!finalSheetId) {
            return NextResponse.json({ success: false, error: 'Sheet ID tidak ditemukan.' }, { status: 401 });
        }
        
        // Membaca data Recon_QRIS menggunakan koneksi yang sudah disahkan
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: finalSheetId,
            range: 'Recon_QRIS!A:F',
        });

        return NextResponse.json({ success: true, data: response.data.values || [] });
    } catch (error: any) {
        console.error("GET Recon QRIS Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        // MINTA KUNCI UNTUK POST (SIMPAN DATA)
        const { sheets, sheetId: contextSheetId, error } = await getSheetContext(req);
        
        if (!sheets || error) {
            return NextResponse.json({ success: false, error: error || "Koneksi Google ditolak Auth" }, { status: 401 });
        }

        const body = await req.json();
        const headerSheetId = req.headers.get('x-sheet-id');
        const finalSheetId = contextSheetId || headerSheetId || body.sheetId;
        
        const { tanggal, inAmount, cairAmount, selisih, keterangan } = body;

        if (!finalSheetId) {
            return NextResponse.json({ success: false, error: 'Sheet ID tidak ditemukan.' });
        }
        if (!tanggal) {
            return NextResponse.json({ success: false, error: 'Tanggal wajib diisi.' });
        }
        
        // Cek baris yang sudah ada
        const existing = await sheets.spreadsheets.values.get({
            spreadsheetId: finalSheetId,
            range: 'Recon_QRIS!A:A', 
        });

        const rows = existing.data.values || [];
        let rowIndex = -1;

        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === tanggal) {
                rowIndex = i + 1; 
                break;
            }
        }

        const timestamp = new Date().toISOString();
        const rowData = [[tanggal, inAmount, cairAmount, selisih, keterangan || '', timestamp]];

        if (rowIndex > -1) {
            // Update
            await sheets.spreadsheets.values.update({
                spreadsheetId: finalSheetId,
                range: `Recon_QRIS!A${rowIndex}:F${rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: rowData },
            });
        } else {
            // Insert Baru
            await sheets.spreadsheets.values.append({
                spreadsheetId: finalSheetId,
                range: 'Recon_QRIS!A:F',
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: rowData },
            });
        }

        return NextResponse.json({ success: true, message: `Rekonsiliasi tanggal ${tanggal} berhasil disimpan!` });
    } catch (error: any) {
        console.error("POST Recon QRIS Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}