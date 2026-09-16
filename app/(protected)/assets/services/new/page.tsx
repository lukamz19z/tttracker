import { AssetServiceForm } from "@/components/assets/service-form";
import type { AssetType } from "@/lib/assets/types";

type PageProps = {
  searchParams: Promise<{
    assetType?: string;
    assetId?: string;
    recordType?: string;
  }>;
};

export default async function NewAssetServicePage({
  searchParams,
}: PageProps) {
  const query = await searchParams;

  const initialAssetType: AssetType =
    query.assetType === "plant" ? "plant" : "vehicle";

  return (
    <AssetServiceForm
      initialAssetType={initialAssetType}
      initialAssetId={query.assetId ?? ""}
      initialRecordType={query.recordType ?? "service"}
    />
  );
}
