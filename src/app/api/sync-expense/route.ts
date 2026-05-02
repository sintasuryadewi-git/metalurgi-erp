import { NextResponse } from 'next/server';
import { getSheetContext } from '@/lib/sheetAuth';

export const dynamic = 'force-dynamic';

// ID Sheet Lapangan
const SOURCE_SPREADSHEET_ID = '1G6otdRJQ-Ogq4ijNyzVG_AD5eP_EcuEQJIHgX-Rnucw';
const SOURCE_SHEET_NAME = 'DB_BIAYA';

const cleanMoney = (val: string) => {
    if (!val) return 0;
    let str = String(val).replace(/Rp|\s/ig, '');
    if (str.startsWith('(') && str.endsWith(')')) {
        str = '-' + str.slice(1, -1);
    }
    str = str.replace(/\./g, '').replace(/,/g, '.');
    return Math.abs(parseFloat(str)) || 0;
};

const parseDate = (val: string) => {
    if (!val) return new Date().toISOString().split('T')[0];
    if (val.includes('/')) {
        const [d, m, y] = val.split(/[\/\s-]/);
        if (y && m && d) return `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return new Date(val).toISOString().split('T')[0] || new Date().toISOString().split('T')[0];
};

export async function POST(req: Request) {
    try {
        const { sheets, sheetId: destinationSheetId, error } = await getSheetContext(req);
        if (!sheets || error) return NextResponse.json({ success: false, error: error || "Autentikasi gagal." }, { status: 401 });

        const targetSheetId = destinationSheetId || req.headers.get('x-sheet-id');
        if (!targetSheetId) return NextResponse.json({ success: false, error: 'Sheet ID Metalurgi tidak ditemukan.' }, { status: 400 });

        const sourceRes = await sheets.spreadsheets.values.get({
            spreadsheetId: SOURCE_SPREADSHEET_ID,
            range: `${SOURCE_SHEET_NAME}!A:H`
        });

        const rows = sourceRes.data.values || [];
        if (rows.length <= 1) return NextResponse.json({ success: true, message: 'Tidak ada data di Sheet Lapangan.', syncedCount: 0 });

        const newExpenses = [];
        const rowsToUpdate = [];

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const statusSync = row[7] || '';

            if (statusSync.toUpperCase() !== 'SYNCED') {
                const date = parseDate(row[0]);
                const categoryRaw = row[1] || '-';
                const desc = row[2] || '-';
                const source = row[3] || 'Kas';
                const amount = cleanMoney(row[4]);
                const attachment = row[5] || '';
                const costCenter = row[6] || 'HO - Pusat';

                if (amount === 0 && desc === '-') continue;

                const expenseId = `EXP-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;

                newExpenses.push([
                    expenseId,
                    date,
                    desc,
                    costCenter,
                    '',
                    '',
                    '',
                    0,
                    0,
                    amount,
                    source,
                    attachment,
                    'Pending',
                    '',
                    '',
                    `Row-${i + 1}`
                ]);

                rowsToUpdate.push(i + 1);
            }
        }

        if (newExpenses.length === 0) {
            return NextResponse.json({ success: true, message: 'Semua data lapangan sudah tersinkronisasi.', syncedCount: 0 });
        }

        await sheets.spreadsheets.values.append({
            spreadsheetId: targetSheetId,
            range: 'Trx_Expense!A:P',
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: newExpenses }
        });

        const updateData = rowsToUpdate.map(rowNum => ({
            range: `${SOURCE_SHEET_NAME}!H${rowNum}`,
            values: [['SYNCED']]
        }));

        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SOURCE_SPREADSHEET_ID,
            requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: updateData
            }
        });

        return NextResponse.json({
            success: true,
            message: `Berhasil menarik ${newExpenses.length} pengeluaran baru.`,
            syncedCount: newExpenses.length
        });

    } catch (error: any) {
        console.error("[SYNC API ERROR]", error);
        return NextResponse.json({ success: false, error: 'Gagal sinkronisasi: ' + error.message }, { status: 500 });
    }
}