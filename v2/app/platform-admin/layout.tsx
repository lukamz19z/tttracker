import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/platform/server";
import styles from "./platform-shell.module.css";
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    await requirePlatformAdmin();
  } catch (e) {
    if (e instanceof Error && e.message === "UNAUTHENTICATED")
      redirect("/login");
    if (e instanceof Error && e.message === "FORBIDDEN") notFound();
    throw e;
  }
  return (
    <div>
      <header className={styles.header}>
        <strong>TTTracker Platform</strong>
        <Link href="/workspace">Back to workspace</Link>
      </header>
      <div className={styles.body}>
        <p className={styles.label}>Platform Administration</p>
        <nav aria-label="Platform navigation" className={styles.nav}>
          {[
            ["", "Overview"],
            ["organisations", "Organisations"],
            ["plans", "Plans & Modules"],
            ["integrations", "Integrations"],
            ["invitations", "Invitations"],
            ["users", "Platform Users"],
          ].map(([route, label]) => (
            <Link
              key={label}
              href={`/platform-admin${route ? `/${route}` : ""}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </div>
  );
}
