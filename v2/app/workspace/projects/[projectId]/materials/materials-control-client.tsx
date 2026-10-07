"use client";
import { useMaterialsNotice, type SetMaterialsMessage } from "@/components/materials/materials-notice";

import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Database,
  FileDiff,
  ListChecks,
  MapPin,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";

import { MaterialPicker } from "@/components/materials/material-picker";
import { MaterialsSearch, ChoicePicker, LocalDateTime, VehiclePicker, type VehicleValue } from "@/components/materials/workflow-controls";
import ui from "@/components/materials/materials-ui.module.css";
import { deliveryBlockedReasons, materialIssueMetadata, eventFormFields, traceabilityEventPayload } from "@/lib/materials/ui-workflows";
import { deliveryCandidates, bundleContextLabel } from "@/lib/materials/delivery-planning";
import { Card, tt } from "@/components/ui/tt-ui";
import type {
  MaterialAmendment,
  MaterialBundle,
  MaterialIssue,
  MaterialItem,
  MaterialMovement,
  MaterialReservation,
  MaterialsControlPayload,
  ReconciliationFinding,
} from "@/lib/materials/types";

type Tab = "overview" | "bundle-status" | "search" | "bundles" | "members" | "fasteners" | "deliveries" | "issues" | "movements" | "reservations" | "amendments" | "reconciliation";
type SearchMode = "members" | "bundles" | "fasteners" | "bolts" | "packers";
type SearchResult = { previousOffset?: number | null; nextOffset?: number | null; items: MaterialItem[]; bundles: Array<MaterialBundle & { members?: MaterialItem[] }> };

type IssueDraft = {
  materialItemId?: string;
  bundleId?: string;
  drawing?: string;
  profile?: string;
  materialKind?: string;
  bundleReference?: string;
  expectedQuantity?: number | null;
  raisedAt?: string;
  notes?: string;
  issueTypeKey: string;
  towerId: string;
  itemReference: string;
  description: string;
  quantity: string;
  unit: string;
  docketId: string;
  affectedWork: boolean;
  affectedActivity: string;
  affectedSegment: string;
  currentEffect: string;
};

type IssueEventDraft = {
  eventTypeKey: string;
  quantity: string;
  sourceTypeKey: string;
  sourceTowerId: string;
  sourceLocationId: string;
  destinationTowerId: string;
  destinationLocationId: string;
  docketId: string;
  reference: string;
  notes: string;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString("en-AU", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function optionLabel(initial: MaterialsControlPayload, group: string, key?: string | null) {
  if (!key) return "—";
  return initial.options.find((option) => option.option_group === group && option.option_key === key)?.label ?? key.replaceAll("_", " ");
}

function optionsFor(initial: MaterialsControlPayload, group: string) {
  return initial.options.filter((option) => option.option_group === group);
}

function normalize(value?: string | null) {
  return String(value ?? "").trim().toUpperCase();
}

function towerLabel(map: Map<string, string>, id?: string | null) {
  if (!id) return "—";
  return map.get(id) ?? "Tower";
}

function bundleCheckCategory(bundle: MaterialBundle): "arrived" | "not_delivered" | "not_checked" {
  const required = Math.max(Number(bundle.required_quantity ?? 0), 1);
  const received = Math.max(Number(bundle.check?.quantity_received ?? 0), 0);
  const status = String(bundle.check?.status ?? "not_checked").trim().toLowerCase();

  if (["arrived", "full", "complete", "completed"].includes(status) || received >= required) {
    return "arrived";
  }

  if (["not_delivered", "missing"].includes(status)) {
    return "not_delivered";
  }

  return "not_checked";
}

function bundleStatusLabel(category: ReturnType<typeof bundleCheckCategory>) {
  if (category === "arrived") return "Arrived";
  if (category === "not_delivered") return "Not Delivered";
  return "Not checked";
}

function normaliseMaterialsPayload(initial: MaterialsControlPayload): MaterialsControlPayload {
  const source = (initial ?? {}) as Partial<MaterialsControlPayload>;

  const safeArray = <T,>(value: T[] | null | undefined): T[] =>
    Array.isArray(value) ? value.filter(Boolean) : [];

  const metrics = source.metrics ?? ({} as MaterialsControlPayload["metrics"]);

  return {
    ...(source as MaterialsControlPayload),
    projectId: String(source.projectId ?? ""),
    organisationId: String(source.organisationId ?? ""),
    towers: safeArray(source.towers).filter((row) => Boolean(row?.id)),
    bundles: safeArray(source.bundles).filter((row) => Boolean(row?.id)),
    issues: safeArray(source.issues).filter((row) => Boolean(row?.id)),
    movements: safeArray(source.movements).filter((row) => Boolean(row?.id)),
    deliveries: safeArray(source.deliveries)
      .filter((row) => Boolean(row?.id))
      .map((row) => ({
        ...row,
        items: safeArray(row.items).filter((item) => Boolean(item?.id)),
      })),
    locations: safeArray(source.locations).filter((row) => Boolean(row?.id)),
    reservations: safeArray(source.reservations).filter((row) => Boolean(row?.id)),
    amendments: safeArray(source.amendments).filter((row) => Boolean(row?.id)),
    findings: safeArray(source.findings).filter((row) => Boolean(row?.id)),
    dockets: safeArray(source.dockets).filter((row) => Boolean(row?.id)),
    options: safeArray(source.options).filter((row) => Boolean(row?.id)),
    settings: {
      deliveriesEnabled: source.settings?.deliveriesEnabled !== false,
    },
    metrics: {
      bundleCount: Number(metrics.bundleCount ?? 0),
      checkedBundles: Number(metrics.checkedBundles ?? 0),
      memberCount: Number(metrics.memberCount ?? 0),
      boltCount: Number(metrics.boltCount ?? 0),
      packerCount: Number(metrics.packerCount ?? 0),
      openMissing: Number(metrics.openMissing ?? 0),
      openExcess: Number(metrics.openExcess ?? 0),
      outstandingMissingQty: Number(metrics.outstandingMissingQty ?? 0),
      inTransit: Number(metrics.inTransit ?? 0),
      deliveryItemsDelivered: Number(metrics.deliveryItemsDelivered ?? 0),
      awaitingSiteVerification: Number(metrics.awaitingSiteVerification ?? 0),
      activeReservations: Number(metrics.activeReservations ?? 0),
      openReconciliation: Number(metrics.openReconciliation ?? 0),
    },
  };
}


export default function MaterialsControlClient({ initial }: { initial: MaterialsControlPayload }) {
  const [data, setData] = useState<MaterialsControlPayload>(() => normaliseMaterialsPayload(initial));
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [towerFilter, setTowerFilter] = useState("");
  const {message,kind:messageKind,setMessage}=useMaterialsNotice(`${tab}:${towerFilter}`);
  function changeTab(next:Tab){setMessage(null);setTab(next);}
  const [query, setQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("members");
  const [results, setResults] = useState<SearchResult>({ items: [], bundles: [] });
  const [expandedBundle, setExpandedBundle] = useState<string | null>(null);
  const [bundleMembers, setBundleMembers] = useState<Record<string, MaterialItem[]>>({});
  useEffect(() => { setResults({ items: [], bundles: [] }); }, [towerFilter]);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [showReservationForm, setShowReservationForm] = useState(false);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [showAmendmentForm, setShowAmendmentForm] = useState(false);

  const towerMap = useMemo(() => new Map(data.towers.filter(Boolean).map((tower) => [tower.id, tower.tower_identifier])), [data.towers]);
  const locationMap = useMemo(() => new Map(data.locations.filter(Boolean).map((location) => [location.id, location.name])), [data.locations]);
  const docketMap = useMemo(() => new Map(data.dockets.filter(Boolean).map((docket) => [docket.id, docket])), [data.dockets]);

  const arrivedBundleCount = useMemo(
    () => data.bundles.filter((bundle) => bundleCheckCategory(bundle) === "arrived").length,
    [data.bundles],
  );

  const filteredBundles = useMemo(() => data.bundles.filter((bundle) => !towerFilter || bundle.tower_id === towerFilter), [data.bundles, towerFilter]);
  const filteredIssues = useMemo(() => data.issues.filter((issue) => !towerFilter || issue.tower_id === towerFilter || issue.current_tower_id === towerFilter), [data.issues, towerFilter]);
  const filteredMovements = useMemo(() => data.movements.filter((movement) => !towerFilter || movement.source_tower_id === towerFilter || movement.destination_tower_id === towerFilter), [data.movements, towerFilter]);
  const filteredReservations = useMemo(() => data.reservations.filter((reservation) => !towerFilter || reservation.source_tower_id === towerFilter || reservation.destination_tower_id === towerFilter), [data.reservations, towerFilter]);

  async function refresh() {
    setBundleMembers({});
    setExpandedBundle(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${data.projectId}/materials/control?organisation=${encodeURIComponent(data.organisationId)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Materials could not be refreshed.");
      const next = normaliseMaterialsPayload(payload as MaterialsControlPayload);
      setData(next);
      if (!next.settings.deliveriesEnabled && tab === "deliveries") {
        changeTab("overview");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Materials could not be refreshed.");
    } finally {
      setBusy(false);
    }
  }

  async function runSearch(mode: SearchMode = searchMode, searchText = query, towerId = towerFilter, offset = 0) {
    setBusy(true);
    try {
      const params = new URLSearchParams({ organisation: data.organisationId, mode, q: searchText.trim(), offset: String(offset) });
      if (towerId) params.set("towerId", towerId);
      const response = await fetch(`/api/projects/${data.projectId}/materials/search?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Search failed.");
      setResults(payload);
      return payload as SearchResult;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Search failed.");
      return { items: [], bundles: [] };
    } finally {
      setBusy(false);
    }
  }

  async function openBundle(bundle: MaterialBundle, forceOpen = false) {
    const next = forceOpen ? bundle.id : expandedBundle === bundle.id ? null : bundle.id;
    setExpandedBundle(next);
    if (!next || bundleMembers[bundle.id]) return;
    setBusy(true);
    try {
      const members: MaterialItem[] = [];
      let offset: number | null = 0;
      do {
        const params = new URLSearchParams({ organisation: data.organisationId, bundleId: bundle.id, mode: "members", offset: String(offset) });
        if (bundle.tower_id) params.set("towerId", bundle.tower_id);
        const response = await fetch(`/api/projects/${data.projectId}/materials/search?${params}`);
        const payload: SearchResult & { error?: string } = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Bundle contents could not be loaded.");
        members.push(...payload.items);
        offset = payload.nextOffset ?? null;
      } while (offset !== null);
      setBundleMembers((previous) => ({ ...previous, [bundle.id]: members }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bundle contents could not be loaded.");
    } finally { setBusy(false); }
  }

  async function saveBundleCheck(bundle: MaterialBundle, status: string, quantityReceived: number) {
    setMessage(null);
    if (!data.permissions.check_bundles) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${data.projectId}/materials/bundle-checks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId: data.organisationId,
          bundleId: bundle.id,
          towerId: bundle.tower_id,
          status,
          quantityReceived,
          deliveryItemId:
            data.deliveries
              .flatMap((delivery) => delivery.items)
              .filter((item) => item.bundle_id === bundle.id && item.status === "delivered")
              .sort((a, b) => String(b.driver_checked_at ?? "").localeCompare(String(a.driver_checked_at ?? "")))[0]?.id ?? null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Bundle check could not be saved.");
      await refresh();
      setExpandedBundle(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bundle check could not be saved.");
      setBusy(false);
    }
  }

  async function saveMemberCheck(item: MaterialItem, status: string) {
    setMessage(null);
    if (!data.permissions.check_bundles) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${data.projectId}/materials/member-checks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId: data.organisationId, materialItemId: item.id, status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Member check could not be saved.");
      const result = await runSearch("members", item.item_reference, item.tower_id ?? "");
      const updated = result.items.find((candidate) => candidate.id === item.id);
      if (updated && item.bundle_id) setBundleMembers((previous) => ({ ...previous, [item.bundle_id!]: (previous[item.bundle_id!] ?? []).map((candidate) => candidate.id === item.id ? updated : candidate) }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Member check could not be saved.");
      setBusy(false);
    }
  }

  async function runReconciliation() {
    setMessage(null);
    if (!data.permissions.import) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${data.projectId}/materials/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId: data.organisationId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Reconciliation failed.");
      await refresh();
      changeTab("reconciliation");
      setMessage(`${payload.findingCount} reconciliation finding(s) created.`,"success",`reconciliation:${towerFilter}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reconciliation failed.");
      setBusy(false);
    }
  }

  const tabGroups: Array<{
    label: string;
    tabs: Array<[Tab, string, React.ReactNode]>;
  }> = [
    {
      label: "Registers",
      tabs: [
        ["overview", "Overview", <Boxes size={13} key="i" />],
        ["bundle-status", "Status", <ListChecks size={13} key="i" />],
        ["bundles", "Bundles", <PackageCheck size={13} key="i" />],
        ["members", "Members", <ShieldCheck size={13} key="i" />],
        ["fasteners", "Bolts & Packers", <Wrench size={13} key="i" />],
        ["search", "Search", <Search size={13} key="i" />],
      ],
    },
    {
      label: "Logistics",
      tabs: [
        ...(data.settings.deliveriesEnabled
          ? ([["deliveries", "Deliveries", <Truck size={13} key="i" />]] as Array<[Tab, string, React.ReactNode]>)
          : []),
        ["movements", "Movements", <ArrowRightLeft size={13} key="i" />],
        ["reservations", "Reservations", <ClipboardCheck size={13} key="i" />],
      ],
    },
    {
      label: "Issues & Control",
      tabs: [
        ["issues", "Missing / Excess", <AlertTriangle size={13} key="i" />],
        ["amendments", "Amendments", <FileDiff size={13} key="i" />],
        ["reconciliation", "Reconcile", <Database size={13} key="i" />],
      ],
    },
  ];

  return (
    <div className={tt.stack}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(105px,1fr))",
          gap: 6,
        }}
      >
        <CompactMetric label="Bundles" value={data.metrics.bundleCount} detail={`${arrivedBundleCount} arrived`} />
        <CompactMetric label="Members" value={data.metrics.memberCount} />
        <CompactMetric label="Bolts" value={data.metrics.boltCount} />
        <CompactMetric label="Packers" value={data.metrics.packerCount} />
        <CompactMetric label="Missing" value={data.metrics.openMissing} detail={`${data.metrics.outstandingMissingQty} qty`} />
        <CompactMetric label="Excess" value={data.metrics.openExcess} />
        {data.settings.deliveriesEnabled ? (
          <CompactMetric label="Awaiting site check" value={data.metrics.awaitingSiteVerification} />
        ) : null}
      </div>

      <Card>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              flex: "1 1 760px",
              minWidth: 0,
            }}
          >
            {tabGroups.map((group) => (
              <div key={group.label} style={{ minWidth: 0 }}>
                <div
                  className="tt-label"
                  style={{ marginBottom: 5, fontSize: 10, letterSpacing: ".08em" }}
                >
                  {group.label}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {group.tabs.map(([id, label, icon]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => changeTab(id)}
                      className={`${tt.button} ${tab === id ? tt.buttonPrimary : tt.buttonSecondary}`}
                      style={{ padding: "7px 10px", minHeight: 34, fontSize: 12 }}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 7, alignItems: "flex-end", flex: "0 1 330px" }}>
            <div style={{ flex: 1, minWidth: 210 }}>
              <TowerPicker
                label="Tower"
                value={towerFilter}
                towers={data.towers}
                emptyLabel="All towers"
                onChange={(value) => {
                  setMessage(null);
                  setTowerFilter(value);
                  setResults({ items: [], bundles: [] });
                }}
              />
            </div>
            <button
              className={`${tt.button} ${tt.buttonSecondary}`}
              style={{ padding: "7px 10px", minHeight: 34 }}
              disabled={busy}
              onClick={() => void refresh()}
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </Card>

      {message ? <div role={messageKind==="error"?"alert":"status"} className={`${tt.notice} ${tt.noticeInfo}`}>{message}</div> : null}

      {tab === "overview" ? <Overview data={data} towerMap={towerMap} onIssues={() => changeTab("issues")} onBundles={() => changeTab("bundles")} onBundleStatus={() => changeTab("bundle-status")} onReconcile={() => void runReconciliation()} /> : null}

      {tab === "bundle-status" ? <BundleStatusWorkspace data={data} towerFilter={towerFilter} towerMap={towerMap} onOpenBundles={() => changeTab("bundles")} /> : null}

      {tab === "search" ? <SearchWorkspace data={data} query={query} setQuery={setQuery} mode={searchMode} setMode={setSearchMode} results={results} busy={busy} towerMap={towerMap} onSearch={() => void runSearch()} onMore={() => void runSearch(searchMode, query, towerFilter, results.nextOffset ?? 0)} onPrevious={() => void runSearch(searchMode, query, towerFilter, results.previousOffset ?? 0)} onOpenBundle={(bundle) => { setTowerFilter(bundle.tower_id ?? ""); changeTab("bundles"); void openBundle(bundle, true); }} /> : null}

      {tab === "bundles" ? <BundlesWorkspace canCheck={data.permissions.check_bundles} bundles={filteredBundles} towerMap={towerMap} expandedBundle={expandedBundle} bundleMembers={bundleMembers} busy={busy} onOpen={(bundle) => void openBundle(bundle)} onSaveBundle={(bundle, status, qty) => void saveBundleCheck(bundle, status, qty)} onSaveMember={(item, status) => void saveMemberCheck(item, status)} /> : null}

      {tab === "members" ? <RegisterSearchWorkspace title="Member register" description="Search member marks and immediately see the physical bundle / pack, drawing, profile and tower segment." mode="members" towerId={towerFilter} data={data} towerMap={towerMap} onSearch={runSearch} results={results} setResults={setResults} onMemberCheck={data.permissions.check_bundles ? (item, status) => void saveMemberCheck(item, status) : undefined} /> : null}

      {tab === "fasteners" ? <RegisterSearchWorkspace title="Bolts & Packers" description="Search bolt / packer requirements by drawing, segment, diameter, length, type or mark. Effective redline changes remain separate from the imported base requirement." mode="fasteners" towerId={towerFilter} data={data} towerMap={towerMap} onSearch={runSearch} results={results} setResults={setResults} /> : null}

      {tab === "deliveries" && data.settings.deliveriesEnabled ? <DeliveriesWorkspace data={data} towerFilter={towerFilter} towerMap={towerMap} busy={busy} refresh={refresh} setMessage={setMessage} /> : null}

      {tab === "issues" ? <IssuesWorkspace towerFilter={towerFilter} data={data} issues={filteredIssues} towerMap={towerMap} locationMap={locationMap} docketMap={docketMap} expandedIssue={expandedIssue} setExpandedIssue={setExpandedIssue} showForm={showIssueForm} setShowForm={value=>{setMessage(null);setShowIssueForm(value);}} busy={busy} refresh={refresh} setMessage={setMessage} /> : null}

      {tab === "movements" ? <MovementsWorkspace data={data} movements={filteredMovements} towerMap={towerMap} locationMap={locationMap} showForm={showMovementForm} setShowForm={value=>{setMessage(null);setShowMovementForm(value);}} showLocationForm={showLocationForm} setShowLocationForm={value=>{setMessage(null);setShowLocationForm(value);}} busy={busy} refresh={refresh} setMessage={setMessage} /> : null}

      {tab === "reservations" ? <ReservationsWorkspace data={data} reservations={filteredReservations} towerMap={towerMap} locationMap={locationMap} showForm={showReservationForm} setShowForm={value=>{setMessage(null);setShowReservationForm(value);}} busy={busy} refresh={refresh} setMessage={setMessage} /> : null}

      {tab === "amendments" ? <AmendmentsWorkspace data={data} amendments={data.amendments} towerMap={towerMap} showForm={showAmendmentForm} setShowForm={value=>{setMessage(null);setShowAmendmentForm(value);}} busy={busy} refresh={refresh} setMessage={setMessage} search={runSearch} /> : null}

      {tab === "reconciliation" ? <ReconciliationWorkspace data={data} towerMap={towerMap} busy={busy} run={() => void runReconciliation()} /> : null}
    </div>
  );
}

function Overview({ data, towerMap, onIssues, onBundles, onBundleStatus, onReconcile }: { data: MaterialsControlPayload; towerMap: Map<string, string>; onIssues: () => void; onBundles: () => void; onBundleStatus: () => void; onReconcile: () => void }) {
  const openIssues = data.issues.filter((issue) => issue.status !== "resolved").slice(0, 8);
  const arrivedBundles = data.bundles.filter((bundle) => bundleCheckCategory(bundle) === "arrived").length;
  const checkedBundles = data.bundles.filter((bundle) => bundleCheckCategory(bundle) !== "not_checked").length;

  return (
    <div className={tt.grid2}>
      <Card>
        <h2 className={tt.cardTitle}>Material issue control</h2>
        <p className={tt.cardDescription}>Missing / excess records remain traceable from first raise through transfers, delivery, Daily Docket close-out and resolution.</p>
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          {openIssues.map((issue) => <IssueRow key={issue.id} issue={issue} towerMap={towerMap} />)}
          {openIssues.length === 0 ? <div className={tt.help}>No open material issues.</div> : null}
        </div>
        <button className={`${tt.button} ${tt.buttonSecondary}`} style={{ marginTop: 12 }} onClick={onIssues}>Open Missing / Excess</button>
      </Card>

      <Card>
        <h2 className={tt.cardTitle}>Bundle control status</h2>
        <p className={tt.cardDescription}>See which towers have had every required bundle physically checked and confirmed arrived.</p>
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          <Health label="Arrived bundles" value={`${arrivedBundles}/${data.metrics.bundleCount}`} good={data.metrics.bundleCount > 0 && arrivedBundles === data.metrics.bundleCount} />
          <Health label="Bundles checked" value={`${checkedBundles}/${data.metrics.bundleCount}`} good={data.metrics.bundleCount > 0 && checkedBundles === data.metrics.bundleCount} />
          <Health label="Open reconciliation findings" value={data.metrics.openReconciliation} good={data.metrics.openReconciliation === 0} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className={`${tt.button} ${tt.buttonPrimary}`} onClick={onBundleStatus}><ListChecks size={14} /> Bundle status report</button>
            <button className={`${tt.button} ${tt.buttonSecondary}`} onClick={onBundles}><PackageCheck size={14} /> Bundle check-off</button>
            <button className={`${tt.button} ${tt.buttonSecondary}`} disabled={!data.permissions.import} onClick={onReconcile}><Database size={14} /> Reconcile</button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function BundleStatusWorkspace({
  data,
  towerFilter,
  towerMap,
  onOpenBundles,
}: {
  data: MaterialsControlPayload;
  towerFilter: string;
  towerMap: Map<string, string>;
  onOpenBundles: () => void;
}) {
  const deliveredBundleIds = useMemo(() => {
    const ids = new Set<string>();
    data.deliveries.forEach((delivery) => {
      delivery.items.forEach((item) => {
        if (item.status === "delivered") ids.add(item.bundle_id);
      });
    });
    return ids;
  }, [data.deliveries]);

  const rows = useMemo(() => {
    return data.towers
      .filter((tower) => !towerFilter || tower.id === towerFilter)
      .map((tower) => {
        const bundles = data.bundles.filter((bundle) => bundle.tower_id === tower.id);
        let delivered = 0;
        let arrived = 0;
        let notDelivered = 0;
        let notChecked = 0;
        let lastChecked: string | null = null;

        for (const bundle of bundles) {
          if (deliveredBundleIds.has(bundle.id)) delivered += 1;

          const category = bundleCheckCategory(bundle);
          if (category === "arrived") arrived += 1;
          else if (category === "not_delivered") notDelivered += 1;
          else notChecked += 1;

          const checkedAt = bundle.check?.checked_at ?? null;
          if (checkedAt && (!lastChecked || checkedAt > lastChecked)) lastChecked = checkedAt;
        }

        const total = bundles.length;
        const sitePercent = total > 0 ? Math.round((arrived / total) * 100) : 0;
        const deliveryPercent = total > 0 ? Math.round((delivered / total) * 100) : 0;
        const overall =
          total === 0
            ? "no_data"
            : arrived === total
              ? "complete"
              : notDelivered > 0
                ? "attention"
                : notChecked === total
                  ? "not_started"
                  : "in_progress";

        return {
          tower,
          total,
          delivered,
          arrived,
          notDelivered,
          notChecked,
          sitePercent,
          deliveryPercent,
          overall,
          lastChecked,
        };
      })
      .sort((a, b) =>
        a.tower.tower_identifier.localeCompare(
          b.tower.tower_identifier,
          undefined,
          { numeric: true },
        ),
      );
  }, [data.bundles, data.towers, deliveredBundleIds, towerFilter]);

  const completed = rows.filter((row) => row.overall === "complete").length;
  const attention = rows.filter((row) => row.overall === "attention").length;

  function statusLabel(status: string) {
    if (status === "complete") return "Complete";
    if (status === "attention") return "Not Delivered";
    if (status === "in_progress") return "In progress";
    if (status === "not_started") return "Not checked";
    return "No data";
  }

  return (
    <div className={tt.stack}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 6 }}>
        <CompactMetric label="Towers complete" value={completed} detail="All required bundles arrived" />
        <CompactMetric label="Need attention" value={attention} detail="One or more bundles not delivered" />
      </div>

      <Card padded={false}>
        <div style={{ padding: 12, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
          <div>
            <h2 className={tt.cardTitle}>Bundle status report</h2>
            <p className={tt.cardDescription}>
              Simple tower-by-tower view of what has arrived, what has not been delivered and what still needs checking.
            </p>
          </div>
          <button className={`${tt.button} ${tt.buttonPrimary}`} onClick={onOpenBundles}>
            <PackageCheck size={14} /> Open bundle check-off
          </button>
        </div>

        <div className={tt.tableWrap} style={{ border: 0, borderRadius: 0 }}>
          <table className={tt.table}>
            <thead>
              <tr>
                <th>Tower</th>
                <th>Site status</th>
                <th>Arrived</th>
                <th>Not Delivered</th>
                <th>Not checked</th>
                {data.settings.deliveriesEnabled ? <th>Driver delivered</th> : null}
                <th>Last check</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.tower.id}>
                  <td>
                    <strong>{towerLabel(towerMap, row.tower.id)}</strong>
                    <div className={tt.secondary}>{row.tower.tower_type ?? row.tower.line ?? ""}</div>
                  </td>
                  <td>
                    <strong>{statusLabel(row.overall)}</strong>
                    <div className={tt.secondary}>{row.sitePercent}% complete</div>
                  </td>
                  <td><strong>{row.arrived}/{row.total}</strong></td>
                  <td>{row.notDelivered}</td>
                  <td>{row.notChecked}</td>
                  {data.settings.deliveriesEnabled ? (
                    <td>{row.delivered}/{row.total}<div className={tt.secondary}>{row.deliveryPercent}%</div></td>
                  ) : null}
                  <td>{row.lastChecked ? formatDate(row.lastChecked) : "—"}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={data.settings.deliveriesEnabled ? 7 : 6}>
                    <div className={tt.help}>No towers match the current filter.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SearchWorkspace({ query, setQuery, mode, setMode, results, busy, towerMap, onSearch, onMore, onPrevious, onOpenBundle }: { data: MaterialsControlPayload; query: string; setQuery: (value: string) => void; mode: SearchMode; setMode: (value: SearchMode) => void; results: SearchResult; busy: boolean; towerMap: Map<string, string>; onSearch: () => void; onMore: () => void; onPrevious: () => void; onOpenBundle: (bundle: MaterialBundle) => void }) {
  return <Card><h2 className={tt.cardTitle}>Project material search</h2><p className={tt.cardDescription}>Search members against physical bundles or search bolts / packers against drawing and segment requirements.</p><div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>{(["members", "bundles", "fasteners"] as SearchMode[]).map((id) => <button key={id} className={`${tt.button} ${mode === id ? tt.buttonPrimary : tt.buttonSecondary}`} onClick={() => { setMode(id); }}>{id === "fasteners" ? "Bolts & Packers" : id[0].toUpperCase() + id.slice(1)}</button>)}</div><div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}><MaterialsSearch onClear={()=>setQuery("")} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onSearch(); } }} placeholder="Member, bundle, drawing, segment, diameter, packer mark…" /><button className={`${tt.button} ${tt.buttonPrimary}`} disabled={busy} onClick={onSearch}><Search size={14} /> Search</button></div><div style={{ marginTop: 14, display: "grid", gap: 8 }}>{results.items.map((item) => <MaterialItemRow key={item.id} item={item} towerMap={towerMap} />)}{results.bundles.map((bundle) => <BundleSearchRow key={bundle.id} bundle={bundle} towerMap={towerMap} onOpen={() => onOpenBundle(bundle)} />)}{results.items.length === 0 && results.bundles.length === 0 ? <div className={tt.help}>Search results will appear here.</div> : null}{results.previousOffset != null ? <button className={`${tt.button} ${tt.buttonSecondary}`} disabled={busy} onClick={onPrevious}>Previous</button> : null}{results.nextOffset != null ? <button className={`${tt.button} ${tt.buttonSecondary}`} disabled={busy} onClick={onMore}>Next</button> : null}</div></Card>;
}

function RegisterSearchWorkspace({ title, description, mode, towerId, towerMap, onSearch, results, onMemberCheck }: {
  title: string;
  description: string;
  mode: "members" | "fasteners";
  towerId: string;
  data: MaterialsControlPayload;
  towerMap: Map<string, string>;
  onSearch: (mode: SearchMode, query?: string, towerId?: string, offset?: number) => Promise<SearchResult>;
  results: SearchResult;
  setResults: (results: SearchResult) => void;
  onMemberCheck?: (item: MaterialItem, status: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  async function search() {
    setSearching(true);
    try {
      await onSearch(mode, query, towerId);
    } finally {
      setSearching(false);
    }
  }

  return <Card>
    <h2 className={tt.cardTitle}>{title}</h2>
    <p className={tt.cardDescription}>{description}</p>
    <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
      <MaterialsSearch onClear={()=>setQuery("")} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} placeholder="Member, drawing, segment, diameter, packer mark…" />
      <button className={`${tt.button} ${tt.buttonPrimary}`} disabled={searching} onClick={() => void search()}><Search size={14} /> Search</button>
    </div>
    <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
      {results.items.filter((item) => mode === "members" ? item.material_kind === "member" : ["bolt", "packer"].includes(item.material_kind)).map((item) => <div key={item.id}>
        <MaterialItemRow item={item} towerMap={towerMap} />
        {onMemberCheck ? <details><summary className={tt.secondary} style={{ cursor: "pointer", marginTop: 4 }}>Member details / check-off</summary><div style={{ display: "flex", gap: 5, alignItems: "center", marginTop: 5 }}>

          <button className={`${tt.button} ${tt.buttonSecondary}`} onClick={() => onMemberCheck(item, "arrived")}>Here</button>
          <button className={`${tt.button} ${tt.buttonSecondary}`} onClick={() => onMemberCheck(item, "missing")}>Missing</button>
          <button className={`${tt.button} ${tt.buttonSecondary}`} onClick={() => onMemberCheck(item, "issue")}>Issue</button>
        </div></details> : null}
      </div>)}
      {results.items.length === 0 ? <div className={tt.help}>Search results will appear here.</div> : null}
      {results.previousOffset != null ? <button className={`${tt.button} ${tt.buttonSecondary}`} disabled={searching} onClick={async () => { setSearching(true); try { await onSearch(mode, query, towerId, results.previousOffset ?? 0); } finally { setSearching(false); } }}>Previous</button> : null}
      {results.nextOffset != null ? <button className={`${tt.button} ${tt.buttonSecondary}`} disabled={searching} onClick={async () => { setSearching(true); try { await onSearch(mode, query, towerId, results.nextOffset ?? 0); } finally { setSearching(false); } }}>Next</button> : null}
    </div>
  </Card>;
}

function BundlesWorkspace({
  canCheck,
  bundles,
  towerMap,
  expandedBundle,
  bundleMembers,
  busy,
  onOpen,
  onSaveBundle,
}: {
  canCheck: boolean;
  bundles: MaterialBundle[];
  towerMap: Map<string, string>;
  expandedBundle: string | null;
  bundleMembers: Record<string, MaterialItem[]>;
  busy: boolean;
  onOpen: (bundle: MaterialBundle) => void;
  onSaveBundle: (bundle: MaterialBundle, status: string, qty: number) => void;
  onSaveMember: (item: MaterialItem, status: string) => void;
}) {
  const [outstandingOpen,setOutstandingOpen]=useState(true);
  const [arrivedOpen, setArrivedOpen] = useState(false);
  const [bundleQuery, setBundleQuery] = useState("");
  const matching = bundles.filter((bundle) => [bundle.bundle_reference,bundle.segment,bundle.package_context].filter(Boolean).join(" ").toLowerCase().includes(bundleQuery.toLowerCase()));
  const outstanding = bundles.filter((bundle) => bundleCheckCategory(bundle) !== "arrived");
  const arrived = bundles.filter((bundle) => bundleCheckCategory(bundle) === "arrived");
  const renderRows = (rows: MaterialBundle[]) => rows.map((bundle) => {
          const required = Math.max(Number(bundle.required_quantity ?? 1), 1);
          const category = bundleCheckCategory(bundle);
          const open = expandedBundle === bundle.id;
          const members = bundleMembers[bundle.id] ?? [];
          const checked = category !== "not_checked";

          return (
            <div
              key={bundle.id}
              className={tt.card}
              style={{
                padding: checked && !open ? "8px 10px" : 11,
                borderColor:
                  category === "arrived"
                    ? "rgba(52,211,153,.28)"
                    : category === "not_delivered"
                      ? "rgba(251,113,133,.28)"
                      : undefined,
              }}
            >
              <div className={ui.bundleRow}>
                <button
                  type="button"
                  onClick={() => onOpen(bundle)}
                  style={{
                    border: 0,
                    padding: 0,
                    background: "transparent",
                    color: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                    minWidth: 0,
                  }}
                >
                  <div className={ui.bundleInfo}><strong>{bundle.bundle_reference}</strong>
                  <div className={`${tt.secondary} ${ui.bundleContext}`}>
                    Members {bundle.member_count ?? 0} · {towerLabel(towerMap, bundle.tower_id)} · {[bundle.package_context, bundle.segment].filter(Boolean).join(" / ") || "No context"}
                  </div></div>
                </button>

                <div>
                  <strong>{bundleStatusLabel(category)}</strong>
                  {category === "arrived" ? (
                    <div className={tt.secondary}>{required}/{required} confirmed</div>
                  ) : category === "not_delivered" ? (
                    <div className={tt.secondary}>0/{required} on site</div>
                  ) : (
                    <div className={tt.secondary}>Awaiting check</div>
                  )}
                </div>

                <div className={ui.bundleActions}>
                  {category !== "arrived" ? (
                    <>
                      <button
                        disabled={busy || !canCheck}
                        className={`${tt.button} ${tt.buttonPrimary}`}
                        onClick={() => onSaveBundle(bundle, "arrived", required)}
                      >
                        Arrived
                      </button>
                      <button
                        disabled={busy || !canCheck}
                        className={`${tt.button} ${tt.buttonSecondary}`}
                        onClick={() => onSaveBundle(bundle, "not_delivered", 0)}
                      >
                        Not Delivered
                      </button>
                      <button
                        disabled={busy || !canCheck}
                        className={`${tt.button} ${tt.buttonSecondary}`}
                        onClick={() => onSaveBundle(bundle, "not_checked", 0)}
                      >
                        Clear
                      </button>
                    </>
                  ) : null}

                  {category === "arrived" && open && canCheck ? <button disabled={busy} className={`${tt.button} ${tt.buttonSecondary}`} onClick={() => onSaveBundle(bundle, "not_checked", 0)}>Clear</button> : null}
                  <button
                    className={`${tt.button} ${tt.buttonSecondary}`}
                    onClick={() => onOpen(bundle)}
                  >
                    {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {open ? "Close" : checked ? "Details" : "Open pack"}
                  </button>
                </div>
              </div>

              {open ? (
                <div style={{ marginTop: 10, borderTop: "1px solid rgba(148,163,184,.22)", paddingTop: 10 }}>
                  {!bundleMembers[bundle.id] ? <div className={tt.help}>{busy ? "Loading pack contents..." : "Contents could not be loaded. Reopen this pack to retry."}</div> : members.length === 0 ? (
                    <div className={tt.help}>
                      No resolved member assignments. Pending or ambiguous packing hints are listed in Materials Control reconciliation.
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 6 }}>
                      <PackContents members={members} />
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        });
  return <Card>
    <h2 className={tt.cardTitle}>Bundle check-off</h2>
    <p className={tt.cardDescription}>Independent site verification / {bundles.length} expected / {outstanding.length} outstanding / {arrived.length} arrived</p>
    <MaterialsSearch value={bundleQuery} onChange={event=>setBundleQuery(event.target.value)} onClear={()=>setBundleQuery("")} placeholder="Search bundle or section..." style={{marginTop:8}} />
    <details open={outstandingOpen} onToggle={event=>setOutstandingOpen(event.currentTarget.open)} style={{marginTop:12}}><summary className={ui.summary}><strong>Outstanding bundles</strong><span className={tt.secondary}>{outstanding.length} / {bundles.length}</span><span style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5}}>{outstandingOpen?<ChevronUp size={16}/>:<ChevronDown size={16}/>}{outstandingOpen?"Hide":"Show"}</span></summary><div className={tt.secondary}>{outstanding.length} remaining for site verification</div>
      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>{renderRows(outstanding.filter(bundle=>matching.includes(bundle)))}</div>
      {outstanding.length === 0 ? <p className={tt.help}>{bundles.length ? "All bundles are site verified." : "No bundle manifest has been imported for this tower."}</p> : null}
    </details>
    <details open={arrivedOpen} onToggle={event=>setArrivedOpen(event.currentTarget.open)} style={{ marginTop: 8 }}><summary className={ui.summary}><CheckCircle2 size={16} aria-hidden="true" /><strong>Arrived bundles</strong><span className={tt.secondary}>{arrived.length} / {bundles.length}</span><span style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:5}}>{arrivedOpen?<ChevronUp size={16}/>:<ChevronDown size={16}/>}{arrivedOpen?"Hide":"Show"}</span></summary><div style={{display:"grid",gap:6}}>{renderRows(arrived.filter(bundle=>matching.includes(bundle)))}</div></details>
  </Card>;
}

function DeliveriesWorkspace({
  data,
  towerFilter,
  towerMap,
  busy,
  refresh,
  setMessage,
}: {
  data: MaterialsControlPayload;
  towerFilter: string;
  towerMap: Map<string, string>;
  busy: boolean;
  refresh: () => Promise<void>;
  setMessage: SetMaterialsMessage;
}) {
  const [showForm, setShowForm] = useState(false);
  const [createKind, setCreateKind] = useState<"schedule"|"docket">("schedule");
  const [showActual, setShowActual] = useState(false);
  const [actualId, setActualId] = useState("");
  const actionLocks=useRef(new Set<string>());
  const [actionPending,setActionPending]=useState(false);
  const [correction,setCorrection]=useState<{itemId:string;status:string;reason:string}|null>(null);
  const [registerView, setRegisterView] = useState<"scheduled"|"dockets">("scheduled");
  const [expandedDeliveryId, setExpandedDeliveryId] = useState<string | null>(null);
  const [towerId, setTowerId] = useState(towerFilter);
  const [selectedBundles, setSelectedBundles] = useState<string[]>([]);
  const [bundleQuery, setBundleQuery] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState<"remaining" | "planned" | "delivered">("remaining");
  const [creating, setCreating] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [vehicle, setVehicle] = useState<VehicleValue>({assetId:null,rego:"",description:""});
  const [supplierReference, setSupplierReference] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [notes, setNotes] = useState("");
  const [bulkConfirmation,setBulkConfirmation]=useState<{deliveryId:string;status:"delivered"|"rejected"}|null>(null);

  useEffect(() => {
    setTowerId(towerFilter);
    setSelectedBundles([]);
    setBundleQuery("");
    setDeliveryFilter("remaining");
  }, [towerFilter]);

  const candidates = deliveryCandidates(data.bundles, towerId, data.deliveries);
  const eligibleIds = new Set(candidates.filter((candidate) => candidate.eligible).map((candidate) => candidate.bundle.id));
  const selectedEligible = selectedBundles.filter((id) => eligibleIds.has(id));
  const blockedReasons=deliveryBlockedReasons({busy,creating,canManage:data.permissions.manage_deliveries,towerId,selectedCount:selectedEligible.length,scheduling:createKind==="schedule",scheduledFor});
  const bundlesForTower = candidates.filter((candidate) => candidate.state === deliveryFilter && (!bundleQuery.trim() ||
    [candidate.bundle.bundle_reference, candidate.bundle.segment, candidate.bundle.package_context].filter(Boolean).join(" ").toLowerCase().includes(bundleQuery.trim().toLowerCase())));

  const filteredDeliveries = data.deliveries.filter((delivery) => {
    const inScope=!towerFilter || delivery.items.some((item)=>item.tower_id===towerFilter);
    return inScope && (registerView === "scheduled" ? delivery.status === "planned" : delivery.status !== "planned");
  });

  const bundleMap = new Map(data.bundles.map((bundle) => [bundle.id, bundle]));

  async function createDelivery() {
    setMessage(null);
    if(blockedReasons.length)return;
    setCreating(true);
    try {
      const response = await fetch(`/api/projects/${data.projectId}/materials/deliveries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: createKind === "schedule" ? "create" : "create_docket",
          organisationId: data.organisationId,
          towerId,
          bundleIds: selectedEligible,
          driverName,
          vehicleReference: [vehicle.rego,vehicle.description].filter(Boolean).join(" / "),
          supplierReference,
          scheduledFor: createKind === "schedule" ? scheduledFor || null : null,
          notes,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Delivery could not be created.");
      setMessage(`${payload.delivery.delivery_number} ${createKind==="schedule"?"scheduled":"created"}.`,"success");
      setShowForm(false);
      setRegisterView(createKind==="schedule"?"scheduled":"dockets");
      if(createKind === "docket") {setActualId(payload.delivery.id);setShowActual(true);}
      setSelectedBundles([]);
      setBundleQuery("");
      setDriverName("");
      setVehicle({assetId:null,rego:"",description:""});
      setSupplierReference("");
      setScheduledFor("");
      setNotes("");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delivery could not be created.");
    } finally { setCreating(false); }
  }

  async function deliveryAction(body: Record<string, unknown>) {
    setMessage(null);
    const key=String(body.deliveryItemId??body.deliveryId);
    if(actionLocks.current.has(key))return;
    actionLocks.current.add(key);setActionPending(true);
    try {
      const response = await fetch(`/api/projects/${data.projectId}/materials/deliveries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisationId: data.organisationId, ...body }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Delivery could not be updated.");
      await refresh();
      setCorrection(null);
      setBulkConfirmation(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delivery could not be updated.");
    } finally {actionLocks.current.delete(key);setActionPending(actionLocks.current.size>0);}
  }

  function renderConfirmation(delivery: MaterialsControlPayload["deliveries"][number]) {
    const completed=["delivered","delivered_with_issues"].includes(delivery.status);
    const actioned=delivery.items.filter(item=>item.status!=="planned").length;
    const delivered=delivery.items.filter(item=>item.status==="delivered").length;
    const pendingCount=delivery.items.filter(item=>item.status==="planned").length;
    const rows=delivery.items.map(item=>{
        const bundle=bundleMap.get(item.bundle_id);const pending=item.status==="planned";
        const confirm=(status:string)=>void deliveryAction({action:"driver_check",deliveryId:delivery.id,deliveryItemId:item.id,status,deliveredQuantity:status==="delivered"?Number(item.expected_quantity):0});
        return <div key={item.id}><div className={ui.bundleRow} style={{padding:"8px 0",borderBottom:"1px solid rgba(148,163,184,.18)"}}><div><strong>{bundle?.bundle_reference??"Bundle"}</strong><span className={tt.secondary}> / {bundle?bundleContextLabel(bundle):""}</span><div className={tt.secondary}>{pending?"Pending":item.status==="rejected"?"Not Delivered":item.status==="short"?"Part delivered":"Delivered"}{item.driver_checked_at?` / ${formatDateTime(item.driver_checked_at)} / Confirmed by ${item.driver_checked_by_name??"TTTracker user"}`:""}</div></div><span className={tt.secondary}>Site verification: {bundle?bundleStatusLabel(bundleCheckCategory(bundle)):"Not checked"}</span><div className={ui.bundleActions}>
        {pending&&!completed&&delivery.status!=="planned"?<><button className={`${tt.button} ${tt.buttonPrimary}`} disabled={busy||actionPending||!data.permissions.manage_deliveries} onClick={()=>confirm("delivered")}>Delivered</button><button className={`${tt.button} ${tt.buttonSecondary}`} disabled={busy||actionPending||!data.permissions.manage_deliveries} onClick={()=>confirm("rejected")}>Not Delivered</button></>:null}
        {!pending&&data.permissions.manage_deliveries?<button className={`${tt.button} ${tt.buttonSecondary}`} disabled={actionPending} onClick={()=>{setMessage(null);setCorrection({itemId:item.id,status:"planned",reason:""});}}>Correct outcome / Reopen</button>:null}</div></div>
        {correction?.itemId===item.id?<div style={{display:"flex",gap:8,alignItems:"end",flexWrap:"wrap",padding:"8px 0"}}><Select label="Correct outcome" value={correction.status} onChange={status=>setCorrection({...correction,status})}><option value="planned">Reopen as pending</option><option value="delivered">Delivered</option><option value="rejected">Not Delivered</option></Select><Field label="Reason (required)" value={correction.reason} onChange={reason=>setCorrection({...correction,reason})}/><button disabled={actionPending||!correction.reason.trim()} onClick={()=>void deliveryAction({action:"correct_outcome",deliveryId:delivery.id,deliveryItemId:item.id,status:correction.status,expectedStatus:item.status,reason:correction.reason,deliveredQuantity:correction.status==="delivered"?Number(item.expected_quantity):0})}>Save correction</button><button onClick={()=>setCorrection(null)}>Cancel</button></div>:null}
        </div>;
      });
    return <div style={{display:"grid",gap:6,marginTop:8}}>
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}><strong>{delivery.delivery_number} / {completed?"COMPLETED":delivery.status==="planned"?"SCHEDULED":"IN PROGRESS"}</strong><span>{actioned} / {delivery.items.length} bundles actioned / {delivered} delivered / {delivery.items.filter(item=>item.status==="rejected").length} not delivered</span>{completed?<span className={tt.secondary}>Completed {formatDateTime(delivery.completed_at??delivery.delivered_at)} by {delivery.completed_by_name??"Historical actor not recorded"}</span>:null}
      {delivery.status==="planned"?<button className={`${tt.button} ${tt.buttonPrimary}`} disabled={actionPending||!data.permissions.manage_deliveries} onClick={()=>void deliveryAction({action:"start",deliveryId:delivery.id})}>Begin actual delivery</button>:null}</div>
      {!completed&&delivery.status==="in_transit"&&pendingCount>0&&data.permissions.manage_deliveries?<div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}><span className={tt.secondary}>{actioned} actioned / {pendingCount} remaining</span><button className={`${tt.button} ${tt.buttonPrimary}`} disabled={busy||actionPending} onClick={()=>{setMessage(null);setBulkConfirmation({deliveryId:delivery.id,status:"delivered"});}}>Mark all {pendingCount} remaining as Delivered</button><details><summary>More bulk actions</summary><button disabled={busy||actionPending} onClick={()=>{setMessage(null);setBulkConfirmation({deliveryId:delivery.id,status:"rejected"});}}>Mark all remaining as Not Delivered</button></details></div>:null}
      {!completed&&bulkConfirmation?.deliveryId===delivery.id?<div role="alertdialog" aria-label="Confirm bulk delivery outcome" style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",padding:"8px 0"}}><div><strong>Mark all {pendingCount} remaining bundles as {bulkConfirmation.status==="delivered"?"Delivered":"Not Delivered"}?</strong><div className={tt.secondary}>This records the delivery outcome for each pending bundle. Existing outcomes remain unchanged.</div></div><button disabled={actionPending} onClick={()=>setBulkConfirmation(null)}>Cancel</button><button className={`${tt.button} ${tt.buttonPrimary}`} disabled={busy||actionPending||pendingCount===0} onClick={()=>void deliveryAction({action:"bulk_driver_check",deliveryId:delivery.id,status:bulkConfirmation.status})}>{actionPending?"Recording...":"Confirm"}</button></div>:null}
      {completed?<details><summary>View details / Correct outcomes</summary>{rows}</details>:rows}

    </div>;
  }
  function deliveredBy(delivery: MaterialsControlPayload["deliveries"][number]) {
    if(delivery.completed_by_name)return delivery.completed_by_name;
    const names = Array.from(
      new Set(
        delivery.items
          .map((item) => item.driver_checked_by_name)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (names.length) return names.join(", ");
    return delivery.driver_name ?? "—";
  }

  function destinationTower(delivery: MaterialsControlPayload["deliveries"][number]) {
    const destinationId = delivery.items.find((item) => item.tower_id)?.tower_id;
    return destinationId ? towerLabel(towerMap, destinationId) : "—";
  }

  return (
    <div className={tt.stack}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}>
          <div>
            <h2 className={tt.cardTitle}>Delivery Management</h2>
            <p className={tt.cardDescription}>
              Plan bundle deliveries, let the delivery user confirm what reached site, then keep the Leading Hand / Supervisor bundle check independent.
            </p>
          </div>
          <div role="group" aria-label="Delivery workflow" style={{display:"flex",gap:8,flexWrap:"wrap"}}><button aria-pressed={showForm&&createKind==="schedule"} className={`${tt.button} ${showForm&&createKind==="schedule"?tt.buttonPrimary:tt.buttonSecondary}`} disabled={!data.permissions.manage_deliveries} onClick={()=>{setMessage(null);setCreateKind("schedule");setShowForm(true);setShowActual(false);setDeliveryFilter("remaining");setRegisterView("scheduled");}}>Plan Delivery</button><button aria-pressed={showActual||(showForm&&createKind==="docket")} className={`${tt.button} ${showActual||(showForm&&createKind==="docket")?tt.buttonPrimary:tt.buttonSecondary}`} disabled={!data.permissions.manage_deliveries} onClick={()=>{setMessage(null);setActualId("");setCorrection(null);setShowActual(true);setShowForm(false);setRegisterView("dockets");}}>Record Delivery Docket</button></div>
        </div>

        {showActual ? <div style={{marginTop:12}}><h3 className={tt.cardTitle}>{data.deliveries.some(d=>d.id===actualId&&["delivered","delivered_with_issues"].includes(d.status))?"Completed delivery docket":"Create Delivery Docket"}</h3><p className={tt.secondary}>Record what actually reached site. Site verification remains independent.</p><div style={{display:data.deliveries.some(d=>d.id===actualId&&["delivered","delivered_with_issues"].includes(d.status))?"none":"flex",gap:8,flexWrap:"wrap",alignItems:"end"}}><div style={{flex:"1 1 300px"}}><ChoicePicker label="Use scheduled delivery" value={actualId} options={data.deliveries.filter(delivery=>["planned","in_transit"].includes(delivery.status) || delivery.id===actualId).map(delivery=>({id:delivery.id,label:`${delivery.delivery_number} / ${destinationTower(delivery)} / ${delivery.vehicle_reference??""}`}))} onChange={value=>{setMessage(null);setActualId(value);}} placeholder="Search scheduled delivery..." /></div><button className={`${tt.button} ${tt.buttonSecondary}`} onClick={()=>{setMessage(null);setActualId("");setCreateKind("docket");setShowForm(true);setShowActual(false);setDeliveryFilter("remaining");setSelectedBundles([]);}}>Create ad-hoc delivery docket</button></div>{data.deliveries.filter(delivery=>delivery.id===actualId).map(delivery=><div key={delivery.id} style={{marginTop:10}}><div className={tt.secondary}>{destinationTower(delivery)} / Planned driver: {delivery.driver_name??"Not recorded"} / Vehicle: {delivery.vehicle_reference??"Not recorded"} / Supplier: {delivery.supplier_reference??"Not recorded"} / Planned: {formatDateTime(delivery.scheduled_for)}</div>{!["delivered","delivered_with_issues"].includes(delivery.status)?<div className={tt.secondary}>Recorded by {data.recordedBy??"signed-in TTTracker user"}</div>:null}{renderConfirmation(delivery)}</div>)}</div> : null}
        {showForm ? (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}><h3 className={tt.cardTitle}>{createKind === "schedule" ? "Plan / Schedule Delivery" : "Create Delivery Docket"}</h3><p className={tt.secondary}>{createKind==="schedule"?"Plan what bundles are expected to arrive and when.":"Record what actually reached site."} Recorded by {data.recordedBy??"signed-in TTTracker user"}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 8 }}>
              <TowerPicker
                label="Destination tower"
                value={towerId}
                towers={data.towers}
                emptyLabel="Select tower"
                onChange={(value) => {
                  setMessage(null);
                  setTowerId(value);
                  setSelectedBundles([]);
                  setBundleQuery("");
                  setDeliveryFilter("remaining");
                }}
              />
              {createKind === "schedule" ? <LocalDateTime required label="Planned date/time (local)" value={scheduledFor} onChange={setScheduledFor} /> : null}
              <Field label={createKind==="schedule"?"Planned driver":"Driver"} value={driverName} onChange={setDriverName} />
              <VehiclePicker value={vehicle} onChange={setVehicle} />
              <Field label="Delivery docket / supplier ref" value={supplierReference} onChange={setSupplierReference} />
              <Field label="Notes" value={notes} onChange={setNotes} />
            </div>

            {towerId ? <div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><h3 className={tt.cardTitle}>{createKind === "schedule" ? "Bundles to schedule" : "Bundles delivered / attempted"}</h3><strong>{selectedEligible.length} selected</strong></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}><MaterialsSearch onClear={()=>setBundleQuery("")} value={bundleQuery} onChange={(event) => setBundleQuery(event.target.value)} placeholder="Search bundle or section..." style={{ flex: "1 1 230px" }} />
                {(["remaining", "planned", "delivered"] as const).map((filter) => <button key={filter} type="button" className={`${tt.button} ${deliveryFilter === filter ? tt.buttonPrimary : tt.buttonSecondary}`} onClick={() => {setMessage(null);setDeliveryFilter(filter);}}>{filter === "planned" ? "Scheduled" : filter[0].toUpperCase() + filter.slice(1)}</button>)}
              </div>
              {candidates.length === 0 ? <p className={tt.help}>No bundle manifest has been imported for this tower. <a href={`/workspace/projects/${data.projectId}/materials/import?organisation=${encodeURIComponent(data.organisationId)}`}>Go to Data &amp; Imports</a></p> : <>
                {deliveryFilter === "remaining" && eligibleIds.size > 0 ? <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0", cursor: "pointer" }}><input type="checkbox" checked={selectedEligible.length === eligibleIds.size} onChange={(event) => setSelectedBundles(event.target.checked ? [...eligibleIds] : [])} />Select all remaining</label> : null}
                <div style={{ marginTop: 6 }}>{bundlesForTower.map(({ bundle, eligible, label }) => <label key={bundle.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "1px solid rgba(148,163,184,.18)", cursor: eligible ? "pointer" : "default", minHeight: 44 }}>
                  <input type="checkbox" disabled={!eligible || creating} checked={selectedEligible.includes(bundle.id)} onChange={(event) => setSelectedBundles((previous) => event.target.checked ? [...new Set([...previous, bundle.id])] : previous.filter((id) => id !== bundle.id))} style={{ width: 18, height: 18, flexShrink: 0 }} />
                  <div style={{ flex: "1 1 auto", minWidth: 0 }}><strong>{bundle.bundle_reference}</strong><div className={tt.secondary}>{bundleContextLabel(bundle)}</div></div><span className={tt.secondary} style={{ maxWidth: "35%" }}>{label}</span>
                </label>)}</div>
                {bundlesForTower.length === 0 ? <p className={tt.help}>{bundleQuery ? "No matching bundles." : candidates.every((candidate) => candidate.state === "delivered") ? "All bundles are accounted for in Delivery Management." : deliveryFilter === "remaining" ? "No bundles available for a new delivery. Review planned or part-delivered bundles." : `No ${deliveryFilter} bundles.`}</p> : null}
              </>}
            </div> : <p className={tt.help}>Select a destination tower to see its bundle manifest.</p>}
            <div style={{ position: "sticky", bottom: 12, zIndex: 10, background: "var(--tt-panel, #0f172a)", border: "1px solid rgba(148,163,184,.22)", borderRadius: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}><div><strong>{selectedEligible.length} bundles selected</strong>{blockedReasons.length?<div id="delivery-blocked" className={tt.secondary} aria-live="polite">{blockedReasons.join(" ")}</div>:null}</div><button className={`${tt.button} ${tt.buttonPrimary}`} aria-describedby={blockedReasons.length?"delivery-blocked":undefined} disabled={blockedReasons.length>0} onClick={() => void createDelivery()}>{creating ? "Saving..." : createKind === "schedule" ? "Save scheduled delivery" : "Create delivery docket"}</button></div>

          </div>
        ) : null}
      </Card>

      <Card padded={false}>
        <div style={{ padding: 12 }}>
          <div style={{display:"flex",gap:8}}><button className={`${tt.button} ${registerView==="scheduled"?tt.buttonPrimary:tt.buttonSecondary}`} onClick={()=>setRegisterView("scheduled")}>Scheduled</button><button className={`${tt.button} ${registerView==="dockets"?tt.buttonPrimary:tt.buttonSecondary}`} onClick={()=>setRegisterView("dockets")}>Delivery dockets</button></div>
          <p className={tt.cardDescription}>
            Shows when the delivery was completed and which signed-in TTTracker user confirmed the bundles.
          </p>
        </div>

        <div className={tt.tableWrap} style={{ border: 0, borderRadius: 0 }}>
          <table className={tt.table}>
            <thead>
              <tr>
                <th>Docket</th>
                <th>Tower</th>
                <th>Status</th>
                <th>Bundles</th>
                <th>Scheduled</th>
                <th>Delivered</th>
                <th>Delivered by</th>
                <th>Planned driver</th>
                <th>Vehicle</th>
                <th>Reference</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredDeliveries.map((delivery) => {
                const deliveredCount = delivery.items.filter((item) => item.status === "delivered").length;
                const isOpen = expandedDeliveryId === delivery.id;

                return (
                  <Fragment key={delivery.id}>
                    <tr>
                      <td><strong>{delivery.delivery_number}</strong></td>
                      <td>{destinationTower(delivery)}</td>
                      <td>{["delivered","delivered_with_issues"].includes(delivery.status)?"COMPLETED":delivery.status==="planned"?"SCHEDULED":delivery.status==="in_transit"?"IN PROGRESS":delivery.status.replaceAll("_"," ")}</td>
                      <td>{delivery.items.filter(item=>item.status!=="planned").length}/{delivery.items.length} actioned / {deliveredCount} delivered</td>
                      <td>{formatDateTime(delivery.scheduled_for)}</td>
                      <td>{formatDateTime(delivery.delivered_at)}</td>
                      <td>{deliveredBy(delivery)}</td>
                    <td>{delivery.driver_name ?? "—"}</td>
                      <td>{delivery.vehicle_reference ?? "—"}</td>
                      <td>{delivery.supplier_reference ?? "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: 5 }}>
                          {delivery.status === "planned" ? (
                            <button
                              className={`${tt.button} ${tt.buttonSecondary}`}
                              disabled={busy || actionPending || !data.permissions.manage_deliveries}
                              onClick={() => void deliveryAction({ action: "start", deliveryId: delivery.id })}
                            >
                              Start
                            </button>
                          ) : null}
                          <button
                            className={`${tt.button} ${tt.buttonSecondary}`}
                            onClick={() => setExpandedDeliveryId(isOpen ? null : delivery.id)}
                          >
                            {isOpen ? "Close" : "View"}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isOpen ? <tr><td colSpan={11}>{renderConfirmation(delivery)}</td></tr> : null}
                  </Fragment>
                );
              })}

              {filteredDeliveries.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <div className={tt.help}>No delivery dockets for the current tower filter.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function IssuesWorkspace({ towerFilter, data, issues, towerMap, locationMap, docketMap, expandedIssue, setExpandedIssue, showForm, setShowForm, busy, refresh, setMessage }: { towerFilter: string; data: MaterialsControlPayload; issues: MaterialIssue[]; towerMap: Map<string, string>; locationMap: Map<string, string>; docketMap: Map<string, MaterialsControlPayload["dockets"][number]>; expandedIssue: string | null; setExpandedIssue: (value: string | null) => void; showForm: boolean; setShowForm: (value: boolean) => void; busy: boolean; refresh: () => Promise<void>; setMessage: SetMaterialsMessage }) {
  const [draft, setDraft] = useState<IssueDraft>({ raisedAt:new Date().toISOString(), issueTypeKey: "missing", towerId: towerFilter, itemReference: "", description: "", quantity: "1", unit: "ea", docketId: "", affectedWork: false, affectedActivity: "", affectedSegment: "", currentEffect: "" });
  useEffect(()=>{setDraft({issueTypeKey:"missing",towerId:towerFilter,itemReference:"",description:"",quantity:"1",unit:"ea",docketId:"",affectedWork:false,affectedActivity:"",affectedSegment:"",currentEffect:"",raisedAt:new Date().toISOString()});},[towerFilter]);
  async function createIssue() { setMessage(null);try { const response = await fetch(`/api/projects/${data.projectId}/materials/issues`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: data.organisationId, ...draft }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Issue could not be created."); setShowForm(false); setDraft({ raisedAt:new Date().toISOString(), issueTypeKey: "missing", towerId: towerFilter, itemReference: "", description: "", quantity: "1", unit: "ea", docketId: "", affectedWork: false, affectedActivity: "", affectedSegment: "", currentEffect: "" }); await refresh(); setMessage(`${payload.issue.issue_number} created.`,"success"); } catch (error) { setMessage(error instanceof Error ? error.message : "Issue could not be created."); } }
  return <div className={tt.stack}><Card><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><div><h2 className={tt.cardTitle}>Missing / excess traceability</h2><p className={tt.cardDescription}>Every issue receives a MAT number and keeps its raise date, Daily Docket, replacement source, movement, receipt and close-out history.</p></div><button className={`${tt.button} ${tt.buttonPrimary}`} disabled={!data.permissions.manage_issues} onClick={() => setShowForm(!showForm)}><Plus size={14} /> New issue</button></div>{showForm ? <div style={{ marginTop: 14 }}><IssueCreateForm data={data} draft={draft} setDraft={setDraft} onSave={() => void createIssue()} busy={busy} /></div> : null}</Card><Card><div style={{ display: "grid", gap: 8 }}>{issues.map((issue) => <div key={issue.id} className={tt.card} style={{ padding: "8px 10px" }}><button type="button" onClick={() => setExpandedIssue(expandedIssue === issue.id ? null : issue.id)} style={{ width: "100%", border: 0, background: "transparent", color: "inherit", textAlign: "left", display: "flex", flexWrap:"wrap", gap: 12, alignItems: "center", cursor: "pointer" }}><strong>{issue.issue_number}</strong><span>{optionLabel(data,"material_issue_type",issue.issue_type_key)}</span><strong>{issue.item_reference??issue.description??"Unlisted material"}</strong><span className={tt.secondary}>{issue.tower_id?towerLabel(towerMap,issue.tower_id):"Needs affected tower assignment"}</span><span>Qty {issue.quantity_affected} {issue.unit}</span><div>{issue.status}</div><span style={{marginLeft:"auto"}}>{expandedIssue===issue.id?"Hide":"Details"}</span>{expandedIssue === issue.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>{expandedIssue === issue.id ? <IssueDetail data={data} issue={issue} towerMap={towerMap} locationMap={locationMap} docketMap={docketMap} refresh={refresh} setMessage={setMessage} /> : null}</div>)}{issues.length === 0 ? <div className={tt.help}>No material issues match the current tower filter.</div> : null}</div></Card></div>;
}

function IssueCreateForm({ data, draft, setDraft, onSave, busy }: { data: MaterialsControlPayload; draft: IssueDraft; setDraft: (value: IssueDraft) => void; onSave: () => void; busy: boolean }) {
  const [manual,setManual]=useState(false);
  const registered=Boolean(draft.materialItemId||draft.bundleId);
  const allowManual=optionsFor(data,"material_issue_type").find(option=>option.option_key===draft.issueTypeKey)?.settings?.allow_manual_material !== false;
  return <div style={{display:"grid",gap:10}}><TowerPicker label="Affected tower (required)" towers={data.towers} value={draft.towerId} emptyLabel="Search/select affected tower" onChange={towerId=>setDraft({...draft,towerId,materialItemId:"",bundleId:"",bundleReference:"",itemReference:"",description:"",affectedSegment:"",drawing:"",profile:"",materialKind:"",expectedQuantity:undefined})}/>{!draft.towerId?<span className={tt.secondary}>Select the affected tower before searching material.</span>:<MaterialPicker key={draft.towerId} projectId={data.projectId} organisationId={data.organisationId} towerId={draft.towerId} onSelect={material=>{setManual(false);setDraft({...draft,...materialIssueMetadata(material)});}} />}
    {registered?<div><strong>{draft.itemReference}</strong><div className={tt.secondary}>{draft.materialKind} / Bundle {draft.bundleReference??"not supplied"} {draft.bundleId?"":"(assignment pending)"} / {draft.affectedSegment} / {draft.drawing} / {draft.profile} / Expected {draft.expectedQuantity??"not supplied"} {draft.unit}</div><button type="button" className={`${tt.button} ${tt.buttonSecondary}`} onClick={()=>setDraft({...draft,materialItemId:"",bundleId:"",itemReference:"",description:"",affectedSegment:"",drawing:"",profile:"",materialKind:""})}>Change material</button></div>:null}
    {allowManual&&!registered?<button type="button" className={`${tt.button} ${tt.buttonSecondary}`} onClick={()=>setManual(!manual)}>Unregistered material / enter manually</button>:null}
    {manual&&allowManual?<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8}}><Field label="Material reference" value={draft.itemReference} onChange={value=>setDraft({...draft,itemReference:value})}/><Field label="Description" value={draft.description} onChange={value=>setDraft({...draft,description:value})}/><Field label="Unit" value={draft.unit} onChange={value=>setDraft({...draft,unit:value})}/></div>:null}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8}}><Select label="Issue type" value={draft.issueTypeKey} onChange={value=>setDraft({...draft,issueTypeKey:value})}>{optionsFor(data,"material_issue_type").map(option=><option key={option.option_key} value={option.option_key}>{option.label}</option>)}</Select><Field label="Qty" type="number" value={draft.quantity} onChange={value=>setDraft({...draft,quantity:value})}/><LocalDateTime label="Date/time (local)" value={draft.raisedAt??""} onChange={value=>setDraft({...draft,raisedAt:value})}/></div>
    <details><summary>Impact, docket and notes (optional)</summary><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8,marginTop:8}}><ChoicePicker label="Daily Docket" value={draft.docketId} options={data.dockets.map(docket=>({id:docket.id,label:`${docket.docket_date} / ${docket.crew_label??"Crew"}`}))} onChange={value=>setDraft({...draft,docketId:value})}/><label><input type="checkbox" checked={draft.affectedWork} onChange={event=>setDraft({...draft,affectedWork:event.target.checked})}/> Affected work</label>{draft.affectedWork?<Field label="Affected activity" value={draft.affectedActivity} onChange={value=>setDraft({...draft,affectedActivity:value})}/>:null}<Field label="Impact" value={draft.currentEffect} onChange={value=>setDraft({...draft,currentEffect:value})}/><Field label="Notes" value={draft.notes??""} onChange={value=>setDraft({...draft,notes:value})}/></div></details>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}><span className={tt.secondary}>Recorded by {data.recordedBy??"signed-in TTTracker user"}</span><button className={`${tt.button} ${tt.buttonPrimary}`} disabled={busy||!data.permissions.manage_issues||!draft.towerId||!draft.raisedAt||(!registered&&(!manual||!allowManual||!draft.itemReference.trim()))||!Number.isFinite(Number(draft.quantity))||Number(draft.quantity)<=0} onClick={onSave}>Create issue</button></div>
  </div>;
}

function IssueDetail({ data, issue, towerMap, locationMap, docketMap, refresh, setMessage }: { data: MaterialsControlPayload; issue: MaterialIssue; towerMap: Map<string, string>; locationMap: Map<string, string>; docketMap: Map<string, MaterialsControlPayload["dockets"][number]>; refresh: () => Promise<void>; setMessage: SetMaterialsMessage }) {
  const [draft, setDraft] = useState<IssueEventDraft>({ eventTypeKey: "note", quantity: "0", sourceTypeKey: "", sourceTowerId: "", sourceLocationId: "", destinationTowerId: issue.current_tower_id ?? issue.tower_id ?? "", destinationLocationId: issue.current_location_id ?? "", docketId: "", reference: "", notes: "" });
  async function addEvent() { try { const response = await fetch(`/api/projects/${data.projectId}/materials/issues/${issue.id}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: data.organisationId, ...traceabilityEventPayload(draft,eventFormFields(optionsFor(data,"material_issue_event_type").find(row=>row.option_key===draft.eventTypeKey)),optionsFor(data,"material_source_type").find(row=>row.option_key===draft.sourceTypeKey)?.settings) }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Issue event could not be saved."); setDraft({ eventTypeKey: "note", quantity: "0", sourceTypeKey: "", sourceTowerId: "", sourceLocationId: "", destinationTowerId: issue.current_tower_id ?? issue.tower_id ?? "", destinationLocationId: issue.current_location_id ?? "", docketId: "", reference: "", notes: "" }); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Issue event could not be saved."); } }
  const remaining = Math.max(Number(issue.quantity_affected) - Number(issue.quantity_resolved), 0);
  return <div style={{ marginTop: 10, borderTop: "1px solid rgba(148,163,184,.25)", paddingTop: 12 }}><div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8 }}><Detail label="Remaining" value={`${remaining} ${issue.unit}`} /><Detail label="Current tower" value={issue.current_tower_id ? towerLabel(towerMap, issue.current_tower_id) : "—"} /><Detail label="Current location" value={issue.current_location_id ? locationMap.get(issue.current_location_id) ?? "—" : "—"} /><Detail label="Raised docket" value={issue.raised_docket_id ? `${docketMap.get(issue.raised_docket_id)?.docket_date ?? "Docket"}` : "Not linked"} /></div><div style={{ marginTop: 12, display: "grid", gap: 7 }}>{(issue.events ?? []).map((event) => <div key={event.id} style={{ display: "grid", gridTemplateColumns: "110px 160px 1fr", gap: 10, padding: 8, borderRadius: 8, border: "1px solid rgba(148,163,184,.16)" }}><div className={tt.secondary}>{formatDate(event.occurred_at)}</div><div><strong>{optionLabel(data, "material_issue_event_type", event.event_type_key)}</strong>{event.quantity ? <div className={tt.secondary}>{event.quantity} {event.unit}</div> : null}</div><div>{event.source_tower_id ? `From ${towerLabel(towerMap, event.source_tower_id)}` : event.source_location_id ? `From ${locationMap.get(event.source_location_id) ?? "location"}` : ""}{event.destination_tower_id ? ` → ${towerLabel(towerMap, event.destination_tower_id)}` : event.destination_location_id ? ` → ${locationMap.get(event.destination_location_id) ?? "location"}` : ""}<div className={tt.secondary}>{event.reference ?? ""}{event.notes ? `${event.reference ? " · " : ""}${event.notes}` : ""}{event.docket_id ? ` · Docket ${docketMap.get(event.docket_id)?.docket_date ?? "linked"}` : ""}</div></div></div>)}</div><TraceabilityEventForm data={data} draft={draft} setDraft={setDraft} onSave={()=>void addEvent()} /></div>;
}



function TraceabilityEventForm({data,draft,setDraft,onSave}:{data:MaterialsControlPayload;draft:IssueEventDraft;setDraft:(draft:IssueEventDraft)=>void;onSave:()=>void}) {
 const option=optionsFor(data,"material_issue_event_type").find(row=>row.option_key===draft.eventTypeKey);
 const fields=eventFormFields(option);
 const usesSource=fields.has("sourceType")||fields.has("sourceTower")||fields.has("sourceLocation");
 const source=optionsFor(data,"material_source_type").find(row=>row.option_key===draft.sourceTypeKey);
 const locationOptions=data.locations.map(row=>({id:row.id,label:row.name}));
 return <div style={{marginTop:12}}><h3 className={tt.cardTitle}>Add traceability event</h3><div className={tt.secondary}>Recorded by {data.recordedBy??"signed-in TTTracker user"}</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8,marginTop:8}}>
 <Select label="Event" value={draft.eventTypeKey} onChange={value=>setDraft({...draft,eventTypeKey:value,sourceTypeKey:"",sourceTowerId:"",sourceLocationId:"",destinationLocationId:"",quantity:"0"})}>{optionsFor(data,"material_issue_event_type").map(row=><option key={row.option_key} value={row.option_key}>{row.label}</option>)}</Select>
 {fields.has("quantity")?<Field label="Qty" type="number" value={draft.quantity} onChange={value=>setDraft({...draft,quantity:value})}/>:null}
 {fields.has("sourceType")||fields.has("sourceTower")||fields.has("sourceLocation")?<Select label="Source type" value={draft.sourceTypeKey} onChange={value=>setDraft({...draft,sourceTypeKey:value,sourceTowerId:"",sourceLocationId:""})}><option value="">Not applicable / unknown</option>{optionsFor(data,"material_source_type").map(row=><option key={row.option_key} value={row.option_key}>{row.label}</option>)}</Select>:null}
 {usesSource&&source?.settings?.requires_tower?<TowerPicker label="Source tower" value={draft.sourceTowerId} towers={data.towers} onChange={value=>setDraft({...draft,sourceTowerId:value})}/>:null}
 {usesSource&&source?.settings?.requires_location?<ChoicePicker label="Source location" value={draft.sourceLocationId} options={locationOptions} onChange={value=>setDraft({...draft,sourceLocationId:value})}/>:null}
 {fields.has("destinationTower")?<TowerPicker label="Destination / received at tower" value={draft.destinationTowerId} towers={data.towers} onChange={value=>setDraft({...draft,destinationTowerId:value,destinationLocationId:""})}/>:null}
 {fields.has("destinationLocation")&&data.locations.length>0?<ChoicePicker label="Destination location" value={draft.destinationLocationId} options={locationOptions.filter(location=>{const row=data.locations.find(item=>item.id===location.id);return !draft.destinationTowerId||!row?.tower_id||row.tower_id===draft.destinationTowerId;})} onChange={value=>{const location=data.locations.find(row=>row.id===value);setDraft({...draft,destinationLocationId:value,destinationTowerId:location?.tower_id??draft.destinationTowerId});}}/>:null}
 {fields.has("reference")?<Field label="Source / reference" value={draft.reference} onChange={value=>setDraft({...draft,reference:value})}/>:null}
 {fields.has("notes")?<Field label="Notes" value={draft.notes} onChange={value=>setDraft({...draft,notes:value})}/>:null}
 </div>{fields.has("docket")?<details style={{marginTop:8}}><summary>Daily Docket (optional)</summary><ChoicePicker label="Daily Docket" value={draft.docketId} options={data.dockets.map(row=>({id:row.id,label:`${row.docket_date} / ${row.crew_label??"Crew"}`}))} onChange={value=>setDraft({...draft,docketId:value})}/></details>:null}
 <button className={`${tt.button} ${tt.buttonPrimary}`} style={{marginTop:8}} disabled={!data.permissions.manage_issues||(usesSource&&source?.settings?.requires_tower===true&&!draft.sourceTowerId)||(usesSource&&source?.settings?.requires_location===true&&!draft.sourceLocationId)} onClick={onSave}>Add event</button></div>;
}

function MovementsWorkspace({ data, movements, towerMap, locationMap, showForm, setShowForm, showLocationForm, setShowLocationForm, busy, refresh, setMessage }: { data: MaterialsControlPayload; movements: MaterialMovement[]; towerMap: Map<string, string>; locationMap: Map<string, string>; showForm: boolean; setShowForm: (value: boolean) => void; showLocationForm: boolean; setShowLocationForm: (value: boolean) => void; busy: boolean; refresh: () => Promise<void>; setMessage: SetMaterialsMessage }) {
  const [draft, setDraft] = useState({ bundleId: "", issueId: "", quantity: "1", movementTypeKey: "transfer", sourceTypeKey: "another_tower", sourceTowerId: "", sourceLocationId: "", destinationTowerId: "", destinationLocationId: "", status: "in_transit", reference: "", notes: "" });
  const [locationDraft, setLocationDraft] = useState({ name: "", code: "", locationTypeKey: "laydown" });
  async function createMovement() { const issue = data.issues.find((row) => row.id === draft.issueId); try { const response = await fetch(`/api/projects/${data.projectId}/materials/movements`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: data.organisationId, materialItemId: issue?.material_item_id ?? null, bundleId: draft.bundleId || issue?.bundle_id || null, issueId: draft.issueId || null, quantity: draft.quantity, movementTypeKey: draft.movementTypeKey, sourceTypeKey: draft.sourceTypeKey, sourceTowerId: draft.sourceTowerId || null, sourceLocationId: draft.sourceLocationId || null, destinationTowerId: draft.destinationTowerId || null, destinationLocationId: draft.destinationLocationId || null, status: draft.status, reference: draft.reference, notes: draft.notes }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Movement could not be created."); setShowForm(false); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Movement could not be created."); } }
  async function createLocation() { try { const response = await fetch(`/api/projects/${data.projectId}/materials/locations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: data.organisationId, ...locationDraft }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Location could not be created."); setLocationDraft({ name: "", code: "", locationTypeKey: "laydown" }); setShowLocationForm(false); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Location could not be created."); } }
  async function movementAction(id: string, action: "receive" | "cancel") { try { const response = await fetch(`/api/projects/${data.projectId}/materials/movements/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: data.organisationId, action }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Movement could not be updated."); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Movement could not be updated."); } }
  return <div className={tt.stack}><Card><div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><h2 className={tt.cardTitle}>Material movement ledger</h2><p className={tt.cardDescription}>Track excess / replacement steel between towers and configured laydown, warehouse, yard or other locations.</p></div><div style={{ display: "flex", gap: 8 }}><button className={`${tt.button} ${tt.buttonSecondary}`} disabled={!data.permissions.manage_movements} onClick={() => setShowLocationForm(!showLocationForm)}><MapPin size={14} /> Add location</button><button className={`${tt.button} ${tt.buttonPrimary}`} disabled={!data.permissions.manage_movements} onClick={() => setShowForm(!showForm)}><Plus size={14} /> New movement</button></div></div>{showLocationForm ? <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8 }}><Field label="Location name" value={locationDraft.name} onChange={(value) => setLocationDraft({ ...locationDraft, name: value })} /><Field label="Code" value={locationDraft.code} onChange={(value) => setLocationDraft({ ...locationDraft, code: value })} /><Select label="Type" value={locationDraft.locationTypeKey} onChange={(value) => setLocationDraft({ ...locationDraft, locationTypeKey: value })}>{optionsFor(data, "material_location_type").map((option) => <option key={option.option_key} value={option.option_key}>{option.label}</option>)}</Select><button className={`${tt.button} ${tt.buttonPrimary}`} style={{ alignSelf: "end" }} disabled={!data.permissions.manage_movements} onClick={() => void createLocation()}>Save</button></div> : null}{showForm ? <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8 }}><Select label="Bundle" value={draft.bundleId} onChange={(value) => setDraft({ ...draft, bundleId: value, issueId: "" })}><option value="">Select bundle / use issue below</option>{data.bundles.map((bundle) => <option key={bundle.id} value={bundle.id}>{towerLabel(towerMap, bundle.tower_id)} · {bundle.bundle_reference} · {[bundle.package_context, bundle.segment].filter(Boolean).join(" / ") || "No context"}</option>)}</Select><Select label="Related MAT issue" value={draft.issueId} onChange={(value) => setDraft({ ...draft, issueId: value, bundleId: "" })}><option value="">None</option>{data.issues.filter((issue) => issue.status !== "resolved").map((issue) => <option key={issue.id} value={issue.id}>{issue.issue_number} · {issue.item_reference ?? issue.description ?? "Material"}</option>)}</Select><Select label="Movement type" value={draft.movementTypeKey} onChange={(value) => setDraft({ ...draft, movementTypeKey: value })}>{optionsFor(data, "material_movement_type").map((option) => <option key={option.option_key} value={option.option_key}>{option.label}</option>)}</Select><Field label="Quantity" value={draft.quantity} onChange={(value) => setDraft({ ...draft, quantity: value })} type="number" /><Select label="Source type" value={draft.sourceTypeKey} onChange={(value) => setDraft({ ...draft, sourceTypeKey: value })}>{optionsFor(data, "material_source_type").map((option) => <option key={option.option_key} value={option.option_key}>{option.label}</option>)}</Select><TowerPicker label="Source tower" value={draft.sourceTowerId} towers={data.towers} emptyLabel="None" onChange={(value) => setDraft({ ...draft, sourceTowerId: value })} /><Select label="Source location" value={draft.sourceLocationId} onChange={(value) => setDraft({ ...draft, sourceLocationId: value })}><option value="">None</option>{data.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select><TowerPicker label="Destination tower" value={draft.destinationTowerId} towers={data.towers} emptyLabel="None" onChange={(value) => setDraft({ ...draft, destinationTowerId: value })} /><Select label="Destination location" value={draft.destinationLocationId} onChange={(value) => setDraft({ ...draft, destinationLocationId: value })}><option value="">None</option>{data.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select><Select label="Status" value={draft.status} onChange={(value) => setDraft({ ...draft, status: value })}><option value="planned">Planned</option><option value="in_transit">In transit</option><option value="received">Received</option></Select><Field label="Reference" value={draft.reference} onChange={(value) => setDraft({ ...draft, reference: value })} /><Field label="Notes" value={draft.notes} onChange={(value) => setDraft({ ...draft, notes: value })} /><div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}><button className={`${tt.button} ${tt.buttonPrimary}`} disabled={busy || !data.permissions.manage_movements} onClick={() => void createMovement()}>Create movement</button></div></div> : null}</Card><Card padded={false}><div className={tt.tableWrap} style={{ border: 0, borderRadius: 0 }}><table className={tt.table}><thead><tr><th>Date</th><th>Type</th><th>Qty</th><th>From</th><th>To</th><th>Status</th><th>Reference</th><th></th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td>{formatDate(movement.moved_at ?? movement.created_at)}</td><td>{optionLabel(data, "material_movement_type", movement.movement_type_key)}</td><td>{movement.quantity} {movement.unit}</td><td>{movement.source_tower_id ? towerLabel(towerMap, movement.source_tower_id) : movement.source_location_id ? locationMap.get(movement.source_location_id) : optionLabel(data, "material_source_type", movement.source_type_key)}</td><td>{movement.destination_tower_id ? towerLabel(towerMap, movement.destination_tower_id) : movement.destination_location_id ? locationMap.get(movement.destination_location_id) : "—"}</td><td>{movement.status}</td><td>{movement.reference ?? "—"}</td><td>{movement.status === "in_transit" ? <div style={{ display: "flex", gap: 5 }}><button className={`${tt.button} ${tt.buttonSecondary}`} disabled={!data.permissions.manage_movements} onClick={() => void movementAction(movement.id, "receive")}>Receive</button><button className={`${tt.button} ${tt.buttonSecondary}`} disabled={!data.permissions.manage_movements} onClick={() => void movementAction(movement.id, "cancel")}>Cancel</button></div> : null}</td></tr>)}</tbody></table></div></Card></div>;
}

function ReservationsWorkspace({ data, reservations, towerMap, locationMap, showForm, setShowForm, busy, refresh, setMessage }: { data: MaterialsControlPayload; reservations: MaterialReservation[]; towerMap: Map<string, string>; locationMap: Map<string, string>; showForm: boolean; setShowForm: (value: boolean) => void; busy: boolean; refresh: () => Promise<void>; setMessage: SetMaterialsMessage }) {
  const [draft, setDraft] = useState({ bundleId: "", issueId: "", sourceTowerId: "", sourceLocationId: "", destinationTowerId: "", destinationLocationId: "", quantity: "1", expiresAt: "", notes: "" });
  async function createReservation() { const issue = data.issues.find((row) => row.id === draft.issueId); try { const response = await fetch(`/api/projects/${data.projectId}/materials/reservations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: data.organisationId, materialItemId: issue?.material_item_id ?? null, bundleId: draft.bundleId || issue?.bundle_id || null, issueId: draft.issueId || null, sourceTowerId: draft.sourceTowerId || null, sourceLocationId: draft.sourceLocationId || null, destinationTowerId: draft.destinationTowerId || null, destinationLocationId: draft.destinationLocationId || null, quantity: draft.quantity, expiresAt: draft.expiresAt || null, notes: draft.notes }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Reservation could not be created."); setShowForm(false); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Reservation could not be created."); } }
  async function release(id: string) { try { const response = await fetch(`/api/projects/${data.projectId}/materials/reservations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: data.organisationId, status: "released" }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Reservation could not be released."); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Reservation could not be released."); } }
  return <div className={tt.stack}><Card><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><div><h2 className={tt.cardTitle}>Excess / replacement reservations</h2><p className={tt.cardDescription}>Reserve confirmed excess or replacement material before transport so two crews cannot claim the same steel.</p></div><button className={`${tt.button} ${tt.buttonPrimary}`} disabled={!data.permissions.manage_reservations} onClick={() => setShowForm(!showForm)}><Plus size={14} /> Reserve material</button></div>{showForm ? <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8 }}><Select label="Bundle" value={draft.bundleId} onChange={(value) => setDraft({ ...draft, bundleId: value, issueId: "" })}><option value="">Select bundle / use MAT issue</option>{data.bundles.map((bundle) => <option key={bundle.id} value={bundle.id}>{towerLabel(towerMap, bundle.tower_id)} · {bundle.bundle_reference}</option>)}</Select><Select label="MAT issue" value={draft.issueId} onChange={(value) => setDraft({ ...draft, issueId: value, bundleId: "" })}><option value="">None</option>{data.issues.filter((issue) => issue.status !== "resolved").map((issue) => <option key={issue.id} value={issue.id}>{issue.issue_number} · {issue.item_reference ?? "Material"}</option>)}</Select><Field label="Qty" value={draft.quantity} onChange={(value) => setDraft({ ...draft, quantity: value })} type="number" /><Field label="Expires" value={draft.expiresAt} onChange={(value) => setDraft({ ...draft, expiresAt: value })} type="date" /><TowerPicker label="Source tower" value={draft.sourceTowerId} towers={data.towers} emptyLabel="None" onChange={(value) => setDraft({ ...draft, sourceTowerId: value })} /><Select label="Source location" value={draft.sourceLocationId} onChange={(value) => setDraft({ ...draft, sourceLocationId: value })}><option value="">None</option>{data.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select><TowerPicker label="Destination tower" value={draft.destinationTowerId} towers={data.towers} emptyLabel="None" onChange={(value) => setDraft({ ...draft, destinationTowerId: value })} /><Select label="Destination location" value={draft.destinationLocationId} onChange={(value) => setDraft({ ...draft, destinationLocationId: value })}><option value="">None</option>{data.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</Select><Field label="Notes" value={draft.notes} onChange={(value) => setDraft({ ...draft, notes: value })} /><div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}><button disabled={busy || !data.permissions.manage_reservations} className={`${tt.button} ${tt.buttonPrimary}`} onClick={() => void createReservation()}>Reserve</button></div></div> : null}</Card><Card padded={false}><div className={tt.tableWrap} style={{ border: 0, borderRadius: 0 }}><table className={tt.table}><thead><tr><th>Reserved</th><th>Qty</th><th>From</th><th>To</th><th>Status</th><th>Expires</th><th></th></tr></thead><tbody>{reservations.map((reservation) => <tr key={reservation.id}><td>{formatDate(reservation.reserved_at)}</td><td>{reservation.quantity} {reservation.unit}</td><td>{reservation.source_tower_id ? towerLabel(towerMap, reservation.source_tower_id) : reservation.source_location_id ? locationMap.get(reservation.source_location_id) : "—"}</td><td>{reservation.destination_tower_id ? towerLabel(towerMap, reservation.destination_tower_id) : reservation.destination_location_id ? locationMap.get(reservation.destination_location_id) : "—"}</td><td>{reservation.status}</td><td>{reservation.expires_at ? formatDate(reservation.expires_at) : "—"}</td><td>{reservation.status === "reserved" ? <button disabled={!data.permissions.manage_reservations} className={`${tt.button} ${tt.buttonSecondary}`} onClick={() => void release(reservation.id)}>Release</button> : null}</td></tr>)}</tbody></table></div></Card></div>;
}

function AmendmentsWorkspace({ data, amendments, towerMap, showForm, setShowForm, busy, refresh, setMessage, search }: { data: MaterialsControlPayload; amendments: MaterialAmendment[]; towerMap: Map<string, string>; showForm: boolean; setShowForm: (value: boolean) => void; busy: boolean; refresh: () => Promise<void>; setMessage: SetMaterialsMessage; search: (mode: SearchMode, q?: string, towerId?: string) => Promise<SearchResult> }) {
  const [draft, setDraft] = useState({ title: "", referenceTypeKey: "Redline", referenceNumber: "", scopeKey: "tower", towerId: "", towerType: "", drawingReference: "", drawingRevision: "", segment: "", reason: "", statusKey: "draft", effectiveFrom: "", actionKey: "replace", materialKind: "bolt", baseItemReference: "", itemReference: "", diameter: "", length: "", boltType: "", packerMark: "", quantity: "", unit: "ea", notes: "" });
  async function save() { try { let baseMaterialItemId: string | null = null; if (!["add", "note"].includes(draft.actionKey) && draft.baseItemReference.trim()) { const mode: SearchMode = draft.materialKind === "member" ? "members" : draft.materialKind === "packer" ? "packers" : "bolts"; const result = await search(mode, draft.baseItemReference, draft.towerId); const exact = result.items.filter((item) => normalize(item.item_reference) === normalize(draft.baseItemReference)); if (exact.length !== 1) throw new Error(`TTTracker found ${exact.length} exact base item matches. Narrow the tower/reference so one base row can be amended.`); baseMaterialItemId = exact[0].id; } const response = await fetch(`/api/projects/${data.projectId}/materials/amendments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organisationId: data.organisationId, title: draft.title, referenceTypeKey: draft.referenceTypeKey, referenceNumber: draft.referenceNumber, scopeKey: draft.scopeKey, towerId: draft.towerId || null, towerType: draft.towerType || null, drawingReference: draft.drawingReference || null, drawingRevision: draft.drawingRevision || null, segment: draft.segment || null, reason: draft.reason || null, statusKey: draft.statusKey, effectiveFrom: draft.effectiveFrom || null, items: [{ baseMaterialItemId, actionKey: draft.actionKey, materialKind: draft.materialKind, itemReference: draft.itemReference || draft.baseItemReference || null, segment: draft.segment || null, drawingReference: draft.drawingReference || null, drawingRevision: draft.drawingRevision || null, diameter: draft.diameter || null, length: draft.length || null, boltType: draft.boltType || null, packerMark: draft.packerMark || null, quantity: draft.quantity || null, unit: draft.unit, notes: draft.notes || null }] }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error ?? "Amendment could not be created."); setShowForm(false); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Amendment could not be created."); } }
  return <div className={tt.stack}><Card><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><div><h2 className={tt.cardTitle}>Controlled amendments / redlines</h2><p className={tt.cardDescription}>Never overwrite the imported base requirement. Record the reference, scope, effective date and exact material change.</p></div><button className={`${tt.button} ${tt.buttonPrimary}`} disabled={!data.permissions.manage_amendments} onClick={() => setShowForm(!showForm)}><Plus size={14} /> New amendment</button></div>{showForm ? <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8 }}><Field label="Title" value={draft.title} onChange={(value) => setDraft({ ...draft, title: value })} /><Field label="Reference type" value={draft.referenceTypeKey} onChange={(value) => setDraft({ ...draft, referenceTypeKey: value })} /><Field label="Reference number" value={draft.referenceNumber} onChange={(value) => setDraft({ ...draft, referenceNumber: value })} /><Select label="Status" value={draft.statusKey} onChange={(value) => setDraft({ ...draft, statusKey: value })}><option value="draft">Draft</option><option value="approved">Approved / effective</option><option value="superseded">Superseded</option></Select><Select label="Scope" value={draft.scopeKey} onChange={(value) => setDraft({ ...draft, scopeKey: value })}>{optionsFor(data, "material_amendment_scope").map((option) => <option key={option.option_key} value={option.option_key}>{option.label}</option>)}</Select><TowerPicker label="Tower" value={draft.towerId} towers={data.towers} emptyLabel="None / scope controlled elsewhere" onChange={(value) => setDraft({ ...draft, towerId: value })} /><Field label="Drawing" value={draft.drawingReference} onChange={(value) => setDraft({ ...draft, drawingReference: value })} /><Field label="Drawing revision" value={draft.drawingRevision} onChange={(value) => setDraft({ ...draft, drawingRevision: value })} /><Field label="Segment" value={draft.segment} onChange={(value) => setDraft({ ...draft, segment: value })} /><Field label="Effective date" value={draft.effectiveFrom} onChange={(value) => setDraft({ ...draft, effectiveFrom: value })} type="date" /><Select label="Action" value={draft.actionKey} onChange={(value) => setDraft({ ...draft, actionKey: value })}>{optionsFor(data, "material_amendment_action").map((option) => <option key={option.option_key} value={option.option_key}>{option.label}</option>)}</Select><Select label="Material kind" value={draft.materialKind} onChange={(value) => setDraft({ ...draft, materialKind: value })}><option value="member">Member</option><option value="bolt">Bolt</option><option value="packer">Packer</option></Select><Field label="Original item reference" value={draft.baseItemReference} onChange={(value) => setDraft({ ...draft, baseItemReference: value })} /><Field label="New / effective item reference" value={draft.itemReference} onChange={(value) => setDraft({ ...draft, itemReference: value })} /><Field label="Diameter" value={draft.diameter} onChange={(value) => setDraft({ ...draft, diameter: value })} /><Field label="Length" value={draft.length} onChange={(value) => setDraft({ ...draft, length: value })} /><Field label="Bolt type" value={draft.boltType} onChange={(value) => setDraft({ ...draft, boltType: value })} /><Field label="Packer mark" value={draft.packerMark} onChange={(value) => setDraft({ ...draft, packerMark: value })} /><Field label="Qty" value={draft.quantity} onChange={(value) => setDraft({ ...draft, quantity: value })} type="number" /><Field label="Reason" value={draft.reason} onChange={(value) => setDraft({ ...draft, reason: value })} /><Field label="Item notes" value={draft.notes} onChange={(value) => setDraft({ ...draft, notes: value })} /><div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}><button className={`${tt.button} ${tt.buttonPrimary}`} disabled={busy || !data.permissions.manage_amendments} onClick={() => void save()}>Save amendment</button></div></div> : null}</Card><Card padded={false}><div className={tt.tableWrap} style={{ border: 0, borderRadius: 0 }}><table className={tt.table}><thead><tr><th>Reference</th><th>Title</th><th>Scope</th><th>Tower</th><th>Drawing</th><th>Segment</th><th>Status</th><th>Effective</th></tr></thead><tbody>{amendments.map((amendment) => <tr key={amendment.id}><td>{[amendment.reference_type_key, amendment.reference_number].filter(Boolean).join(" ") || amendment.amendment_number || "—"}</td><td><strong>{amendment.title}</strong><div className={tt.secondary}>{amendment.reason ?? ""}</div></td><td>{amendment.scope_key.replaceAll("_", " ")}</td><td>{amendment.tower_id ? towerLabel(towerMap, amendment.tower_id) : amendment.tower_type ?? "—"}</td><td>{amendment.drawing_reference ?? "—"}{amendment.drawing_revision ? ` · ${amendment.drawing_revision}` : ""}</td><td>{amendment.segment ?? "—"}</td><td>{amendment.status_key}</td><td>{amendment.effective_from ?? "—"}</td></tr>)}</tbody></table></div></Card></div>;
}

function ReconciliationWorkspace({ data, towerMap, busy, run }: { data: MaterialsControlPayload; towerMap: Map<string, string>; busy: boolean; run: () => void }) {
  const [query, setQuery] = useState("");
  const normalizeQuery = query.trim().toLowerCase();
  const summaries = data.findings.filter(finding => finding.finding_type_key === "tower_requirement_summary");
  const findings = data.findings.filter(finding => finding.finding_type_key !== "tower_requirement_summary" && [finding.message, finding.item_reference, finding.bundle_reference, towerLabel(towerMap, finding.tower_id)].filter(Boolean).join(" ").toLowerCase().includes(normalizeQuery));
  const groups = new Map<string, typeof findings>();
  for (const finding of findings) groups.set(finding.finding_type_key, [...(groups.get(finding.finding_type_key) ?? []), finding]);
  return <Card><div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}><div><h2 className={tt.cardTitle}>Requirement / manifest reconciliation</h2><p className={tt.cardDescription}>Applicable source requirements, tower packing assignments and unresolved or ambiguous physical manifests.</p></div><button className={`${tt.button} ${tt.buttonPrimary}`} disabled={busy || !data.permissions.import} onClick={run}><Database size={14} /> Run reconciliation</button></div>
    <MaterialsSearch onClear={()=>setQuery("")} style={{ marginTop: 12 }} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tower, member, bundle or issue" />
    <details style={{ marginTop: 10 }}><summary>Effective requirements by tower - {summaries.length} towers</summary><div style={{ maxHeight: 220, overflow: "auto" }}>{summaries.filter(row => towerLabel(towerMap, row.tower_id).toLowerCase().includes(normalizeQuery)).map(row => <div key={row.id} style={{ padding: 6 }}><strong>{towerLabel(towerMap, row.tower_id)}</strong>: {String(row.details.applicable_requirements ?? 0)} applicable | {String(row.details.matched_assignments ?? 0)} matched | {String(row.details.unresolved_bundle_references ?? 0)} unresolved | {String(row.details.ambiguous_assignments ?? 0)} ambiguous | {String(row.details.bundles_without_members ?? 0)} bundles without members | {String(row.details.source_conflicts ?? 0)} source conflicts</div>)}</div></details>
    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>{findings.length === 0 ? <div className={`${tt.notice} ${tt.noticeInfo}`}>No matching reconciliation issues.</div> : [...groups].map(([key, rows]) => <details key={key}><summary>{key.replaceAll("_", " ")} - {rows.length}</summary><div style={{ maxHeight: 260, overflow: "auto", marginTop: 8 }}>{rows.map(finding => <Finding key={finding.id} finding={finding} towerMap={towerMap} />)}</div></details>)}</div>
  </Card>;
}

function PackContents({ members }: { members: MaterialItem[] }) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const filtered = members.filter((item) => [item.item_reference, item.profile, item.drawing_reference, item.segment].some((value) => value?.toLowerCase().includes(query.toLowerCase())));
  return <div>
    <div className={tt.secondary}>{members.length} member lines</div>
    {members.length > 10 ? <MaterialsSearch onClear={()=>setQuery("")} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Find a member in this pack" style={{ marginTop: 6 }} /> : null}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 1.5fr", gap: 8, padding: "8px 0" }} className={tt.secondary}><span>Member</span><span>Profile</span><span>Qty / Tower</span><span>Tower Segment</span></div>
    {filtered.slice(page * 10, page * 10 + 10).map((item) => <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 1.5fr", gap: 8, padding: "6px 0", borderTop: "1px solid rgba(148,163,184,.16)" }}><div><strong>{item.item_reference}</strong><div className={tt.secondary}>{item.drawing_reference}</div></div><span>{item.profile ?? "—"}</span><strong>{item.required_quantity ?? "—"}</strong><span>{item.segment ?? "—"}</span></div>)}
    {filtered.length > 10 ? <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}><button className={`${tt.button} ${tt.buttonSecondary}`} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span className={tt.secondary}>{page * 10 + 1}–{Math.min(page * 10 + 10, filtered.length)} of {filtered.length}</span><button className={`${tt.button} ${tt.buttonSecondary}`} disabled={(page + 1) * 10 >= filtered.length} onClick={() => setPage(page + 1)}>Next</button></div> : null}
  </div>;
}

function MaterialItemRow({ item, towerMap }: { item: MaterialItem; towerMap: Map<string, string> }) {
  const spec = item.material_kind === "bolt" ? [item.diameter, item.length, item.bolt_type].filter(Boolean).join(" / ") : item.material_kind === "packer" ? [item.diameter, item.packer_mark].filter(Boolean).join(" / ") : item.profile;
  const exception = item.exception_status ?? (["missing", "issue", "transfer_pending"].includes(item.check?.status ?? "") ? item.check?.status.replaceAll("_", " ") : null);
  return <div className={tt.card} style={{ padding: "9px 12px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}><strong style={{ fontSize: 17 }}>{item.item_reference}</strong>{exception ? <span className={tt.secondary}>{exception}</span> : null}</div>
    <div className={tt.secondary}>Bundle {item.resolved_bundle_reference ?? item.bundle_reference ?? "—"}{item.resolved_bundle_context ? ` · ${item.resolved_bundle_context}` : ""}{item.bundle_reference && !item.bundle_id ? " (assignment pending)" : ""} · Drawing {item.drawing_reference ?? "—"}{item.drawing_revision ? ` / ${item.drawing_revision}` : ""}{item.tower_id ? ` · ${towerLabel(towerMap, item.tower_id)}` : ""}</div>
    <div style={{ marginTop: 6, display: "grid", gridTemplateColumns: "1fr 100px 1.5fr", gap: 8 }}><div><span className={tt.secondary}>Profile / Spec</span><div>{spec || "—"}</div></div><div><span className={tt.secondary}>Qty / Tower</span><div><strong>{item.required_quantity ?? "—"}</strong></div></div><div><span className={tt.secondary}>Tower Segment</span><div>{item.segment ?? "—"}</div></div></div>
  </div>;
}

function BundleSearchRow({ bundle, towerMap, onOpen }: { onOpen: () => void; bundle: MaterialBundle & { members?: MaterialItem[] }; towerMap: Map<string, string> }) {
  return <div className={tt.card} style={{ padding: 12 }}><div><strong>{bundle.bundle_reference}</strong><div className={tt.secondary}>{bundle.tower_id ? towerLabel(towerMap, bundle.tower_id) : "Project"} · {[bundle.package_context, bundle.segment].filter(Boolean).join(" / ") || "No context"} · {bundle.member_count ?? bundle.members?.length ?? 0} member lines</div></div><button className={`${tt.button} ${tt.buttonSecondary}`} style={{ marginTop: 6 }} onClick={onOpen}>Open pack</button>{bundle.members?.length ? <div style={{ marginTop: 8, display: "grid", gap: 5 }}>{bundle.members.slice(0, 20).map((item) => <div key={item.id} className={tt.secondary}>{item.item_reference} · {item.profile ?? "—"} · {item.drawing_reference ?? "—"} · {item.segment ?? "—"}</div>)}</div> : null}</div>;
}

function IssueRow({ issue, towerMap }: { issue: MaterialIssue; towerMap: Map<string, string> }) {
  const remaining = Math.max(Number(issue.quantity_affected) - Number(issue.quantity_resolved), 0);
  return <div className={tt.card} style={{ padding: 10, display: "grid", gridTemplateColumns: "110px 1fr 120px", gap: 10 }}><div><strong>{issue.issue_number}</strong><div className={tt.secondary}>{issue.issue_type_key}</div></div><div><strong>{issue.item_reference ?? issue.description ?? "Material"}</strong><div className={tt.secondary}>{issue.tower_id ? towerLabel(towerMap, issue.tower_id) : "Needs affected tower assignment"} · Raised {formatDate(issue.raised_at)}</div></div><div><strong>{remaining} {issue.unit}</strong><div className={tt.secondary}>remaining</div></div></div>;
}

function CompactMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div
      className={tt.card}
      style={{
        padding: "7px 9px",
        minHeight: 58,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div className="tt-label" style={{ fontSize: 9, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 19, lineHeight: 1.05, fontWeight: 900 }}>{value}</div>
      {detail ? <div className={tt.secondary} style={{ marginTop: 3, fontSize: 11 }}>{detail}</div> : null}
    </div>
  );
}


function Health({ label, value, good }: { label: string; value: React.ReactNode; good: boolean }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: 10, border: "1px solid rgba(148,163,184,.2)", borderRadius: 10 }}><div style={{ display: "flex", gap: 8, alignItems: "center" }}>{good ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {label}</div><strong>{value}</strong></div>;
}

function Finding({ finding, towerMap }: { finding: ReconciliationFinding; towerMap: Map<string, string> }) {
  return <div className={tt.card} style={{ padding: 12 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><div><strong>{finding.message}</strong><div className={tt.secondary}>{finding.finding_type_key.replaceAll("_", " ")} · {finding.tower_id ? towerLabel(towerMap, finding.tower_id) : "Project-wide"}{finding.item_reference ? ` · ${finding.item_reference}` : ""}{finding.bundle_reference ? ` · Bundle ${finding.bundle_reference}` : ""}</div></div><span>{finding.severity}</span></div></div>;
}

function TowerPicker({
  label,
  value,
  towers,
  onChange,
  emptyLabel = "Select tower",
}: {
  label: string;
  value: string;
  towers: MaterialsControlPayload["towers"];
  onChange: (value: string) => void;
  emptyLabel?: string;
}) {
  const listId = useId();
  const selected = towers.find((tower) => tower.id === value);
  const selectedLabel = selected
    ? `${selected.tower_identifier}${selected.tower_type ? ` · ${selected.tower_type}` : ""}`
    : "";
  const [text, setText] = useState(selectedLabel);

  useEffect(() => {
    setText(selectedLabel);
  }, [selectedLabel]);

  function handleChange(next: string) {
    setText(next);

    if (!next.trim()) {
      onChange("");
      return;
    }

    const normalised = next.trim().toLowerCase();
    const match = towers.find((tower) => {
      const full = `${tower.tower_identifier}${tower.tower_type ? ` · ${tower.tower_type}` : ""}`.toLowerCase();
      return full === normalised || tower.tower_identifier.toLowerCase() === normalised;
    });

    if (match) onChange(match.id);
  }

  return (
    <label>
      <div className="tt-label">{label}</div>
      <MaterialsSearch
        
        list={listId}
        value={text}
        placeholder={emptyLabel}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={() => {
          if (!text.trim()) {
            onChange("");
            return;
          }

          const exact = towers.some((tower) => {
            const full = `${tower.tower_identifier}${tower.tower_type ? ` · ${tower.tower_type}` : ""}`.toLowerCase();
            const normalised = text.trim().toLowerCase();
            return full === normalised || tower.tower_identifier.toLowerCase() === normalised;
          });

          if (!exact) {
            setText("");
            onChange("");
          }
        }}
      />
      <datalist id={listId}>
        {towers.map((tower) => (
          <option
            key={tower.id}
            value={`${tower.tower_identifier}${tower.tower_type ? ` · ${tower.tower_type}` : ""}`}
          />
        ))}
      </datalist>
    </label>
  );
}


function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label><div className="tt-label">{label}</div><input className="tt-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Select({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <label><div className="tt-label">{label}</div><select className="tt-select" value={value} onChange={(event) => onChange(event.target.value)}>{children}</select></label>;
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div style={{ padding: 9, border: "1px solid rgba(148,163,184,.16)", borderRadius: 8 }}><div className={tt.secondary}>{label}</div><strong>{value}</strong></div>;
}
