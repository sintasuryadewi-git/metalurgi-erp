import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { email, sheetId } = await req.json();

    if (!email || !sheetId) {
        return NextResponse.json({ success: false, error: 'Data tidak lengkap' }, { status: 400 });
    }

    // 1. AUTH GOOGLE (Service Account Master)
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const masterSpreadsheetId = process.env.GOOGLE_SHEET_ID; // Ini ID Master DB

    // 2. CARI BARIS USER DI MASTER DB
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: masterSpreadsheetId,
      range: "'Client_Directory'!A:A", // Kita cuma butuh kolom Email (A) untuk cari baris
    });

    const rows = response.data.values;
    let rowIndex = -1;

    // Loop cari email (Mulai dari index 0)
    // Row Sheet dimulai dari 1. Jadi kalau ketemu di index 0 (Header), itu Row 1.
    // Kita asumsikan Header ada, jadi data user mulai dari Row 2 ke atas.
    if (rows) {
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === email) {
                rowIndex = i + 1; // Konversi Array Index (0-based) ke Sheet Row (1-based)
                break;
            }
        }
    }

    if (rowIndex === -1) {
        return NextResponse.json({ success: false, error: 'User tidak ditemukan di Master DB' }, { status: 404 });
    }

    // 3. UPDATE KOLOM E (Sheet_ID)
    // Target Cell: Client_Directory!E{rowIndex}
    await sheets.spreadsheets.values.update({
        spreadsheetId: masterSpreadsheetId,
        range: `'Client_Directory'!E${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [[sheetId]]
        }
    });

    return NextResponse.json({ success: true, message: 'Database Connected' });

  } catch (error: any) {
    console.error('Setup DB Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}