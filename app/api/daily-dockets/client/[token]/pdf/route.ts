import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { createDocketAdminSupabase } from "@/lib/dockets/server";
import { getGraphAccessToken } from "@/lib/sharepoint/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

type ApprovalRow = {
  id: string;
  docket_id: string;
  stage: string | null;
  status: string | null;
  revision: number | null;
  token_expires_at: string | null;
  token_used_at: string | null;
  token_superseded_at: string | null;
};

type DocketRow = {
  id: string;
  approval_status: string | null;
  approval_revision: number | null;
  draft_sharepoint_drive_id: string | null;
  draft_sharepoint_item_id: string | null;
  draft_pdf_file_name: string | null;
  pdf_file_name: string | null;
  docket_date: string | null;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeFileName(value: string | null | undefined) {
  const name = String(value || "Daily-Docket.pdf")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .trim();

  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

function approvalUnavailableReason(approval: ApprovalRow | null) {
  if (!approval) return "This approval link is invalid.";

  if (approval.stage !== "client") {
    return "This approval link is invalid.";
  }

  if (approval.token_superseded_at) {
    return "This approval link has been replaced by a newer approval request.";
  }

  if (approval.token_used_at || approval.status !== "pending") {
    return "This approval link has already been completed.";
  }

  if (
    approval.token_expires_at &&
    new Date(approval.token_expires_at).getTime() < Date.now()
  ) {
    return "This approval link has expired.";
  }

  return null;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const rawToken = String(token || "").trim();

    if (!rawToken) {
      return NextResponse.json(
        { error: "Approval token is required." },
        { status: 400 },
      );
    }

    const admin = createDocketAdminSupabase();
    const tokenHash = hashToken(rawToken);

    const { data: approvalData, error: approvalError } = await admin
      .from("tower_docket_approvals")
      .select(
        "id,docket_id,stage,status,revision,token_expires_at,token_used_at,token_superseded_at",
      )
      .eq("token_hash", tokenHash)
      .eq("stage", "client")
      .maybeSingle();

    if (approvalError) {
      console.error(
        "Could not load Daily Docket client approval",
        approvalError,
      );

      return NextResponse.json(
        { error: "The Daily Docket approval link could not be verified." },
        { status: 500 },
      );
    }

    const approval = (approvalData as ApprovalRow | null) || null;
    const unavailableReason = approvalUnavailableReason(approval);

    if (unavailableReason || !approval) {
      return NextResponse.json(
        { error: unavailableReason || "This approval link is invalid." },
        { status: 410 },
      );
    }

    const { data: docketData, error: docketError } = await admin
      .from("tower_daily_dockets")
      .select(
        [
          "id",
          "approval_status",
          "approval_revision",
          "draft_sharepoint_drive_id",
          "draft_sharepoint_item_id",
          "draft_pdf_file_name",
          "pdf_file_name",
          "docket_date",
        ].join(","),
      )
      .eq("id", approval.docket_id)
      .maybeSingle();

    if (docketError) {
      console.error(
        "Could not load Daily Docket draft PDF reference",
        docketError,
      );

      return NextResponse.json(
        { error: "The Daily Docket could not be loaded." },
        { status: 500 },
      );
    }

    const docket = (docketData as DocketRow | null) || null;

    if (!docket) {
      return NextResponse.json(
        { error: "The Daily Docket could not be found." },
        { status: 404 },
      );
    }

    if (docket.approval_status !== "client_pending") {
      return NextResponse.json(
        { error: "This Daily Docket is no longer awaiting client approval." },
        { status: 409 },
      );
    }

    const approvalRevision = Math.max(
      1,
      Number(approval.revision || 0),
    );
    const docketRevision = Math.max(
      1,
      Number(docket.approval_revision || 0),
    );

    if (approvalRevision !== docketRevision) {
      return NextResponse.json(
        {
          error:
            "This approval link has been replaced by a newer Daily Docket revision.",
        },
        { status: 410 },
      );
    }

    const driveId = String(docket.draft_sharepoint_drive_id || "").trim();
    const itemId = String(docket.draft_sharepoint_item_id || "").trim();

    if (!driveId || !itemId) {
      return NextResponse.json(
        {
          error:
            "The Daily Docket draft PDF is not available yet. Please try again shortly.",
        },
        { status: 404 },
      );
    }

    const graphToken = await getGraphAccessToken();

    const graphResponse = await fetch(
      `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(
        driveId,
      )}/items/${encodeURIComponent(itemId)}/content`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${graphToken}`,
        },
        cache: "no-store",
        redirect: "follow",
      },
    );

    if (!graphResponse.ok) {
      const graphError = await graphResponse.text();

      console.error(
        `Microsoft Graph Daily Docket download failed (${graphResponse.status})`,
        graphError,
      );

      if (graphResponse.status === 404) {
        return NextResponse.json(
          {
            error:
              "The Daily Docket draft PDF could not be found in SharePoint.",
          },
          { status: 404 },
        );
      }

      return NextResponse.json(
        { error: "The Daily Docket PDF could not be opened." },
        { status: 502 },
      );
    }

    const contentType =
      graphResponse.headers.get("content-type") || "application/pdf";

    if (!contentType.toLowerCase().includes("pdf")) {
      console.error(
        "Daily Docket SharePoint item did not return a PDF content type",
        contentType,
      );

      return NextResponse.json(
        { error: "The Daily Docket PDF could not be opened." },
        { status: 502 },
      );
    }

    const pdfBytes = await graphResponse.arrayBuffer();

    if (!pdfBytes.byteLength) {
      return NextResponse.json(
        { error: "The Daily Docket PDF is empty or unavailable." },
        { status: 502 },
      );
    }

    const revisionLabel = `R${String(docketRevision).padStart(2, "0")}`;

    const fileName = safeFileName(
      docket.draft_pdf_file_name ||
        docket.pdf_file_name ||
        `Daily-Docket-${docket.docket_date || docket.id}-${revisionLabel}-DRAFT.pdf`,
    );

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Content-Length": String(pdfBytes.byteLength),
        "Cache-Control": "private, no-store, max-age=0, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "default-src 'none'; frame-ancestors 'self'; sandbox",
      },
    });
  } catch (error) {
    console.error("DAILY DOCKET CLIENT PDF ERROR", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The Daily Docket PDF could not be opened.",
      },
      { status: 500 },
    );
  }
}
