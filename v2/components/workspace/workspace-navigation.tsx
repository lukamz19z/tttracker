"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./workspace-navigation.module.css";

export type NavigationItem = { label: string; href: string; active?: boolean };

export function WorkspaceHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return <header className={styles.workspaceHeading}><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</header>;
}

export function PageHeading({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return <header className={styles.pageHeading}><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{actions}</header>;
}

export function WorkspaceTabs({ items, label = "Workspace navigation" }: { items: NavigationItem[]; label?: string }) {
  return <nav className={styles.workspaceTabs} aria-label={label}>{items.map(item => <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}>{item.label}</Link>)}</nav>;
}

export function ContextTabs({ items, label }: { items: NavigationItem[]; label: string }) {
  return <nav className={styles.contextTabs} aria-label={label}>{items.map(item => <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}>{item.label}</Link>)}</nav>;
}

export function Breadcrumbs({ items }: { items: NavigationItem[] }) {
  return <nav className={styles.breadcrumbs} aria-label="Breadcrumb"><ol>{items.map((item, index) => <li key={`${item.label}-${index}`}>{index > 0 && <span aria-hidden="true">/</span>}{item.active ? <span aria-current="page">{item.label}</span> : <Link href={item.href}>{item.label}</Link>}</li>)}</ol></nav>;
}

export function ConfigurationLayout({ items, activeKey, children, label = "Configuration sections" }: { items: Array<NavigationItem & { key: string }>; activeKey: string; children: React.ReactNode; label?: string }) {
  const router = useRouter();
  const active = items.find(item => item.key === activeKey) ?? items[0];
  return <div className={styles.configurationLayout}>
    <aside className={styles.configurationSidebar} aria-label={label}>
      {items.map(item => <Link key={item.key} href={item.href} aria-current={item.key === activeKey ? "page" : undefined}>{item.label}</Link>)}
      <label className={styles.configurationSelectLabel}>Configuration section
        <select value={active?.key ?? ""} onChange={event => { const target = items.find(item => item.key === event.target.value); if (target) router.push(target.href); }}>
          {items.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </label>
    </aside>
    <div className={styles.configurationContent}>{children}</div>
  </div>;
}
