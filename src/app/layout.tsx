import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { CopilotPanel } from "@/components/ai/CopilotPanel";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { NotificationChecker } from "@/components/shared/NotificationChecker";
import { BridgeStatusPoller } from "@/components/shared/BridgeStatusPoller";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Niuro CRM",
  description:
    "CRM de venta consultiva por WhatsApp para Niuro: playbook, leads priorizados y tu jugada del dia.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      {/* Prevent flash: apply saved theme class before first paint */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');document.documentElement.classList.add(t==='dark'?'dark':'light');}catch(e){}})();` }} />
      </head>
      <body className="min-h-full flex" suppressHydrationWarning>
          <TooltipProvider>
            <Sidebar />
            <div className="flex-1 flex flex-col h-screen min-w-0">
              <Header />
              <main className="flex-1 min-h-0 bg-background overflow-hidden">
                {children}
              </main>
            </div>
            <Toaster />
            <NotificationChecker />
            <BridgeStatusPoller />
            <CommandPalette />
            <CopilotPanel />
          </TooltipProvider>
      </body>
    </html>
  );
}
