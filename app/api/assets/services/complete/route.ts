import { NextResponse } from "next/server";

import { loadSystemPdfBranding } from "@/lib/branding/server";
import { createAssetFinanceInvoice } from "@/lib/assets/finance";
import { notifyAssetManagers } from "@/lib/assets/notifications";
import { generateAssetServicePdf } from "@/lib/assets/service-pdf";
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
  loadAssetRecord,
  loadAssetSettings,
  loadSystemAssetDocumentType,
  publishAssetDocument,
} from "@/lib/assets/sharepoint";
import type {
  AssetDocumentRow,
  AssetServiceItemInput,
} from "@/lib/assets/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type ServicePayload = {
  assetType?: string;
  assetId?: string;
  recordType?:
    | "service"
    | "repair"
    | "inspection"
    | "maintenance"
    | "breakdown";
  serviceDate?: string;
  odometerKm?: number | null;
  engineHours?: number | null;
  providerType?: "internal" | "external";
  providerName?: string | null;
  supplier?: string | null;
  fleetJobId?: string | null;
  projectId?: string | null;
  workOrderReference?: string | null;
  summary?: string;
  workCompleted?: string | null;
  recommendations?: string | null;
  followUpActions?: string | null;
  nextServiceDate?: string | null;
  nextServiceKm?: number | null;
  nextServiceHours?: number | null;
  invoiceNumber?: string | null;
  amountExGst?: number | null;
  gstAmount?: number | null;
  amountIncGst?: number | null;
  useServiceFileAsInvoice?: boolean;
  createFinanceRecord?: boolean;
  items?: AssetServiceItemInput[];
};

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberValue(value: unknown) {
  return numberOrNull(value) ?? 0;
}

function validRecordType(
  value: unknown,
): NonNullable<ServicePayload["recordType"]> {
  const type = clean(value).toLowerCase();

  if (
    type === "repair" ||
    type === "inspection" ||
    type === "maintenance" ||
    type === "breakdown"
  ) {
    return type;
  }

  return "service";
}

function recordTypeTitle(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export async function POST(request: Request) {
  let serviceRecordId: string | null = null;

  try {
    const { service, identity } = await requireAssetUser(request);
    if (!canManageAssets(identity.role)) throw new Error("ASSET_MANAGE_FORBIDDEN");

    const formData = await request.formData();
    const payloadRaw = clean(formData.get("payload"));

    if (!payloadRaw) {
      return NextResponse.json({ error: "Service details are required." }, { status: 400 });
    }

    let payload: ServicePayload;
    try {
      payload = JSON.parse(payloadRaw) as ServicePayload;
    } catch {
      return NextResponse.json({ error: "The service form data is invalid." }, { status: 400 });
    }

    const assetType = parseAssetType(payload.assetType);
    const assetId = clean(payload.assetId);
    if (!assetType || !assetId) {
      return NextResponse.json({ error: "Select the Vehicle or Plant asset." }, { status: 400 });
    }

    const serviceDate = clean(payload.serviceDate) || new Date().toISOString().slice(0, 10);
    const summary = clean(payload.summary);
    if (!summary) {
      return NextResponse.json({ error: "Enter the service / repair summary." }, { status: 400 });
    }

    const recordType = validRecordType(payload.recordType);
    const providerType = payload.providerType === "external" ? "external" : "internal";

    const items = (Array.isArray(payload.items) ? payload.items : [])
      .map((item) => ({
        issue: clean(item.issue),
        diagnosis: clean(item.diagnosis) || null,
        rectification: clean(item.rectification) || null,
        partsUsed: clean(item.partsUsed) || null,
        labourHours: numberOrNull(item.labourHours),
        itemStatus:
          item.itemStatus === "monitor" || item.itemStatus === "unresolved"
            ? item.itemStatus
            : ("resolved" as const),
      }))
      .filter((item) => item.issue);

    const amountExGst = numberValue(payload.amountExGst);
    const gstAmount = numberValue(payload.gstAmount);
    const amountIncGst =
      numberValue(payload.amountIncGst) || amountExGst + gstAmount;

    const serviceFileEntry = formData.get("serviceFile");
    const invoiceFileEntry = formData.get("invoiceFile");

    if (providerType === "external" && !clean(payload.providerName)) {
      return NextResponse.json(
        { error: "Enter the external mechanic / workshop name." },
        { status: 400 },
      );
    }

    if (
      providerType === "external" &&
      (!(serviceFileEntry instanceof File) || serviceFileEntry.size <= 0)
    ) {
      return NextResponse.json(
        {
          error:
            "Upload the external mechanic service report / workshop document.",
        },
        { status: 400 },
      );
    }

    const [asset, settings, serviceDocumentType] = await Promise.all([
      loadAssetRecord({ service, assetType, assetId }),
      loadAssetSettings(service),
      loadSystemAssetDocumentType({ service, systemKey: "service" }),
    ]);

    const maxBytes =
      Math.max(1, Number(settings.max_file_size_mb || 50)) * 1024 * 1024;

    if (
      serviceFileEntry instanceof File &&
      serviceFileEntry.size > 0 &&
      serviceFileEntry.size > maxBytes
    ) {
      return NextResponse.json(
        {
          error: `The service document is larger than the configured ${settings.max_file_size_mb} MB limit.`,
        },
        { status: 400 },
      );
    }

    if (
      invoiceFileEntry instanceof File &&
      invoiceFileEntry.size > 0 &&
      invoiceFileEntry.size > maxBytes
    ) {
      return NextResponse.json(
        {
          error: `The invoice is larger than the configured ${settings.max_file_size_mb} MB limit.`,
        },
        { status: 400 },
      );
    }

    const branding =
      providerType === "internal" ? await loadSystemPdfBranding() : null;

    const providerName =
      providerType === "internal"
        ? clean(branding?.companyName) || "BC Contracting"
        : clean(payload.providerName);

    const { data: serviceRecord, error: serviceRecordError } = await service
      .from("asset_service_records")
      .insert({
        service_number: null,
        asset_type: assetType,
        vehicle_asset_id: assetType === "vehicle" ? assetId : null,
        plant_asset_id: assetType === "plant" ? assetId : null,
        record_type: recordType,
        status: "draft",
        service_date: serviceDate,
        odometer_km: numberOrNull(payload.odometerKm),
        engine_hours: numberOrNull(payload.engineHours),
        provider_type: providerType,
        provider_name: providerName,
        mechanic_employee_id:
          providerType === "internal" ? identity.employeeId : null,
        mechanic_name: providerType === "internal" ? identity.name : null,
        supplier:
          clean(payload.supplier) ||
          (providerType === "external" ? providerName : null),
        fleet_job_id: clean(payload.fleetJobId) || null,
        work_order_reference: clean(payload.workOrderReference) || null,
        summary,
        work_completed: clean(payload.workCompleted) || null,
        recommendations: clean(payload.recommendations) || null,
        follow_up_actions: clean(payload.followUpActions) || null,
        next_service_date: clean(payload.nextServiceDate) || null,
        next_service_km: numberOrNull(payload.nextServiceKm),
        next_service_hours: numberOrNull(payload.nextServiceHours),
        invoice_number: clean(payload.invoiceNumber) || null,
        amount_ex_gst: amountExGst,
        gst_amount: gstAmount,
        amount_inc_gst: amountIncGst,
        created_by: identity.userId,
        created_by_name: identity.name,
      })
      .select("*")
      .single();

    if (serviceRecordError) throw new Error(serviceRecordError.message);
    serviceRecordId = serviceRecord.id;

    if (items.length > 0) {
      const { error: itemError } = await service.from("asset_service_items").insert(
        items.map((item, index) => ({
          service_record_id: serviceRecord.id,
          sort_order: index,
          issue: item.issue,
          diagnosis: item.diagnosis,
          rectification: item.rectification,
          parts_used: item.partsUsed,
          labour_hours: item.labourHours,
          item_status: item.itemStatus,
        })),
      );
      if (itemError) throw new Error(itemError.message);
    }

    const completedAt = new Date().toISOString();
    const label = assetLabel(assetType, asset);

    let reportDocument: AssetDocumentRow;

    let externalServiceContent: Uint8Array | null = null;
    let externalServiceContentType = "";
    let externalServiceFileName = "";

    if (providerType === "internal") {
      if (!branding) {
        throw new Error("BC PDF branding could not be loaded.");
      }

      const pdf = generateAssetServicePdf({
        serviceNumber: serviceRecord.service_number,
        assetType,
        assetLabel: label,
        assetDetails: {
          registration:
            assetType === "vehicle"
              ? clean(asset.vehicle_rego) || null
              : clean(asset.rego) || null,
          serialNumber: clean(asset.serial_number) || null,
          vin: clean(asset.vin_number) || null,
          project: clean(asset.project) || null,
          crew: clean(asset.crew) || null,
        },
        serviceDate,
        recordType,
        providerType,
        providerName,
        mechanicName: identity.name,
        workOrderReference: clean(payload.workOrderReference) || null,
        odometerKm: numberOrNull(payload.odometerKm),
        engineHours: numberOrNull(payload.engineHours),
        summary,
        items,
        workCompleted: clean(payload.workCompleted) || null,
        recommendations: clean(payload.recommendations) || null,
        followUpActions: clean(payload.followUpActions) || null,
        nextServiceDate: clean(payload.nextServiceDate) || null,
        nextServiceKm: numberOrNull(payload.nextServiceKm),
        nextServiceHours: numberOrNull(payload.nextServiceHours),
        supplier: clean(payload.supplier) || null,
        invoiceNumber: clean(payload.invoiceNumber) || null,
        amountExGst,
        gstAmount,
        amountIncGst,
        completedAt,
        branding: {
          logoDataUrl: branding.logoDataUrl,
          companyName: branding.companyName,
          abn: branding.abn,
          addressLine1: branding.addressLine1,
          addressLine2: branding.addressLine2,
          suburb: branding.suburb,
          state: branding.state,
          postcode: branding.postcode,
          phone: branding.phone,
          email: branding.email,
          website: branding.website,
        },
      });

      reportDocument = await publishAssetDocument({
        service,
        identity,
        assetType,
        assetId,
        documentType: serviceDocumentType,
        originalFileName: "service-record.pdf",
        forcedExtension: ".pdf",
        content: pdf,
        contentType: "application/pdf",
        title: `${serviceRecord.service_number} · ${summary}`,
        documentDate: serviceDate,
        supplier: clean(payload.supplier) || null,
        invoiceNumber: clean(payload.invoiceNumber) || null,
        amountExGst: amountExGst || null,
        gstAmount: gstAmount || null,
        amountIncGst: amountIncGst || null,
        serviceRecordId: serviceRecord.id,
        fleetJobId: clean(payload.fleetJobId) || null,
        source: "service",
        generatedByModule: "bc_service",
        serviceNumber: serviceRecord.service_number,
        createTimelineEvent: false,
      });
    } else {
      if (!(serviceFileEntry instanceof File) || serviceFileEntry.size <= 0) {
        throw new Error(
          "The external mechanic service document could not be read.",
        );
      }

      externalServiceContent = new Uint8Array(
        await serviceFileEntry.arrayBuffer(),
      );
      externalServiceContentType =
        serviceFileEntry.type || "application/octet-stream";
      externalServiceFileName = serviceFileEntry.name;

      reportDocument = await publishAssetDocument({
        service,
        identity,
        assetType,
        assetId,
        documentType: serviceDocumentType,
        originalFileName: externalServiceFileName,
        content: externalServiceContent,
        contentType: externalServiceContentType,
        title: `${serviceRecord.service_number} · ${providerName} · ${summary}`,
        documentDate: serviceDate,
        supplier: clean(payload.supplier) || providerName,
        invoiceNumber: clean(payload.invoiceNumber) || null,
        amountExGst: amountExGst || null,
        gstAmount: gstAmount || null,
        amountIncGst: amountIncGst || null,
        serviceRecordId: serviceRecord.id,
        fleetJobId: clean(payload.fleetJobId) || null,
        source: "service",
        generatedByModule: "external_service_upload",
        serviceNumber: serviceRecord.service_number,
        createTimelineEvent: false,
      });
    }

    let invoiceDocument: AssetDocumentRow | null = null;

    const useExternalServiceFileAsInvoice =
      providerType === "external" &&
      payload.useServiceFileAsInvoice === true &&
      externalServiceContent !== null &&
      Boolean(externalServiceFileName);

    if (
      (invoiceFileEntry instanceof File && invoiceFileEntry.size > 0) ||
      useExternalServiceFileAsInvoice
    ) {
      const invoiceContent =
        invoiceFileEntry instanceof File && invoiceFileEntry.size > 0
          ? new Uint8Array(await invoiceFileEntry.arrayBuffer())
          : externalServiceContent;

      const invoiceFileName =
        invoiceFileEntry instanceof File && invoiceFileEntry.size > 0
          ? invoiceFileEntry.name
          : externalServiceFileName;

      const invoiceContentType =
        invoiceFileEntry instanceof File && invoiceFileEntry.size > 0
          ? invoiceFileEntry.type || "application/octet-stream"
          : externalServiceContentType || "application/octet-stream";

      if (!invoiceContent || !invoiceFileName) {
        throw new Error("The invoice document could not be read.");
      }

      const invoiceDocumentType = await loadSystemAssetDocumentType({
        service,
        systemKey: "invoice",
      });

      invoiceDocument = await publishAssetDocument({
        service,
        identity,
        assetType,
        assetId,
        documentType: invoiceDocumentType,
        originalFileName: invoiceFileName,
        content: invoiceContent,
        contentType: invoiceContentType,
        title: clean(payload.invoiceNumber)
          ? `Invoice ${clean(payload.invoiceNumber)}`
          : `${serviceRecord.service_number} Service Invoice`,
        documentDate: serviceDate,
        supplier: clean(payload.supplier) || providerName,
        invoiceNumber: clean(payload.invoiceNumber) || null,
        amountExGst: amountExGst || null,
        gstAmount: gstAmount || null,
        amountIncGst: amountIncGst || null,
        serviceRecordId: serviceRecord.id,
        fleetJobId: clean(payload.fleetJobId) || null,
        source: "service",
        generatedByModule:
          providerType === "internal"
            ? "bc_service_invoice"
            : "external_service_invoice",
      });
    }

    let finance: {
      submissionId: string;
      submissionNumber: string;
      itemId: string;
      attachmentId: string | null;
    } | null = null;

    if (payload.createFinanceRecord === true && amountIncGst > 0) {
      finance = await createAssetFinanceInvoice({
        service,
        identity,
        assetType,
        assetId,
        projectId: clean(payload.projectId) || null,
        fleetJobId: clean(payload.fleetJobId) || null,
        serviceRecordId: serviceRecord.id,
        supplier:
          clean(payload.supplier) || clean(payload.providerName) || providerName,
        invoiceNumber: clean(payload.invoiceNumber) || null,
        invoiceDate: serviceDate,
        description: `${serviceRecord.service_number} · ${summary}`,
        amountExGst,
        gstAmount,
        amountIncGst,
        document: invoiceDocument,
      });
    }

    const updatePayload: Record<string, unknown> =
      assetType === "vehicle"
        ? {
            last_service: serviceDate,
            current_odometer_km: numberOrNull(payload.odometerKm),
            next_service_due: clean(payload.nextServiceDate) || null,
            next_service_km: numberOrNull(payload.nextServiceKm),
          }
        : {
            last_service_date: serviceDate,
            last_service_hours: numberOrNull(payload.engineHours),
            current_engine_hours: numberOrNull(payload.engineHours),
            next_service_due: clean(payload.nextServiceDate) || null,
            next_service_hours: numberOrNull(payload.nextServiceHours),
          };

    const { error: assetUpdateError } = await service
      .from(assetTable(assetType))
      .update(updatePayload)
      .eq("id", assetId);
    if (assetUpdateError) throw new Error(assetUpdateError.message);

    const { error: completeError } = await service
      .from("asset_service_records")
      .update({
        status: "completed",
        report_document_id: reportDocument.id,
        financial_submission_id: finance?.submissionId ?? null,
        financial_item_id: finance?.itemId ?? null,
        financial_attachment_id: finance?.attachmentId ?? null,
        completed_at: completedAt,
      })
      .eq("id", serviceRecord.id);
    if (completeError) throw new Error(completeError.message);

    const { error: eventError } = await service.from("asset_events").insert({
      asset_type: assetType,
      vehicle_asset_id: assetType === "vehicle" ? assetId : null,
      plant_asset_id: assetType === "plant" ? assetId : null,
      event_type: recordType,
      event_date: serviceDate,
      title: `${serviceRecord.service_number} · ${recordTypeTitle(recordType)}`,
      description: summary,
      supplier: clean(payload.supplier) || (providerType === "external" ? providerName : null),
      cost: amountIncGst || null,
      odometer_km: numberOrNull(payload.odometerKm),
      engine_hours: numberOrNull(payload.engineHours),
      fleet_job_id: clean(payload.fleetJobId) || null,
      service_record_id: serviceRecord.id,
      document_id: reportDocument.id,
      financial_submission_id: finance?.submissionId ?? null,
      performed_by: identity.userId,
      performed_by_name: identity.name,
      metadata: {
        provider_type: providerType,
        provider_name: providerName,
        next_service_date: clean(payload.nextServiceDate) || null,
        next_service_km: numberOrNull(payload.nextServiceKm),
        next_service_hours: numberOrNull(payload.nextServiceHours),
        unresolved_items: items.filter((item) => item.itemStatus === "unresolved").length,
      },
    });
    if (eventError) throw new Error(eventError.message);

    await notifyAssetManagers({
      service,
      input: {
        eventType: "asset_service_completed",
        title:
          providerType === "external"
            ? `${recordTypeTitle(recordType)} recorded · ${label}`
            : `${recordTypeTitle(recordType)} completed · ${label}`,
        message:
          providerType === "external"
            ? `${identity.name} recorded ${serviceRecord.service_number} from ${providerName} (${summary}).`
            : `${identity.name} completed ${serviceRecord.service_number} (${summary}).`,
        assetType,
        assetId,
        actionRoute: assetDetailRoute(assetType, assetId),
        actionParams: {
          service_record_id: serviceRecord.id,
          service_number: serviceRecord.service_number,
          financial_submission_id: finance?.submissionId ?? null,
        },
        severity: "success",
        actor: identity,
      },
    });

    return NextResponse.json({
      service: {
        ...serviceRecord,
        status: "completed",
        report_document_id: reportDocument.id,
        financial_submission_id: finance?.submissionId ?? null,
        financial_item_id: finance?.itemId ?? null,
        financial_attachment_id: finance?.attachmentId ?? null,
        completed_at: completedAt,
      },
      reportDocument,
      invoiceDocument,
      finance,
    });
  } catch (error) {
    if (serviceRecordId) {
      console.error(`Asset service ${serviceRecordId} did not complete cleanly`, error);
    }

    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
