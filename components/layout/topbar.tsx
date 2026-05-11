"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

export function Topbar({ title }: { title?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createSupabaseBrowser();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function navStyle(href: string) {
    const isActive =
      href === "/"
        ? pathname === "/"
        : pathname === href || pathname.startsWith(href + "/");

    return `
      px-4 py-2 rounded-xl text-sm font-medium transition
      ${
        isActive
          ? "bg-slate-900 text-white"
          : "text-slate-600 hover:bg-slate-100"
      }
    `;
  }

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b">
      <div className="px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 min-w-0">
          <Link
            href="/"
            className="text-2xl font-bold tracking-tight whitespace-nowrap hover:text-slate-700 transition"
          >
            TTTracker
          </Link>

          {title && (
            <div className="hidden lg:block border-l pl-5 min-w-0">
              <p className="text-xs uppercase tracking-wider text-slate-400">
                Current Page
              </p>
              <h1 className="text-sm font-semibold text-slate-700 truncate">
                {title}
              </h1>
            </div>
          )}
        </div>

        <nav className="hidden md:flex items-center gap-2">
          <Link href="/" className={navStyle("/")}>
            Projects
          </Link>

          <Link href="/admin" className={navStyle("/admin")}>
            Admin
          </Link>

          <Link href="/settings" className={navStyle("/settings")}>
            Settings
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="ml-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-800 transition"
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}