import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getSheetContext } from '@/lib/sheetAuth'; // Menggunakan auth yang sudah ada

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { sheets, error } = await getSheetContext(req); // Ambil auth dari robot kita

        if (error) throw new Error(error);

        // Inisialisasi Google Drive API
        const auth = (sheets as any).context.auth;
        const drive = google.drive({ version: 'v3', auth });

        const fileName = `EMERGENCY_BACKUP_POS_${new Date().toISOString()}.json`;

        // Upload ke Drive
        const response = await drive.files.create({
            requestBody: {
                name: fileName,
                mimeType: 'application/json',
                // Opsional: Ibu bisa tambahkan parents: ['ID_FOLDER_DRIVE_IBU'] 
                // agar masuk ke folder tertentu
            },
            media: {
                mimeType: 'application/json',
                body: JSON.stringify(body, null, 2),
            },
        });

        return NextResponse.json({ success: true, fileId: response.data.id });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}