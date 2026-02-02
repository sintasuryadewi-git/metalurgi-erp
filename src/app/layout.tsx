import type { Metadata } from "next";
import { Inter } from "next/font/google"; 
import "./globals.css";
import AppShell from "@/components/AppShell"; 

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Metalurgi Financial Command Center",
  description: "Integrated CFO Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AppShell>
            {children}
        </AppShell>
      </body>
    </html>
  );
}