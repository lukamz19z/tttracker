import { AppShell } from "@/components/layout/app-shell";

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-slate-500">
          Settings will be added here.
        </p>
      </div>
    </AppShell>
  );
}