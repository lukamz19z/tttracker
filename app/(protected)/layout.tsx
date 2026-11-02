import { createSupabaseServer } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { AccessProvider } from "@/components/access/access-provider";
import { isTransientBackendFailure } from "@/lib/backend-resilience";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServer();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user) {
    if (error && isTransientBackendFailure(error)) {
      return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><section className="max-w-lg rounded-2xl border border-amber-200 bg-white p-6 shadow-sm"><h1 className="text-lg font-bold text-slate-900">TTTracker is temporarily unable to verify your session</h1><p className="mt-2 text-sm text-slate-600">Your session has not been cleared. The service will retry when available.</p><form className="mt-5"><button className="rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white" type="submit">Retry</button></form></section></main>;
    }
    redirect("/login");
  }

  return <AccessProvider>{children}</AccessProvider>;
}
