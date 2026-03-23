"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

type TemplateRow = {
  id: string;
  project_id: string;
  stage: string;
  item_no: number | null;
  sort_order: number | null;
  description: string;
  item_type: "check" | "auto" | "numeric" | "document";
  source_field: string | null;
  required: boolean;
};

const STAGES = [
  "Preparation",
  "Assembly and Erection",
  "Completion",
  "Modification",
  "Incoming Material",
  "Bolt Torque",
];

export default function ProjectItcTemplatePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const supabase = createSupabaseBrowser();

  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [stage, setStage] = useState("Preparation");
  const [itemNo, setItemNo] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [description, setDescription] = useState("");
  const [itemType, setItemType] =
    useState<"check" | "auto" | "numeric" | "document">("check");
  const [sourceField, setSourceField] = useState("");
  const [required, setRequired] = useState(true);

  useEffect(() => {
    load();
  }, [projectId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("project_itc_templates")
      .select("*")
      .eq("project_id", projectId)
      .order("stage", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("item_no", { ascending: true });

    setRows((data || []) as TemplateRow[]);
    setLoading(false);
  }

  async function addTemplateRow() {
    if (!description.trim()) {
      alert("Enter description");
      return;
    }

    const { error } = await supabase.from("project_itc_templates").insert({
      project_id: projectId,
      stage,
      item_no: itemNo ? Number(itemNo) : null,
      sort_order: sortOrder ? Number(sortOrder) : 0,
      description: description.trim(),
      item_type: itemType,
      source_field: itemType === "auto" ? sourceField.trim() || null : null,
      required,
    });

    if (error) {
      alert("Failed to add template row");
      return;
    }

    setStage("Preparation");
    setItemNo("");
    setSortOrder("");
    setDescription("");
    setItemType("check");
    setSourceField("");
    setRequired(true);

    await load();
  }

  async function deleteTemplateRow(id: string) {
    const confirmed = window.confirm("Delete this template item?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("project_itc_templates")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Failed to delete template row");
      return;
    }

    await load();
  }

  if (loading) return <div className="p-8">Loading template...</div>;

  return (
    <div className="p-8 space-y-6">
      <div className="bg-white border rounded-2xl p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold">ITC Template Builder</h1>
          <p className="text-slate-500 mt-1">
            Configure project-specific ITC structure for all towers.
          </p>
        </div>

        <div className="border rounded-xl p-4 bg-slate-50 space-y-4">
          <div className="text-lg font-semibold">Add Template Item</div>

          <div className="grid md:grid-cols-7 gap-3">
            <div>
              <label className="block text-xs mb-1">Stage</label>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="border p-2 rounded w-full bg-white"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1">Item No.</label>
              <input
                value={itemNo}
                onChange={(e) => setItemNo(e.target.value)}
                className="border p-2 rounded w-full bg-white"
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Sort Order</label>
              <input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="border p-2 rounded w-full bg-white"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs mb-1">Description</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="border p-2 rounded w-full bg-white"
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Item Type</label>
              <select
                value={itemType}
                onChange={(e) =>
                  setItemType(
                    e.target.value as "check" | "auto" | "numeric" | "document"
                  )
                }
                className="border p-2 rounded w-full bg-white"
              >
                <option value="check">Check</option>
                <option value="auto">Auto</option>
                <option value="numeric">Numeric</option>
                <option value="document">Document</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={addTemplateRow}
                className="bg-blue-600 text-white rounded px-4 py-2 w-full"
              >
                Add
              </button>
            </div>
          </div>

          {itemType === "auto" && (
            <div className="max-w-sm">
              <label className="block text-xs mb-1">Daily Docket Source Field</label>
              <input
                value={sourceField}
                onChange={(e) => setSourceField(e.target.value)}
                className="border p-2 rounded w-full bg-white"
                placeholder="e.g. missing_items_bolts"
              />
            </div>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            Required item
          </label>
        </div>

        <div className="space-y-3">
          {rows.map((row) => (
            <div
              key={row.id}
              className="border rounded-xl p-4 flex justify-between items-start"
            >
              <div>
                <div className="font-semibold">
                  {row.stage} {row.item_no ? `· ${row.item_no}` : ""}
                </div>
                <div className="text-sm text-slate-600">{row.description}</div>
                <div className="text-xs text-slate-500 mt-1">
                  Type: {row.item_type}
                  {row.source_field ? ` · Source: ${row.source_field}` : ""}
                  {row.required ? " · Required" : " · Optional"}
                </div>
              </div>

              <button
                onClick={() => deleteTemplateRow(row.id)}
                className="text-red-600"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}