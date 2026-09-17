/* eslint-disable @typescript-eslint/no-explicit-any */

// lib/dockets/mobile-docket-transfers.ts
//
// Server-side bundle transfer parity for the mobile Daily Docket API.
//
// Mirrors the website behaviour:
// - current tower receives bundles taken from another tower;
// - destination bundle check quantity increases;
// - source tower receives a persistent missing/replacement requirement;
// - replacement deliveries reduce that shortage;
// - incoming transfers can be linked to the current Daily Docket.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  clean,
  dateTimeIso,
  num,
} from "@/lib/dockets/mobile-docket-server";

type BundleTransferRecord = {
  id: string;
  transfer_no: number | null;
  project_id: string;
  source_tower_id: string;
  destination_tower_id: string;
  source_bundle_id: string;
  destination_bundle_id: string;
  bundle_no: string;
  bundle_section: string;
  quantity: number;
  status: "in_transit" | "received" | "cancelled";
  transferred_by_name: string;
  transferred_at: string | null;
  received_by_name: string;
  received_at: string | null;
  source_docket_id: string;
  destination_docket_id: string;
  notes: string;
};

type BundleReplacementStatus = {
  transfer_id: string;
  issue_key: string;
  original_quantity: number;
  delivered_quantity: number;
  remaining_quantity: number;
  first_reported_at: string | null;
  last_delivery_at: string | null;
};

type BundleReplacementDraft = {
  quantity: string;
  occurred_time: string;
};

type BundleTransferDraft = {
  ui_id: string;
  source_tower_id: string;
  source_bundle_id: string;
  destination_bundle_id: string;
  quantity: string;
  occurred_time: string;
  replacement_quantity: string;
  replacement_time: string;
  notes: string;
};

function isoDateOnly(value: unknown) {
  const text = clean(value);
  return text ? text.slice(0, 10) : "";
}

function transferRecord(row: any): BundleTransferRecord {
  const rawStatus = clean(row.status);

  return {
    id: clean(row.id),
    transfer_no:
      row.transfer_no == null
        ? null
        : num(row.transfer_no),
    project_id: clean(row.project_id),
    source_tower_id: clean(row.source_tower_id),
    destination_tower_id: clean(row.destination_tower_id),
    source_bundle_id: clean(row.source_bundle_id),
    destination_bundle_id: clean(row.destination_bundle_id),
    bundle_no: clean(row.bundle_no),
    bundle_section: clean(row.bundle_section),
    quantity: Math.max(num(row.quantity), 0),
    status:
      rawStatus === "received" || rawStatus === "cancelled"
        ? rawStatus
        : "in_transit",
    transferred_by_name: clean(row.transferred_by_name),
    transferred_at: clean(row.transferred_at) || null,
    received_by_name: clean(row.received_by_name),
    received_at: clean(row.received_at) || null,
    source_docket_id: clean(row.source_docket_id),
    destination_docket_id: clean(row.destination_docket_id),
    notes: clean(row.notes),
  };
}

async function towerNameMap(
  service: SupabaseClient,
  projectId: string,
) {
  const { data, error } = await service
    .from("towers")
    .select("id,name")
    .eq("project_id", projectId);

  if (error) {
    throw new Error(
      `Bundle transfer towers could not be loaded: ${error.message}`,
    );
  }

  return new Map(
    (data ?? []).map((row: any) => [
      clean(row.id),
      clean(row.name) || "Tower",
    ]),
  );
}

function towerName(
  names: Map<string, string>,
  towerId: string,
) {
  return names.get(towerId) || "Tower";
}

async function replacementStatusForTransfer(
  service: SupabaseClient,
  transfer: BundleTransferRecord,
): Promise<BundleReplacementStatus> {
  const { data, error } = await service
    .from("tower_material_events")
    .select(`
      id,
      event_type,
      occurred_at,
      items:tower_material_event_items(
        issue_key,
        source_issue_key,
        quantity
      )
    `)
    .eq("transfer_id", transfer.id)
    .order("occurred_at", { ascending: true });

  if (error) {
    throw new Error(
      `Bundle replacement history could not be loaded: ${error.message}`,
    );
  }

  let issueKey = "";
  let original = transfer.quantity;
  let firstReported: string | null =
    transfer.received_at || transfer.transferred_at;
  let delivered = 0;
  let lastDelivery: string | null = null;

  for (const event of data ?? []) {
    const eventType = clean((event as any).event_type);

    for (const item of (event as any).items ?? []) {
      if (eventType === "missing" && clean(item.issue_key)) {
        issueKey = clean(item.issue_key);
        original = Math.max(num(item.quantity), transfer.quantity);
        firstReported =
          clean((event as any).occurred_at) || firstReported;
      }
    }
  }

  if (issueKey) {
    for (const event of data ?? []) {
      const eventType = clean((event as any).event_type);
      if (eventType !== "found_received") continue;

      for (const item of (event as any).items ?? []) {
        if (clean(item.source_issue_key) !== issueKey) continue;
        delivered += Math.max(num(item.quantity), 0);
        lastDelivery =
          clean((event as any).occurred_at) || lastDelivery;
      }
    }
  }

  return {
    transfer_id: transfer.id,
    issue_key: issueKey,
    original_quantity: original,
    delivered_quantity: delivered,
    remaining_quantity: Math.max(original - delivered, 0),
    first_reported_at: firstReported,
    last_delivery_at: lastDelivery,
  };
}

export async function loadMobileBundleTransferContext(args: {
  service: SupabaseClient;
  projectId: string;
  towerId: string;
  docketId?: string | null;
  docketDate: string;
}) {
  const {
    service,
    projectId,
    towerId,
    docketId,
    docketDate,
  } = args;

  const { data, error } = await service
    .from("tower_material_transfers")
    .select("*")
    .eq("project_id", projectId)
    .order("transferred_at", { ascending: false });

  if (error) {
    throw new Error(
      `Bundle transfer history could not be loaded: ${error.message}`,
    );
  }

  const all = (data ?? []).map(transferRecord);

  const activeBundleTransfers = all.filter((transfer) => {
    if (transfer.destination_tower_id !== towerId) return false;

    if (docketId && transfer.destination_docket_id === docketId) {
      return true;
    }

    return (
      isoDateOnly(transfer.received_at) === docketDate ||
      (transfer.status === "in_transit" &&
        isoDateOnly(transfer.transferred_at) === docketDate)
    );
  });

  const bundleReplacementStatus = await Promise.all(
    activeBundleTransfers.map((transfer) =>
      replacementStatusForTransfer(service, transfer),
    ),
  );

  return {
    activeBundleTransfers,
    bundleReplacementStatus,
  };
}

async function ensureSourceShortage(args: {
  service: SupabaseClient;
  projectId: string;
  docketId: string | null;
  transfer: BundleTransferRecord;
  towerNames: Map<string, string>;
}) {
  const {
    service,
    projectId,
    docketId,
    transfer,
    towerNames,
  } = args;

  const current =
    await replacementStatusForTransfer(service, transfer);

  if (current.issue_key) {
    return current;
  }

  const issueKey = crypto.randomUUID();
  const occurredAt =
    transfer.received_at ||
    transfer.transferred_at ||
    new Date().toISOString();

  const { data: event, error: eventError } = await service
    .from("tower_material_events")
    .insert({
      project_id: projectId,
      docket_id: docketId,
      tower_id: transfer.source_tower_id,
      transfer_id: transfer.id,
      event_type: "missing",
      source_tower_id: transfer.source_tower_id,
      destination_tower_id: transfer.destination_tower_id,
      occurred_at: occurredAt,
      affected_work: false,
      mitigation_actions: [],
      notes: `Bundle taken by ${towerName(
        towerNames,
        transfer.destination_tower_id,
      )}; replacement required at ${towerName(
        towerNames,
        transfer.source_tower_id,
      )}.`,
    })
    .select("id")
    .single();

  if (eventError || !event) {
    throw new Error(
      `The bundle transfer was saved, but the source-tower replacement requirement could not be created: ${
        eventError?.message || "Unknown error"
      }`,
    );
  }

  const { error: itemError } = await service
    .from("tower_material_event_items")
    .insert({
      event_id: event.id,
      issue_key: issueKey,
      source_issue_key: null,
      bundle_id: transfer.source_bundle_id,
      bundle_no: transfer.bundle_no,
      bundle_section: transfer.bundle_section || null,
      source_table: "tower_required_bundles",
      source_record_id: transfer.source_bundle_id,
      material_type: "other",
      bolt_size: null,
      item_reference: `Bundle ${transfer.bundle_no}`.trim(),
      item_description: [
        transfer.bundle_section
          ? `Bundle section ${transfer.bundle_section}`
          : "",
        `Taken by ${towerName(
          towerNames,
          transfer.destination_tower_id,
        )}`,
        `Replacement required at ${towerName(
          towerNames,
          transfer.source_tower_id,
        )}`,
      ]
        .filter(Boolean)
        .join(" · "),
      quantity: transfer.quantity,
      unit: "bundle",
    });

  if (itemError) {
    throw new Error(
      `The bundle transfer was saved, but the source-tower replacement item could not be created: ${itemError.message}`,
    );
  }

  return {
    transfer_id: transfer.id,
    issue_key: issueKey,
    original_quantity: transfer.quantity,
    delivered_quantity: 0,
    remaining_quantity: transfer.quantity,
    first_reported_at: occurredAt,
    last_delivery_at: null,
  } satisfies BundleReplacementStatus;
}

async function updateBundleCheck(args: {
  service: SupabaseClient;
  towerId: string;
  bundleId: string;
  bundleNo: string;
  quantityToAdd: number;
  checkedBy: string;
  checkedAt: string;
  notes: string;
}) {
  const {
    service,
    towerId,
    bundleId,
    bundleNo,
    quantityToAdd,
    checkedBy,
    checkedAt,
    notes,
  } = args;

  const [bundleResult, checkResult] = await Promise.all([
    service
      .from("tower_required_bundles")
      .select("id,qty_required")
      .eq("id", bundleId)
      .maybeSingle(),
    service
      .from("tower_material_bundle_checks")
      .select("qty_received,notes")
      .eq("bundle_id", bundleId)
      .maybeSingle(),
  ]);

  if (bundleResult.error) {
    throw new Error(
      `Bundle requirement could not be loaded: ${bundleResult.error.message}`,
    );
  }

  if (checkResult.error) {
    throw new Error(
      `Bundle site check could not be loaded: ${checkResult.error.message}`,
    );
  }

  const currentQty = Math.max(
    num(checkResult.data?.qty_received),
    0,
  );
  const nextQty = currentQty + Math.max(quantityToAdd, 0);
  const required = Math.max(
    num(bundleResult.data?.qty_required),
    1,
  );

  const { error } = await service
    .from("tower_material_bundle_checks")
    .upsert(
      {
        tower_id: towerId,
        bundle_id: bundleId,
        bundle_no: bundleNo,
        status: nextQty >= required ? "arrived" : "partial",
        notes:
          clean(checkResult.data?.notes) ||
          notes,
        checked_by: checkedBy || "Daily Docket",
        checked_at: checkedAt,
        qty_received: nextQty,
      },
      { onConflict: "bundle_id" },
    );

  if (error) {
    throw new Error(
      `Bundle site check could not be updated: ${error.message}`,
    );
  }
}

async function recordReplacementDelivery(args: {
  service: SupabaseClient;
  projectId: string;
  docketId: string | null;
  docketDate: string;
  leadingHand: string;
  transfer: BundleTransferRecord;
  quantity: number;
  occurredTime: string;
  towerNames: Map<string, string>;
}) {
  const {
    service,
    projectId,
    docketId,
    docketDate,
    leadingHand,
    transfer,
    quantity,
    occurredTime,
    towerNames,
  } = args;

  const shortage = await ensureSourceShortage({
    service,
    projectId,
    docketId,
    transfer,
    towerNames,
  });

  const current =
    await replacementStatusForTransfer(service, transfer);

  const cleanQty = Math.min(
    Math.max(Math.round(quantity), 0),
    current.remaining_quantity,
  );

  if (cleanQty <= 0) return;

  const occurredAt =
    dateTimeIso(docketDate, occurredTime) ||
    new Date().toISOString();

  const { data: receipt, error: receiptError } = await service
    .from("tower_material_events")
    .insert({
      project_id: projectId,
      docket_id: docketId,
      tower_id: transfer.source_tower_id,
      transfer_id: transfer.id,
      event_type: "found_received",
      source_tower_id: transfer.source_tower_id,
      destination_tower_id: transfer.destination_tower_id,
      occurred_at: occurredAt,
      affected_work: false,
      mitigation_actions: [],
      notes: `Replacement delivery for Bundle ${
        transfer.bundle_no
      } after it was taken by ${towerName(
        towerNames,
        transfer.destination_tower_id,
      )}.`,
    })
    .select("id")
    .single();

  if (receiptError || !receipt) {
    throw new Error(
      `Replacement delivery could not be recorded: ${
        receiptError?.message || "Unknown error"
      }`,
    );
  }

  const { error: itemError } = await service
    .from("tower_material_event_items")
    .insert({
      event_id: receipt.id,
      issue_key: null,
      source_issue_key: shortage.issue_key,
      bundle_id: transfer.source_bundle_id,
      bundle_no: transfer.bundle_no,
      bundle_section: transfer.bundle_section || null,
      source_table: "tower_required_bundles",
      source_record_id: transfer.source_bundle_id,
      material_type: "other",
      bolt_size: null,
      item_reference: `Bundle ${transfer.bundle_no}`.trim(),
      item_description: `Replacement delivered to ${towerName(
        towerNames,
        transfer.source_tower_id,
      )}`,
      quantity: cleanQty,
      unit: "bundle",
    });

  if (itemError) {
    throw new Error(
      `Replacement delivery item could not be recorded: ${itemError.message}`,
    );
  }

  await updateBundleCheck({
    service,
    towerId: transfer.source_tower_id,
    bundleId: transfer.source_bundle_id,
    bundleNo: transfer.bundle_no,
    quantityToAdd: cleanQty,
    checkedBy: clean(leadingHand) || "Daily Docket",
    checkedAt: occurredAt,
    notes: "Replacement delivery recorded from Daily Docket",
  });
}

async function sourceAvailableQuantity(
  service: SupabaseClient,
  sourceBundleId: string,
) {
  const [checkResult, transferResult] = await Promise.all([
    service
      .from("tower_material_bundle_checks")
      .select("qty_received")
      .eq("bundle_id", sourceBundleId)
      .maybeSingle(),
    service
      .from("tower_material_transfers")
      .select("quantity,status")
      .eq("source_bundle_id", sourceBundleId),
  ]);

  if (checkResult.error) {
    throw new Error(
      `Source bundle quantity could not be checked: ${checkResult.error.message}`,
    );
  }

  if (transferResult.error) {
    throw new Error(
      `Existing bundle transfers could not be checked: ${transferResult.error.message}`,
    );
  }

  const received = Math.max(
    num(checkResult.data?.qty_received),
    0,
  );

  const transferred = (transferResult.data ?? [])
    .filter((row: any) => clean(row.status) !== "cancelled")
    .reduce(
      (sum: number, row: any) =>
        sum + Math.max(num(row.quantity), 0),
      0,
    );

  return Math.max(received - transferred, 0);
}

export async function syncMobileBundleTransfers(args: {
  service: SupabaseClient;
  projectId: string;
  towerId: string;
  docketId: string;
  docketDate: string;
  leadingHand: string;
  bundleTransferDrafts: BundleTransferDraft[];
  activeBundleTransfers: BundleTransferRecord[];
  replacementDrafts: Record<string, BundleReplacementDraft>;
}) {
  const {
    service,
    projectId,
    towerId,
    docketId,
    docketDate,
    leadingHand,
    bundleTransferDrafts,
    activeBundleTransfers,
    replacementDrafts,
  } = args;

  const names = await towerNameMap(service, projectId);

  /*
   * Existing incoming transfers.
   * The UI may change an in-transit row to received before save.
   */
  for (const requested of activeBundleTransfers ?? []) {
    if (requested.destination_tower_id !== towerId) continue;

    const { data: row, error } = await service
      .from("tower_material_transfers")
      .select("*")
      .eq("id", requested.id)
      .eq("project_id", projectId)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Bundle transfer ${requested.bundle_no} could not be checked: ${error.message}`,
      );
    }

    if (!row) continue;

    let transfer = transferRecord(row);

    if (
      requested.status === "received" &&
      transfer.status === "in_transit"
    ) {
      const receivedAt =
        requested.received_at ||
        `${docketDate}T12:00:00`;

      await updateBundleCheck({
        service,
        towerId,
        bundleId: transfer.destination_bundle_id,
        bundleNo: transfer.bundle_no,
        quantityToAdd: transfer.quantity,
        checkedBy: clean(leadingHand) || "Daily Docket",
        checkedAt: receivedAt,
        notes: "Received from another tower via Daily Docket",
      });

      const { error: updateError } = await service
        .from("tower_material_transfers")
        .update({
          status: "received",
          received_by_name: clean(leadingHand) || null,
          received_at: receivedAt,
          destination_docket_id: docketId,
        })
        .eq("id", transfer.id);

      if (updateError) {
        throw new Error(
          `Incoming bundle transfer could not be received: ${updateError.message}`,
        );
      }

      transfer = {
        ...transfer,
        status: "received",
        received_by_name: clean(leadingHand),
        received_at: receivedAt,
        destination_docket_id: docketId,
      };
    } else if (
      transfer.status === "received" &&
      !transfer.destination_docket_id &&
      isoDateOnly(transfer.received_at) === docketDate
    ) {
      const { error: linkError } = await service
        .from("tower_material_transfers")
        .update({ destination_docket_id: docketId })
        .eq("id", transfer.id);

      if (linkError) {
        throw new Error(
          `Daily Docket saved, but Bundle ${transfer.bundle_no} could not be linked: ${linkError.message}`,
        );
      }

      transfer.destination_docket_id = docketId;
    }

    if (transfer.status === "received") {
      await ensureSourceShortage({
        service,
        projectId,
        docketId,
        transfer,
        towerNames: names,
      });
    }

    const replacement = replacementDrafts?.[transfer.id];

    if (replacement && num(replacement.quantity) > 0) {
      await recordReplacementDelivery({
        service,
        projectId,
        docketId,
        docketDate,
        leadingHand,
        transfer,
        quantity: num(replacement.quantity),
        occurredTime: clean(replacement.occurred_time),
        towerNames: names,
      });
    }
  }

  /*
   * New "bundle taken from another tower" entries.
   */
  for (const draft of bundleTransferDrafts ?? []) {
    const sourceTowerId = clean(draft.source_tower_id);
    const sourceBundleId = clean(draft.source_bundle_id);
    const destinationBundleId = clean(draft.destination_bundle_id);
    const quantity = Math.max(Math.round(num(draft.quantity)), 0);

    if (
      !sourceTowerId ||
      sourceTowerId === towerId ||
      !sourceBundleId ||
      !destinationBundleId ||
      quantity <= 0
    ) {
      throw new Error(
        "Complete each bundle taken from another tower with a source tower, source bundle, matching current-tower bundle and quantity.",
      );
    }

    const { data: bundles, error: bundleError } = await service
      .from("tower_required_bundles")
      .select("id,tower_id,bundle_no,section,qty_required")
      .in("id", [sourceBundleId, destinationBundleId]);

    if (bundleError) {
      throw new Error(
        `Bundle transfer details could not be loaded: ${bundleError.message}`,
      );
    }

    const source = (bundles ?? []).find(
      (row: any) => clean(row.id) === sourceBundleId,
    );
    const destination = (bundles ?? []).find(
      (row: any) => clean(row.id) === destinationBundleId,
    );

    if (
      !source ||
      clean(source.tower_id) !== sourceTowerId ||
      !destination ||
      clean(destination.tower_id) !== towerId
    ) {
      throw new Error(
        "The selected source or destination bundle does not belong to the selected tower.",
      );
    }

    if (
      clean(source.bundle_no).toLowerCase() !==
      clean(destination.bundle_no).toLowerCase()
    ) {
      throw new Error(
        `Source Bundle ${clean(source.bundle_no)} does not match destination Bundle ${clean(destination.bundle_no)}.`,
      );
    }

    const available = await sourceAvailableQuantity(
      service,
      sourceBundleId,
    );

    if (quantity > available) {
      throw new Error(
        `Bundle ${clean(source.bundle_no)} only has ${available} available at ${towerName(
          names,
          sourceTowerId,
        )}, but ${quantity} is being recorded as taken.`,
      );
    }

    const occurredAt =
      dateTimeIso(docketDate, clean(draft.occurred_time)) ||
      `${docketDate}T12:00:00`;

    const { data: inserted, error: insertError } = await service
      .from("tower_material_transfers")
      .insert({
        project_id: projectId,
        source_tower_id: sourceTowerId,
        destination_tower_id: towerId,
        source_bundle_id: sourceBundleId,
        destination_bundle_id: destinationBundleId,
        bundle_no: clean(source.bundle_no),
        bundle_section: clean(source.section) || "General",
        quantity,
        status: "received",
        transferred_by_name: clean(leadingHand) || null,
        transferred_at: occurredAt,
        received_by_name: clean(leadingHand) || null,
        received_at: occurredAt,
        destination_docket_id: docketId,
        notes: clean(draft.notes) || null,
      })
      .select("*")
      .single();

    if (insertError || !inserted) {
      throw new Error(
        `Daily Docket saved, but Bundle ${clean(
          source.bundle_no,
        )} taken from ${towerName(
          names,
          sourceTowerId,
        )} could not be saved: ${
          insertError?.message || "Unknown error"
        }`,
      );
    }

    const transfer = transferRecord(inserted);

    await updateBundleCheck({
      service,
      towerId,
      bundleId: destinationBundleId,
      bundleNo: clean(destination.bundle_no),
      quantityToAdd: quantity,
      checkedBy: clean(leadingHand) || "Daily Docket",
      checkedAt: occurredAt,
      notes: "Received from another tower via Daily Docket",
    });

    await ensureSourceShortage({
      service,
      projectId,
      docketId,
      transfer,
      towerNames: names,
    });

    const replacementQty = Math.max(
      Math.round(num(draft.replacement_quantity)),
      0,
    );

    if (replacementQty > 0) {
      await recordReplacementDelivery({
        service,
        projectId,
        docketId,
        docketDate,
        leadingHand,
        transfer,
        quantity: replacementQty,
        occurredTime:
          clean(draft.replacement_time) ||
          clean(draft.occurred_time),
        towerNames: names,
      });
    }
  }
}
