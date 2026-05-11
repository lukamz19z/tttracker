import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";

export default function AdminPage() {
  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white border rounded-3xl p-6 shadow-sm">
          <p className="text-sm uppercase tracking-wider text-slate-400">
            Admin
          </p>
          <h1 className="text-3xl font-bold mt-1">Admin Centre</h1>
          <p className="text-slate-500 mt-2">
            Manage system users, employees and crews.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          <AdminCard
            title="Users"
            description="Website access, roles and login management."
            href="/admin/users"
          />

          <AdminCard
            title="Employees"
            description="Basic operational employee register."
            href="/admin/employees"
          />

          <AdminCard
            title="Crews"
            description="Create crews and assign workers."
            href="/admin/crews"
          />
        </div>
      </div>
    </AppShell>
  );
}

function AdminCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="bg-white border rounded-3xl p-6 shadow-sm hover:shadow-md transition block"
    >
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="text-slate-500 mt-2 text-sm">{description}</p>
      <div className="mt-5 text-sm font-semibold text-slate-900">
        Open →
      </div>
    </Link>
  );
}