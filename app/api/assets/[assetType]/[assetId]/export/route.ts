import { NextResponse } from "next/server";

import { loadAssetSpend } from "@/lib/assets/finance";
import {
  assetApiError,
  assetIdColumn,
  canViewAssets,
  parseAssetType,
  requireAssetUser,
} from "@/lib/assets/server";
import {
  assetFolderName,
  ensureAssetSharePointFolder,
} from "@/lib/assets/sharepoint";
import { createStoredZip } from "@/lib/assets/zip";
import { downloadDriveItemContent } from "@/lib/sharepoint/graph";
import type {
  AssetDocumentRow,
  AssetServiceRecordRow,
} from "@/lib/assets/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ assetType: string; assetId: string }>;
};

function csv(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function csvBytes(rows: unknown[][]) {
  const text = rows
    .map((row) => row.map(csv).join(","))
    .join("\r\n");

  return new TextEncoder().encode(text);
}

export async function GET(request: Request, context: RouteContext) {
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

    if (!canViewAssets(identity.role)) {
      throw new Error("ASSET_VIEW_FORBIDDEN");
    }

    const resolved = await ensureAssetSharePointFolder({
      service,
      assetType,
      assetId,
    });

    const { listAssetFolderFilesRecursively } =
      await import("@/lib/assets/sharepoint");

    const files = await listAssetFolderFilesRecursively({
      driveId: resolved.driveId,
      folderId: resolved.assetFolder.id,
    });

    if (files.length > 500) {
      return NextResponse.json(
        {
          error:
            "This Asset folder contains more than 500 files. Reduce the folder or export it directly from SharePoint.",
        },
        { status: 413 },
      );
    }

    const estimatedBytes = files.reduce(
      (total, file) => total + Math.max(0, file.size),
      0,
    );

    if (estimatedBytes > 400 * 1024 * 1024) {
      return NextResponse.json(
        {
          error:
            "This Asset folder is larger than the 400 MB TTTracker export limit. Export it directly from SharePoint.",
        },
        { status: 413 },
      );
    }

    const assetColumn = assetIdColumn(assetType);

    const [documentsResult, servicesResult, spend] = await Promise.all([
      service
        .from("asset_documents")
        .select("*")
        .eq(assetColumn, assetId)
        .order("created_at"),
      service
        .from("asset_service_records")
        .select("*")
        .eq(assetColumn, assetId)
        .order("service_date"),
      loadAssetSpend({
        service,
        assetType,
        assetId,
      }),
    ]);

    if (documentsResult.error) {
      throw new Error(documentsResult.error.message);
    }
    if (servicesResult.error) {
      throw new Error(servicesResult.error.message);
    }

    const documents =
      (documentsResult.data ?? []) as AssetDocumentRow[];
    const services =
      (servicesResult.data ?? []) as AssetServiceRecordRow[];

    const entries: Array<{ name: string; bytes: Uint8Array }> = [];

    for (const file of files) {
      const downloaded = await downloadDriveItemContent({
        driveId: resolved.driveId,
        itemId: file.itemId,
      });

      entries.push({
        name: file.relativePath,
        bytes: downloaded.content,
      });
    }

    entries.push({
      name: "TTTracker Asset Document Register.csv",
      bytes: csvBytes([
        [
          "Title",
          "Category",
          "Type",
          "Document Date",
          "Expiry Date",
          "Supplier",
          "Invoice Number",
          "Amount Inc GST",
          "File Name",
          "SharePoint Folder",
          "Source",
          "Uploaded By",
          "Uploaded At",
        ],
        ...documents.map((document) => [
          document.title,
          document.document_category,
          document.document_type_name,
          document.document_date,
          document.expiry_date,
          document.supplier,
          document.invoice_number,
          document.amount_inc_gst,
          document.file_name,
          document.sharepoint_folder_path,
          document.source,
          document.uploaded_by_name,
          document.created_at,
        ]),
      ]),
    });

    entries.push({
      name: "TTTracker Service History.csv",
      bytes: csvBytes([
        [
          "Service Number",
          "Date",
          "Record Type",
          "Provider",
          "Mechanic",
          "Odometer KM",
          "Engine Hours",
          "Summary",
          "Work Completed",
          "Recommendations",
          "Follow-up",
          "Invoice Number",
          "Cost Inc GST",
          "Next Service Date",
          "Next Service KM",
          "Next Service Hours",
        ],
        ...services.map((record) => [
          record.service_number,
          record.service_date,
          record.record_type,
          record.provider_name || record.supplier,
          record.mechanic_name,
          record.odometer_km,
          record.engine_hours,
          record.summary,
          record.work_completed,
          record.recommendations,
          record.follow_up_actions,
          record.invoice_number,
          record.amount_inc_gst,
          record.next_service_date,
          record.next_service_km,
          record.next_service_hours,
        ]),
      ]),
    });

    entries.push({
      name: "TTTracker Asset Spend.csv",
      bytes: csvBytes([
        [
          "Submission",
          "Status",
          "Date",
          "Supplier",
          "Invoice Number",
          "Description",
          "Ex GST",
          "GST",
          "Inc GST",
          "Fleet Job",
          "Service Record",
        ],
        ...spend.map((row) => [
          row.submissionNumber,
          row.status,
          row.expenseDate,
          row.supplier,
          row.invoiceNumber,
          row.description,
          row.amountExGst,
          row.gstAmount,
          row.amountIncGst,
          row.fleetJobId,
          row.serviceRecordId,
        ]),
      ]),
    });

    const zip = createStoredZip(entries);
    const fileName = `${assetFolderName(
      assetType,
      resolved.asset,
    )} - Client Export.zip`;

    return new NextResponse(zip, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName.replace(
          /"/g,
          "",
        )}"`,
        "Content-Length": String(zip.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const apiError = assetApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
