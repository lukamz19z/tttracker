export type MaterialOption = {
  id: string;
  option_group: string;
  option_key: string;
  label: string;
  settings: Record<string, unknown> | null;
};

export type MaterialTower = {
  id: string;
  tower_identifier: string;
  tower_type?: string | null;
  line?: string | null;
};

export type MaterialBundleCheck = {
  status: string;
  quantity_received: number;
  checked_at: string | null;
  checked_by?: string | null;
  notes?: string | null;
};

export type MaterialMemberCheck = {
  material_item_id: string | null;
  member_reference: string;
  status: string;
  checked_at: string | null;
  notes: string | null;
};

export type MaterialBundle = {
  id: string;
  tower_id: string | null;
  tower_type: string | null;
  bundle_reference: string;
  segment: string | null;
  package_context?: string | null;
  required_quantity: number;
  supplied_quantity: number;
  total_weight_t: number | null;
  source_document: string | null;
  source_revision: string | null;
  check?: MaterialBundleCheck | null;
  members?: MaterialItem[];
  member_count?: number;
};

export type MaterialItem = {
  id: string;
  tower_id: string | null;
  tower_type: string | null;
  bundle_id: string | null;
  material_kind: string;
  item_reference: string;
  description: string | null;
  bundle_reference: string | null;
  segment: string | null;
  package_context?: string | null;
  drawing_reference: string | null;
  drawing_revision: string | null;
  profile: string | null;
  material_code: string | null;
  diameter: string | null;
  length: string | null;
  bolt_type: string | null;
  packer_mark: string | null;
  required_quantity: number | null;
  received_quantity: number;
  unit: string;
  source_kind: string;
  source_role_key?: string | null;
  source_document: string | null;
  source_revision: string | null;
  check?: MaterialMemberCheck | null;
  exception_status?: string | null;
  resolved_bundle_reference?: string | null;
  resolved_bundle_context?: string | null;
};

export type MaterialIssueEvent = {
  id: string;
  event_type_key: string;
  quantity: number;
  unit: string;
  source_type_key: string | null;
  source_tower_id: string | null;
  source_location_id: string | null;
  destination_tower_id: string | null;
  destination_location_id: string | null;
  docket_id: string | null;
  reference: string | null;
  notes: string | null;
  occurred_at: string;
};

export type MaterialIssue = {
  id: string;
  issue_number: string;
  tower_id: string | null;
  material_item_id: string | null;
  bundle_id: string | null;
  issue_type_key: string;
  item_reference: string | null;
  description: string | null;
  quantity_affected: number;
  quantity_resolved: number;
  unit: string;
  status: string;
  raised_docket_id: string | null;
  raised_at: string;
  affected_work: boolean;
  work_outcome_key: string | null;
  affected_activity: string | null;
  affected_segment: string | null;
  current_effect: string | null;
  current_location_id: string | null;
  current_tower_id: string | null;
  client_reference: string | null;
  events?: MaterialIssueEvent[];
};

export type MaterialMovement = {
  id: string;
  material_item_id: string | null;
  bundle_id: string | null;
  issue_id: string | null;
  movement_type_key: string;
  quantity: number;
  unit: string;
  source_type_key: string | null;
  source_tower_id: string | null;
  source_location_id: string | null;
  destination_tower_id: string | null;
  destination_location_id: string | null;
  docket_id: string | null;
  status: string;
  reference: string | null;
  notes: string | null;
  moved_at: string | null;
  received_at: string | null;
  created_at: string;
};


export type MaterialDeliveryItem = {
  id: string;
  delivery_id: string;
  tower_id: string | null;
  bundle_id: string;
  expected_quantity: number;
  delivered_quantity: number;
  status: string;
  driver_checked_by: string | null;
  driver_checked_by_name: string | null;
  driver_checked_at: string | null;
  notes: string | null;
};

export type MaterialDelivery = {
  completed_at?: string | null;
  completed_by?: string | null;
  completed_by_name?: string | null;
  id: string;
  delivery_number: string;
  status: string;
  driver_user_id: string | null;
  driver_name: string | null;
  vehicle_reference: string | null;
  supplier_reference: string | null;
  scheduled_for: string | null;
  departed_at: string | null;
  delivered_at: string | null;
  notes: string | null;
  created_at: string;
  items: MaterialDeliveryItem[];
};

export type MaterialLocation = {
  id: string;
  location_type_key: string;
  code: string | null;
  name: string;
  tower_id: string | null;
};

export type MaterialReservation = {
  id: string;
  material_item_id: string | null;
  bundle_id: string | null;
  issue_id: string | null;
  source_tower_id: string | null;
  source_location_id: string | null;
  destination_tower_id: string | null;
  destination_location_id: string | null;
  quantity: number;
  unit: string;
  status: string;
  reserved_at: string;
  expires_at: string | null;
  released_at: string | null;
};

export type MaterialAmendment = {
  id: string;
  amendment_number: string | null;
  title: string;
  reference_type_key: string | null;
  reference_number: string | null;
  scope_key: string;
  tower_id: string | null;
  tower_type: string | null;
  drawing_reference: string | null;
  drawing_revision: string | null;
  segment: string | null;
  reason: string | null;
  status_key: string;
  effective_from: string | null;
  document_url: string | null;
  created_at: string;
};

export type ReconciliationFinding = {
  id: string;
  finding_type_key: string;
  severity: string;
  status: string;
  tower_id: string | null;
  item_reference: string | null;
  bundle_reference: string | null;
  drawing_reference: string | null;
  segment: string | null;
  message: string;
  details: Record<string, unknown>;
};

export type MaterialDocket = {
  id: string;
  docket_date: string;
  primary_tower_id: string | null;
  crew_label: string | null;
  leading_hand_name: string | null;
  approval_status: string;
};

export type MaterialsControlPayload = {
  recordedBy?: string;
  permissions: Record<import("./access-policy").MaterialsCapability, boolean>;
  projectId: string;
  organisationId: string;
  towers: MaterialTower[];
  bundles: MaterialBundle[];
  issues: MaterialIssue[];
  movements: MaterialMovement[];
  deliveries: MaterialDelivery[];
  locations: MaterialLocation[];
  reservations: MaterialReservation[];
  amendments: MaterialAmendment[];
  findings: ReconciliationFinding[];
  dockets: MaterialDocket[];
  options: MaterialOption[];
  settings: {
    deliveriesEnabled: boolean;
  };
  metrics: {
    bundleCount: number;
    checkedBundles: number;
    memberCount: number;
    boltCount: number;
    packerCount: number;
    openMissing: number;
    openExcess: number;
    outstandingMissingQty: number;
    inTransit: number;
    deliveryItemsDelivered: number;
    awaitingSiteVerification: number;
    activeReservations: number;
    openReconciliation: number;
  };
};
