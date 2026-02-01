// apps/web/lib/sheetAuth.ts
import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export async function getSheetContext(req: Request) {
  // 1. Ambil Sheet ID dari Header
  const sheetId = req.headers.get('x-sheet-id');

  if (!sheetId) {
    // Return null sebagai tanda error "ID Missing"
    return { error: 'Database Connection Missing (No Sheet ID)', sheets: null, sheetId: null };
  }

  // 2. Setup Google Auth (Sekali saja untuk semua API)
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // 3. Kembalikan Instance Siap Pakai
    return { error: null, sheets, sheetId };
    
  } catch (err: any) {
    return { error: 'Auth Error: ' + err.message, sheets: null, sheetId: null };
  }
}