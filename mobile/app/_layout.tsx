import "react-native-gesture-handler";
import "react-native-url-polyfill/auto";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { enableFreeze } from "react-native-screens";

import { AuthProvider } from "@/contexts/AuthContext";
import { PushProvider } from "@/contexts/PushContext";
import { SyncProvider } from "@/contexts/SyncContext";
import { AccessProvider } from "@/lib/access";

enableFreeze(true);

export default function RootLayout() {
  return (
    <AuthProvider>
      <AccessProvider>
        <SyncProvider>
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
        </SyncProvider>
      </AccessProvider>
    </AuthProvider>
  );
}
