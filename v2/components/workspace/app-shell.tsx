"use client";

import Link from "next/link";
import {
  usePathname,
  useRouter,
} from "next/navigation";
import { useMemo } from "react";

import styles from "./workspace-shell.module.css";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
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
};

export default function AppShell({
  children,
  organisation,
  memberships,
  sections,
  email,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const supabase = useMemo(
    () => createSupabaseBrowser(),
    [],
  );

  function sectionHref(
    section: WorkspaceSection,
  ) {
    const organisationQuery =
      `organisation=${encodeURIComponent(
        organisation.organisationId,
      )}`;

    return section.routeSegment
      ? `/workspace/${section.routeSegment}?${organisationQuery}`
      : `/workspace?${organisationQuery}`;
  }

  function sectionActive(
    section: WorkspaceSection,
  ) {
    if (!section.routeSegment) {
      return pathname === "/workspace";
    }

    return pathname.startsWith(
      `/workspace/${section.routeSegment}`,
    );
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link
          href={`/workspace?organisation=${encodeURIComponent(
            organisation.organisationId,
          )}`}
          className={styles.brand}
        >
          TT
          <span className={styles.brandAccent}>
            Tracker
          </span>
        </Link>

        <nav
          className={styles.globalNav}
          aria-label="Global navigation"
        >
          {sections.map((section) => (
            <Link
              key={section.key}
              href={sectionHref(section)}
              className={`${styles.navLink} ${
                sectionActive(section)
                  ? styles.navActive
                  : ""
              }`}
            >
              {section.label}
            </Link>
          ))}
        </nav>

        <div className={styles.accountArea}>
          {memberships.length > 1 ? (
            <select
              aria-label="Organisation"
              className={`tt-select ${styles.organisationSelect}`}
              value={
                organisation.organisationId
              }
              onChange={(event) => {
                router.push(
                  `/workspace?organisation=${encodeURIComponent(
                    event.target.value,
                  )}`,
                );
              }}
            >
              {memberships.map((item) => (
                <option
                  key={item.organisationId}
                  value={item.organisationId}
                >
                  {item.organisationName}
                </option>
              ))}
            </select>
          ) : (
            <div className={styles.organisation}>
              <div className={styles.organisationName}>
                {organisation.organisationName}
              </div>
            </div>
          )}

          <Link
            href="/account"
            className={styles.accountLink}
            title={email}
          >
            Account
          </Link>

          <button
            type="button"
            className={styles.signOut}
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {children}
      </main>
    </div>
  );
}
