import { 
  collection, 
  doc, 
  writeBatch, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  limit
} from 'firebase/firestore';
import { db, auth, OperationType, handleFirestoreError } from './firebase';
import { Message } from '../types';

/**
 * Interface representing a Conversation document.
 */
export interface Conversation {
  id: string;
  type: 'booking' | 'admin_support';
  booking_id?: string;
  client_id?: string;
  vendor_id?: string;
  participant_ids: string[];
  last_message: string;
  last_message_at: any;
  created_at: any;
  typing?: Record<string, boolean>;
}

/**
 * Helper to determine the sender's role.
 */
export function determineSenderRole(senderId: string, currentRole?: string): 'client' | 'vendor' | 'admin' {
  if (senderId === 'admin') return 'admin';
  if (currentRole === 'admin' || currentRole === 'vendor' || currentRole === 'client') {
    return currentRole as 'client' | 'vendor' | 'admin';
  }
  return 'client'; // fallback
}

/**
 * 1. Send Message Action:
 * Writes to conversations/{conversationId}/messages/{messageId}.
 * Uses a batched write to simultaneously:
 *  - Create/Update parent conversation document with type, participants, booking_id, etc.
 *  - Set last_message/last_message_at on parent conversation doc.
 *  - Write the nested message document.
 *  - Increment the unread_count on the members doc for every participant EXCEPT the sender.
 */
export async function sendNewMessage(payload: Partial<Message> & { senderRole?: string }) {
  const senderId = payload.senderId || auth.currentUser?.uid || 'anonymous';
  // Resolve receiver details
  const receiverId = payload.receiverId || '';
  if (!receiverId) {
    throw new Error('Receiver ID is required to send a message');
  }

  const conversationId = payload.conversationId || [senderId, receiverId].sort().join('_');
  const tempId = payload.tempId || `msg_${Date.now()}`;
  
  // Determine roles
  const senderRole = determineSenderRole(senderId, payload.senderRole);

  const conDocSnapRef = doc(db, 'conversations', conversationId);
  const msgDocSnapRef = doc(collection(conDocSnapRef, 'messages'));

  const timestamp = serverTimestamp();
  
  // Prepare participants mapping
  const participantIds = Array.from(new Set([senderId, receiverId])).filter(Boolean);

  const batch = writeBatch(db);

  // Initialize parent conversation fields
  const type = payload.isAdminInquiry || senderId === 'admin' || receiverId === 'admin' 
    ? 'admin_support' 
    : 'booking';

  const isNewConversation = !(await getDoc(conDocSnapRef)).exists();

  const conversationUpdate: Partial<Conversation> & Record<string, any> = {
    type,
    participant_ids: participantIds,
    last_message: payload.text || 'Shared a file',
    last_message_at: timestamp,
  };

  // Assign optional fields depending on the schema
  if (payload.senderId !== 'admin' && payload.receiverId !== 'admin') {
    // Booking chat usually has vendor/client
    const clientId = senderRole === 'client' ? senderId : receiverId;
    const vendorId = senderRole === 'vendor' ? senderId : receiverId;
    conversationUpdate.client_id = clientId;
    conversationUpdate.vendor_id = vendorId;
  } else {
    // Admin support chat
    const clientId = senderId === 'admin' ? receiverId : senderId;
    conversationUpdate.client_id = clientId;
  }

  if (isNewConversation) {
    conversationUpdate.created_at = timestamp;
  }

  // Update conversation doc (or set it with merge)
  batch.set(conDocSnapRef, conversationUpdate, { merge: true });

  // Write nested message subcollection document
  const messageData = {
    sender_id: senderId,
    sender_role: senderRole,
    text: payload.text || '',
    read_by: {
      [senderId]: timestamp
    },
    is_deleted: false,
    sent_at: timestamp,
    
    // Additional fields to maintain parity with preexisting UI/UX without breaks
    senderId,
    receiverId,
    clientEmail: payload.clientEmail || '',
    clientName: payload.clientName || 'Guest',
    isRead: false,
    timestamp: new Date().toISOString(),
    tempId,
    type: payload.type || 'text',
    fileUrl: payload.fileUrl || null,
    imageUrl: payload.imageUrl || null,
    videoUrl: payload.videoUrl || null,
    audioUrl: payload.audioUrl || null,
    fileName: payload.fileName || null,
    fileType: payload.fileType || null,
    conversationId,
    isAdminInquiry: payload.isAdminInquiry || false,
    participants: participantIds,
    vendorEmail: payload.vendorEmail || null,
  };

  batch.set(msgDocSnapRef, messageData);

  // Increment unread_count on members/{userId} for other participants
  for (const uid of participantIds) {
    const memberDocRef = doc(conDocSnapRef, 'members', uid);
    if (uid === senderId) {
      batch.set(memberDocRef, {
        last_read_at: timestamp
      }, { merge: true });
    } else {
      batch.set(memberDocRef, {
        unread_count: increment(1)
      }, { merge: true });
    }
  }

  try {
    await batch.commit();
    return { id: msgDocSnapRef.id, conversationId };
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `conversations/${conversationId}/messages`);
    throw err;
  }
}

/**
 * 2. Fetch Inbox Action:
 * Loads a user's inbox list to use: where('participant_ids', 'array-contains', currentUser.uid),
 * ordered by last_message_at descending.
 */
export function subscribeToUserInbox(userId: string, callback: (conversations: any[]) => void, errorCallback?: (err: any) => void) {
  const q = query(
    collection(db, 'conversations'),
    where('participant_ids', 'array-contains', userId),
    orderBy('last_message_at', 'desc')
  );

  return onSnapshot(q, async (snapshot) => {
    const conversations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(conversations);
  }, (err) => {
    console.warn("Error subscribing to inbox conversations:", err);
    if (errorCallback) {
      errorCallback(err);
    } else {
      handleFirestoreError(err, OperationType.LIST, 'conversations');
    }
  });
}

/**
 * 3. Mark as Read Action:
 * Batch updates to set read_by.{userId} = serverTimestamp() on unread messages,
 * and resets unread_count to 0 on their specific members/{userId} document.
 */
export async function markChatAsRead(conversationId: string, userId: string) {
  if (!conversationId || !userId) return;

  const conDocRef = doc(db, 'conversations', conversationId);
  const messagesColRef = collection(conDocRef, 'messages');

  try {
    // Read only unread messages (where they haven't explicitly read yet)
    // We cannot query Map keys directly easily without reading all messages in limits or checking.
    // So let's fetch active messages in the conversation (e.g. limit 50 or those where read_by.{userId} is not present)
    const q = query(messagesColRef, limit(50));
    const snapshot = await getDocs(q);

    const batch = writeBatch(db);
    const timestamp = serverTimestamp();
    let hasUpdates = false;

    snapshot.docs.forEach((msgDoc) => {
      const data = msgDoc.data();
      const readBy = data.read_by || {};
      
      // If user hasn't read-receipted this yet, update it
      if (!readBy[userId]) {
        batch.update(msgDoc.ref, {
          [`read_by.${userId}`]: timestamp,
          isRead: true, // compat fallback
        });
        hasUpdates = true;
      }
    });

    // Reset unread_count to 0 on their members/{userId} doc
    const memberDocRef = doc(conDocRef, 'members', userId);
    batch.set(memberDocRef, {
      unread_count: 0,
      last_read_at: timestamp
    }, { merge: true });

    await batch.commit();
  } catch (err) {
    console.warn("Failed to mark chat as read in transaction/batch:", err);
    // Silent fail if permission or lock issues, but throw if necessary
  }
}

/**
 * 4. Helper to ensure Admin Support Conversation is created:
 * type: 'admin_support', participant_ids: [currentUser.uid, adminUserId], client_id: currentUser.uid.
 */
export async function ensureAdminSupportConversation(currentUserId: string, adminUserId: string = 'admin'): Promise<string> {
  const conversationId = [currentUserId, adminUserId].sort().join('_');
  const conDocRef = doc(db, 'conversations', conversationId);
  
  try {
    const snap = await getDoc(conDocRef);
    if (!snap.exists()) {
      await setDoc(conDocRef, {
        type: 'admin_support',
        client_id: currentUserId,
        participant_ids: [currentUserId, adminUserId],
        last_message: 'Inquiry started',
        last_message_at: serverTimestamp(),
        created_at: serverTimestamp()
      });
    }
    return conversationId;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `conversations/${conversationId}`);
    throw err;
  }
}
