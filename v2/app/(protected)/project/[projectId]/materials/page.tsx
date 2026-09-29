"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Boxes,
  PackageCheck,
  Search,
  TriangleAlert,
} from "lucide-react";

import { createSupabaseBrowser } from "@/lib/supabase";

type TowerRow = {
  id: string;
  name: string | null;
  line: string | null;
  extra_data?: Record<string, unknown> | null;
};

type EventItem = {
  id: string;
  issue_key?: string | null;
  source_issue_key?: string | null;
  item_reference?: string | null;
  item_description?: string | null;
  bolt_size?: string | null;
  bundle_no?: string | null;
  bundle_section?: string | null;
  quantity?: number | null;
  unit?: string | null;
};

type MaterialEvent = {
  id: string;
  tower_id: string;
  docket_id?: string | null;
  event_type: string;
  occurred_at?: string | null;
  work_outcome?: string | null;
  affected_activity?: string | null;
  affected_section?: string | null;
  current_effect?: string | null;
  notes?: string | null;
  items: EventItem[];
};

type Transfer = {
  id: string;
  transfer_no?: number | null;
  source_tower_id: string;
  destination_tower_id: string;
  bundle_no?: string | null;
  bundle_section?: string | null;
  quantity?: number | null;
  status?: string | null;
  transferred_at?: string | null;
  received_at?: string | null;
};

type MissingIssue = {
  key: string;
  towerId: string;
  item: EventItem;
  event: MaterialEvent;
  originalQty: number;
  deliveredQty: number;
  remainingQty: number;
  status: "open" | "partial" | "resolved";
};

type Tab = "overview" | "outstanding" | "transfers" | "events";

function safe(value: unknown) {
  return value == null ? "" : String(value);
}

function towerLabel(tower: TowerRow | undefined) {
  if (!tower) return "Unknown tower";
  const extra = tower.extra_data || {};
  return (
    safe(extra["Tower Number"]) ||
    safe(extra["tower_number"]) ||
    safe(extra["Structure Number"]) ||
    safe(extra["structure_number"]) ||
    safe(tower.name) ||
    "Unnamed tower"
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function itemLabel(item: EventItem) {
  return (
    item.item_reference ||
    item.bolt_size ||
    item.bundle_no ||
    item.item_description ||
    "Unlisted material"
  );
}

function eventLabel(value: string) {
  const labels: Record<string, string> = {
    missing: "Missing",
    found_received: "Found / Received",
    taken_from_another_tower: "Taken from another tower",
    sent_to_another_tower: "Sent to another tower",
    excess: "Excess",
    damaged_incorrect: "Damaged / Incorrect",
  };
  return labels[value] || value.replaceAll("_", " ");
}

export default function ProjectMaterialsControlCentrePage() {
  const params = useParams();
  const projectId = String(params.projectId || "");
  const supabase = useMemo(() => createSupabaseBrowser(), []);

  const [towers, setTowers] = useState<TowerRow[]>([]);
  const [events, setEvents] = useState<MaterialEvent[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tab, setTab] = useState<Tab>("overview");
  const [towerId, setTowerId] = useState("");
  const [eventType, setEventType] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      const towerRes = await supabase
        .from("towers")
        .select("id,name,line,extra_data")
        .eq("project_id", projectId);

      if (cancelled) return;

      if (towerRes.error) {
        setError(towerRes.error.message);
        setLoading(false);
        return;
      }

      const loadedTowers = (towerRes.data || []) as TowerRow[];
      const ids = loadedTowers.map((tower) => tower.id);

      if (ids.length === 0) {
        setTowers([]);
        setEvents([]);
        setTransfers([]);
        setLoading(false);
        return;
      }

      const [eventRes, transferRes] = await Promise.all([
        supabase
          .from("tower_material_events")
          .select(`
            id,
            tower_id,
            docket_id,
            event_type,
            occurred_at,
            work_outcome,
            affected_activity,
            affected_section,
            current_effect,
            notes,
            items:tower_material_event_items(
              id,
              issue_key,
              source_issue_key,
              item_reference,
              item_description,
              bolt_size,
              bundle_no,
              bundle_section,
              quantity,
              unit
            )
          `)
          .in("tower_id", ids)
          .order("occurred_at", { ascending: false }),
        supabase
          .from("tower_material_transfers")
          .select("*")
          .eq("project_id", projectId)
          .order("transferred_at", { ascending: false }),
      ]);

      if (cancelled) return;

      if (eventRes.error || transferRes.error) {
        setError(
          eventRes.error?.message ||
            transferRes.error?.message ||
            "Materials Control could not be loaded.",
        );
      }

      setTowers(
        loadedTowers.sort((a, b) =>
          towerLabel(a).localeCompare(towerLabel(b), undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        ),
      );
      setEvents(
        ((eventRes.data || []) as unknown as MaterialEvent[]).map((event) => ({
          ...event,
          items: event.items || [],
        })),
      );
      setTransfers((transferRes.data || []) as Transfer[]);
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId, supabase]);

  const towerById = useMemo(
    () => new Map(towers.map((tower) => [tower.id, tower])),
    [towers],
  );

  const missingIssues = useMemo<MissingIssue[]>(() => {
    const receipts = new Map<string, number>();

    events
      .filter((event) => event.event_type === "found_received")
      .forEach((event) => {
        event.items.forEach((item) => {
          const sourceKey = safe(item.source_issue_key);
          if (!sourceKey) return;
          receipts.set(
            sourceKey,
            (receipts.get(sourceKey) || 0) +
              Math.max(Number(item.quantity || 0), 0),
          );
        });
      });

    const rows: MissingIssue[] = [];

    events
      .filter((event) => event.event_type === "missing")
      .forEach((event) => {
        event.items.forEach((item) => {
          const key = safe(item.issue_key) || `legacy:${item.id}`;
          const originalQty = Math.max(Number(item.quantity || 1), 0);
          const deliveredQty = Math.max(receipts.get(key) || 0, 0);
          const remainingQty = Math.max(originalQty - deliveredQty, 0);
          rows.push({
            key,
            towerId: event.tower_id,
            item,
            event,
            originalQty,
            deliveredQty,
            remainingQty,
            status:
              remainingQty <= 0
                ? "resolved"
                : deliveredQty > 0
                  ? "partial"
                  : "open",
          });
        });
      });

    return rows.sort((a, b) => {
      const order = { open: 0, partial: 1, resolved: 2 };
      if (order[a.status] !== order[b.status]) {
        return order[a.status] - order[b.status];
      }
      return safe(b.event.occurred_at).localeCompare(
        safe(a.event.occurred_at),
      );
    });
  }, [events]);

  const q = search.trim().toLowerCase();

  const filteredEvents = events.filter((event) => {
    if (towerId && event.tower_id !== towerId) return false;
    if (eventType && event.event_type !== eventType) return false;
    if (!q) return true;

    return [
      towerLabel(towerById.get(event.tower_id)),
      event.event_type,
      event.affected_activity,
      event.affected_section,
      event.current_effect,
      event.notes,
      ...event.items.flatMap((item) => [
        item.item_reference,
        item.item_description,
        item.bolt_size,
        item.bundle_no,
        item.bundle_section,
      ]),
    ]
      .map(safe)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const filteredMissing = missingIssues.filter((issue) => {
    if (towerId && issue.towerId !== towerId) return false;
    if (!q) return true;
    return [
      towerLabel(towerById.get(issue.towerId)),
      itemLabel(issue.item),
      issue.item.item_description,
      issue.item.bundle_section,
    ]
      .map(safe)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const filteredTransfers = transfers.filter((transfer) => {
    if (
      towerId &&
      transfer.source_tower_id !== towerId &&
      transfer.destination_tower_id !== towerId
    ) {
      return false;
    }
    if (!q) return true;
    return [
      towerLabel(towerById.get(transfer.source_tower_id)),
      towerLabel(towerById.get(transfer.destination_tower_id)),
      transfer.bundle_no,
      transfer.bundle_section,
      transfer.status,
      transfer.transfer_no,
    ]
      .map(safe)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const openMissing = missingIssues.filter((row) => row.status === "open").length;
  const partialMissing = missingIssues.filter(
    (row) => row.status === "partial",
  ).length;
  const outstandingQty = missingIssues.reduce(
    (sum, row) => sum + row.remainingQty,
    0,
  );
  const inTransit = transfers.filter(
    (transfer) => transfer.status === "in_transit",
  ).length;
  const damaged = events.filter(
    (event) => event.event_type === "damaged_incorrect",
  ).length;
  const excess = events.filter((event) => event.event_type === "excess").length;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
          Project Operations
        </div>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">
          Materials Control Centre
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Project-wide view of material issues, receipts, transfers and
          outstanding shortages. Tower pages remain the detailed operational
          register.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Open missing" value={openMissing} tone="red" />
        <Metric label="Partial" value={partialMissing} tone="amber" />
        <Metric label="Outstanding qty" value={outstandingQty} />
        <Metric label="Transfers in transit" value={inTransit} tone="blue" />
        <Metric label="Damaged / incorrect" value={damaged} tone="purple" />
        <Metric label="Excess events" value={excess} tone="green" />
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Tower">
            <select
              value={towerId}
              onChange={(event) => setTowerId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">All towers</option>
              {towers.map((tower) => (
                <option key={tower.id} value={tower.id}>
                  {towerLabel(tower)}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Event type">
            <select
              value={eventType}
              onChange={(event) => setEventType(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">All event types</option>
              {Array.from(new Set(events.map((event) => event.event_type)))
                .sort()
                .map((value) => (
                  <option key={value} value={value}>
                    {eventLabel(value)}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Search">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-3 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Member, bundle, tower..."
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
          </Field>
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <TabButton
          active={tab === "overview"}
          onClick={() => setTab("overview")}
          icon={Boxes}
          label="Overview"
        />
        <TabButton
          active={tab === "outstanding"}
          onClick={() => setTab("outstanding")}
          icon={TriangleAlert}
          label="Outstanding"
        />
        <TabButton
          active={tab === "transfers"}
          onClick={() => setTab("transfers")}
          icon={ArrowRightLeft}
          label="Transfers"
        />
        <TabButton
          active={tab === "events"}
          onClick={() => setTab("events")}
          icon={PackageCheck}
          label="All Events"
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
          Loading Materials Control…
        </div>
      ) : tab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel title="Outstanding missing material">
            <MissingRows
              rows={filteredMissing.filter((row) => row.status !== "resolved").slice(0, 8)}
              towerById={towerById}
              projectId={projectId}
            />
          </Panel>
          <Panel title="Recent material events">
            <EventRows
              rows={filteredEvents.slice(0, 8)}
              towerById={towerById}
              projectId={projectId}
            />
          </Panel>
        </div>
      ) : tab === "outstanding" ? (
        <Panel title="Missing material lifecycle">
          <MissingRows
            rows={filteredMissing}
            towerById={towerById}
            projectId={projectId}
          />
        </Panel>
      ) : tab === "transfers" ? (
        <Panel title="Bundle transfers">
          {filteredTransfers.length === 0 ? (
            <Empty text="No transfers match the current filters." />
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredTransfers.map((transfer) => (
                <div
                  key={transfer.id}
                  className="grid gap-2 py-4 md:grid-cols-[1fr_auto_1fr_120px_120px] md:items-center"
                >
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-slate-400">
                      From
                    </div>
                    <div className="font-black text-slate-900">
                      {towerLabel(towerById.get(transfer.source_tower_id))}
                    </div>
                  </div>
                  <ArrowRightLeft size={16} className="text-slate-400" />
                  <div>
                    <div className="text-xs font-black uppercase tracking-wide text-slate-400">
                      To
                    </div>
                    <div className="font-black text-slate-900">
                      {towerLabel(towerById.get(transfer.destination_tower_id))}
                    </div>
                  </div>
                  <div className="text-sm">
                    <div className="font-bold">{transfer.bundle_no || "Bundle"}</div>
                    <div className="text-xs text-slate-500">
                      {transfer.quantity || 0} · {transfer.status || "—"}
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {formatDateTime(transfer.received_at || transfer.transferred_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : (
        <Panel title="Material events">
          <EventRows
            rows={filteredEvents}
            towerById={towerById}
            projectId={projectId}
          />
        </Panel>
      )}
    </div>
  );
}

function MissingRows({
  rows,
  towerById,
  projectId,
}: {
  rows: MissingIssue[];
  towerById: Map<string, TowerRow>;
  projectId: string;
}) {
  if (rows.length === 0) {
    return <Empty text="No missing material records match the current filters." />;
  }

  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid gap-3 py-4 md:grid-cols-[minmax(180px,1fr)_minmax(220px,2fr)_120px_130px]"
        >
          <div>
            <Link
              href={`/project/${projectId}/tower/${row.towerId}/materials`}
              className="font-black text-blue-600 hover:underline"
            >
              {towerLabel(towerById.get(row.towerId))}
            </Link>
            <div className="mt-1 text-xs text-slate-500">
              {formatDateTime(row.event.occurred_at)}
            </div>
          </div>
          <div>
            <div className="font-bold text-slate-900">{itemLabel(row.item)}</div>
            <div className="mt-1 text-xs text-slate-500">
              {[row.item.bundle_no, row.item.bundle_section, row.item.item_description]
                .filter(Boolean)
                .join(" · ") || "No additional detail"}
            </div>
          </div>
          <div className="text-sm">
            <div className="font-black text-slate-900">
              {row.remainingQty} {row.item.unit || "ea"}
            </div>
            <div className="text-xs text-slate-500">
              of {row.originalQty} outstanding
            </div>
          </div>
          <div>
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${
                row.status === "resolved"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : row.status === "partial"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {row.status === "resolved"
                ? "Resolved"
                : row.status === "partial"
                  ? "Partially delivered"
                  : "Open"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function EventRows({
  rows,
  towerById,
  projectId,
}: {
  rows: MaterialEvent[];
  towerById: Map<string, TowerRow>;
  projectId: string;
}) {
  if (rows.length === 0) {
    return <Empty text="No material events match the current filters." />;
  }

  return (
    <div className="divide-y divide-slate-100">
      {rows.map((event) => (
        <div key={event.id} className="grid gap-3 py-4 md:grid-cols-[170px_150px_1fr_150px]">
          <div>
            <Link
              href={`/project/${projectId}/tower/${event.tower_id}/materials`}
              className="font-black text-blue-600 hover:underline"
            >
              {towerLabel(towerById.get(event.tower_id))}
            </Link>
            <div className="mt-1 text-xs text-slate-500">
              {formatDateTime(event.occurred_at)}
            </div>
          </div>
          <div>
            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-700">
              {eventLabel(event.event_type)}
            </span>
          </div>
          <div>
            <div className="font-bold text-slate-900">
              {event.items.length > 0
                ? event.items.map(itemLabel).join(", ")
                : "No item attached"}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {[event.affected_activity, event.affected_section, event.current_effect]
                .filter(Boolean)
                .join(" · ") || event.notes || "No additional detail"}
            </div>
          </div>
          <div className="text-xs text-slate-500">
            {event.work_outcome
              ? event.work_outcome.replaceAll("_", " ")
              : "No work impact recorded"}
          </div>
        </div>
      ))}
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4 font-black text-slate-950">
        {title}
      </div>
      <div className="px-5">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-8 text-sm text-slate-500">{text}</div>;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function Metric({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: number;
  tone?: "slate" | "red" | "amber" | "blue" | "purple" | "green";
}) {
  const classes = {
    slate: "border-slate-200 bg-white text-slate-950",
    red: "border-red-200 bg-red-50 text-red-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    purple: "border-purple-200 bg-purple-50 text-purple-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${classes}`}>
      <div className="text-xs font-black uppercase tracking-wide opacity-60">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black">{value}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Boxes;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-black ${
        active
          ? "bg-slate-950 text-white"
          : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}
