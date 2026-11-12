import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, Analytics, logEvent } from "firebase/analytics";

export const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyCVhlowc7oxvS-idKS1XYzxocS1TJHvzRg",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "devcentral-190fe.firebaseapp.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "devcentral-190fe",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "devcentral-190fe.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "381168720156",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:381168720156:web:b4f919374dddc3c59642d9",
  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-9P4K029JCV",
};

// Initialize Firebase (singleton-safe for Next.js SSR & HMR)
export const firebaseApp: FirebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let analyticsInstance: Analytics | null = null;

export async function initFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;
  if (analyticsInstance) return analyticsInstance;
  try {
    const supported = await isSupported();
    if (supported) {
      analyticsInstance = getAnalytics(firebaseApp);
      return analyticsInstance;
    }
  } catch {
    // ignore analytics block by adblockers
  }
  return null;
}

export async function trackDashboardEvent(
  eventName: string,
  params?: Record<string, any>
) {
  try {
    const analytics = await initFirebaseAnalytics();
    if (analytics) {
      logEvent(analytics, eventName, params);
    }
  } catch {
    // ignore
  }
}
