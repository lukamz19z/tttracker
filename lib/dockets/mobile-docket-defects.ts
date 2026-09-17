/* eslint-disable @typescript-eslint/no-explicit-any */

// lib/dockets/mobile-docket-defects.ts
//
// Daily Docket -> controlled Defect link reconciliation.
//
// New DEF records are NOT generated here.
// The mobile editor uses the existing Quality API to create a controlled
// Defect (and upload its photos) first. The returned Defect is then included
// in draft.linkedDefects and this helper stores only the docket association.
//
// This keeps one DEF numbering / SharePoint / photo / notification workflow.

import type { SupabaseClient } from "@supabase/supabase-js";

import { clean } from "@/lib/dockets/mobile-docket-server";

type LinkedDefect = {
  id: string;
  link_type?: "raised" | "referenced" | string;
};

export async function syncMobileDocketDefectLinks(args: {
  service: SupabaseClient;
  projectId: string;
  towerId: string;
  docketId: string;
  linkedDefects: LinkedDefect[];
  newDefects?: unknown[];
}) {
  const {
    service,
    projectId,
    towerId,
    docketId,
    linkedDefects,
    newDefects,
  } = args;

  if ((newDefects ?? []).length > 0) {
    throw new Error(
      "A new Defect is still waiting to be created. Create the controlled DEF record through Quality before saving the Daily Docket.",
    );
  }

  const desired = new Map<
    string,
    "raised" | "referenced"
  >();

  for (const defect of linkedDefects ?? []) {
    const defectId = clean(defect.id);
    if (!defectId) continue;

    desired.set(
      defectId,
      clean(defect.link_type) === "raised"
        ? "raised"
        : "referenced",
    );
  }

  const { data: existingLinks, error: linkLoadError } =
    await service
      .from("tower_docket_defect_links")
      .select("id,defect_id,link_type")
      .eq("docket_id", docketId);

  if (linkLoadError) {
    throw new Error(
      `Daily Docket Defect links could not be loaded: ${linkLoadError.message}`,
    );
  }

  const desiredIds = [...desired.keys()];

  if (desiredIds.length > 0) {
    const { data: defects, error: defectError } = await service
      .from("tower_defects")
      .select("id")
      .eq("project_id", projectId)
      .eq("tower_id", towerId)
      .in("id", desiredIds);

    if (defectError) {
      throw new Error(
        `Daily Docket Defects could not be verified: ${defectError.message}`,
      );
    }

    const validIds = new Set(
      (defects ?? []).map((row: any) => clean(row.id)),
    );

    const invalid = desiredIds.filter(
      (id) => !validIds.has(id),
    );

    if (invalid.length > 0) {
      throw new Error(
        "One or more linked Defects do not belong to the selected project/tower.",
      );
    }
  }

  const existingByDefect = new Map(
    (existingLinks ?? []).map((row: any) => [
      clean(row.defect_id),
      row,
    ]),
  );

  const staleLinkIds = (existingLinks ?? [])
    .filter(
      (row: any) =>
        !desired.has(clean(row.defect_id)),
    )
    .map((row: any) => clean(row.id))
    .filter(Boolean);

  if (staleLinkIds.length > 0) {
    const { error } = await service
      .from("tower_docket_defect_links")
      .delete()
      .in("id", staleLinkIds);

    if (error) {
      throw new Error(
        `A Defect could not be unlinked from the Daily Docket: ${error.message}`,
      );
    }
  }

  for (const [defectId, linkType] of desired) {
    const existing = existingByDefect.get(defectId);

    if (existing) {
      if (clean(existing.link_type) !== linkType) {
        const { error } = await service
          .from("tower_docket_defect_links")
          .update({ link_type: linkType })
          .eq("id", existing.id);

        if (error) {
          throw new Error(
            `A Daily Docket Defect link could not be updated: ${error.message}`,
          );
        }
      }

      continue;
    }

    const { error } = await service
      .from("tower_docket_defect_links")
      .insert({
        project_id: projectId,
        tower_id: towerId,
        docket_id: docketId,
        defect_id: defectId,
        link_type: linkType,
      });

    if (error) {
      throw new Error(
        `A controlled Defect could not be linked to the Daily Docket: ${error.message}`,
      );
    }
  }
}
