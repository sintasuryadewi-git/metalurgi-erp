import { NextResponse } from 'next/server';
import { google } from 'googleapis';

// CONFIG
const MASTER_DB_ID = '1Kw14wD8IHQW796loZC0H7rmZfZ5hOWN3k-2K1zT-uNw';
const MASTER_SHEET_TAB = 'Client_Directory';

export async function POST(req: Request) {
  try {
    const { oldEmail, password, newName, newEmail, newPassword } = await req.json();

    if (!oldEmail || !password) {
        return NextResponse.json({ success: false, error: 'Password saat ini diperlukan untuk verifikasi.' }, { status: 400 });
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

    // 2. AMBIL SEMUA USER
    const getRes = await sheets.spreadsheets.values.get({
        spreadsheetId: MASTER_DB_ID,
        range: `'${MASTER_SHEET_TAB}'!A:E`, // A:Email, B:Name, C:Role, D:Pass, E:SheetID
    });

    const rows = getRes.data.values || [];
    
    // 3. CARI POSISI BARIS USER (Berdasarkan Email Lama)
    const rowIndex = rows.findIndex((r: any) => r[0] && r[0].trim().toLowerCase() === oldEmail.trim().toLowerCase());

    if (rowIndex === -1) {
        return NextResponse.json({ success: false, error: 'User tidak ditemukan di Master DB.' }, { status: 404 });
    }

    // 4. CEK PASSWORD LAMA (SECURITY)
    // Ingat: Di Sheet, Password ada di Kolom D (index 3)
    const userRow = rows[rowIndex];
    const dbPassword = userRow[3]; 

    if (String(dbPassword) !== String(password)) {
        return NextResponse.json({ success: false, error: 'Password lama salah. Gagal menyimpan.' }, { status: 401 });
    }

    // 5. SIAPKAN DATA BARU (Timpa jika ada input baru, pakai lama jika kosong)
    const updatedName = newName || userRow[1];
    const updatedEmail = newEmail || userRow[0];
    const updatedPassword = newPassword || userRow[3]; // Ganti password jika diisi
    const role = userRow[2];
    const sheetId = userRow[4];

    // 6. UPDATE KE GOOGLE SHEET
    // rowIndex + 1 karena array mulai dari 0 tapi sheet row mulai dari 1
    const rangeToUpdate = `'${MASTER_SHEET_TAB}'!A${rowIndex + 1}:E${rowIndex + 1}`;

    await sheets.spreadsheets.values.update({
        spreadsheetId: MASTER_DB_ID,
        range: rangeToUpdate,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
            values: [[updatedEmail, updatedName, role, updatedPassword, sheetId]]
        }
    });

    return NextResponse.json({ 
        success: true, 
        message: 'Profil berhasil diperbarui.',
        user: { name: updatedName, email: updatedEmail, role: role, sheetId: sheetId }
    });

  } catch (error: any) {
    console.error("Update Profile Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}