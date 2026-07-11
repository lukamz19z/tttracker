import { Redirect } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/contexts/AuthContext";

export default function LoginScreen() {
  const { session, loading, signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) {
    return <Redirect href="/(tabs)" />;
  }

  async function handleSignIn() {
    if (!email.trim() || !password) {
      Alert.alert(
        "Login required",
        "Enter your email address and password.",
      );
      return;
    }

    try {
      setSubmitting(true);
      await signIn(email, password);
    } catch (error) {
      Alert.alert(
        "Unable to sign in",
        error instanceof Error
          ? error.message
          : "Check your details and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>TT</Text>
          </View>

          <Text style={styles.title}>TTTracker</Text>

          <Text style={styles.subtitle}>
            BC Contracting field operations
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sign in</Text>

          <Text style={styles.label}>Email address</Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!submitting}
            style={styles.input}
          />

          <Text style={styles.label}>Password</Text>

          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry
            editable={!submitting}
            onSubmitEditing={() => void handleSignIn()}
            style={styles.input}
          />

          <Pressable
            onPress={() => void handleSignIn()}
            disabled={submitting}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              submitting && styles.buttonDisabled,
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.footer}>
          Authorised BC Contracting users only
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  brand: {
    alignItems: "center",
    marginBottom: 30,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    marginBottom: 15,
  },
  logoText: {
    color: "#ffffff",
    fontSize: 25,
    fontWeight: "900",
  },
  title: {
    color: "#0f172a",
    fontSize: 30,
    fontWeight: "900",
  },
  subtitle: {
    color: "#64748b",
    fontSize: 14,
    marginTop: 5,
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    padding: 20,
  },
  cardTitle: {
    color: "#0f172a",
    fontSize: 21,
    fontWeight: "800",
    marginBottom: 20,
  },
  label: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 7,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    paddingHorizontal: 15,
    color: "#0f172a",
    fontSize: 16,
    marginBottom: 17,
  },
  button: {
    minHeight: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
    marginTop: 4,
  },
  buttonPressed: {
    opacity: 0.86,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  footer: {
    color: "#94a3b8",
    textAlign: "center",
    fontSize: 12,
    marginTop: 22,
  },
});