import * as Device from 'expo-device';
import {
  AndroidImportance,
  setNotificationChannelAsync,
  setNotificationHandler,
  requestPermissionsAsync,
  getPermissionsAsync,
  getExpoPushTokenAsync,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  type Notification,
} from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { getSupabase } from '../supabase/client';
import { env } from '../config/env';

setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await setNotificationChannelAsync('bookings', {
      name: 'Booking updates',
      importance: AndroidImportance.HIGH,
      description: 'Status updates for your Mechanic Dekho bookings.',
    });
  }
}

/**
 * Register for push notifications. Stores the Expo push token in push_tokens
 * (upsert on conflict). Safe to call on every launch; no-ops on simulators
 * and when the EAS project id is not configured yet.
 */
export async function registerForPushNotifications(userId: string): Promise<void> {
  if (!Device.isDevice) return;
  await ensureAndroidChannel();

  const { status: existing } = await getPermissionsAsync();
  const finalStatus =
    existing === 'granted' ? existing : (await requestPermissionsAsync()).status;
  if (finalStatus !== 'granted') return;

  const projectId = env.easProjectId;
  if (!projectId) return; // Push needs an EAS project id; skip until configured.

  const token = (await getExpoPushTokenAsync({ projectId })).data;
  const { error } = await getSupabase().from('push_tokens').upsert(
    {
      user_id: userId,
      expo_push_token: token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    },
    { onConflict: 'user_id,expo_push_token' },
  );
  if (error) {
    console.warn('Could not save push token', error.message);
  }
}

/** Remove stored tokens on sign-out so a signed-out device gets nothing. */
export async function unregisterPushTokens(userId: string): Promise<void> {
  await getSupabase().from('push_tokens').delete().eq('user_id', userId);
}

/**
 * Wire foreground notification display + tap-to-deep-link.
 * Returns an unsubscribe function.
 */
export function subscribeToNotifications(): () => void {
  const received = addNotificationReceivedListener((_n: Notification) => {
    // Foreground banner is handled by setNotificationHandler above.
  });
  const responded = addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as {
      booking_id?: string;
      role?: string;
    };
    if (data?.booking_id) {
      const path =
        data.role === 'provider'
          ? `/(provider)/job/${data.booking_id}`
          : `/(customer)/booking/${data.booking_id}`;
      router.push(path as never);
    }
  });
  return () => {
    received.remove();
    responded.remove();
  };
}
