import { Redirect, type Href } from "expo-router";
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";

export default function IndexScreen() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href={"/login" as Href} />;
  }

  return <Redirect href="/(tabs)" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
  },
});