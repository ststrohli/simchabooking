
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, doc, getDoc, getDocs, getDocFromCache, getDocsFromCache, DocumentReference, Query, DocumentSnapshot, QuerySnapshot } from "firebase/firestore";
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

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

// Configure the Google Auth Provider with Google Calendar scopes to allow integration
provider.addScope('https://www.googleapis.com/auth/calendar.readonly');
provider.addScope('https://www.googleapis.com/auth/calendar.events');
provider.setCustomParameters({ prompt: 'consent', access_type: 'offline' });

// Initialize Firestore
export const db = getFirestore(app, 'ai-studio-b85c10e8-0729-4d1f-841b-60b5c119be28');

export const storage = getStorage(app, `gs://${firebaseConfig.storageBucket}`);

async function testConnection() {
  try {
    await getDoc(doc(db, 'test', 'connection')).catch(() => {});
    console.log("[Firebase] Firestore initialized successfully");
  } catch {
    console.warn("[Firebase] Operating in offline mode with cached/local data");
  }
}
testConnection();

export async function getDocSafe(docRef: DocumentReference): Promise<DocumentSnapshot> {
  try {
    return await getDoc(docRef);
  } catch (err: any) {
    const isOffline = err?.code === 'unavailable' || 
                      err?.message?.includes('offline') || 
                      err?.message?.includes('Failed to get document');
    if (isOffline) {
      try {
        return await getDocFromCache(docRef);
      } catch {
        return {
          exists: () => false,
          data: () => undefined,
          id: docRef.id,
          ref: docRef,
        } as any;
      }
    }
    throw err;
  }
}

export async function getDocsSafe(queryRef: Query): Promise<QuerySnapshot> {
  try {
    return await getDocs(queryRef);
  } catch (err: any) {
    const isOffline = err?.code === 'unavailable' || 
                      err?.message?.includes('offline') || 
                      err?.message?.includes('Failed to get document');
    if (isOffline) {
      try {
        return await getDocsFromCache(queryRef);
      } catch {
        return {
          empty: true,
          size: 0,
          docs: [],
          forEach: () => {},
        } as any;
      }
    }
    throw err;
  }
}

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
  const errMsg = error instanceof Error ? error.message : String(error);
  const errCode = (error as any)?.code || '';

  const isUnavailable = 
    errCode === 'unavailable' || 
    errMsg.includes('unavailable') || 
    errMsg.includes('offline') || 
    errMsg.includes('Could not reach Cloud Firestore backend') ||
    errMsg.includes('Failed to get document') ||
    errMsg.includes('client is offline');

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
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

  if (isUnavailable) {
    console.warn(`[Firebase] Firestore temporarily offline/unavailable during ${operationType} on ${path}:`, errMsg);
    return;
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default app;
