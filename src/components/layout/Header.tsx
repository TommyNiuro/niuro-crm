"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { MobileNav } from "./MobileNav";

/** Barra superior SOLO en móvil. En desktop cada vista maneja su propio header. */
export function Header() {
  return (
    <header className="md:hidden sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-card px-4">
      <Sheet>
        <SheetTrigger
          render={<Button variant="ghost" size="icon" className="cursor-pointer" />}
        >
          <Menu className="h-5 w-5" />
        </SheetTrigger>
        <SheetContent side="left" className="w-[220px] p-0">
          <MobileNav />
        </SheetContent>
      </Sheet>
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold text-xs">N</div>
        <span className="text-sm font-semibold tracking-tight">Niuro CRM</span>
      </div>
    </header>
  );
}
