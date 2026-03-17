"use client";

import { createSupabaseBrowser } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export function Topbar({ title }: { title: string }) {
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
      <h1 className="text-2xl font-bold">{title}</h1>

      <button
        onClick={handleLogout}
        className="text-sm bg-slate-900 text-white px-4 py-2 rounded-lg"
      >
        Logout
      </button>
    </div>
  );
}