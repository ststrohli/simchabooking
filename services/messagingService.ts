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
import { db, auth, OperationType, handleFirestoreError, getDocSafe, getDocsSafe } from './firebase';
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

  const canonicalConvoId = [senderId, receiverId].sort().join('_');
  const conversationId =
    payload.conversationId &&
    !payload.conversationId.includes('client_legacy') &&
    (receiverId === 'client_legacy' || senderId === 'client_legacy')
      ? payload.conversationId
      : canonicalConvoId;
  const tempId = payload.tempId || `msg_${Date.now()}`;
  
  // Determine roles
  const senderRole = determineSenderRole(senderId, payload.senderRole);

  const conDocSnapRef = doc(db, 'conversations', conversationId);
  const msgDocSnapRef = doc(collection(conDocSnapRef, 'messages'));

  const timestamp = serverTimestamp();
  
  // Prepare participants mapping strictly for the two conversation sides
  const participantIds = Array.from(
    new Set([senderId, receiverId, ...(payload.participants || [])])
  ).filter(Boolean);

  const batch = writeBatch(db);

  // Initialize parent conversation fields
  const type = payload.isAdminInquiry || senderId === 'admin' || receiverId === 'admin' 
    ? 'admin_support' 
    : 'booking';

  const isNewConversation = !(await getDocSafe(conDocSnapRef)).exists();

  const normalizedClientEmail = (payload.clientEmail || '').trim().toLowerCase();
  const normalizedClientName = (payload.clientName || '').trim() || 'Client';
  const resolvedVendorId =
    (payload as any).vendorId ||
    (senderRole === 'vendor' ? senderId : (receiverId !== 'admin' && senderId !== 'admin' ? receiverId : null));
  const resolvedVendorName = (payload as any).vendorName || null;

  const conversationUpdate: Partial<Conversation> & Record<string, any> = {
    type,
    participant_ids: participantIds,
    last_message: payload.text || 'Shared a file',
    last_message_at: timestamp,
    last_message_sender_id: senderId,
    last_message_read: false,
    ...(normalizedClientEmail ? { client_email: normalizedClientEmail } : {}),
    ...(normalizedClientName && normalizedClientName !== 'Guest' ? { client_name: normalizedClientName } : {}),
    ...(resolvedVendorId ? { vendor_id: resolvedVendorId } : {}),
    ...(resolvedVendorName ? { vendor_name: resolvedVendorName } : {}),
  };

  // Assign optional fields depending on the schema
  if (senderId !== 'admin' && receiverId !== 'admin') {
    // Booking chat usually has vendor/client
    const clientId = senderRole === 'vendor' ? receiverId : senderId;
    const vendorId = senderRole === 'vendor' ? senderId : receiverId;
    conversationUpdate.client_id = clientId;
    conversationUpdate.vendor_id = resolvedVendorId || vendorId;
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
    clientEmail: normalizedClientEmail,
    clientName: normalizedClientName,
    vendorId: resolvedVendorId || null,
    vendorName: resolvedVendorName || null,
    isRead: false,
    timestamp: new Date().toISOString(),
    tempId,
    type: payload.type || 'text',
    fileUrl: payload.fileUrl || null,
    imageUrl: payload.imageUrl || null,
    audioUrl: payload.audioUrl || null,
    audioDuration: payload.audioDuration || null,
    fileName: payload.fileName || null,
    fileType: payload.fileType || null,
    conversationId,
    isAdminInquiry: payload.isAdminInquiry || false,
    participants: participantIds,
    vendorEmail: payload.vendorEmail || null,
  };

  const payloadSize = JSON.stringify(messageData).length;
  if (payloadSize > 800000) {
    throw new Error(`Message payload size (${Math.round(payloadSize / 1024)}KB) exceeds the Firestore document limit of 1MB. Please compress or attach a smaller file.`);
  }

  batch.set(msgDocSnapRef, messageData);

  // Increment unread_count on members/{userId} for other participants
  for (const uid of participantIds) {
    const memberDocRef = doc(conDocSnapRef, 'members', uid);
    if (uid === senderId || (senderId !== 'admin' && uid === auth.currentUser?.uid)) {
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
 * Unsend/Delete a message from the database.
 */
export async function deleteMessage(conversationId: string, messageId: string, fallbackLastMessage?: string) {
  if (!conversationId || !messageId) return;
  const conDocRef = doc(db, 'conversations', conversationId);
  const msgDocRef = doc(db, 'conversations', conversationId, 'messages', messageId);
  try {
    const batch = writeBatch(db);
    batch.delete(msgDocRef);
    if (fallbackLastMessage !== undefined) {
      batch.set(conDocRef, { last_message: fallbackLastMessage }, { merge: true });
    }
    await batch.commit();
  } catch (err) {
    console.error("Failed to delete/unsend message:", err);
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

  return onSnapshot(q, (snapshot) => {
    const conversations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    callback(conversations);
  }, (err) => {
    console.warn("Ordered inbox query failed, trying fallback query without orderBy:", err);
    const fallbackQ = query(
      collection(db, 'conversations'),
      where('participant_ids', 'array-contains', userId)
    );
    return onSnapshot(fallbackQ, (snapshot) => {
      const conversations = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      conversations.sort((a: any, b: any) => {
        const timeA = a.last_message_at?.toDate ? a.last_message_at.toDate().getTime() : new Date(a.last_message_at || 0).getTime();
        const timeB = b.last_message_at?.toDate ? b.last_message_at.toDate().getTime() : new Date(b.last_message_at || 0).getTime();
        return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
      });
      callback(conversations);
    }, (err2) => {
      console.warn("Fallback inbox query also failed:", err2);
      if (errorCallback) {
        errorCallback(err2);
      } else {
        handleFirestoreError(err2, OperationType.LIST, 'conversations');
      }
    });
  });
}

/**
 * 3. Mark as Read Action:
 * Batch updates to set read_by.{userId} = serverTimestamp() and isRead = true on incoming messages
 * from the other party, records last_read_by / last_read_at_iso on the parent conversation doc,
 * and resets unread_count to 0 on their specific members/{userId} document.
 */
export async function markChatAsRead(conversationId: string, userId: string) {
  if (!conversationId || !userId) return;

  const conDocRef = doc(db, 'conversations', conversationId);
  const messagesColRef = collection(conDocRef, 'messages');

  try {
    const q = query(messagesColRef, limit(50));
    const snapshot = await getDocsSafe(q);

    const batch = writeBatch(db);
    const timestamp = serverTimestamp();
    const nowIso = new Date().toISOString();
    let hasIncomingMessages = false;

    snapshot.docs.forEach((msgDoc) => {
      const data = msgDoc.data();
      const readBy = data.read_by || {};
      const msgSenderId = data.sender_id || data.senderId || '';

      // Only mark messages sent by the OTHER party as read when userId opens the conversation
      if (msgSenderId && msgSenderId !== userId) {
        hasIncomingMessages = true;
        if (!readBy[userId] || !data.isRead) {
          batch.update(msgDoc.ref, {
            [`read_by.${userId}`]: timestamp,
            isRead: true,
            readAt: nowIso,
          });
        }
      }
    });

    // Update parent conversation read-receipt metadata so the sender's listener sees it immediately
    const convoReadUpdate: Record<string, any> = {
      last_read_by: {
        [userId]: timestamp,
      },
      last_read_at_iso: {
        [userId]: nowIso,
      },
    };
    if (hasIncomingMessages) {
      convoReadUpdate.last_message_read = true;
    }
    batch.set(conDocRef, convoReadUpdate, { merge: true });

    // Reset unread_count to 0 on their members/{userId} doc
    const memberDocRef = doc(conDocRef, 'members', userId);
    batch.set(memberDocRef, {
      unread_count: 0,
      last_read_at: timestamp
    }, { merge: true });

    await batch.commit();
  } catch (err) {
    console.warn("Failed to mark chat as read in transaction/batch:", err);
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
    const snap = await getDocSafe(conDocRef);
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
