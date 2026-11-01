import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";
import { apiFetch, apiJson } from "@/lib/api/client";
import { mobileRouteForNotification } from "@/lib/notifications/routing";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

type PushState = {
  token: string | null;
  registering: boolean;
  error: string | null;
  register: () => Promise<void>;
};

const PushContext = createContext<PushState | null>(null);

function projectId() {
  return (
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    undefined
  );
}

export function PushProvider({
  children,
}: PropsWithChildren) {
  const { session } = useAuth();
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastHandledResponse = useRef<{ id: string; at: number } | null>(null);

  const register = useCallback(async () => {
    if (!session) return;

    if (!Device.isDevice) {
      setError("Push notifications require a physical device.");
      return;
    }

    setRegistering(true);
    setError(null);

    try {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync(
          "default",
          {
            name: "TTTracker",
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 200, 250],
            sound: "default",
          },
        );
      }

      const existing =
        await Notifications.getPermissionsAsync();

      const permission =
        existing.status === "granted"
          ? existing
          : await Notifications.requestPermissionsAsync();

      if (permission.status !== "granted") {
        setError(
          "Phone notification permission has not been granted.",
        );
        return;
      }

      const easProjectId = projectId();

      if (!easProjectId) {
        throw new Error(
          "Expo EAS project ID is not configured.",
        );
      }

      const expoToken =
        await Notifications.getExpoPushTokenAsync({
          projectId: easProjectId,
        });

      const value = expoToken.data?.trim();

      if (!value) {
        throw new Error(
          "Expo did not return a push token for this device.",
        );
      }

      await apiJson<{ success: boolean; registered?: boolean }>(
        "/api/mobile/push-token",
        {
          method: "POST",
          body: JSON.stringify({
            expoPushToken: value,
            platform: Platform.OS,
            deviceLabel:
              Device.deviceName ??
              Device.modelName ??
              null,
          }),
        },
      );

      setToken(value);

      console.log(
        "TTTracker push device registered:",
        `${Platform.OS} · ${value.slice(-10)}`,
      );
    } catch (registerError) {
      const message =
        registerError instanceof Error
          ? registerError.message
          : "Push notifications could not be registered.";

      console.warn(
        "TTTracker push registration failed:",
        message,
      );

      setError(message);
    } finally {
      setRegistering(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      void register();
    } else {
      setToken(null);
      setError(null);
    }
  }, [register, session]);

  useEffect(() => {
    let active = true;
    const openResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response || !active) return;
      const id = response.notification.request.identifier;
      const now = Date.now();
      if (
        lastHandledResponse.current?.id === id &&
        now - lastHandledResponse.current.at < 2_000
      ) return;
      lastHandledResponse.current = { id, at: now };
      const route = mobileRouteForNotification(
        response.notification.request.content.data as Record<string, unknown>,
      );
      if (!route) return;
      if (String(route).startsWith("/materials/missing")) router.replace(route);
      else router.push(route);
    };
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(
        (response) => openResponse(response),
      );
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => openResponse(response))
      .catch((responseError) => {
        if (__DEV__) console.warn("Could not restore tapped notification route.", responseError);
      });

    return () => {
      active = false;
      responseSubscription.remove();
    };
  }, [router]);

  useEffect(() => {
    if (!session) return;
    let lastCheck = 0;
    const checkReceipts = () => {
      if (AppState.currentState !== "active" || Date.now() - lastCheck < 15 * 60_000) return;
      lastCheck = Date.now();
      void apiFetch("/api/mobile/push/material-receipts", { method: "POST", timeoutMs: 20_000 })
        .catch((error) => { if (__DEV__) console.debug("Material push receipt check deferred", error); });
    };
    checkReceipts();
    const subscription = AppState.addEventListener("change", (state) => { if (state === "active") checkReceipts(); });
    return () => subscription.remove();
  }, [session]);

  const value = useMemo(
    () => ({
      token,
      registering,
      error,
      register,
    }),
    [token, registering, error, register],
  );

  return (
    <PushContext.Provider value={value}>
      {children}
    </PushContext.Provider>
  );
}

export function usePush() {
  const value = useContext(PushContext);

  if (!value) {
    throw new Error(
      "usePush must be used inside PushProvider.",
    );
  }

  return value;
}
