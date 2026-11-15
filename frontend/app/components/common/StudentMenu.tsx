"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

/** The places a student can go. Add a line here to add a menu item. */
const ITEMS: { href: string; label: string; hint: string; icon: IconName }[] = [
  { href: "/student/", label: "Your learning path", hint: "Your lessons and where you are", icon: "book" },
  { href: "/student/code-runner/", label: "Code runner", hint: "Write and run Python to practise", icon: "code" },
];

/**
 * A dropdown in the student header. It is a button that shows or hides a list of links (the disclosure
 * pattern): Esc or a click outside closes it, and focus goes back to the button. The page you are on is marked.
 */
export function StudentMenu() {
  const pathname = usePathname();
  // The menu is open for the page it was opened on, so going to another page closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpenOn(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenOn(null);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const here = (href: string) => pathname.replace(/\/?$/, "/") === href;
  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        className="btn btn-secondary btn-sm"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
      >
        <Icon name="menu" className="size-4" />
        <span className="max-sm:sr-only">Menu</span>
        <Icon name={open ? "chevronDown" : "chevronRight"} className="size-4 text-muted max-sm:hidden" />
      </button>
      {open ? (
        <nav id={menuId} aria-label="Student menu" className="absolute right-0 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-hairline bg-surface p-1.5 shadow-[var(--shadow-lg)]">
          <ul className="flex flex-col">
            {ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={here(item.href) ? "page" : undefined}
                  className={`flex items-start gap-3 rounded-lg px-3 py-2.5 no-underline hover:bg-tint ${here(item.href) ? "bg-tint" : ""}`}
                >
                  <span className="icon-tile !size-9 shrink-0" aria-hidden="true">
                    <Icon name={item.icon} className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold text-ink">{item.label}</span>
                    <span className="block text-sm text-muted">{item.hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}
