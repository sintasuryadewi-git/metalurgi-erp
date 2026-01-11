import Papa from 'papaparse';

// ID Google Sheet (Pastikan sheet 'Settings_Account_Mapping' sudah dibuat di sini)
const SHEET_ID = '1bjFsLLbhEjJBzvN9Hh1ZX0tZJKtNHpbu26c_OhTmaTg'; 

export const fetchSheetData = async (sheetName: string) => {
  try {
    // Validasi ID
    if (SHEET_ID.includes('http')) {
       console.error("ERROR: SHEET_ID tidak boleh URL lengkap. Masukkan ID saja.");
       return [];
    }

    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${sheetName}`;
    
    // Log untuk debugging flow baru
    console.log(`Fetching data from sheet: ${sheetName}...`);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Gagal mengambil data sheet: ${sheetName}`);
    
    const csvText = await response.text();

    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results: any) => {
            console.log(`Success: ${sheetName} loaded (${results.data.length} rows)`);
            resolve(results.data);
        },
        error: (err: any) => {
            console.error(`Parse Error in ${sheetName}:`, err);
            reject(err);
        },
      });
    });
  } catch (error) {
    console.error(`Network/Fetch Error ${sheetName}:`, error);
    return [];
  }
};