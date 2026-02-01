import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// --- KONFIGURASI SESUAI INSTRUKSI ---
// 1. ID Spreadsheet Master DB (Updated)
const MASTER_DB_ID = '1Kw14wD8IHQW796loZC0H7rmZfZ5hOWN3k-2K1zT-uNw'; 

// 2. NAMA TAB (Sheet Title)
const SHEET_TAB_NAME = 'Client_Directory'; 

export async function POST(req: Request) {
  try {
    // 1. Cek Environment Variables
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;

    if (!clientEmail || !privateKey) {
        return NextResponse.json({ 
            success: false, 
            error: 'Server Config Error: Email/Key Service Account tidak ditemukan di .env' 
        }, { status: 500 });
    }

    const body = await req.json();
    const { sku, newPrice, email } = body; 

    if (!sku || !newPrice || !email) {
        return NextResponse.json({ success: false, error: 'Data incomplete: SKU, Price, and Email are required.' }, { status: 400 });
    }

    // 2. INIT AUTH
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: clientEmail,
            private_key: privateKey.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // 3. LOOKUP SHEET ID USER DARI MASTER DB
    let masterRes;
    try {
        // Menggunakan nama tab 'Client_Directory'
        masterRes = await sheets.spreadsheets.values.get({
            spreadsheetId: MASTER_DB_ID,
            range: `'${SHEET_TAB_NAME}'!A:E`, 
        });
    } catch (err: any) {
        return NextResponse.json({ 
            success: false, 
            error: `Gagal akses Tab '${SHEET_TAB_NAME}' di Master DB. Pastikan nama tab benar. Error: ${err.message}` 
        }, { status: 500 });
    }

    const rows = masterRes.data.values;
    if (!rows || rows.length === 0) {
        return NextResponse.json({ success: false, error: `Tab '${SHEET_TAB_NAME}' kosong.` }, { status: 404 });
    }

    // Cari User (Case Insensitive)
    const userRow = rows.find((r: any) => r[0] && r[0].trim().toLowerCase() === email.trim().toLowerCase());

    if (!userRow) {
        return NextResponse.json({ success: false, error: `User ${email} tidak terdaftar di Master DB.` }, { status: 404 });
    }

    const targetSheetId = userRow[4]; // Ambil Sheet ID dari Kolom E

    if (!targetSheetId) {
        return NextResponse.json({ success: false, error: `Sheet ID user ${email} kosong di Master DB.` }, { status: 400 });
    }

    // 4. CARI SKU DI SHEET TARGET (USER SHEET)
    // Asumsi di sheet user, nama tab produk adalah 'Master_Product'
    const rangeRead = "'Master_Product'!A:A";
    const readRes = await sheets.spreadsheets.values.get({
        spreadsheetId: targetSheetId,
        range: rangeRead,
    });

    const productRows = readRes.data.values;
    if (!productRows) return NextResponse.json({ success: false, error: 'Master Product user kosong.' }, { status: 404 });

    const rowIndex = productRows.findIndex((r: any) => r[0] === sku);
    if (rowIndex === -1) {
        return NextResponse.json({ success: false, error: `SKU ${sku} tidak ditemukan di sheet user.` }, { status: 404 });
    }

    // 5. UPDATE HARGA (Kolom F / Index 6)
    const sheetRowNumber = rowIndex + 1;
    const rangeWrite = `'Master_Product'!F${sheetRowNumber}`;

    await sheets.spreadsheets.values.update({
        spreadsheetId: targetSheetId,
        range: rangeWrite,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[newPrice]] }
    });

    return NextResponse.json({ 
        success: true, 
        message: `Success! Harga ${sku} diupdate ke ${newPrice} (User: ${email})` 
    });

  } catch (error: any) {
    console.error("API Update Error:", error);
    return NextResponse.json({ success: false, error: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
}