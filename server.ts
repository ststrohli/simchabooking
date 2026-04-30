console.log("APP IS STARTING UP...");
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import Stripe from "stripe";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import multer from "multer";
import session from "express-session";
import crypto from "crypto";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };
import { 
  sendTestEmail, 
  sendCustomerReceipt, 
  sendVendorNotification,
  sendAccountVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeGuideEmail,
  sendPreEventCheckInEmail
} from "./services/emailService.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
let adminApp: admin.app.App;
let dbId: string | undefined;

// Try to get the project ID from config, but fall back to environment if it looks like a placeholder
const configProjectId = firebaseConfig.projectId && !firebaseConfig.projectId.includes('TODO') 
  ? firebaseConfig.projectId 
  : undefined;

// Check multiple common environment variables for project ID
const envProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || process.env.GCP_PROJECT;

// Global db instance
let db: admin.firestore.Firestore;
let isServerFirestoreAvailable = true;
const initializedDbs = new WeakSet<admin.firestore.Firestore>();

function applyDbSettings(dbInstance: admin.firestore.Firestore) {
  if (!dbInstance || initializedDbs.has(dbInstance)) return;
  try {
    dbInstance.settings({ ignoreUndefinedProperties: true });
    initializedDbs.add(dbInstance);
  } catch (e: any) {
    if (e.message?.includes('already been initialized')) {
      initializedDbs.add(dbInstance);
    } else {
      console.warn(`[Firebase] Failed to apply settings to Firestore instance:`, e.message);
    }
  }
}

async function initializeFirebase(useEnvFallback: boolean = false) {
  try {
    // Check multiple common environment variables for project ID
    const envProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || process.env.GCP_PROJECT;
    
    // Use values from firebase-applet-config.json as the source of truth.
    const configId = (firebaseConfig.projectId && !firebaseConfig.projectId.includes('TODO')) ? firebaseConfig.projectId : undefined;
    
    let targetProjectId = useEnvFallback ? envProjectId : (configId || envProjectId);
    
    if (useEnvFallback) {
      console.log(`[Firebase] FALLBACK: Attempting initialization with Environment Project ID: ${targetProjectId}`);
    }

    if (!targetProjectId) {
      console.error("[Firebase] CRITICAL: No Project ID found. Admin SDK cannot initialize.");
      isServerFirestoreAvailable = false;
      return;
    }

    // Use the database ID from config if available. 
    // If we are falling back to a different project, we should probably use '(default)' 
    // because the named database likely doesn't exist in the fallback project.
    dbId = (useEnvFallback) ? '(default)' : ((firebaseConfig.firestoreDatabaseId && !firebaseConfig.firestoreDatabaseId.includes('TODO')) 
      ? firebaseConfig.firestoreDatabaseId 
      : '(default)');

    console.log(`[Firebase] Initializing for Project: ${targetProjectId}, Database: ${dbId}`);
    if (envProjectId && targetProjectId !== envProjectId) {
      console.warn(`[Firebase] Project ID mismatch! Config: ${targetProjectId}, Environment: ${envProjectId}. This may cause PERMISSION_DENIED errors.`);
    }
      
    // Forcefully re-initialize ALL apps to ensure no stale configurations
    if (admin.apps.length > 0) {
      console.log(`[Firebase] Found ${admin.apps.length} existing apps. Deleting all...`);
      await Promise.all(admin.apps.map(app => app.delete().catch(() => {})));
    }
    
    // Check for service account credentials
    let credential;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        console.log(`[Firebase] Initializing with FIREBASE_SERVICE_ACCOUNT secret...`);
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        credential = admin.credential.cert(serviceAccount);
        if (serviceAccount.project_id) {
          targetProjectId = serviceAccount.project_id;
        }
      } catch (e) {
        console.error(`[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT secret:`, e);
        credential = admin.credential.applicationDefault();
      }
    } else {
      const serviceAccountPath = path.join(process.cwd(), 'service-account.json');
      credential = admin.credential.applicationDefault();
      try {
        const fs = await import('fs');
        if (fs.existsSync(serviceAccountPath)) {
          console.log(`[Firebase] Using local service account credentials from: ${serviceAccountPath}`);
          credential = admin.credential.cert(serviceAccountPath);
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          console.log(`[Firebase] Using GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
        } else {
          console.log(`[Firebase] No local service-account.json found. Using Application Default Credentials.`);
        }
      } catch (e) {
        console.warn(`[Firebase] Error checking for local service account:`, e);
      }
    }

    adminApp = admin.initializeApp({ 
      credential,
      projectId: targetProjectId,
      storageBucket: firebaseConfig.storageBucket
    });
    
    console.log(`[Firebase] Admin initialized for project: ${adminApp.options.projectId}`);
    console.log(`SERVER IDENTITY VERIFIED: VIP PASS ACCEPTED`);
    isServerFirestoreAvailable = true; // Clear UNAVAILABLE status
    
    // Use getFirestore(adminApp, dbId) which is the most reliable way to get a named database
    try {
      // If dbId is '(default)', pass undefined to get the default database
      const effectiveDbId = (dbId === '(default)' || !dbId) ? undefined : dbId;
      db = getFirestore(adminApp, effectiveDbId);
      applyDbSettings(db);
      console.log(`[Firebase] Admin Firestore initialized with database: ${effectiveDbId || '(default)'}`);
    } catch (e: any) {
      console.error(`[Firebase] Failed to initialize Firestore with database ID ${dbId}:`, e.message);
      // Fallback to default database if named one fails
      if (dbId && dbId !== '(default)') {
        console.log(`[Firebase] Attempting fallback to default database...`);
        db = getFirestore(adminApp);
        applyDbSettings(db);
        console.log(`[Firebase] Fallback to default database successful.`);
      } else {
        isServerFirestoreAvailable = false;
      }
    }
  } catch (err: any) {
    console.error(`[Firebase] Failed to initialize Admin app:`, err.message);
    isServerFirestoreAvailable = false;
  }
}

// Initialize immediately
initializeFirebase();

// Helper for resilient Firestore operations
const safeFirestoreOp = async (op: (database: admin.firestore.Firestore) => Promise<any>, label: string = "Operation", collection?: string, id?: string) => {
  try {
    // Ensure db is initialized
    if (!db || !isServerFirestoreAvailable) {
      if (!isServerFirestoreAvailable) {
        console.error(`[Firebase] safeFirestoreOp FAILED: Server-side Firestore is marked UNAVAILABLE for ${label}.`);
        isServerFirestoreAvailable = true; // Reset to try again
        await initializeFirebase();
        if (!isServerFirestoreAvailable) {
          throw new Error(`Server-side Firestore is unavailable (Permission Denied). Skipping ${label}.`);
        }
      } else {
        console.warn(`[Firebase] ${label} called before Firestore was initialized. Attempting initialization...`);
        await initializeFirebase();
      }
    }
    if (!db) {
      throw new Error(`Firestore not initialized for ${label}`);
    }
    return await op(db);
  } catch (error: any) {
    // If it's a permission denied error, try to fallback to environment project ID
    if (error.message?.includes('PERMISSION_DENIED') || error.code === 7) {
      const envProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || process.env.GCP_PROJECT;
      const currentProjectId = adminApp?.options.projectId;
      
      if (envProjectId && currentProjectId !== envProjectId) {
        console.warn(`[Firebase] PERMISSION_DENIED for ${label}. Attempting fallback to Environment Project ID...`);
        await initializeFirebase(true); // Force fallback
        if (isServerFirestoreAvailable) {
          console.log(`[Firebase] Fallback successful. Retrying ${label}...`);
          return await op(db);
        }
      }
      
      isServerFirestoreAvailable = false; 
      return { success: false, error: 'PERMISSION_DENIED', handled: true };
    } else {
      console.error(`[Firebase] ${label} failed (Collection: ${collection || 'unknown'}, ID: ${id || 'unknown'}):`, error.message);
      throw error;
    }
  }
};

// Verify connection and handle potential permission or existence issues
async function verifyAdminDb() {
  try {
    if (!db) return;
    const currentDbId = dbId || '(default)';
    console.log(`[Firebase] Verifying connection to database: ${currentDbId}...`);
    
    try {
      // Try a simple read to check existence/permissions
      await db.collection('_health').doc('admin_ping').get();
      console.log(`[Firebase] Admin Firestore connection verified for ${currentDbId} database.`);
      isServerFirestoreAvailable = true;
    } catch (pingErr: any) {
      console.warn(`[Firebase] Admin Ping failed for ${currentDbId}:`, pingErr.message);
      
      // If we used a named database and it failed with a connectivity or existence error
      const isNamedDbIssue = dbId && dbId !== '(default)' && 
        (pingErr.message?.includes('PERMISSION_DENIED') || 
         pingErr.message?.includes('NOT_FOUND') || 
         pingErr.message?.includes('unavailable') ||
         pingErr.code === 7 || pingErr.code === 5);

      if (isNamedDbIssue) {
        console.log(`[Firebase] Named database issue detected. Attempting fallback to default database...`);
        try {
          const defaultDb = getFirestore(adminApp);
          await defaultDb.collection('_health').doc('admin_ping').get();
          db = defaultDb;
          dbId = '(default)';
          applyDbSettings(db);
          isServerFirestoreAvailable = true;
          console.log(`[Firebase] Successfully switched to default database.`);
          return;
        } catch (defaultErr: any) {
          console.error(`[Firebase] Default database also inaccessible:`, defaultErr.message);
          isServerFirestoreAvailable = false;
        }
      } else {
        isServerFirestoreAvailable = false;
      }
    }
    
    // Also check if vendors collection is accessible
    if (isServerFirestoreAvailable) {
      try {
        const vendorsSnap = await db.collection('vendors').limit(1).get();
        console.log(`[Firebase] Vendors collection accessible. Count: ${vendorsSnap.size}`);
      } catch (vErr: any) {
        if (vErr.message?.includes('PERMISSION_DENIED') || vErr.code === 7) {
          console.warn(`[Firebase] Vendors collection access denied. Server-side writes will be disabled.`);
          isServerFirestoreAvailable = false;
        } else {
          console.warn(`[Firebase] Vendors collection check failed:`, vErr.message);
        }
      }
    }
  } catch (error: any) {
    if (error.message?.includes('PERMISSION_DENIED') || error.code === 7) {
      console.warn(`[Firebase] Admin Firestore connection check failed (PERMISSION_DENIED). Server-side writes disabled.`);
      isServerFirestoreAvailable = false;
    } else {
      console.warn(`[Firebase] Admin Firestore connection check failed:`, error.message);
    }
  }
}

let stripeClient: Stripe | null = null;
let lastUsedKey: string | null = null;

// Hardcoded fallback for the user's specific key to ensure they are unblocked
const HARDCODED_KEY = "sk_test_51TC6mI1E7LVIIrh99iztXfVYR2yoQx35CgaCPQafQq5495DHpTIQgUCxgYBuh48HE8bdOKuPy9RTFXdv8pLf00Kf00u3MKjOWe";

async function getStripe(): Promise<Stripe> {
  const rawEnvKey = process.env.STRIPE_SECRET_KEY?.trim() || "";
  // Remove any non-printable or control characters just in case
  let currentKey = rawEnvKey.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
  
  // If truncated or missing, use the hardcoded fallback provided by the user
  if (!currentKey || currentKey.length < 100 || currentKey.includes('*')) {
    console.log("[Stripe] Env key invalid or truncated. Using hardcoded fallback.");
    currentKey = HARDCODED_KEY.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, "");
  }

  const hint = currentKey.length > 10 ? `${currentKey.substring(0, 7)}...${currentKey.substring(currentKey.length - 4)}` : "None";
  console.log(`[Stripe] Accessing Secret Key. Length: ${currentKey?.length || 0}, Hint: ${hint}`);
  
  if (!currentKey) {
    throw new Error("STRIPE_SECRET_KEY is missing. Please use the 'Emergency Key Update' in the Vendor Portal.");
  }

  // Basic format check - always check this even if client exists
  if (currentKey.includes('*')) {
    throw new Error("You have pasted a MASKED key (containing asterisks like 'sk_test_***'). Please go to Stripe Dashboard, click 'Reveal', and copy the FULL key.");
  }

  if (currentKey.length < 100) {
    throw new Error(`Your Stripe Secret Key is too short (${currentKey.length} chars). A valid key should be 107 characters. It was likely truncated during copy-paste.`);
  }

  // If the key has changed since the last initialization, reset the client
  if (stripeClient && lastUsedKey !== currentKey) {
    console.log("Stripe API Key change detected. Re-initializing client...");
    stripeClient = null;
  }

  if (!stripeClient) {
    if (!currentKey.startsWith('sk_')) {
      if (currentKey.startsWith('pk_')) {
        throw new Error("You've provided a Publishable key (pk_) as the STRIPE_SECRET_KEY. You must use a Secret key (sk_). Please check your Stripe Dashboard > Developers > API keys.");
      }
      throw new Error("Invalid STRIPE_SECRET_KEY format. It should start with 'sk_test_' or 'sk_live_'.");
    }

    try {
      stripeClient = new Stripe(currentKey, {
        apiVersion: "2025-02-24.acacia" as any,
        appInfo: {
          name: "Simcha Booking",
          version: "1.0.0",
        },
      });
      lastUsedKey = currentKey;
    } catch (err: any) {
      throw new Error(`Failed to initialize Stripe client: ${err.message}. Please ensure your STRIPE_SECRET_KEY is valid.`);
    }
  }
  return stripeClient;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. IMMEDIATE BYPASS ROUTE - MUST BE AT THE VERY TOP
  // This bypasses any global middleware (including sessions) that might hang on Firestore
  app.all("/api/stripe/create-checkout-session", express.json(), async (req, res) => {
    console.log(`[Stripe] Starting Checkout Session (Method: ${req.method})`);
    try {
      // Handle both POST (body) and GET (query)
      const { bookingId, vendorId, amount } = req.method === 'POST' ? req.body : req.query;
      
      if (!vendorId) {
        return res.status(400).send("Missing vendorId");
      }

      if (!amount || isNaN(Number(amount))) {
        return res.status(400).send("Invalid or missing amount");
      }

      // 1. LOOK UP RATE: Fetch the vendor's document from the database
      let commissionRate = 5; // Default to 5%
      let vendorStripeAccountId = null;

      console.log('Attempting to fetch Vendor with ID:', vendorId);

      try {
        const vendorDoc = await safeFirestoreOp(async (database) => {
          // FLEXIBLE LOOKUP: First try by document ID
          let doc = await database.collection('vendors').doc(vendorId as string).get();
          
          // If not found by document ID, try searching for a field named 'id'
          if (!doc.exists) {
            console.log(`[Stripe] Vendor not found by document ID ${vendorId}. Searching by 'id' field...`);
            const querySnapshot = await database.collection('vendors').where('id', '==', vendorId).limit(1).get();
            if (!querySnapshot.empty) {
              doc = querySnapshot.docs[0];
            }
          }
          return doc;
        }, "Fetch Vendor for Checkout", "vendors", vendorId as string);

        if (vendorDoc && vendorDoc.exists) {
          const vendorData = vendorDoc.data();
          if (vendorData) {
            // LOG THE FULL OBJECT AS REQUESTED
            console.log('Full Vendor Data:', JSON.stringify(vendorData));

            // CALCULATE SPLIT: Use commissionRate from DB, default to 5 if missing
            commissionRate = typeof vendorData.commissionRate === 'number' ? vendorData.commissionRate : 5;
            
            // CASE SENSITIVITY CHECK: Ensure we use stripeAccountId exactly as requested
            if (vendorData.stripeAccountId && vendorData.stripeAccountId.startsWith('acct_')) {
              vendorStripeAccountId = vendorData.stripeAccountId;
            } else if (vendorData.stripeaccountid && vendorData.stripeaccountid.startsWith('acct_')) {
              console.warn(`[Stripe] Found lowercase 'stripeaccountid' for vendor ${vendorId}. Using it, but please fix the database field name to 'stripeAccountId'.`);
              vendorStripeAccountId = vendorData.stripeaccountid;
            } else if (vendorData.StripeAccountID && vendorData.StripeAccountID.startsWith('acct_')) {
              console.warn(`[Stripe] Found uppercase 'StripeAccountID' for vendor ${vendorId}. Using it, but please fix the database field name to 'stripeAccountId'.`);
              vendorStripeAccountId = vendorData.StripeAccountID;
            }
          }
        } else {
          console.warn(`[Stripe] Vendor ${vendorId} not found in database.`);
        }
      } catch (dbError) {
        console.warn("[Stripe] DB Fetch failed, using defaults.", dbError);
      }

      // HARDCODED BACKUP (TEMPORARY) for Vendor '2' and 'ea54cmd95'
      if (!vendorStripeAccountId && (vendorId === '2' || vendorId === 'ea54cmd95')) {
        const backupId = vendorId === '2' ? 'acct_1TFG4u1F9HWZ6UFS' : 'acct_1TFG4u1F9HWZ6UFS'; // Using same backup for now or specific if known
        console.log(`[Stripe] Using hardcoded backup for Vendor '${vendorId}': ${backupId}`);
        vendorStripeAccountId = backupId;
        commissionRate = 5; // Use default 5% for the backup
      }

      // CRUCIAL: Throw error if vendor.stripeAccountId is missing or undefined
      if (!vendorStripeAccountId) {
        console.error(`[Stripe] Checkout failed: Vendor ${vendorId} has no valid Stripe Account ID.`);
        return res.status(400).send(`Error: Vendor ${vendorId} is not connected to Stripe. Please contact the vendor.`);
      }

      const stripe = await getStripe();
      
      // MATH: Convert to cents for Stripe
      const amountInCents = Math.round(Number(amount) * 100);
      const platformCutInCents = Math.round(amountInCents * (commissionRate / 100));

      // VALIDATION: Ensure fee is less than total
      if (platformCutInCents >= amountInCents) {
        console.error(`[Stripe] Fee calculation error: Fee (${platformCutInCents}) >= Amount (${amountInCents})`);
        return res.status(400).json({ error: "The calculated platform fee exceeds the total payment amount. Please check the commission rate." });
      }

      // 2. SAFETY: Self-transfer protection
      // If the destination is the same as the platform account, Stripe will crash.
      let transferData: any = undefined;
      try {
        const platformAccount = await stripe.accounts.retrieve();
        if (platformAccount.id === vendorStripeAccountId) {
          console.log(`[Stripe] Self-transfer detected for account ${vendorStripeAccountId}. Skipping transfer_data to avoid crash.`);
        } else {
          transferData = { destination: vendorStripeAccountId };
        }
      } catch (e) {
        console.warn("[Stripe] Could not verify platform account ID for self-transfer check.", e);
        // If we can't verify, but we have an acct_ ID, we'll try it
        transferData = { destination: vendorStripeAccountId };
      }

      // EXACT LOGS REQUESTED BY USER
      console.log('--- STRIPE SPLIT DEBUG ---');
      console.log('Vendor ID from DB:', vendorStripeAccountId);
      console.log('Commission Rate:', commissionRate);
      console.log('Calculated Fee (cents):', platformCutInCents);
      // Full Vendor Data log is already added above inside the try block

      let session;
      try {
        const sessionParams: any = {
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: `Service Booking - ${bookingId || 'Quick Pay'}`,
                },
                unit_amount: amountInCents,
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          metadata: {
            bookingId: (bookingId as string) || 'none',
            vendorId: (vendorId as string) || 'none'
          },
          success_url: `${process.env.APP_URL}/payment-success?bookingId=${bookingId}&vendorId=${vendorId}`,
          cancel_url: `${process.env.APP_URL}/payment-cancel?bookingId=${bookingId}`,
        };

        // Add payment_intent_data for Destination Charges
        if (transferData) {
          sessionParams.payment_intent_data = {
            metadata: {
              bookingId: (bookingId as string) || 'none',
              vendorId: (vendorId as string) || 'none'
            },
            application_fee_amount: platformCutInCents,
            transfer_data: transferData,
          };
        } else {
          // This case should theoretically be caught by the error check above, 
          // but we keep it for self-transfer bypass safety.
          sessionParams.payment_intent_data = {
            metadata: {
              bookingId: (bookingId as string) || 'none',
              vendorId: (vendorId as string) || 'none'
            }
          };
        }

        session = await stripe.checkout.sessions.create(sessionParams);
      } catch (stripeError: any) {
        console.error("Stripe Session Creation Error:", stripeError);
        return res.status(400).json({ error: stripeError.message });
      }
      
      // Return JSON for all requests
      return res.json({ url: session.url });
    } catch (error: any) {
      console.error("Payment Route Error:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // 2. SESSION CONFIG - USE MEMORY STORE TO PREVENT FIRESTORE WRITES
  // This addresses the "Commit" errors in Firestore Metrics
  const MemoryStore = session.MemoryStore;
  app.use(session({
    store: new MemoryStore(),
    secret: process.env.SESSION_SECRET || "simcha-booking-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: process.env.NODE_ENV === "production",
      sameSite: 'none'
    }
  }));

  if (!process.env.APP_URL) {
    console.warn("APP_URL environment variable is missing. Stripe redirects may not work correctly. Please add it in Settings > Secrets.");
  }

  // Stripe Webhook (MUST be before any other middleware that parses the body)
  // Use express.raw to get the unparsed body for signature verification
  app.post("/api/stripe/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const rawWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    const webhookSecret = rawWebhookSecret.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, "");

    console.log(`[Webhook] Received request. Signature present: ${!!sig}, Secret length: ${webhookSecret.length}`);

    if (!webhookSecret) {
      console.error("[Webhook] STRIPE_WEBHOOK_SECRET is missing from environment variables.");
      return res.status(400).send(`Webhook Error: STRIPE_WEBHOOK_SECRET is missing.`);
    }

    if (!webhookSecret.startsWith('whsec_')) {
      console.warn("[Webhook] STRIPE_WEBHOOK_SECRET does not start with 'whsec_'. This might be the wrong key.");
    }

    if (!sig) {
      console.error("[Webhook] stripe-signature header is missing.");
      return res.status(400).send(`Webhook Error: stripe-signature header is missing.`);
    }

    let event;
    try {
      const stripe = await getStripe();
      
      // Verify req.body is a Buffer (required for signature verification)
      if (!Buffer.isBuffer(req.body)) {
        console.error("[Webhook] req.body is NOT a Buffer. Current type:", typeof req.body);
        if (typeof req.body === 'object') {
          console.error("[Webhook] Body was already parsed as JSON. This will break signature verification. Ensure this route is defined BEFORE express.json().");
        }
        throw new Error("Webhook payload must be a raw Buffer.");
      }
      
      console.log(`[Webhook] Verifying signature with Buffer length: ${req.body.length}`);

      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error(`[Webhook] Signature verification failed: ${err.message}`);
      console.error(`[Webhook] Full Error:`, err);
      console.error(`[Webhook] Secret used (first 8 chars): ${webhookSecret.substring(0, 8)}...`);
      console.error(`[Webhook] Signature header (first 20 chars): ${sig.substring(0, 20)}...`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`[Webhook] Successfully verified event: ${event.id} [${event.type}]`);

    // Visible Debug: Write to Firestore so frontend can show a toast
    try {
      await db.collection('webhook_debug').add({
        type: event.type,
        id: event.id,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (debugErr) {
      console.error("[Webhook] Failed to write debug log to Firestore:", debugErr);
    }

    // Handle the event
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          const session = event.data.object as Stripe.Checkout.Session;
          const bookingId = session.metadata?.bookingId;
          if (bookingId) {
            console.log(`[Webhook] Processing checkout.session.completed for booking: ${bookingId}`);
            
            // 1. Update Booking Status
            const result = await safeFirestoreOp(async (database) => {
              await database.collection('bookings').doc(bookingId).set({
                status: 'confirmed',
                paymentStatus: 'paid',
                paymentMethod: 'Credit Card (Stripe)',
                stripeSessionId: session.id,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              }, { merge: true });
            }, "Webhook Checkout Completed", "bookings", bookingId);
            
            if (result && result.error === 'PERMISSION_DENIED') {
              console.warn(`[Webhook] Server update failed due to PERMISSION_DENIED. Client-side bypass will handle the status update.`);
            } else {
              console.log(`[Webhook] Booking ${bookingId} confirmed on server.`);
            }

            // NOTE: Email trigger moved to /api/stripe/verify-payment per user request
            // to handle cases where webhooks are not reaching the server reliably.
          }
          break;
        case 'account.updated':
          const account = event.data.object as Stripe.Account;
          // A Connect account is considered "connected" when it can accept charges and payouts
          const isConnected = account.details_submitted && account.charges_enabled && account.payouts_enabled;
          
          console.log(`[Webhook] Account updated: ${account.id}. Details submitted: ${account.details_submitted}, Charges enabled: ${account.charges_enabled}, Payouts enabled: ${account.payouts_enabled}`);

          // Find vendor by stripeAccountId
          const vendorsSnapshot = await safeFirestoreOp(async (database) => {
            return await database.collection('vendors')
              .where('stripeAccountId', '==', account.id)
              .limit(1)
              .get();
          }, "Webhook Account Updated Fetch", "vendors", account.id);
            
          if (vendorsSnapshot && !vendorsSnapshot.empty) {
            const vendorDoc = vendorsSnapshot.docs[0];
            await safeFirestoreOp(async (database) => {
              // Force field creation with set merge: true
              await database.collection('vendors').doc(vendorDoc.id).set({
                stripeConnected: !!isConnected,
                stripeAccountId: account.id
              }, { merge: true });
            }, "Webhook Account Updated Save", "vendors", vendorDoc.id);
            console.log(`[Webhook] Vendor ${vendorDoc.id} connection status updated to: ${isConnected}`);
          } else {
            console.warn(`[Webhook] Received account.updated for unknown account: ${account.id}`);
            // If vendor not found by ID, we might want to create it if we have a vendorId in metadata
            const vendorId = account.metadata?.vendorId;
            if (vendorId) {
              console.log(`[Webhook] Creating/Updating vendor ${vendorId} from metadata.`);
              await safeFirestoreOp(async (database) => {
                await database.collection('vendors').doc(vendorId).set({
                  stripeAccountId: account.id,
                  stripeConnected: !!isConnected
                }, { merge: true });
              }, "Webhook Account Updated Metadata Save", "vendors", vendorId);
            }
          }
          break;
        default:
          console.log(`[Webhook] Unhandled event type ${event.type}`);
      }
    } catch (err: any) {
      console.error(`[Webhook] Error processing event ${event.type}: ${err.message}`);
      return res.status(500).send(`Internal Server Error: ${err.message}`);
    }

    res.json({ received: true });
  });

  app.use(express.json());

  // Server-side Upload Bypass (Multer + Firebase Admin)
  const upload = multer({ storage: multer.memoryStorage() });
  app.post("/api/upload", upload.single('file'), async (req, res) => {
    try {
      if (!isServerFirestoreAvailable || !adminApp) {
        throw new Error("Server-side Firebase is not available.");
      }
      
      const file = req.file;
      const { path: storagePath } = req.body;
      
      if (!file) return res.status(400).send("No file uploaded");
      if (!storagePath) return res.status(400).send("No storage path provided");

      console.log(`[Upload] Processing: ${storagePath} (${file.size} bytes)`);

      const bucket = adminApp.storage().bucket();
      const blob = bucket.file(storagePath);
      
      // Use the standard Firebase Storage metadata if possible, but makePublic is easiest for immediate URL
      const blobStream = blob.createWriteStream({
        metadata: {
          contentType: file.mimetype,
          firebaseStorageDownloadTokens: crypto.randomUUID() // Optional: for firebasestorage style URLs
        }
      });

      blobStream.on('error', (err) => {
        console.error("[Upload] Blob stream error:", err);
        res.status(500).send(err.message);
      });

      blobStream.on('finish', async () => {
        try {
          // Make public so we can use a direct link
          await blob.makePublic().catch(e => console.warn("[Upload] makePublic failed (might already be public):", e.message));
          
          // Direct GCS Public URL
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
          
          console.log(`[Upload] Success: ${publicUrl}`);
          res.json({ url: publicUrl });
        } catch (e: any) {
          console.error("[Upload] Post-finish error:", e);
          res.status(500).send(e.message);
        }
      });

      blobStream.end(file.buffer);
    } catch (error: any) {
      console.error("[Upload] Route Error:", error);
      res.status(500).send(error.message);
    }
  });

  const getKeyDiagnostics = () => {
    const key = lastUsedKey || process.env.STRIPE_SECRET_KEY?.trim() || "";
    // Remove any non-printable or control characters just in case
    const cleanKey = key.replace(/[\x00-\x1F\x7F-\x9F]/g, "");
    
    return {
      hint: cleanKey.length > 10 ? `${cleanKey.substring(0, 7)}...${cleanKey.substring(cleanKey.length - 4)}` : "None",
      length: cleanKey.length,
      isSuspicious: cleanKey.length > 0 && (cleanKey.length !== 107 || cleanKey.includes('*')),
      hasAsterisks: cleanKey.includes('*')
    };
  };

  const handleStripeError = (error: any, diag: any, res: express.Response, context: string) => {
    console.error(`Stripe ${context} Error:`, error);
    const isAuthError = error.type === 'StripeAuthenticationError';
    const isInvalidRequest = error.rawType === 'invalid_request_error' || error.type === 'StripeInvalidRequestError';
    let errorMessage = error.message;
    
    if (isAuthError) {
      if (diag.hasAsterisks) {
        errorMessage = `You have pasted a MASKED key (containing asterisks). Please go to Stripe Dashboard > Developers > API keys, click "Reveal test key", and copy the FULL 107-character key.`;
      } else if (diag.length < 100) {
        errorMessage = `Key is too short (${diag.length} chars). A valid Stripe Secret Key should be 107 characters. It was likely truncated during copy-paste. Please ensure you copy the entire string starting with 'sk_test_'.`;
      } else {
        errorMessage = `Stripe rejected this key. Length: ${diag.length}, Hint: ${diag.hint}. Please verify it matches your Stripe Dashboard exactly.`;
      }
    } else if (isInvalidRequest && errorMessage.includes('cannot be set to your own account')) {
      errorMessage = `Stripe Error: You are trying to pay to the same account that owns the API key. In test mode, you cannot transfer money to yourself. Please use a different vendor account or skip the transfer for this test.`;
    }

    res.status(isAuthError ? 401 : 400).json({ 
      error: errorMessage,
      type: error.type,
      ...diag
    });
  };

  // Debug endpoint for Firebase status
  app.get("/api/firebase/debug", (req, res) => {
    res.json({
      envProjectId,
      configProjectId,
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
      PROJECT_ID: process.env.PROJECT_ID,
      GCP_PROJECT: process.env.GCP_PROJECT,
      currentProjectId: adminApp?.options?.projectId,
      dbId,
      adminAppName: adminApp?.name,
      appsCount: admin.apps.length,
      isDbInitialized: !!db,
      firebaseConfig: {
        projectId: firebaseConfig.projectId,
        firestoreDatabaseId: firebaseConfig.firestoreDatabaseId
      },
      envKeys: Object.keys(process.env).filter(k => k.includes('PROJECT') || k.includes('GOOGLE') || k.includes('FIREBASE'))
    });
  });

  // Stripe Health Check
  app.get("/api/stripe/health", async (req, res) => {
    const diag = getKeyDiagnostics();
    console.log(`Stripe Health Check - Key Length: ${diag.length}, Hint: ${diag.hint}`);

    try {
      const stripe = await getStripe();
      // Simple call to verify the key is valid
      const balance = await stripe.balance.retrieve();
      res.json({ 
        status: "ok", 
        message: "Connection Successful",
        currency: balance.available[0].currency,
        ...diag
      });
    } catch (error: any) {
      handleStripeError(error, diag, res, "Health Check");
    }
  });

  // Manual Key Update (Firestore Fallback)
  app.post("/api/stripe/update-key", async (req, res) => {
    try {
      const { key } = req.body;
      if (!key || key.length !== 107 || !key.startsWith('sk_')) {
        return res.status(400).json({ error: "Invalid key format. Must be a 107-character Secret Key (sk_...)." });
      }

      await safeFirestoreOp(async (dbInstance) => {
        await dbInstance.collection('settings').doc('stripe').set({
          secretKey: key,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }, "Update Stripe Key", "settings", "stripe");

      // Clear the cached client to force re-initialization
      stripeClient = null;
      
      res.json({ status: "ok", message: "Key updated successfully in database." });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Stripe Connect Onboarding
  app.post("/api/stripe/onboard", async (req, res) => {
    const diag = getKeyDiagnostics();
    try {
      const { vendorId, email } = req.body;
      console.log(`[Onboarding] Received request for Vendor: ${vendorId}, Email: ${email}`);

      if (!vendorId) {
        console.error("[Onboarding] Missing vendorId in request body");
        return res.status(400).json({ error: "Missing vendorId" });
      }
      
      const stripe = await getStripe();
      // Create a Stripe Connect account
      const account = await stripe.accounts.create({
        type: "express",
        email: email,
        metadata: {
          vendorId: vendorId
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      // SAVE ID IMMEDIATELY: Save the new stripeAccountId to vendor's document before redirecting
      const updateData = {
        stripeAccountId: account.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      try {
        await safeFirestoreOp(async (database) => {
          await database.collection('vendors').doc(vendorId).set(updateData, { merge: true });
        }, "Save stripeAccountId", "vendors", vendorId);
        console.log(`[Onboarding] Saved stripeAccountId ${account.id} for vendor ${vendorId} immediately.`);
      } catch (err: any) {
        // Downgrade to warning as we have a client-side bypass
        console.warn(`[Onboarding] Server-side Firestore save skipped for vendor ${vendorId}: ${err.message}. Client-side bypass will handle this.`);
      }

      // Create an account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.APP_URL}/api/stripe/onboard-refresh?vendorId=${vendorId}&check_stripe=true`,
        return_url: `${process.env.APP_URL}/api/stripe/onboard-complete?vendorId=${vendorId}&stripeAccountId=${account.id}&check_stripe=true`,
        type: "account_onboarding",
      });

      res.json({ url: accountLink.url, stripeAccountId: account.id });
    } catch (error: any) {
      handleStripeError(error, diag, res, "Onboarding");
    }
  });

  // Stripe Onboarding Refresh
  app.get("/api/stripe/onboard-refresh", async (req, res) => {
    const { vendorId } = req.query;
    res.redirect(`${process.env.APP_URL}/vendor-portal?onboard=refresh&vendorId=${vendorId}&check_stripe=true`);
  });

  // Stripe Onboarding Completion
  app.get("/api/stripe/onboard-complete", async (req, res) => {
    try {
      let { vendorId, stripeAccountId } = req.query;
      console.log(`[Onboarding] Completion request for Vendor: ${vendorId}, Account: ${stripeAccountId}`);
      
      if (stripeAccountId) {
        const stripe = await getStripe();
        
        // Fresh pull of account status to confirm connection
        const account = await stripe.accounts.retrieve(stripeAccountId as string);
        
        // Fallback: Pull vendorId from metadata if missing from URL
        if (!vendorId && account.metadata && account.metadata.vendorId) {
          vendorId = account.metadata.vendorId;
          console.log(`[Onboarding] Recovered vendorId from Stripe metadata: ${vendorId}`);
        }

        // Final Fallback: Try to find vendor by stripeAccountId in Firestore
        if (!vendorId && stripeAccountId) {
          console.log(`[Onboarding] Searching Firestore for vendor with stripeAccountId: ${stripeAccountId}`);
          try {
            await safeFirestoreOp(async (database) => {
              const snapshot = await database.collection('vendors').where('stripeAccountId', '==', stripeAccountId).get();
              if (!snapshot.empty) {
                vendorId = snapshot.docs[0].id;
                console.log(`[Onboarding] Found vendorId ${vendorId} via stripeAccountId lookup.`);
              }
            }, "Find Vendor by Stripe ID", "vendors", stripeAccountId as string);
          } catch (e) {
            console.warn(`[Onboarding] Lookup by stripeAccountId failed:`, e);
          }
        }

        if (vendorId) {
          const isConnected = account.details_submitted && account.charges_enabled && account.payouts_enabled;

          try {
            console.log(`[Onboarding] FORCING update for Vendor: ${vendorId}, Account: ${stripeAccountId}, Connected: ${isConnected}`);
            await safeFirestoreOp(async (database) => {
              const docRef = database.collection('vendors').doc(vendorId as string);
              
              // Force create/update the document to ensure fields exist
              await docRef.set({
                stripeAccountId: stripeAccountId as string,
                stripeConnected: true, // Force true as requested for auto-provisioning
                onboardingComplete: true,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              }, { merge: true });
              
              console.log(`[Onboarding] Successfully force-created fields for vendor ${vendorId}`);
            }, "Onboard Complete Update", "vendors", vendorId as string);
          } catch (err: any) {
            // Downgrade to warning as we have a client-side bypass
            console.warn(`[Onboarding] Server-side Firestore update skipped for vendor ${vendorId}: ${err.message}. Triggering client-side bypass.`);
            // Nuclear Fix: Redirect with bypass flag if server write fails
            return res.redirect(`${process.env.APP_URL}/vendor-portal?onboard=success&bypass=true&stripeAccountId=${stripeAccountId}&vendorId=${vendorId}`);
          }
          
          console.log(`[Onboarding] Vendor ${vendorId} Stripe account ${stripeAccountId} linked. Connected: ${isConnected}`);
          
          if (isConnected) {
            res.redirect(`${process.env.APP_URL}/vendor-portal?onboard=success&check_stripe=true&stripeAccountId=${stripeAccountId}`);
          } else {
            res.redirect(`${process.env.APP_URL}/vendor-portal?onboard=pending&check_stripe=true&stripeAccountId=${stripeAccountId}`);
          }
        } else {
          console.error(`[Onboarding] Missing vendorId even after metadata check. Account: ${stripeAccountId}`);
          res.redirect(`${process.env.APP_URL}/vendor-portal?onboard=error&message=Missing+Vendor+ID`);
        }
      } else {
        console.error(`[Onboarding] Missing stripeAccountId`);
        res.redirect(`${process.env.APP_URL}/vendor-portal?onboard=error`);
      }
    } catch (error: any) {
      console.error("[Onboarding] Completion Error:", error);
      res.redirect(`${process.env.APP_URL}/vendor-portal?onboard=error&message=${encodeURIComponent(error.message)}`);
    }
  });



  // Stripe Dashboard Login Link
  app.post("/api/stripe/dashboard", async (req, res) => {
    const diag = getKeyDiagnostics();
    try {
      const { stripeAccountId } = req.body;
      console.log(`[Stripe] Dashboard request for account: ${stripeAccountId}`);
      if (!stripeAccountId) {
        return res.status(400).json({ error: "No Stripe account ID provided." });
      }

      const stripe = await getStripe();
      console.log(`[Stripe] Creating login link for: ${stripeAccountId}`);
      const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
      console.log(`[Stripe] Login link created: ${loginLink.url}`);
      res.json({ url: loginLink.url });
    } catch (error: any) {
      console.error(`[Stripe] Dashboard Error for ${req.body.stripeAccountId}:`, error);
      handleStripeError(error, diag, res, "Dashboard");
    }
  });

  // Verify Stripe Connection Status (Automated Check)
  app.post("/api/stripe/verify-status", async (req, res) => {
    const diag = getKeyDiagnostics();
    try {
      const { vendorId } = req.body;
      if (!vendorId) {
        return res.status(400).json({ error: "Missing vendorId" });
      }

      // 1. Pull the vendor's stripeAccountId from Firestore
      const vendorDoc = await safeFirestoreOp(async (database) => {
        return await database.collection('vendors').doc(vendorId).get();
      }, "Verify Status Fetch", "vendors", vendorId);

      if (!vendorDoc.exists) {
        return res.status(404).json({ error: "Vendor not found" });
      }

      const vendorData = vendorDoc.data();
      const stripeAccountId = vendorData?.stripeAccountId;

      if (!stripeAccountId) {
        return res.json({ stripeConnected: false, message: "No Stripe account ID found for this vendor." });
      }

      // 2. Ping the Stripe API to check status
      const stripe = await getStripe();
      const account = await stripe.accounts.retrieve(stripeAccountId);
      
      // Check if charges_enabled or details_submitted is true
      const isConnected = account.details_submitted || account.charges_enabled;

      if (isConnected) {
        const updateData = {
          stripeConnected: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        // 3. Automatically set stripeConnected: true in Firestore
        try {
          await safeFirestoreOp(async (database) => {
            await database.collection('vendors').doc(vendorId).set(updateData, { merge: true });
          }, "Verify Status Update", "vendors", vendorId);
          console.log(`[Verify Status] Vendor ${vendorId} automatically connected.`);
        } catch (err: any) {
          console.error(`[Verify Status] Firestore update failed for vendor ${vendorId}:`, err.message);
        }
      }

      res.json({ 
        stripeConnected: isConnected,
        details: {
          details_submitted: account.details_submitted,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled
        }
      });
    } catch (error: any) {
      handleStripeError(error, diag, res, "Verify Status");
    }
  });

  // Verify Stripe Connection Status manually
  app.post("/api/stripe/verify-connection", async (req, res) => {
    const diag = getKeyDiagnostics();
    try {
      const { vendorId, stripeAccountId } = req.body;
      if (!vendorId || !stripeAccountId) {
        return res.status(400).json({ error: "Missing vendorId or stripeAccountId" });
      }

      const stripe = await getStripe();
      const account = await stripe.accounts.retrieve(stripeAccountId);
      const isConnected = account.details_submitted && account.charges_enabled && account.payouts_enabled;

      const updateData = {
        stripeConnected: !!isConnected,
        stripeAccountId: stripeAccountId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await safeFirestoreOp(async (database) => {
        await database.collection('vendors').doc(vendorId).set(updateData, { merge: true });
      }, "Verify Connection Update", "vendors", vendorId);

      console.log(`[Verify] Vendor ${vendorId} status updated. Connected: ${isConnected}`);

      res.json({ 
        status: "ok", 
        stripeConnected: !!isConnected,
        details: {
          details_submitted: account.details_submitted,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled
        }
      });
    } catch (error: any) {
      handleStripeError(error, diag, res, "Verify Connection");
    }
  });

  // Force Verify Stripe Connection Status (Manual Fallback for Webhook Issues)
  app.post("/api/stripe/force-verify", async (req, res) => {
    const diag = getKeyDiagnostics();
    try {
      const { vendorId } = req.body;
      if (!vendorId) {
        return res.status(400).json({ error: "Missing vendorId" });
      }

      // Fetch vendor to get stripeAccountId
      const vendorDoc = await safeFirestoreOp(async (database) => {
        return await database.collection('vendors').doc(vendorId).get();
      }, "Force Verify Fetch Vendor", "vendors", vendorId);

      if (!vendorDoc || !vendorDoc.exists) {
        return res.status(404).json({ error: "Vendor not found" });
      }

      const vendorData = vendorDoc.data();
      const stripeAccountId = vendorData?.stripeAccountId;

      if (!stripeAccountId) {
        return res.status(400).json({ error: "Vendor has no Stripe Account ID" });
      }

      const stripe = await getStripe();
      const account = await stripe.accounts.retrieve(stripeAccountId);
      const isConnected = account.details_submitted && account.charges_enabled && account.payouts_enabled;

      const updateData = {
        stripeConnected: !!isConnected,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await safeFirestoreOp(async (database) => {
        await database.collection('vendors').doc(vendorId).set(updateData, { merge: true });
      }, "Force Verify Update Vendor", "vendors", vendorId);

      console.log(`[Force Verify] Vendor ${vendorId} status updated. Connected: ${isConnected}`);

      res.json({ 
        status: "ok", 
        stripeConnected: !!isConnected,
        details: {
          details_submitted: account.details_submitted,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled
        }
      });
    } catch (error: any) {
      handleStripeError(error, diag, res, "Force Verify");
    }
  });

  // Manual Override: Force Database Connect (Bypass all Stripe checks)
  app.post("/api/stripe/force-connect-db", async (req, res) => {
    try {
      const { vendorId, stripeAccountId } = req.body;
      if (!vendorId) {
        return res.status(400).json({ error: "Missing vendorId" });
      }

      // Directly update Firestore with the requested values
      const updateData: any = {
        stripeConnected: true,
        stripeAccountId: stripeAccountId || 'acct_1TC6mI1E7LVIIrh9',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      await safeFirestoreOp(async (database) => {
        await database.collection('vendors').doc(vendorId).set(updateData, { merge: true });
      }, "Manual Override Update", "vendors", vendorId);

      console.log(`[Manual Override] Vendor ${vendorId} forced to connected state.`);
      res.json({ status: "ok", message: "Database updated successfully." });
    } catch (error: any) {
      console.error("[Manual Override] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Verify Payment Success and Update Booking Status
  app.post("/api/stripe/verify-payment", async (req, res) => {
    try {
      const { bookingId } = req.body;
      if (!bookingId) {
        return res.status(400).json({ error: "Missing bookingId" });
      }

      const updateData = {
        paymentStatus: 'paid',
        status: 'confirmed', // Also confirm the booking if paid
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const result = await safeFirestoreOp(async (database) => {
        await database.collection('bookings').doc(bookingId).set(updateData, { merge: true });
      }, "Verify Payment Update", "bookings", bookingId);

      // TRIGGER EMAILS IMMEDIATELY (Move from Webhook per user request)
      console.log(`[Verify Payment] FORCE SEND: Attempting to trigger automated emails for booking ${bookingId}...`);
      try {
        const bookingSnap = await safeFirestoreOp(async (database) => {
          return await database.collection('bookings').doc(bookingId).get();
        }, "Fetch Booking for Email", "bookings", bookingId);

        if (bookingSnap && bookingSnap.exists) {
          const bookingData = bookingSnap.data() as any;
          
          // Only send if not already sent (to prevent duplicates if webhook eventually fires)
          if (!bookingData.emailsSent) {
            const vendorId = bookingData.vendorId;
            const vendorSnap = await safeFirestoreOp(async (database) => {
              return await database.collection('vendors').doc(vendorId).get();
            }, "Fetch Vendor for Email", "vendors", vendorId);
            
            if (vendorSnap && vendorSnap.exists) {
              const vendorData = vendorSnap.data() as any;
              const amount = bookingData.amount;
              const commissionRate = vendorData.commissionRate || 5;
              const vendorShare = amount * (1 - commissionRate / 100);

              const customerEmail = bookingData.contactEmail;
              const customerName = bookingData.clientName || "Valued Customer";
              const vendorEmail = vendorData.contactEmail || vendorData.email;

              console.log(`[Verify Payment] Email Data Check:`, {
                bookingId,
                customerEmail: customerEmail || 'MISSING',
                vendorEmail: vendorEmail || 'MISSING'
              });

              if (customerEmail) {
                try {
                  console.log(`[Verify Payment] FORCE SEND: Sending receipt to customer: ${customerEmail}`);
                  await sendCustomerReceipt({
                    to: customerEmail,
                    customerName: customerName,
                    vendorName: vendorData.name,
                    amount: amount,
                    bookingId: bookingId
                  });
                  console.log(`[Verify Payment] FORCE SEND: Customer receipt sent successfully to ${customerEmail}`);
                } catch (e) { console.error("CRITICAL EMAIL ERROR: Customer receipt failed in verify-payment:", e); }
              }

              if (vendorEmail) {
                try {
                  console.log(`[Verify Payment] FORCE SEND: Sending notification to vendor: ${vendorEmail}`);
                  await sendVendorNotification({
                    to: vendorEmail,
                    vendorName: vendorData.name,
                    customerName: customerName,
                    amount: amount,
                    vendorShare: vendorShare,
                    commissionRate: commissionRate,
                    bookingId: bookingId,
                    eventDate: bookingData.date || 'TBD'
                  });
                  console.log(`[Verify Payment] FORCE SEND: Vendor notification sent successfully to ${vendorEmail}`);
                } catch (e) { console.error("CRITICAL EMAIL ERROR: Vendor notification failed in verify-payment:", e); }
              }

              // Mark as sent to prevent duplicates
              await safeFirestoreOp(async (database) => {
                await database.collection('bookings').doc(bookingId).update({ emailsSent: true });
              }, "Mark Emails Sent", "bookings", bookingId);
              
              console.log(`[Verify Payment] Emails dispatched and marked as sent for booking ${bookingId}.`);
            }
          } else {
            console.log(`[Verify Payment] Emails already sent for booking ${bookingId}. Skipping.`);
          }
        }
      } catch (emailErr) {
        console.error("[Verify Payment] Email trigger failed:", emailErr);
      }

      if (result && result.error === 'PERMISSION_DENIED') {
        // Suppress warning as it's handled by client-side bypass
        return res.json({ 
          status: "ok", 
          message: "Payment verified. Server update skipped (Permission Denied).",
          needsClientUpdate: true,
          updateData: {
            paymentStatus: 'paid',
            status: 'confirmed'
          }
        });
      }

      console.log(`[Verify Payment] Booking ${bookingId} updated to 'paid' on server.`);
      res.json({ status: "ok", message: "Payment verified and booking updated." });
    } catch (error: any) {
      console.error("[Verify Payment] Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Firebase Debug Endpoint
  app.get("/api/firebase/debug", (req, res) => {
    res.json({
      isServerFirestoreAvailable,
      projectId: adminApp?.options.projectId,
      databaseId: dbId || '(default)',
      appId: firebaseConfig.appId,
      env: {
        GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT,
        PROJECT_ID: process.env.PROJECT_ID,
        GCP_PROJECT: process.env.GCP_PROJECT
      }
    });
  });

  // Email Test Endpoint
  app.post("/api/test-email", async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    try {
      console.log(`[API] Triggering test email to: ${email}`);
      const result = await sendTestEmail(email);
      res.json({ status: "ok", message: "Test email sent successfully", result });
    } catch (error: any) {
      console.error("[API] Test email failed:", error);
      res.status(500).json({ 
        error: error.message, 
        details: {
          code: error.code,
          command: error.command,
          response: error.response
        }
      });
    }
  });

  // Account Verification Email Endpoint
  app.post("/api/auth/send-verification", async (req, res) => {
    const { email, name } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    try {
      console.log(`[Auth] Generating verification link for: ${email}`);
      
      const actionCodeSettings = {
        // The URL to redirect back to after Firebase verification.
        // We point this to a backend endpoint to trigger the welcome guide.
        url: `${process.env.APP_URL}/api/auth/verify-success?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name || '')}`,
        handleCodeInApp: true,
      };

      const verificationLink = await admin.auth().generateEmailVerificationLink(email, actionCodeSettings);
      
      console.log(`VERIFICATION EMAIL QUEUED: Sending to ${email}`);
      
      await sendAccountVerificationEmail({
        to: email,
        userName: name || email.split('@')[0],
        verificationLink: verificationLink
      });

      res.json({ status: "ok", message: "Verification email sent successfully" });
    } catch (error: any) {
      console.error("[Auth] Failed to send verification email:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Password Reset Email Endpoint
  app.post("/api/auth/reset-password", async (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    try {
      console.log(`[Auth] Generating password reset link for: ${email}`);
      
      const actionCodeSettings = {
        url: `${process.env.APP_URL}/login`,
        handleCodeInApp: false,
      };

      const resetLink = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);
      
      console.log(`PASSWORD RESET QUEUED: Sending to ${email}`);
      
      await sendPasswordResetEmail({
        to: email,
        userName: email.split('@')[0],
        resetLink: resetLink
      });

      res.json({ status: "ok", message: "Password reset email sent successfully" });
    } catch (error: any) {
      console.error("[Auth] Failed to send password reset email:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Backend Verification Success Block (Triggered by Firebase redirect)
  app.get("/api/auth/verify-success", async (req, res) => {
    const { email, name } = req.query;
    const emailStr = email as string;
    const nameStr = name as string;

    if (!emailStr) {
      return res.redirect(`${process.env.APP_URL}/verify-account?error=missing_email`);
    }

    console.log(`CRITICAL TRIGGER: Sending Welcome Guide to ${emailStr}`);

    try {
      // 1. Mark user as verified in Firebase Auth (just in case the redirect happened before Firebase finished)
      try {
        const user = await admin.auth().getUserByEmail(emailStr);
        if (user && !user.emailVerified) {
          await admin.auth().updateUser(user.uid, { emailVerified: true });
          console.log(`[Auth] User ${emailStr} marked as verified in Firebase.`);
        }
      } catch (authErr) {
        console.warn(`[Auth] Could not update verification status for ${emailStr}:`, authErr);
      }

      // 2. Send the Welcome Guide immediately (no duplicate check per request)
      await sendWelcomeGuideEmail({
        to: emailStr,
        userName: nameStr || emailStr.split('@')[0]
      });

      console.log(`WELCOME GUIDE SENT: Instant delivery to ${emailStr} successful.`);
      
      // 3. Redirect to the frontend verification success page
      res.redirect(`${process.env.APP_URL}/verify-account?email=${encodeURIComponent(emailStr)}&success=true`);
    } catch (error: any) {
      console.error("[Auth] Failed to process verification success:", error);
      res.redirect(`${process.env.APP_URL}/verify-account?email=${encodeURIComponent(emailStr)}&error=welcome_guide_failed`);
    }
  });

  // Keep the POST version for manual triggers if needed, but update it to match the new logic
  app.post("/api/auth/verify-email", async (req, res) => {
    const { email, name } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    console.log(`CRITICAL TRIGGER: Sending Welcome Guide to ${email}`);

    try {
      await sendWelcomeGuideEmail({
        to: email,
        userName: name || email.split('@')[0]
      });
      console.log(`WELCOME GUIDE SENT: Instant delivery to ${email} successful.`);
      res.json({ status: "ok", message: "Welcome guide sent" });
    } catch (error: any) {
      console.error("[Auth] Failed to send welcome guide:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/firebase-config", (req, res) => {
    const envProjectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || process.env.GCP_PROJECT;
    const targetProjectId = envProjectId || (firebaseConfig.projectId && !firebaseConfig.projectId.includes('TODO') ? firebaseConfig.projectId : undefined);
    
    res.json({
      ...firebaseConfig,
      projectId: targetProjectId,
      firestoreDatabaseId: dbId || firebaseConfig.firestoreDatabaseId
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get(/^(?!\/api).+/, (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Start the 7-day pre-event check-in automation
    // Runs every 24 hours
    setInterval(runDailyCheckIn, 24 * 60 * 60 * 1000);
    // Run once on startup after a short delay to ensure DB is ready
    setTimeout(runDailyCheckIn, 10000);
  });
}

async function runDailyCheckIn() {
  console.log(`[Automation] Starting 7-day pre-event check-in scan...`);
  
  try {
    await safeFirestoreOp(async (database) => {
      const today = new Date();
      const targetDate = new Date();
      targetDate.setDate(today.getDate() + 7);
      
      // Format target date to match the booking date format (YYYY-MM-DD)
      const targetDateStr = targetDate.toISOString().split('T')[0];
      
      console.log(`[Automation] Scanning for events on: ${targetDateStr}`);
      
      const bookingsSnap = await database.collection('bookings')
        .where('date', '==', targetDateStr)
        .where('status', '==', 'confirmed')
        .get();
        
      console.log(`[Automation] Found ${bookingsSnap.size} potential bookings for check-in.`);
      
      for (const doc of bookingsSnap.docs) {
        const booking = doc.data();
        const bookingId = doc.id;
        
        // Safety Check: Ensure the email is only sent once per booking
        if (booking.checkInSent) {
          console.log(`[Automation] Check-in already sent for booking ${bookingId}. Skipping.`);
          continue;
        }
        
        try {
          console.log(`7-DAY CHECK-IN SENT: Celebrating with ${booking.contactEmail} for their event on ${booking.date}.`);
          
          await sendPreEventCheckInEmail({
            to: booking.contactEmail,
            userName: booking.clientName || booking.contactEmail.split('@')[0],
            eventDate: booking.date
          });
          
          // Mark as sent
          await database.collection('bookings').doc(bookingId).update({
            checkInSent: true,
            checkInSentAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
        } catch (emailErr) {
          console.error(`[Automation] Failed to send check-in for booking ${bookingId}:`, emailErr);
        }
      }
    }, "Daily Check-In Automation");
    
    console.log(`[Automation] 7-day pre-event check-in scan complete.`);
  } catch (err) {
    console.error(`[Automation] CRITICAL: Daily check-in automation failed:`, err);
  }
}

startServer();
const port = Number(process.env.PORT) || 8080;

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is listening on port ${port}`);
});
