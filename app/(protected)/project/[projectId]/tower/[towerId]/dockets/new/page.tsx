"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

/* ================= TYPES ================= */

type Tower = {
  id: string;
  name: string;
  line?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: string | null;
  progress?: number | null;
  extra_data?: Record<string, any> | null;
};

type Docket = {
  id: string;
  docket_date: string;
  crew: string | null;
  leading_hand: string | null;
  weather_delay_hours: number | null;
  lightning_delay_hours: number | null;
  toolbox_delay_hours: number | null;
  comments: string | null;
  docket_file_url: string | null;
};

type Delivery = {
  id: string;
  delivery_date: string | null;
  delivered_by: string | null;
  bundle_numbers: string | null;
  missing_steel: string | null;
  comments: string | null;
};

type Modification = {
  id: string;
  description: string | null;
  created_at: string;
};

type Defect = {
  id: string;
  defect: string | null;
  status: string | null;
  created_at: string;
};

type Photo = {
  id: string;
  file_url: string | null;
  caption: string | null;
  created_at: string;
};

const TABS = [
  "Overview",
  "Workpack",
  "Daily Dockets",
  "Deliveries",
  "Modifications",
  "Defects",
  "Photos",
] as const;

type TabName = (typeof TABS)[number];

/* ================= PAGE ================= */

export default function TowerDetailPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const towerId = params.towerId as string;

  const [activeTab, setActiveTab] = useState<TabName>("Overview");
  const [tower, setTower] = useState<Tower | null>(null);
  const [dockets, setDockets] = useState<Docket[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [modifications, setModifications] = useState<Modification[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId || !towerId) return;
    loadData();
  }, [projectId, towerId]);

  async function loadData() {
    setLoading(true);
    const supabase = createSupabaseBrowser();

    const [
      towerRes,
      docketRes,
      deliveryRes,
      modificationRes,
      defectRes,
      photoRes,
    ] = await Promise.all([
      supabase.from("towers").select("*").eq("id", towerId).single(),
      supabase
        .from("tower_daily_dockets")
        .select("*")
        .eq("tower_id", towerId)
        .order("docket_date", { ascending: false }),
      supabase
        .from("tower_deliveries")
        .select("*")
        .eq("tower_id", towerId)
        .order("delivery_date", { ascending: false }),
      supabase
        .from("tower_modifications")
        .select("*")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("tower_defects")
        .select("*")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false }),
      supabase
        .from("tower_photos")
        .select("*")
        .eq("tower_id", towerId)
        .order("created_at", { ascending: false }),
    ]);

    if (towerRes.error) console.error(towerRes.error);
    if (docketRes.error) console.error(docketRes.error);
    if (deliveryRes.error) console.error(deliveryRes.error);
    if (modificationRes.error) console.error(modificationRes.error);
    if (defectRes.error) console.error(defectRes.error);
    if (photoRes.error) console.error(photoRes.error);

    setTower(towerRes.data);
    setDockets(docketRes.data || []);
    setDeliveries(deliveryRes.data || []);
    setModifications(modificationRes.data || []);
    setDefects(defectRes.data || []);
    setPhotos(photoRes.data || []);
    setLoading(false);
  }

  const latestDocket = useMemo(() => dockets[0] || null, [dockets]);

  if (loading) return <div className="p-8">Loading tower...</div>;

  if (!tower)
    return (
      <div className="p-8">
        Tower not found
        <Link href={`/project/${projectId}/towers`} className="text-blue-600">
          Back
        </Link>
      </div>
    );

  return (
    <div className="p-8 space-y-6">

      {/* HEADER */}
      <div className="bg-white border rounded-2xl p-6 flex justify-between">
        <div>
          <div className="text-sm text-slate-500">Tower</div>
          <h1 className="text-3xl font-bold">{tower.name}</h1>
          <div className="text-slate-600 mt-1">Line: {tower.line || "-"}</div>
        </div>

        <div className="flex gap-4">
          <InfoCard label="Status" value={tower.status || "Not Started"} />
          <InfoCard label="Progress" value={`${tower.progress || 0}%`} />
          <InfoCard
            label="Last Docket"
            value={latestDocket?.docket_date || "-"}
          />
        </div>
      </div>

      {/* ACTIONS */}
      <div className="flex gap-3">
        <Link
          href={`/project/${projectId}/tower/${towerId}/dockets/new`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          Add Daily Docket
        </Link>
      </div>

      {/* TABS */}
      <div className="border-b flex gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-t-lg border border-b-0 ${
              activeTab === t
                ? "bg-white font-semibold"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      <div className="bg-white border rounded-2xl p-6">

        {activeTab === "Overview" && (
          <OverviewTab tower={tower} latestDocket={latestDocket} />
        )}

        {activeTab === "Daily Dockets" && (
          <DailyDocketsTab
            projectId={projectId}
            towerId={towerId}
            dockets={dockets}
          />
        )}

        {activeTab === "Deliveries" && (
          <DeliveriesTab deliveries={deliveries} />
        )}

        {activeTab === "Modifications" && (
          <ModificationsTab modifications={modifications} />
        )}

        {activeTab === "Defects" && <DefectsTab defects={defects} />}

        {activeTab === "Photos" && <PhotosTab photos={photos} />}

        {activeTab === "Workpack" && (
          <div>Workpack ITC system coming next.</div>
        )}
      </div>
    </div>
  );
}

/* ================= TABS ================= */

function OverviewTab({
  tower,
  latestDocket,
}: {
  tower: Tower;
  latestDocket: Docket | null;
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Overview</h2>

      <div className="grid md:grid-cols-2 gap-4">
        <InfoCard label="Latitude" value={tower.latitude?.toString() || "-"} />
        <InfoCard label="Longitude" value={tower.longitude?.toString() || "-"} />
      </div>

      <div>
        <h3 className="font-semibold mb-2">Latest Docket</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <InfoCard
            label="Leading Hand"
            value={latestDocket?.leading_hand || "-"}
          />
          <InfoCard
            label="Weather Delay"
            value={`${latestDocket?.weather_delay_hours || 0}h`}
          />
          <InfoCard label="Crew" value={latestDocket?.crew || "-"} />
        </div>
      </div>
    </div>
  );
}

function DailyDocketsTab({
  projectId,
  towerId,
  dockets,
}: any) {
  return (
    <div className="space-y-4">
      <Link
        href={`/project/${projectId}/tower/${towerId}/dockets/new`}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg"
      >
        Add Daily Docket
      </Link>

      <table className="w-full border rounded-xl overflow-hidden">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-3">Date</th>
            <th className="p-3">Crew</th>
            <th className="p-3">Leading Hand</th>
            <th className="p-3">Weather Delay</th>
          </tr>
        </thead>

        <tbody>
          {dockets.map((d: Docket) => (
            <tr key={d.id} className="border-t">
              <td className="p-3">{d.docket_date}</td>
              <td className="p-3">{d.crew || "-"}</td>
              <td className="p-3">{d.leading_hand || "-"}</td>
              <td className="p-3">{d.weather_delay_hours || 0}h</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeliveriesTab({ deliveries }: any) {
  return <div>{deliveries.length} deliveries recorded</div>;
}

function ModificationsTab({ modifications }: any) {
  return <div>{modifications.length} modifications</div>;
}

function DefectsTab({ defects }: any) {
  return <div>{defects.length} defects</div>;
}

function PhotosTab({ photos }: any) {
  return <div>{photos.length} photos</div>;
}

function InfoCard({ label, value }: any) {
  return (
    <div className="bg-slate-100 rounded-xl p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}