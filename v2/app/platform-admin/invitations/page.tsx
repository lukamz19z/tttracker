import Link from "next/link";
import { requirePlatformPage } from "@/lib/platform/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePlatformPage();
  const value = Number((await searchParams).page ?? 1);
  const page = Number.isSafeInteger(value) && value > 0 ? value : 1;
  const {
    data: rows,
    error,
    count,
  } = await createSupabaseAdmin()
    .from("v2_organisation_invitations")
    .select("id,email,status,organisation_id,created_at", { count: "exact" })
    .order("created_at")
    .range((page - 1) * 50, page * 50 - 1);
  if (error) throw new Error("PLATFORM_REGISTER_LOOKUP_FAILED");
  return (
    <div>
      <h1>Invitations</h1>
      {rows?.map((row) => (
        <div
          key={row.id}
          style={{
            padding: "10px 0",
            borderBottom: "1px solid #334155",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span>{row.email}</span>
          <span>{row.status}</span>
          <Link href={`/platform-admin/organisations/${row.organisation_id}`}>
            Manage organisation invitation
          </Link>
        </div>
      ))}
      <p>
        {count ?? 0} records / Page {page}
      </p>
      {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}{" "}
      {page * 50 < (count ?? 0) && <Link href={`?page=${page + 1}`}>Next</Link>}
    </div>
  );
}
