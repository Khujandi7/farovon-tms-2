"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "@/components/common/logo";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import type { SectionId } from "@/lib/auth/roles";

export function MobileNav({ sections }: { sections: SectionId[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Открыть меню" data-testid="mobile-nav-trigger">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-4">
        <SheetTitle className="sr-only">Меню FAROVON TMS</SheetTitle>
        <SheetDescription className="sr-only">Разделы системы</SheetDescription>
        <div className="mb-6 px-1 pt-1">
          <Logo />
        </div>
        <SidebarNav sections={sections} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
