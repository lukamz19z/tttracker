import React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useAccess } from "../lib/access";

export function PermissionGate({
  permission,
  children,
  fallback,
}: {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { loading, can } = useAccess();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!can(permission)) {
    return fallback ?? (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", textAlign: "center" }}>
          You do not have access to this area.
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}
