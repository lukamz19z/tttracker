import { EmptyState, Page, PageHeader } from "@/components/ui/tt-ui";
export default function MaterialsAccessDenied({ importing = false }: { importing?: boolean }) {
  return <Page>
    <PageHeader title={importing ? "Materials import" : "Materials"} />
    <EmptyState title="Access denied">
      {importing ? "You do not have permission to import Materials for this project." : "You do not have permission to view Materials for this project."}
      {" Contact your organisation or project access administrator."}
    </EmptyState>
  </Page>;
}
