// apps/web/lib/demoData.ts

export const seedDemoData = () => {
    // Cek apakah sudah ada data, kalau ada jangan ditimpa
    if (localStorage.getItem('METALURGI_GL_JOURNALS')) return;

    console.log("Seeding Demo Data...");

    // 1. DUMMY GL (Jurnal Umum)
    const dummyGL = [
        { date: '2026-01-01', desc: 'Saldo Awal Kas', debit_acc: '1-1001', credit_acc: '3-1001', amount: 500000000 },
        { date: '2026-01-05', desc: 'Penjualan Batch A', debit_acc: '1-1002', credit_acc: '4-1001', amount: 25000000 },
        { date: '2026-01-10', desc: 'Beli Bahan Baku Besi', debit_acc: '1-1301', credit_acc: '1-1002', amount: 12000000 },
        { date: '2026-01-15', desc: 'Bayar Gaji Staff', debit_acc: '6-2001', credit_acc: '1-1002', amount: 8500000 },
    ];

    // 2. DUMMY EMPLOYEES
    const dummyEmp = [
        { Employee_ID: 'EMP-01', Full_Name: 'Budi Santoso', Basic_Salary: 5000000, Employment_Type: 'PERMANENT', Department: 'Production' },
        { Employee_ID: 'EMP-02', Full_Name: 'Siti Aminah', Basic_Salary: 4500000, Employment_Type: 'PERMANENT', Department: 'Sales' },
    ];

    // INJECT KE LOCAL STORAGE
    localStorage.setItem('METALURGI_GL_JOURNALS', JSON.stringify(dummyGL));
    localStorage.setItem('METALURGI_DEMO_EMPLOYEES', JSON.stringify(dummyEmp));
    
    // Set flag
    localStorage.setItem('METALURGI_IS_DEMO_DATA', 'true');
};