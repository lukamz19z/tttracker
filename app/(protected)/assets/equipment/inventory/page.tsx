/* eslint-disable react-hooks/set-state-in-effect */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Edit,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { createSupabaseBrowser } from "../../../../../lib/supabase";
import { PageHeader, PageShell } from "../../components";

type TabKey = "ppe" | "first-aid" | "snake-bite" | "spare-keys";

type Crew = {
  id: string;
  crew_number: string;
  crew_name: string | null;
  active?: boolean | null;
};

type PpeStock = {
  id: string;
  item_name: string;
  variant: string | null;
  current_stock: number | null;
  minimum_stock: number | null;
  location: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type KitTemplate = {
  id: string;
  kit_type: string;
  item_name: string;
  required_qty: number | null;
  notes: string | null;
};

type InventoryKit = {
  id: string;
  kit_number: string;
  kit_category: string;
  kit_type: string;
  assigned_asset_id: string | null;
  assigned_location: string | null;
  crew_id: string | null;
  last_inspection_date: string | null;
  status: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type KitInspectionItem = {
  id: string;
  kit_id: string;
  template_item_id: string | null;
  item_name: string;
  required_qty: number | null;
  actual_qty: number | null;
  status: string | null;
  expiry_date: string | null;
  notes: string | null;
};

type SpareKeyRow = {
  id: string;
  asset_type: string;
  asset_id: string;
  rego_or_serial: string;
  make_model: string;
  spare_key_status: string;
  stored_location: string;
  notes: string;
};

type PpeFormState = {
  item_name: string;
  variant: string;
  current_stock: string;
  minimum_stock: string;
  location: string;
  notes: string;
};

type TemplateFormState = {
  kit_type: string;
  item_name: string;
  required_qty: string;
  notes: string;
};

type KitFormState = {
  kit_number: string;
  kit_category: string;
  kit_type: string;
  assigned_asset_id: string;
  assigned_location: string;
  crew_id: string;
  last_inspection_date: string;
  status: string;
  notes: string;
};

const ppeItems = [
  "Safety Glasses",
  "Chinstraps",
  "Mosquito Nets",
  "Sunscreen",
  "Handwash",
  "Glove Clips",
  "Gloves",
  "Hardhats",
];

const firstAidKitTypes = ["LV Small Kit", "Remote Kit"];
const snakeBiteKitTypes = ["Snake Bite Kit"];
const kitStatusOptions = [
  "Not Inspected",
  "Complete",
  "Missing Items",
  "Expired Items",
  "Out of Service",
];
const inspectionStatusOptions = ["OK", "Missing", "Low", "Expired", "Damaged"];

const blankPpeForm: PpeFormState = {
  item_name: "Safety Glasses",
  variant: "",
  current_stock: "0",
  minimum_stock: "0",
  location: "",
  notes: "",
};

const blankTemplateForm: TemplateFormState = {
  kit_type: "LV Small Kit",
  item_name: "",
  required_qty: "1",
  notes: "",
};

const blankKitForm: KitFormState = {
  kit_number: "",
  kit_category: "First Aid",
  kit_type: "LV Small Kit",
  assigned_asset_id: "",
  assigned_location: "",
  crew_id: "",
  last_inspection_date: "",
  status: "Not Inspected",
  notes: "",
};

function clean(value: string | number | null | undefined) {
  return String(value ?? "").trim();
}

function csvSafe(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function toNumber(value: string | number | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function formatShortDate(value: string | null) {
  if (!value) return "No date";

  return new Date(`${value}T00:00:00`).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function stockClass(currentStock: number | null, minimumStock: number | null) {
  const current = toNumber(currentStock);
  const minimum = toNumber(minimumStock);

  if (minimum <= 0) return "border-slate-200 bg-slate-50 text-slate-700";
  if (current <= 0) return "border-rose-200 bg-rose-50 text-rose-700";
  if (current < minimum) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function stockLabel(currentStock: number | null, minimumStock: number | null) {
  const current = toNumber(currentStock);
  const minimum = toNumber(minimumStock);

  if (minimum <= 0) return "No minimum";
  if (current <= 0) return "Out";
  if (current < minimum) return "Reorder";
  return "OK";
}

function kitStatusClass(status: string | null) {
  const value = clean(status).toLowerCase();

  if (value === "complete") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "missing items") return "border-amber-200 bg-amber-50 text-amber-700";
  if (value === "expired items") return "border-rose-200 bg-rose-50 text-rose-700";
  if (value === "out of service") return "border-rose-200 bg-rose-50 text-rose-700";

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function itemStatusClass(status: string | null) {
  const value = clean(status).toLowerCase();

  if (value === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (value === "missing") return "border-rose-200 bg-rose-50 text-rose-700";
  if (value === "low") return "border-amber-200 bg-amber-50 text-amber-700";
  if (value === "expired") return "border-rose-200 bg-rose-50 text-rose-700";
  if (value === "damaged") return "border-rose-200 bg-rose-50 text-rose-700";

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold ${className}`}>
      {label}
    </span>
  );
}

function getField(row: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && clean(value as string)) return clean(value as string);
  }

  return "";
}

function hasTruthySpareKey(row: Record<string, unknown>) {
  const possible = [
    row.spare_key,
    row.has_spare_key,
    row.spare_key_available,
    row.spare_key_yes,
    row.spare_key_on_site,
  ];

  return possible.some((value) => {
    if (typeof value === "boolean") return value;
    const text = clean(value as string).toLowerCase();
    return ["yes", "y", "true", "1", "available", "site office"].includes(text);
  });
}

export default function InventoryPage() {
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [activeTab, setActiveTab] = useState<TabKey>("ppe");
  const [crews, setCrews] = useState<Crew[]>([]);
  const [ppeStock, setPpeStock] = useState<PpeStock[]>([]);
  const [kitTemplates, setKitTemplates] = useState<KitTemplate[]>([]);
  const [kits, setKits] = useState<InventoryKit[]>([]);
  const [inspectionItems, setInspectionItems] = useState<KitInspectionItem[]>([]);
  const [spareKeys, setSpareKeys] = useState<SpareKeyRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [ppeSearch, setPpeSearch] = useState("");
  const [ppeItemFilter, setPpeItemFilter] = useState("All Items");
  const [ppeStockFilter, setPpeStockFilter] = useState("All Stock");

  const [kitSearch, setKitSearch] = useState("");
  const [kitTypeFilter, setKitTypeFilter] = useState("All Kit Types");
  const [kitStatusFilter, setKitStatusFilter] = useState("All Statuses");
  const [kitCrewFilter, setKitCrewFilter] = useState("All Crews");

  const [keySearch, setKeySearch] = useState("");
  const [keyTypeFilter, setKeyTypeFilter] = useState("All Asset Types");

  const [showPpeForm, setShowPpeForm] = useState(false);
  const [editingPpeId, setEditingPpeId] = useState<string | null>(null);
  const [ppeForm, setPpeForm] = useState<PpeFormState>(blankPpeForm);

  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState<TemplateFormState>(blankTemplateForm);

  const [showKitForm, setShowKitForm] = useState(false);
  const [editingKitId, setEditingKitId] = useState<string | null>(null);
  const [kitForm, setKitForm] = useState<KitFormState>(blankKitForm);

  const [selectedKitId, setSelectedKitId] = useState<string | null>(null);

  const crewLabel = useCallback(
    (crewId: string | null) => {
      if (!crewId) return "Unassigned";

      const crew = crews.find((item) => item.id === crewId);
      if (!crew) return "Unassigned";

      return `${crew.crew_number}${crew.crew_name ? ` - ${crew.crew_name}` : ""}`;
    },
    [crews],
  );

  const loadSpareKeys = useCallback(async () => {
    const [vehiclesResult, plantResult] = await Promise.all([
      supabase.from("vehicles").select("*"),
      supabase.from("plant_assets").select("*"),
    ]);

    const rows: SpareKeyRow[] = [];

    if (!vehiclesResult.error) {
      ((vehiclesResult.data ?? []) as Record<string, unknown>[]).forEach((vehicle) => {
        if (!hasTruthySpareKey(vehicle)) return;

        rows.push({
          id: `vehicle-${clean(vehicle.id as string)}`,
          asset_type: "Vehicle",
          asset_id:
            getField(vehicle, ["vehicle_id", "asset_id", "fleet_number", "unit_number", "id"]) ||
            "Vehicle",
          rego_or_serial: getField(vehicle, ["rego", "registration", "registration_number", "vin", "chassis_number"]),
          make_model: [getField(vehicle, ["make"]), getField(vehicle, ["model", "vehicle_model"])]
            .filter(Boolean)
            .join(" "),
          spare_key_status: "Yes",
          stored_location: getField(vehicle, ["spare_key_location", "spare_key_stored_at", "key_location"]) || "Site Office",
          notes: getField(vehicle, ["spare_key_notes", "notes"]),
        });
      });
    }

    if (!plantResult.error) {
      ((plantResult.data ?? []) as Record<string, unknown>[]).forEach((plant) => {
        if (!hasTruthySpareKey(plant)) return;

        rows.push({
          id: `plant-${clean(plant.id as string)}`,
          asset_type: "Plant",
          asset_id:
            getField(plant, ["plant_id", "asset_id", "fleet_number", "unit_number", "id"]) ||
            "Plant",
          rego_or_serial: getField(plant, ["rego", "serial_number", "vin", "chassis_number"]),
          make_model: [getField(plant, ["make"]), getField(plant, ["model", "plant_model"])]
            .filter(Boolean)
            .join(" "),
          spare_key_status: "Yes",
          stored_location: getField(plant, ["spare_key_location", "spare_key_stored_at", "key_location"]) || "Site Office",
          notes: getField(plant, ["spare_key_notes", "notes"]),
        });
      });
    }

    setSpareKeys(rows);
  }, [supabase]);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [crewsResult, ppeResult, templatesResult, kitsResult, inspectionItemsResult] =
      await Promise.all([
        supabase
          .from("crews")
          .select("id, crew_number, crew_name, active")
          .order("crew_number", { ascending: true }),
        supabase
          .from("inventory_ppe_stock")
          .select("*")
          .order("item_name", { ascending: true })
          .order("variant", { ascending: true }),
        supabase
          .from("inventory_kit_templates")
          .select("*")
          .order("kit_type", { ascending: true })
          .order("item_name", { ascending: true }),
        supabase
          .from("inventory_kits")
          .select("*")
          .order("kit_category", { ascending: true })
          .order("kit_number", { ascending: true }),
        supabase
          .from("inventory_kit_inspection_items")
          .select("*")
          .order("item_name", { ascending: true }),
      ]);

    setCrews(
      crewsResult.error
        ? []
        : ((crewsResult.data ?? []) as Crew[]).filter((crew) => crew.active !== false),
    );
    setPpeStock(ppeResult.error ? [] : ((ppeResult.data ?? []) as PpeStock[]));
    setKitTemplates(templatesResult.error ? [] : ((templatesResult.data ?? []) as KitTemplate[]));
    setKits(kitsResult.error ? [] : ((kitsResult.data ?? []) as InventoryKit[]));
    setInspectionItems(
      inspectionItemsResult.error
        ? []
        : ((inspectionItemsResult.data ?? []) as KitInspectionItem[]),
    );

    await loadSpareKeys();

    setLoading(false);
  }, [supabase, loadSpareKeys]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selectedKit = useMemo(
    () => kits.find((kit) => kit.id === selectedKitId) ?? null,
    [kits, selectedKitId],
  );

  const ppeStockFiltered = useMemo(() => {
    const term = ppeSearch.trim().toLowerCase();

    return ppeStock.filter((item) => {
      const label = stockLabel(item.current_stock, item.minimum_stock);
      const searchable = [
        item.item_name,
        item.variant,
        item.current_stock,
        item.minimum_stock,
        item.location,
        item.notes,
        label,
      ]
        .join(" ")
        .toLowerCase();

      return (
        searchable.includes(term) &&
        (ppeItemFilter === "All Items" || item.item_name === ppeItemFilter) &&
        (ppeStockFilter === "All Stock" || label === ppeStockFilter)
      );
    });
  }, [ppeStock, ppeSearch, ppeItemFilter, ppeStockFilter]);

  const currentKitCategory = activeTab === "snake-bite" ? "Snake Bite" : "First Aid";

  const currentKits = useMemo(() => {
    const term = kitSearch.trim().toLowerCase();

    return kits.filter((kit) => {
      if (kit.kit_category !== currentKitCategory) return false;

      const crew = crewLabel(kit.crew_id);
      const searchable = [
        kit.kit_number,
        kit.kit_category,
        kit.kit_type,
        kit.assigned_asset_id,
        kit.assigned_location,
        crew,
        kit.status,
        kit.notes,
      ]
        .join(" ")
        .toLowerCase();

      return (
        searchable.includes(term) &&
        (kitTypeFilter === "All Kit Types" || kit.kit_type === kitTypeFilter) &&
        (kitStatusFilter === "All Statuses" || clean(kit.status) === kitStatusFilter) &&
        (kitCrewFilter === "All Crews" || crew === kitCrewFilter)
      );
    });
  }, [
    kits,
    currentKitCategory,
    kitSearch,
    kitTypeFilter,
    kitStatusFilter,
    kitCrewFilter,
    crewLabel,
  ]);

  const selectedKitItems = useMemo(() => {
    if (!selectedKit) return [];
    return inspectionItems.filter((item) => item.kit_id === selectedKit.id);
  }, [inspectionItems, selectedKit]);

  const currentKitTypes = activeTab === "snake-bite" ? snakeBiteKitTypes : firstAidKitTypes;

  const currentKitTemplates = useMemo(() => {
    return kitTemplates.filter((template) => currentKitTypes.includes(template.kit_type));
  }, [kitTemplates, currentKitTypes]);

  const spareKeysFiltered = useMemo(() => {
    const term = keySearch.trim().toLowerCase();

    return spareKeys.filter((item) => {
      const searchable = [
        item.asset_type,
        item.asset_id,
        item.rego_or_serial,
        item.make_model,
        item.spare_key_status,
        item.stored_location,
        item.notes,
      ]
        .join(" ")
        .toLowerCase();

      return (
        searchable.includes(term) &&
        (keyTypeFilter === "All Asset Types" || item.asset_type === keyTypeFilter)
      );
    });
  }, [spareKeys, keySearch, keyTypeFilter]);

  const crewOptions = useMemo(
    () => ["All Crews", ...Array.from(new Set(kits.map((kit) => crewLabel(kit.crew_id)))).sort()],
    [kits, crewLabel],
  );

  const printedAt = new Date().toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  function openPpeForm(item?: PpeStock) {
    if (item) {
      setEditingPpeId(item.id);
      setPpeForm({
        item_name: clean(item.item_name) || "Safety Glasses",
        variant: clean(item.variant),
        current_stock: String(toNumber(item.current_stock)),
        minimum_stock: String(toNumber(item.minimum_stock)),
        location: clean(item.location),
        notes: clean(item.notes),
      });
    } else {
      setEditingPpeId(null);
      setPpeForm(blankPpeForm);
    }

    setShowPpeForm(true);
  }

  function closePpeForm() {
    setEditingPpeId(null);
    setPpeForm(blankPpeForm);
    setShowPpeForm(false);
  }

  async function savePpeStock() {
    setSaving(true);

    const payload = {
      item_name: clean(ppeForm.item_name),
      variant: clean(ppeForm.variant) || null,
      current_stock: toNumber(ppeForm.current_stock),
      minimum_stock: toNumber(ppeForm.minimum_stock),
      location: clean(ppeForm.location) || null,
      notes: clean(ppeForm.notes) || null,
      updated_at: new Date().toISOString(),
    };

    if (!payload.item_name) {
      alert("Item name is required.");
      setSaving(false);
      return;
    }

    const result = editingPpeId
      ? await supabase.from("inventory_ppe_stock").update(payload).eq("id", editingPpeId)
      : await supabase.from("inventory_ppe_stock").insert(payload);

    if (result.error) {
      alert(result.error.message);
      setSaving(false);
      return;
    }

    closePpeForm();
    await loadData();
    setSaving(false);
  }

  async function adjustPpeStock(item: PpeStock, delta: number) {
    const nextStock = Math.max(0, toNumber(item.current_stock) + delta);

    const { error } = await supabase
      .from("inventory_ppe_stock")
      .update({ current_stock: nextStock, updated_at: new Date().toISOString() })
      .eq("id", item.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  async function deletePpeStock(item: PpeStock) {
    if (!window.confirm(`Delete ${item.item_name}${item.variant ? ` (${item.variant})` : ""}?`)) {
      return;
    }

    const { error } = await supabase.from("inventory_ppe_stock").delete().eq("id", item.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  function openTemplateForm(template?: KitTemplate) {
    if (template) {
      setEditingTemplateId(template.id);
      setTemplateForm({
        kit_type: template.kit_type,
        item_name: template.item_name,
        required_qty: String(toNumber(template.required_qty) || 1),
        notes: clean(template.notes),
      });
    } else {
      setEditingTemplateId(null);
      setTemplateForm({
        ...blankTemplateForm,
        kit_type: currentKitTypes[0],
      });
    }

    setShowTemplateForm(true);
  }

  function closeTemplateForm() {
    setEditingTemplateId(null);
    setTemplateForm(blankTemplateForm);
    setShowTemplateForm(false);
  }

  async function saveTemplate() {
    setSaving(true);

    const payload = {
      kit_type: clean(templateForm.kit_type),
      item_name: clean(templateForm.item_name),
      required_qty: Math.max(1, toNumber(templateForm.required_qty)),
      notes: clean(templateForm.notes) || null,
    };

    if (!payload.kit_type || !payload.item_name) {
      alert("Kit type and item name are required.");
      setSaving(false);
      return;
    }

    const result = editingTemplateId
      ? await supabase.from("inventory_kit_templates").update(payload).eq("id", editingTemplateId)
      : await supabase.from("inventory_kit_templates").insert(payload);

    if (result.error) {
      alert(result.error.message);
      setSaving(false);
      return;
    }

    closeTemplateForm();
    await loadData();
    setSaving(false);
  }

  async function deleteTemplate(template: KitTemplate) {
    if (!window.confirm(`Delete expected item ${template.item_name}?`)) return;

    const { error } = await supabase.from("inventory_kit_templates").delete().eq("id", template.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  function getNextKitNumber(category: "First Aid" | "Snake Bite") {
    const prefix = category === "First Aid" ? "FAK" : "SBK";

    const highest = kits.reduce((max, kit) => {
      const match = clean(kit.kit_number).match(new RegExp(`^${prefix}-(\\d+)$`, "i"));
      if (!match) return max;

      const number = Number(match[1]);
      return Number.isFinite(number) ? Math.max(max, number) : max;
    }, 0);

    return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
  }

  function openKitForm(kit?: InventoryKit) {
    const category = currentKitCategory as "First Aid" | "Snake Bite";

    if (kit) {
      setEditingKitId(kit.id);
      setKitForm({
        kit_number: clean(kit.kit_number),
        kit_category: kit.kit_category,
        kit_type: kit.kit_type,
        assigned_asset_id: clean(kit.assigned_asset_id),
        assigned_location: clean(kit.assigned_location),
        crew_id: clean(kit.crew_id),
        last_inspection_date: clean(kit.last_inspection_date),
        status: clean(kit.status) || "Not Inspected",
        notes: clean(kit.notes),
      });
    } else {
      setEditingKitId(null);
      setKitForm({
        ...blankKitForm,
        kit_category: category,
        kit_number: getNextKitNumber(category),
        kit_type: category === "Snake Bite" ? "Snake Bite Kit" : "LV Small Kit",
      });
    }

    setShowKitForm(true);
  }

  function closeKitForm() {
    setEditingKitId(null);
    setKitForm(blankKitForm);
    setShowKitForm(false);
  }

  async function saveKit() {
    setSaving(true);

    const payload = {
      kit_number: clean(kitForm.kit_number),
      kit_category: clean(kitForm.kit_category),
      kit_type: clean(kitForm.kit_type),
      assigned_asset_id: clean(kitForm.assigned_asset_id) || null,
      assigned_location: clean(kitForm.assigned_location) || null,
      crew_id: clean(kitForm.crew_id) || null,
      last_inspection_date: clean(kitForm.last_inspection_date) || null,
      status: clean(kitForm.status) || "Not Inspected",
      notes: clean(kitForm.notes) || null,
      updated_at: new Date().toISOString(),
    };

    if (!payload.kit_number || !payload.kit_category || !payload.kit_type) {
      alert("Kit number, category and type are required.");
      setSaving(false);
      return;
    }

    let kitId = editingKitId;

    if (editingKitId) {
      const { error } = await supabase.from("inventory_kits").update(payload).eq("id", editingKitId);

      if (error) {
        alert(error.message);
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase.from("inventory_kits").insert(payload).select("id").single();

      if (error) {
        alert(error.message);
        setSaving(false);
        return;
      }

      kitId = data?.id ?? null;
    }

    if (kitId) {
      await syncKitInspectionItems(kitId, payload.kit_type);
    }

    closeKitForm();
    await loadData();
    setSaving(false);
  }

  async function syncKitInspectionItems(kitId: string, kitType: string) {
    const existing = inspectionItems.filter((item) => item.kit_id === kitId);
    const templates = kitTemplates.filter((template) => template.kit_type === kitType);

    const inserts = templates
      .filter(
        (template) =>
          !existing.some(
            (item) =>
              item.template_item_id === template.id ||
              clean(item.item_name).toLowerCase() === clean(template.item_name).toLowerCase(),
          ),
      )
      .map((template) => ({
        kit_id: kitId,
        template_item_id: template.id,
        item_name: template.item_name,
        required_qty: toNumber(template.required_qty) || 1,
        actual_qty: 0,
        status: "Missing",
      }));

    if (inserts.length > 0) {
      await supabase.from("inventory_kit_inspection_items").insert(inserts);
    }
  }

  async function deleteKit(kit: InventoryKit) {
    if (!window.confirm(`Delete ${kit.kit_number}?`)) return;

    const { error } = await supabase.from("inventory_kits").delete().eq("id", kit.id);

    if (error) {
      alert(error.message);
      return;
    }

    if (selectedKitId === kit.id) setSelectedKitId(null);
    await loadData();
  }

  async function updateInspectionItem(item: KitInspectionItem, patch: Partial<KitInspectionItem>) {
    const payload = {
      ...patch,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("inventory_kit_inspection_items")
      .update(payload)
      .eq("id", item.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  async function finaliseKitInspection(kit: InventoryKit) {
    const rows = inspectionItems.filter((item) => item.kit_id === kit.id);
    const hasBadItem = rows.some((item) => {
      const status = clean(item.status).toLowerCase();
      return ["missing", "low", "expired", "damaged"].includes(status);
    });

    const status = hasBadItem ? "Missing Items" : "Complete";

    const { error } = await supabase
      .from("inventory_kits")
      .update({
        status,
        last_inspection_date: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      })
      .eq("id", kit.id);

    if (error) {
      alert(error.message);
      return;
    }

    await loadData();
  }

  function exportRows(filenamePrefix: string, headers: string[], rows: (string | number | null | undefined)[][]) {
    const csv = [
      headers.map(csvSafe).join(","),
      ...rows.map((row) => row.map(csvSafe).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `${filenamePrefix}-${date}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function printActiveTab() {
    window.print();
  }

  const ppeRequiredToOrder = ppeStock.reduce((total, item) => {
    return total + Math.max(toNumber(item.minimum_stock) - toNumber(item.current_stock), 0);
  }, 0);

  const firstAidKits = kits.filter((kit) => kit.kit_category === "First Aid");
  const snakeBiteKits = kits.filter((kit) => kit.kit_category === "Snake Bite");
  const kitBadCount = (category: string) =>
    kits.filter(
      (kit) =>
        kit.kit_category === category &&
        ["Missing Items", "Expired Items", "Out of Service"].includes(clean(kit.status)),
    ).length;

  return (
    <PageShell>
      <PageHeader
        eyebrow="Equipment Inventory"
        title="Inventory"
        description="Manage PPE stock, first aid kits, snake bite kits and spare keys."
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <button
              type="button"
              onClick={() => void loadData()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>

            <button
              type="button"
              onClick={printActiveTab}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Printer size={16} />
              Print PDF
            </button>
          </div>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
        <KpiCard title="PPE Order Qty" value={ppeRequiredToOrder} detail="Total items below minimum." />
        <KpiCard title="First Aid Kits" value={firstAidKits.length} detail={`${kitBadCount("First Aid")} need attention.`} />
        <KpiCard title="Snake Bite Kits" value={snakeBiteKits.length} detail={`${kitBadCount("Snake Bite")} need attention.`} />
        <KpiCard title="Spare Keys" value={spareKeys.length} detail="Pulled from plant and vehicles." />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm print:hidden">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3">
          <TabButton active={activeTab === "ppe"} onClick={() => setActiveTab("ppe")}>
            PPE Stock
          </TabButton>
          <TabButton active={activeTab === "first-aid"} onClick={() => setActiveTab("first-aid")}>
            First Aid Kits
          </TabButton>
          <TabButton active={activeTab === "snake-bite"} onClick={() => setActiveTab("snake-bite")}>
            Snake Bite Kits
          </TabButton>
          <TabButton active={activeTab === "spare-keys"} onClick={() => setActiveTab("spare-keys")}>
            Spare Keys
          </TabButton>
        </div>
      </section>

      {activeTab === "ppe" ? (
        <PpeSection
          items={ppeStockFiltered}
          allItems={ppeStock}
          search={ppeSearch}
          setSearch={setPpeSearch}
          itemFilter={ppeItemFilter}
          setItemFilter={setPpeItemFilter}
          stockFilter={ppeStockFilter}
          setStockFilter={setPpeStockFilter}
          openForm={openPpeForm}
          adjustStock={adjustPpeStock}
          deleteStock={deletePpeStock}
          exportCsv={() =>
            exportRows(
              "ppe-stock",
              ["Item", "Variant", "Current Stock", "Minimum Stock", "Order Qty", "Location", "Status", "Notes"],
              ppeStockFiltered.map((item) => [
                item.item_name,
                item.variant,
                item.current_stock,
                item.minimum_stock,
                Math.max(toNumber(item.minimum_stock) - toNumber(item.current_stock), 0),
                item.location,
                stockLabel(item.current_stock, item.minimum_stock),
                item.notes,
              ]),
            )
          }
        />
      ) : null}

      {activeTab === "first-aid" || activeTab === "snake-bite" ? (
        <KitsSection
          category={currentKitCategory}
          kitTypes={currentKitTypes}
          kits={currentKits}
          templates={currentKitTemplates}
          allInspectionItems={inspectionItems}
          selectedKit={selectedKit}
          selectedKitItems={selectedKitItems}
          crews={crews}
          crewLabel={crewLabel}
          search={kitSearch}
          setSearch={setKitSearch}
          kitTypeFilter={kitTypeFilter}
          setKitTypeFilter={setKitTypeFilter}
          kitStatusFilter={kitStatusFilter}
          setKitStatusFilter={setKitStatusFilter}
          kitCrewFilter={kitCrewFilter}
          setKitCrewFilter={setKitCrewFilter}
          crewOptions={crewOptions}
          openKitForm={openKitForm}
          deleteKit={deleteKit}
          setSelectedKitId={setSelectedKitId}
          openTemplateForm={openTemplateForm}
          deleteTemplate={deleteTemplate}
          updateInspectionItem={updateInspectionItem}
          finaliseKitInspection={finaliseKitInspection}
          exportKits={() =>
            exportRows(
              `${currentKitCategory.toLowerCase().replace(/\s+/g, "-")}-kits`,
              ["Kit Number", "Category", "Type", "Asset", "Location", "Crew", "Last Inspection", "Status", "Notes"],
              currentKits.map((kit) => [
                kit.kit_number,
                kit.kit_category,
                kit.kit_type,
                kit.assigned_asset_id,
                kit.assigned_location,
                crewLabel(kit.crew_id),
                kit.last_inspection_date,
                kit.status,
                kit.notes,
              ]),
            )
          }
          exportTemplates={() =>
            exportRows(
              `${currentKitCategory.toLowerCase().replace(/\s+/g, "-")}-template`,
              ["Kit Type", "Item", "Required Qty", "Notes"],
              currentKitTemplates.map((template) => [
                template.kit_type,
                template.item_name,
                template.required_qty,
                template.notes,
              ]),
            )
          }
        />
      ) : null}

      {activeTab === "spare-keys" ? (
        <SpareKeysSection
          rows={spareKeysFiltered}
          allRows={spareKeys}
          search={keySearch}
          setSearch={setKeySearch}
          typeFilter={keyTypeFilter}
          setTypeFilter={setKeyTypeFilter}
          exportCsv={() =>
            exportRows(
              "spare-keys",
              ["Asset Type", "Asset ID", "Rego / Serial", "Make / Model", "Spare Key", "Stored Location", "Notes"],
              spareKeysFiltered.map((row) => [
                row.asset_type,
                row.asset_id,
                row.rego_or_serial,
                row.make_model,
                row.spare_key_status,
                row.stored_location,
                row.notes,
              ]),
            )
          }
        />
      ) : null}

      <PrintArea
        activeTab={activeTab}
        printedAt={printedAt}
        ppeRows={ppeStockFiltered}
        kitCategory={currentKitCategory}
        kitRows={currentKits}
        keyRows={spareKeysFiltered}
        crewLabel={crewLabel}
      />

      {showPpeForm ? (
        <Modal
          title={editingPpeId ? "Edit PPE Stock" : "Add PPE Stock"}
          subtitle="Manage stock on hand, minimum level and storage location."
          onClose={closePpeForm}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              PPE Item
              <select
                value={ppeForm.item_name}
                onChange={(event) => setPpeForm((current) => ({ ...current, item_name: event.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                {ppeItems.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>

            <FormInput
              label="Size / Variant"
              value={ppeForm.variant}
              onChange={(value) => setPpeForm((current) => ({ ...current, variant: value }))}
              placeholder="e.g. Large, Clear, 1L, Box"
            />

            <FormInput
              label="Current Stock"
              type="number"
              value={ppeForm.current_stock}
              onChange={(value) => setPpeForm((current) => ({ ...current, current_stock: value }))}
            />

            <FormInput
              label="Minimum Stock"
              type="number"
              value={ppeForm.minimum_stock}
              onChange={(value) => setPpeForm((current) => ({ ...current, minimum_stock: value }))}
            />

            <FormInput
              label="Location"
              value={ppeForm.location}
              onChange={(value) => setPpeForm((current) => ({ ...current, location: value }))}
              placeholder="e.g. Site office, Container"
            />

            <FormInput
              label="Notes"
              value={ppeForm.notes}
              onChange={(value) => setPpeForm((current) => ({ ...current, notes: value }))}
            />
          </div>

          <ModalActions
            saving={saving}
            onCancel={closePpeForm}
            onSave={() => void savePpeStock()}
            saveLabel={editingPpeId ? "Save Changes" : "Save Stock"}
          />
        </Modal>
      ) : null}

      {showTemplateForm ? (
        <Modal
          title={editingTemplateId ? "Edit Expected Contents" : "Add Expected Contents"}
          subtitle="Set the required contents for LV small, remote or snake bite kits."
          onClose={closeTemplateForm}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Kit Type
              <select
                value={templateForm.kit_type}
                onChange={(event) => setTemplateForm((current) => ({ ...current, kit_type: event.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                {currentKitTypes.map((kitType) => (
                  <option key={kitType}>{kitType}</option>
                ))}
              </select>
            </label>

            <FormInput
              label="Expected Item"
              value={templateForm.item_name}
              onChange={(value) => setTemplateForm((current) => ({ ...current, item_name: value }))}
              placeholder="e.g. Bandage, Saline, Burn Gel"
            />

            <FormInput
              label="Required Qty"
              type="number"
              value={templateForm.required_qty}
              onChange={(value) => setTemplateForm((current) => ({ ...current, required_qty: value }))}
            />

            <FormInput
              label="Notes"
              value={templateForm.notes}
              onChange={(value) => setTemplateForm((current) => ({ ...current, notes: value }))}
            />
          </div>

          <ModalActions
            saving={saving}
            onCancel={closeTemplateForm}
            onSave={() => void saveTemplate()}
            saveLabel={editingTemplateId ? "Save Changes" : "Save Expected Item"}
          />
        </Modal>
      ) : null}

      {showKitForm ? (
        <Modal
          title={editingKitId ? "Edit Kit" : `Add ${currentKitCategory} Kit`}
          subtitle="Register the physical kit and assign it to a vehicle, crew or location."
          onClose={closeKitForm}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormInput
              label="Kit Number"
              value={kitForm.kit_number}
              onChange={(value) => setKitForm((current) => ({ ...current, kit_number: value }))}
            />

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Kit Type
              <select
                value={kitForm.kit_type}
                onChange={(event) => setKitForm((current) => ({ ...current, kit_type: event.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                {currentKitTypes.map((kitType) => (
                  <option key={kitType}>{kitType}</option>
                ))}
              </select>
            </label>

            <FormInput
              label="Assigned Asset"
              value={kitForm.assigned_asset_id}
              onChange={(value) => setKitForm((current) => ({ ...current, assigned_asset_id: value }))}
              placeholder="e.g. LV014, Site Office"
            />

            <FormInput
              label="Location"
              value={kitForm.assigned_location}
              onChange={(value) => setKitForm((current) => ({ ...current, assigned_location: value }))}
              placeholder="e.g. Ute rear drawer, Office"
            />

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Crew
              <select
                value={kitForm.crew_id}
                onChange={(event) => setKitForm((current) => ({ ...current, crew_id: event.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <option value="">Unassigned</option>
                {crews.map((crew) => (
                  <option key={crew.id} value={crew.id}>
                    {crew.crew_number}
                    {crew.crew_name ? ` - ${crew.crew_name}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700">
              Status
              <select
                value={kitForm.status}
                onChange={(event) => setKitForm((current) => ({ ...current, status: event.target.value }))}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                {kitStatusOptions.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>

            <FormInput
              label="Last Inspection"
              type="date"
              value={kitForm.last_inspection_date}
              onChange={(value) => setKitForm((current) => ({ ...current, last_inspection_date: value }))}
            />

            <FormInput
              label="Notes"
              value={kitForm.notes}
              onChange={(value) => setKitForm((current) => ({ ...current, notes: value }))}
            />
          </div>

          <ModalActions
            saving={saving}
            onCancel={closeKitForm}
            onSave={() => void saveKit()}
            saveLabel={editingKitId ? "Save Changes" : "Save Kit"}
          />
        </Modal>
      ) : null}
    </PageShell>
  );
}

function KpiCard({ title, value, detail }: { title: string; value: number | string; detail: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-sm font-medium text-slate-500">{detail}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
        active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

function PpeSection({
  items,
  allItems,
  search,
  setSearch,
  itemFilter,
  setItemFilter,
  stockFilter,
  setStockFilter,
  openForm,
  adjustStock,
  deleteStock,
  exportCsv,
}: {
  items: PpeStock[];
  allItems: PpeStock[];
  search: string;
  setSearch: (value: string) => void;
  itemFilter: string;
  setItemFilter: (value: string) => void;
  stockFilter: string;
  setStockFilter: (value: string) => void;
  openForm: (item?: PpeStock) => void;
  adjustStock: (item: PpeStock, delta: number) => void;
  deleteStock: (item: PpeStock) => void;
  exportCsv: () => void;
}) {
  const itemOptions = ["All Items", ...Array.from(new Set([...ppeItems, ...allItems.map((item) => item.item_name)])).sort()];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm print:hidden">
      <div className="border-b border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">PPE Stock</h2>
            <p className="mt-1 text-sm text-slate-600">Stocktake PPE items, set minimums and adjust stock as items are taken.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportCsv} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">
              <Download size={16} className="mr-2 inline" />
              Export CSV
            </button>
            <button type="button" onClick={() => openForm()} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">
              <Plus size={16} className="mr-2 inline" />
              Add PPE
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Search PPE, variant, location..." />
          <select value={itemFilter} onChange={(event) => setItemFilter(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
            {itemOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
            <option>All Stock</option>
            <option>OK</option>
            <option>Reorder</option>
            <option>Out</option>
            <option>No minimum</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[950px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Variant</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Minimum</th>
              <th className="px-4 py-3">Order Qty</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {items.map((item) => {
              const orderQty = Math.max(toNumber(item.minimum_stock) - toNumber(item.current_stock), 0);

              return (
                <tr key={item.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-black text-slate-950">{item.item_name}</td>
                  <td className="px-4 py-3">{clean(item.variant) || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => void adjustStock(item, -1)} className="rounded-lg border p-1">
                        <Minus size={14} />
                      </button>
                      <span className="min-w-8 text-center font-black">{toNumber(item.current_stock)}</span>
                      <button type="button" onClick={() => void adjustStock(item, 1)} className="rounded-lg border p-1">
                        <Plus size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">{toNumber(item.minimum_stock)}</td>
                  <td className="px-4 py-3">
                    <Pill label={orderQty > 0 ? `Order ${orderQty}` : stockLabel(item.current_stock, item.minimum_stock)} className={stockClass(item.current_stock, item.minimum_stock)} />
                  </td>
                  <td className="px-4 py-3">{clean(item.location) || "—"}</td>
                  <td className="px-4 py-3">{clean(item.notes) || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => openForm(item)} className="rounded-lg border px-3 py-2 text-xs font-bold">
                        <Edit size={14} className="mr-1 inline" />
                        Edit
                      </button>
                      <button type="button" onClick={() => void deleteStock(item)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                        <Trash2 size={14} className="mr-1 inline" />
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                  No PPE stock rows found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function KitsSection({
  category,
  kitTypes,
  kits,
  templates,
  allInspectionItems,
  selectedKit,
  selectedKitItems,
  crews: _crews,
  crewLabel,
  search,
  setSearch,
  kitTypeFilter,
  setKitTypeFilter,
  kitStatusFilter,
  setKitStatusFilter,
  kitCrewFilter,
  setKitCrewFilter,
  crewOptions,
  openKitForm,
  deleteKit,
  setSelectedKitId,
  openTemplateForm,
  deleteTemplate,
  updateInspectionItem,
  finaliseKitInspection,
  exportKits,
  exportTemplates,
}: {
  category: string;
  kitTypes: string[];
  kits: InventoryKit[];
  templates: KitTemplate[];
  allInspectionItems: KitInspectionItem[];
  selectedKit: InventoryKit | null;
  selectedKitItems: KitInspectionItem[];
  crews: Crew[];
  crewLabel: (crewId: string | null) => string;
  search: string;
  setSearch: (value: string) => void;
  kitTypeFilter: string;
  setKitTypeFilter: (value: string) => void;
  kitStatusFilter: string;
  setKitStatusFilter: (value: string) => void;
  kitCrewFilter: string;
  setKitCrewFilter: (value: string) => void;
  crewOptions: string[];
  openKitForm: (kit?: InventoryKit) => void;
  deleteKit: (kit: InventoryKit) => void;
  setSelectedKitId: (id: string | null) => void;
  openTemplateForm: (template?: KitTemplate) => void;
  deleteTemplate: (template: KitTemplate) => void;
  updateInspectionItem: (item: KitInspectionItem, patch: Partial<KitInspectionItem>) => void;
  finaliseKitInspection: (kit: InventoryKit) => void;
  exportKits: () => void;
  exportTemplates: () => void;
}) {
  const typeOptions = ["All Kit Types", ...kitTypes];

  return (
    <div className="grid gap-5 print:hidden">
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">{category} Register</h2>
              <p className="mt-1 text-sm text-slate-600">Register kits and inspect each kit against its expected contents.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={exportKits} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">
                <Download size={16} className="mr-2 inline" />
                Export Kits
              </button>
              <button type="button" onClick={() => openKitForm()} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">
                <Plus size={16} className="mr-2 inline" />
                Add Kit
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <SearchInput value={search} onChange={setSearch} placeholder="Search kit, asset, location..." />
            <select value={kitTypeFilter} onChange={(event) => setKitTypeFilter(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
              {typeOptions.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
            <select value={kitStatusFilter} onChange={(event) => setKitStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
              <option>All Statuses</option>
              {kitStatusOptions.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
            <select value={kitCrewFilter} onChange={(event) => setKitCrewFilter(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
              {crewOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Kit</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Asset / Location</th>
                <th className="px-4 py-3">Crew</th>
                <th className="px-4 py-3">Last Inspection</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Issues</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {kits.map((kit) => {
                const issueCount = allInspectionItems.filter((item) => {
                  const status = clean(item.status).toLowerCase();
                  return item.kit_id === kit.id && ["missing", "low", "expired", "damaged"].includes(status);
                }).length;

                return (
                  <tr key={kit.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-black text-slate-950">{kit.kit_number}</td>
                    <td className="px-4 py-3">{kit.kit_type}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{clean(kit.assigned_asset_id) || "—"}</p>
                      <p className="text-xs text-slate-500">{clean(kit.assigned_location) || "No location"}</p>
                    </td>
                    <td className="px-4 py-3">{crewLabel(kit.crew_id)}</td>
                    <td className="px-4 py-3">{formatShortDate(kit.last_inspection_date)}</td>
                    <td className="px-4 py-3">
                      <Pill label={clean(kit.status) || "Not Inspected"} className={kitStatusClass(kit.status)} />
                    </td>
                    <td className="px-4 py-3">{issueCount > 0 ? `${issueCount} issue(s)` : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setSelectedKitId(kit.id)} className="rounded-lg border px-3 py-2 text-xs font-bold">
                          Inspect
                        </button>
                        <button type="button" onClick={() => openKitForm(kit)} className="rounded-lg border px-3 py-2 text-xs font-bold">
                          Edit
                        </button>
                        <button type="button" onClick={() => void deleteKit(kit)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {kits.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    No kits found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
            <div>
              <h3 className="text-lg font-black text-slate-950">Expected Contents</h3>
              <p className="mt-1 text-sm text-slate-600">Set the standard contents for each kit type.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={exportTemplates} className="rounded-xl border px-4 py-2 text-sm font-bold">
                Export
              </button>
              <button type="button" onClick={() => openTemplateForm()} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">
                Add Item
              </button>
            </div>
          </div>

          <div className="max-h-[520px] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Kit Type</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{template.kit_type}</td>
                    <td className="px-4 py-3 font-semibold">{template.item_name}</td>
                    <td className="px-4 py-3">{toNumber(template.required_qty) || 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => openTemplateForm(template)} className="rounded-lg border px-3 py-2 text-xs font-bold">
                          Edit
                        </button>
                        <button type="button" onClick={() => void deleteTemplate(template)} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {templates.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">
                      No expected contents set yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h3 className="text-lg font-black text-slate-950">Kit Inspection</h3>
            <p className="mt-1 text-sm text-slate-600">
              {selectedKit ? `Inspecting ${selectedKit.kit_number}` : "Select a kit from the register to inspect contents."}
            </p>
          </div>

          {selectedKit ? (
            <div>
              <div className="border-b border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-black text-slate-950">
                  {selectedKit.kit_number} · {selectedKit.kit_type}
                </p>
                <p className="mt-1 text-slate-600">
                  {clean(selectedKit.assigned_asset_id) || "No asset"} · {clean(selectedKit.assigned_location) || "No location"}
                </p>
              </div>

              <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Item</th>
                      <th className="px-4 py-3">Required</th>
                      <th className="px-4 py-3">Actual</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Expiry</th>
                      <th className="px-4 py-3">Notes</th>
                    </tr>
                  </thead>

                  <tbody>
                    {selectedKitItems.map((item) => (
                      <tr key={item.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-semibold">{item.item_name}</td>
                        <td className="px-4 py-3">{toNumber(item.required_qty) || 1}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            value={toNumber(item.actual_qty)}
                            onChange={(event) =>
                              void updateInspectionItem(item, {
                                actual_qty: toNumber(event.target.value),
                              })
                            }
                            className="w-20 rounded-lg border px-2 py-1"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={clean(item.status) || "Missing"}
                            onChange={(event) =>
                              void updateInspectionItem(item, {
                                status: event.target.value,
                              })
                            }
                            className="rounded-lg border px-2 py-1"
                          >
                            {inspectionStatusOptions.map((status) => (
                              <option key={status}>{status}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="date"
                            value={clean(item.expiry_date)}
                            onChange={(event) =>
                              void updateInspectionItem(item, {
                                expiry_date: event.target.value || null,
                              })
                            }
                            className="rounded-lg border px-2 py-1"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={clean(item.notes)}
                            onChange={(event) =>
                              void updateInspectionItem(item, {
                                notes: event.target.value || null,
                              })
                            }
                            className="w-full min-w-32 rounded-lg border px-2 py-1"
                          />
                        </td>
                      </tr>
                    ))}

                    {selectedKitItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                          No inspection rows yet. Save this kit after setting expected contents to sync items.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 p-4">
                <button type="button" onClick={() => setSelectedKitId(null)} className="rounded-xl border px-4 py-2 text-sm font-bold">
                  Close
                </button>
                <button type="button" onClick={() => void finaliseKitInspection(selectedKit)} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">
                  Finalise Inspection
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">Select a kit to view checklist.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function SpareKeysSection({
  rows,
  allRows,
  search,
  setSearch,
  typeFilter,
  setTypeFilter,
  exportCsv,
}: {
  rows: SpareKeyRow[];
  allRows: SpareKeyRow[];
  search: string;
  setSearch: (value: string) => void;
  typeFilter: string;
  setTypeFilter: (value: string) => void;
  exportCsv: () => void;
}) {
  const typeOptions = ["All Asset Types", ...Array.from(new Set(allRows.map((row) => row.asset_type))).sort()];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm print:hidden">
      <div className="border-b border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-950">Spare Keys</h2>
            <p className="mt-1 text-sm text-slate-600">Pulled from vehicle and plant records where spare key is marked yes.</p>
          </div>
          <button type="button" onClick={exportCsv} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">
            <Download size={16} className="mr-2 inline" />
            Export CSV
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <SearchInput value={search} onChange={setSearch} placeholder="Search asset, rego, location..." />
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
            {typeOptions.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Asset Type</th>
              <th className="px-4 py-3">Asset ID</th>
              <th className="px-4 py-3">Rego / Serial</th>
              <th className="px-4 py-3">Make / Model</th>
              <th className="px-4 py-3">Spare Key</th>
              <th className="px-4 py-3">Stored Location</th>
              <th className="px-4 py-3">Notes</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-3">{row.asset_type}</td>
                <td className="px-4 py-3 font-black text-slate-950">{row.asset_id}</td>
                <td className="px-4 py-3">{row.rego_or_serial || "—"}</td>
                <td className="px-4 py-3">{row.make_model || "—"}</td>
                <td className="px-4 py-3">
                  <Pill label={row.spare_key_status} className="border-emerald-200 bg-emerald-50 text-emerald-700" />
                </td>
                <td className="px-4 py-3">{row.stored_location || "—"}</td>
                <td className="px-4 py-3">{row.notes || "—"}</td>
              </tr>
            ))}

            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  No spare keys found from vehicle or plant records.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PrintArea({
  activeTab,
  printedAt,
  ppeRows,
  kitCategory,
  kitRows,
  keyRows,
  crewLabel,
}: {
  activeTab: TabKey;
  printedAt: string;
  ppeRows: PpeStock[];
  kitCategory: string;
  kitRows: InventoryKit[];
  keyRows: SpareKeyRow[];
  crewLabel: (crewId: string | null) => string;
}) {
  const title =
    activeTab === "ppe"
      ? "PPE Stock Register"
      : activeTab === "spare-keys"
        ? "Spare Key Register"
        : `${kitCategory} Register`;

  return (
    <section className="print-area hidden">
      <div className="mb-4">
        <h1 className="text-xl font-black text-slate-950">{title}</h1>
        <p className="mt-1 text-xs text-slate-500">Printed: {printedAt}</p>
      </div>

      {activeTab === "ppe" ? (
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th>Variant</th>
              <th>Current</th>
              <th>Minimum</th>
              <th>Order</th>
              <th>Location</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {ppeRows.map((row) => (
              <tr key={row.id}>
                <td>{row.item_name}</td>
                <td>{row.variant || "-"}</td>
                <td>{toNumber(row.current_stock)}</td>
                <td>{toNumber(row.minimum_stock)}</td>
                <td>{Math.max(toNumber(row.minimum_stock) - toNumber(row.current_stock), 0)}</td>
                <td>{row.location || "-"}</td>
                <td>{row.notes || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {activeTab === "first-aid" || activeTab === "snake-bite" ? (
        <table>
          <thead>
            <tr>
              <th>Kit</th>
              <th>Type</th>
              <th>Asset</th>
              <th>Location</th>
              <th>Crew</th>
              <th>Last Inspection</th>
              <th>Status</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {kitRows.map((row) => (
              <tr key={row.id}>
                <td>{row.kit_number}</td>
                <td>{row.kit_type}</td>
                <td>{row.assigned_asset_id || "-"}</td>
                <td>{row.assigned_location || "-"}</td>
                <td>{crewLabel(row.crew_id)}</td>
                <td>{row.last_inspection_date || "-"}</td>
                <td>{row.status || "-"}</td>
                <td>{row.notes || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {activeTab === "spare-keys" ? (
        <table>
          <thead>
            <tr>
              <th>Asset Type</th>
              <th>Asset ID</th>
              <th>Rego / Serial</th>
              <th>Make / Model</th>
              <th>Spare Key</th>
              <th>Location</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {keyRows.map((row) => (
              <tr key={row.id}>
                <td>{row.asset_type}</td>
                <td>{row.asset_id}</td>
                <td>{row.rego_or_serial || "-"}</td>
                <td>{row.make_model || "-"}</td>
                <td>{row.spare_key_status}</td>
                <td>{row.stored_location || "-"}</td>
                <td>{row.notes || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }

          .print-area,
          .print-area * {
            visibility: visible;
          }

          .print-area {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 12px;
            background: white;
          }

          .print-area table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-size: 10px;
          }

          .print-area th,
          .print-area td {
            border: 1px solid #cbd5e1;
            padding: 4px 5px;
            vertical-align: top;
            word-break: break-word;
          }

          .print-area th {
            background: #f1f5f9;
            font-weight: 800;
            text-transform: uppercase;
          }

          @page {
            size: landscape;
            margin: 8mm;
          }
        }
      `}</style>
    </section>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-4 text-sm outline-none"
      />
    </div>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4 print:hidden">
      <div className="mx-auto my-6 w-full max-w-3xl rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 rounded-t-3xl border-b border-slate-200 bg-white p-5">
          <div>
            <h2 className="text-2xl font-black text-slate-950">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function FormInput({
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
    <label className="grid gap-2 text-sm font-bold text-slate-700">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-4 py-3"
      />
    </label>
  );
}

function ModalActions({
  saving,
  onCancel,
  onSave,
  saveLabel,
}: {
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  return (
    <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-5">
      <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold">
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-400"
      >
        <Save size={16} />
        {saving ? "Saving..." : saveLabel}
      </button>
    </div>
  );
}
