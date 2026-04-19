"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase";
import { getUserRole } from "@/lib/roles";

type Tower = {
  id: string;
  name?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
  extra_data?: Record<string, unknown> | null;
};

type ExtraFieldRow = {
  key: string;
  value: string;
};

function normalizeStatus(status?: string | null) {
  const value = (status || "").trim();
  if (value === "Complete") return "Complete";
  if (value === "In Progress") return "In Progress";
  return "Not Started";
}

function getStringValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

export default function EditTowerPage() {
  const params = useParams();
  const router = useRouter();

  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [towerName, setTowerName] = useState("");
  const [line, setLine] = useState("");
  const [status, setStatus] = useState("Not Started");
  const [progress, setProgress] = useState("0");

  const [towerType, setTowerType] = useState("");
  const [legA, setLegA] = useState("");
  const [legB, setLegB] = useState("");
  const [legC, setLegC] = useState("");
  const [legD, setLegD] = useState("");
  const [bodyExt, setBodyExt] = useState("");
  const [towerHeight, setTowerHeight] = useState("");
  const [towerWeight, setTowerWeight] = useState("");

  const [extraFields, setExtraFields] = useState<ExtraFieldRow[]>([]);

  useEffect(() => {
    if (!towerId) return;

    let cancelled = false;

    async function loadTower() {
      setLoading(true);

      const role = await getUserRole();
      if (role !== "admin" && role !== "editor") {
        alert("You do not have permission to edit towers.");
        router.push(`/project/${projectId}/tower/${towerId}`);
        return;
      }

      const { data, error } = await supabase
        .from("towers")
        .select("*")
        .eq("id", towerId)
        .single();

      if (cancelled) return;

      if (error || !data) {
        alert(error?.message || "Failed to load tower");
        router.push(`/project/${projectId}/tower/${towerId}`);
        return;
      }

      const tower = data as Tower;
      const extra = tower.extra_data || {};

      setTowerName(getStringValue(tower.name));
      setLine(getStringValue(tower.line));
      setStatus(normalizeStatus(tower.status));
      setProgress(getStringValue(tower.progress ?? 0));

      setTowerType(
        getStringValue(
          extra["Type"] ??
            extra["type"] ??
            extra["tower_type"] ??
            extra["Tower Type"]
        )
      );

      setLegA(getStringValue(extra["Leg A"] ?? extra["leg_a"]));
      setLegB(getStringValue(extra["Leg B"] ?? extra["leg_b"]));
      setLegC(getStringValue(extra["Leg C"] ?? extra["leg_c"]));
      setLegD(getStringValue(extra["Leg D"] ?? extra["leg_d"]));
      setBodyExt(
        getStringValue(
          extra["Body Ext (m)"] ??
            extra["Body Ext"] ??
            extra["body_ext"] ??
            extra["body extension"]
        )
      );
      setTowerHeight(
        getStringValue(
          extra["Tower Height (m)"] ??
            extra["Tower Height"] ??
            extra["tower_height"] ??
            extra["height"]
        )
      );
      setTowerWeight(
        getStringValue(
          extra["Tower Weight (t)"] ??
            extra["Tower Weight"] ??
            extra["weight"] ??
            extra["total_weight"] ??
            extra["steel weight"]
        )
      );

      const reservedKeys = new Set([
        "Type",
        "type",
        "tower_type",
        "Tower Type",
        "Leg A",
        "Leg B",
        "Leg C",
        "Leg D",
        "leg_a",
        "leg_b",
        "leg_c",
        "leg_d",
        "Body Ext (m)",
        "Body Ext",
        "body_ext",
        "body extension",
        "Tower Height (m)",
        "Tower Height",
        "tower_height",
        "height",
        "Tower Weight (t)",
        "Tower Weight",
        "weight",
        "total_weight",
        "steel weight",
      ]);

      const extraRows: ExtraFieldRow[] = Object.entries(extra)
        .filter(([key]) => !reservedKeys.has(key))
        .map(([key, value]) => ({
          key,
          value: getStringValue(value),
        }));

      setExtraFields(extraRows);
      setLoading(false);
    }

    loadTower();

    return () => {
      cancelled = true;
    };
  }, [towerId, projectId, router, supabase]);

  function addExtraField() {
    setExtraFields((prev) => [...prev, { key: "", value: "" }]);
  }

  function updateExtraField(index: number, field: keyof ExtraFieldRow, value: string) {
    setExtraFields((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function removeExtraField(index: number) {
    setExtraFields((prev) => prev.filter((_, i) => i !== index));
  }

  function buildExtraData() {
    const extraData: Record<string, unknown> = {};

    if (towerType.trim()) extraData["Type"] = towerType.trim();
    if (legA.trim()) extraData["Leg A"] = legA.trim();
    if (legB.trim()) extraData["Leg B"] = legB.trim();
    if (legC.trim()) extraData["Leg C"] = legC.trim();
    if (legD.trim()) extraData["Leg D"] = legD.trim();
    if (bodyExt.trim()) extraData["Body Ext (m)"] = bodyExt.trim();
    if (towerHeight.trim()) extraData["Tower Height (m)"] = towerHeight.trim();
    if (towerWeight.trim()) extraData["Tower Weight (t)"] = towerWeight.trim();

    extraFields.forEach((row) => {
      const key = row.key.trim();
      const value = row.value.trim();

      if (!key || !value) return;
      extraData[key] = value;
    });

    return extraData;
  }

  async function handleSave() {
    if (!towerId) {
      alert("Missing tower id");
      return;
    }

    if (!towerName.trim()) {
      alert("Please enter a tower name or number");
      return;
    }

    const parsedProgress = Number(progress || 0);
    if (Number.isNaN(parsedProgress) || parsedProgress < 0 || parsedProgress > 100) {
      alert("Progress must be between 0 and 100");
      return;
    }

    setSaving(true);

    try {
      const role = await getUserRole();

      if (role !== "admin" && role !== "editor") {
        alert("You do not have permission to edit towers.");
        setSaving(false);
        return;
      }

      const extra_data = buildExtraData();

      const { error } = await supabase
        .from("towers")
        .update({
          name: towerName.trim(),
          line: line.trim() || null,
          status,
          progress: parsedProgress,
          extra_data,
          updated_at: new Date().toISOString(),
        })
        .eq("id", towerId);

      if (error) {
        throw new Error(error.message || "Failed to update tower");
      }

      router.push(`/project/${projectId}/tower/${towerId}`);
      router.refresh();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Something went wrong");
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8">Loading tower...</div>;
  }

  return (
    <div className="p-8 max-w-5xl space-y-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold">Edit Tower</h1>
          <p className="text-slate-500 mt-1">
            Update this tower’s core information and project-specific fields.
          </p>
        </div>

        <Link
          href={`/project/${projectId}/tower/${towerId}`}
          className="border px-4 py-2 rounded-lg hover:bg-slate-50"
        >
          ← Back to Tower
        </Link>
      </div>

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Core Tower Information</h2>
          <p className="text-sm text-slate-500 mt-1">
            These are the main fields used across the app.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Input
            label="Tower Name / Number"
            value={towerName}
            onChange={setTowerName}
            placeholder="e.g. 1R/2R-42"
          />

          <Input
            label="Line"
            value={line}
            onChange={setLine}
            placeholder="e.g. Northern Line"
          />

          <Select
            label="Status"
            value={status}
            onChange={setStatus}
            options={["Not Started", "In Progress", "Complete"]}
          />

          <Input
            label="Progress (%)"
            value={progress}
            onChange={setProgress}
            type="number"
            placeholder="0"
          />
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold">Common Tower Data</h2>
          <p className="text-sm text-slate-500 mt-1">
            These values are stored in extra data so the system stays adaptable.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Input
            label="Tower Type"
            value={towerType}
            onChange={setTowerType}
            placeholder="e.g. 3DT"
          />

          <Input
            label="Leg A"
            value={legA}
            onChange={setLegA}
            placeholder="e.g. 7"
          />

          <Input
            label="Leg B"
            value={legB}
            onChange={setLegB}
            placeholder="e.g. 8"
          />

          <Input
            label="Leg C"
            value={legC}
            onChange={setLegC}
            placeholder="e.g. 5"
          />

          <Input
            label="Leg D"
            value={legD}
            onChange={setLegD}
            placeholder="e.g. 9"
          />

          <Input
            label="Body Ext (m)"
            value={bodyExt}
            onChange={setBodyExt}
            placeholder="e.g. 0"
          />

          <Input
            label="Tower Height (m)"
            value={towerHeight}
            onChange={setTowerHeight}
            placeholder="e.g. 59.17"
          />

          <Input
            label="Tower Weight (t)"
            value={towerWeight}
            onChange={setTowerWeight}
            placeholder="e.g. 59.18"
          />
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold">Additional Project Fields</h2>
            <p className="text-sm text-slate-500 mt-1">
              Add or update extra imported-style fields specific to this project.
            </p>
          </div>

          <button
            type="button"
            onClick={addExtraField}
            className="border px-4 py-2 rounded-lg hover:bg-slate-50"
          >
            Add Extra Field
          </button>
        </div>

        {extraFields.length === 0 ? (
          <div className="text-sm text-slate-500">No extra fields added.</div>
        ) : (
          <div className="space-y-3">
            {extraFields.map((row, index) => (
              <div
                key={index}
                className="grid md:grid-cols-[1fr_1fr_auto] gap-3 items-end"
              >
                <Input
                  label="Field Name"
                  value={row.key}
                  onChange={(value) => updateExtraField(index, "key", value)}
                  placeholder="e.g. Special Note"
                />

                <Input
                  label="Field Value"
                  value={row.value}
                  onChange={(value) => updateExtraField(index, "value", value)}
                  placeholder="e.g. River crossing structure"
                />

                <button
                  type="button"
                  onClick={() => removeExtraField(index)}
                  className="border border-red-200 bg-red-50 text-red-700 px-4 py-2 rounded-lg hover:bg-red-100"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>

        <Link
          href={`/project/${projectId}/tower/${towerId}`}
          className="border px-6 py-3 rounded-xl hover:bg-slate-50"
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        className="border rounded-lg p-2 w-full"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <select
        className="border rounded-lg p-2 w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}