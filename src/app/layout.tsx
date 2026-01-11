import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "./components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Metalurgi V3 - CFO Dashboard",
  description: "Financial & Inventory Management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-slate-50 text-slate-900`}>
        <div className="min-h-screen">
          
          {/* PERBAIKAN 1: Hapus div wrapper 'w-64'. 
            Sidebar dipanggil langsung karena dia sudah punya properti 'fixed' di dalamnya.
          */}
          <Sidebar />
          
          {/* PERBAIKAN 2: Main Content Responsif 
            - ml-0: Di HP margin kiri 0 (full width)
            - md:ml-64: Di Laptop margin kiri 64 (memberi tempat untuk sidebar)
            - p-4 md:p-8: Padding lebih kecil di HP biar muat banyak
          */}
          <main className="flex-1 ml-0 md:ml-64 transition-all duration-300 p-4 md:p-8 min-h-screen">
            
            {/* PERBAIKAN 3: Top Margin di Mobile
              - mt-12: Di HP, konten turun sedikit supaya judul tidak tertutup tombol Hamburger Menu
              - md:mt-0: Di Laptop, konten naik normal
            */}
            <div className="max-w-7xl mx-auto mt-12 md:mt-0">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}