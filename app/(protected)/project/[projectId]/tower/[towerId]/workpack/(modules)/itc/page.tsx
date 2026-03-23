"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

type SectionRow = {
  id: string;
  project_id: string;
  section_name: string;
  section_order: number | null;
};

type ItemRow = {
  id: string;
  section_id: string;
  item_number: number | null;
  description: string;
  item_order: number | null;
};

export default function AdminItcTemplatePage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const supabase = createSupabaseBrowser();

  const [sections, setSections] = useState<SectionRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [newSectionName, setNewSectionName] = useState("");
  const [newSectionOrder, setNewSectionOrder] = useState("");

  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [newItemNumber, setNewItemNumber] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemOrder, setNewItemOrder] = useState("");

  useEffect(() => {
    load();
  }, [projectId]);

  async function load() {
    setLoading(true);

    const { data: s } = await supabase
      .from("itc_template_sections")
      .select("*")
      .eq("project_id", projectId)
      .order("section_order", { ascending: true });

    const sectionRows = (s || []) as SectionRow[];
    setSections(sectionRows);

    const sectionIds = sectionRows.map((x) => x.id);

    if (sectionIds.length > 0) {
      const { data: i } = await supabase
        .from("itc_template_items")
        .select("*")
        .in("section_id", sectionIds)
        .order("item_order", { ascending: true })
        .order("item_number", { ascending: true });

      setItems((i || []) as ItemRow[]);
      if (!selectedSectionId) setSelectedSectionId(sectionIds[0]);
    } else {
      setItems([]);
      setSelectedSectionId("");
    }

    setLoading(false);
  }

  async function addSection() {
    if (!newSectionName.trim()) {
      alert("Enter section name.");
      return;
    }

    const { error } = await supabase.from("itc_template_sections").insert({
      project_id: projectId,
      section_name: newSectionName.trim(),
      section_order: newSectionOrder ? Number(newSectionOrder) : 0,
    });

    if (error) {
      alert("Failed to add section.");
      return;
    }

    setNewSectionName("");
    setNewSectionOrder("");
    await load();
  }

  async function deleteSection(id: string) {
    const confirmed = window.confirm(
      "Delete this section and all its items?"
    );
    if (!confirmed) return;

    const { error } = await supabase
      .from("itc_template_sections")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Failed to delete section.");
      return;
    }

    await load();
  }

  async function addItem() {
    if (!selectedSectionId) {
      alert("Select a section first.");
      return;
    }

    if (!newItemDescription.trim()) {
      alert("Enter item description.");
      return;
    }

    const { error } = await supabase.from("itc_template_items").insert({
      section_id: selectedSectionId,
      item_number: newItemNumber ? Number(newItemNumber) : null,
      description: newItemDescription.trim(),
      item_order: newItemOrder ? Number(newItemOrder) : 0,
    });

    if (error) {
      alert("Failed to add item.");
      return;
    }

    setNewItemNumber("");
    setNewItemDescription("");
    setNewItemOrder("");
    await load();
  }

  async function deleteItem(id: string) {
    const confirmed = window.confirm("Delete this template item?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("itc_template_items")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Failed to delete item.");
      return;
    }

    await load();
  }

  const itemsBySection = sections.map((section) => ({
    section,
    rows: items.filter((i) => i.section_id === section.id),
  }));

  if (loading) return <div className="p-8">Loading template...</div>;

  return (
    <div className="p-8 space-y-6">
      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">ITC Template Builder</h1>
          <p className="text-slate-500 mt-1">
            Add or remove standard ITC sections and items for this project.
          </p>
        </div>

        <div className="border rounded-xl p-4 bg-slate-50 space-y-4">
          <div className="text-lg font-semibold">Add Section</div>
          <div className="grid md:grid-cols-3 gap-3">
            <input
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              placeholder="Section Name"
              className="border p-2 rounded bg-white"
            />
            <input
              value={newSectionOrder}
              onChange={(e) => setNewSectionOrder(e.target.value)}
              placeholder="Section Order"
              className="border p-2 rounded bg-white"
            />
            <button
              onClick={addSection}
              className="bg-blue-600 text-white rounded px-4 py-2"
            >
              Add Section
            </button>
          </div>
        </div>

        <div className="border rounded-xl p-4 bg-slate-50 space-y-4">
          <div className="text-lg font-semibold">Add Item</div>
          <div className="grid md:grid-cols-4 gap-3">
            <select
              value={selectedSectionId}
              onChange={(e) => setSelectedSectionId(e.target.value)}
              className="border p-2 rounded bg-white"
            >
              <option value="">Select Section</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.section_name}
                </option>
              ))}
            </select>

            <input
              value={newItemNumber}
              onChange={(e) => setNewItemNumber(e.target.value)}
              placeholder="Item No."
              className="border p-2 rounded bg-white"
            />

            <input
              value={newItemOrder}
              onChange={(e) => setNewItemOrder(e.target.value)}
              placeholder="Item Order"
              className="border p-2 rounded bg-white"
            />

            <input
              value={newItemDescription}
              onChange={(e) => setNewItemDescription(e.target.value)}
              placeholder="Item Description"
              className="border p-2 rounded bg-white md:col-span-4"
            />

            <button
              onClick={addItem}
              className="bg-blue-600 text-white rounded px-4 py-2 md:col-span-1"
            >
              Add Item
            </button>
          </div>
        </div>

        <div className="space-y-5">
          {itemsBySection.map(({ section, rows }) => (
            <div key={section.id} className="border rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center">
                <div className="font-semibold text-lg">
                  {section.section_name}
                </div>

                <button
                  onClick={() => deleteSection(section.id)}
                  className="text-red-600"
                >
                  Remove Section
                </button>
              </div>

              {rows.length === 0 ? (
                <div className="text-slate-500 text-sm">
                  No items in this section yet.
                </div>
              ) : (
                rows.map((row) => (
                  <div
                    key={row.id}
                    className="border rounded-lg p-3 flex justify-between items-start"
                  >
                    <div>
                      <div className="font-medium">
                        {row.item_number ? `${row.item_number}. ` : ""}
                        {row.description}
                      </div>
                      <div className="text-xs text-slate-500">
                        Order: {row.item_order ?? 0}
                      </div>
                    </div>

                    <button
                      onClick={() => deleteItem(row.id)}
                      className="text-red-600"
                    >
                      Remove Item
                    </button>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}