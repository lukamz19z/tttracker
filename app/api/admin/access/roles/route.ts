import { NextRequest, NextResponse } from "next/server";
import { requireAccessAdmin } from "@/lib/access/server";

export const runtime = "nodejs";

function slug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function GET(request: NextRequest) {
  try {
    const { service } = await requireAccessAdmin(request);
    const { data, error } = await service
      .from("roles")
      .select(
        "id,code,name,description,is_active,is_system,grants_all,sort_order",
      )
      .order("is_active", { ascending: false })
      .order("sort_order")
      .order("name");

    if (error) throw new Error(error.message);
    return NextResponse.json({ roles: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load roles.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { service } = await requireAccessAdmin(request);
    const body = await request.json();

    const name = String(body.name ?? "").trim();
    const description = String(body.description ?? "").trim() || null;
    const requestedCode = String(body.code ?? "").trim();
    const code = slug(requestedCode || name);

    if (!name) {
      return NextResponse.json({ error: "Role name is required." }, { status: 400 });
    }
    if (!code) {
      return NextResponse.json({ error: "Role code is required." }, { status: 400 });
    }

    const { data, error } = await service
      .from("roles")
      .insert({
        code,
        name,
        description,
        is_active: true,
        is_system: false,
        grants_all: false,
        sort_order: Number(body.sort_order ?? 100),
      })
      .select(
        "id,code,name,description,is_active,is_system,grants_all,sort_order",
      )
      .single();

    if (error) throw new Error(error.message);

    const cloneFromRoleId = String(body.clone_from_role_id ?? "").trim();
    if (cloneFromRoleId) {
      const source = await service
        .from("role_permissions")
        .select("access_area_id,allowed")
        .eq("role_id", cloneFromRoleId);

      if (source.error) throw new Error(source.error.message);

      if ((source.data ?? []).length) {
        const copy = (source.data ?? []).map((row) => ({
          role_id: data.id,
          access_area_id: row.access_area_id,
          allowed: row.allowed,
        }));
        const copyResult = await service.from("role_permissions").insert(copy);
        if (copyResult.error) throw new Error(copyResult.error.message);
      }
    }

    return NextResponse.json({ role: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create role.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
