export interface FirebaseUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
}

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

let sdkPromise: Promise<{
  app: any;
  auth: any;
  authMod: any;
  analyticsMod: any;
}> | null = null;

async function loadFirebaseBrowserSdk() {
  if (typeof window === "undefined") return null;
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const dynamicImport = new Function("u", "return import(u)") as (
        u: string
      ) => Promise<any>;
      const appMod = await dynamicImport(
        "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js"
      );
      const authMod = await dynamicImport(
        "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js"
      );
      let analyticsMod: any = null;
      try {
        analyticsMod = await dynamicImport(
          "https://www.gstatic.com/firebasejs/11.0.1/firebase-analytics.js"
        );
      } catch {
        // ignore analytics block
      }
      const app =
        appMod.getApps().length > 0
          ? appMod.getApp()
          : appMod.initializeApp(firebaseConfig);
      const auth = authMod.getAuth(app);
      return { app, auth, authMod, analyticsMod };
    })();
  }
  return sdkPromise;
}

export function subscribeFirebaseAuth(
  callback: (user: FirebaseUser | null) => void
): () => void {
  if (typeof window === "undefined") return () => {};
  let unsub: (() => void) | null = null;
  let cancelled = false;

  loadFirebaseBrowserSdk()
    .then((sdk) => {
      if (!sdk || cancelled) return;
      unsub = sdk.authMod.onAuthStateChanged(
        sdk.auth,
        (u: FirebaseUser | null) => {
          callback(u);
        }
      );
    })
    .catch(() => {
      callback(null);
    });

  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

export async function signInWithGoogle(): Promise<FirebaseUser> {
  const sdk = await loadFirebaseBrowserSdk();
  if (!sdk) throw new Error("Firebase SDK indisponível fora do navegador");
  const provider = new sdk.authMod.GoogleAuthProvider();
  const result = await sdk.authMod.signInWithPopup(sdk.auth, provider);
  return result.user;
}

export async function signOutFirebase(): Promise<void> {
  const sdk = await loadFirebaseBrowserSdk();
  if (!sdk) return;
  await sdk.authMod.signOut(sdk.auth);
}

export async function getFirebaseIdToken(): Promise<string> {
  const sdk = await loadFirebaseBrowserSdk();
  const user: FirebaseUser | null = sdk?.auth?.currentUser || null;
  if (!user) {
    throw new Error("Entre no DevCentral para consultar os projetos.");
  }
  return user.getIdToken();
}

export async function initFirebaseAnalytics() {
  try {
    const sdk = await loadFirebaseBrowserSdk();
    if (sdk?.analyticsMod) {
      const supported = await sdk.analyticsMod.isSupported();
      if (supported) {
        return sdk.analyticsMod.getAnalytics(sdk.app);
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function trackDashboardEvent(
  eventName: string,
  params?: Record<string, any>
) {
  try {
    const sdk = await loadFirebaseBrowserSdk();
    const analytics = await initFirebaseAnalytics();
    if (sdk?.analyticsMod && analytics) {
      sdk.analyticsMod.logEvent(analytics, eventName, params);
    }
  } catch {
    // ignore
  }
}
