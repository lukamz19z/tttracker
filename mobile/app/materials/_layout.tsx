import { Stack } from "expo-router";

import { MaterialsProvider } from "@/contexts/MaterialsContext";

export default function MaterialsLayout() {
  return (
    <MaterialsProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </MaterialsProvider>
  );
}
