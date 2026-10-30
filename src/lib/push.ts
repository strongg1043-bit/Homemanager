import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';

export type PushPermissionResult = 'granted' | 'denied' | 'unsupported' | 'not-configured';

/**
 * Requests notification permission, registers the device for push, and
 * saves the FCM token onto the signed-in user's profile. Call this from a
 * user-initiated action (a button click) — browsers require that for the
 * permission prompt.
 */
export async function enablePushNotifications(uid: string): Promise<PushPermissionResult> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
  if (!vapidKey) {
    console.error('VITE_FIREBASE_VAPID_KEY is not set — push notifications are disabled.');
    return 'not-configured';
  }

  const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging();
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  if (!token) return 'denied';

  await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) });
  return 'granted';
}

/** Returns the current browser Notification permission, or null if unsupported. */
export function getPushPermissionState(): NotificationPermission | null {
  if (!('Notification' in window)) return null;
  return Notification.permission;
}
