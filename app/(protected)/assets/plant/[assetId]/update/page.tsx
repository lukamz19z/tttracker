import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ assetId: string }>;
};

export default async function LegacyPlantUpdatePage({ params }: PageProps) {
  const { assetId } = await params;
  redirect(`/assets/update?assetType=plant&assetId=${encodeURIComponent(assetId)}`);
}
