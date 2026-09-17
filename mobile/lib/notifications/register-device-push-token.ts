import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { supabase } from "@/lib/supabase";

const GENERAL_NOTIFICATION_CHANNEL_ID = "tttracker-general";

type RegistrationResult =
  | {
      registered: true;
      expoPushToken: string;
    }
  | {
      registered: false;
      reason:
        | "permission_not_granted"
        | "not_signed_in"
        | "project_id_missing"
        | "no_expo_token";
    };

function getProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    null
  );
}

export async function registerDevicePushToken(): Promise<RegistrationResult> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(
      GENERAL_NOTIFICATION_CHANNEL_ID,
      {
        name: "TTTracker notifications",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
      },
    );
  }

  const currentPermission =
    await Notifications.getPermissionsAsync();

  let granted = currentPermission.granted;

  if (!granted) {
    const requested =
      await Notifications.requestPermissionsAsync();
    granted = requested.granted;
  }

  if (!granted) {
    return {
      registered: false,
      reason: "permission_not_granted",
    };
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;

  if (!user) {
    return {
      registered: false,
      reason: "not_signed_in",
    };
  }

  const projectId = getProjectId();

  if (!projectId) {
    return {
      registered: false,
      reason: "project_id_missing",
    };
  }

  const tokenResult =
    await Notifications.getExpoPushTokenAsync({
      projectId,
    });

  const expoPushToken = tokenResult.data?.trim();

  if (!expoPushToken) {
    return {
      registered: false,
      reason: "no_expo_token",
    };
  }

  const { error } = await supabase
    .from("user_push_tokens")
    .upsert(
      {
        user_id: user.id,
        expo_push_token: expoPushToken,
        platform: Platform.OS,
        device_label: null,
        active: true,
        last_seen_at: new Date().toISOString(),
      },
      {
        onConflict: "user_id,expo_push_token",
      },
    );

  if (error) throw error;

  return {
    registered: true,
    expoPushToken,
  };
}
