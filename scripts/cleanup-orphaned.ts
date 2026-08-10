import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

// Read firebase-applet-config.json
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let firebaseConfig: any = {};
if (fs.existsSync(configPath)) {
  firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
}

const envProjectId =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.PROJECT_ID ||
  process.env.GCP_PROJECT;
const targetProjectId =
  (firebaseConfig.projectId && !firebaseConfig.projectId.includes("TODO"))
    ? firebaseConfig.projectId
    : envProjectId;

const dbId =
  firebaseConfig.firestoreDatabaseId ||
  firebaseConfig.databaseId ||
  "ai-studio-b85c10e8-0729-4d1f-841b-60b5c119be28";

console.log("==================================================");
console.log("   SIMCHA BOOKING - ORPHANED DATA CLEANUP SCRIPT  ");
console.log("==================================================");
console.log(`[Config] Project ID: ${targetProjectId}`);
console.log(`[Config] Database ID: ${dbId}`);

if (!admin.apps.length) {
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      credential = admin.credential.cert(sa);
    } catch {
      credential = admin.credential.applicationDefault();
    }
  } else {
    const saPath = path.join(process.cwd(), "service-account.json");
    if (fs.existsSync(saPath)) {
      credential = admin.credential.cert(saPath);
    } else {
      credential = admin.credential.applicationDefault();
    }
  }

  admin.initializeApp({
    credential,
    projectId: targetProjectId,
  });
}

const db = getFirestore(
  admin.app(),
  dbId === "(default)" ? undefined : dbId
);
db.settings({ ignoreUndefinedProperties: true });

async function runCleanupScript() {
  try {
    console.log("\n[1/5] Fetching active users from Firebase Auth...");
    const activeAuthUids = new Set<string>();
    let nextPageToken: string | undefined = undefined;

    do {
      const listResult = await admin.auth().listUsers(1000, nextPageToken);
      listResult.users.forEach((u) => {
        activeAuthUids.add(u.uid);
      });
      nextPageToken = listResult.pageToken;
    } while (nextPageToken);

    console.log(`      ✓ Found ${activeAuthUids.size} active user(s) in Auth.`);

    const activeVendorIdsFromRoles = new Set<string>();

    console.log("\n[2/5] Scanning 'user_roles' collection...");
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
    console.log(`      ✓ Scanned ${userRolesSnap.size} user_roles docs. Found ${orphanedRoleRefs.length} orphaned.`);

    console.log("\n[3/5] Scanning 'users' collection...");
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
    console.log(`      ✓ Scanned ${usersSnap.size} user docs. Found ${orphanedUserRefs.length} orphaned.`);

    console.log("\n[4/5] Scanning 'vendors' collection...");
    const vendorsSnap = await db.collection("vendors").get();
    const orphanedVendorRefs: admin.firestore.DocumentReference[] = [];
    const orphanedVendorIds: string[] = [];

    vendorsSnap.forEach((doc) => {
      const vendorId = doc.id;
      const data = doc.data();
      const vendorUserId = data?.userId || data?.uid || data?.ownerId;

      const isValidVendor =
        activeAuthUids.has(vendorId) ||
        (vendorUserId && activeAuthUids.has(vendorUserId)) ||
        activeVendorIdsFromRoles.has(vendorId);

      if (!isValidVendor) {
        orphanedVendorRefs.push(doc.ref);
        orphanedVendorIds.push(vendorId);
      }
    });
    console.log(`      ✓ Scanned ${vendorsSnap.size} vendor docs. Found ${orphanedVendorRefs.length} orphaned.`);

    console.log("\n[5/5] Scanning 'posts' collection for posts from orphaned vendors...");
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
    console.log(`      ✓ Found ${orphanedPostRefs.length} orphaned post(s).`);

    const allOrphanedRefs = [
      ...orphanedRoleRefs,
      ...orphanedUserRefs,
      ...orphanedVendorRefs,
      ...orphanedPostRefs,
    ];

    if (allOrphanedRefs.length === 0) {
      console.log("\n✨ Database is clean! No orphaned documents were found.");
      return;
    }

    console.log(`\nDeleting ${allOrphanedRefs.length} total orphaned document(s)...`);
    for (let i = 0; i < allOrphanedRefs.length; i += 400) {
      const batch = db.batch();
      const chunk = allOrphanedRefs.slice(i, i + 400);
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }

    console.log("\n==================================================");
    console.log("   CLEANUP COMPLETED SUCCESSFULLY!");
    console.log(`   • Deleted user_roles: ${orphanedRoleRefs.length}`);
    console.log(`   • Deleted users:      ${orphanedUserRefs.length}`);
    console.log(`   • Deleted vendors:    ${orphanedVendorRefs.length}`);
    console.log(`   • Deleted posts:      ${orphanedPostRefs.length}`);
    console.log(`   • Total Deleted:      ${allOrphanedRefs.length}`);
    console.log("==================================================");
  } catch (error: any) {
    console.error("\n❌ Cleanup failed with error:", error);
    process.exit(1);
  }
}

runCleanupScript();
