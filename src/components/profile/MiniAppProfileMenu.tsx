"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import columnsLogo from "../../../public/columns-logo.png";
import farcasterLogoWhite from "../../../public/farcaster-logo-white.png";

export interface MiniAppProfileMenuItem {
  id: string;
  label: string;
  onClick?: () => void;
  href?: string;
  icon?: "columns" | "farcaster";
  hidden?: boolean;
  disabled?: boolean;
}

export function MiniAppProfileMenu({ items }: { items: MiniAppProfileMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const visibleItems = items.filter((item) => !item.hidden);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  if (visibleItems.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full py-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-sm font-medium text-[var(--foreground)]"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        Menu
      </button>

      {open && (
        <ul
          role="menu"
          className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-lg overflow-hidden z-20"
        >
          {visibleItems.map((item) => {
            const content = (
              <>
                {item.icon === "columns" && (
                  <Image
                    src={columnsLogo}
                    alt=""
                    width={16}
                    height={16}
                    className="rounded-sm object-cover shrink-0"
                  />
                )}
                {item.icon === "farcaster" && (
                  <Image
                    src={farcasterLogoWhite}
                    alt=""
                    width={16}
                    height={16}
                    className="rounded-sm object-cover shrink-0"
                  />
                )}
                <span className="truncate">{item.label}</span>
              </>
            );

            const className =
              "w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm font-medium text-[var(--foreground)] hover:bg-[var(--surface-hover)]";

            if (item.href) {
              const external = item.href.startsWith("http");
              return (
                <li key={item.id} role="none">
                  <a
                    role="menuitem"
                    href={item.href}
                    {...(external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className={className}
                    onClick={() => setOpen(false)}
                  >
                    {content}
                  </a>
                </li>
              );
            }

            return (
              <li key={item.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={className}
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return;
                    setOpen(false);
                    item.onClick?.();
                  }}
                >
                  {content}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
