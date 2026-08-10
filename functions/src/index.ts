import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Stripe from "stripe";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

function getStripeInstance(): Stripe {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "STRIPE_SECRET_KEY environment variable is missing."
    );
  }
  return new Stripe(secretKey);
}

/**
 * 1. Auto-Delete Trigger:
 * Cloud Function triggered automatically when a user is deleted from Firebase Authentication.
 * Removes corresponding user_roles, users, and vendors documents and scrubs related orphaned data.
 */
export const onUserDelete = functions.auth.user().onDelete(async (user: functions.auth.UserRecord) => {
  const uid = user.uid;
  console.log(`[onUserDelete] User deleted from Auth: ${uid} (${user.email || "no-email"})`);

  const batch = db.batch();
  let vendorIdToDelete: string | null = null;

  try {
    // 1. Check & delete user_roles/{uid}
    const userRoleRef = db.collection("user_roles").doc(uid);
    const userRoleSnap = await userRoleRef.get();
    if (userRoleSnap.exists) {
      const data = userRoleSnap.data();
      if (data?.vendorId) {
        vendorIdToDelete = data.vendorId;
      }
      batch.delete(userRoleRef);
      console.log(`[onUserDelete] Queued deletion for user_roles/${uid}`);
    }

    // 2. Check & delete users/{uid}
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (userSnap.exists) {
      const data = userSnap.data();
      if (data?.vendorId) {
        vendorIdToDelete = data.vendorId;
      }
      batch.delete(userRef);
      console.log(`[onUserDelete] Queued deletion for users/${uid}`);
    }

    // Check if a vendor doc exists with doc.id == uid
    const directVendorRef = db.collection("vendors").doc(uid);
    const directVendorSnap = await directVendorRef.get();
    if (directVendorSnap.exists) {
      vendorIdToDelete = uid;
    }

    // 3. Delete vendors document(s)
    if (vendorIdToDelete) {
      const vendorRef = db.collection("vendors").doc(vendorIdToDelete);
      batch.delete(vendorRef);
      console.log(`[onUserDelete] Queued deletion for vendors/${vendorIdToDelete}`);

      // Scrub related vendor posts
      const postsSnap = await db.collection("posts").where("vendorId", "==", vendorIdToDelete).get();
      postsSnap.forEach((postDoc) => {
        batch.delete(postDoc.ref);
        console.log(`[onUserDelete] Queued deletion for posts/${postDoc.id}`);
      });
    }

    // Query any vendors where userId == uid or uid == uid
    const vendorByUserIdSnap = await db.collection("vendors").where("userId", "==", uid).get();
    vendorByUserIdSnap.forEach((vDoc) => {
      batch.delete(vDoc.ref);
      console.log(`[onUserDelete] Queued deletion for vendors/${vDoc.id} (by userId)`);
    });

    const vendorByUidSnap = await db.collection("vendors").where("uid", "==", uid).get();
    vendorByUidSnap.forEach((vDoc) => {
      batch.delete(vDoc.ref);
      console.log(`[onUserDelete] Queued deletion for vendors/${vDoc.id} (by uid)`);
    });

    // Commit all queued deletions
    await batch.commit();
    console.log(`[onUserDelete] Successfully cleaned up data for user: ${uid}`);
  } catch (error: any) {
    console.error(`[onUserDelete] Error cleaning up data for user ${uid}:`, error);
    throw error;
  }
});

export const onUserDeleted = onUserDelete;

/**
 * Helper function to execute orphaned data cleanup across Firestore.
 */
export async function executeOrphanedDataCleanup() {
  console.log("[executeOrphanedDataCleanup] Starting Firestore & Auth cross-reference scan...");

  // 1. Fetch all active user UIDs from Firebase Auth
  const activeAuthUids = new Set<string>();
  let nextPageToken: string | undefined = undefined;

  do {
    const listResult = await admin.auth().listUsers(1000, nextPageToken);
    listResult.users.forEach((u) => activeAuthUids.add(u.uid));
    nextPageToken = listResult.pageToken;
  } while (nextPageToken);

  console.log(`[executeOrphanedDataCleanup] Found ${activeAuthUids.size} active user(s) in Auth.`);

  const activeVendorIdsFromRoles = new Set<string>();

  // 2. Scan user_roles collection
  const userRolesSnap = await db.collection("user_roles").get();
  const orphanedRoleRefs: admin.firestore.DocumentReference[] = [];

  userRolesSnap.forEach((doc) => {
    if (!activeAuthUids.has(doc.id) && !doc.id.startsWith("invite_")) {
      orphanedRoleRefs.push(doc.ref);
    } else {
      const data = doc.data();
      if (data?.vendorId) {
        activeVendorIdsFromRoles.add(data.vendorId);
      }
    }
  });

  // 3. Scan users collection
  const usersSnap = await db.collection("users").get();
  const orphanedUserRefs: admin.firestore.DocumentReference[] = [];

  usersSnap.forEach((doc) => {
    if (!activeAuthUids.has(doc.id)) {
      orphanedUserRefs.push(doc.ref);
    } else {
      const data = doc.data();
      if (data?.vendorId) {
        activeVendorIdsFromRoles.add(data.vendorId);
      }
    }
  });

  // 4. Scan vendors collection
  const vendorsSnap = await db.collection("vendors").get();
  const orphanedVendorRefs: admin.firestore.DocumentReference[] = [];
  const orphanedVendorIds: string[] = [];

  vendorsSnap.forEach((doc) => {
    const vendorId = doc.id;
    const data = doc.data();
    const vendorUserId = data?.userId || data?.uid || data?.ownerId;

    // A vendor document is valid if:
    // a) Its ID matches an active Auth user
    // b) Its userId/uid/ownerId matches an active Auth user
    // c) It is linked as vendorId in user_roles or users for an active user
    const isValidVendor =
      activeAuthUids.has(vendorId) ||
      (vendorUserId && activeAuthUids.has(vendorUserId)) ||
      activeVendorIdsFromRoles.has(vendorId);

    if (!isValidVendor) {
      orphanedVendorRefs.push(doc.ref);
      orphanedVendorIds.push(vendorId);
    }
  });

  // 5. Scan posts collection for orphaned vendor posts
  const orphanedPostRefs: admin.firestore.DocumentReference[] = [];
  if (orphanedVendorIds.length > 0) {
    const postsSnap = await db.collection("posts").get();
    postsSnap.forEach((doc) => {
      const postVendorId = doc.data()?.vendorId;
      if (postVendorId && orphanedVendorIds.includes(postVendorId)) {
        orphanedPostRefs.push(doc.ref);
      }
    });
  }

  // Batch delete in chunks of 400 (Firestore max batch size is 500)
  const allOrphanedRefs = [
    ...orphanedRoleRefs,
    ...orphanedUserRefs,
    ...orphanedVendorRefs,
    ...orphanedPostRefs,
  ];

  console.log(`[executeOrphanedDataCleanup] Total orphaned items to delete: ${allOrphanedRefs.length}`);

  for (let i = 0; i < allOrphanedRefs.length; i += 400) {
    const batch = db.batch();
    const chunk = allOrphanedRefs.slice(i, i + 400);
    chunk.forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  const results = {
    deletedUserRolesCount: orphanedRoleRefs.length,
    deletedUsersCount: orphanedUserRefs.length,
    deletedVendorsCount: orphanedVendorRefs.length,
    deletedPostsCount: orphanedPostRefs.length,
    totalDeleted: allOrphanedRefs.length,
    activeAuthUsersCount: activeAuthUids.size,
  };

  console.log("[executeOrphanedDataCleanup] Cleanup finished:", results);
  return results;
}

/**
 * 2. Orphaned Data Cleanup Callable Cloud Function:
 * Callable Cloud Function allowing authenticated admin users to scan Firestore and delete orphaned records.
 */
export const cleanupOrphanedData = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required to run cleanup.");
  }

  const callerUid = context.auth.uid;
  const callerRoleDoc = await db.collection("user_roles").doc(callerUid).get();
  const isCallerAdmin = callerRoleDoc.exists && callerRoleDoc.data()?.role === "admin";

  if (!isCallerAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Administrator permissions required.");
  }

  const stats = await executeOrphanedDataCleanup();
  return {
    success: true,
    message: "Orphaned data scan and cleanup completed successfully.",
    stats,
  };
});

/**
 * 3. Stripe Express Connect Onboarding Callable Cloud Function:
 * Generates a Stripe Express onboarding link so vendors can safely enter bank details.
 */
export const createConnectAccount = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated to connect Stripe.");
  }

  const { vendorId, returnUrl, refreshUrl } = data || {};
  if (!vendorId) {
    throw new functions.https.HttpsError("invalid-argument", "Missing required vendorId parameter.");
  }

  const stripe = getStripeInstance();

  // 1. Fetch vendor to verify existence or check if already has stripeAccountId
  const vendorRef = db.collection("vendors").doc(vendorId);
  const vendorDoc = await vendorRef.get();
  let stripeAccountId = vendorDoc.exists ? vendorDoc.data()?.stripeAccountId : null;

  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: "express",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
        us_bank_account_ach_payments: { requested: true },
      },
      metadata: {
        vendorId,
        userId: context.auth.uid,
      },
    });
    stripeAccountId = account.id;

    // Save stripeAccountId to vendor doc in Firestore
    await vendorRef.set(
      {
        stripeAccountId,
        stripeConnected: false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  const baseUrl = data.baseUrl || "https://ais-dev-cbsdxwd34vvmza2vvckdfs-61889936560.us-west2.run.app";
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: refreshUrl || `${baseUrl}/api/stripe/onboard-refresh?vendorId=${vendorId}&check_stripe=true`,
    return_url: returnUrl || `${baseUrl}/api/stripe/onboard-complete?vendorId=${vendorId}&stripeAccountId=${stripeAccountId}&check_stripe=true`,
    type: "account_onboarding",
  });

  return {
    success: true,
    url: accountLink.url,
    stripeAccountId,
  };
});

/**
 * 4. Split Payment Stripe Checkout Session Callable Cloud Function:
 * Creates a Stripe Checkout Session with Destination Charges (split payments) and ACH Direct Debit support.
 */
export const createCheckoutSession = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated to make a payment.");
  }

  const { bookingId, vendorId, amount, baseUrl } = data || {};
  if (!vendorId || !amount || isNaN(Number(amount))) {
    throw new functions.https.HttpsError("invalid-argument", "Valid vendorId and amount are required.");
  }

  const stripe = getStripeInstance();

  // Lookup vendor in Firestore
  let vendorDoc = await db.collection("vendors").doc(vendorId).get();
  if (!vendorDoc.exists) {
    const querySnap = await db.collection("vendors").where("id", "==", vendorId).limit(1).get();
    if (!querySnap.empty) {
      vendorDoc = querySnap.docs[0];
    }
  }

  if (!vendorDoc.exists) {
    throw new functions.https.HttpsError("not-found", `Vendor ${vendorId} not found.`);
  }

  const vendorData = vendorDoc.data() || {};
  const stripeAccountId = vendorData.stripeAccountId || vendorData.stripeaccountid || vendorData.StripeAccountID;

  if (!stripeAccountId || !stripeAccountId.startsWith("acct_")) {
    throw new functions.https.HttpsError("failed-precondition", `Vendor ${vendorId} is not connected to Stripe.`);
  }

  const commissionRate = typeof vendorData.commissionRate === "number" ? vendorData.commissionRate : 5;
  const amountInCents = Math.round(Number(amount) * 100);

  if (amountInCents <= 0) {
    throw new functions.https.HttpsError("invalid-argument", "Payment amount must be greater than zero.");
  }

  const platformFeeInCents = Math.round(amountInCents * (commissionRate / 100));
  const originUrl = baseUrl || "https://ais-dev-cbsdxwd34vvmza2vvckdfs-61889936560.us-west2.run.app";

  const session = await stripe.checkout.sessions.create({
    ui_mode: "embedded",
    payment_method_types: ["card", "us_bank_account"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `Simcha Event Booking - ${bookingId || 'Payment'}`,
            description: `Automated split payment for vendor service`,
          },
          unit_amount: amountInCents,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    payment_intent_data: {
      application_fee_amount: platformFeeInCents,
      transfer_data: {
        destination: stripeAccountId,
      },
      metadata: {
        bookingId: bookingId || "none",
        vendorId: vendorId || "none",
        clientId: context.auth.uid,
      },
    },
    metadata: {
      bookingId: bookingId || "none",
      vendorId: vendorId || "none",
      clientId: context.auth.uid,
    },
    return_url: `${originUrl}/payment-success?session_id={CHECKOUT_SESSION_ID}&bookingId=${bookingId}&vendorId=${vendorId}`,
  });

  return {
    success: true,
    clientSecret: session.client_secret,
    client_secret: session.client_secret,
    sessionId: session.id,
  };
});

