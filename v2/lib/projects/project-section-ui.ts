import {
  Boxes,
  ClipboardList,
  Gauge,
  HardHat,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

/**
 * Stable UI contract for project section keys.
 *
 * The database decides whether a section is enabled / ready for the organisation
 * and project. This file only maps a stable feature key to a route and icon.
 */
export type ProjectSectionUiDefinition = {
  key: string;
  fallbackLabel: string;
  path: string;
  icon: LucideIcon;
};

export const PROJECT_SECTION_UI: Record<
  string,
  ProjectSectionUiDefinition
> = {
  overview: {
    key: "overview",
    fallbackLabel: "Overview",
    path: "",
    icon: Gauge,
  },
  towers: {
    key: "towers",
    fallbackLabel: "Towers",
    path: "towers",
    icon: HardHat,
  },
  forecasting: {
    key: "forecasting",
    fallbackLabel: "Forecasting",
    path: "forecasting",
    icon: Gauge,
  },
  daily_dockets: {
    key: "daily_dockets",
    fallbackLabel: "Daily Dockets",
    path: "daily-dockets",
    icon: ClipboardList,
  },
  materials: {
    key: "materials",
    fallbackLabel: "Materials",
    path: "materials",
    icon: Boxes,
  },
  defects: {
    key: "defects",
    fallbackLabel: "Defects",
    path: "defects",
    icon: TriangleAlert,
  },
};

export const PROJECT_OPERATION_SECTION_ORDER = [
  "overview",
  "towers",
  "forecasting",
  "daily_dockets",
  "materials",
  "defects",
] as const;
