import { AssetDetail } from "@/components/assets/asset-detail";

type PageProps = {
  params: Promise<{ vehicleId: string }>;
};

export default async function VehicleAssetPage({ params }: PageProps) {
  const { vehicleId } = await params;

  return <AssetDetail assetType="vehicle" assetId={vehicleId} />;
}
