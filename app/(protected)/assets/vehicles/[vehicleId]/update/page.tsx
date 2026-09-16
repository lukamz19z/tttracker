import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ vehicleId: string }>;
};

export default async function LegacyVehicleUpdatePage({ params }: PageProps) {
  const { vehicleId } = await params;
  redirect(`/assets/update?assetType=vehicle&assetId=${encodeURIComponent(vehicleId)}`);
}
