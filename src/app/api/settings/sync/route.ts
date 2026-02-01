import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// ID MASTER DB
const MASTER_DB_ID = '1Kw14wD8IHQW796loZC0H7rmZfZ5hOWN3k-2K1zT-uNw';
const MASTER_SHEET_TAB = 'Client_Directory';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email) return NextResponse.json({ success: false, error: 'Email required' }, { status: 400 });

    // 1. AUTH
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // 2. LOOKUP SHEET ID USER DARI MASTER DB
    const masterRes = await sheets.spreadsheets.values.get({
        spreadsheetId: MASTER_DB_ID,
        range: `'${MASTER_SHEET_TAB}'!A:E`,
    });

    const rows = masterRes.data.values || [];
    const userRow = rows.find((r: any) => r[0] && r[0].trim().toLowerCase() === email.trim().toLowerCase());

    if (!userRow) return NextResponse.json({ success: false, error: 'User tidak ditemukan di Master DB' }, { status: 404 });
    
    const targetSheetId = userRow[4]; // Kolom E
    const userName = userRow[2]; // Kolom C (Full Name)
    const userRole = userRow[3]; // Kolom D (Role)

    // 3. FETCH ALL CONFIG DATA PARALLEL
    // SAYA SUDAH HAPUS 'Master_Division' dari sini agar tidak error
    const ranges = [
        'Master_Cashier!A:C',   // 0
        'Master_Shift!A:C',     // 1
        'Master_Promo!A:D',     // 2
        'Settings_Receipt!A:E', // 3
        'Master_COA!A:E',       // 4
        'Master_Product!A:F',   // 5
        'Master_Partner!A:E',   // 6
        'Master_UoM!A:C',       // 7
        'Settings_Account_Mapping!A:F' // 8
    ];

    const batchRes = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: targetSheetId,
        ranges: ranges
    });

    const valueRanges = batchRes.data.valueRanges || [];

    // Helper: Convert Rows to JSON Array
    const toJson = (rows: any[], headers: string[]) => {
        if (!rows || rows.length < 2) return [];
        return rows.slice(1).map(row => {
            let obj: any = {};
            headers.forEach((h, i) => obj[h] = row[i] || '');
            return obj;
        });
    };

    // 4. MAPPING RESULT
    const payload = {
        user: { name: userName, role: userRole, sheetId: targetSheetId },
        cashiers: toJson(valueRanges[0].values || [], ['Name', 'ID', 'Role']),
        shifts: toJson(valueRanges[1].values || [], ['Shift_Name', 'Start_Time', 'End_Time']),
        promos: toJson(valueRanges[2].values || [], ['Promo_Name', 'Type', 'Value', 'Target_SKU']),
        receipt: toJson(valueRanges[3].values || [], ['Store_Name', 'Address', 'Phone', 'Footer'])[0] || {}, 
        coa: toJson(valueRanges[4].values || [], ['Account_Code', 'Account_Name', 'Type', 'Category', 'Opening_Balance']),
        products: toJson(valueRanges[5].values || [], ['SKU', 'Product_Name', 'Category', 'UoM', 'Std_Cost_Budget', 'Sell_Price_List']),
        partners: toJson(valueRanges[6].values || [], ['Partner_ID', 'Name', 'Type', 'Phone', 'Email']),
        uom: toJson(valueRanges[7].values || [], ['Unit_ID', 'Unit_Name', 'Ratio']),
        mapping: toJson(valueRanges[8].values || [], ['Mapping_ID', 'Type', 'Identifier', 'Sales_Account', 'COGS_Account', 'Inventory_Account']),
    };

    return NextResponse.json({ success: true, data: payload });

  } catch (error: any) {
    console.error("Settings Sync Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}