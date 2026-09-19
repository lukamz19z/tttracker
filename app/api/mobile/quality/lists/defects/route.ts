import { NextRequest, NextResponse } from "next/server";

import { assertMobileProjectAccess } from "@/lib/mobile/quality";
import {
  mobileApiError,
  requireMobilePermission,
} from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFECT_FIELDS =
  "id,project_id,tower_id,sequence_no,defect_number,issue_type_id,member_number,segment,drawing_number,description,responsibility,client_reference,severity,status,source,identified_at,identified_by_label,resolution_notes,assigned_to_user_id,assigned_to_label,completed_by,completed_at,created_at,updated_at,mobile_client_mutation_id";

const SEARCH_FIELDS = [
  "defect_number",
  "description",
  "member_number",
  "drawing_number",
  "client_reference",
  "responsibility",
  "assigned_to_label",
] as const;

const clamp = (
  value: number,
  min: number,
  max: number,
) => Math.max(min, Math.min(max, value));

function cleanSearch(value: string) {
  return value
    .replace(/[%_]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

export async function GET(request: NextRequest) {
  try {
    const { service, identity } =
      await requireMobilePermission(
        request,
        "mobile.defects",
      );

    const projectId =
      request.nextUrl.searchParams.get("projectId")?.trim() ||
      "";
    const rawSearch =
      request.nextUrl.searchParams.get("q") ?? "";
    const search = cleanSearch(rawSearch);
    const status =
      request.nextUrl.searchParams.get("status")?.trim() ||
      "All";
    const offset = Math.max(
      0,
      Number(
        request.nextUrl.searchParams.get("offset") ?? 0,
      ) || 0,
    );
    const limit = clamp(
      Number(
        request.nextUrl.searchParams.get("limit") ?? 25,
      ) || 25,
      10,
      50,
    );

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required." },
        { status: 400 },
      );
    }

    await assertMobileProjectAccess(
      service,
      identity.userId,
      projectId,
    );

    const makeBaseQuery = () => {
      let query = service
        .from("tower_defects")
        .select(DEFECT_FIELDS)
        .eq("project_id", projectId);

      if (status && status !== "All") {
        query = query.eq("status", status);
      }

      return query;
    };

    let matchedRows: Array<Record<string, unknown>> = [];

    if (!search) {
      const result = await makeBaseQuery()
        .order("created_at", { ascending: false })
        .range(offset, offset + limit);

      if (result.error) {
        throw new Error(result.error.message);
      }

      matchedRows = (result.data ?? []) as Array<
        Record<string, unknown>
      >;
    } else {
      const pattern = `%${search}%`;

      const towerResult = await service
        .from("towers")
        .select("id,name,line")
        .eq("project_id", projectId);

      if (towerResult.error) {
        throw new Error(towerResult.error.message);
      }

      const searchLower = search.toLowerCase();
      const towerIds = (towerResult.data ?? [])
        .filter((tower) =>
          [tower.name, tower.line]
            .map((value) =>
              String(value ?? "").toLowerCase(),
            )
            .some((value) =>
              value.includes(searchLower),
            ),
        )
        .map((tower) => String(tower.id));

      const fieldPromises = SEARCH_FIELDS.map((field) =>
        makeBaseQuery()
          .ilike(field, pattern)
          .order("created_at", { ascending: false })
          .limit(60),
      );

      const towerPromise = towerIds.length
        ? makeBaseQuery()
            .in("tower_id", towerIds)
            .order("created_at", { ascending: false })
            .limit(60)
        : Promise.resolve({ data: [], error: null });

      const results = await Promise.all([
        ...fieldPromises,
        towerPromise,
      ]);

      const byId = new Map<
        string,
        Record<string, unknown>
      >();

      for (const result of results) {
        if (result.error) {
          throw new Error(result.error.message);
        }

        for (const row of result.data ?? []) {
          const id = String(
            (row as Record<string, unknown>).id ?? "",
          );
          if (id) {
            byId.set(
              id,
              row as Record<string, unknown>,
            );
          }
        }
      }

      matchedRows = Array.from(byId.values()).sort(
        (a, b) =>
          String(b.created_at ?? "").localeCompare(
            String(a.created_at ?? ""),
          ),
      );

      matchedRows = matchedRows.slice(
        offset,
        offset + limit + 1,
      );
    }

    const hasMore = matchedRows.length > limit;
    const pageRows = hasMore
      ? matchedRows.slice(0, limit)
      : matchedRows;

    const defectIds = pageRows
      .map((row) => String(row.id ?? ""))
      .filter(Boolean);

    const evidenceCounts = new Map<string, number>();

    if (defectIds.length) {
      const evidenceResult = await service
        .from("tower_quality_files")
        .select("defect_id")
        .in("defect_id", defectIds)
        .eq("file_role", "defect_photo");

      if (evidenceResult.error) {
        throw new Error(evidenceResult.error.message);
      }

      for (const row of evidenceResult.data ?? []) {
        const id = String(row.defect_id ?? "");
        if (!id) continue;
        evidenceCounts.set(
          id,
          (evidenceCounts.get(id) ?? 0) + 1,
        );
      }
    }

    const rows = pageRows.map((row) => ({
      ...row,
      evidenceCount:
        evidenceCounts.get(String(row.id ?? "")) ?? 0,
    }));

    return NextResponse.json({
      projectId,
      rows,
      nextOffset: hasMore ? offset + rows.length : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const apiError = mobileApiError(error);
    const denied =
      error instanceof Error &&
      error.message === "MOBILE_PROJECT_DENIED";

    return NextResponse.json(
      {
        error: denied
          ? "You do not have access to this project."
          : apiError.message,
      },
      { status: denied ? 403 : apiError.status },
    );
  }
}
