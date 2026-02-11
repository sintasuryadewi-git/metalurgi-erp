import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// CONFIG
const MASTER_DB_ID = '1Kw14wD8IHQW796loZC0H7rmZfZ5hOWN3k-2K1zT-uNw';
const MASTER_SHEET_TAB = 'Client_Directory';
const POS_SHEET_NAME = 'Trx_POS';
const GL_SHEET_NAME = 'General_Ledger'; // Target baru untuk Accounting

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, transactions } = body;

    console.log(`Sync attempt for email: [${email}] with ${transactions?.length} items`);

    if (!email || !transactions || !Array.isArray(transactions)) {
        return NextResponse.json({ success: false, error: 'Data incomplete.' }, { status: 400 });
    }

    if (transactions.length === 0) {
        return NextResponse.json({ success: true, message: 'Tidak ada data baru.' });
    }

    // 1. AUTH GOOGLE
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
    
    const clientEmail = email.trim().toLowerCase();
    const userRow = (masterRes.data.values || []).find((r: any) => r[0] && r[0].trim().toLowerCase() === clientEmail);

    if (!userRow) {
        return NextResponse.json({ success: false, error: 'User tidak ditemukan.' }, { status: 404 });
    }

    const targetSheetId = userRow[4];

    // 3. GET EXISTING IDS (Untuk Mencegah Duplikat)
    // Kita cek Trx_POS saja sebagai acuan utama
    const existingRes = await sheets.spreadsheets.values.get({
        spreadsheetId: targetSheetId,
        range: `'${POS_SHEET_NAME}'!A:A`,
    });
    const existingIds = new Set(existingRes.data.values?.flat() || []);

    // 4. PREPARE DATA (POS ROW & GL ROWS)
    const newPosRows: any[] = [];
    const newGlRows: any[] = [];
    const syncedIds: string[] = [];

    transactions.forEach((trx: any) => {
        // Skip jika sudah ada
        if (existingIds.has(trx.id)) return;

        // --- A. DATA UNTUK TRX_POS ---
        // PENTING: Gunakan trx.date dari frontend (Live Date), jangan new Date() disini.
        const trxDateRaw = trx.date || new Date().toISOString(); 
        const datePart = trxDateRaw.split('T')[0];
        const timePart = trxDateRaw.includes('T') ? trxDateRaw.split('T')[1].substring(0,5) : '';

        newPosRows.push([
            trx.id,
            datePart,
            timePart,
            trx.cashier || 'System',
            trx.paymentMethod || 'Cash',
            trx.total,
            JSON.stringify(trx.items),
            new Date().toISOString() // Synced At (Timestamp server saat ini)
        ]);

        // --- B. DATA UNTUK GENERAL LEDGER (ACCOUNTING) ---
        // Logic Jurnal Otomatis:
        // 1. Debit KAS/BANK (Tergantung Payment Method)
        // 2. Kredit PENJUALAN (4-1000)
        // 3. Debit HPP (5-1000) & Kredit PERSEDIAAN (1-1003) -> *Jika data cost tersedia*

        // Tentukan Akun Debit (Uang Masuk kemana?)
        let debitAccount = '1-1001'; // Default Kas Besar
        if (trx.paymentMethod === 'QRIS' || trx.paymentMethod === 'Transfer') {
            debitAccount = '1-1002'; // Bank BCA / QRIS
        }

        // JURNAL 1: PENCATATAN PENDAPATAN (SALES)
        // Baris Debit (Uang Masuk)
        newGlRows.push([
            `JNL-${trx.id}`,    // Journal ID
            datePart,           // Date (Live Transaction Date)
            debitAccount,       // Account Code
            `Penjualan POS - ${trx.id} (${trx.paymentMethod})`, // Description
            trx.total,          // Debit
            0,                  // Credit
            trx.id              // Ref ID
        ]);

        // Baris Kredit (Pendapatan Bertambah)
        newGlRows.push([
            `JNL-${trx.id}`,
            datePart,
            '4-1000',           // Akun Pendapatan Usaha (Sales)
            `Penjualan POS - ${trx.id}`,
            0,                  // Debit
            trx.total,          // Credit
            trx.id
        ]);

        // JURNAL 2: HPP & STOCK (Opsional - Jika item punya data cost/hpp)
        // Kita loop items untuk menghitung total HPP transaksi ini
        let totalCOGS = 0;
        trx.items.forEach((item: any) => {
            // Asumsi: Frontend mengirim 'cost' atau 'originalPrice' sebagai HPP. 
            // Jika tidak ada, anggap 0 (nanti bisa diperbaiki di frontend)
            const itemCost = item.cost || item.originalPrice || 0; 
            totalCOGS += (itemCost * item.qty);
        });

        if (totalCOGS > 0) {
            // Debit HPP (Beban)
            newGlRows.push([
                `JNL-${trx.id}-COGS`,
                datePart,
                '5-1000', // Akun HPP
                `HPP Penjualan - ${trx.id}`,
                totalCOGS,
                0,
                trx.id
            ]);
            // Kredit Persediaan (Aset Berkurang)
            newGlRows.push([
                `JNL-${trx.id}-COGS`,
                datePart,
                '1-1003', // Akun Persediaan Barang
                `Pengurangan Stok - ${trx.id}`,
                0,
                totalCOGS,
                trx.id
            ]);
        }

        syncedIds.push(trx.id);
    });

    if (newPosRows.length === 0) {
        return NextResponse.json({ success: true, message: 'Data sudah tersinkron.' });
    }

    // 5. EKSEKUSI TULIS KE GOOGLE SHEET (PARALEL)
    // Kita jalankan 2 request sekaligus biar cepat
    await Promise.all([
        // Tulis ke Trx_POS
        sheets.spreadsheets.values.append({
            spreadsheetId: targetSheetId,
            range: `'${POS_SHEET_NAME}'!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: newPosRows }
        }),
        // Tulis ke General_Ledger
        sheets.spreadsheets.values.append({
            spreadsheetId: targetSheetId,
            range: `'${GL_SHEET_NAME}'!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: newGlRows }
        })
    ]);

    return NextResponse.json({ 
        success: true, 
        message: `Sukses! ${newPosRows.length} Transaksi & ${newGlRows.length} Jurnal berhasil dibuat.`,
        syncedIds 
    });

  } catch (error: any) {
    console.error("POS Sync Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}