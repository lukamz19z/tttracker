import { NextResponse } from "next/server";

import { createAssetFinanceInvoice } from "@/lib/assets/finance";
import { notifyAssetManagers } from "@/lib/assets/notifications";
import {
  assetApiError,
  assetDetailRoute,
  assetTable,
  canManageAssets,
  clean,
  parseAssetType,
  requireAssetUser,
} from "@/lib/assets/server";
import {
  assetLabel,
  loadAssetDocumentTypeById,
  loadAssetRecord,
  loadAssetSettings,
  publishAssetDocument,
} from "@/lib/assets/sharepoint";
import type { AssetDocumentRow } from "@/lib/assets/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type UpdateKind =
  | "modification"
  | "meter"
  | "status"
  | "project_transfer"
  | "compliance"
  | "other";

type UpdatePayload = {
  assetType?: string;
  assetId?: string;
  updateType?: UpdateKind;
  eventDate?: string;
  title?: string;
  description?: string;
  supplier?: string | null;
  cost?: number | null;
  odometerKm?: number | null;
  engineHours?: number | null;
  status?: string | null;
  project?: string | null;
  crew?: string | null;
  documentTypeId?: string | null;
  documentDate?: string | null;
  expiryDate?: string | null;
  invoiceNumber?: string | null;
  createFinanceRecord?: boolean;
};

const UPDATE_TYPES = new Set<UpdateKind>([
  "modification",
  "meter",
  "status",
  "project_transfer",
  "compliance",
  "other",
]);

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: Request) {
  try {
    const { service, identity } = await requireAssetUser(request);
    if (!canManageAssets(identity.role)) throw new Error("ASSET_MANAGE_FORBIDDEN");

    const formData = await request.formData();
    const payloadRaw = clean(formData.get("payload"));
    if (!payloadRaw) {
      return NextResponse.json({ error: "Asset update details are required." }, { status: 400 });
    }

    let payload: UpdatePayload;
    try {
      payload = JSON.parse(payloadRaw) as UpdatePayload;
    } catch {
      return NextResponse.json({ error: "The Asset update form data is invalid." }, { status: 400 });
    }

    const assetType = parseAssetType(payload.assetType);
    const assetId = clean(payload.assetId);
    const updateType = clean(payload.updateType) as UpdateKind;

    if (!assetType || !assetId) {
      return NextResponse.json({ error: "Select the Asset to update." }, { status: 400 });
    }
    if (!UPDATE_TYPES.has(updateType)) {
      return NextResponse.json({ error: "Select a valid Asset update type." }, { status: 400 });
    }

    const eventDate = clean(payload.eventDate) || new Date().toISOString().slice(0, 10);
    const title = clean(payload.title);
    if (!title) {
      return NextResponse.json({ error: "Enter an update title / summary." }, { status: 400 });
    }

    const [asset, settings] = await Promise.all([
      loadAssetRecord({ service, assetType, assetId }),
      loadAssetSettings(service),
    ]);

    const masterUpdate: Record<string, unknown> = {};

    if (updateType === "meter") {
      if (assetType === "vehicle") {
        masterUpdate.current_odometer_km = numberOrNull(payload.odometerKm);
      } else {
        masterUpdate.current_engine_hours = numberOrNull(payload.engineHours);
      }
    }

    if (updateType === "status") {
      if (assetType === "vehicle") {
        masterUpdate.status = clean(payload.status) || null;
      } else {
        masterUpdate.asset_status = clean(payload.status) || null;
      }
    }

    if (updateType === "project_transfer") {
      masterUpdate.project = clean(payload.project) || null;
      masterUpdate.crew = clean(payload.crew) || null;
    }

    if (Object.keys(masterUpdate).length > 0) {
      const { error } = await service
        .from(assetTable(assetType))
        .update(masterUpdate)
        .eq("id", assetId);
      if (error) throw new Error(error.message);
    }

    if (updateType === "project_transfer") {
      const historyTable =
        assetType === "vehicle"
          ? "vehicle_project_history"
          : "plant_project_history";
      const historyAssetColumn =
        assetType === "vehicle"
          ? "vehicle_asset_id"
          : "plant_asset_id";

      const { error: projectHistoryError } = await service
        .from(historyTable)
        .insert({
          [historyAssetColumn]: assetId,
          project: clean(payload.project) || null,
          crew: clean(payload.crew) || null,
          project_onboard_date: eventDate,
          project_offboard_date: null,
          notes: clean(payload.description) || null,
        });

      if (projectHistoryError) {
        throw new Error(projectHistoryError.message);
      }
    }

    const file = formData.get("file");
    let document: AssetDocumentRow | null = null;

    if (file instanceof File && file.size > 0) {
      const documentTypeId = clean(payload.documentTypeId);
      if (!documentTypeId) {
        return NextResponse.json(
          { error: "Select the document type for the attachment." },
          { status: 400 },
        );
      }

      const maxBytes = Math.max(1, Number(settings.max_file_size_mb || 50)) * 1024 * 1024;
      if (file.size > maxBytes) {
        return NextResponse.json(
          { error: `The file is larger than the configured ${settings.max_file_size_mb} MB limit.` },
          { status: 413 },
        );
      }

      const documentType = await loadAssetDocumentTypeById({ service, documentTypeId });
      document = await publishAssetDocument({
        service,
        identity,
        assetType,
        assetId,
        documentType,
        originalFileName: file.name,
        content: new Uint8Array(await file.arrayBuffer()),
        contentType: file.type || "application/octet-stream",
        title,
        documentDate: clean(payload.documentDate) || eventDate,
        expiryDate: clean(payload.expiryDate) || null,
        supplier: clean(payload.supplier) || null,
        invoiceNumber: clean(payload.invoiceNumber) || null,
        amountIncGst: numberOrNull(payload.cost),
        source: "assets",
        generatedByModule: "update_asset",
        createTimelineEvent: false,
      });
    }

    let finance: {
      submissionId: string;
      submissionNumber: string;
      itemId: string;
      attachmentId: string | null;
    } | null = null;

    const cost = numberOrNull(payload.cost) ?? 0;
    if (payload.createFinanceRecord === true && cost > 0) {
      finance = await createAssetFinanceInvoice({
        service,
        identity,
        assetType,
        assetId,
        supplier: clean(payload.supplier) || null,
        invoiceNumber: clean(payload.invoiceNumber) || null,
        invoiceDate: eventDate,
        description: title,
        amountExGst: cost,
        gstAmount: 0,
        amountIncGst: cost,
        document: document?.document_category === "invoice" ? document : null,
      });
    }

    const { data: event, error: eventError } = await service
      .from("asset_events")
      .insert({
        asset_type: assetType,
        vehicle_asset_id: assetType === "vehicle" ? assetId : null,
        plant_asset_id: assetType === "plant" ? assetId : null,
        event_type: updateType,
        event_date: eventDate,
        title,
        description: clean(payload.description) || null,
        supplier: clean(payload.supplier) || null,
        cost: cost || null,
        odometer_km: numberOrNull(payload.odometerKm),
        engine_hours: numberOrNull(payload.engineHours),
        fleet_job_id: null,
        service_record_id: null,
        document_id: document?.id ?? null,
        financial_submission_id: finance?.submissionId ?? null,
        performed_by: identity.userId,
        performed_by_name: identity.name,
        metadata: {
          status: clean(payload.status) || null,
          project: clean(payload.project) || null,
          crew: clean(payload.crew) || null,
          invoice_number: clean(payload.invoiceNumber) || null,
        },
      })
      .select("*")
      .single();

    if (eventError) throw new Error(eventError.message);

    await notifyAssetManagers({
      service,
      input: {
        eventType: "asset_updated",
        title: `Asset updated · ${assetLabel(assetType, asset)}`,
        message: `${identity.name} recorded ${title}.`,
        assetType,
        assetId,
        actionRoute: assetDetailRoute(assetType, assetId),
        actionParams: { asset_event_id: event.id, update_type: updateType },
        actor: identity,
      },
    });

    return NextResponse.json({ event, document, finance });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
