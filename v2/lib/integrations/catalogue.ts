export const integrationProviders = [
  { key: "sharepoint", name: "SharePoint", description: "Microsoft 365 document storage", icon: "MS" },
  { key: "xero", name: "Xero", description: "Accounting, payroll and commercial integration", icon: "X" },
] as const;

// Settings view is catalogue access, not permission to read provider details.
export function canViewIntegrationCatalogue(permissions: Record<string, boolean>) {
  return permissions["organisation.settings.view"] === true ||
    integrationProviders.some(provider => permissions[`integrations.${provider.key}.view`] === true);
}
