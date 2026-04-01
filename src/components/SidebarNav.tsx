"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export interface SidebarNavItem {
  href: string;
  label: string;
  icon: string;
}

interface SidebarNavProps {
  items: SidebarNavItem[];
  activePath: string;
  hiddenClassName?: string;
  asideClassName?: string;
  header?: ReactNode;
  navClassName?: string;
  linkBaseClassName?: string;
  activeLinkClassName?: string;
  inactiveLinkClassName?: string;
  iconClassName?: string;
}

export default function SidebarNav({
  items,
  activePath,
  hiddenClassName = "hidden lg:flex",
  asideClassName = "bg-surface-low border-r border-border",
  header,
  navClassName = "flex-1 py-4",
  linkBaseClassName =
    "flex items-center space-x-3 px-4 py-3 font-['Inter',sans-serif] text-sm font-medium uppercase tracking-widest transition-colors",
  activeLinkClassName = "bg-surface-high text-accent border-l-4 border-accent",
  inactiveLinkClassName =
    "text-[#e1e2ec]/40 hover:bg-surface-high/50 hover:text-[#e1e2ec] border-l-4 border-transparent",
  iconClassName = "material-symbols-outlined text-[18px]",
}: SidebarNavProps) {
  return (
    <aside
      className={`w-64 shrink-0 flex-col overflow-y-auto custom-scrollbar ${asideClassName} ${hiddenClassName}`}
    >
      {header ?? (
        <div className="p-6 border-b border-border">
          <div className="flex items-center space-x-3 mb-1">
            <div className="w-2 h-2 rounded-full bg-vs2 animate-pulse" />
            <span className="text-lg font-black text-accent font-['Space_Grotesk',sans-serif]">
              OP-CENTER
            </span>
          </div>
        </div>
      )}

      <nav className={navClassName}>
        <div className="space-y-1">
          {items.map((item) => {
            const isActive = activePath === item.href;
            return (
              <Link
                key={item.label}
                href={item.href}
                prefetch={false}
                className={`${linkBaseClassName} ${
                  isActive ? activeLinkClassName : inactiveLinkClassName
                }`}
              >
                <span className={iconClassName}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
