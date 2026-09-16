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
  loadAssetDocumentTypeById,
  loadAssetRecord,
  loadAssetSettings,
  publishAssetDocument,
} from "@/lib/assets/sharepoint";

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
      return NextResponse.json(
        { error: "Asset type must be vehicle or plant." },
        { status: 400 },
      );
    }

    const { service, identity } = await requireAssetUser(request);
    if (!canManageAssets(identity.role)) throw new Error("ASSET_MANAGE_FORBIDDEN");

    const formData = await request.formData();
    const file = formData.get("file");
    const documentTypeId = clean(formData.get("documentTypeId"));

    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "Choose a document to upload." }, { status: 400 });
    }
    if (!documentTypeId) {
      return NextResponse.json({ error: "Select the Asset document type." }, { status: 400 });
    }

    const [settings, asset, documentType] = await Promise.all([
      loadAssetSettings(service),
      loadAssetRecord({ service, assetType, assetId }),
      loadAssetDocumentTypeById({ service, documentTypeId }),
    ]);

    const maxBytes = Math.max(1, Number(settings.max_file_size_mb || 50)) * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `The file is larger than the configured ${settings.max_file_size_mb} MB Asset upload limit.` },
        { status: 413 },
      );
    }

    const amountExGst = numberValue(formData.get("amountExGst"));
    const gstAmount = numberValue(formData.get("gstAmount"));
    const amountIncGst =
      numberValue(formData.get("amountIncGst")) || amountExGst + gstAmount;

    const document = await publishAssetDocument({
      service,
      identity,
      assetType,
      assetId,
      documentType,
      originalFileName: file.name,
      content: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
      title: clean(formData.get("title")) || documentType.name,
      documentDate: clean(formData.get("documentDate")) || null,
      expiryDate: clean(formData.get("expiryDate")) || null,
      supplier: clean(formData.get("supplier")) || null,
      invoiceNumber: clean(formData.get("invoiceNumber")) || null,
      amountExGst: amountExGst || null,
      gstAmount: gstAmount || null,
      amountIncGst: amountIncGst || null,
      serviceRecordId: clean(formData.get("serviceRecordId")) || null,
      fleetJobId: clean(formData.get("fleetJobId")) || null,
      source: "assets",
      generatedByModule: "asset_document_upload",
    });

    let finance: {
      submissionId: string;
      submissionNumber: string;
      itemId: string;
      attachmentId: string | null;
    } | null = null;
    let warning: string | null = null;

    const createFinanceRecord = clean(formData.get("createFinanceRecord")) === "true";

    if (documentType.category === "invoice" && createFinanceRecord && amountIncGst > 0) {
      try {
        finance = await createAssetFinanceInvoice({
          service,
          identity,
          assetType,
          assetId,
          projectId: clean(formData.get("projectId")) || null,
          fleetJobId: clean(formData.get("fleetJobId")) || null,
          serviceRecordId: clean(formData.get("serviceRecordId")) || null,
          supplier: clean(formData.get("supplier")) || null,
          invoiceNumber: clean(formData.get("invoiceNumber")) || null,
          invoiceDate:
            clean(formData.get("documentDate")) || new Date().toISOString().slice(0, 10),
          description: clean(formData.get("title")) || `${assetLabel(assetType, asset)} invoice`,
          amountExGst,
          gstAmount,
          amountIncGst,
          document,
        });
      } catch (financeError) {
        warning =
          financeError instanceof Error
            ? `Document uploaded, but the Finance draft could not be created: ${financeError.message}`
            : "Document uploaded, but the Finance draft could not be created.";
      }
    }

    await notifyAssetManagers({
      service,
      input: {
        eventType: "asset_document_uploaded",
        title: `Asset document uploaded · ${assetLabel(assetType, asset)}`,
        message: `${identity.name} uploaded ${document.file_name}.`,
        assetType,
        assetId,
        actionRoute: assetDetailRoute(assetType, assetId),
        actionParams: {
          document_id: document.id,
          document_type_id: document.document_type_id,
          document_type_code: document.document_type_code,
        },
        actor: identity,
      },
    });

    return NextResponse.json({ document, finance, warning });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
