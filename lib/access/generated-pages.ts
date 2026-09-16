export type GeneratedAccessPage = {
  code: string;
  name: string;
  route: string;
  group: string;
  sourceIdentifier: string;
};

/**
 * Feature catalogue used only by the Admin "Discover Access Areas" action.
 * Roles are NOT encoded here. Any role can be granted any discovered access
 * area from Admin. Add a feature here when a new web module is introduced so
 * it becomes selectable in the permissions matrix.
 */
export const GENERATED_ACCESS_PAGES: GeneratedAccessPage[] = [
  {
    code: "tt.home",
    name: "Home",
    route: "/",
    group: "General",
    sourceIdentifier: "app/(protected)/page.tsx",
  },
  {
    code: "tt.projects",
    name: "Projects",
    route: "/projects",
    group: "Projects",
    sourceIdentifier: "app/(protected)/projects",
  },
  {
    code: "tt.project_progress",
    name: "Project Progress",
    route: "/projects",
    group: "Projects",
    sourceIdentifier: "projects:progress",
  },
  {
    code: "tt.daily_dockets",
    name: "Daily Dockets",
    route: "/projects",
    group: "Project Delivery",
    sourceIdentifier: "projects:daily-dockets",
  },
  {
    code: "tt.dayworks",
    name: "Dayworks",
    route: "/projects",
    group: "Project Delivery",
    sourceIdentifier: "projects:dayworks",
  },
  {
    code: "tt.materials",
    name: "Materials",
    route: "/projects",
    group: "Project Delivery",
    sourceIdentifier: "projects:materials",
  },
  {
    code: "tt.deliveries",
    name: "Deliveries",
    route: "/projects",
    group: "Project Delivery",
    sourceIdentifier: "projects:deliveries",
  },
  {
    code: "tt.defects",
    name: "Defects",
    route: "/projects",
    group: "Quality",
    sourceIdentifier: "projects:defects",
  },
  {
    code: "tt.rectifications",
    name: "Rectifications / Revisions",
    route: "/projects",
    group: "Quality",
    sourceIdentifier: "projects:rectifications",
  },
  {
    code: "tt.rfis",
    name: "RFIs",
    route: "/projects",
    group: "Quality",
    sourceIdentifier: "projects:rfis",
  },
  {
    code: "tt.workpack",
    name: "Workpack",
    route: "/projects",
    group: "Project Delivery",
    sourceIdentifier: "projects:workpack",
  },
  {
    code: "tt.programme",
    name: "Programme & Scheduling",
    route: "/projects",
    group: "Project Delivery",
    sourceIdentifier: "projects:programme",
  },
  {
    code: "tt.commercial",
    name: "Commercial",
    route: "/commercial",
    group: "Commercial",
    sourceIdentifier: "app/(protected)/commercial",
  },
  {
    code: "tt.assets",
    name: "Assets",
    route: "/assets",
    group: "Assets",
    sourceIdentifier: "app/(protected)/assets",
  },
  {
    code: "tt.assets.fleet_jobs",
    name: "Fleet Jobs",
    route: "/assets/fleet-jobs",
    group: "Assets",
    sourceIdentifier: "app/(protected)/assets/fleet-jobs",
  },
  {
    code: "tt.assets.vehicle_prestarts",
    name: "Vehicle Prestarts",
    route: "/assets/prestarts/vehicles",
    group: "Assets",
    sourceIdentifier: "app/(protected)/assets/prestarts/vehicles",
  },
  {
    code: "tt.assets.plant_prestarts",
    name: "Plant Prestarts",
    route: "/assets/prestarts/plant",
    group: "Assets",
    sourceIdentifier: "app/(protected)/assets/prestarts/plant",
  },
  {
    code: "tt.assets.equipment",
    name: "Equipment",
    route: "/assets/equipment",
    group: "Assets",
    sourceIdentifier: "app/(protected)/assets/equipment",
  },
  {
    code: "tt.assets.compliance",
    name: "Asset Compliance",
    route: "/assets/compliance",
    group: "Assets",
    sourceIdentifier: "app/(protected)/assets/compliance",
  },
  {
    code: "tt.assets.risk_assessments",
    name: "Risk Assessments",
    route: "/assets/risk-assessments",
    group: "Assets",
    sourceIdentifier: "app/(protected)/assets/risk-assessments",
  },
  {
    code: "tt.people",
    name: "People",
    route: "/people",
    group: "People",
    sourceIdentifier: "app/(protected)/people",
  },
  {
    code: "tt.employees",
    name: "Employees",
    route: "/employees",
    group: "People",
    sourceIdentifier: "app/(protected)/employees",
  },
  {
    code: "tt.training",
    name: "Training",
    route: "/training",
    group: "People",
    sourceIdentifier: "app/(protected)/training",
  },
  {
    code: "tt.crews",
    name: "Crews",
    route: "/crews",
    group: "People",
    sourceIdentifier: "app/(protected)/crews",
  },
  {
    code: "tt.hseq",
    name: "HSEQ",
    route: "/hseq",
    group: "HSEQ",
    sourceIdentifier: "app/(protected)/hseq",
  },
  {
    code: "tt.notifications",
    name: "Notifications",
    route: "/notifications",
    group: "General",
    sourceIdentifier: "app/(protected)/notifications",
  },
  {
    code: "tt.profile",
    name: "Profile",
    route: "/profile",
    group: "General",
    sourceIdentifier: "app/(protected)/profile",
  },
  {
    code: "tt.admin.access",
    name: "Access Control Administration",
    route: "/admin",
    group: "Administration",
    sourceIdentifier: "app/(protected)/admin",
  },
];
