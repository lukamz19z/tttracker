"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Papa, { ParseResult } from "papaparse";
import { createSupabaseBrowser } from "@/lib/supabase";
import TowerHeader from "@/components/towers/TowerHeader";

type Tower = {
  id: string;
  name?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  tower_number?: string | null;
  structure_number?: string | null;
  tower_no?: string | null;
  extra_data?: Record<string, unknown> | null;
  cover_photo_path?: string | null;
};

type LiftStudy = {
  id: string;
  tower_id: string;
  file_url: string | null;
  uploaded_by: string | null;
  created_at?: string | null;
};

type MaterialBundleSegmentRow = {
  section: string | null;
  bundle_no: string | null;
  qty_required: number | null;
  member_qty: number | null;
};

type LiftStudySegmentRow = {
  id?: string;
  tower_id: string;
  segment: string;
  provided_weight_kg: number | null;
  crane_weight_kg: number | null;
  operator_name: string | null;
  lift_date: string | null;
  comments: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SegmentRegisterRow = {
  id?: string;
  segment: string;
  materialBundleCount: number;
  materialRequiredBundleQty: number;
  materialMemberQty: number;
  existsInMaterials: boolean;
  existsInWeightRegister: boolean;
  provided_weight_kg: number;
  crane_weight_kg: number | null;
  operator_name: string;
  lift_date: string;
  comments: string;
};

type CsvRow = Record<string, string | undefined>;

function safeString(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim();
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function safeNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normaliseSegment(value: unknown) {
  const clean = safeString(value);
  return clean === "" ? "General" : clean;
}

function formatKg(value: number | null | undefined) {
  const n = safeNumber(value, 0);
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`;
}

function formatTonnes(value: number | null | undefined) {
  const n = safeNumber(value, 0) / 1000;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 3 })} t`;
}

function getVarianceKg(row: SegmentRegisterRow) {
  if (row.crane_weight_kg === null || row.crane_weight_kg === undefined) return null;
  return safeNumber(row.crane_weight_kg, 0) - safeNumber(row.provided_weight_kg, 0);
}

function getVariancePercent(row: SegmentRegisterRow) {
  const variance = getVarianceKg(row);
  if (variance === null) return null;
  const provided = safeNumber(row.provided_weight_kg, 0);
  if (provided <= 0) return null;
  return (variance / provided) * 100;
}

function varianceTone(row: SegmentRegisterRow) {
  const variancePercent = getVariancePercent(row);
  if (variancePercent === null) return "slate";
  const abs = Math.abs(variancePercent);
  if (abs <= 2.5) return "green";
  if (abs <= 5) return "amber";
  return "red";
}

function getAttachmentHref(
  supabase: ReturnType<typeof createSupabaseBrowser>,
  fileUrl: string | null
) {
  if (!fileUrl || fileUrl.trim() === "") return null;

  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
    return fileUrl;
  }

  const { data } = supabase.storage.from("lift_studies").getPublicUrl(fileUrl);
  return data.publicUrl;
}

function getDisplayNameFromUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}) {
  const meta = user.user_metadata || {};

  const candidates = [
    meta.full_name,
    meta.name,
    meta.display_name,
    meta.preferred_name,
    user.email,
  ];

  const found = candidates.find(
    (value) => typeof value === "string" && value.trim() !== ""
  );

  return typeof found === "string" ? found : "Unknown User";
}

function csvEscape(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function getCsvValue(row: CsvRow, keys: string[]) {
  for (const key of keys) {
    const exact = row[key];
    if (exact !== undefined && safeString(exact) !== "") return exact;

    const foundKey = Object.keys(row).find(
      (candidate) => candidate.trim().toLowerCase() === key.trim().toLowerCase()
    );

    if (foundKey) {
      const value = row[foundKey];
      if (value !== undefined && safeString(value) !== "") return value;
    }
  }

  return undefined;
}

export default function LiftStudiesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [tower, setTower] = useState<Tower | null>(null);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [liftStudy, setLiftStudy] = useState<LiftStudy | null>(null);
  const [currentUploader, setCurrentUploader] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [materialSegments, setMaterialSegments] = useState<MaterialBundleSegmentRow[]>([]);
  const [segmentRows, setSegmentRows] = useState<SegmentRegisterRow[]>([]);
  const [segmentSearch, setSegmentSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingPdf, setSavingPdf] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [savingSegments, setSavingSegments] = useState(false);
  const [importingWeights, setImportingWeights] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (user) {
        setCurrentUploader(
          getDisplayNameFromUser({
            email: user.email,
            user_metadata: user.user_metadata,
          })
        );
      } else {
        setCurrentUploader("");
      }
    }

    void loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!towerId) return;

    let cancelled = false;

    async function run() {
      setLoading(true);

      const [towerRes, docketsRes, liftRes, materialsRes, segmentWeightsRes] =
        await Promise.all([
          supabase.from("towers").select("*").eq("id", towerId).single(),
          supabase
            .from("tower_daily_dockets")
            .select("docket_date")
            .eq("tower_id", towerId)
            .order("docket_date", { ascending: false })
            .limit(1),
          supabase
            .from("tower_lift_studies")
            .select("*")
            .eq("tower_id", towerId)
            .order("created_at", { ascending: false })
            .limit(1),
          supabase
            .from("tower_required_bundles")
            .select("section,bundle_no,qty_required,member_qty")
            .eq("tower_id", towerId),
          supabase
            .from("tower_lift_study_segments")
            .select("*")
            .eq("tower_id", towerId)
            .order("segment", { ascending: true }),
        ]);

      if (cancelled) return;

      if (towerRes.error) console.error("tower load error", towerRes.error);
      if (docketsRes.error) console.error("dockets load error", docketsRes.error);
      if (liftRes.error) console.error("lift study load error", liftRes.error);
      if (materialsRes.error) console.error("materials segment load error", materialsRes.error);
      if (segmentWeightsRes.error) console.error("lift segment load error", segmentWeightsRes.error);

      setTower((towerRes.data as Tower | null) ?? null);

      const docketRows =
        (docketsRes.data as { docket_date: string | null }[] | null) ?? [];
      setLatestDate(docketRows.length > 0 ? docketRows[0].docket_date : null);

      const liftRows = (liftRes.data as LiftStudy[] | null) ?? [];
      setLiftStudy(liftRows.length > 0 ? liftRows[0] : null);

      const materials = ((materialsRes.data as MaterialBundleSegmentRow[] | null) ?? []);
      const weights = ((segmentWeightsRes.data as LiftStudySegmentRow[] | null) ?? []);

      setMaterialSegments(materials);
      setSegmentRows(buildSegmentRows(materials, weights));

      setLoading(false);
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [towerId, supabase, reloadKey]);

  function buildSegmentRows(
    materialRows: MaterialBundleSegmentRow[],
    liftRows: LiftStudySegmentRow[]
  ): SegmentRegisterRow[] {
    const materialMap = new Map<
      string,
      {
        materialBundleCount: number;
        materialRequiredBundleQty: number;
        materialMemberQty: number;
      }
    >();

    materialRows.forEach((row) => {
      const segment = normaliseSegment(row.section);
      const existing =
        materialMap.get(segment) ||
        {
          materialBundleCount: 0,
          materialRequiredBundleQty: 0,
          materialMemberQty: 0,
        };

      existing.materialBundleCount += 1;
      existing.materialRequiredBundleQty += safeNumber(row.qty_required, 0);
      existing.materialMemberQty += safeNumber(row.member_qty, 0);

      materialMap.set(segment, existing);
    });

    const liftMap = new Map<string, LiftStudySegmentRow>();
    liftRows.forEach((row) => {
      liftMap.set(normaliseSegment(row.segment), row);
    });

    const segments = new Set<string>([
      ...Array.from(materialMap.keys()),
      ...Array.from(liftMap.keys()),
    ]);

    return Array.from(segments)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((segment) => {
        const material = materialMap.get(segment);
        const lift = liftMap.get(segment);

        return {
          id: lift?.id,
          segment,
          materialBundleCount: material?.materialBundleCount ?? 0,
          materialRequiredBundleQty: material?.materialRequiredBundleQty ?? 0,
          materialMemberQty: material?.materialMemberQty ?? 0,
          existsInMaterials: !!material,
          existsInWeightRegister: !!lift,
          provided_weight_kg: safeNumber(lift?.provided_weight_kg, 0),
          crane_weight_kg:
            lift?.crane_weight_kg === null || lift?.crane_weight_kg === undefined
              ? null
              : safeNumber(lift.crane_weight_kg, 0),
          operator_name: safeString(lift?.operator_name),
          lift_date: safeString(lift?.lift_date),
          comments: safeString(lift?.comments),
        };
      });
  }

  function updateSegmentRow(
    segment: string,
    field: keyof Pick<
      SegmentRegisterRow,
      "provided_weight_kg" | "crane_weight_kg" | "operator_name" | "lift_date" | "comments"
    >,
    value: string | number | null
  ) {
    setSegmentRows((prev) =>
      prev.map((row) => {
        if (row.segment !== segment) return row;
        return {
          ...row,
          [field]: value,
        };
      })
    );
  }

  async function saveLiftStudy() {
    if (!file) {
      alert("Please choose a PDF file.");
      return;
    }

    if (!currentUploader.trim()) {
      alert("Could not determine logged-in user.");
      return;
    }

    if (file.type !== "application/pdf") {
      alert("Please upload a PDF only.");
      return;
    }

    setSavingPdf(true);

    try {
      let recordId = liftStudy?.id || null;

      if (!recordId) {
        const { data, error } = await supabase
          .from("tower_lift_studies")
          .insert({
            tower_id: towerId,
            uploaded_by: currentUploader,
          })
          .select()
          .single();

        if (error || !data) {
          throw new Error(error?.message || "Failed to create lift study record");
        }

        recordId = data.id;
      } else {
        const { error } = await supabase
          .from("tower_lift_studies")
          .update({
            uploaded_by: currentUploader,
          })
          .eq("id", recordId);

        if (error) {
          throw new Error(error.message || "Failed to update lift study record");
        }
      }

      const uploadRes = await supabase.storage
        .from("lift_studies")
        .upload(`${recordId}/${Date.now()}_${file.name}`, file, {
          upsert: true,
        });

      if (uploadRes.error) {
        throw new Error(uploadRes.error.message);
      }

      const { error: fileUpdateError } = await supabase
        .from("tower_lift_studies")
        .update({
          file_url: uploadRes.data.path,
          uploaded_by: currentUploader,
        })
        .eq("id", recordId);

      if (fileUpdateError) {
        throw new Error(fileUpdateError.message);
      }

      const { data: refreshedRows, error: refreshError } = await supabase
        .from("tower_lift_studies")
        .select("*")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (refreshError) {
        throw new Error(refreshError.message);
      }

      const refreshedRow =
        ((refreshedRows as LiftStudy[] | null) ?? [])[0] ?? null;

      setLiftStudy(refreshedRow);
      setFile(null);
      setReloadKey((v) => v + 1);
    } catch (error) {
      console.error("Lift study save error:", error);
      alert(error instanceof Error ? error.message : "Failed to save lift study");
    } finally {
      setSavingPdf(false);
    }
  }

  async function deleteLiftStudy() {
    if (!liftStudy) return;

    const confirmed = window.confirm(
      "Delete this lift study?\n\nThis will remove the current lift study record."
    );
    if (!confirmed) return;

    setDeleting(true);

    try {
      if (liftStudy.file_url) {
        const removeRes = await supabase.storage
          .from("lift_studies")
          .remove([liftStudy.file_url]);

        if (removeRes.error) {
          throw new Error(removeRes.error.message);
        }
      }

      const { error } = await supabase
        .from("tower_lift_studies")
        .delete()
        .eq("id", liftStudy.id);

      if (error) {
        throw new Error(error.message || "Failed to delete lift study");
      }

      setLiftStudy(null);
      setReloadKey((v) => v + 1);
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error ? error.message : "Failed to delete lift study"
      );
    } finally {
      setDeleting(false);
    }
  }

  async function saveSegmentRows() {
    const validRows = segmentRows.filter((row) => row.segment.trim() !== "");

    if (validRows.length === 0) {
      alert("No segment rows to save.");
      return;
    }

    setSavingSegments(true);

    try {
      const payload = validRows.map((row) => ({
        tower_id: towerId,
        segment: row.segment.trim(),
        provided_weight_kg: safeNumber(row.provided_weight_kg, 0),
        crane_weight_kg:
          row.crane_weight_kg === null || row.crane_weight_kg === undefined
            ? null
            : safeNumber(row.crane_weight_kg, 0),
        operator_name: row.operator_name.trim() || null,
        lift_date: row.lift_date.trim() || null,
        comments: row.comments.trim() || null,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("tower_lift_study_segments")
        .upsert(payload, {
          onConflict: "tower_id,segment",
        });

      if (error) throw new Error(error.message);

      setReloadKey((v) => v + 1);
      alert("Lift study segment weights saved.");
    } catch (error) {
      console.error("Save lift segment weights error:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Failed to save lift study segment weights."
      );
    } finally {
      setSavingSegments(false);
    }
  }

  async function importSegmentWeightsCSV(fileToImport: File) {
    setImportingWeights(true);

    Papa.parse<CsvRow>(fileToImport, {
      header: true,
      skipEmptyLines: true,
      complete: async (res: ParseResult<CsvRow>) => {
        try {
          const rows = res.data
            .map((row) => {
              const segment = normaliseSegment(
                getCsvValue(row, [
                  "Tower Segment",
                  "Segment",
                  "Section",
                  "Tower Section",
                  "Lift Segment",
                ])
              );

              const weightRaw = getCsvValue(row, [
                "Provided Weight kg",
                "Provided Weight (kg)",
                "Weight kg",
                "Weight (kg)",
                "Tower Weight kg",
                "Segment Weight kg",
                "provided_weight_kg",
              ]);

              const providedWeightKg = safeNumber(weightRaw, NaN);

              if (!segment || segment === "General" || !Number.isFinite(providedWeightKg)) {
                return null;
              }

              return {
                tower_id: towerId,
                segment,
                provided_weight_kg: Math.max(providedWeightKg, 0),
                updated_at: new Date().toISOString(),
              };
            })
            .filter(
              (
                row
              ): row is {
                tower_id: string;
                segment: string;
                provided_weight_kg: number;
                updated_at: string;
              } => row !== null
            );

          if (rows.length === 0) {
            alert("No valid rows found. Use columns: Tower Segment, Provided Weight kg");
            setImportingWeights(false);
            return;
          }

          const deduped = Array.from(
            new Map(rows.map((row) => [`${row.tower_id}__${row.segment}`, row])).values()
          );

          const { error } = await supabase
            .from("tower_lift_study_segments")
            .upsert(deduped, {
              onConflict: "tower_id,segment",
            });

          if (error) throw new Error(error.message);

          setReloadKey((v) => v + 1);
          alert("Segment weight CSV imported.");
        } catch (error) {
          console.error("Import segment weights error:", error);
          alert(error instanceof Error ? error.message : "Failed to import segment weights.");
        } finally {
          setImportingWeights(false);
        }
      },
      error: (error) => {
        console.error("CSV parse error:", error);
        setImportingWeights(false);
        alert("Failed to parse CSV.");
      },
    });
  }

  function addManualSegment() {
    const name = window.prompt("Segment name?");
    const segment = normaliseSegment(name);

    if (!segment || segment === "General") return;

    setSegmentRows((prev) => {
      if (prev.some((row) => row.segment.toLowerCase() === segment.toLowerCase())) {
        alert("That segment already exists.");
        return prev;
      }

      return [
        ...prev,
        {
          segment,
          materialBundleCount: 0,
          materialRequiredBundleQty: 0,
          materialMemberQty: 0,
          existsInMaterials: false,
          existsInWeightRegister: false,
          provided_weight_kg: 0,
          crane_weight_kg: null,
          operator_name: "",
          lift_date: "",
          comments: "",
        },
      ].sort((a, b) => a.segment.localeCompare(b.segment, undefined, { numeric: true }));
    });
  }

  function downloadWeightTemplate() {
    const materialNames = Array.from(
      new Set(materialSegments.map((row) => normaliseSegment(row.section)))
    ).filter((segment) => segment !== "General");

    const rows = [
      ["Tower Segment", "Provided Weight kg"],
      ...(materialNames.length > 0
        ? materialNames.map((segment) => [segment, ""])
        : [
            ["Legs", ""],
            ["Body", ""],
            ["Crossarm", ""],
            ["Peak", ""],
          ]),
    ];

    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    downloadTextFile("lift_study_segment_weights_template.csv", csv, "text/csv;charset=utf-8;");
  }

  function exportSegmentComparisonCSV() {
    const rows = [
      [
        "Tower Segment",
        "Materials Bundles",
        "Required Bundle Qty",
        "Member Qty",
        "Provided Weight kg",
        "Crane Weight kg",
        "Variance kg",
        "Variance %",
        "Operator",
        "Lift Date",
        "Comments",
        "In Materials",
        "Weight Uploaded",
      ],
      ...segmentRows.map((row) => {
        const varianceKg = getVarianceKg(row);
        const variancePercent = getVariancePercent(row);

        return [
          row.segment,
          row.materialBundleCount,
          row.materialRequiredBundleQty,
          row.materialMemberQty,
          row.provided_weight_kg,
          row.crane_weight_kg ?? "",
          varianceKg === null ? "" : varianceKg.toFixed(1),
          variancePercent === null ? "" : `${variancePercent.toFixed(2)}%`,
          row.operator_name,
          row.lift_date,
          row.comments,
          row.existsInMaterials ? "Yes" : "No",
          row.existsInWeightRegister ? "Yes" : "No",
        ];
      }),
    ];

    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    downloadTextFile("lift_study_segment_comparison.csv", csv, "text/csv;charset=utf-8;");
  }

  const filteredSegmentRows = useMemo(() => {
    const q = segmentSearch.trim().toLowerCase();

    if (!q) return segmentRows;

    return segmentRows.filter((row) =>
      [
        row.segment,
        row.operator_name,
        row.comments,
        row.existsInMaterials ? "materials" : "not in materials",
        row.existsInWeightRegister ? "weight uploaded" : "no weight",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [segmentRows, segmentSearch]);

  const summary = useMemo(() => {
    const provided = segmentRows.reduce(
      (sum, row) => sum + safeNumber(row.provided_weight_kg, 0),
      0
    );

    const crane = segmentRows.reduce(
      (sum, row) => sum + safeNumber(row.crane_weight_kg, 0),
      0
    );

    const rowsWithCrane = segmentRows.filter(
      (row) => row.crane_weight_kg !== null && row.crane_weight_kg !== undefined
    ).length;

    const missingProvided = segmentRows.filter(
      (row) => row.existsInMaterials && safeNumber(row.provided_weight_kg, 0) <= 0
    ).length;

    const missingMaterials = segmentRows.filter((row) => !row.existsInMaterials).length;

    const variance = crane - provided;
    const variancePercent = provided > 0 ? (variance / provided) * 100 : 0;

    return {
      provided,
      crane,
      variance,
      variancePercent,
      rowsWithCrane,
      missingProvided,
      missingMaterials,
      totalSegments: segmentRows.length,
    };
  }, [segmentRows]);

  if (loading || !tower) {
    return <div className="p-8">Loading...</div>;
  }

  const attachmentHref = getAttachmentHref(supabase, liftStudy?.file_url ?? null);

  return (
    <div className="p-4 md:p-8 space-y-6 bg-slate-50 min-h-screen">
      <TowerHeader
        projectId={projectId}
        tower={tower}
        latestDate={latestDate}
      />

      <div className="flex gap-2 border-b pb-2 overflow-x-auto">
        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/safety`}
        >
          Safety
        </Link>

        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/itc`}
        >
          ITCs
        </Link>

        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/permits`}
        >
          Permits
        </Link>

        <Link
          className="px-4 py-2 bg-white border rounded-t-lg font-semibold whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/lifts`}
        >
          Lift Studies
        </Link>

        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/drawings`}
        >
          Drawings
        </Link>

        <Link
          className="px-4 py-2 bg-slate-100 border rounded-t-lg whitespace-nowrap"
          href={`/project/${projectId}/tower/${towerId}/workpack/documents`}
        >
          Documents
        </Link>
      </div>

      <div className="bg-white border rounded-2xl p-4 md:p-6 shadow-sm space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div>
            <div className="text-2xl font-bold">Lift Study Weight Comparison</div>
            <div className="text-sm text-slate-500 mt-1 max-w-3xl">
              Upload provided segment weights from Excel, then record crane/operator input weights.
              This keeps provided weights and crane weights separate for commercial comparison.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer hover:bg-blue-700">
              {importingWeights ? "Importing..." : "Upload Segment Weights CSV"}
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) void importSegmentWeightsCSV(selected);
                  e.currentTarget.value = "";
                }}
              />
            </label>

            <button
              type="button"
              onClick={downloadWeightTemplate}
              className="bg-slate-100 text-slate-700 border px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-200"
            >
              CSV Template
            </button>

            <button
              type="button"
              onClick={exportSegmentComparisonCSV}
              className="bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-800"
            >
              Export Comparison
            </button>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <SummaryCard label="Provided Weight" value={formatTonnes(summary.provided)} sub={formatKg(summary.provided)} />
          <SummaryCard label="Crane Weight" value={formatTonnes(summary.crane)} sub={`${summary.rowsWithCrane}/${summary.totalSegments} entered`} />
          <SummaryCard
            label="Variance"
            value={`${summary.variance >= 0 ? "+" : ""}${formatTonnes(summary.variance)}`}
            sub={`${summary.variancePercent >= 0 ? "+" : ""}${summary.variancePercent.toFixed(2)}%`}
            tone={Math.abs(summary.variancePercent) > 5 ? "red" : Math.abs(summary.variancePercent) > 2.5 ? "amber" : "green"}
          />
          <SummaryCard
            label="Missing Weights"
            value={String(summary.missingProvided)}
            sub="material segments without provided kg"
            tone={summary.missingProvided > 0 ? "amber" : "green"}
          />
          <SummaryCard
            label="CSV Only"
            value={String(summary.missingMaterials)}
            sub="weights not matching materials"
            tone={summary.missingMaterials > 0 ? "amber" : "slate"}
          />
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-4 md:p-6 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="text-xl font-semibold">Segment Weight Register</div>
            <div className="text-sm text-slate-500 mt-1">
              Segments are pulled from the materials register and cross-checked against uploaded lift-study weights.
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={segmentSearch}
              onChange={(e) => setSegmentSearch(e.target.value)}
              placeholder="Search segment, operator, comments..."
              className="border rounded-xl px-3 py-2 text-sm min-w-[240px]"
            />

            <button
              type="button"
              onClick={addManualSegment}
              className="border px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-50"
            >
              Add Segment
            </button>

            <button
              type="button"
              onClick={saveSegmentRows}
              disabled={savingSegments}
              className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
            >
              {savingSegments ? "Saving..." : "Save Weights"}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {filteredSegmentRows.length === 0 ? (
            <div className="border border-dashed rounded-2xl p-8 text-center text-sm text-slate-500 bg-slate-50">
              No segments found. Upload materials first or upload a segment weight CSV.
            </div>
          ) : (
            filteredSegmentRows.map((row) => {
              const varianceKg = getVarianceKg(row);
              const variancePercent = getVariancePercent(row);
              const tone = varianceTone(row);

              return (
                <div
                  key={row.segment}
                  className="border rounded-2xl p-3 md:p-4 bg-white shadow-sm"
                >
                  <div className="grid xl:grid-cols-[1.1fr_1.2fr_1.2fr_1fr] gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-bold text-lg text-slate-900 truncate">
                          {row.segment}
                        </div>

                        {row.existsInMaterials ? (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            In Materials
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            Not in Materials
                          </span>
                        )}

                        {row.existsInWeightRegister ? (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                            Weight Uploaded
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200">
                            No Weight CSV
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-3">
                        <MiniMetric label="Bundles" value={row.materialBundleCount} />
                        <MiniMetric label="Req Qty" value={row.materialRequiredBundleQty} />
                        <MiniMetric label="Members" value={row.materialMemberQty} />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <NumberField
                        label="Provided Weight kg"
                        value={row.provided_weight_kg}
                        onChange={(value) =>
                          updateSegmentRow(row.segment, "provided_weight_kg", value)
                        }
                      />

                      <NumberField
                        label="Crane Weight kg"
                        value={row.crane_weight_kg ?? ""}
                        onChange={(value) =>
                          updateSegmentRow(
                            row.segment,
                            "crane_weight_kg",
                            value === "" ? null : value
                          )
                        }
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <TextField
                        label="Operator"
                        value={row.operator_name}
                        onChange={(value) =>
                          updateSegmentRow(row.segment, "operator_name", value)
                        }
                      />

                      <DateField
                        label="Lift Date"
                        value={row.lift_date}
                        onChange={(value) =>
                          updateSegmentRow(row.segment, "lift_date", value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <div
                        className={`rounded-xl border p-3 ${
                          tone === "red"
                            ? "bg-rose-50 border-rose-200 text-rose-800"
                            : tone === "amber"
                            ? "bg-amber-50 border-amber-200 text-amber-800"
                            : tone === "green"
                            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                            : "bg-slate-50 border-slate-200 text-slate-700"
                        }`}
                      >
                        <div className="text-[11px] uppercase tracking-wide font-bold opacity-70">
                          Variance
                        </div>
                        <div className="text-lg font-black mt-1">
                          {varianceKg === null
                            ? "Pending"
                            : `${varianceKg >= 0 ? "+" : ""}${varianceKg.toFixed(1)} kg`}
                        </div>
                        <div className="text-xs mt-0.5">
                          {variancePercent === null
                            ? "Enter crane weight"
                            : `${variancePercent >= 0 ? "+" : ""}${variancePercent.toFixed(2)}%`}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <TextField
                      label="Commercial / Lift Comments"
                      value={row.comments}
                      onChange={(value) => updateSegmentRow(row.segment, "comments", value)}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="grid xl:grid-cols-[1.2fr_1fr] gap-6">
        <div className="bg-white border rounded-2xl p-4 md:p-6 space-y-5 shadow-sm">
          <div>
            <div className="text-xl font-semibold">Lift Study PDF</div>
            <div className="text-sm text-slate-500 mt-1">
              Upload one lift study PDF for this tower. You can replace it at any time.
            </div>
          </div>

          <div className="grid md:grid-cols-[1fr_220px] gap-4 items-end">
            <div>
              <label className="block text-sm font-medium mb-2">
                Upload Lift Study PDF
              </label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="border rounded-lg p-2 w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Uploaded By</label>
              <input
                value={currentUploader}
                readOnly
                className="border rounded-lg p-2 w-full bg-slate-50 text-slate-600"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveLiftStudy}
              disabled={savingPdf}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl disabled:opacity-60"
            >
              {savingPdf
                ? "Saving..."
                : liftStudy
                ? "Replace Lift Study"
                : "Upload Lift Study"}
            </button>
          </div>
        </div>

        <div className="bg-white border rounded-2xl p-4 md:p-6 shadow-sm">
          <div className="flex justify-between items-start gap-4 flex-wrap">
            <div>
              <div className="text-xl font-semibold">Current Lift Study</div>
              <div className="text-sm text-slate-500 mt-1">
                One active lift study record is stored for this tower.
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {attachmentHref ? (
                <a
                  href={attachmentHref}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-slate-900 text-white px-4 py-2 rounded-lg hover:bg-slate-800"
                >
                  View PDF
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  className="bg-slate-200 text-slate-500 px-4 py-2 rounded-lg cursor-not-allowed"
                >
                  No PDF Uploaded
                </button>
              )}

              {liftStudy && (
                <button
                  type="button"
                  onClick={deleteLiftStudy}
                  disabled={deleting}
                  className="border border-red-300 text-red-700 px-4 py-2 rounded-lg hover:bg-red-50 disabled:opacity-60"
                >
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
          </div>

          <div className="mt-6 grid md:grid-cols-3 gap-6">
            <MetaBlock
              label="Status"
              value={liftStudy?.file_url ? "Uploaded" : "Not Uploaded"}
            />
            <MetaBlock
              label="Uploaded By"
              value={liftStudy?.uploaded_by || "-"}
            />
            <MetaBlock
              label="Uploaded"
              value={liftStudy?.created_at?.slice(0, 10) || "-"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  tone = "slate",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "slate" | "green" | "amber" | "red";
}) {
  const toneClass =
    tone === "green"
      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
      : tone === "amber"
      ? "bg-amber-50 border-amber-200 text-amber-900"
      : tone === "red"
      ? "bg-rose-50 border-rose-200 text-rose-900"
      : "bg-slate-50 border-slate-200 text-slate-900";

  return (
    <div className={`border rounded-2xl p-4 ${toneClass}`}>
      <div className="text-[11px] uppercase tracking-wide font-bold opacity-70">
        {label}
      </div>
      <div className="text-2xl font-black mt-1">{value}</div>
      {sub && <div className="text-xs mt-1 opacity-75">{sub}</div>}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 px-2 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-bold">
        {label}
      </div>
      <div className="text-sm font-black text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-bold mb-1">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded-lg p-2 w-full text-sm"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | number;
  onChange: (value: number | "") => void;
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-bold mb-1">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          onChange(raw === "" ? "" : safeNumber(raw, 0));
        }}
        className="border rounded-lg p-2 w-full text-sm"
      />
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-slate-500 font-bold mb-1">
        {label}
      </label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border rounded-lg p-2 w-full text-sm"
      />
    </div>
  );
}

function MetaBlock({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
        {label}
      </div>
      <div className="text-base font-medium text-slate-900 break-all">
        {value}
      </div>
    </div>
  );
}
