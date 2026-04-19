"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

    loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!towerId) return;

    let cancelled = false;

    async function run() {
      setLoading(true);

      const [towerRes, docketsRes, liftRes] = await Promise.all([
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
      ]);

      if (cancelled) return;

      setTower((towerRes.data as Tower | null) ?? null);

      const docketRows =
        (docketsRes.data as { docket_date: string | null }[] | null) ?? [];
      setLatestDate(docketRows.length > 0 ? docketRows[0].docket_date : null);

      const liftRows = (liftRes.data as LiftStudy[] | null) ?? [];
      setLiftStudy(liftRows.length > 0 ? liftRows[0] : null);

      setLoading(false);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [towerId, supabase, reloadKey]);

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

    setSaving(true);

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

      setFile(null);
      setReloadKey((v) => v + 1);
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error ? error.message : "Failed to save lift study"
      );
    } finally {
      setSaving(false);
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
        await supabase.storage.from("lift_studies").remove([liftStudy.file_url]);
      }

      const { error } = await supabase
        .from("tower_lift_studies")
        .delete()
        .eq("id", liftStudy.id);

      if (error) {
        throw new Error(error.message || "Failed to delete lift study");
      }

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

  if (loading || !tower) {
    return <div className="p-8">Loading...</div>;
  }

  const attachmentHref = getAttachmentHref(supabase, liftStudy?.file_url ?? null);

  return (
    <div className="p-8 space-y-6">
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
          href={`/project/${projectId}/tower/${towerId}/workpack/documents`}
        >
          Documents
        </Link>
      </div>

      <div className="bg-white border rounded-2xl p-6 space-y-6">
        <div>
          <div className="text-2xl font-bold">Lift Study</div>
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
            disabled={saving}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl disabled:opacity-60"
          >
            {saving
              ? "Saving..."
              : liftStudy
              ? "Replace Lift Study"
              : "Upload Lift Study"}
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-6">
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