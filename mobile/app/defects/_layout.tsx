import { Stack } from "expo-router";

import { QualityProvider } from "@/contexts/QualityContext";

export default function QualityRouteLayout() {
  return (
    <QualityProvider>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </QualityProvider>
  );
}
