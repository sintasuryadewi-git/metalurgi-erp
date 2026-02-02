import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// CONFIG (Sama dengan sync)
const MASTER_DB_ID = '1Kw14wD8IHQW796loZC0H7rmZfZ5hOWN3k-2K1zT-uNw';
const MASTER_SHEET_TAB = 'Client_Directory';
const POS_SHEET_NAME = 'Trx_POS';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ success: false, error: 'Email parameter required' }, { status: 400 });
    }

    // 1. AUTH
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // 2. CARI SHEET ID USER
    const masterRes = await sheets.spreadsheets.values.get({
        spreadsheetId: MASTER_DB_ID,
        range: `'${MASTER_SHEET_TAB}'!A:E`,
    });
    
    const rows = masterRes.data.values || [];
    const userRow = rows.find((r: any) => r[0] && r[0].trim().toLowerCase() === email.trim().toLowerCase());

    if (!userRow) {
      return NextResponse.json({ success: false, error: 'User tidak ditemukan di Master DB' }, { status: 404 });
    }

    const targetSheetId = userRow[4];

    // 3. AMBIL DATA TRANSAKSI
    const posRes = await sheets.spreadsheets.values.get({
        spreadsheetId: targetSheetId,
        range: `'${POS_SHEET_NAME}'!A:G`, // Ambil kolom A sampai G
    });

    const posRows = posRes.data.values || [];
    
    // 4. FORMAT DATA KE JSON
    // Lewati row pertama jika itu header (cek ID)
    const transactions = posRows.map((row) => {
      // Skip header row if "Trx_ID" detected
      if (row[0] === 'Trx_ID') return null;

      try {
        return {
          id: row[0],
          date: row[1],
          timestamp: row[2], // Time
          cashier: row[3],
          paymentMethod: row[4],
          total: parseInt(row[5]?.replace(/[^0-9]/g, '') || '0'), // Bersihkan format currency jika ada
          items: JSON.parse(row[6] || '[]'), // Parse JSON items
          isCloud: true // Penanda bahwa ini data cloud
        };
      } catch (e) {
        return null; // Skip baris rusak
      }
    }).filter(Boolean).reverse(); // Filter null & urutkan dari terbaru

    return NextResponse.json({ 
      success: true, 
      data: transactions 
    });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}