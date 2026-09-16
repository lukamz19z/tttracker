import { UpdateAssetForm } from "@/components/assets/update-asset-form";
import type { AssetType } from "@/lib/assets/types";

type PageProps = {
  searchParams: Promise<{
    assetType?: string;
    assetId?: string;
  }>;
};

export default async function UpdateAssetPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const initialAssetType: AssetType =
    query.assetType === "plant" ? "plant" : "vehicle";

  return (
    <UpdateAssetForm
      initialAssetType={initialAssetType}
      initialAssetId={query.assetId ?? ""}
    />
  );
}
