"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type NavRailItemConfig = {
  key: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  disabled?: boolean;
};

export interface NavRailProps {
  items: NavRailItemConfig[];
  activeKey?: string | null;
  defaultActiveKey?: string | null;
  onChange?: (key: string | null) => void;
  toggleable?: boolean;
  className?: string;
}

export function NavRail({
  items,
  activeKey: controlledActiveKey,
  defaultActiveKey = null,
  onChange,
  toggleable = true,
  className,
}: NavRailProps) {
  const isControlled = controlledActiveKey !== undefined;
  const [uncontrolledActive, setUncontrolledActive] = React.useState<
    string | null
  >(defaultActiveKey);
  const activeKey = isControlled ? controlledActiveKey : uncontrolledActive;

  const listRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const setActive = React.useCallback(
    (key: string) => {
      const next = toggleable && activeKey === key ? null : key;
      if (!isControlled) setUncontrolledActive(next);
      onChange?.(next);
    },
    [activeKey, isControlled, onChange, toggleable]
  );

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement | HTMLButtonElement>
  ) => {
    const currentIndex = items.findIndex((i) => i.key === activeKey);
    const focusIndex = Math.max(
      0,
      itemRefs.current.findIndex((el) => el === document.activeElement)
    );
    const index = currentIndex >= 0 ? currentIndex : focusIndex;

    if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = (index - 1 + items.length) % items.length;
      itemRefs.current[prev]?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      const next = (index + 1) % items.length;
      itemRefs.current[next]?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const key = items[index]?.key;
      if (key && !items[index].disabled) setActive(key);
    } else if (e.key === "Escape" && toggleable) {
      e.preventDefault();
      if (!isControlled) setUncontrolledActive(null);
      onChange?.(null);
    }
  };

  return (
    <div
      className={cn("w-[88px] border-r border-border flex flex-col", className)}
      role="tablist"
      aria-orientation="vertical"
      onKeyDown={handleKeyDown}
      ref={listRef}
    >
      <div className="h-14 flex items-center justify-front px-3">
        <img src="/Lavoe.png" alt="Lavoe" className="h-5 w-auto" />
      </div>
      <div className="flex flex-col items-center pt-3 gap-2">
        {items.map((item, idx) => {
          const isActive = activeKey === item.key;
          return (
            <Button
              key={item.key}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              variant="ghost"
              role="tab"
              aria-selected={isActive}
              aria-controls={`nav-rail-panel-${item.key}`}
              disabled={item.disabled}
              className={cn(
                "w-16 h-16 rounded-xl flex flex-col items-center justify-center gap-2 group",
                isActive ? "bg-muted/50" : "hover:bg-muted/30"
              )}
              onClick={() => setActive(item.key)}
            >
              <div
                className={
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                }
              >
                <item.icon className="h-4.5 w-4.5 text-white" />
              </div>
              <span className="text-[11px] text-muted-foreground">
                {item.label}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export default NavRail;
