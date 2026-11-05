"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";

import { createSupabaseBrowser } from "@/lib/supabase";
import { useAccess } from "@/components/access/access-provider";

type WebsiteRole =
  | "admin"
  | "finance"
  | "hseq"
  | "asset_manager"
  | "commercial"
  | "editor"
  | "crew"
  | "viewer";

function normaliseWebsiteRole(value?: string | null): WebsiteRole {
  const role = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  if (role === "administrator" || role === "site_admin") return "admin";
  if (role === "financial" || role === "accounts") return "finance";
  if (role === "safety" || role === "safety_manager") return "hseq";
  if (role === "assets" || role === "mechanic") return "asset_manager";
  if (role === "commercial_manager") return "commercial";
  if (role === "leading_hand" || role === "field") return "crew";

  if (
    [
      "admin",
      "finance",
      "hseq",
      "asset_manager",
      "commercial",
      "editor",
      "crew",
      "viewer",
    ].includes(role)
  ) {
    return role as WebsiteRole;
  }

  return "viewer";
}

export function Topbar() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const { loading: accessLoading, websiteRole } = useAccess();
  const role: WebsiteRole | null = accessLoading ? null : normaliseWebsiteRole(websiteRole);
  const roleLoaded = !accessLoading;

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

  const isFinance = role === "finance";
  const isAdmin = role === "admin";
  const homeHref = isFinance ? "/expenses" : "/";

  return (
    <header className="sticky top-0 z-50 bg-white border-b">
      <div className="h-16 px-6 flex items-center justify-between">
        <Link
          href={homeHref}
          className="text-2xl font-bold tracking-tight text-slate-900 hover:text-slate-700"
        >
          TTTracker
        </Link>

        <nav className="hidden md:flex items-center gap-2">
          {roleLoaded ? (
            <>
              {isFinance ? (
                <>
                  <Link
                    href="/expenses"
                    className={navStyle("/expenses")}
                  >
                    Finance
                  </Link>

                  <Link
                    href="/profile"
                    className={navStyle("/profile")}
                  >
                    Profile
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/" className={navStyle("/")}>
                    Projects
                  </Link>

                  {isAdmin ? (
                    <Link
                      href="/expenses"
                      className={navStyle("/expenses")}
                    >
                      Finance
                    </Link>
                  ) : null}

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
                </>
              )}
            </>
          ) : null}

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
