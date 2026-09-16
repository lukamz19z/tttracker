import { AssetMasterForm } from "@/components/assets/asset-master-form";

type PageProps = { params: Promise<{ assetId: string }> };

export default async function EditPlantPage({ params }: PageProps) {
  const { assetId } = await params;
  return <AssetMasterForm assetType="plant" mode="edit" assetId={assetId} />;
}
