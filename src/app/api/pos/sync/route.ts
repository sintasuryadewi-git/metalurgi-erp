import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// CONFIG
const MASTER_DB_ID = '1Kw14wD8IHQW796loZC0H7rmZfZ5hOWN3k-2K1zT-uNw';
const MASTER_SHEET_TAB = 'Client_Directory';
const POS_SHEET_NAME = 'Trx_POS';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, transactions } = body;

    // Logging untuk debugging di Vercel/Terminal
    console.log(`Sync attempt for email: [${email}] with ${transactions?.length} items`);

    if (!email || !transactions || !Array.isArray(transactions)) {
        return NextResponse.json({ 
            success: false, 
            error: `Data incomplete. Received email: [${email || 'EMPTY'}]` 
        }, { status: 400 });
    }

    if (transactions.length === 0) {
        return NextResponse.json({ success: true, message: 'Tidak ada data baru untuk disync.' });
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

    // 2. GET USER SHEET ID
    const masterRes = await sheets.spreadsheets.values.get({
        spreadsheetId: MASTER_DB_ID,
        range: `'${MASTER_SHEET_TAB}'!A:E`,
    });
    const rows = masterRes.data.values || [];
    
    // Cari user dengan proteksi email klien
    const clientEmail = email.trim().toLowerCase();
    const userRow = rows.find((r: any) => r[0] && r[0].trim().toLowerCase() === clientEmail);

    if (!userRow) {
        return NextResponse.json({ 
            success: false, 
            error: `GAGAL: User [${email}] tidak ditemukan di Master DB. Silakan hubungi admin.` 
        }, { status: 404 });
    }

    const targetSheetId = userRow[4];

    // 3. CEK DUPLIKAT
    const existingRes = await sheets.spreadsheets.values.get({
        spreadsheetId: targetSheetId,
        range: `'${POS_SHEET_NAME}'!A:A`,
    });
    const existingIds = new Set(existingRes.data.values?.flat() || []);

    // 4. FILTER TRANSAKSI BARU
    const newRows: any[] = [];
    const syncedIds: string[] = [];

    transactions.forEach((trx: any) => {
        if (!existingIds.has(trx.id)) {
            // Proteksi parsing tanggal agar tidak error .split of undefined
            const trxDate = trx.date || new Date().toISOString();
            
            newRows.push([
                trx.id,                         
                trxDate.includes('T') ? trxDate.split('T')[0] : trxDate,         
                trxDate.includes('T') ? trxDate.split('T')[1]?.substring(0,5) : '', 
                trx.cashier || 'System',        
                trx.paymentMethod || 'Cash',    
                trx.total,                      
                JSON.stringify(trx.items),      
                new Date().toISOString()        
            ]);
            syncedIds.push(trx.id);
        }
    });

    if (newRows.length === 0) {
        return NextResponse.json({ success: true, message: 'Semua data sudah tersinkron sebelumnya.' });
    }

    // 5. APPEND KE GOOGLE SHEET
    await sheets.spreadsheets.values.append({
        spreadsheetId: targetSheetId,
        range: `'${POS_SHEET_NAME}'!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: newRows }
    });

    return NextResponse.json({ 
        success: true, 
        message: `Berhasil upload ${newRows.length} transaksi ke Cloud.`,
        syncedIds 
    });

  } catch (error: any) {
    console.error("POS Sync Error Detail:", error);
    return NextResponse.json({ 
        success: false, 
        error: `Server Error: ${error.message}` 
    }, { status: 500 });
  }
}