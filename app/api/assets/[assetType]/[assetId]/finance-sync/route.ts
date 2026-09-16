import { NextResponse } from "next/server";

import { loadAssetSpend } from "@/lib/assets/finance";
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
  loadSystemAssetDocumentType,
  publishAssetDocument,
} from "@/lib/assets/sharepoint";
import { downloadDriveItemContent } from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ assetType: string; assetId: string }>;
};

type FinanceAttachment = {
  id: string;
  submission_id: string;
  item_id: string | null;
  attachment_type: string;
  file_name: string;
  content_type: string | null;
  file_size_bytes: number | string | null;
  sharepoint_drive_id: string | null;
  sharepoint_item_id: string | null;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { assetType: rawType, assetId } = await context.params;
    const assetType = parseAssetType(rawType);
    if (!assetType) {
      return NextResponse.json({ error: "Asset type must be vehicle or plant." }, { status: 400 });
    }

    const { service, identity } = await requireAssetUser(request);
    if (!canManageAssets(identity.role)) throw new Error("ASSET_MANAGE_FORBIDDEN");

    const [asset, spend, invoiceType] = await Promise.all([
      loadAssetRecord({ service, assetType, assetId }),
      loadAssetSpend({ service, assetType, assetId }),
      loadSystemAssetDocumentType({ service, systemKey: "invoice" }),
    ]);

    if (spend.length === 0) {
      return NextResponse.json({ synced: 0, skipped: 0, message: "No linked Finance records were found." });
    }

    const submissionIds = Array.from(new Set(spend.map((row) => row.submissionId)));
    const { data, error } = await service
      .from("financial_attachments")
      .select("id,submission_id,item_id,attachment_type,file_name,content_type,file_size_bytes,sharepoint_drive_id,sharepoint_item_id")
      .in("submission_id", submissionIds);

    if (error) throw new Error(error.message);
    const attachments = (data ?? []) as FinanceAttachment[];

    const { data: existingData, error: existingError } = await service
      .from("asset_documents")
      .select("financial_attachment_id")
      .eq(assetType === "vehicle" ? "vehicle_asset_id" : "plant_asset_id", assetId)
      .not("financial_attachment_id", "is", null);

    if (existingError) throw new Error(existingError.message);
    const existing = new Set(
      (existingData ?? [])
        .map((row) => clean(row.financial_attachment_id))
        .filter(Boolean),
    );

    let synced = 0;
    let skipped = 0;

    for (const attachment of attachments) {
      if (existing.has(attachment.id)) {
        skipped += 1;
        continue;
      }

      const driveId = clean(attachment.sharepoint_drive_id);
      const itemId = clean(attachment.sharepoint_item_id);
      if (!driveId || !itemId) {
        skipped += 1;
        continue;
      }

      const linkedSpend =
        spend.find((row) => row.itemId === attachment.item_id) ??
        spend.find((row) => row.submissionId === attachment.submission_id) ??
        null;

      const downloaded = await downloadDriveItemContent({ driveId, itemId });

      await publishAssetDocument({
        service,
        identity,
        assetType,
        assetId,
        documentType: invoiceType,
        originalFileName: attachment.file_name,
        content: downloaded.content,
        contentType: attachment.content_type || downloaded.contentType,
        title: linkedSpend
          ? `${linkedSpend.submissionNumber} · ${linkedSpend.description}`
          : attachment.file_name,
        documentDate:
          linkedSpend?.expenseDate || new Date().toISOString().slice(0, 10),
        supplier: linkedSpend?.supplier ?? null,
        invoiceNumber: linkedSpend?.invoiceNumber ?? null,
        amountExGst: linkedSpend?.amountExGst ?? null,
        gstAmount: linkedSpend?.gstAmount ?? null,
        amountIncGst: linkedSpend?.amountIncGst ?? null,
        serviceRecordId: linkedSpend?.serviceRecordId ?? null,
        fleetJobId: linkedSpend?.fleetJobId ?? null,
        financialSubmissionId: attachment.submission_id,
        financialItemId: linkedSpend?.itemId ?? null,
        financialAttachmentId: attachment.id,
        source: "finance",
        generatedByModule: "finance_sync",
      });

      synced += 1;
    }

    if (synced > 0) {
      await notifyAssetManagers({
        service,
        input: {
          eventType: "asset_finance_linked",
          title: `Finance documents linked · ${assetLabel(assetType, asset)}`,
          message: `${synced} Finance document${synced === 1 ? "" : "s"} copied into the Asset SharePoint folder.`,
          assetType,
          assetId,
          actionRoute: assetDetailRoute(assetType, assetId),
          actionParams: { synced },
          actor: identity,
        },
      });
    }

    return NextResponse.json({
      synced,
      skipped,
      message:
        synced > 0
          ? `${synced} Finance document${synced === 1 ? "" : "s"} copied into the Asset SharePoint folder.`
          : "Asset documents are already in sync with the available Finance attachments.",
    });
  } catch (error) {
    const apiError = assetApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
