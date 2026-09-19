import { NextRequest, NextResponse } from "next/server";

import { assertMobileProjectAccess } from "@/lib/mobile/quality";
import {
  mobileApiError,
  requireMobilePermission,
} from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REVISION_FIELDS =
  "id,project_id,tower_id,sequence_no,revision_number,fli_number,inspection_stage,inspection_date,client_inspector,client_company,client_reference,notes,status,created_by_label,completed_by_label,completed_at,submitted_for_review_at,submitted_for_review_by,pdf_revision,latest_pdf_file_id,created_at,updated_at,mobile_client_mutation_id";

const SEARCH_FIELDS = [
  "revision_number",
  "fli_number",
  "client_reference",
  "client_inspector",
  "client_company",
  "notes",
] as const;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

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
        "mobile.rectifications",
      );

    const projectId =
      request.nextUrl.searchParams.get("projectId")?.trim() ||
      "";
    const search = cleanSearch(
      request.nextUrl.searchParams.get("q") ?? "",
    );
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
        .from("tower_revisions")
        .select(REVISION_FIELDS)
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

      const lower = search.toLowerCase();
      const towerIds = (towerResult.data ?? [])
        .filter((tower) =>
          [tower.name, tower.line]
            .map((value) =>
              String(value ?? "").toLowerCase(),
            )
            .some((value) => value.includes(lower)),
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

    const revisionIds = pageRows
      .map((row) => String(row.id ?? ""))
      .filter(Boolean);

    const itemCounts = new Map<string, number>();

    if (revisionIds.length) {
      const itemResult = await service
        .from("tower_revision_items")
        .select("revision_id")
        .in("revision_id", revisionIds);

      if (itemResult.error) {
        throw new Error(itemResult.error.message);
      }

      for (const row of itemResult.data ?? []) {
        const id = String(row.revision_id ?? "");
        if (!id) continue;
        itemCounts.set(
          id,
          (itemCounts.get(id) ?? 0) + 1,
        );
      }
    }

    const rows = pageRows.map((row) => ({
      ...row,
      itemCount:
        itemCounts.get(String(row.id ?? "")) ?? 0,
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
