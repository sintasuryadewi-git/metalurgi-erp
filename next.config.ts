import type { NextConfig } from "next";

// Konfigurasi PWA
const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === "development", // Disable PWA di mode dev
  workboxOptions: {
    disableDevLogs: true,
  },
});

const nextConfig: NextConfig = {
  /* config options here */
  // Anda bisa tambahkan config lain di sini jika perlu, misal:
  // reactStrictMode: true, 
};

// Bungkus config asli dengan withPWA
export default withPWA(nextConfig);