import { NextResponse } from 'next/server';
import { getSheetContext } from '@/lib/sheetAuth';

export const dynamic = 'force-dynamic';

// Fungsi bantuan untuk mencari semua baris yang memiliki nilai tertentu (misal: cari semua baris INV-001)
const findRowIndices = async (sheets: any, spreadsheetId: string, range: string, matchColIndex: number, matchVal: string) => {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    const rows = res.data.values || [];
    const indices = [];
    for (let i = 0; i < rows.length; i++) {
        if (rows[i][matchColIndex] === matchVal) indices.push(i + 1); // +1 karena range Google Sheets mulai dari 1
    }
    return indices;
};

export async function GET(req: Request) {
    try {
        const { sheets, sheetId: contextSheetId, error } = await getSheetContext(req);
        if (!sheets || error) return NextResponse.json({ success: false, error: error || "Auth failed" }, { status: 401 });

        const url = new URL(req.url);
        const finalSheetId = contextSheetId || req.headers.get('x-sheet-id') || url.searchParams.get('sheetId');
        if (!finalSheetId) return NextResponse.json({ success: false, error: 'Sheet ID missing.' }, { status: 401 });

        // Tarik data Invoice dan Payment
        const response = await sheets.spreadsheets.values.batchGet({
            spreadsheetId: finalSheetId,
            ranges: ['Trx_Sales_Invoice!A:J', 'Trx_Payment!A:H'],
        });

        return NextResponse.json({ 
            success: true, 
            data: {
                invoices: response.data.valueRanges?.[0]?.values || [],
                payments: response.data.valueRanges?.[1]?.values || []
            }
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { sheets, sheetId: contextSheetId, error } = await getSheetContext(req);
        if (!sheets || error) return NextResponse.json({ success: false, error: error || "Koneksi Google ditolak Auth" }, { status: 401 });

        const body = await req.json();
        const headerSheetId = req.headers.get('x-sheet-id');
        const finalSheetId = contextSheetId || headerSheetId || body.sheetId;

        if (!finalSheetId) return NextResponse.json({ success: false, error: 'Sheet ID tidak ditemukan.' }, { status: 401 });

        const { action, payload } = body;

        // 1. AUTO-CLEARING CSV MARKETPLACE
        if (action === 'PROCESS_MARKETPLACE_CSV') {
            const { invoiceData, paymentData, expenseData } = payload;
            await sheets.spreadsheets.values.append({ spreadsheetId: finalSheetId, range: 'Trx_Sales_Invoice!A:J', valueInputOption: 'USER_ENTERED', requestBody: { values: [invoiceData] }});
            await sheets.spreadsheets.values.append({ spreadsheetId: finalSheetId, range: 'Trx_Payment!A:H', valueInputOption: 'USER_ENTERED', requestBody: { values: [paymentData] }});
            if (expenseData && expenseData.length > 0) {
                await sheets.spreadsheets.values.append({ spreadsheetId: finalSheetId, range: 'Trx_Expense!A:E', valueInputOption: 'USER_ENTERED', requestBody: { values: expenseData }});
            }
            return NextResponse.json({ success: true, message: 'Auto-Clearing CSV Berhasil!' });
        }

        // 2. GENERATE PAYMENT DARI INVOICE
        if (action === 'GENERATE_PAYMENT') {
            const { paymentData, invNumber } = payload;
            // A. Insert ke Payment
            await sheets.spreadsheets.values.append({ spreadsheetId: finalSheetId, range: 'Trx_Payment!A:H', valueInputOption: 'USER_ENTERED', requestBody: { values: [paymentData] }});
            // B. Update Status di Invoice (Kolom I=Linked_Payment, J=Status)
            const invoiceRows = await findRowIndices(sheets, finalSheetId, 'Trx_Sales_Invoice!A:C', 2, invNumber); // Kolom C (index 2) = Inv_Number
            for (const rowIdx of invoiceRows) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: finalSheetId, range: `Trx_Sales_Invoice!I${rowIdx}:J${rowIdx}`,
                    valueInputOption: 'USER_ENTERED', requestBody: { values: [[paymentData[1], 'Paid']] }
                });
            }
            return NextResponse.json({ success: true, message: 'Payment berhasil dibuat dan Invoice lunas.' });
        }

        // 3. GENERATE INVOICE DARI PAYMENT
        if (action === 'GENERATE_INVOICE') {
            const { invoiceData, refNumber } = payload;
            // A. Insert ke Invoice
            await sheets.spreadsheets.values.append({ spreadsheetId: finalSheetId, range: 'Trx_Sales_Invoice!A:J', valueInputOption: 'USER_ENTERED', requestBody: { values: [invoiceData] }});
            // B. Update Status di Payment (Kolom G=Status, H=Linked_Invoice)
            const paymentRows = await findRowIndices(sheets, finalSheetId, 'Trx_Payment!A:B', 1, refNumber); // Kolom B (index 1) = Ref_Number
            for (const rowIdx of paymentRows) {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: finalSheetId, range: `Trx_Payment!G${rowIdx}:H${rowIdx}`,
                    valueInputOption: 'USER_ENTERED', requestBody: { values: [['Matched', invoiceData[2]]] }
                });
            }
            return NextResponse.json({ success: true, message: 'Invoice legal berhasil dibuat.' });
        }

        // 4. BIRO JODOH MANUAL (MANUAL MATCH)
        if (action === 'MANUAL_MATCH') {
            const { invNumber, refNumber, expenseData } = payload;
            
            // Update Invoice
            const invoiceRows = await findRowIndices(sheets, finalSheetId, 'Trx_Sales_Invoice!A:C', 2, invNumber);
            for (const rowIdx of invoiceRows) {
                await sheets.spreadsheets.values.update({ spreadsheetId: finalSheetId, range: `Trx_Sales_Invoice!I${rowIdx}:J${rowIdx}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[refNumber, 'Paid']] }});
            }
            // Update Payment
            const paymentRows = await findRowIndices(sheets, finalSheetId, 'Trx_Payment!A:B', 1, refNumber);
            for (const rowIdx of paymentRows) {
                await sheets.spreadsheets.values.update({ spreadsheetId: finalSheetId, range: `Trx_Payment!G${rowIdx}:H${rowIdx}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [['Matched', invNumber]] }});
            }
            // Insert Expense (Jika ada selisih)
            if (expenseData && expenseData.length > 0) {
                await sheets.spreadsheets.values.append({ spreadsheetId: finalSheetId, range: 'Trx_Expense!A:E', valueInputOption: 'USER_ENTERED', requestBody: { values: expenseData }});
            }
            return NextResponse.json({ success: true, message: 'Data berhasil dijodohkan!' });
        }

        return NextResponse.json({ success: false, error: 'Action tidak dikenali.' });

    } catch (error: any) {
        console.error("B2B API Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}