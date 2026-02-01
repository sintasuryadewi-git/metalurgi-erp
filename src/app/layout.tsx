import type { Metadata, Viewport } from "next"; // Tambahkan Viewport di sini
import { Inter } from "next/font/google"; 
import "./globals.css";
import AppShell from "@/components/AppShell"; 

const inter = Inter({ subsets: ["latin"] });

// 1. Update Metadata (Tambahkan Manifest & Icon)
export const metadata: Metadata = {
  title: "Metalurgi Financial Command Center",
  description: "Integrated CFO Platform",
  manifest: "/manifest.json", // PENTING: Link ke file manifest
  icons: {
    apple: "/icons/icon-192x192.png", // Icon khusus iOS
  },
};

// 2. Tambahkan Config Viewport (Agar rasa 'Native App' di HP)
export const viewport: Viewport = {
  themeColor: "#2563eb", // Warna toolbar browser (sesuai tema biru Metalurgi)
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Mencegah user zoom-cubit (biar terasa seperti aplikasi native)
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* AppShell tetap membungkus konten seperti sebelumnya */}
        <AppShell>
            {children}
        </AppShell>
      </body>
    </html>
  );
}