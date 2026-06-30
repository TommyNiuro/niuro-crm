import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Build standalone (server autocontenido) solo para el empaquetado desktop
  // (Tauri). Se activa con BUILD_STANDALONE=1; el `npm run local` normal no se
  // ve afectado y sigue usando `next start`.
  ...(process.env.BUILD_STANDALONE ? { output: "standalone" as const } : {}),
  // Security headers (auditoría 2026-06-09). Sin CSP: el script inline del tema
  // lo rompería sin un esquema de nonces que no se justifica en una app local.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
