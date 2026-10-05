"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Backlog" },
  { href: "/how-it-works", label: "How it works" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-neutral-900">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-md bg-indigo-600 text-xs font-bold text-white"
            >
              FI
            </span>
            <span className="hidden sm:inline">Feature Intelligence</span>
          </Link>
          <nav aria-label="Main" className="flex items-center sm:gap-1">
            {NAV_LINKS.map((link) => {
              const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-2 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:px-3 ${
                    active ? "bg-neutral-100 text-neutral-900" : "text-neutral-600 hover:text-neutral-900"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <Link
          href="/requests/new"
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold whitespace-nowrap text-white sm:px-3.5 shadow-sm transition-colors hover:bg-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          <span className="sm:hidden">Submit</span>
          <span className="hidden sm:inline">Submit request</span>
        </Link>
      </div>
    </header>
  );
}
