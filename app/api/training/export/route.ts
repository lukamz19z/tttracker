import { NextResponse } from "next/server";

import { downloadDriveItemContent } from "@/lib/sharepoint/graph";
import {
  requireTrainingUser,
  roleCanManageTraining,
  trainingApiError,
} from "@/lib/training/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type TrainingRecordRow = {
  id: string;
  employee_id: string;
  training_name: string | null;
  training_short_code: string | null;
  certificate_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  workflow_status: string | null;
  record_status: string | null;
  current_version: boolean | null;
  superseded_at: string | null;
};

type EmployeeRow = {
  id: string;
  payroll_id: string | null;
  full_name: string;
};

type TrainingDocumentRow = {
  id: string;
  training_record_id: string;
  generated_file_name: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  sharepoint_drive_id: string | null;
  sharepoint_item_id: string | null;
  active: boolean | null;
};

type ExportFile = {
  path: string;
  fileName: string;
  contentType: string;
  content: Uint8Array;
  record: TrainingRecordRow;
  employee: EmployeeRow;
};

const MAX_RECORDS = 100;
const MAX_FILES = 250;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function safeName(value: unknown, fallback = "File") {
  const cleaned = clean(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.+$/g, "")
    .trim();

  return cleaned || fallback;
}

function uniquePath(path: string, used: Set<string>) {
  const normalized = path.toLowerCase();

  if (!used.has(normalized)) {
    used.add(normalized);
    return path;
  }

  const slashIndex = path.lastIndexOf("/");
  const directory = slashIndex >= 0 ? path.slice(0, slashIndex + 1) : "";
  const fileName = slashIndex >= 0 ? path.slice(slashIndex + 1) : path;
  const dotIndex = fileName.lastIndexOf(".");
  const base = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const extension = dotIndex > 0 ? fileName.slice(dotIndex) : "";

  let suffix = 2;

  while (true) {
    const candidate = `${directory}${base} (${suffix})${extension}`;
    const candidateKey = candidate.toLowerCase();

    if (!used.has(candidateKey)) {
      used.add(candidateKey);
      return candidate;
    }

    suffix += 1;
  }
}

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function recordStatus(record: TrainingRecordRow) {
  if (record.superseded_at || record.current_version === false) {
    return "Superseded";
  }

  if (clean(record.workflow_status) === "pending_review") {
    return "Pending Review";
  }

  if (clean(record.workflow_status) === "changes_required") {
    return "Changes Required";
  }

  if (clean(record.workflow_status) === "rejected") {
    return "Rejected";
  }

  if (record.expiry_date) {
    const expiry = new Date(
      `${record.expiry_date.slice(0, 10)}T23:59:59`,
    );

    if (
      !Number.isNaN(expiry.getTime()) &&
      expiry.getTime() < Date.now()
    ) {
      return "Expired";
    }
  }

  return clean(record.record_status) || "Approved";
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc ^= byte;

    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    time:
      ((hours & 0x1f) << 11) |
      ((minutes & 0x3f) << 5) |
      (seconds & 0x1f),
    date:
      (((year - 1980) & 0x7f) << 9) |
      ((month & 0x0f) << 5) |
      (day & 0x1f),
  };
}

function buildStoredZip(
  entries: Array<{ name: string; content: Uint8Array }>,
) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  const timestamp = dosDateTime();
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    const content = Buffer.from(entry.content);
    const checksum = crc32(content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(timestamp.time, 10);
    localHeader.writeUInt16LE(timestamp.date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBytes, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(timestamp.time, 12);
    centralHeader.writeUInt16LE(timestamp.date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([
    ...localParts,
    centralDirectory,
    end,
  ]);
}

export async function POST(request: Request) {
  try {
    const { service, identity } = await requireTrainingUser(request);

    if (!roleCanManageTraining(identity.role)) {
      return NextResponse.json(
        {
          error:
            "Administrator, HSEQ or Training Officer access is required to export Training evidence.",
        },
        { status: 403 },
      );
    }

    const body = (await request.json()) as {
      recordIds?: unknown;
    };

    const recordIds = Array.from(
      new Set(
        (Array.isArray(body.recordIds) ? body.recordIds : [])
          .map(clean)
          .filter(Boolean),
      ),
    );

    if (recordIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one Training record." },
        { status: 400 },
      );
    }

    if (recordIds.length > MAX_RECORDS) {
      return NextResponse.json(
        {
          error: `Select a maximum of ${MAX_RECORDS} Training records per export.`,
        },
        { status: 400 },
      );
    }

    const { data: recordData, error: recordError } = await service
      .from("employee_training_records")
      .select(
        "id,employee_id,training_name,training_short_code,certificate_number,issue_date,expiry_date,workflow_status,record_status,current_version,superseded_at",
      )
      .in("id", recordIds);

    if (recordError) throw new Error(recordError.message);

    const records = (recordData ?? []) as TrainingRecordRow[];

    if (records.length === 0) {
      return NextResponse.json(
        { error: "No Training records could be found." },
        { status: 404 },
      );
    }

    const employeeIds = Array.from(
      new Set(records.map((record) => record.employee_id)),
    );

    const { data: employeeData, error: employeeError } = await service
      .from("employees")
      .select("id,payroll_id,full_name")
      .in("id", employeeIds);

    if (employeeError) throw new Error(employeeError.message);

    const employees = (employeeData ?? []) as EmployeeRow[];
    const employeeById = new Map(
      employees.map((employee) => [employee.id, employee]),
    );
    const recordById = new Map(
      records.map((record) => [record.id, record]),
    );

    const { data: documentData, error: documentError } = await service
      .from("employee_training_documents")
      .select(
        "id,training_record_id,generated_file_name,mime_type,file_size_bytes,sharepoint_drive_id,sharepoint_item_id,active",
      )
      .in("training_record_id", recordIds)
      .eq("active", true)
      .not("sharepoint_item_id", "is", null)
      .order("sequence_number");

    if (documentError) throw new Error(documentError.message);

    const documents = (documentData ?? []) as TrainingDocumentRow[];

    if (documents.length === 0) {
      return NextResponse.json(
        {
          error:
            "None of the selected Training records have published SharePoint evidence.",
        },
        { status: 400 },
      );
    }

    if (documents.length > MAX_FILES) {
      return NextResponse.json(
        {
          error: `This export contains ${documents.length} files. Select no more than ${MAX_FILES} files at once.`,
        },
        { status: 400 },
      );
    }

    const estimatedBytes = documents.reduce(
      (total, document) =>
        total + Math.max(0, Number(document.file_size_bytes ?? 0)),
      0,
    );

    if (estimatedBytes > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        {
          error:
            "The selected Training package is larger than 150 MB. Split the export into smaller selections.",
        },
        { status: 413 },
      );
    }

    const usedPaths = new Set<string>();
    const files: ExportFile[] = [];
    let actualBytes = 0;

    for (const document of documents) {
      const driveId = clean(document.sharepoint_drive_id);
      const itemId = clean(document.sharepoint_item_id);
      const record = recordById.get(document.training_record_id);

      if (!driveId || !itemId || !record) continue;

      const employee = employeeById.get(record.employee_id);

      if (!employee) continue;

      const downloaded = await downloadDriveItemContent({
        driveId,
        itemId,
      });

      actualBytes += downloaded.content.byteLength;

      if (actualBytes > MAX_TOTAL_BYTES) {
        return NextResponse.json(
          {
            error:
              "The downloaded Training package exceeded 150 MB. Split the export into smaller selections.",
          },
          { status: 413 },
        );
      }

      const employeeFolder = safeName(
        clean(employee.payroll_id)
          ? `${clean(employee.payroll_id)} - ${employee.full_name}`
          : employee.full_name,
        "Employee",
      );
      const trainingFolder = safeName(
        record.training_short_code || record.training_name,
        "Training",
      );
      const fileName = safeName(
        document.generated_file_name,
        "Training Evidence",
      );

      const path = uniquePath(
        `${employeeFolder}/${trainingFolder}/${fileName}`,
        usedPaths,
      );

      files.push({
        path,
        fileName,
        contentType:
          clean(document.mime_type) ||
          downloaded.contentType ||
          "application/octet-stream",
        content: downloaded.content,
        record,
        employee,
      });
    }

    if (files.length === 0) {
      return NextResponse.json(
        {
          error:
            "Published SharePoint files could not be resolved for the selected records.",
        },
        { status: 400 },
      );
    }

    if (files.length === 1 && recordIds.length === 1) {
      const file = files[0];

      return new Response(new Uint8Array(file.content), {
        status: 200,
        headers: {
          "Content-Type": file.contentType,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
            file.fileName,
          )}`,
          "Cache-Control": "no-store",
        },
      });
    }

    const manifestRows = files.map((file) => [
      file.employee.full_name,
      file.employee.payroll_id,
      file.record.training_name,
      file.record.certificate_number,
      file.record.issue_date,
      file.record.expiry_date,
      recordStatus(file.record),
      file.path,
    ]);

    const manifest = [
      [
        "Employee",
        "Payroll ID",
        "Training",
        "Certificate Number",
        "Issue Date",
        "Expiry Date",
        "Status",
        "Exported File",
      ]
        .map(csvCell)
        .join(","),
      ...manifestRows.map((row) => row.map(csvCell).join(",")),
    ].join("\n");

    const zip = buildStoredZip([
      {
        name: "Training Export Register.csv",
        content: new TextEncoder().encode(manifest),
      },
      ...files.map((file) => ({
        name: file.path,
        content: file.content,
      })),
    ]);

    const date = new Date().toISOString().slice(0, 10);
    const zipName = `TTTracker-Training-Export-${date}.zip`;

    return new Response(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Training SharePoint export failed", error);

    const apiError = trainingApiError(error);

    return NextResponse.json(
      { error: apiError.message },
      { status: apiError.status },
    );
  }
}
