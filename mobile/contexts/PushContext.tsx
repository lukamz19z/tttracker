import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";
import { apiJson, jsonBody } from "@/lib/api/client";
import { mobileRouteForNotification } from "@/lib/notifications/routing";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
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

export function PushProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = useCallback(async () => {
    if (!session || !Device.isDevice) return;
    setRegistering(true);
    setError(null);

    try {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "TTTracker",
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }

      const existing = await Notifications.getPermissionsAsync();
      const permission =
        existing.status === "granted"
          ? existing
          : await Notifications.requestPermissionsAsync();

      if (permission.status !== "granted") return;

      const expoToken = await Notifications.getExpoPushTokenAsync({
        projectId: projectId(),
      });
      const value = expoToken.data;
      setToken(value);

      await apiJson<{ success: boolean }>("/api/mobile/push-token", {
        method: "POST",
        body: jsonBody({
          expoPushToken: value,
          platform: Platform.OS,
          deviceLabel: Device.deviceName ?? Device.modelName ?? null,
        }),
      });
    } catch (registerError) {
      setError(registerError instanceof Error ? registerError.message : "Push notifications could not be registered.");
    } finally {
      setRegistering(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) void register();
    else setToken(null);
  }, [register, session]);

  useEffect(() => {
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = mobileRouteForNotification(
        response.notification.request.content.data as Record<string, unknown>,
      );
      if (route) router.push(route);
    });
    return () => responseSubscription.remove();
  }, [router]);

  const value = useMemo(() => ({ token, registering, error, register }), [token, registering, error, register]);
  return <PushContext.Provider value={value}>{children}</PushContext.Provider>;
}

export function usePush() {
  const value = useContext(PushContext);
  if (!value) throw new Error("usePush must be used inside PushProvider.");
  return value;
}
