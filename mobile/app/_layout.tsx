import "react-native-gesture-handler";
import "react-native-url-polyfill/auto";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AuthProvider } from "@/contexts/AuthContext";
import { PushProvider } from "@/contexts/PushContext";
import { SyncProvider } from "@/contexts/SyncContext";
import { MaterialsProvider } from "@/contexts/MaterialsContext";
import { QualityProvider } from "@/contexts/QualityContext";
import { AccessProvider } from "@/lib/access";

export default function RootLayout() {
  return (
    <AuthProvider>
      <AccessProvider>
        <SyncProvider>
          <MaterialsProvider>
            <QualityProvider>
              <PushProvider>
                <StatusBar style="dark" />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="login" />
                  <Stack.Screen name="(drawer)" />
                  <Stack.Screen name="training" />
                  <Stack.Screen name="expenses" />
                  <Stack.Screen name="invoices" />
                  <Stack.Screen name="approvals" />
                  <Stack.Screen name="materials" />
                  <Stack.Screen name="revisions" />
                  <Stack.Screen name="defects" />
                  <Stack.Screen name="project" />
                </Stack>
              </PushProvider>
            </QualityProvider>
          </MaterialsProvider>
        </SyncProvider>
      </AccessProvider>
    </AuthProvider>
  );
}
