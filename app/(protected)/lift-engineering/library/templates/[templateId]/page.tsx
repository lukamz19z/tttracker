import { TowerTemplateDetail } from "../../[resource]/TowerTemplateDetail";

export default async function TowerTemplateDetailPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  return <TowerTemplateDetail templateId={templateId}/>;
}
