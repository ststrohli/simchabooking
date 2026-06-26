
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDocFromServer } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import appletConfig from "../firebase-applet-config.json";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: "AIzaSyDNobx7D28xdpn83FzroTeBeD0f0R-8uU4",
  authDomain: "simcha-booking-2748d.firebaseapp.com",
  projectId: "simcha-booking-2748d",
  storageBucket: "simcha-booking-2748d.firebasestorage.app",
  messagingSenderId: "404525970453",
  appId: "1:404525970453:web:7ae47f8cd51a208e554a1c",
  measurementId: "G-SP3MFEZFYP"
};

const targetProjectId = firebaseConfig.projectId;

// Explicitly use the database ID requested by the user for this AI Studio environment
const dbId = 'ai-studio-b85c10e8-0729-4d1f-841b-60b5c119be28';

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

// Configure the Google Auth Provider with Google Calendar scopes to allow integration
provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
provider.addScope('https://www.googleapis.com/auth/calendar.events');
provider.setCustomParameters({ prompt: 'consent', access_type: 'offline' });

// Use a function to allow re-initialization if fallback is needed
const createFirestore = (id?: string) => {
  console.log(`[Firebase] Initializing Firestore with project: ${targetProjectId}, database: ${id || '(default)'}`);
  try {
    const isIframe = typeof window !== 'undefined' && window.self !== window.top;
    if (isIframe) {
      console.log("[Firebase] Running inside iframe - using memory/default cache to avoid iframe storage partitioning offline lock.");
      return initializeFirestore(app, {
        host: "firestore.googleapis.com",
        ssl: true,
        experimentalForceLongPolling: true
      }, id);
    }
    return initializeFirestore(app, {
      host: "firestore.googleapis.com",
      ssl: true,
      experimentalForceLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      })
    }, id);
  } catch (err: any) {
    console.warn("[Firebase] Failed to initialize Firestore with persistent local cache. Falling back to default cache:", err.message);
    return initializeFirestore(app, {
      host: "firestore.googleapis.com",
      ssl: true,
      experimentalForceLongPolling: true
    }, id);
  }
};

export let db = createFirestore(dbId);
export const storage = getStorage(app, `gs://${firebaseConfig.storageBucket}`);

async function testConnection() {
  let retries = 3;
  let currentDbId: string | undefined = dbId;
  
  while (retries > 0) {
    try {
      console.log(`[Firebase] Testing Firestore connection (Attempt ${4 - retries}/3, DB: ${currentDbId || '(default)'})...`);
      // Use getDocFromServer to bypass local cache and test actual connectivity
      await getDocFromServer(doc(db, 'test', 'connection')).catch(e => {
        // We only care about network errors, "not found" is actually a success for connectivity
        if (e.code === 'not-found') return;
        throw e;
      });
      console.log("[Firebase] Firestore connection test successful");
      return;
    } catch (error: any) {
      if (
        error.message?.includes('offline') || 
        error.message?.includes('Failed to get document') || 
        error.code === 'unavailable' || 
        error.message?.includes('unavailable')
      ) {
        console.warn(`[Firebase] Firestore connection check: Client is offline or Firestore is temporarily unavailable.`);
      } else {
        console.error(`[Firebase] Firestore connection attempt failed:`, error.message);
      }
      
      // If we are using a named database and it's unavailable, try falling back to (default)
      if (currentDbId && (
        error.code === 'unavailable' || 
        error.message?.includes('unavailable') || 
        error.message?.includes('offline') || 
        error.message?.includes('Failed to get document')
      )) {
        console.warn(`[Firebase] Named database ${currentDbId} is unavailable. Attempting fallback to default database...`);
        currentDbId = undefined;
        db = createFirestore(undefined);
        // Reset retries for the fallback attempt
        retries = 2; 
        continue;
      }
      
      retries--;
      if (retries > 0) {
        console.log("[Firebase] Retrying in 2 seconds...");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default app;
