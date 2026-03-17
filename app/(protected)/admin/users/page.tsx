import { AppShell } from "@/components/layout/app-shell";

export default function AdminUsersPage() {
  return (
    <AppShell title="User Management">
      <div className="bg-white p-6 rounded-2xl shadow-sm">
        <h2 className="text-xl font-semibold mb-4">
          Admin — Create Users
        </h2>

        <p className="text-slate-600">
          User creation UI coming next step.
        </p>
      </div>
    </AppShell>
  );
}