import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // updateOnly: Flag khusus untuk flow "Aktivasi Setelah Login"
    const { licenseKey, companyName, adminEmail, adminPass, updateOnly } = body;

    // 1. SETUP AUTH GOOGLE
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // 2. UPDATE SHEET 'App_Config' (Simpan Lisensi & Info Perusahaan)
    // Mengisi Cell B2 (License), B3 (Date), B4 (Company)
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: "'App_Config'!B2", values: [[licenseKey]] },
          { range: "'App_Config'!B3", values: [[new Date().toISOString()]] },
          { range: "'App_Config'!B4", values: [[companyName]] }
        ]
      }
    });

    // 3. UPDATE SHEET 'Master_Users' (OPSIONAL)
    // Jika updateOnly = true, kita SKIP langkah ini (karena user sudah login/ada).
    // Jika updateOnly = false (flow lama), kita buat user baru.
    if (!updateOnly && adminEmail && adminPass) {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: "'Master_Users'!A:E",
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [
              [adminEmail, adminPass, 'Super Admin', 'OWNER', 'TRUE']
            ]
          }
        });
    }

    return NextResponse.json({ success: true, message: 'Activation Successful' });

  } catch (error: any) {
    console.error('Activation Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}