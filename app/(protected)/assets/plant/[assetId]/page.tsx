import { AssetDetail } from "@/components/assets/asset-detail";

type PageProps = { params: Promise<{ assetId: string }> };

export default async function PlantAssetPage({ params }: PageProps) {
  const { assetId } = await params;
  return <AssetDetail assetType="plant" assetId={assetId} />;
}
