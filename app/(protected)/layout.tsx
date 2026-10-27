import { createSupabaseServer } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { AccessProvider } from "@/components/access/access-provider";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServer();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <AccessProvider>{children}</AccessProvider>;
}
