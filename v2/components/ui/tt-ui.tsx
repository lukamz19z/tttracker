import type { ReactNode } from "react";
import Link from "next/link";

import styles from "./tt-ui.module.css";

export { styles as tt };

export function Page({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${styles.page} ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div>
        {eyebrow ? (
          <div className={styles.eyebrow}>
            {eyebrow}
          </div>
        ) : null}

        <h1 className={styles.title}>{title}</h1>

        {subtitle ? (
          <p className={styles.subtitle}>
            {subtitle}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div className={styles.actions}>
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export function ButtonLink({
  href,
  children,
  primary = false,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${styles.button} ${
        primary ? styles.buttonPrimary : ""
      }`}
    >
      {children}
    </Link>
  );
}

export function Card({
  children,
  padded = true,
  className = "",
}: {
  children: ReactNode;
  padded?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`${styles.card} ${
        padded ? styles.cardPad : ""
      } ${className}`}
    >
      {children}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className={styles.metricCard}>
      {icon ? (
        <div className={styles.metricIcon}>
          {icon}
        </div>
      ) : null}

      <div className={styles.metricLabel}>
        {label}
      </div>

      <div className={styles.metricValue}>
        {value}
      </div>

      {detail ? (
        <div className={styles.metricDetail}>
          {detail}
        </div>
      ) : null}
    </div>
  );
}

export function StatusBadge({
  status,
}: {
  status: string;
}) {
  const active =
    ["active", "open", "in_progress"].includes(
      status.toLowerCase(),
    );

  return (
    <span
      className={`${styles.status} ${
        active ? styles.statusActive : ""
      }`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function ProgressBar({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const pct = Math.max(
    0,
    Math.min(100, Number(value) || 0),
  );

  return (
    <div className={styles.metricCard}>
      <div className={styles.progressHeader}>
        <span className={styles.progressLabel}>
          {label}
        </span>
        <span className={styles.progressValue}>
          {pct.toFixed(0)}%
        </span>
      </div>

      <div className={styles.progressWrap}>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyTitle}>
        {title}
      </div>
      {children ? (
        <div className={styles.emptyText}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function QuickCard({
  href,
  icon,
  title,
  detail,
}: {
  href: string;
  icon?: ReactNode;
  title: string;
  detail?: ReactNode;
}) {
  return (
    <Link href={href} className={styles.quickCard}>
      {icon ? (
        <div className={styles.quickIcon}>
          {icon}
        </div>
      ) : null}
      <div className={styles.quickTitle}>
        {title}
      </div>
      {detail ? (
        <div className={styles.quickDetail}>
          {detail}
        </div>
      ) : null}
    </Link>
  );
}
