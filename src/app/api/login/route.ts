import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    // 1. SETUP AUTH (Service Account Master)
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    
    // PENTING: ID ini sekarang mengarah ke MASTER DB (Client_Directory)
    const masterSpreadsheetId = process.env.GOOGLE_SHEET_ID;

    // 2. BACA MASTER DB (Tab: Client_Directory)
    // Asumsi Kolom: A=Email, B=Password, C=Name, D=Role, E=Sheet_ID
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: masterSpreadsheetId,
      range: "'Client_Directory'!A:E", 
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Master Database Kosong' }, { status: 500 });
    }

    // 3. CARI USER YANG COCOK
    // row[0]=Email, row[1]=Pass
    const user = rows.find((row) => row[0] === email && row[1] === password);

    if (!user) {
      return NextResponse.json({ success: false, error: 'Email atau Password salah' }, { status: 401 });
    }

    // 4. AMBIL SHEET ID SPESIFIK USER (Kolom E)
    const userSheetId = user[4];

    if (!userSheetId) {
      // Jika user ada tapi belum punya Sheet ID (Belum setup database)
      return NextResponse.json({ 
          success: true, 
          needsSetup: true, // Flag untuk frontend
          user: {
            email: user[0],
            name: user[2],
            role: user[3]
          }
      });
    }

    // 5. LOGIN SUKSES (Kembalikan Sheet ID User)
    return NextResponse.json({
      success: true,
      needsSetup: false,
      user: {
        email: user[0],
        name: user[2],
        role: user[3],
        sheetId: userSheetId, // INI KUNCINYA: Frontend akan pakai ID ini untuk request selanjutnya
      }
    });

  } catch (error: any) {
    console.error("Login Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}