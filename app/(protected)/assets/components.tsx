import Link from "next/link";
import type { ReactNode } from "react";

type Tone = "slate" | "blue" | "emerald" | "amber" | "rose" | "violet";

export type RegisterColumn<T> = {
  label: string;
  render: (item: T) => ReactNode;
  className?: string;
};

export function toneClasses(tone: Tone) {
  switch (tone) {
    case "blue":
      return "border-blue-100 bg-blue-50 text-blue-700";
    case "emerald":
      return "border-emerald-100 bg-emerald-50 text-emerald-700";
    case "amber":
      return "border-amber-100 bg-amber-50 text-amber-700";
    case "rose":
      return "border-rose-100 bg-rose-50 text-rose-700";
    case "violet":
      return "border-violet-100 bg-violet-50 text-violet-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-5 md:space-y-6">{children}</div>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <section className="border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </section>
  );
}

export function ActionButton({
  href,
  children,
  icon,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const classes =
    variant === "primary"
      ? "bg-slate-950 text-white hover:bg-slate-800"
      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <Link
      href={href}
      className={`inline-flex min-h-10 items-center gap-2 px-3 text-sm font-semibold transition ${classes}`}
    >
      {icon}
      {children}
    </Link>
  );
}

export function KpiCard({
  label,
  value,
  detail,
  tone = "slate",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: Tone;
}) {
  return (
    <div className={`border p-4 shadow-sm sm:p-5 ${toneClasses(tone)}`}>
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-sm leading-5 text-slate-600">{detail}</p>
    </div>
  );
}

export function StatusBadge({
  label,
  tone = "slate",
}: {
  label: string;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap border px-2.5 py-1 text-xs font-semibold ${toneClasses(
        tone,
      )}`}
    >
      {label}
    </span>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3 border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
  );
}

export function FilterInput({ placeholder }: { placeholder: string }) {
  return (
    <input
      placeholder={placeholder}
      className="min-h-11 border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
    />
  );
}

export function FilterSelect({
  label,
  options,
}: {
  label: string;
  options: string[];
}) {
  return (
    <select
      aria-label={label}
      className="min-h-11 border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-500"
    >
      {options.map((option) => (
        <option key={option}>{option}</option>
      ))}
    </select>
  );
}

export function RegisterList<T>({
  title,
  description,
  items,
  columns,
  getKey,
  renderMobile,
}: {
  title: string;
  description: string;
  items: T[];
  columns: RegisterColumn<T>[];
  getKey: (item: T) => string;
  renderMobile: (item: T) => ReactNode;
}) {
  return (
    <section className="border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold tracking-tight text-slate-950">
          {title}
        </h2>
        <p className="text-sm leading-6 text-slate-600">{description}</p>
      </div>

      <div className="mt-4 space-y-3 lg:hidden">
        {items.map((item) => (
          <div key={getKey(item)} className="border border-slate-200 bg-slate-50 p-4">
            {renderMobile(item)}
          </div>
        ))}
      </div>

      <div className="mt-5 hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[980px] border-collapse">
          <thead>
            <tr className="border-y border-slate-200 bg-slate-100">
              {columns.map((column) => (
                <th
                  key={column.label}
                  className={`px-3 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500 ${column.className || ""}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={getKey(item)} className="border-b border-slate-100 hover:bg-slate-50">
                {columns.map((column) => (
                  <td
                    key={column.label}
                    className={`px-3 py-3 align-top text-sm text-slate-700 ${column.className || ""}`}
                  >
                    {column.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function DetailGrid({
  items,
}: {
  items: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {item.label}
          </div>
          <div className="mt-1 font-semibold text-slate-900">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function FormCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-bold text-slate-950">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function FormField({
  label,
  placeholder,
  type = "text",
}: {
  label: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <input
        type={type}
        placeholder={placeholder}
        className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
      />
    </label>
  );
}

export function FormSelectField({
  label,
  options,
}: {
  label: string;
  options: string[];
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700">
      {label}
      <select className="min-h-11 border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-500">
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

export function FormTextArea({
  label,
  placeholder,
}: {
  label: string;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
      {label}
      <textarea
        placeholder={placeholder}
        rows={5}
        className="border border-slate-300 bg-white px-3 py-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
      />
    </label>
  );
}

export function DisabledSubmit({ label = "Save coming soon" }: { label?: string }) {
  return (
    <button
      type="button"
      disabled
      className="inline-flex min-h-10 cursor-not-allowed items-center justify-center bg-slate-200 px-4 text-sm font-semibold text-slate-500"
    >
      {label}
    </button>
  );
}
