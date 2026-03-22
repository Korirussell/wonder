"use client";

import { useAbleton } from "@/lib/AbletonContext";
import Link from "next/link";
import { usePathname } from "next/navigation";
import UserProfileDropdown from "./UserProfileDropdown";

export default function Header() {
  const { connected } = useAbleton();
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Studio" },
    { href: "/library", label: "Library" },
    { href: "/analytics", label: "Analytics" },
    { href: "/feedback", label: "Feedback" },
  ];

  return (
    <nav className="relative z-70 flex h-14 shrink-0 items-center justify-between border-b-2 border-[#2D2D2D] bg-[#FDFDFB] px-6 hard-shadow">
      <div className="flex items-center gap-8">
        <span className="font-headline text-2xl font-black italic tracking-tighter text-[#2D2D2D]">
          Wonder
        </span>
        <div className="hidden gap-6 md:flex">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  isActive
                    ? "border-b-2 border-[#C1E1C1] pb-0.5 font-headline text-sm font-bold text-[#2D2D2D]"
                    : "font-headline text-sm font-bold text-[#2D2D2D]/50 transition-colors hover:text-[#2D2D2D]"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-xl border-2 border-[#2D2D2D] bg-white px-3 py-1.5 hard-shadow-sm">
          <div className={`h-1.5 w-1.5 rounded-full border border-[#2D2D2D] ${connected ? "bg-[#C1E1C1]" : "bg-[#fa7150] animate-pulse"}`} />
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest">
            {connected ? "Ableton Live" : "Not Connected"}
          </span>
        </div>

        <div className="my-1">
          <UserProfileDropdown />
        </div>
      </div>
    </nav>
  );
}
