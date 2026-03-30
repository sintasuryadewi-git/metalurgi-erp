import { NextResponse } from 'next/server';
import { getSheetContext } from '@/lib/sheetAuth';
import { extractText } from 'unpdf';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------------------------------
// HELPER: OPTIMIZED ROW FINDER & DATE STANDARDIZER
// ---------------------------------------------------------------------------------------------------
const findRowIndex = async (sheets: any, spreadsheetId: string, range: string, matchVal: string) => {
    try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
        const rows = res.data.values || [];
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][0] === matchVal) return i + 1;
        }
        return -1;
    } catch (error) {
        throw new Error(`Gagal mencari indeks baris pada range ${range}.`);
    }
};

const parseToStandardDate = (val: any) => {
    if (!val) return null;
    let d;
    if (typeof val === 'string' && val.includes('-')) d = new Date(val);
    else if (!isNaN(Number(val))) d = new Date(Math.round((Number(val) - 25569) * 86400 * 1000));
    else return null;
    
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
};

// ---------------------------------------------------------------------------------------------------
// GET: AMBIL DATA (SAFE-FETCH COA)
// ---------------------------------------------------------------------------------------------------
export async function GET(req: Request) {
    try {
        const { sheets, sheetId: contextSheetId, error } = await getSheetContext(req);
        if (!sheets || error) return NextResponse.json({ success: false, error: error || "Autentikasi Google gagal." }, { status: 401 });

        const finalSheetId = contextSheetId || req.headers.get('x-sheet-id');
        if (!finalSheetId) return NextResponse.json({ success: false, error: 'Kredensial Sheet ID tidak ditemukan.' }, { status: 400 });

        // ✨ FIX: Hanya ambil sheet yang PASTI ADA agar sistem tidak crash
        const ranges = ['Bank_Statements!A:M', 'General_Ledger!A:L'];
        const res = await sheets.spreadsheets.values.batchGet({ spreadsheetId: finalSheetId, ranges });
        const vr = res.data.valueRanges;

        const rawBs = vr?.[0]?.values || [];
        const parsedBs = rawBs.length > 1 ? rawBs.slice(1).map((row: any[]) => {
            row[1] = parseToStandardDate(row[1]) || row[1]; 
            row[2] = parseToStandardDate(row[2]) || row[2]; 
            return row;
        }) : [];

        const rawGl = vr?.[1]?.values || [];
        const parsedGl = rawGl.length > 1 ? rawGl.slice(1).map((row: any[]) => {
            row[1] = parseToStandardDate(row[1]) || row[1]; 
            return row;
        }) : [];

        // ✨ FIX: Ambil COA secara terpisah. Jika tidak ada, biarkan kosong tanpa membuat error
        let rawCoa: any[] = [];
        try {
            const coaRes = await sheets.spreadsheets.values.get({ spreadsheetId: finalSheetId, range: 'COA!A:D' });
            rawCoa = coaRes.data.values || [];
        } catch (e) {
            console.log("Tab COA tidak ditemukan, mengabaikan dropdown Jurnal Manual.");
        }

        return NextResponse.json({
            success: true,
            data: {
                bankStatements: rawBs.length > 0 ? [rawBs[0], ...parsedBs] : [],
                trxGL: rawGl.length > 0 ? [rawGl[0], ...parsedGl] : [], 
                coa: rawCoa 
            }
        });
    } catch(e: any) { 
        return NextResponse.json({ success: false, error: 'Terjadi kesalahan internal saat menarik data: ' + e.message }, { status: 500 }); 
    }
}

// ---------------------------------------------------------------------------------------------------
// POST: EKSEKUSI PENCATATAN 
// ---------------------------------------------------------------------------------------------------
export async function POST(req: Request) {
    try {
        const { sheets, sheetId: contextSheetId, error } = await getSheetContext(req);
        if (!sheets || error) return NextResponse.json({ success: false, error: error || "Autentikasi Google gagal." }, { status: 401 });

        const body = await req.json();
        const finalSheetId = contextSheetId || req.headers.get('x-sheet-id') || body.sheetId;
        if (!finalSheetId) return NextResponse.json({ success: false, error: 'Kredensial Sheet ID tidak ditemukan.' }, { status: 400 });

        const { action, payload } = body;

        // =========================================================================
        // AKSI 1: EKSTRAK PDF (PEMETAAN KOLOM MUTLAK A-L)
        // =========================================================================
        if (action === 'EXTRACT_PDF') {
            const { fileBase64, bank, startDate, endDate } = payload;
            if (!fileBase64 || !bank || !startDate || !endDate) return NextResponse.json({ success: false, error: 'Parameter ekstraksi tidak lengkap.' }, { status: 400 });
            if (fileBase64.length > 7000000) return NextResponse.json({ success: false, error: 'Ukuran file PDF terlalu besar.' }, { status: 413 });

            try {
                const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
                const buffer = Buffer.from(base64Data, 'base64');
                const uint8Array = new Uint8Array(buffer);
                
                const { text } = await extractText(uint8Array);
                const fullDocumentText = Array.isArray(text) ? text.join('\n') : text;

                const lines = fullDocumentText.split('\n').map((l: string) => l.trim()).filter((l: string) => l);
                
                let year = new Date().getFullYear().toString();
                const yearMatch = fullDocumentText.match(/PERIODE\s*:\s*[A-Z]+\s*(\d{4})/i);
                if (yearMatch) year = yearMatch[1];

                const blocks: string[][] = [];
                let currentBlock: string[] = [];

                lines.forEach((line: string) => {
                    if (/^\d{2}\/\d{2}/.test(line)) {
                        if (currentBlock.length > 0) blocks.push(currentBlock);
                        currentBlock = [line];
                    } else {
                        if (currentBlock.length > 0) currentBlock.push(line);
                    }
                });
                if (currentBlock.length > 0) blocks.push(currentBlock);

                const extractedRows = blocks.map((block: string[], index: number) => {
                    const fullText = block.join(' ');
                    const dateMatch = fullText.match(/^(\d{2})\/(\d{2})/);
                    let txDate = '';
                    if (dateMatch) txDate = `${year}-${dateMatch[2]}-${dateMatch[1]}`;

                    const isCredit = fullText.includes(' CR ') || fullText.includes(' CR');
                    const moneyMatches = fullText.match(/[\d,]+\.\d{2}/g);
                    let amount = 0; let balance = 0;

                    if (moneyMatches && moneyMatches.length >= 2) {
                        balance = parseFloat(moneyMatches[moneyMatches.length - 1].replace(/,/g, ''));
                        amount = parseFloat(moneyMatches[moneyMatches.length - 2].replace(/,/g, ''));
                    } else if (moneyMatches && moneyMatches.length === 1) {
                        amount = parseFloat(moneyMatches[0].replace(/,/g, ''));
                    }

                    let cleanDesc = fullText.replace(/^\d{2}\/\d{2}/, '').replace(/[\d,]+\.\d{2}/g, '').replace(/\s+/g, ' ').trim();

                    // ✨ FIX: PEMETAAN KOLOM A - L YANG SANGAT PRESISI
                    return [
                        `BS-${Date.now()}-${index}`, // A: Statement_ID
                        txDate,                      // B: Trx_Date
                        new Date().toISOString().split('T')[0], // C: Date_Processed
                        bank,                        // D: Bank_Account
                        cleanDesc,                   // E: Description
                        isCredit ? amount : 0,       // F: Mutation_IN
                        !isCredit ? amount : 0,      // G: Mutation_OUT
                        balance,                     // H: Balance
                        'Unreconciled',              // I: Recon_Status
                        '',                          // J: Linked_Payment_ID
                        '-',                         // K: Partner
                        ''                           // L: GL_Ref_ID
                    ];
                });

                const validRows = extractedRows.filter((r: any[]) => {
                    return r[1] && r[1] >= startDate && r[1] <= endDate && (r[6] > 0 || r[7] > 0);
                });

                return NextResponse.json({ success: true, data: validRows });

            } catch (err: any) {
                return NextResponse.json({ success: false, error: 'Gagal membedah PDF menggunakan unpdf.' }, { status: 422 });
            }
        }

        // =========================================================================
        // AKSI 2: MATCHING
        // =========================================================================
        if (action === 'MATCH') {
            const { statementId, glRefId, linkedPartner, idPasangan } = payload;
            if (!statementId || !glRefId || !idPasangan) return NextResponse.json({ success: false, error: 'Data payload tidak lengkap.' }, { status: 400 });

            const bsRow = await findRowIndex(sheets, finalSheetId, 'Bank_Statements!A:A', statementId);
            if (bsRow === -1) return NextResponse.json({ success: false, error: 'Mutasi Bank tidak ditemukan.' }, { status: 404 });

            try {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: finalSheetId,
                    range: `Bank_Statements!I${bsRow}:L${bsRow}`,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: { values: [['Reconciled', idPasangan, linkedPartner || '-', glRefId]] }
                });
                return NextResponse.json({ success: true, message: 'Matching sukses dan terkunci!' });
            } catch (err: any) {
                throw new Error("Gagal mengunci tautan ke Sheets: " + err.message);
            }
        }

        // =========================================================================
        // AKSI LAINNYA
        // =========================================================================
        if (action === 'WRITE_JURNAL') {
            const { glData, paymentData, subLedgerSheetName, subLedgerId, glRefId, subLedgerStatusColumn } = payload;
            try {
                await sheets.spreadsheets.values.append({ spreadsheetId: finalSheetId, range: 'General_Ledger!A:L', valueInputOption: 'USER_ENTERED', requestBody: { values: glData }});
                await sheets.spreadsheets.values.append({ spreadsheetId: finalSheetId, range: 'Trx_Payment!A:I', valueInputOption: 'USER_ENTERED', requestBody: { values: paymentData }});
                
                const bsRow = await findRowIndex(sheets, finalSheetId, `${subLedgerSheetName}!A:A`, subLedgerId);
                if (bsRow > -1 && subLedgerSheetName === 'Bank_Statements') {
                    await sheets.spreadsheets.values.update({ 
                        spreadsheetId: finalSheetId, 
                        range: `Bank_Statements!I${bsRow}:L${bsRow}`, 
                        valueInputOption: 'USER_ENTERED', 
                        requestBody: { values: [['Reconciled', glRefId, '-', glRefId]] }
                    });
                }
                return NextResponse.json({ success: true });
            } catch (err: any) { throw new Error("Gagal menulis jurnal berantai: " + err.message); }
        }

        if (action === 'UPLOAD') {
            await sheets.spreadsheets.values.append({ spreadsheetId: finalSheetId, range: 'Bank_Statements!A:M', valueInputOption: 'USER_ENTERED', requestBody: { values: payload.rows }});
            return NextResponse.json({ success: true });
        }

        if (action === 'UNRECONCILE') {
            const { statementId } = payload;
            const bsRow = await findRowIndex(sheets, finalSheetId, 'Bank_Statements!A:A', statementId);
            if (bsRow > -1) {
                await sheets.spreadsheets.values.update({ 
                    spreadsheetId: finalSheetId, range: `Bank_Statements!I${bsRow}:L${bsRow}`, 
                    valueInputOption: 'USER_ENTERED', requestBody: { values: [['Unreconciled', '', '-', '']] } 
                });
            }
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: false, error: 'Action parameter tidak dikenali.' }, { status: 400 });
    } catch(e: any) { return NextResponse.json({ success: false, error: 'Kesalahan Server: ' + e.message }, { status: 500 }); }
}