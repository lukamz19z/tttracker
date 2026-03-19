"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase";

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
  assembly_percent: number | null;
  erection_percent: number | null;
  weather_delay_hours: number | null;
  lightning_delay_hours: number | null;
  toolbox_delay_hours: number | null;
  other_delay_hours: number | null;
  missing_items_bolts: string | null;
  signed_date: string | null;
};

type Delivery = {
  id: string;
  delivery_date: string | null;
  delivered_by: string | null;
  bundle_numbers: string | null;
  missing_steel: string | null;
  comments: string | null;
  docket_url: string | null;
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

    setTower((towerRes.data as Tower) || null);
    setDockets((docketRes.data as Docket[]) || []);
    setDeliveries((deliveryRes.data as Delivery[]) || []);
    setModifications((modificationRes.data as Modification[]) || []);
    setDefects((defectRes.data as Defect[]) || []);
    setPhotos((photoRes.data as Photo[]) || []);
    setLoading(false);
  }

  const latestDocket = useMemo(() => dockets[0] || null, [dockets]);

  if (loading) {
    return <div className="p-8">Loading tower...</div>;
  }

  if (!tower) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-2">Tower not found</h1>
        <Link href={`/project/${projectId}/towers`} className="text-blue-600">
          Back to Towers
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 w-full space-y-6">
      <div className="bg-white border rounded-2xl p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-sm text-slate-500 mb-1">Tower</div>
            <h1 className="text-3xl font-bold">{tower.name}</h1>
            <div className="mt-2 text-slate-600">
              Line: {tower.line || "-"}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="bg-slate-100 rounded-xl px-4 py-3 min-w-36">
              <div className="text-xs text-slate-500">Status</div>
              <div className="font-semibold">{tower.status || "Not Started"}</div>
            </div>
            <div className="bg-slate-100 rounded-xl px-4 py-3 min-w-36">
              <div className="text-xs text-slate-500">Progress</div>
              <div className="font-semibold">{tower.progress || 0}%</div>
            </div>
            <div className="bg-slate-100 rounded-xl px-4 py-3 min-w-44">
              <div className="text-xs text-slate-500">Last Docket</div>
              <div className="font-semibold">
                {latestDocket?.docket_date || "-"}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={`/project/${projectId}/tower/${towerId}/dockets/new`}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            Add Daily Docket
          </Link>
          <button
            onClick={() => setActiveTab("Workpack")}
            className="bg-slate-900 text-white px-4 py-2 rounded-lg"
          >
            Open Workpack
          </button>
          <button
            onClick={() => setActiveTab("Photos")}
            className="border px-4 py-2 rounded-lg"
          >
            Upload Photo Later
          </button>
        </div>
      </div>

      <div className="border-b">
        <div className="flex gap-2 flex-wrap">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-t-lg border border-b-0 ${
                activeTab === tab
                  ? "bg-white font-semibold"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border rounded-2xl p-6">
        {activeTab === "Overview" && (
          <OverviewTab tower={tower} latestDocket={latestDocket} />
        )}

        {activeTab === "Workpack" && <WorkpackTab />}

        {activeTab === "Daily Dockets" && (
          <DailyDocketsTab
            projectId={projectId}
            towerId={towerId}
            dockets={dockets}
          />
        )}

        {activeTab === "Deliveries" && (
          <DeliveriesTab
            projectId={projectId}
            towerId={towerId}
            deliveries={deliveries}
          />
        )}

        {activeTab === "Modifications" && (
          <ModificationsTab modifications={modifications} />
        )}

        {activeTab === "Defects" && <DefectsTab defects={defects} />}

        {activeTab === "Photos" && <PhotosTab photos={photos} />}
      </div>
    </div>
  );
}

function OverviewTab({
  tower,
  latestDocket,
}: {
  tower: Tower;
  latestDocket: Docket | null;
}) {
  const extraEntries = Object.entries(tower.extra_data || {});

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">Overview</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <InfoCard label="Tower Name" value={tower.name} />
          <InfoCard label="Line" value={tower.line || "-"} />
          <InfoCard label="Latitude" value={tower.latitude?.toString() || "-"} />
          <InfoCard label="Longitude" value={tower.longitude?.toString() || "-"} />
          <InfoCard label="Status" value={tower.status || "Not Started"} />
          <InfoCard label="Progress" value={`${tower.progress || 0}%`} />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Latest Daily Docket Snapshot</h3>
        <div className="grid md:grid-cols-3 gap-4">
          <InfoCard
            label="Assembly %"
            value={`${latestDocket?.assembly_percent || 0}%`}
          />
          <InfoCard
            label="Erection %"
            value={`${latestDocket?.erection_percent || 0}%`}
          />
          <InfoCard
            label="Leading Hand"
            value={latestDocket?.leading_hand || "-"}
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-3">Imported Tower Metadata</h3>
        {extraEntries.length === 0 ? (
          <div className="text-slate-500">No extra imported fields.</div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {extraEntries.map(([key, value]) => (
              <InfoCard key={key} label={prettyLabel(key)} value={String(value)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkpackTab() {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Workpack</h2>
      <p className="text-slate-600">
        This is where the ITC checklist workflow will live. For now, the page is
        reserved and ready for the adaptable project-based workpack structure.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        <PlaceholderCard title="Pre-Assembly Checks" />
        <PlaceholderCard title="Assembly & Erection Checks" />
        <PlaceholderCard title="Final Sign-Off" />
        <PlaceholderCard title="Attached Workpack Files" />
      </div>
    </div>
  );
}

function DailyDocketsTab({
  projectId,
  towerId,
  dockets,
}: {
  projectId: string;
  towerId: string;
  dockets: Docket[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Daily Dockets</h2>
        <Link
          href={`/project/${projectId}/tower/${towerId}/dockets/new`}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          Add Daily Docket
        </Link>
      </div>

      {dockets.length === 0 ? (
        <div className="border rounded-xl p-8 text-center text-slate-500">
          No daily dockets recorded yet.
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Crew</th>
                <th className="p-3">Assembly %</th>
                <th className="p-3">Erection %</th>
                <th className="p-3">Weather Delay</th>
                <th className="p-3">Missing Steel</th>
                <th className="p-3">Signed By</th>
              </tr>
            </thead>
            <tbody>
              {dockets.map((docket) => (
                <tr key={docket.id} className="border-t">
                  <td className="p-3">{docket.docket_date || "-"}</td>
                  <td className="p-3">{docket.crew || "-"}</td>
                  <td className="p-3">{docket.assembly_percent || 0}%</td>
                  <td className="p-3">{docket.erection_percent || 0}%</td>
                  <td className="p-3">{docket.weather_delay_hours || 0}h</td>
                  <td className="p-3">{docket.missing_items_bolts || "-"}</td>
                  <td className="p-3">{docket.leading_hand || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DeliveriesTab({
  projectId,
  towerId,
  deliveries,
}: {
  projectId: string;
  towerId: string;
  deliveries: Delivery[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Deliveries</h2>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg">
          Add Delivery Later
        </button>
      </div>

      {deliveries.length === 0 ? (
        <div className="border rounded-xl p-8 text-center text-slate-500">
          No deliveries recorded yet.
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-100 text-left">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Delivered By</th>
                <th className="p-3">Bundle Numbers</th>
                <th className="p-3">Missing Steel</th>
                <th className="p-3">Comments</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id} className="border-t">
                  <td className="p-3">{delivery.delivery_date || "-"}</td>
                  <td className="p-3">{delivery.delivered_by || "-"}</td>
                  <td className="p-3">{delivery.bundle_numbers || "-"}</td>
                  <td className="p-3">{delivery.missing_steel || "-"}</td>
                  <td className="p-3">{delivery.comments || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ModificationsTab({ modifications }: { modifications: Modification[] }) {
  return modifications.length === 0 ? (
    <EmptySection title="Modifications" message="No modifications recorded yet." />
  ) : (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Modifications</h2>
      {modifications.map((item) => (
        <div key={item.id} className="border rounded-xl p-4">
          <div className="font-medium">{item.description || "-"}</div>
          <div className="text-sm text-slate-500 mt-1">{item.created_at}</div>
        </div>
      ))}
    </div>
  );
}

function DefectsTab({ defects }: { defects: Defect[] }) {
  return defects.length === 0 ? (
    <EmptySection title="Defects" message="No defects recorded yet." />
  ) : (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Defects</h2>
      {defects.map((item) => (
        <div key={item.id} className="border rounded-xl p-4">
          <div className="font-medium">{item.defect || "-"}</div>
          <div className="text-sm text-slate-500 mt-1">
            Status: {item.status || "Open"}
          </div>
        </div>
      ))}
    </div>
  );
}

function PhotosTab({ photos }: { photos: Photo[] }) {
  return photos.length === 0 ? (
    <EmptySection title="Photos" message="No photos uploaded yet." />
  ) : (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Photos</h2>
      <div className="grid md:grid-cols-3 gap-4">
        {photos.map((photo) => (
          <div key={photo.id} className="border rounded-xl p-3">
            {photo.file_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo.file_url}
                alt={photo.caption || "Tower photo"}
                className="w-full h-48 object-cover rounded-lg"
              />
            ) : (
              <div className="h-48 bg-slate-100 rounded-lg" />
            )}
            <div className="mt-2 text-sm">{photo.caption || "-"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-xl p-4 bg-slate-50">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold mt-1">{value}</div>
    </div>
  );
}

function PlaceholderCard({ title }: { title: string }) {
  return (
    <div className="border rounded-xl p-4 bg-slate-50">
      <div className="font-semibold">{title}</div>
      <div className="text-sm text-slate-500 mt-2">
        Reserved for the adaptable ITC workflow.
      </div>
    </div>
  );
}

function EmptySection({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="border rounded-xl p-8 text-center text-slate-500">
        {message}
      </div>
    </div>
  );
}

function prettyLabel(label: string) {
  return label
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}