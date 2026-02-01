// apps/web/lib/apiClient.ts

export const apiClient = async (endpoint: string, options: RequestInit = {}) => {
    // 1. Cek apakah kode jalan di browser (Client Side)
    if (typeof window === 'undefined') {
      // Kalau dipanggil di Server Component, fetch biasa tanpa localStorage
      return fetch(endpoint, options);
    }
  
    // 2. Ambil Sheet ID dari LocalStorage
    const storedUser = localStorage.getItem('METALURGI_USER');
    let sheetId = '';
  
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser);
        sheetId = parsed.sheetId || '';
      } catch (e) {
        console.error("Gagal parse user data", e);
      }
    }
  
    // 3. Gabungkan Header Bawaan dengan Header x-sheet-id
    const headers = {
      'Content-Type': 'application/json',
      ...(sheetId && { 'x-sheet-id': sheetId }), // Hanya tambah header jika sheetId ada
      ...options.headers, // Gabung dengan header lain jika ada
    };
  
    // 4. Eksekusi Fetch
    const response = await fetch(endpoint, {
      ...options,
      headers,
    });
  
    // 5. Handle Error Umum (Opsional)
    // Misal: Jika backend balas 401 (Unauthorized), bisa auto-logout di sini
    if (response.status === 401) {
       console.warn("Sesi habis atau tidak valid");
       // window.location.href = '/login'; // Uncomment jika mau auto redirect
    }
  
    return response;
  };