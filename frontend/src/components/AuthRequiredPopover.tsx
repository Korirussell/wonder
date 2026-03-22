"use client";

import Link from "next/link";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  disabled: boolean;
  message: string;
  className?: string;
  align?: "left" | "right" | "center";
}

export default function AuthRequiredPopover({
  children,
  disabled,
  message,
  className,
  align = "right",
}: Props) {
  if (!disabled) {
    return <>{children}</>;
  }

  const positionClass =
    align === "left"
      ? "left-0"
      : align === "center"
        ? "left-1/2 -translate-x-1/2"
        : "right-0";

  return (
    <div className={`group relative ${className ?? ""}`}>
      <div className="pointer-events-none opacity-45 grayscale">
        {children}
      </div>

      <div className={`invisible pointer-events-none absolute top-[calc(100%+10px)] z-[90] w-64 translate-y-1 opacity-0 transition-all duration-150 group-hover:visible group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 ${positionClass}`}>
        <div className="rounded-2xl border-2 border-[#2D2D2D] bg-[#FDFDFB] p-3 hard-shadow">
          <p className="font-headline text-sm font-bold">Account required</p>
          <p className="mt-1 text-xs leading-relaxed opacity-70">{message}</p>
          <div className="mt-3 flex gap-2">
            <Link
              href="/sign-in"
              className="flex-1 rounded-xl border-2 border-[#2D2D2D] bg-[#C1E1C1] px-3 py-2 text-center font-headline text-sm font-bold hard-shadow-sm interactive-push"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="flex-1 rounded-xl border-2 border-[#2D2D2D] bg-white px-3 py-2 text-center font-headline text-sm font-bold hard-shadow-sm interactive-push"
            >
              Sign up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
