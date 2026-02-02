import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// CONFIG
const MASTER_DB_ID = '1Kw14wD8IHQW796loZC0H7rmZfZ5hOWN3k-2K1zT-uNw';
const MASTER_SHEET_TAB = 'Client_Directory';
const SHIFT_SHEET_NAME = 'Shift_History';

export async function POST(req: Request) {
  try {
    const { email, shiftData } = await req.json();

    if (!email || !shiftData) {
        return NextResponse.json({ success: false, error: 'Data incomplete' }, { status: 400 });
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

    // 2. GET SHEET ID
    const masterRes = await sheets.spreadsheets.values.get({
        spreadsheetId: MASTER_DB_ID,
        range: `'${MASTER_SHEET_TAB}'!A:E`,
    });
    const rows = masterRes.data.values || [];
    const userRow = rows.find((r: any) => r[0] && r[0].trim().toLowerCase() === email.trim().toLowerCase());

    if (!userRow) return NextResponse.json({ success: false, error: 'User tidak ditemukan.' }, { status: 404 });
    const targetSheetId = userRow[4];

    // 3. MAPPING DATA
    // Pastikan shiftData bisa berupa array atau object tunggal
    const shiftsToSync = Array.isArray(shiftData) ? shiftData : [shiftData];
    
    // Cek ID yang sudah ada agar tidak duplikat
    const existingRes = await sheets.spreadsheets.values.get({
        spreadsheetId: targetSheetId,
        range: `'${SHIFT_SHEET_NAME}'!A:A`,
    });
    const existingIds = new Set(existingRes.data.values?.flat() || []);

    const newRows: any[] = [];
    
    shiftsToSync.forEach((s: any) => {
        if (!existingIds.has(s.id)) {
            newRows.push([
                s.id,
                s.endTime ? s.endTime.split('T')[0] : s.startTime.split('T')[0],
                s.shiftName,
                s.cashierName,
                s.startCash,
                s.totalSales,
                s.endCashActual,
                s.variance,
                s.note || '-',
                new Date().toISOString()
            ]);
        }
    });

    if (newRows.length === 0) {
        return NextResponse.json({ success: true, message: 'Data shift sudah tersinkron.' });
    }

    // 4. APPEND
    await sheets.spreadsheets.values.append({
        spreadsheetId: targetSheetId,
        range: `'${SHIFT_SHEET_NAME}'!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: newRows }
    });

    return NextResponse.json({ success: true, message: `Berhasil upload ${newRows.length} shift.` });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}