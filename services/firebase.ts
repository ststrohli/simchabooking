
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, doc, getDocFromServer } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import firebaseConfig from "../firebase-applet-config.json";

// Use values from firebase-applet-config.json as the source of truth,
// but fall back to environment variables if config is missing or likely stale.
// In AI Studio, we should prefer the environment project ID if it exists.
const envProjectId = process.env.GOOGLE_CLOUD_PROJECT;
const targetProjectId = envProjectId || (firebaseConfig.projectId && !firebaseConfig.projectId.includes('TODO') ? firebaseConfig.projectId : undefined);

// Use the database ID from config if available, but allow override
// In AI Studio, we should prefer the named database if it's in the config,
// but fallback to (default) if it's missing or a placeholder.
const dbId = (firebaseConfig.firestoreDatabaseId && !firebaseConfig.firestoreDatabaseId.includes('TODO')) 
  ? firebaseConfig.firestoreDatabaseId 
  : '(default)';

const app = initializeApp({
  ...firebaseConfig,
  projectId: targetProjectId
});
export const auth = getAuth(app);

// Use a function to allow re-initialization if fallback is needed
const createFirestore = (id: string) => {
  console.log(`[Firebase] Initializing Firestore with project: ${targetProjectId}, database: ${id}`);
  return initializeFirestore(app, {
    host: "firestore.googleapis.com",
    ssl: true,
  }, id);
};

export let db = createFirestore(dbId);
export const storage = getStorage(app, `gs://${firebaseConfig.storageBucket}`);

async function testConnection() {
  let retries = 3;
  let currentDbId = dbId;
  
  while (retries > 0) {
    try {
      console.log(`[Firebase] Testing Firestore connection (Attempt ${4 - retries}/3, DB: ${currentDbId})...`);
      // Use getDocFromServer to bypass local cache and test actual connectivity
      await getDocFromServer(doc(db, 'test', 'connection')).catch(e => {
        // We only care about network errors, "not found" is actually a success for connectivity
        if (e.code === 'not-found') return;
        throw e;
      });
      console.log("[Firebase] Firestore connection test successful");
      return;
    } catch (error: any) {
      console.error(`[Firebase] Firestore connection attempt failed:`, error.message);
      
      // If we are using a named database and it's unavailable, try falling back to (default)
      if (currentDbId !== '(default)' && (error.code === 'unavailable' || error.message?.includes('unavailable'))) {
        console.warn(`[Firebase] Named database ${currentDbId} is unavailable. Attempting fallback to (default)...`);
        currentDbId = '(default)';
        db = createFirestore('(default)');
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
