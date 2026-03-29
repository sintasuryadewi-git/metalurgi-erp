import { NextResponse } from 'next/server';
import { getSheetContext } from '@/lib/sheetAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        // 1. Minta Kunci Akses ke Satpam (Standard Baru Kita)
        const { sheets, sheetId: contextSheetId, error } = await getSheetContext(req);
        
        if (!sheets || error) {
            return NextResponse.json({ success: false, error: error || "Koneksi Google ditolak Auth" }, { status: 401 });
        }

        const body = await req.json();
        const headerSheetId = req.headers.get('x-sheet-id');
        const finalSheetId = contextSheetId || headerSheetId || body.sheetId;

        if (!finalSheetId) {
            return NextResponse.json({ success: false, error: 'Sheet ID tidak ditemukan.' }, { status: 401 });
        }

        const { action, payload } = body;

        // 2. MESIN 1-CLICK MAGIC (Auto-Clearing CSV Marketplace)
        if (action === 'PROCESS_MARKETPLACE_CSV') {
            const { invoiceData, paymentData, expenseData } = payload;

            // A. Suntik ke Trx_Sales_Invoice (Pengakuan Pendapatan)
            await sheets.spreadsheets.values.append({
                spreadsheetId: finalSheetId,
                range: 'Trx_Sales_Invoice!A:Z',
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [invoiceData] },
            });

            // B. Suntik ke Trx_Payment (Uang Masuk Bank)
            await sheets.spreadsheets.values.append({
                spreadsheetId: finalSheetId,
                range: 'Trx_Payment!A:Z',
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [paymentData] },
            });

            // C. Suntik ke Trx_Expense (Pemecahan Beban Komisi & Promo)
            if (expenseData && expenseData.length > 0) {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: finalSheetId,
                    range: 'Trx_Expense!A:Z',
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: expenseData },
                });
            }

            return NextResponse.json({ success: true, message: 'Auto-Clearing Berhasil! Data Jurnal telah dipecah ke 3 Sheet.' });
        }

        return NextResponse.json({ success: false, error: 'Action tidak dikenali.' });

    } catch (error: any) {
        console.error("B2B API Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}