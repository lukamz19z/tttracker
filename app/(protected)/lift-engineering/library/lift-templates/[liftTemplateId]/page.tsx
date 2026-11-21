import { LiftTemplateDetail } from "../../[resource]/LiftTemplateDetail";

export default async function LiftTemplateDetailPage({ params }: { params: Promise<{ liftTemplateId: string }> }) {
  const { liftTemplateId } = await params;
  return <LiftTemplateDetail liftTemplateId={liftTemplateId}/>;
}
