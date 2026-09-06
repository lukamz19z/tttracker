import { Redirect, useLocalSearchParams } from "expo-router";

export default function DailyDocketReviewDeepLinkPage() {
  const params = useLocalSearchParams<{
    projectId?: string | string[];
    towerId?: string | string[];
    docketId?: string | string[];
  }>();

  const projectId = Array.isArray(params.projectId)
    ? params.projectId[0]
    : params.projectId;

  const towerId = Array.isArray(params.towerId)
    ? params.towerId[0]
    : params.towerId;

  const docketId = Array.isArray(params.docketId)
    ? params.docketId[0]
    : params.docketId;

  if (!projectId || !towerId || !docketId) {
    return <Redirect href="/(drawer)/daily-dockets" />;
  }

  return (
    <Redirect
      href={{
        pathname: "/(drawer)/daily-dockets",
        params: {
          projectId,
          towerId,
          docketId,
          source: "review-link",
        },
      }}
    />
  );
}