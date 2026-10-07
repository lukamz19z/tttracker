"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Menu, Search } from "lucide-react";
import styles from "./workspace-shell.module.css";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { workspaceHref } from "@/lib/workspace/navigation";
import type {
  WorkspaceMembership,
  WorkspaceSection,
} from "@/lib/workspace/types";

type Props = {
  children: React.ReactNode;
  organisation: WorkspaceMembership;
  memberships: WorkspaceMembership[];
  sections: WorkspaceSection[];
  email: string;
  contextKind?: "organisation" | "client";
  platformAdmin?: boolean;
};

export default function AppShell({
  children,
  organisation,
  memberships,
  sections,
  email,
  contextKind = "organisation",
  platformAdmin = false,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowser(), []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [organisationSearch, setOrganisationSearch] = useState("");
  useEffect(() => {
    // A preference only; every destination validates membership/access on the server.
    document.cookie = `tttracker-workspace=${encodeURIComponent(organisation.organisationId)}; Path=/; SameSite=Lax; Max-Age=2592000`;
  }, [organisation.organisationId]);
  async function signOut() {
    document.cookie = "tttracker-workspace=; Path=/; Max-Age=0; SameSite=Lax";
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.identity}>
          <Link
            href={workspaceHref(organisation.organisationId)}
            className={styles.brand}
          >
            TT<span className={styles.brandAccent}>Tracker</span>
          </Link>
          {memberships.length > 1 ? (
            <details className={styles.switcher}>
              <summary>
                <span className={styles.organisationName}>
                  {organisation.organisationName}
                </span>{" "}
                <ChevronDown size={14} />
              </summary>
              <div className={styles.switcherPanel}>
                <label>
                  <Search size={14} />
                  <input
                    aria-label="Search organisations"
                    placeholder="Search organisations..."
                    value={organisationSearch}
                    onChange={(e) => setOrganisationSearch(e.target.value)}
                  />
                </label>
                {memberships
                  .filter((m) =>
                    `${m.organisationName} ${m.organisationCode}`
                      .toLowerCase()
                      .includes(organisationSearch.toLowerCase()),
                  )
                  .map((m) => (
                    <Link
                      key={m.organisationId}
                      href={workspaceHref(m.organisationId)}
                    >
                      {m.organisationName}
                    </Link>
                  ))}
              </div>
            </details>
          ) : (
            <span className={styles.organisationName}>
              {organisation.organisationName}
            </span>
          )}
          <span className={styles.contextLabel}>
            {contextKind === "client" ? "Client workspace" : "Organisation"}
          </span>
        </div>
        <button
          className={styles.mobileToggle}
          aria-label="Toggle global navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <Menu size={20} />
        </button>
        <nav
          className={`${styles.globalNav} ${mobileOpen ? styles.mobileOpen : ""}`}
          aria-label="Global navigation"
        >
          {sections.map((section) => (
            <Link
              key={section.key}
              href={workspaceHref(
                organisation.organisationId,
                section.routeSegment,
              )}
              onClick={() => setMobileOpen(false)}
              className={`${styles.navLink} ${(!section.routeSegment ? pathname === "/workspace" : pathname.startsWith(`/workspace/${section.routeSegment}`)) ? styles.navActive : ""}`}
            >
              {section.label}
            </Link>
          ))}
        </nav>
        <details className={styles.accountMenu}>
          <summary>
            Account <ChevronDown size={14} />
          </summary>
          <div className={styles.switcherPanel}>
            <small>{email}</small>
            <Link
              href={`/account?organisation=${encodeURIComponent(organisation.organisationId)}`}
            >
              Personal account
            </Link>
            {platformAdmin && (
              <Link href="/platform-admin">Platform Admin</Link>
            )}
            <button onClick={() => void signOut()}>Sign out</button>
          </div>
        </details>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
