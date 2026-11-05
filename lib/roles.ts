import { createSupabaseBrowser } from "./supabase";

export async function getUserRole() {
  const supabase = createSupabaseBrowser();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;

  if (!user) return null;

  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  return data?.role;
}
