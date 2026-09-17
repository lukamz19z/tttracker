/* eslint-disable @typescript-eslint/no-explicit-any */

// lib/dockets/mobile-docket-materials.ts
//
// Website-parity helpers used by the mobile Daily Docket API.
//
// This batch covers:
// - Material Events
// - persistent outstanding missing material
// - delivery / receipt linkage through source_issue_key
// - linked Dayworks generated from Daily Docket delays
//
// Bundle transfer replacement logic and controlled Defects are intentionally
// kept out of this file until Batch 2B-2.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  clean,
  dateTimeIso,
  num,
  uniqueStrings,
} from "@/lib/dockets/mobile-docket-server";

type MaterialWorkOutcome =
  | ""
  | "stopped_work"
  | "slowed_down"
  | "changed_sequence"
  | "minor_impact";

type MissingMaterialIssue = {
  issue_key: string;
  source_table: string;
  source_record_id: string;
  bundle_id: string;
  bundle_no: string;
  bundle_section: string;
  item_reference: string;
  item_description: string;
  original_quantity: number;
  received_quantity: number;
  remaining_quantity: number;
  unit: string;
  first_reported_at: string;
  source_docket_id: string;
};

function workOutcomeCommercialType(
  outcome: MaterialWorkOutcome | string,
) {
  switch (outcome) {
    case "stopped_work":
      return "Delayed";
    case "slowed_down":
      return "Disrupted";
    case "changed_sequence":
      return "Resequenced";
    case "minor_impact":
      return "No material impact";
    default:
      return null;
  }
}

function uuid() {
  return crypto.randomUUID();
}

function meaningfulMaterialItems(event: any) {
  return (event.items ?? []).filter(
    (item: any) =>
      clean(item.item_reference) ||
      (clean(item.material_kind) === "manual_bolt" &&
        clean(item.bolt_size)),
  );
}

export async function syncMobileDocketMaterialEvents(args: {
  service: SupabaseClient;
  docketId: string;
  projectId: string;
  towerId: string;
  docketDate: string;
  materialEvents: any[];
}) {
  const {
    service,
    docketId,
    projectId,
    towerId,
    docketDate,
    materialEvents,
  } = args;

  const { error: deleteError } = await service
    .from("tower_material_events")
    .delete()
    .eq("docket_id", docketId)
    .is("transfer_id", null);

  if (deleteError) {
    throw new Error(
      `Daily Docket saved, but material events could not be refreshed: ${deleteError.message}`,
    );
  }

  for (const event of materialEvents ?? []) {
    const items = meaningfulMaterialItems(event);

    if (items.length === 0) continue;

    const occurredAt =
      dateTimeIso(
        docketDate,
        clean(event.occurred_time),
      ) || `${docketDate}T12:00:00`;

    const affectedWork =
      Boolean(event.affected_work);

    const workOutcome = clean(
      event.work_outcome,
    );

    const { data: insertedEvent, error: eventError } =
      await service
        .from("tower_material_events")
        .insert({
          project_id: projectId,
          docket_id: docketId,
          tower_id: towerId,
          event_type:
            clean(event.event_type) || "missing",
          source_tower_id:
            clean(event.source_tower_id) || null,
          destination_tower_id:
            clean(event.destination_tower_id) ||
            null,
          source_location:
            clean(event.source_location) || null,
          destination_location:
            clean(event.destination_location) ||
            null,
          occurred_at: occurredAt,
          affected_work: affectedWork,
          work_outcome: affectedWork
            ? workOutcome || null
            : null,
          affected_activity: affectedWork
            ? clean(event.affected_activity) || null
            : null,
          affected_section: affectedWork
            ? clean(event.affected_section) || null
            : null,
          impact_started_at:
            affectedWork &&
            workOutcome !== "changed_sequence"
              ? dateTimeIso(
                  docketDate,
                  clean(event.impact_start_time),
                )
              : null,
          impact_finished_at:
            affectedWork &&
            workOutcome !== "changed_sequence" &&
            !Boolean(event.impact_ongoing)
              ? dateTimeIso(
                  docketDate,
                  clean(event.impact_finish_time),
                )
              : null,
          impact_ongoing: affectedWork
            ? Boolean(event.impact_ongoing)
            : false,
          current_effect: affectedWork
            ? clean(event.current_effect) || null
            : null,
          mitigation_actions: affectedWork
            ? uniqueStrings(
                event.mitigation_actions,
              )
            : [],
          commercial_impact_type: affectedWork
            ? workOutcomeCommercialType(
                workOutcome,
              )
            : null,
          notes: clean(event.notes) || null,
        })
        .select("id")
        .single();

    if (eventError || !insertedEvent) {
      throw new Error(
        `Daily Docket saved, but a material event could not be saved: ${
          eventError?.message || "Unknown error"
        }`,
      );
    }

    const eventId = clean(
      insertedEvent.id,
    );

    const itemRows = items.map((item: any) => {
      const manualBolt =
        clean(item.material_kind) ===
        "manual_bolt";

      const eventType =
        clean(event.event_type) || "missing";

      const sourceTable = manualBolt
        ? ""
        : clean(item.source_table);

      const sourceRecordId = manualBolt
        ? ""
        : clean(item.source_record_id);

      const manualDescription =
        clean(item.material_kind) === "manual"
          ? [
              clean(item.manual_category),
              clean(item.item_description),
            ]
              .filter(Boolean)
              .join(" · ")
          : clean(item.item_description);

      return {
        event_id: eventId,
        issue_key:
          eventType === "missing"
            ? clean(item.issue_key) || uuid()
            : null,
        source_issue_key:
          eventType === "found_received"
            ? clean(item.source_issue_key) ||
              null
            : null,
        bundle_id:
          clean(item.bundle_id) || null,
        bundle_no:
          clean(item.bundle_no) || null,
        bundle_section:
          clean(item.bundle_section) || null,
        source_table: sourceTable || null,
        source_record_id:
          sourceRecordId || null,
        material_type: manualBolt
          ? "bolt"
          : sourceTable ===
              "tower_material_members"
            ? "steel_member"
            : "other",
        bolt_size: manualBolt
          ? clean(item.bolt_size) || null
          : null,
        item_reference: manualBolt
          ? null
          : clean(item.item_reference) ||
            null,
        item_description: manualBolt
          ? clean(item.item_description) ||
            null
          : manualDescription || null,
        quantity: Math.max(
          num(item.quantity || 1),
          0,
        ),
        unit: manualBolt
          ? "ea"
          : clean(item.unit) || null,
      };
    });

    const { error: itemError } = await service
      .from("tower_material_event_items")
      .insert(itemRows);

    if (itemError) {
      throw new Error(
        `Daily Docket saved, but material event items could not be saved: ${itemError.message}`,
      );
    }

    const peopleRows = (event.people ?? [])
      .filter((person: any) =>
        clean(person.employee_name),
      )
      .map((person: any) => ({
        event_id: eventId,
        employee_id:
          clean(person.employee_id) || null,
        employee_name: clean(
          person.employee_name,
        ),
        employee_role:
          clean(person.employee_role) || null,
        involvement_type: "search_verify",
        started_at: dateTimeIso(
          docketDate,
          clean(person.started_at),
        ),
        finished_at: dateTimeIso(
          docketDate,
          clean(person.finished_at),
        ),
      }));

    if (peopleRows.length > 0) {
      const { error: peopleError } =
        await service
          .from(
            "tower_material_event_people",
          )
          .insert(peopleRows);

      if (peopleError) {
        throw new Error(
          `Daily Docket saved, but material event personnel could not be saved: ${peopleError.message}`,
        );
      }
    }

    const plantRows = (event.plant ?? [])
      .filter((row: any) =>
        clean(row.plant_name),
      )
      .map((row: any) => ({
        event_id: eventId,
        plant_asset_id: null,
        plant_name: clean(row.plant_name),
        asset_number:
          clean(row.asset_number) || null,
        involvement_type: "affected",
        started_at: dateTimeIso(
          docketDate,
          clean(row.started_at),
        ),
        finished_at: dateTimeIso(
          docketDate,
          clean(row.finished_at),
        ),
      }));

    if (plantRows.length > 0) {
      const { error: plantError } =
        await service
          .from("tower_material_event_plant")
          .insert(plantRows);

      if (plantError) {
        throw new Error(
          `Daily Docket saved, but material event plant could not be saved: ${plantError.message}`,
        );
      }
    }
  }
}

export async function loadOutstandingMobileMaterialIssues(
  service: SupabaseClient,
  towerId: string,
): Promise<MissingMaterialIssue[]> {
  const [missingResult, receivedResult] =
    await Promise.all([
      service
        .from("tower_material_events")
        .select(`
          id,
          docket_id,
          occurred_at,
          items:tower_material_event_items(
            issue_key,
            source_issue_key,
            source_table,
            source_record_id,
            bundle_id,
            bundle_no,
            bundle_section,
            material_type,
            bolt_size,
            item_reference,
            item_description,
            quantity,
            unit
          )
        `)
        .eq("tower_id", towerId)
        .eq("event_type", "missing")
        .order("occurred_at", {
          ascending: true,
        }),
      service
        .from("tower_material_events")
        .select(`
          id,
          docket_id,
          occurred_at,
          items:tower_material_event_items(
            source_issue_key,
            quantity
          )
        `)
        .eq("tower_id", towerId)
        .eq("event_type", "found_received"),
    ]);

  if (missingResult.error) {
    throw new Error(
      `Outstanding missing material could not be loaded: ${missingResult.error.message}`,
    );
  }

  const receivedByIssue = new Map<
    string,
    number
  >();

  if (!receivedResult.error) {
    for (const event of
      receivedResult.data ?? []) {
      for (const item of
        (event as any).items ?? []) {
        const sourceIssueKey = clean(
          item.source_issue_key,
        );

        if (!sourceIssueKey) continue;

        receivedByIssue.set(
          sourceIssueKey,
          (receivedByIssue.get(
            sourceIssueKey,
          ) ?? 0) +
            Math.max(num(item.quantity), 0),
        );
      }
    }
  }

  const issues: MissingMaterialIssue[] =
    [];

  for (const event of
    missingResult.data ?? []) {
    for (const item of
      (event as any).items ?? []) {
      const issueKey = clean(
        item.issue_key,
      );

      if (!issueKey) continue;

      const originalQuantity = Math.max(
        num(item.quantity),
        0,
      );

      const receivedQuantity = Math.max(
        receivedByIssue.get(issueKey) ?? 0,
        0,
      );

      issues.push({
        issue_key: issueKey,
        source_table: clean(
          item.source_table,
        ),
        source_record_id: clean(
          item.source_record_id,
        ),
        bundle_id: clean(item.bundle_id),
        bundle_no: clean(item.bundle_no),
        bundle_section: clean(
          item.bundle_section,
        ),
        item_reference:
          clean(item.item_reference) ||
          clean(item.bolt_size) ||
          "Material item",
        item_description: clean(
          item.item_description,
        ),
        original_quantity:
          originalQuantity,
        received_quantity:
          receivedQuantity,
        remaining_quantity: Math.max(
          originalQuantity -
            receivedQuantity,
          0,
        ),
        unit: clean(item.unit) || "ea",
        first_reported_at: clean(
          (event as any).occurred_at,
        ),
        source_docket_id: clean(
          (event as any).docket_id,
        ),
      });
    }
  }

  return issues;
}

function normalizeWorkerName(
  value: unknown,
) {
  return clean(value)
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function delayDayworkMeta(
  type: string,
) {
  switch (type) {
    case "weather":
    case "lightning":
      return {
        code: "WD",
        label: "Weather delay",
      };
    case "toolbox":
      return {
        code: "SB",
        label: "Standby",
      };
    case "mobilisation":
      return {
        code: "MOB",
        label: "Mobilisation",
      };
    case "access":
      return {
        code: "ACC",
        label: "Access / Bogged",
      };
    case "plant":
      return {
        code: "PI",
        label: "Plant issue",
      };
    case "materials":
      return {
        code: "MI",
        label: "Material issue",
      };
    default:
      return {
        code: "OTH",
        label: "Other",
      };
  }
}

function buildDayworkDocketNumber(
  projectNumber: string,
  sequenceNo: number,
) {
  return `${projectNumber}-DW-${String(
    sequenceNo,
  ).padStart(4, "0")}`;
}

function plantDisplayName(
  row: any,
  index: number,
) {
  const primary =
    clean(row.plant_name) ||
    clean(row.asset_id) ||
    clean(row.plant_type);

  const secondary = [
    clean(row.plant_type),
    clean(row.asset_id),
  ]
    .filter(Boolean)
    .filter(
      (value, itemIndex, values) =>
        values.indexOf(value) ===
          itemIndex && value !== primary,
    )
    .join(" / ");

  if (!primary) {
    return `Plant ${index + 1}`;
  }

  return secondary
    ? `${primary} (${secondary})`
    : primary;
}

async function nextDayworkSequence(
  service: SupabaseClient,
  projectId: string,
) {
  const { data, error } = await service
    .from("dayworks")
    .select("sequence_no")
    .eq("project_id", projectId)
    .order("sequence_no", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      "Daily Docket saved, but failed to get the next Daywork number.",
    );
  }

  return data?.sequence_no
    ? num(data.sequence_no) + 1
    : 1;
}

export async function syncMobileDocketDelayDayworks(
  args: {
    service: SupabaseClient;
    docketId: string;
    projectId: string;
    towerId: string;
    docketDate: string;
    leadingHand: string;
    dailySiteSummary: string;
    delayRows: any[];
    labourRows: any[];
    plantRows: any[];
  },
) {
  const {
    service,
    docketId,
    projectId,
    towerId,
    docketDate,
    leadingHand,
    dailySiteSummary,
    delayRows,
    labourRows,
    plantRows,
  } = args;

  const [
    towerResult,
    projectResult,
    existingResult,
  ] = await Promise.all([
    service
      .from("towers")
      .select("id,name,line,extra_data")
      .eq("id", towerId)
      .single(),
    service
      .from("projects")
      .select("project_number")
      .eq("id", projectId)
      .single(),
    service
      .from("dayworks")
      .select("id,source_delay_key")
      .eq("source_docket_id", docketId)
      .eq(
        "source_type",
        "daily_docket_delay",
      ),
  ]);

  if (towerResult.error) {
    throw new Error(
      `Daily Docket saved, but tower details for linked Dayworks could not be loaded: ${towerResult.error.message}`,
    );
  }

  if (
    projectResult.error ||
    !clean(projectResult.data?.project_number)
  ) {
    throw new Error(
      "Daily Docket saved, but the project number is missing for linked Dayworks.",
    );
  }

  if (existingResult.error) {
    throw new Error(
      "Daily Docket saved, but linked Dayworks could not be checked.",
    );
  }

  const towerData =
    towerResult.data as any;

  const towerLocation =
    clean(towerData?.name) ||
    clean(
      towerData?.extra_data
        ?.tower_number,
    ) ||
    clean(
      towerData?.extra_data
        ?.structure_number,
    ) ||
    clean(
      towerData?.extra_data?.tower_no,
    ) ||
    "Tower related works";

  const existingByKey = new Map<
    string,
    string
  >(
    (existingResult.data ?? [])
      .filter((row: any) =>
        clean(row.source_delay_key),
      )
      .map((row: any) => [
        clean(row.source_delay_key),
        clean(row.id),
      ]),
  );

  const activeDelays = (
    delayRows ?? []
  ).filter(
    (delay: any) =>
      num(delay.delay_hours) > 0,
  );

  const activeKeys = new Set<string>();
  let sequence = await nextDayworkSequence(
    service,
    projectId,
  );

  for (const [
    index,
    delay,
  ] of activeDelays.entries()) {
    const type =
      clean(delay.delay_type) || "other";

    const meta =
      delayDayworkMeta(type);

    const sourceDelayKey = `${type}-${
      index + 1
    }`;

    activeKeys.add(sourceDelayKey);

    const selectedWorkers =
      uniqueStrings(delay.worker_names);

    const affectedLabour =
      clean(delay.applies_to) ===
      "selected_workers"
        ? (labourRows ?? []).filter(
            (row: any) =>
              selectedWorkers.some(
                (name) =>
                  normalizeWorkerName(
                    name,
                  ) ===
                  normalizeWorkerName(
                    row.worker_name,
                  ),
              ),
          )
        : (labourRows ?? []).filter(
            (row: any) =>
              clean(row.worker_name),
          );

    const selectedPlant =
      uniqueStrings(delay.plant_names);

    const affectedPlant =
      clean(
        delay.delay_applies_mode,
      ) === "labour_and_plant"
        ? selectedPlant.length > 0
          ? (plantRows ?? []).filter(
              (row: any, plantIndex: number) => {
                const display =
                  plantDisplayName(
                    row,
                    plantIndex,
                  );

                return selectedPlant.some(
                  (name) =>
                    normalizeWorkerName(
                      name,
                    ) ===
                    normalizeWorkerName(
                      display,
                    ),
                );
              },
            )
          : (plantRows ?? []).filter(
              (row: any) =>
                clean(row.plant_name) ||
                clean(row.asset_id) ||
                clean(row.plant_type),
            )
        : [];

    const description = [
      `${meta.label} recorded from Daily Docket.`,
      clean(delay.delay_reason)
        ? `Reason: ${clean(
            delay.delay_reason,
          )}`
        : "",
      `Delay duration: ${num(
        delay.delay_hours,
      ).toFixed(2)} hours.`,
      clean(delay.applies_to) ===
      "selected_workers"
        ? `Labour affected: ${
            selectedWorkers.join(", ") ||
            "Selected workers"
          }.`
        : "Labour affected: Entire crew.",
      clean(
        delay.delay_applies_mode,
      ) === "labour_and_plant"
        ? `Plant affected: ${
            selectedPlant.join(", ") ||
            "Selected plant"
          }.`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    let dayworkId =
      existingByKey.get(
        sourceDelayKey,
      ) || "";

    if (dayworkId) {
      const { error } = await service
        .from("dayworks")
        .update({
          tower_id: towerId,
          source_tower_id: towerId,
          daywork_date: docketDate,
          work_type: meta.label,
          work_type_code: meta.code,
          delay_code: meta.code,
          delay_hours: num(
            delay.delay_hours,
          ),
          location: towerLocation,
          description,
          completed_by:
            clean(leadingHand) || null,
          comments:
            clean(dailySiteSummary) ||
            null,
          status: "Draft",
          commercial_status:
            "Pending Review",
        })
        .eq("id", dayworkId);

      if (error) {
        throw new Error(
          `Daily Docket saved, but linked Daywork update failed: ${error.message}`,
        );
      }
    } else {
      const docketNumber =
        buildDayworkDocketNumber(
          clean(
            projectResult.data
              ?.project_number,
          ),
          sequence,
        );

      const { data, error } =
        await service
          .from("dayworks")
          .insert({
            project_id: projectId,
            tower_id: towerId,
            source_tower_id: towerId,
            source_type:
              "daily_docket_delay",
            source_docket_id: docketId,
            source_delay_key:
              sourceDelayKey,
            docket_number: docketNumber,
            sequence_no: sequence,
            daywork_date: docketDate,
            work_type: meta.label,
            work_type_code: meta.code,
            delay_code: meta.code,
            delay_hours: num(
              delay.delay_hours,
            ),
            location: towerLocation,
            description,
            completed_by:
              clean(leadingHand) ||
              null,
            comments:
              clean(
                dailySiteSummary,
              ) || null,
            status: "Draft",
            commercial_status:
              "Pending Review",
          })
          .select("id")
          .single();

      if (error || !data) {
        throw new Error(
          `Daily Docket saved, but linked Daywork creation failed: ${
            error?.message ||
            "Unknown error"
          }`,
        );
      }

      dayworkId = clean(data.id);
      sequence += 1;
    }

    const [
      deletePeople,
      deleteResources,
    ] = await Promise.all([
      service
        .from("daywork_people")
        .delete()
        .eq("daywork_id", dayworkId),
      service
        .from("daywork_resources")
        .delete()
        .eq("daywork_id", dayworkId),
    ]);

    if (deletePeople.error) {
      throw new Error(
        `Daily Docket saved, but linked Daywork personnel could not be refreshed: ${deletePeople.error.message}`,
      );
    }

    if (deleteResources.error) {
      throw new Error(
        `Daily Docket saved, but linked Daywork resources could not be refreshed: ${deleteResources.error.message}`,
      );
    }

    if (affectedLabour.length > 0) {
      const { error } = await service
        .from("daywork_people")
        .insert(
          affectedLabour.map(
            (row: any) => ({
              daywork_id: dayworkId,
              employee_id: null,
              employee_name: clean(
                row.worker_name,
              ),
              start_time:
                clean(row.time_in) ||
                null,
              finish_time:
                clean(row.time_out) ||
                null,
              total_hours: num(
                delay.delay_hours,
              ),
              activity: `${
                meta.label
              }${
                clean(
                  delay.delay_reason,
                )
                  ? ` - ${clean(
                      delay.delay_reason,
                    )}`
                  : ""
              }`,
            }),
          ),
        );

      if (error) {
        throw new Error(
          `Daily Docket saved, but linked Daywork personnel failed: ${error.message}`,
        );
      }
    }

    if (affectedPlant.length > 0) {
      const { error } = await service
        .from("daywork_resources")
        .insert(
          affectedPlant.map(
            (
              row: any,
              plantIndex: number,
            ) => ({
              daywork_id: dayworkId,
              resource_name:
                plantDisplayName(
                  row,
                  plantIndex,
                ),
              hours: num(
                delay.delay_hours,
              ),
              activity: meta.label,
              notes:
                clean(
                  delay.delay_reason,
                ) || null,
            }),
          ),
        );

      if (error) {
        throw new Error(
          `Daily Docket saved, but linked Daywork resources failed: ${error.message}`,
        );
      }
    }
  }

  const staleIds = (
    existingResult.data ?? []
  )
    .filter(
      (row: any) =>
        clean(row.source_delay_key) &&
        !activeKeys.has(
          clean(row.source_delay_key),
        ),
    )
    .map((row: any) => clean(row.id))
    .filter(Boolean);

  if (staleIds.length > 0) {
    const { error } = await service
      .from("dayworks")
      .delete()
      .in("id", staleIds);

    if (error) {
      throw new Error(
        `Daily Docket saved, but stale linked Dayworks could not be removed: ${error.message}`,
      );
    }
  }
}
