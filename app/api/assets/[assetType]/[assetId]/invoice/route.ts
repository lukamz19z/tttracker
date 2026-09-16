import { NextResponse } from "next/server";

import { createAssetFinanceInvoice } from "@/lib/assets/finance";
import { notifyAssetManagers } from "@/lib/assets/notifications";
import {
  assetApiError,
  assetDetailRoute,
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
import type { AssetDocumentRow } from "@/lib/assets/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ assetType: string; assetId: string }>;
};

function numberValue(value: FormDataEntryValue | null) {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { assetType: rawType, assetId } = await context.params;
    const assetType = parseAssetType(rawType);

    if (!assetType) {
      return NextResponse.json({ error: "Asset type must be vehicle or plant." }, { status: 400 });
    }

    const { service, identity } = await requireAssetUser(request);
    if (!canManageAssets(identity.role)) throw new Error("ASSET_MANAGE_FORBIDDEN");

    const formData = await request.formData();
    const supplier = clean(formData.get("supplier"));
    const invoiceNumber = clean(formData.get("invoiceNumber"));
    const invoiceDate =
      clean(formData.get("invoiceDate")) || new Date().toISOString().slice(0, 10);
    const description = clean(formData.get("description")) || "Asset invoice";
    const projectId = clean(formData.get("projectId")) || null;
    const fleetJobId = clean(formData.get("fleetJobId")) || null;
    const serviceRecordId = clean(formData.get("serviceRecordId")) || null;

    const amountExGst = numberValue(formData.get("amountExGst"));
    const gstAmount = numberValue(formData.get("gstAmount"));
    const amountIncGst =
      numberValue(formData.get("amountIncGst")) || amountExGst + gstAmount;

    if (amountIncGst <= 0) {
      return NextResponse.json({ error: "Enter the invoice / cost amount." }, { status: 400 });
    }

    const [asset, settings, invoiceDocumentType] = await Promise.all([
      loadAssetRecord({ service, assetType, assetId }),
      loadAssetSettings(service),
      loadSystemAssetDocumentType({ service, systemKey: "invoice" }),
    ]);

    const fileEntry = formData.get("file");
    let document: AssetDocumentRow | null = null;

    if (fileEntry instanceof File && fileEntry.size > 0) {
      const maxBytes = Math.max(1, Number(settings.max_file_size_mb || 50)) * 1024 * 1024;
      if (fileEntry.size > maxBytes) {
        return NextResponse.json(
          { error: `The invoice is larger than the configured ${settings.max_file_size_mb} MB limit.` },
          { status: 413 },
        );
      }

      document = await publishAssetDocument({
        service,
        identity,
        assetType,
        assetId,
        documentType: invoiceDocumentType,
        originalFileName: fileEntry.name,
        content: new Uint8Array(await fileEntry.arrayBuffer()),
        contentType: fileEntry.type || "application/octet-stream",
        title: invoiceNumber ? `Invoice ${invoiceNumber}` : description,
        documentDate: invoiceDate,
        expiryDate: null,
        supplier: supplier || null,
        invoiceNumber: invoiceNumber || null,
        amountExGst,
        gstAmount,
        amountIncGst,
        serviceRecordId,
        fleetJobId,
        source: "assets",
        generatedByModule: "asset_invoice",
      });
    }

    const finance = await createAssetFinanceInvoice({
      service,
      identity,
      assetType,
      assetId,
      projectId,
      fleetJobId,
      serviceRecordId,
      supplier,
      invoiceNumber,
      invoiceDate,
      description,
      amountExGst,
      gstAmount,
      amountIncGst,
      document,
    });

    await notifyAssetManagers({
      service,
      input: {
        eventType: "asset_finance_linked",
        title: `Asset cost added · ${assetLabel(assetType, asset)}`,
        message: `${identity.name} added ${finance.submissionNumber} for ${new Intl.NumberFormat("en-AU", {
          style: "currency",
          currency: "AUD",
        }).format(amountIncGst)}.`,
        assetType,
        assetId,
        actionRoute: assetDetailRoute(assetType, assetId),
        actionParams: {
          financial_submission_id: finance.submissionId,
          financial_item_id: finance.itemId,
          document_id: document?.id ?? null,
        },
        actor: identity,
      },
    });

    return NextResponse.json({ finance, document });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
