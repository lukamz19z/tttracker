import { AssetMasterForm } from "@/components/assets/asset-master-form";

type PageProps = { params: Promise<{ vehicleId: string }> };

export default async function EditVehiclePage({ params }: PageProps) {
  const { vehicleId } = await params;
  return <AssetMasterForm assetType="vehicle" mode="edit" assetId={vehicleId} />;
}
