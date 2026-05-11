"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

export function Topbar() {
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

    return `px-4 py-2 rounded-xl text-sm font-semibold transition ${
      isActive
        ? "bg-slate-900 text-white"
        : "text-slate-600 hover:bg-slate-100"
    }`;
  }

  return (
    <header className="sticky top-0 z-50 bg-white border-b">
      <div className="h-16 px-6 flex items-center justify-between">
        <Link
          href="/"
          className="text-2xl font-bold tracking-tight text-slate-900 hover:text-slate-700"
        >
          TTTracker
        </Link>

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
            className="ml-3 bg-slate-900 text-white px-5 py-2 rounded-xl text-sm font-semibold hover:bg-slate-800"
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  );
}