export type BundleCheckStatus =
  | "not_checked"
  | "arrived"
  | "partial"
  | "missing"
  | "issue"
  | "transferred";

export type MemberCheckStatus =
  | "not_checked"
  | "arrived"
  | "not_here"
  | "missing"
  | "issue";

export type TransferStatus =
  | "in_transit"
  | "received"
  | "cancelled"
  | string;

export type MaterialRow = Record<string, unknown>;

export type TowerMaterialRecord = MaterialRow & {
  id: string;
  project_id?: string | null;
  name?: string | null;
  line?: string | null;
  status?: string | null;
  progress?: number | null;
};

export type BundleRecord = MaterialRow & {
  id?: string | null;
  tower_id: string;
  bundle_no: string;
  section?: string | null;
  qty_required?: number | null;
  member_qty?: number | null;
  total_weight?: number | null;
};

export type MemberRecord = MaterialRow & {
  id?: string | null;
  tower_id: string;
  bundle_id?: string | null;
  bundle_reference?: string | null;
  drawing_number?: string | null;
  mark_no?: string | null;
  qty_per_tower?: number | null;
  section?: string | null;
  tower_segment?: string | null;
};

export type BoltRecord = MaterialRow & {
  id?: string | null;
  tower_id: string;
  tower_segment?: string | null;
  bolt_diameter?: string | null;
  dn_sn?: string | null;
  length?: string | null;
  qty?: number | null;
};

export type BundleCheckRecord = MaterialRow & {
  id?: string | null;
  tower_id: string;
  bundle_id?: string | null;
  bundle_no?: string | null;
  status?: BundleCheckStatus | null;
  notes?: string | null;
  checked_by?: string | null;
  checked_at?: string | null;
  qty_received?: number | null;
};

export type MemberCheckRecord = MaterialRow & {
  id?: string | null;
  tower_id: string;
  bundle_id?: string | null;
  bundle_no?: string | null;
  mark_no?: string | null;
  status?: MemberCheckStatus | null;
  notes?: string | null;
  checked_by?: string | null;
  checked_at?: string | null;
};

export type DeliveryItemRecord = MaterialRow & {
  id?: string | null;
  bundle_id?: string | null;
  bundle_no?: string | null;
  qty_delivered?: number | null;
  quantity_delivered?: number | null;
  qty?: number | null;
};

export type DeliveryRecord = MaterialRow & {
  id?: string | null;
  tower_id?: string | null;
  created_at?: string | null;
  tower_bundle_delivery_items?: DeliveryItemRecord[] | null;
};

export type MaterialEventItemRecord = MaterialRow & {
  id?: string | null;
  event_id?: string | null;
  bundle_id?: string | null;
  bundle_no?: string | null;
  bundle_section?: string | null;
  source_table?: string | null;
  source_record_id?: string | null;
  material_type?: string | null;
  bolt_size?: string | null;
  item_reference?: string | null;
  item_description?: string | null;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
  issue_key?: string | null;
  source_issue_key?: string | null;
};

export type MaterialEventRecord = MaterialRow & {
  id?: string | null;
  project_id?: string | null;
  docket_id?: string | null;
  tower_id?: string | null;
  event_type?: string | null;
  source_tower_id?: string | null;
  destination_tower_id?: string | null;
  occurred_at?: string | null;
  affected_work?: boolean | null;
  work_outcome?: string | null;
  affected_activity?: string | null;
  affected_section?: string | null;
  current_effect?: string | null;
  notes?: string | null;
  tower_material_event_items?: MaterialEventItemRecord[] | null;
};

export type TransferRecord = MaterialRow & {
  id?: string | null;
  transfer_no?: number | null;
  project_id?: string | null;
  source_tower_id?: string | null;
  destination_tower_id?: string | null;
  source_bundle_id?: string | null;
  destination_bundle_id?: string | null;
  bundle_no?: string | null;
  bundle_section?: string | null;
  quantity?: number | null;
  status?: TransferStatus | null;
  transferred_by?: string | null;
  transferred_by_name?: string | null;
  transferred_at?: string | null;
  received_by?: string | null;
  received_by_name?: string | null;
  received_at?: string | null;
  cancelled_by?: string | null;
  cancelled_by_name?: string | null;
  cancelled_at?: string | null;
  notes?: string | null;
};

export type MaterialPayload = {
  projectId: string;
  generatedAt: string;
  towers: TowerMaterialRecord[];
  bundles: BundleRecord[];
  members: MemberRecord[];
  bolts: BoltRecord[];
  bundleChecks: BundleCheckRecord[];
  memberChecks: MemberCheckRecord[];
  deliveries: DeliveryRecord[];
  materialEvents: MaterialEventRecord[];
  transfers: TransferRecord[];
};

export type SaveBundleCheckInput = {
  qtyReceived: number;
  status?: Exclude<BundleCheckStatus, "transferred">;
  notes?: string;
};

export type SaveMemberCheckInput = {
  status: MemberCheckStatus;
  notes?: string;
};

export type CreateTransferInput = {
  sourceBundleId: string;
  destinationTowerId: string;
  destinationBundleId: string;
  quantity: number;
  notes?: string;
};

export type RecordMissingReceiptInput = {
  issueKey: string;
  quantity: number;
  notes?: string;
};
