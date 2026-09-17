import { Slot } from "expo-router";

import { QualityProvider } from "@/contexts/QualityContext";

export default function DefectsLayout() {
  return (
    <QualityProvider>
      <Slot />
    </QualityProvider>
  );
}
