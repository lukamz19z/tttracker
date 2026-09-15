import { redirect } from "next/navigation";

export default async function TowerModificationsRedirect({
  params,
}: {
  params: Promise<{ projectId: string; towerId: string }>;
}) {
  const { projectId, towerId } = await params;
  redirect(`/project/${projectId}/tower/${towerId}/revisions`);
}
