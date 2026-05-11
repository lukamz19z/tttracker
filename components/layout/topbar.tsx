"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

export function Topbar({ title }: { title: string }) {
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
      pathname === href || pathname.startsWith(href + "/");

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
    <header className="sticky top-0 z-40 bg-white border-b">
      <div className="px-6 py-4 flex items-center justify-between gap-4">

        {/* LEFT */}
        <div className="flex items-center gap-6">
          <h1 className="text-2xl font-bold tracking-tight whitespace-nowrap">
            {title}
          </h1>

          <nav className="hidden md:flex items-center gap-2">
            <Link href="/" className={navStyle("/")}>
              Projects
            </Link>

            <Link
              href="/admin"
              className={navStyle("/admin")}
            >
              Admin
            </Link>

            <Link
              href="/settings"
              className={navStyle("/settings")}
            >
              Settings
            </Link>
          </nav>
        </div>

        {/* RIGHT */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleLogout}
            className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-800 transition"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}