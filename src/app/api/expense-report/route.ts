import { NextResponse } from 'next/server';
import { getSheetContext } from '@/lib/sheetAuth';

export const dynamic = 'force-dynamic';

const parseToStandardDate = (val: any) => {
    if (!val) return null;
    let d;
    if (typeof val === 'string' && val.includes('-')) d = new Date(val);
    else if (!isNaN(Number(val))) d = new Date(Math.round((Number(val) - 25569) * 86400 * 1000));
    else return null;
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
};

export async function GET(req: Request) {
    try {
        const { sheets, sheetId: contextSheetId, error } = await getSheetContext(req);
        if (!sheets || error) return NextResponse.json({ success: false, error: error || "Autentikasi Google gagal." }, { status: 401 });

        const finalSheetId = contextSheetId || req.headers.get('x-sheet-id');
        if (!finalSheetId) return NextResponse.json({ success: false, error: 'Kredensial Sheet ID tidak ditemukan.' }, { status: 400 });

        // Tarik 3 Sheet sekaligus untuk Tracing 3 Arah
        const ranges = ['Trx_Payment!A:I', 'General_Ledger!A:L', 'Bank_Statements!A:L'];
        const res = await sheets.spreadsheets.values.batchGet({ spreadsheetId: finalSheetId, ranges });
        
        if (!res.data || !res.data.valueRanges) {
            throw new Error("Respons dari Google Sheets API kosong.");
        }

        const vr = res.data.valueRanges;

        // 1. Ambil & Filter Data Payment (HANYA YANG 'OUT')
        const rawPayments = vr?.[0]?.values || [];
        const paymentsOut = rawPayments.slice(1).filter((r: any[]) => r[2] === 'OUT').map((r: any[]) => {
            return {
                date: parseToStandardDate(r[0]) || r[0], // A
                refId: r[1] || '', // B
                account: r[3] || '', // D (Bisa Bank/Kas)
                amount: parseFloat(String(r[4]).replace(/Rp|\.|,/g, '')) || 0, // E
                desc: r[5] || '-', // F
                status: r[6] || 'Draft', // G
                paymentMethod: r[7] || 'Unknown' // H
            };
        });

        // 2. Ambil Buku Besar untuk Jejak Audit (Debit/Kredit COA)
        const rawGl = vr?.[1]?.values || [];
        const glEntries = rawGl.slice(1).map((r: any[]) => {
            return {
                glId: r[0], date: parseToStandardDate(r[1]), refId: r[2], desc: r[3],
                debit: parseFloat(r[5]) || 0, kredit: parseFloat(r[6]) || 0,
                status: r[8]
            };
        });

        // 3. Ambil Bank Statement untuk Jejak Rekonsiliasi
        const rawBs = vr?.[2]?.values || [];
        const bsEntries = rawBs.slice(1).map((r: any[]) => {
            return {
                statementId: r[0], bank: r[3], desc: r[4], 
                amountOut: parseFloat(r[6]) || 0, status: r[8], glRefId: r[11]
            };
        });

        // 4. JODOHKAN DATA (The Detektif Logic)
        const finalExpenses = paymentsOut.map(payment => {
            // Cari Jurnal di GL yang punya RefID sama dengan Payment
            const relatedGL = glEntries.filter(gl => gl.refId === payment.refId);
            
            // Cek apakah ada COA Biaya (Debit) dan COA Kas/Bank (Kredit)
            const expenseAccount = relatedGL.find(gl => gl.debit > 0)?.desc || 'Tanpa Kategori Biaya';
            const sourceAccount = relatedGL.find(gl => gl.kredit > 0)?.desc || payment.account;

            // Cari di Bank Statement apakah payment ini sudah direkonsiliasi
            const bankRecon = bsEntries.find(bs => bs.glRefId === payment.refId && bs.status === 'Reconciled');

            return {
                ...payment,
                expenseCategory: expenseAccount,
                sourceAccount: sourceAccount,
                glCount: relatedGL.length,
                isBalanced: relatedGL.length >= 2 && 
                            (relatedGL.reduce((sum, gl) => sum + gl.debit, 0) === relatedGL.reduce((sum, gl) => sum + gl.kredit, 0)),
                isBankReconciled: !!bankRecon,
                bankStatementId: bankRecon?.statementId || null
            };
        });

        // Urutkan dari yang terbaru
        finalExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return NextResponse.json({ success: true, data: finalExpenses });

    } catch(e: any) { 
        console.error("[API Expense GET ERROR]:", e);
        return NextResponse.json({ success: false, error: 'Terjadi kesalahan saat menarik data: ' + e.message }, { status: 500 }); 
    }
}