import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Send, 
  User, 
  ImageIcon, 
  Paperclip, 
  Mic, 
  Play, 
  FileText, 
  Download, 
  Loader2, 
  Shield, 
  ArrowLeft, 
  Trash2, 
  Upload, 
  Check, 
  CheckCheck, 
  Clock, 
  Smile, 
  MoreVertical, 
  Search, 
  AlertCircle,
  Volume2,
  ChevronDown,
  ChevronUp,
  Copy,
  ChevronLeft
} from 'lucide-react';
import { Vendor, Message, UserAccount } from '../types';
import { auth, db, handleFirestoreError, OperationType } from '../services/firebase';
import { markChatAsRead, subscribeToUserInbox, ensureAdminSupportConversation, deleteMessage } from '../services/messagingService';
import { collection, query, where, orderBy, onSnapshot, doc, limit, startAfter, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { uploadFileWithProgress } from '../services/uploadService';
import { CustomAudioPlayer } from './CustomAudioPlayer';

interface ChatModalProps {
  isOpen: boolean;
  vendor: Vendor | null;
  isAdminMode?: boolean;
  onClose: () => void;
  onSendMessage: (payload: Partial<Message>) => void;
  showNotification: (message: string, type?: 'success' | 'info' | 'error') => void;
  messages: Message[];
  user: UserAccount;
  recipientUid?: string;
  recipientName?: string;
  recipientEmail?: string;
  recipientImage?: string;
  recipientCategory?: string;
  conversationIdOverride?: string;
  threadMessages?: Message[];
  isAdminReplying?: boolean;
  isVendorReplying?: boolean;
  vendors?: Vendor[];
  customConversations?: Array<{
    id: string;
    contactId: string;
    name: string;
    email?: string;
    category?: string;
    image?: string;
    isAdmin?: boolean;
    lastMessage: string;
    lastMessageType?: string;
    lastMessageTime: any;
    lastMessageIsSent?: boolean;
    lastMessageIsRead?: boolean;
    unreadCount: number;
    conversationId?: string;
  }>;
}

interface ImageWithPlaceholderProps {
  src: string;
  alt: string;
  onLoadCompletes: () => void;
  isSent: boolean;
}

const ImageWithPlaceholder: React.FC<ImageWithPlaceholderProps> = ({ src, alt, onLoadCompletes }) => {
  const [loaded, setLoaded] = useState(false);
  
  return (
    <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-zinc-950">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950 animate-pulse">
          <ImageIcon className="w-8 h-8 text-[#D4AF37]/40 mb-2" />
          <span className="text-[10px] uppercase tracking-widest text-[#D4AF37]/60 font-semibold font-mono">Loading Media...</span>
        </div>
      )}
      <img 
        src={src} 
        alt={alt} 
        onLoad={() => {
          setLoaded(true);
          onLoadCompletes();
        }} 
        className={`w-full h-full object-cover shadow-lg transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`} 
      />
    </div>
  );
};

const POPULAR_EMOJIS = ['😊', '😂', '❤️', '👍', '👏', '🙏', '🥂', '🍷', '✡️', '🎉', '🎈', '🎂', '👑', '💍', '🎵', '📸', '✨'];

export const ChatModal: React.FC<ChatModalProps> = ({ 
  isOpen, 
  vendor: initialVendor, 
  isAdminMode: initialIsAdminMode, 
  onClose, 
  onSendMessage, 
  showNotification, 
  messages: propMessages = [],
  user,
  recipientUid,
  recipientName,
  recipientEmail,
  recipientImage,
  recipientCategory,
  conversationIdOverride,
  threadMessages = [],
  isAdminReplying,
  isVendorReplying,
  vendors = [],
  customConversations
}) => {
  // Active contact / conversation states
  const [currentContact, setCurrentContact] = useState<{
    id: string;
    name: string;
    email?: string;
    image?: string;
    category?: string;
    isAdmin?: boolean;
    conversationId?: string;
  } | null>(null);

  // Active view on mobile: 'chat' | 'list'
  const [mobileView, setMobileView] = useState<'chat' | 'list'>('chat');

  // Inbox threads state
  const [inboxThreads, setInboxThreads] = useState<any[]>([]);
  const [inboxSearchQuery, setInboxSearchQuery] = useState('');
  const [inboxFilter, setInboxFilter] = useState<'all' | 'unread'>('all');

  // Chat message & input states
  const [text, setText] = useState('');
  const [clientName, setClientName] = useState((isAdminReplying || isVendorReplying) ? (recipientName || '') : (user?.name || ''));
  const [clientEmail, setClientEmail] = useState((isAdminReplying || isVendorReplying) ? (recipientEmail || '') : (user?.username || ''));
  const [isIdentityVerified, setIsIdentityVerified] = useState((isAdminReplying || isVendorReplying) ? true : !!(user?.name && user?.username));
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [fullscreenMedia, setFullscreenMedia] = useState<{url: string, type: 'image' | 'video'} | null>(null);
  
  // In-chat search states
  const [isChatSearching, setIsChatSearching] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [chatSearchMatches, setChatSearchMatches] = useState<string[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  // Real voice recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);
  const [liveVolumeBars, setLiveVolumeBars] = useState<number[]>(new Array(16).fill(6));
  
  // UI Panels
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  // Message Lists
  const [activeMessages, setActiveMessages] = useState<Message[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [historicalMessages, setHistoricalMessages] = useState<Message[]>([]);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [otherIsTyping, setOtherIsTyping] = useState(false);
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const typingTimeoutRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastMessageCountRef = useRef(0);
  const lastMarkedConvoRef = useRef<string>('');

  const myUid = isAdminReplying ? 'admin' : (user?.id || auth.currentUser?.uid || '');
  const targetUid = currentContact?.id || '';
  const activeConversationId = currentContact?.conversationId || (myUid && targetUid ? [myUid, targetUid].sort().join('_') : '');
  const isSupportChat = currentContact?.isAdmin || targetUid === 'admin' || !!isAdminReplying;

  const lastInitKeyRef = useRef<string>('');

  // Initialize active contact when modal opens or initial target contact changes
  useEffect(() => {
    if (!isOpen) {
      lastInitKeyRef.current = '';
      return;
    }
    const targetKey = `${Boolean(isAdminReplying)}_${Boolean(isVendorReplying)}_${recipientUid || ''}_${initialVendor?.id || ''}_${Boolean(initialIsAdminMode)}_${conversationIdOverride || ''}`;
    if (lastInitKeyRef.current === targetKey) {
      return;
    }
    lastInitKeyRef.current = targetKey;

    if (isAdminReplying || isVendorReplying) {
      setCurrentContact({
        id: recipientUid || (isVendorReplying ? 'client_legacy' : 'client'),
        name: recipientName || 'Client',
        email: recipientEmail,
        image: recipientImage,
        category: recipientCategory || (isVendorReplying ? 'Client' : 'User'),
        isAdmin: false,
        conversationId: conversationIdOverride
      });
      setMobileView('chat');
    } else if (initialVendor) {
      setCurrentContact({
        id: initialVendor.id,
        name: initialVendor.name,
        email: initialVendor.contactEmail,
        image: initialVendor.image,
        category: initialVendor.category,
        isAdmin: false,
        conversationId: conversationIdOverride
      });
      setMobileView('chat');
    } else if (initialIsAdminMode) {
      setCurrentContact({
        id: 'admin',
        name: 'Simcha Concierge',
        category: 'Support & Concierge',
        isAdmin: true,
        conversationId: conversationIdOverride
      });
      setMobileView('chat');
    } else {
      // Default to Simcha Concierge if no contact specified
      setCurrentContact({
        id: 'admin',
        name: 'Simcha Concierge',
        category: 'Support & Concierge',
        isAdmin: true
      });
      setMobileView('list');
    }
  }, [isOpen, initialVendor, initialIsAdminMode, isAdminReplying, isVendorReplying, recipientUid, recipientName, recipientEmail, recipientImage, recipientCategory, conversationIdOverride]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  }, [isOpen]);

  useEffect(() => {
    if (isAdminReplying || isVendorReplying) {
      setClientEmail(currentContact?.email || recipientEmail || '');
      setClientName(currentContact?.name || recipientName || 'Client');
      setIsIdentityVerified(true);
    } else if (user?.username) {
      setClientEmail(user.username);
      setClientName(user.name || user.username.split('@')[0] || 'Guest');
      setIsIdentityVerified(true);
    }
  }, [user, isAdminReplying, isVendorReplying, recipientEmail, recipientName, currentContact]);

  // Subscribe to user inbox threads for the WhatsApp conversation list
  useEffect(() => {
    if (!isOpen || !myUid) return;

    const unsubscribe = subscribeToUserInbox(myUid, (conversations) => {
      setInboxThreads(conversations);
    }, (err) => {
      console.warn("User inbox subscription error:", err);
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [isOpen, myUid]);

  // Real-time onSnapshot listener querying the nested messages subcollection
  useEffect(() => {
    if (!isOpen || !activeConversationId) {
      setActiveMessages([]);
      setOptimisticMessages([]);
      setHistoricalMessages([]);
      setLastVisibleDoc(null);
      setHasMore(true);
      setIsLoadingMore(false);
      lastMessageCountRef.current = 0;
      return;
    }

    const subLists = new Map<string, Message[]>();
    const rebuildActiveMessages = () => {
      const seenIds = new Set<string>();
      const combined: Message[] = [];
      subLists.forEach((list) => {
        list.forEach((m) => {
          if (m.id && !seenIds.has(m.id)) {
            seenIds.add(m.id);
            combined.push(m);
          }
        });
      });
      combined.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
      });
      setActiveMessages(combined);
    };

    const parseSnapshotDocs = (docs: any[]) => {
      return docs.map(docSnap => {
        const data = docSnap.data();
        let timestampStr = new Date().toISOString();
        if (data.sent_at) {
          if (typeof data.sent_at.toDate === 'function') {
            timestampStr = data.sent_at.toDate().toISOString();
          } else {
            timestampStr = new Date(data.sent_at).toISOString();
          }
        } else if (data.timestamp) {
          timestampStr = typeof data.timestamp === 'string' ? data.timestamp : new Date(data.timestamp).toISOString();
        }
        return {
          id: docSnap.id,
          ...data,
          senderId: data.sender_id || data.senderId,
          receiverId: data.receiver_id || data.receiverId,
          timestamp: timestampStr,
        } as Message;
      });
    };

    const q = query(
      collection(db, 'conversations', activeConversationId, 'messages')
    );

    let fallbackUnsub: (() => void) | null = null;
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgsRaw = parseSnapshotDocs(snapshot.docs);
      subLists.set(activeConversationId, msgsRaw);
      rebuildActiveMessages();

      if (snapshot.docs.length > 0) {
        setLastVisibleDoc(snapshot.docs[snapshot.docs.length - 1]);
      }
      setHasMore(false);
    }, (err) => {
      console.warn("Firestore messages subcollection query error:", err);
      handleFirestoreError(err, OperationType.LIST, 'messages');
    });

    // Also listen to all conversation documents for this client + vendor/admin pair
    // (including default UID pair, client_legacy, client_email, client_id, and any conversationIds from threadMessages/propMessages)
    // so any message that showed up on the pill-shaped thread button is guaranteed to show in the actual chat
    const extraUnsubs = new Map<string, () => void>();
    const topQueryUnsubs: (() => void)[] = [];
    const myEmailLower = (clientEmail || user?.username || auth.currentUser?.email || '').trim().toLowerCase();

    const attachAltConvoListener = (altCid: string, filterByClient = false) => {
      if (!altCid || altCid === activeConversationId || extraUnsubs.has(altCid)) return;
      const altQ = query(collection(db, 'conversations', altCid, 'messages'));
      const u = onSnapshot(
        altQ,
        (snap) => {
          if (!snap.empty) {
            let parsed = parseSnapshotDocs(snap.docs);
            if (filterByClient && myUid) {
              parsed = parsed.filter((m: any) => {
                const mEmail = (m.clientEmail || m.client_email || '').trim().toLowerCase();
                const mSender = m.senderId || m.sender_id || '';
                const mReceiver = m.receiverId || m.receiver_id || '';
                const mClientId = m.client_id || '';
                if (mSender === myUid || mReceiver === myUid || mClientId === myUid) return true;
                if (myEmailLower && (mEmail === myEmailLower || mSender.toLowerCase() === myEmailLower || mReceiver.toLowerCase() === myEmailLower)) return true;
                // If no other client's email/UID is attached on a legacy vendor/admin reply, include it
                if (!mEmail && (mReceiver === 'client_legacy' || mSender === targetUid || mSender === 'admin')) return true;
                return false;
              });
            }
            subLists.set(altCid, parsed);
            rebuildActiveMessages();
          }
        },
        () => {}
      );
      extraUnsubs.set(altCid, u);
    };

    const defaultPairCid = myUid && targetUid ? [myUid, targetUid].sort().join('_') : '';
    if (defaultPairCid && defaultPairCid !== activeConversationId) {
      attachAltConvoListener(defaultPairCid, false);
    }

    // Attach listeners to any conversationId present in threadMessages or matching propMessages
    if (!isAdminReplying && !isVendorReplying) {
      threadMessages.forEach((tm) => {
        if (!tm?.conversationId) return;
        const isTmAdmin = Boolean(tm.isAdminInquiry || tm.senderId === 'admin' || tm.receiverId === 'admin' || tm.conversationId.includes('admin'));
        if (isSupportChat && isTmAdmin) {
          attachAltConvoListener(tm.conversationId, false);
        } else if (!isSupportChat && !isTmAdmin && targetUid) {
          attachAltConvoListener(tm.conversationId, false);
        }
      });

      propMessages.forEach((pm) => {
        if (!pm?.conversationId) return;
        const pmSender = pm.senderId || (pm as any).sender_id || '';
        const pmReceiver = pm.receiverId || (pm as any).receiver_id || '';
        const pmVendorId = (pm as any).vendorId || (pm as any).vendor_id || '';
        const pmEmail = (pm.clientEmail || (pm as any).client_email || '').trim().toLowerCase();
        const isMine =
          pmSender === myUid ||
          pmReceiver === myUid ||
          (pm as any).client_id === myUid ||
          (myEmailLower && (pmEmail === myEmailLower || pmSender.toLowerCase() === myEmailLower || pmReceiver.toLowerCase() === myEmailLower));
        if (!isMine) return;

        const isPmAdmin = Boolean(pm.isAdminInquiry || pmSender === 'admin' || pmReceiver === 'admin' || pm.conversationId.includes('admin'));
        if (isSupportChat && isPmAdmin) {
          attachAltConvoListener(pm.conversationId, false);
        } else if (
          !isSupportChat &&
          !isPmAdmin &&
          targetUid &&
          (pmSender === targetUid ||
            pmReceiver === targetUid ||
            pmVendorId === targetUid ||
            pm.conversationId.includes(targetUid) ||
            (currentContact?.email && pm.vendorEmail && pm.vendorEmail.toLowerCase() === currentContact.email.toLowerCase()))
        ) {
          attachAltConvoListener(pm.conversationId, false);
        }
      });
    }

    if (!isAdminReplying && !isVendorReplying && targetUid) {
      if (targetUid === 'admin') {
        attachAltConvoListener(['admin', 'client_legacy'].sort().join('_'), true);
        const matchesAdminConvo = (dSnap: any) => {
          const d = dSnap.data() || {};
          const pIds: string[] = d.participant_ids || [];
          return d.type === 'admin_support' || pIds.includes('admin') || dSnap.id.includes('admin');
        };
        if (myUid) {
          const qAdminByParticipant = query(collection(db, 'conversations'), where('participant_ids', 'array-contains', myUid));
          topQueryUnsubs.push(
            onSnapshot(qAdminByParticipant, (snap) => {
              snap.docs.forEach((dSnap) => {
                if (matchesAdminConvo(dSnap)) attachAltConvoListener(dSnap.id, false);
              });
            }, () => {})
          );
          const qAdminByClientId = query(collection(db, 'conversations'), where('client_id', '==', myUid));
          topQueryUnsubs.push(
            onSnapshot(qAdminByClientId, (snap) => {
              snap.docs.forEach((dSnap) => {
                if (matchesAdminConvo(dSnap)) attachAltConvoListener(dSnap.id, false);
              });
            }, () => {})
          );
        }
        if (myEmailLower) {
          attachAltConvoListener([myEmailLower, 'admin'].sort().join('_'), false);
          const qEmailAdmin = query(collection(db, 'conversations'), where('client_email', '==', myEmailLower));
          topQueryUnsubs.push(
            onSnapshot(
              qEmailAdmin,
              (snap) => {
                snap.docs.forEach((dSnap) => {
                  if (matchesAdminConvo(dSnap)) {
                    attachAltConvoListener(dSnap.id, false);
                  }
                });
              },
              () => {}
            )
          );
          const qEmailParticipantAdmin = query(collection(db, 'conversations'), where('participant_ids', 'array-contains', myEmailLower));
          topQueryUnsubs.push(
            onSnapshot(qEmailParticipantAdmin, (snap) => {
              snap.docs.forEach((dSnap) => {
                if (matchesAdminConvo(dSnap)) attachAltConvoListener(dSnap.id, false);
              });
            }, () => {})
          );
        }
      } else {
        // Vendor chat: listen to client_legacy_<vendorId>, email_<vendorId>, and any conversation matching client + vendor
        attachAltConvoListener(['client_legacy', targetUid].sort().join('_'), true);
        if (myEmailLower) {
          attachAltConvoListener([myEmailLower, targetUid].sort().join('_'), false);
          if (clientEmail && clientEmail.trim() !== myEmailLower) {
            attachAltConvoListener([clientEmail.trim(), targetUid].sort().join('_'), false);
          }
        }

        const matchesTargetVendor = (dSnap: any) => {
          const d = dSnap.data() || {};
          const pIds: string[] = d.participant_ids || [];
          return (
            d.vendor_id === targetUid ||
            d.vendorId === targetUid ||
            pIds.includes(targetUid) ||
            dSnap.id.split('_').includes(targetUid) ||
            (currentContact?.name && d.vendor_name && d.vendor_name.toLowerCase() === currentContact.name.toLowerCase())
          );
        };

        if (myUid) {
          const qByParticipant = query(collection(db, 'conversations'), where('participant_ids', 'array-contains', myUid));
          topQueryUnsubs.push(
            onSnapshot(
              qByParticipant,
              (snap) => {
                snap.docs.forEach((dSnap) => {
                  if (matchesTargetVendor(dSnap)) {
                    attachAltConvoListener(dSnap.id, false);
                  }
                });
              },
              () => {}
            )
          );

          const qByClientId = query(collection(db, 'conversations'), where('client_id', '==', myUid));
          topQueryUnsubs.push(
            onSnapshot(
              qByClientId,
              (snap) => {
                snap.docs.forEach((dSnap) => {
                  if (matchesTargetVendor(dSnap)) {
                    attachAltConvoListener(dSnap.id, false);
                  }
                });
              },
              () => {}
            )
          );
        }

        if (myEmailLower) {
          const qByClientEmail = query(collection(db, 'conversations'), where('client_email', '==', myEmailLower));
          topQueryUnsubs.push(
            onSnapshot(
              qByClientEmail,
              (snap) => {
                snap.docs.forEach((dSnap) => {
                  if (matchesTargetVendor(dSnap)) {
                    attachAltConvoListener(dSnap.id, false);
                  }
                });
              },
              () => {}
            )
          );

          const qByParticipantEmail = query(collection(db, 'conversations'), where('participant_ids', 'array-contains', myEmailLower));
          topQueryUnsubs.push(
            onSnapshot(
              qByParticipantEmail,
              (snap) => {
                snap.docs.forEach((dSnap) => {
                  if (matchesTargetVendor(dSnap)) {
                    attachAltConvoListener(dSnap.id, false);
                  }
                });
              },
              () => {}
            )
          );
        }
      }
    }

    return () => {
      unsubscribe();
      if (fallbackUnsub) fallbackUnsub();
      topQueryUnsubs.forEach((u) => u());
      extraUnsubs.forEach((u) => u());
      extraUnsubs.clear();
    };
  }, [isOpen, activeConversationId, isAdminReplying, isVendorReplying, isSupportChat, targetUid, myUid, clientEmail, user?.username, threadMessages, propMessages, currentContact?.email, currentContact?.name]);

  // Clean optimistic messages that are now confirmed in database
  useEffect(() => {
    if (activeMessages.length > 0 && optimisticMessages.length > 0) {
      const dbTempIds = new Set(activeMessages.map(m => m.tempId).filter(Boolean));
      const stillPending = optimisticMessages.filter(om => !dbTempIds.has(om.tempId));
      if (stillPending.length !== optimisticMessages.length) {
        setOptimisticMessages(stillPending);
      }
    }
  }, [activeMessages, optimisticMessages]);

  // Typing status & read-receipt metadata listener on parent conversation doc
  useEffect(() => {
    if (!isOpen || !activeConversationId || !targetUid) {
      setOtherIsTyping(false);
      setOtherLastReadAt(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'conversations', activeConversationId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const typing = data?.typing || {};
        const otherTyping = typing[targetUid] || false;
        setOtherIsTyping(otherTyping);

        const lastReadIsoMap = data?.last_read_at_iso || {};
        const targetReadIso = lastReadIsoMap[targetUid] ||
          Object.entries(lastReadIsoMap).find(([k]) => k !== myUid && k !== (auth.currentUser?.uid || ''))?.[1] ||
          null;
        setOtherLastReadAt(typeof targetReadIso === 'string' ? targetReadIso : null);
      } else {
        setOtherIsTyping(false);
        setOtherLastReadAt(null);
      }
    }, (err) => {
      console.warn("Error listening to conversation document:", err);
    });
    return () => unsub();
  }, [isOpen, activeConversationId, targetUid, myUid]);

  // Auto-mark as read when receiver opens the conversation or receives new messages while open
  useEffect(() => {
    if (!isOpen) {
      lastMarkedConvoRef.current = '';
      return;
    }
    if (!myUid || !activeConversationId) return;

    const hasIncomingUnread = activeMessages.some(
      m => m.senderId && m.senderId !== myUid && (!m.isRead || !(m as any).read_by?.[myUid])
    );
    const isFirstOpenOfConvo = lastMarkedConvoRef.current !== activeConversationId;

    if (hasIncomingUnread || isFirstOpenOfConvo) {
      lastMarkedConvoRef.current = activeConversationId;
      markChatAsRead(activeConversationId, myUid).catch(err => {
        console.warn("markChatAsRead failed:", err);
      });
    }
  }, [isOpen, activeMessages, myUid, activeConversationId]);

  // Merged and deduplicated messages
  const chatMessages = useMemo(() => {
    const seenIds = new Set<string>();
    const uniqueMessages: Message[] = [];

    historicalMessages.forEach(m => {
      if (m.id && !seenIds.has(m.id)) {
        seenIds.add(m.id);
        uniqueMessages.push(m);
      }
    });

    activeMessages.forEach(m => {
      if (m.id && !seenIds.has(m.id)) {
        seenIds.add(m.id);
        uniqueMessages.push(m);
      }
    });

    // Directly include threadMessages passed from the clicked pill-shaped box in ClientPortal
    if (!isAdminReplying && !isVendorReplying && threadMessages && threadMessages.length > 0) {
      threadMessages.forEach(m => {
        if (!m || (m.id && seenIds.has(m.id))) return;
        const mSender = m.senderId || (m as any).sender_id || '';
        const mReceiver = m.receiverId || (m as any).receiver_id || '';
        const mVendorId = (m as any).vendorId || (m as any).vendor_id || '';
        const isMsgAdmin = Boolean(
          m.isAdminInquiry ||
          mSender === 'admin' ||
          mReceiver === 'admin' ||
          (m.conversationId && m.conversationId.includes('admin'))
        );
        const matchesActiveContact = isSupportChat
          ? isMsgAdmin
          : (!isMsgAdmin &&
              Boolean(targetUid) &&
              (targetUid === initialVendor?.id ||
                mSender === targetUid ||
                mReceiver === targetUid ||
                mVendorId === targetUid ||
                (m.conversationId && m.conversationId.includes(targetUid)) ||
                (currentContact?.email && m.vendorEmail && m.vendorEmail.toLowerCase() === currentContact.email.toLowerCase())));

        if (matchesActiveContact) {
          if (m.id) seenIds.add(m.id);
          uniqueMessages.push({
            ...m,
            senderId: mSender || m.senderId,
            receiverId: mReceiver || m.receiverId,
          });
        }
      });
    }

    // Include matching propMessages as immediate fallback if not already in activeMessages
    if (propMessages && propMessages.length > 0) {
      const myEmailNorm = (clientEmail || user?.username || auth.currentUser?.email || '').trim().toLowerCase();
      propMessages.forEach(m => {
        if (!m || (m.id && seenIds.has(m.id))) return;
        const mSender = m.senderId || (m as any).sender_id || '';
        const mReceiver = m.receiverId || (m as any).receiver_id || '';
        const mVendorId = (m as any).vendorId || (m as any).vendor_id || '';
        const mVendorName = ((m as any).vendorName || (m as any).vendor_name || '').trim().toLowerCase();
        const mClientEmail = (m.clientEmail || (m as any).client_email || '').trim().toLowerCase();
        const mClientId = (m as any).client_id || '';
        const msgConvoId = m.conversationId || [mSender, mReceiver].sort().join('_');

        const matchesConvo = Boolean(activeConversationId && msgConvoId === activeConversationId);
        const matchesParticipants =
          (mSender === myUid && mReceiver === targetUid) ||
          (mSender === targetUid && mReceiver === myUid);
        const matchesVendorClientEmail =
          isVendorReplying &&
          currentContact?.email &&
          mClientEmail === currentContact.email.trim().toLowerCase();
        const matchesAdminSupport =
          isAdminReplying &&
          (m.isAdminInquiry || mSender === 'admin' || mReceiver === 'admin') &&
          (mSender === targetUid ||
            mReceiver === targetUid ||
            (currentContact?.email && mClientEmail === currentContact.email.trim().toLowerCase()));
        const matchesClientSide =
          mSender === myUid ||
          mReceiver === myUid ||
          mClientId === myUid ||
          (myEmailNorm &&
            (mClientEmail === myEmailNorm ||
              mSender.toLowerCase() === myEmailNorm ||
              mReceiver.toLowerCase() === myEmailNorm ||
              mClientId.toLowerCase() === myEmailNorm)) ||
          (m.participants && m.participants.some((p: string) => p === myUid || (myEmailNorm && p.toLowerCase() === myEmailNorm)));
        const matchesClientSupport =
          !isAdminReplying &&
          !isVendorReplying &&
          isSupportChat &&
          (m.isAdminInquiry || mSender === 'admin' || mReceiver === 'admin' || (m.conversationId && m.conversationId.includes('admin'))) &&
          matchesClientSide;
        const matchesClientVendorMessage =
          !isAdminReplying &&
          !isVendorReplying &&
          !isSupportChat &&
          Boolean(targetUid) &&
          (mSender === targetUid ||
            mReceiver === targetUid ||
            mVendorId === targetUid ||
            (m.conversationId && m.conversationId.split('_').includes(targetUid)) ||
            (currentContact?.email && m.vendorEmail && m.vendorEmail.toLowerCase() === currentContact.email.toLowerCase()) ||
            (currentContact?.name && mVendorName && mVendorName === currentContact.name.trim().toLowerCase())) &&
          matchesClientSide;

        if (
          matchesConvo ||
          matchesParticipants ||
          matchesVendorClientEmail ||
          matchesAdminSupport ||
          matchesClientSupport ||
          matchesClientVendorMessage
        ) {
          if (m.id) seenIds.add(m.id);
          uniqueMessages.push({
            ...m,
            senderId: mSender || m.senderId,
            receiverId: mReceiver || m.receiverId,
          });
        }
      });
    }

    uniqueMessages.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
    });

    const seenTempIds = new Set<string>();
    const dedupedByIdAndTemp: Message[] = [];
    for (const m of uniqueMessages) {
      if (m.tempId && seenTempIds.has(m.tempId)) continue;
      if (m.tempId) seenTempIds.add(m.tempId);
      dedupedByIdAndTemp.push(m);
    }

    const dbTempIds = new Set(dedupedByIdAndTemp.map(m => m.tempId).filter(Boolean));
    const resolvedDbMessages = dedupedByIdAndTemp.map(m => {
      if (m.tempId) {
        return { ...m, status: 'sent' as const };
      }
      return m;
    });

    const pendingOptimistic = optimisticMessages
      .filter(om => {
        if (om.tempId && dbTempIds.has(om.tempId)) return false;
        // Also exclude if a real DB message with matching content and sender arrived within 15 seconds
        const omTime = om.timestamp ? new Date(om.timestamp).getTime() : Date.now();
        const hasMatchingRealMsg = resolvedDbMessages.some(dbMsg => {
          if (dbMsg.senderId !== om.senderId) return false;
          if ((dbMsg.type || 'text') !== (om.type || 'text')) return false;
          if ((dbMsg.text || '') !== (om.text || '')) return false;
          const dbTime = dbMsg.timestamp ? new Date(dbMsg.timestamp).getTime() : 0;
          return Math.abs(dbTime - omTime) < 15000;
        });
        return !hasMatchingRealMsg;
      })
      .map(om => ({ ...om, isOptimistic: true, status: om.status || ('sending' as const) }));

    return [...resolvedDbMessages, ...pendingOptimistic];
  }, [historicalMessages, activeMessages, optimisticMessages, threadMessages, propMessages, initialVendor?.id, activeConversationId, myUid, targetUid, isVendorReplying, isAdminReplying, isSupportChat, clientEmail, user?.username, currentContact]);

  // In-chat search filter & jump
  useEffect(() => {
    if (!chatSearchQuery.trim()) {
      setChatSearchMatches([]);
      setActiveMatchIndex(0);
      return;
    }
    const qLower = chatSearchQuery.toLowerCase();
    const matched = chatMessages.filter(m => (m.text || '').toLowerCase().includes(qLower)).map(m => m.id || m.tempId || '');
    setChatSearchMatches(matched);
    setActiveMatchIndex(0);
  }, [chatSearchQuery, chatMessages]);

  const jumpToMatch = (index: number) => {
    if (chatSearchMatches.length === 0) return;
    const matchId = chatSearchMatches[index];
    const el = document.getElementById(`msg-${matchId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleNextMatch = () => {
    if (chatSearchMatches.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % chatSearchMatches.length;
    setActiveMatchIndex(nextIdx);
    jumpToMatch(nextIdx);
  };

  const handlePrevMatch = () => {
    if (chatSearchMatches.length === 0) return;
    const prevIdx = (activeMatchIndex - 1 + chatSearchMatches.length) % chatSearchMatches.length;
    setActiveMatchIndex(prevIdx);
    jumpToMatch(prevIdx);
  };

  const scrollToBottomSmart = (force = false) => {
    const el = scrollRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 180;
    if (force || isNearBottom) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    }
  };

  const loadMoreMessages = async () => {
    if (isLoadingMore || !hasMore || !lastVisibleDoc || !myUid || !targetUid) return;
    setIsLoadingMore(true);
    const container = scrollRef.current;
    const previousScrollHeight = container ? container.scrollHeight : 0;
    const previousScrollTop = container ? container.scrollTop : 0;

    try {
      const activeConversationId = [myUid, targetUid].sort().join('_');
      const q = query(
        collection(db, 'conversations', activeConversationId, 'messages'),
        orderBy('sent_at', 'desc'),
        startAfter(lastVisibleDoc),
        limit(30)
      );

      const querySnapshot = await getDocs(q);
      if (querySnapshot.docs.length > 0) {
        const olderMsgs = querySnapshot.docs.map(docSnap => {
          const data = docSnap.data();
          let timestampStr = new Date().toISOString();
          if (data.sent_at) {
            if (typeof data.sent_at.toDate === 'function') {
              timestampStr = data.sent_at.toDate().toISOString();
            } else {
              timestampStr = new Date(data.sent_at).toISOString();
            }
          }
          return {
            id: docSnap.id,
            ...data,
            senderId: data.sender_id || data.senderId,
            timestamp: timestampStr,
          } as Message;
        });
        
        olderMsgs.reverse();
        setHistoricalMessages(prev => [...olderMsgs, ...prev]);
        setLastVisibleDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
        setHasMore(querySnapshot.docs.length >= 30);

        setTimeout(() => {
          if (container) {
            const newHeight = container.scrollHeight;
            container.scrollTop = previousScrollTop + (newHeight - previousScrollHeight);
          }
        }, 30);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Error loading historical messages:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop <= 50 && hasMore && !isLoadingMore) {
      loadMoreMessages();
    }
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottomBtn(distFromBottom > 220);
  };

  useEffect(() => {
    if (isOpen) {
      if (lastMessageCountRef.current === 0 && chatMessages.length > 0) {
        scrollToBottomSmart(true);
      } else if (chatMessages.length > lastMessageCountRef.current) {
        scrollToBottomSmart(false);
      }
      lastMessageCountRef.current = chatMessages.length;
    } else {
      lastMessageCountRef.current = 0;
    }
  }, [chatMessages, isOpen]);

  const sendOptimisticMessage = async (payload: Partial<Message>) => {
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const optMsg: Message = {
      id: tempId,
      tempId,
      text: payload.text || '',
      clientName: payload.clientName || clientName,
      clientEmail: payload.clientEmail || clientEmail,
      senderId: payload.senderId || myUid,
      receiverId: payload.receiverId || targetUid,
      conversationId: payload.conversationId || [myUid, targetUid].sort().join('_'),
      isAdminInquiry: payload.isAdminInquiry || isSupportChat,
      type: payload.type || 'text',
      timestamp: new Date().toISOString(),
      isOptimistic: true,
      status: 'sending',
      isRead: false,
      fileUrl: payload.fileUrl,
      imageUrl: payload.imageUrl,
      audioUrl: payload.audioUrl,
      audioDuration: payload.audioDuration,
      fileName: payload.fileName,
      fileType: payload.fileType,
    };

    setOptimisticMessages(prev => [...prev, optMsg]);
    
    try {
      await onSendMessage({
        ...payload,
        tempId,
      });
      // Remove optimistic placeholder once send completes so it never duplicates the real DB message
      setOptimisticMessages(prev => prev.filter(m => m.tempId !== tempId));
    } catch (err) {
      console.error("Failed to send message:", err);
      setOptimisticMessages(prev =>
        prev.map(m => m.tempId === tempId ? { ...m, status: 'error' } : m)
      );
    }
  };

  const handleRetryMessage = async (msg: Message) => {
    setOptimisticMessages(prev =>
      prev.map(m => m.tempId === msg.tempId ? { ...m, status: 'sending' as const } : m)
    );
    try {
      await onSendMessage({
        text: msg.text,
        clientName: msg.clientName,
        clientEmail: msg.clientEmail,
        senderId: msg.senderId,
        receiverId: msg.receiverId,
        conversationId: msg.conversationId,
        isAdminInquiry: msg.isAdminInquiry,
        type: msg.type,
        fileUrl: msg.fileUrl,
        imageUrl: msg.imageUrl,
        audioUrl: msg.audioUrl,
        audioDuration: msg.audioDuration,
        fileName: msg.fileName,
        fileType: msg.fileType,
        tempId: msg.tempId
      });
      setOptimisticMessages(prev => prev.filter(m => m.tempId !== msg.tempId));
    } catch (err) {
      console.error("Failed retry of message send:", err);
      setOptimisticMessages(prev =>
        prev.map(m => m.tempId === msg.tempId ? { ...m, status: 'error' as const } : m)
      );
    }
  };

  const handleTypingStatus = async (isTyping: boolean) => {
    if (!myUid || !activeConversationId) return;
    try {
      await setDoc(doc(db, 'conversations', activeConversationId), {
        typing: {
          [myUid]: isTyping
        }
      }, { merge: true });
    } catch (err) {
      console.warn("Error updating typing status:", err);
    }
  };

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!text.trim()) return;
    
    if (!isIdentityVerified && !isAdminReplying && !isVendorReplying) {
      if (clientName && clientEmail) {
        setIsIdentityVerified(true);
      } else {
        return;
      }
    }

    const effectiveTargetUid = (!isAdminReplying && !isVendorReplying && isSupportChat) ? 'admin' : targetUid;
    const conversationId = (!isAdminReplying && !isVendorReplying && isSupportChat)
      ? (activeConversationId || [myUid, 'admin'].sort().join('_'))
      : (activeConversationId || [myUid, effectiveTargetUid].sort().join('_'));

    sendOptimisticMessage({
      text,
      clientName: (isAdminReplying || isVendorReplying) ? (currentContact?.name || clientName) : clientName,
      clientEmail: (isAdminReplying || isVendorReplying) ? (currentContact?.email || clientEmail) : clientEmail,
      senderId: myUid,
      receiverId: effectiveTargetUid,
      conversationId,
      isAdminInquiry: isSupportChat,
      type: 'text'
    });

    setText('');
    setShowEmojiPicker(false);
    setShowAttachMenu(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    
    // Auto-grow textarea up to 120px
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }

    handleTypingStatus(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      handleTypingStatus(false);
    }, 2000);
  };

  const handleAddEmoji = (emoji: string) => {
    setText(prev => prev + emoji);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement> | { target: { files: FileList | null } }) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setShowAttachMenu(false);
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    
    setUploadProgress(0);
    setIsUploading(true);

    try {
      const effectiveTargetUid = (!isAdminReplying && !isVendorReplying && isSupportChat) ? 'admin' : targetUid;
      const conversationId = (!isAdminReplying && !isVendorReplying && isSupportChat)
        ? (activeConversationId || [myUid, 'admin'].sort().join('_'))
        : (activeConversationId || [myUid, effectiveTargetUid].sort().join('_'));
      const storagePath = `chats/${conversationId}/${Date.now()}_${file.name}`;
      const url = await uploadFileWithProgress(file, storagePath, (progress) => {
        setUploadProgress(progress);
      });

      sendOptimisticMessage({
        text: isImage ? 'Sent an image' : isVideo ? 'Sent a video' : `Sent a file: ${file.name}`,
        clientName: (isAdminReplying || isVendorReplying) ? (currentContact?.name || clientName) : clientName,
        clientEmail: (isAdminReplying || isVendorReplying) ? (currentContact?.email || clientEmail) : clientEmail,
        senderId: myUid,
        receiverId: effectiveTargetUid,
        conversationId,
        isAdminInquiry: isSupportChat,
        type: isImage ? 'image' : 'file',
        fileUrl: url,
        imageUrl: isImage ? url : undefined,
        fileName: file.name,
        fileType: file.type
      });
    } catch (err: any) {
      console.error("Upload failed:", err);
      showNotification("Upload failed: " + err.message, "info");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  // Real WhatsApp Voice Recording
  const startRecording = async () => {
    setMicPermissionError(null);
    setShowAttachMenu(false);
    setShowEmojiPicker(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      const msg = "Your browser does not support audio recording or permissions are restricted in this window.";
      setMicPermissionError(msg);
      showNotification(msg, "info");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Setup Web Audio Analyser for live visualizer
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateVisualizer = () => {
            if (!analyserRef.current) return;
            analyserRef.current.getByteFrequencyData(dataArray);
            
            // Sample 16 bins
            const newBars: number[] = [];
            for (let i = 0; i < 16; i++) {
              const val = dataArray[i * 2] || 0;
              const height = Math.max(4, Math.round((val / 255) * 24));
              newBars.push(height);
            }
            setLiveVolumeBars(newBars);
            animFrameRef.current = requestAnimationFrame(updateVisualizer);
          };
          updateVisualizer();
        }
      } catch (audioCtxErr) {
        console.warn("AudioContext visualizer warning:", audioCtxErr);
      }

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/wav'];
        const mimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported
          ? (mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm')
          : 'audio/webm';
        
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const finalDuration = recordingDuration;
        
        setIsUploading(true);
        setUploadProgress(0);
        try {
          const fileExt = mimeType.split('/')[1]?.split(';')[0] || 'webm';
          const storagePath = `chats/voice_${Date.now()}.${fileExt}`;
          const url = await uploadFileWithProgress(audioBlob, storagePath, (progress) => {
            setUploadProgress(progress);
          }, { contentType: mimeType });
          const effectiveTargetUid = (!isAdminReplying && !isVendorReplying && isSupportChat) ? 'admin' : targetUid;
          const conversationId = (!isAdminReplying && !isVendorReplying && isSupportChat)
            ? (activeConversationId || [myUid, 'admin'].sort().join('_'))
            : (activeConversationId || [myUid, effectiveTargetUid].sort().join('_'));

          sendOptimisticMessage({
            text: 'Voice note',
            clientName: (isAdminReplying || isVendorReplying) ? (currentContact?.name || clientName) : clientName,
            clientEmail: (isAdminReplying || isVendorReplying) ? (currentContact?.email || clientEmail) : clientEmail,
            senderId: myUid,
            receiverId: effectiveTargetUid,
            conversationId,
            isAdminInquiry: isSupportChat,
            type: 'voice',
            fileUrl: url,
            audioUrl: url,
            audioDuration: finalDuration
          });
        } catch (err: any) {
          console.error("Voice upload failed:", err);
          showNotification("Failed to upload voice message: " + err.message, "info");
        } finally {
          setIsUploading(false);
          setUploadProgress(null);
        }
        
        stream.getTracks().forEach(track => track.stop());
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
          audioContextRef.current = null;
        }
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Microphone access error:", err);
      const originalDetail = err?.message || err?.name || String(err) || "Permission denied";
      let errorMessage = `Microphone access was blocked by browser (${originalDetail}). Please allow microphone access or type your message.`;
      setMicPermissionError(errorMessage);
      showNotification(errorMessage, "info");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.onstop = null;
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        if (mediaRecorderRef.current.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach(track => {
            try { track.stop(); } catch (e) {}
          });
        }
      } catch (e) {
        console.error("Error stopping recorder in cancelRecording:", e);
      }
    }
    mediaRecorderRef.current = null;
    setIsRecording(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  };

  const handleUnsend = async (msg: Message) => {
    if (!msg.id || msg.isOptimistic) return;
    try {
      const convoId = msg.conversationId || activeConversationId || [myUid, targetUid].sort().join('_');
      const remaining = chatMessages.filter(m => m.id !== msg.id && !m.isOptimistic);
      const prevLast = remaining[remaining.length - 1];
      const fallbackText = prevLast
        ? (typeof prevLast.text === 'string' && prevLast.text ? prevLast.text : 'Attachment')
        : 'No messages yet';

      setActiveMessages(prev => prev.filter(m => m.id !== msg.id));
      setHistoricalMessages(prev => prev.filter(m => m.id !== msg.id));

      await deleteMessage(convoId, msg.id, fallbackText);
      showNotification("Message deleted", "success");
    } catch (err) {
      console.error("Failed to delete message:", err);
      showNotification("Failed to delete message", "info");
    }
  };

  const handleCopyText = (msgText: string) => {
    if (!msgText) return;
    navigator.clipboard.writeText(msgText).then(() => {
      showNotification("Message copied to clipboard", "success");
    }).catch(() => {});
  };

  const checkIfSent = (msg: Message) => {
    if (!msg) return false;
    const role = (msg as any).sender_role;

    // 1. Admin Portal View: Admin's own replies on RIGHT (true), Client messages on LEFT (false)
    if (isAdminReplying) {
      return msg.senderId === 'admin' || role === 'admin';
    }

    // 2. Vendor Portal View: Vendor's own replies on RIGHT (true), Client messages on LEFT (false)
    if (isVendorReplying) {
      if (role === 'client') return false;
      if (role === 'vendor') return true;
      if (targetUid && msg.senderId === targetUid && msg.senderId !== myUid) return false;
      return msg.senderId === myUid;
    }

    // 3. Client chatting with Admin Support ("? Ask" button): Client on RIGHT (true), Admin on LEFT (false)
    if (isSupportChat) {
      if (msg.senderId === 'admin' || role === 'admin') return false;
      return true;
    }

    // 4. Client chatting with a Vendor: Client on RIGHT (true), Vendor on LEFT (false)
    if (role === 'vendor' || role === 'admin') return false;
    if (targetUid && msg.senderId === targetUid && role !== 'client') return false;
    const loggedInUid = user?.id || auth.currentUser?.uid;
    if (loggedInUid && msg.senderId === loggedInUid) {
      return true;
    }
    if (msg.senderId === 'client' || role === 'client') {
      return true;
    }
    return false;
  };

  const formatMsgTime = (timestampString: string) => {
    if (!timestampString) return '';
    const d = new Date(timestampString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatConversationTime = (timestampAny: any) => {
    if (!timestampAny) return '';
    let d: Date;
    if (timestampAny?.toDate) {
      d = timestampAny.toDate();
    } else {
      d = new Date(timestampAny);
    }
    if (isNaN(d.getTime())) return '';
    
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 7) {
      return d.toLocaleDateString([], { weekday: 'short' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatDuration = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  // WhatsApp date separator grouping helper
  const getMessageDateGroup = (timestampStr: string): string => {
    if (!timestampStr) return 'TODAY';
    const date = new Date(timestampStr);
    if (isNaN(date.getTime())) return 'TODAY';
    const now = new Date();
    
    if (date.toDateString() === now.toDateString()) return 'TODAY';
    
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'YESTERDAY';
    
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'long' }).toUpperCase();
    }
    
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  };

  // Build unified conversation list for the left WhatsApp pane (strictly one contact entry per person, sorted newest first)
  const conversationList = useMemo(() => {
    type ConvoItem = {
      id: string;
      contactId: string;
      name: string;
      email?: string;
      category?: string;
      image?: string;
      isAdmin?: boolean;
      lastMessage: string;
      lastMessageType?: string;
      lastMessageTime: any;
      lastMessageIsSent?: boolean;
      lastMessageIsRead?: boolean;
      unreadCount: number;
      conversationId?: string;
    };

    const getTimeMs = (val: any): number => {
      if (!val) return 0;
      if (typeof val?.toDate === 'function') return val.toDate().getTime();
      if (typeof val?.toMillis === 'function') return val.toMillis();
      const t = new Date(val).getTime();
      return isNaN(t) ? 0 : t;
    };

    const list: ConvoItem[] = [];

    // 0. If customConversations provided (e.g. VendorPortal or AdminPanel), deduplicate by contactId / email / conversationId
    if (customConversations && customConversations.length > 0) {
      customConversations.forEach(cc => {
        const resolvedContactId = cc.contactId || cc.id;
        const emailLower = (cc.email && cc.email.includes('@') ? cc.email : '').trim().toLowerCase();
        const rawLast = cc.lastMessage as any;
        const safeLastMessage =
          typeof rawLast === 'string'
            ? rawLast
            : rawLast && typeof rawLast === 'object'
            ? (typeof rawLast.text === 'string' ? rawLast.text : '')
            : '';
        const safeLastType =
          cc.lastMessageType ||
          (rawLast && typeof rawLast === 'object' ? rawLast.type : undefined);
        const safeLastTime =
          cc.lastMessageTime ||
          (rawLast && typeof rawLast === 'object' ? (rawLast.timestamp || rawLast.sent_at) : undefined);

        const existing = list.find(item => {
          if (resolvedContactId && resolvedContactId !== 'client_legacy' && item.contactId === resolvedContactId) return true;
          if (emailLower && item.email && item.email.toLowerCase() === emailLower) return true;
          if (cc.conversationId && item.conversationId === cc.conversationId) return true;
          return false;
        });

        if (!existing) {
          list.push({
            ...cc,
            contactId: resolvedContactId,
            lastMessage: safeLastMessage,
            lastMessageType: safeLastType,
            lastMessageTime: safeLastTime,
            lastMessageIsSent: cc.lastMessageIsSent,
            lastMessageIsRead: cc.lastMessageIsRead,
          });
        } else {
          existing.unreadCount = (existing.unreadCount || 0) + (cc.unreadCount || 0);
          if (getTimeMs(safeLastTime) > getTimeMs(existing.lastMessageTime)) {
            existing.lastMessage = safeLastMessage;
            existing.lastMessageType = safeLastType;
            existing.lastMessageTime = safeLastTime;
            existing.lastMessageIsSent = cc.lastMessageIsSent;
            existing.lastMessageIsRead = cc.lastMessageIsRead;
          }
          if (!existing.image && cc.image) existing.image = cc.image;
          if (!existing.email && cc.email) existing.email = cc.email;
        }
      });
    } else {
      const byContactId = new Map<string, ConvoItem>();

      const upsertContact = (item: ConvoItem) => {
        const key = item.isAdmin ? 'admin' : item.contactId;
        if (!key) return;
        const existing = byContactId.get(key);
        if (!existing) {
          byContactId.set(key, { ...item });
        } else {
          if (getTimeMs(item.lastMessageTime) >= getTimeMs(existing.lastMessageTime) && item.lastMessage) {
            existing.lastMessage = item.lastMessage;
            existing.lastMessageType = item.lastMessageType || existing.lastMessageType;
            existing.lastMessageTime = item.lastMessageTime || existing.lastMessageTime;
            if (item.lastMessageIsSent !== undefined) existing.lastMessageIsSent = item.lastMessageIsSent;
            if (item.lastMessageIsRead !== undefined) existing.lastMessageIsRead = item.lastMessageIsRead;
            if (item.conversationId) existing.conversationId = item.conversationId;
          }
          if (item.unreadCount > existing.unreadCount) {
            existing.unreadCount = item.unreadCount;
          }
          if (!existing.image && item.image) existing.image = item.image;
          if (!existing.email && item.email) existing.email = item.email;
          if (existing.name === 'Vendor Contact' && item.name && item.name !== 'Vendor Contact') {
            existing.name = item.name;
          }
        }
      };

      const myLowerEmail = (user?.username || clientEmail || auth.currentUser?.email || '').toLowerCase().trim();

      // 1. Always include this client's Admin Support thread (Simcha Concierge) in Client mode
      const adminConvo = inboxThreads.find(
        c =>
          (c.type === 'admin_support' || (c.participant_ids || []).includes('admin')) &&
          ((c.participant_ids || []).includes(myUid) ||
            c.client_id === myUid ||
            (myLowerEmail && (c.client_email || '').toLowerCase() === myLowerEmail))
      );
      if (adminConvo || (initialIsAdminMode && !initialVendor)) {
        const rawAdminLast = adminConvo?.last_message;
        const safeAdminLast = typeof rawAdminLast === 'string'
          ? rawAdminLast
          : (rawAdminLast && typeof rawAdminLast === 'object' && typeof rawAdminLast.text === 'string' ? rawAdminLast.text : '');
        upsertContact({
          id: adminConvo?.id || conversationIdOverride || [myUid, 'admin'].sort().join('_'),
          contactId: 'admin',
          name: 'Simcha Concierge',
          category: 'Support & Concierge',
          isAdmin: true,
          lastMessage: safeAdminLast || 'Inquire with our expert event specialists',
          lastMessageTime: adminConvo?.last_message_at || 0,
          lastMessageIsSent: adminConvo?.last_message_sender_id ? adminConvo.last_message_sender_id === myUid : false,
          lastMessageIsRead: Boolean(adminConvo?.last_message_read),
          unreadCount: adminConvo?.unread_count || 0,
          conversationId: adminConvo?.id || conversationIdOverride || [myUid, 'admin'].sort().join('_')
        });
      }

      if (propMessages && propMessages.length > 0) {
        propMessages.forEach(m => {
          if (!m) return;
          if (m.isAdminInquiry || m.senderId === 'admin' || m.receiverId === 'admin' || (m.conversationId && m.conversationId.includes('admin'))) {
            const isMyInquiry =
              m.senderId === myUid ||
              m.receiverId === myUid ||
              (m as any).client_id === myUid ||
              (myLowerEmail && m.clientEmail?.toLowerCase() === myLowerEmail) ||
              (myLowerEmail && (m as any).client_email?.toLowerCase() === myLowerEmail);
            if (!isMyInquiry) return;
            const mIsSent = checkIfSent(m);
            const mReadBy = (m as any).read_by || {};
            const mIsRead = Boolean(m.isRead || Object.keys(mReadBy).some(k => k !== m.senderId && k !== myUid));
            const rawText = typeof m.text === 'string' ? m.text : '';
            const resolvedAdminCid = m.conversationId || adminConvo?.id || [myUid, 'admin'].sort().join('_');
            upsertContact({
              id: resolvedAdminCid,
              contactId: 'admin',
              name: 'Simcha Concierge',
              category: 'Support & Concierge',
              isAdmin: true,
              lastMessage: rawText,
              lastMessageType: m.type,
              lastMessageTime: m.timestamp,
              lastMessageIsSent: mIsSent,
              lastMessageIsRead: mIsRead,
              unreadCount: m.receiverId === myUid && !m.isRead ? 1 : 0,
              conversationId: resolvedAdminCid
            });
          }
        });
      }

      // Compute vendor IDs owned by the logged-in user so incoming messages to their own vendor business
      // never leak into their Client conversation list (never treat non-vendor accounts like bookingsimcha@gmail.com as owning a vendor)
      const isNonVendorAccount = ['bookingsimcha@gmail.com', 'adminbookingsimcha@gmail.com', 'ststrohli@gmail.com'].includes(myLowerEmail);
      const myOwnedVendorIds = new Set<string>(
        isNonVendorAccount
          ? []
          : vendors
              .filter(
                v =>
                  v.id === myUid ||
                  (myLowerEmail && v.contactEmail?.toLowerCase().trim() === myLowerEmail) ||
                  (myLowerEmail && v.username?.toLowerCase().trim() === myLowerEmail)
              )
              .map(v => v.id)
      );

      // 2. Populate threads from inboxThreads (with vendors)
      inboxThreads.forEach(t => {
        const pIds: string[] = t.participant_ids || [];
        if (t.type === 'admin_support' || pIds.includes('admin')) return;
        if (Array.from(myOwnedVendorIds).some(vid => vid !== myUid && pIds.includes(vid))) return;
        const otherId = t.vendor_id || pIds.find((p: string) => p !== myUid) || '';
        if (!otherId || otherId === 'admin' || myOwnedVendorIds.has(otherId)) return;

        const vendorMatch = vendors.find(v => v.id === otherId);
        const vendorName = vendorMatch?.name || t.vendor_name || 'Vendor';
        const rawThreadLast = t.last_message;
        const safeThreadLast = typeof rawThreadLast === 'string'
          ? rawThreadLast
          : (rawThreadLast && typeof rawThreadLast === 'object' && typeof rawThreadLast.text === 'string' ? rawThreadLast.text : '');
        upsertContact({
          id: t.id,
          contactId: vendorMatch?.id || otherId,
          name: vendorName,
          email: vendorMatch?.contactEmail,
          category: vendorMatch?.category || 'Vendor',
          image: vendorMatch?.image,
          isAdmin: false,
          lastMessage: safeThreadLast || '',
          lastMessageTime: t.last_message_at,
          lastMessageIsSent: t.last_message_sender_id ? t.last_message_sender_id === myUid : undefined,
          lastMessageIsRead: t.last_message_read !== undefined ? Boolean(t.last_message_read) : undefined,
          unreadCount: t.unread_count || 0,
          conversationId: t.id
        });
      });

      // 3. Also enrich from propMessages so all vendor chats (including vendor-sent replies) appear in one unified contact list
      if (propMessages && propMessages.length > 0) {
        propMessages.forEach(m => {
          if (!m) return;
          if (m.isAdminInquiry || m.senderId === 'admin' || m.receiverId === 'admin' || (m.conversationId && m.conversationId.includes('admin'))) {
            return;
          }
          const isMyMessage =
            m.senderId === myUid ||
            m.receiverId === myUid ||
            (m as any).client_id === myUid ||
            (myLowerEmail && m.clientEmail?.toLowerCase() === myLowerEmail) ||
            (myLowerEmail && (m as any).client_email?.toLowerCase() === myLowerEmail);
          if (!isMyMessage) return;

          const mIsSent = checkIfSent(m);
          const mReadBy = (m as any).read_by || {};
          const mIsRead = Boolean(m.isRead || Object.keys(mReadBy).some(k => k !== m.senderId && k !== myUid));
          const explicitVendorId = (m as any).vendorId || (m as any).vendor_id;
          const otherId = explicitVendorId || (m.senderId === myUid ? m.receiverId : m.senderId);
          if (myOwnedVendorIds.has(otherId) || myOwnedVendorIds.has(m.senderId) || myOwnedVendorIds.has(m.receiverId)) {
            return;
          }
          const vendorMatch = vendors.find(
            v =>
              v.id === explicitVendorId ||
              v.id === otherId ||
              v.id === m.senderId ||
              v.id === m.receiverId ||
              (m.vendorEmail && v.contactEmail?.toLowerCase() === m.vendorEmail.toLowerCase())
          );
          if (vendorMatch && !myOwnedVendorIds.has(vendorMatch.id)) {
            const rawText = typeof m.text === 'string' ? m.text : '';
            const resolvedVendorCid = m.conversationId || [myUid, vendorMatch.id].sort().join('_');
            upsertContact({
              id: resolvedVendorCid,
              contactId: vendorMatch.id,
              name: vendorMatch.name,
              email: vendorMatch.contactEmail,
              category: vendorMatch.category,
              image: vendorMatch.image,
              isAdmin: false,
              lastMessage: rawText,
              lastMessageType: m.type,
              lastMessageTime: m.timestamp,
              lastMessageIsSent: mIsSent,
              lastMessageIsRead: mIsRead,
              unreadCount: 0,
              conversationId: resolvedVendorCid
            });
          }
        });
      }

      // 4. Ensure currently active contact is included and reflects live chatMessages
      if (currentContact && currentContact.id !== 'admin') {
        const latestMsg = chatMessages[chatMessages.length - 1];
        const safeLatestText = typeof latestMsg?.text === 'string'
          ? latestMsg.text
          : (latestMsg?.text && typeof latestMsg.text === 'object' && typeof (latestMsg.text as any).text === 'string' ? (latestMsg.text as any).text : '');
        const latestIsSent = latestMsg ? checkIfSent(latestMsg) : false;
        const latestReadBy = (latestMsg as any)?.read_by || {};
        const latestIsRead = Boolean(
          latestMsg?.isRead ||
          Object.keys(latestReadBy).some(k => k !== latestMsg?.senderId && k !== myUid) ||
          (otherLastReadAt && latestMsg?.timestamp && new Date(latestMsg.timestamp).getTime() <= new Date(otherLastReadAt).getTime() + 2000)
        );
        upsertContact({
          id: currentContact.conversationId || [myUid, currentContact.id].sort().join('_'),
          contactId: currentContact.id,
          name: currentContact.name,
          email: currentContact.email,
          category: currentContact.category,
          image: currentContact.image,
          isAdmin: false,
          lastMessage: safeLatestText || 'Start conversation',
          lastMessageType: latestMsg?.type,
          lastMessageTime: latestMsg?.timestamp || Date.now(),
          lastMessageIsSent: latestIsSent,
          lastMessageIsRead: latestIsRead,
          unreadCount: 0,
          conversationId: currentContact.conversationId || [myUid, currentContact.id].sort().join('_')
        });
      }

      list.push(...Array.from(byContactId.values()));
    }

    // Sort all conversations by latest message timestamp descending so newest is always on top
    list.sort((a, b) => getTimeMs(b.lastMessageTime) - getTimeMs(a.lastMessageTime));

    // Filter by search query if any
    let filtered = list;
    if (inboxSearchQuery.trim()) {
      const q = inboxSearchQuery.toLowerCase();
      filtered = filtered.filter(item => 
        (item.name || '').toLowerCase().includes(q) || 
        (item.category || '').toLowerCase().includes(q) ||
        (typeof item.lastMessage === 'string' ? item.lastMessage : '').toLowerCase().includes(q)
      );
    }

    if (inboxFilter === 'unread') {
      filtered = filtered.filter(item => item.unreadCount > 0);
    }

    return filtered;
  }, [customConversations, inboxThreads, propMessages, myUid, currentContact, chatMessages, vendors, inboxSearchQuery, inboxFilter, otherLastReadAt]);

  const handleSelectConversation = (item: typeof conversationList[0]) => {
    const resolvedConvoId = item.conversationId || item.id || (myUid && item.contactId ? [myUid, item.contactId].sort().join('_') : '');
    setCurrentContact({
      id: item.contactId,
      name: item.name,
      email: item.email,
      image: item.image,
      category: item.category,
      isAdmin: item.isAdmin,
      conversationId: resolvedConvoId
    });
    if (resolvedConvoId && myUid) {
      markChatAsRead(resolvedConvoId, myUid).catch(() => {});
    }
    setMobileView('chat');
    setIsChatSearching(false);
    setChatSearchQuery('');
  };

  const getContactInitials = (name?: string) => {
    if (!name || !name.trim()) return 'S';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  if (!isOpen) return null;

  return (
    <div 
      role="dialog" 
      aria-modal="true" 
      aria-label="WhatsApp Style Messaging" 
      className="fixed inset-0 z-[200] flex items-center justify-center p-0 md:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      {/* Main WhatsApp Window Container */}
      <div className="fixed inset-0 z-[200] w-full h-[100dvh] bg-[#0b0b0b] rounded-none md:relative md:max-w-4xl lg:max-w-5xl md:h-[88vh] md:max-h-[820px] md:rounded-2xl md:border md:border-[#D4AF37]/30 md:shadow-[0_20px_60px_rgba(0,0,0,0.95)] flex overflow-hidden font-sans select-none">
        
        {/* ================= LEFT COLUMN: CONVERSATION LIST (PILL STYLE) ================= */}
        <div 
          className={`w-full md:w-[340px] lg:w-[370px] shrink-0 border-r border-[#D4AF37]/15 bg-[#0b0b0b] flex flex-col h-full transition-all duration-300 ${
            mobileView === 'chat' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Conversation List Top Header */}
          <div className="bg-[#141416] px-4 py-3 border-b border-[#D4AF37]/15 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#201c0c] border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] font-bold text-xs shadow-inner overflow-hidden">
                {user?.photoURL ? (
                  <img src={user.photoURL} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span>{user?.name?.[0] || 'U'}</span>
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-zinc-100 font-[Cinzel] tracking-wide truncate">Simcha Chats</h2>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {!isVendorReplying && !isAdminReplying && (
                <button 
                  type="button"
                  onClick={() => {
                    ensureAdminSupportConversation(myUid, 'admin').catch(console.error);
                    setCurrentContact({
                      id: 'admin',
                      name: 'Simcha Concierge',
                      category: 'Support & Concierge',
                      isAdmin: true
                    });
                    setMobileView('chat');
                  }}
                  className="p-1.5 rounded-full text-zinc-400 hover:text-[#D4AF37] hover:bg-white/5 transition-colors"
                  title="Ask Concierge Support"
                  aria-label="Ask Concierge Support"
                >
                  <Shield className="w-4 h-4 text-[#D4AF37]" />
                </button>
              )}
              <button 
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
                title="Close"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search Bar in Conversation List */}
          <div className="p-3 bg-[#0b0b0b]">
            <div className="bg-[#161619] rounded-full px-3.5 py-2 flex items-center gap-2 border border-[#D4AF37]/25 focus-within:border-[#D4AF37]/70 transition-colors">
              <Search className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
              <input 
                type="text"
                value={inboxSearchQuery}
                onChange={e => setInboxSearchQuery(e.target.value)}
                placeholder="Search chats..."
                className="bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 outline-none w-full"
              />
              {inboxSearchQuery && (
                <button type="button" onClick={() => setInboxSearchQuery('')} className="text-zinc-500 hover:text-zinc-200">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Pill-Shaped Conversation List Scroll Area */}
          <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2.5">
            {conversationList.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs">
                No conversations found.
              </div>
            ) : (
              conversationList.map((item) => {
                const isSelected = (currentContact?.conversationId && item.conversationId)
                  ? currentContact.conversationId === item.conversationId
                  : currentContact?.id === item.contactId;
                const initials = getContactInitials(item.name);
                const isVoice = item.lastMessageType === 'voice' || item.lastMessage === 'Voice note';
                const isImage = item.lastMessageType === 'image' || item.lastMessage === 'Sent an image';
                const isVideo = item.lastMessage === 'Sent a video';

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectConversation(item)}
                    className={`simcha-event-card relative w-full overflow-hidden rounded-full border transition-all duration-300 cursor-pointer group flex items-center justify-between gap-2.5 px-4 py-3 min-h-[62px] shadow-lg active:scale-[0.99] text-left ${
                      isSelected 
                        ? 'border-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.25)]' 
                        : 'border-[#D4AF37]/35 hover:border-[#D4AF37]/80'
                    }`}
                  >
                    {/* Full Pill Background: Contact Photo OR Initials Pattern */}
                    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                      {item.image ? (
                        <>
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                          />
                          <div className="absolute inset-0 simcha-event-card-overlay" />
                        </>
                      ) : (
                        <div className="w-full h-full bg-gradient-to-r from-[#0c0c0c] via-[#151208] to-[#0c0c0c] flex items-center justify-center relative">
                          <span className="font-[Cinzel] font-black text-4xl tracking-[0.25em] text-[#D4AF37]/15 select-none">
                            {initials}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Left Side: Circular Avatar + Name + Latest Message */}
                    <div className="relative z-10 flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-[#1b170a] border border-[#D4AF37]/50 flex items-center justify-center shrink-0 text-[#D4AF37] font-[Cinzel] font-bold text-xs shadow-md">
                        {item.isAdmin ? (
                          <Shield className="w-4 h-4 text-[#D4AF37]" />
                        ) : item.image ? (
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        ) : (
                          <span>{initials}</span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm font-bold font-[Cinzel] text-white group-hover:text-[#D4AF37] transition-colors truncate drop-shadow-sm">
                            {item.name}
                          </span>
                          {item.unreadCount > 0 && (
                            <span className="bg-[#D4AF37] text-black text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 shadow-sm">
                              {item.unreadCount}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-zinc-200 truncate mt-0.5 drop-shadow-sm">
                          {item.lastMessageIsSent && (
                            item.lastMessageIsRead ? (
                              <span title="Seen" className="inline-flex items-center shrink-0">
                                <CheckCheck className="w-3.5 h-3.5 text-[#34B7F1] shrink-0" />
                              </span>
                            ) : (
                              <span title="Sent" className="inline-flex items-center shrink-0">
                                <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              </span>
                            )
                          )}
                          {isVoice ? (
                            <>
                              <Mic className="w-3 h-3 text-[#D4AF37] shrink-0" />
                              <span className="truncate">Voice note</span>
                            </>
                          ) : isImage ? (
                            <>
                              <ImageIcon className="w-3 h-3 text-[#D4AF37] shrink-0" />
                              <span className="truncate">Photo</span>
                            </>
                          ) : isVideo ? (
                            <>
                              <Play className="w-3 h-3 text-[#D4AF37] shrink-0" />
                              <span className="truncate">Video</span>
                            </>
                          ) : (
                            <span className="truncate">{item.lastMessage || 'Tap to chat'}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Side: Time */}
                    <div className="relative z-10 flex flex-col items-end justify-center shrink-0">
                      <span className="text-[9.5px] text-zinc-300 font-medium drop-shadow-sm">
                        {formatConversationTime(item.lastMessageTime)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ================= RIGHT COLUMN: CHAT CANVAS ================= */}
        <div 
          className={`flex-1 flex flex-col bg-[#0b0b0b] relative min-w-0 h-full ${
            mobileView === 'list' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* WhatsApp Chat Header */}
          <header className="bg-[#141416] px-3.5 py-2.5 border-b border-[#D4AF37]/20 flex items-center justify-between shrink-0 z-20 shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Back Button (Mobile) */}
              <button 
                type="button"
                onClick={() => {
                  if (isVendorReplying || isAdminReplying || initialVendor || initialIsAdminMode) {
                    onClose();
                  } else {
                    setMobileView('list');
                  }
                }} 
                className="md:hidden flex items-center justify-center text-zinc-300 hover:text-[#D4AF37] p-1.5 -ml-1 rounded-full hover:bg-white/5 active:scale-95"
                title="Back"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
              </button>

              {/* Avatar with Status Ring */}
              <div className="relative shrink-0">
                {currentContact?.isAdmin ? (
                  <div className="w-10 h-10 rounded-full bg-[#1e1b0d] border border-[#D4AF37]/50 flex items-center justify-center shadow-inner">
                    <Shield className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                ) : currentContact?.image ? (
                  <img 
                    src={currentContact.image} 
                    className="w-10 h-10 rounded-full object-cover border border-[#D4AF37]/40 shadow-sm" 
                    alt="" 
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[#1e1b0d] border border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37] font-bold text-sm">
                    {currentContact?.name?.[0] || 'S'}
                  </div>
                )}
                {/* Green online dot */}
                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#141416]" />
              </div>

              {/* Contact Name & Subtitle */}
              <div className="min-w-0">
                <h2 className="font-semibold text-zinc-100 text-[14.5px] leading-tight truncate">
                  {currentContact?.name || 'Simcha Contact'}
                </h2>
                <p className="text-[11px] text-zinc-400 font-normal leading-tight truncate mt-0.5">
                  {otherIsTyping ? (
                    <span className="text-[#D4AF37] font-medium animate-pulse">typing...</span>
                  ) : (
                    currentContact?.isAdmin ? 'Concierge Support • Online' : `${currentContact?.category || 'Vendor'} • Online`
                  )}
                </p>
              </div>
            </div>

            {/* Header Action Controls */}
            <div className="flex items-center gap-1 shrink-0 text-zinc-400">
              {/* Search in chat button */}
              <button 
                type="button"
                onClick={() => setIsChatSearching(prev => !prev)} 
                className={`p-2 rounded-full transition-colors ${isChatSearching ? 'text-[#D4AF37] bg-white/10' : 'hover:text-white hover:bg-white/5'}`}
                title="Search in conversation"
                aria-label="Search in conversation"
              >
                <Search className="w-4 h-4" />
              </button>

              {/* More options menu */}
              <div className="relative">
                <button 
                  type="button"
                  onClick={() => setShowMoreMenu(prev => !prev)}
                  className="p-2 rounded-full hover:text-white hover:bg-white/5 transition-colors"
                  title="More options"
                  aria-label="More options"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                <AnimatePresence>
                  {showMoreMenu && (
                    <motion.div 
                      initial={{ scale: 0.95, opacity: 0, y: -5 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ scale: 0.95, opacity: 0, y: -5 }}
                      className="absolute right-0 top-10 w-44 bg-[#18181c] border border-[#D4AF37]/30 rounded-xl shadow-2xl py-1.5 z-30 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setIsChatSearching(true);
                          setShowMoreMenu(false);
                        }}
                        className="w-full px-3.5 py-2 text-left hover:bg-white/5 text-zinc-200 flex items-center gap-2"
                      >
                        <Search className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Search in chat</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          scrollToBottomSmart(true);
                          setShowMoreMenu(false);
                        }}
                        className="w-full px-3.5 py-2 text-left hover:bg-white/5 text-zinc-200 flex items-center gap-2"
                      >
                        <ArrowLeft className="w-3.5 h-3.5 rotate-[-90deg] text-[#D4AF37]" />
                        <span>Jump to bottom</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowMoreMenu(false);
                          onClose();
                        }}
                        className="w-full px-3.5 py-2 text-left hover:bg-white/5 text-zinc-400 border-t border-white/5 mt-1"
                      >
                        Close conversation
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Close Button */}
              <button 
                type="button"
                onClick={onClose} 
                className="text-zinc-400 hover:text-white hover:bg-white/5 p-2 rounded-full transition-colors"
                title="Close modal"
                aria-label="Close modal"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          </header>

          {/* In-Chat Search Bar Drawer */}
          <AnimatePresence>
            {isChatSearching && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-[#161619] border-b border-[#D4AF37]/20 px-3.5 py-2 flex items-center justify-between gap-2 z-20"
              >
                <div className="flex-1 flex items-center gap-2 bg-[#1c1c20] rounded-lg px-2.5 py-1 border border-white/10">
                  <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <input 
                    type="text"
                    value={chatSearchQuery}
                    onChange={e => setChatSearchQuery(e.target.value)}
                    placeholder="Search in chat..."
                    className="bg-transparent text-xs text-zinc-100 placeholder:text-zinc-500 outline-none w-full"
                    autoFocus
                  />
                  {chatSearchQuery && (
                    <span className="text-[10px] text-zinc-400 font-mono shrink-0">
                      {chatSearchMatches.length > 0 ? `${activeMatchIndex + 1} of ${chatSearchMatches.length}` : '0 results'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  <button 
                    type="button"
                    onClick={handlePrevMatch}
                    disabled={chatSearchMatches.length === 0}
                    className="p-1 text-zinc-400 hover:text-white disabled:opacity-30"
                    title="Previous match"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button 
                    type="button"
                    onClick={handleNextMatch}
                    disabled={chatSearchMatches.length === 0}
                    className="p-1 text-zinc-400 hover:text-white disabled:opacity-30"
                    title="Next match"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      setIsChatSearching(false);
                      setChatSearchQuery('');
                    }}
                    className="p-1 text-zinc-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Identity Verification Step for Guests */}
          {!isIdentityVerified ? (
            <div className="p-6 space-y-4 my-auto max-w-sm mx-auto text-center">
              <div className="w-14 h-14 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center mx-auto mb-2">
                <User className="w-7 h-7 text-[#D4AF37]" />
              </div>
              <h3 className="text-lg font-bold text-white font-[Cinzel]">Join Conversation</h3>
              <p className="text-xs text-zinc-400">Enter your name and email to chat directly on Simcha Booking.</p>
              
              <div className="space-y-3 pt-2 text-left">
                <input 
                  type="text" 
                  placeholder="Your Full Name" 
                  className="w-full bg-[#161618] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#D4AF37]" 
                  value={clientName} 
                  onChange={e => setClientName(e.target.value)} 
                />
                <input 
                  type="email" 
                  placeholder="Your Email Address" 
                  className="w-full bg-[#161618] border border-[#D4AF37]/30 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#D4AF37]" 
                  value={clientEmail} 
                  onChange={e => setClientEmail(e.target.value)} 
                />
                <button 
                  type="button"
                  onClick={() => clientName && clientEmail && setIsIdentityVerified(true)}
                  className="w-full bg-[#D4AF37] text-black font-bold h-11 rounded-full hover:bg-[#E5C76B] transition-all text-xs uppercase tracking-widest cursor-pointer shadow-md"
                >
                  Start Chat
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* WhatsApp Chat Canvas with authentic gold doodle wallpaper texture */}
              <div 
                ref={scrollRef} 
                onScroll={handleScroll} 
                className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-2 relative bg-[#0b0b0b]"
                style={{
                  backgroundImage: `radial-gradient(circle at 50% 50%, rgba(212,175,55,0.035) 0%, transparent 70%)`
                }}
              >
                {/* Pagination / History Loader */}
                {hasMore && (
                  <div className="flex justify-center py-1.5">
                    {isLoadingMore ? (
                      <div className="flex items-center gap-2 text-xs text-[#D4AF37] bg-zinc-900/80 px-3 py-1 rounded-full border border-white/5 font-mono">
                        <Loader2 className="w-3 h-3 animate-spin" /> Loading past messages...
                      </div>
                    ) : (
                      <button 
                        type="button"
                        onClick={loadMoreMessages} 
                        className="text-[11px] text-zinc-400 hover:text-[#D4AF37] transition-colors bg-zinc-900/60 px-3 py-1 rounded-full border border-white/5"
                      >
                        Scroll up to load older messages
                      </button>
                    )}
                  </div>
                )}

                {chatMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-16 text-center opacity-40 space-y-2">
                    <div className="w-14 h-14 rounded-full bg-[#D4AF37]/10 flex items-center justify-center border border-[#D4AF37]/20">
                      <CheckCheck className="w-7 h-7 text-[#D4AF37]" />
                    </div>
                    <p className="text-xs text-zinc-300 font-medium font-[Cinzel] tracking-wider">
                      End-to-End Encrypted Simcha Messaging
                    </p>
                    <p className="text-[11px] text-zinc-500 max-w-xs">
                      {isSupportChat ? "Ask our team anything about dates, custom packages, and bookings." : "Inquire directly about availability, quotes, and special requests."}
                    </p>
                  </div>
                ) : (() => {
                  let latestSentMsgId: string | undefined;
                  for (let i = chatMessages.length - 1; i >= 0; i--) {
                    if (checkIfSent(chatMessages[i])) {
                      latestSentMsgId = chatMessages[i].id || chatMessages[i].tempId;
                      break;
                    }
                  }

                  return chatMessages.map((msg, index) => {
                    const isSent = checkIfSent(msg);
                    const currentDateGroup = getMessageDateGroup(msg.timestamp);
                    const prevDateGroup = index > 0 ? getMessageDateGroup(chatMessages[index - 1].timestamp) : null;
                    const showDateBadge = currentDateGroup !== prevDateGroup;

                    const readByMap = (msg as any).read_by || {};
                    const hasOtherReaderKey = Object.keys(readByMap).some(
                      k => k !== msg.senderId && k !== myUid && k !== (auth.currentUser?.uid || '')
                    );
                    const readViaConvoTimestamp = Boolean(
                      otherLastReadAt &&
                      msg.timestamp &&
                      new Date(msg.timestamp).getTime() <= new Date(otherLastReadAt).getTime() + 2000
                    );
                    const isReadByRecipient = Boolean(msg.isRead || hasOtherReaderKey || readViaConvoTimestamp);
                    const isLatestSentMessage = isSent && Boolean(latestSentMsgId && (msg.id || msg.tempId) === latestSentMsgId);

                    const msgTextStr = typeof msg.text === 'string'
                      ? msg.text
                      : (msg.text && typeof msg.text === 'object' && typeof (msg.text as any).text === 'string' ? (msg.text as any).text : '');
                    const isMatchedInSearch = chatSearchQuery.trim() && msgTextStr.toLowerCase().includes(chatSearchQuery.toLowerCase());

                    return (
                      <React.Fragment key={msg.id || msg.tempId}>
                        {/* WhatsApp Date Separator Pill */}
                        {showDateBadge && (
                          <div className="flex justify-center my-2.5">
                            <span className="bg-[#18181c]/90 text-zinc-400 text-[10.5px] font-semibold px-3 py-0.5 rounded-md border border-white/5 uppercase tracking-wider backdrop-blur-sm shadow-sm select-none">
                              {currentDateGroup}
                            </span>
                          </div>
                        )}

                        {/* Message Bubble Container */}
                        <motion.div 
                          id={`msg-${msg.id || msg.tempId}`}
                          initial={{ opacity: 0, y: 10, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.18, ease: "easeOut" }}
                          className={`flex flex-col w-full ${isSent ? 'items-end pl-10 sm:pl-16' : 'items-start pr-10 sm:pr-16'} group`}
                        >
                          <div 
                            className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-2.5 sm:p-3 relative transition-all ${
                              isSent 
                                ? 'simcha-chat-bubble simcha-chat-bubble-sent bg-gradient-to-br from-[#3d300c] via-[#2f2509] to-[#241c06] border border-[#D4AF37]/65 text-white rounded-tr-none shadow-[0_4px_14px_rgba(212,175,55,0.16)]' 
                                : 'simcha-chat-bubble simcha-chat-bubble-received bg-gradient-to-br from-[#1b2230] via-[#161c28] to-[#121722] border border-[#34B7F1]/35 text-white rounded-tl-none shadow-[0_4px_14px_rgba(0,0,0,0.4)]'
                            } ${isMatchedInSearch ? 'ring-2 ring-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.4)]' : ''}`}
                          >
                            {/* Sender Role / Name Label so Left vs Right is unmistakably clear */}
                            <div className={`text-[10px] font-bold uppercase tracking-wider mb-1 px-1 select-none flex items-center ${isSent ? 'justify-end text-[#D4AF37]' : 'justify-start text-[#34B7F1]'}`}>
                              {isSent
                                ? 'You'
                                : (currentContact?.name || (isAdminReplying || isVendorReplying ? (msg.clientName || 'Client') : 'Vendor'))}
                            </div>
                            {/* Image Attachment */}
                            {msg.type === 'image' || msg.imageUrl ? (
                              <div 
                                className="space-y-1.5 cursor-pointer" 
                                onClick={() => setFullscreenMedia({ url: msg.imageUrl || msg.fileUrl || '', type: 'image' })}
                              >
                                <ImageWithPlaceholder 
                                  src={msg.imageUrl || msg.fileUrl || ''} 
                                  alt="Sent media" 
                                  isSent={isSent}
                                  onLoadCompletes={() => scrollToBottomSmart(false)} 
                                />
                                {msgTextStr && msgTextStr !== 'Sent an image' && (
                                  <p className="text-[14px] leading-relaxed px-1">{msgTextStr}</p>
                                )}
                              </div>
                            ) : msg.type === 'file' ? (
                              msg.fileType?.startsWith('video/') ? (
                                <div 
                                  className="space-y-1.5 cursor-pointer relative group/video" 
                                  onClick={() => setFullscreenMedia({ url: msg.fileUrl || '', type: 'video' })}
                                >
                                  <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black">
                                    <video src={msg.fileUrl} className="w-full aspect-video object-cover" />
                                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover/video:bg-black/50 transition-colors">
                                      <div className="w-11 h-11 bg-[#D4AF37] text-black rounded-full flex items-center justify-center shadow-lg transform group-hover/video:scale-110 transition-transform">
                                        <Play className="w-5 h-5 fill-current ml-0.5" />
                                      </div>
                                    </div>
                                  </div>
                                  {msgTextStr && msgTextStr !== 'Sent a video' && (
                                    <p className="text-[14px] leading-relaxed px-1">{msgTextStr}</p>
                                  )}
                                </div>
                              ) : (
                                /* WhatsApp-Style File / Document Card */
                                <a 
                                  href={msg.fileUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${
                                    isSent ? 'bg-black/25 hover:bg-black/35 text-zinc-100' : 'bg-black/30 hover:bg-black/40 text-zinc-100'
                                  }`}
                                >
                                  <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center shrink-0">
                                    <FileText className="w-5 h-5 text-[#D4AF37]" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="truncate font-semibold text-[13px] text-zinc-100">{msg.fileName || 'Document'}</p>
                                    <p className="text-[11px] text-zinc-400">Click to open or download</p>
                                  </div>
                                  <Download className="w-4 h-4 text-zinc-400 shrink-0" />
                                </a>
                              )
                            ) : msg.type === 'voice' || msg.audioUrl ? (
                              /* WhatsApp Voice Note Card with Real CustomAudioPlayer */
                              <CustomAudioPlayer 
                                src={msg.audioUrl || msg.fileUrl || ''} 
                                theme={isSent ? 'sent' : 'received'} 
                                duration={msg.audioDuration}
                                avatarUrl={isSent ? (user?.photoURL || (isVendorReplying ? initialVendor?.image : undefined)) : currentContact?.image}
                                timestampFormatted={formatMsgTime(msg.timestamp)}
                                status={msg.status}
                                isRead={Boolean(isReadByRecipient)}
                                showSeenLabel={isLatestSentMessage}
                                onDelete={isSent && !msg.isOptimistic && msg.status !== 'sending' ? () => handleUnsend(msg) : undefined}
                              />
                            ) : (
                              /* Text Message */
                              <p className="text-[14px] leading-relaxed break-words whitespace-pre-wrap font-sans text-zinc-100 select-text px-1">
                                {msgTextStr}
                              </p>
                            )}

                            {/* WhatsApp Metadata Row: Timestamp + Read Receipts (for non-voice messages; voice notes integrate this directly under the waveform) */}
                            {!(msg.type === 'voice' || msg.audioUrl) && (
                              <div className="flex justify-end items-center gap-1 mt-1 pl-4 select-none leading-none">
                                <span className="text-[10.5px] text-zinc-400 font-sans">
                                  {formatMsgTime(msg.timestamp)}
                                </span>

                                {isSent && (
                                  msg.status === 'sending' ? (
                                    <Clock className="w-3 h-3 text-zinc-500 animate-pulse ml-0.5" />
                                  ) : msg.status === 'error' ? (
                                    <AlertCircle className="w-3.5 h-3.5 text-red-500 ml-0.5" />
                                  ) : isReadByRecipient ? (
                                    <span title="Seen" className="inline-flex items-center gap-0.5 text-[#34B7F1] ml-0.5">
                                      <CheckCheck className="w-3.5 h-3.5 text-[#34B7F1] shrink-0" />
                                      {isLatestSentMessage && (
                                        <span className="text-[9.5px] font-medium text-[#34B7F1]/90 leading-none">Seen</span>
                                      )}
                                    </span>
                                  ) : (
                                    <span title="Sent" className="inline-flex items-center text-zinc-400 ml-0.5">
                                      <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                                    </span>
                                  )
                                )}

                                {/* WhatsApp quick message actions on hover */}
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyText(msgTextStr)}
                                    className="text-zinc-500 hover:text-zinc-200 p-0.5 rounded"
                                    title="Copy text"
                                    aria-label="Copy text"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                  {isSent && !msg.isOptimistic && msg.status !== 'sending' && (
                                    <button
                                      type="button"
                                      onClick={() => handleUnsend(msg)}
                                      className="text-zinc-500 hover:text-red-400 p-0.5 rounded"
                                      title="Delete message"
                                      aria-label="Delete message"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Failed Sending Retry Box */}
                            {isSent && msg.status === 'error' && (
                              <div className="mt-1.5 pt-1.5 border-t border-red-500/20 flex items-center justify-between gap-2">
                                <span className="text-red-400 text-[10px] font-bold">Failed to send</span>
                                <button 
                                  type="button"
                                  onClick={() => handleRetryMessage(msg)}
                                  className="bg-red-950/60 hover:bg-red-900 text-red-200 font-bold px-2 py-0.5 rounded text-[10px] border border-red-500/40 uppercase tracking-wider"
                                >
                                  Retry
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      </React.Fragment>
                    );
                  });
                })()}

                {/* Real-time Typing Bubble */}
                {otherIsTyping && (
                  <div className="flex justify-start my-1 animate-in fade-in duration-200">
                    <div className="bg-[#18181c] border border-white/10 text-zinc-300 px-3.5 py-2 rounded-2xl rounded-tl-xs text-xs flex items-center gap-2 shadow-sm">
                      <span className="text-zinc-400 text-[11px] font-medium">
                        {currentContact?.name || 'Contact'}
                      </span>
                      <div className="flex items-center gap-1" aria-hidden="true">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={bottomRef} className="h-1" />
              </div>

              {/* Scroll to Bottom Floating Pill */}
              {showScrollBottomBtn && (
                <button
                  type="button"
                  onClick={() => scrollToBottomSmart(true)}
                  className="absolute bottom-20 right-5 z-20 w-9 h-9 rounded-full bg-[#1c1c20] border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black flex items-center justify-center shadow-2xl transition-all active:scale-95 cursor-pointer"
                  title="Scroll to latest"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
              )}

              {/* Quick Emoji Tray Drawer */}
              <AnimatePresence>
                {showEmojiPicker && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="bg-[#141416] border-t border-white/10 px-3 py-2 overflow-x-auto overflow-y-hidden flex items-center gap-2 select-none z-10"
                  >
                    {POPULAR_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleAddEmoji(emoji)}
                        className="text-xl p-1.5 hover:bg-white/10 rounded-lg transition-transform active:scale-125"
                      >
                        {emoji}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* WhatsApp Attachment Popup Tray */}
              <AnimatePresence>
                {showAttachMenu && (
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0, y: 10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 10 }}
                    className="absolute bottom-16 left-4 z-30 bg-[#18181c] border border-[#D4AF37]/30 rounded-2xl p-2.5 shadow-2xl flex flex-col gap-1.5 min-w-[200px]"
                  >
                    <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer text-xs text-zinc-200 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-[#D4AF37]/15 flex items-center justify-center text-[#D4AF37]">
                        <ImageIcon className="w-4 h-4" />
                      </div>
                      <span>Photo or Video</span>
                      <input type="file" accept="image/*,video/*" className="hidden" onChange={handleFileUpload} />
                    </label>

                    <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer text-xs text-zinc-200 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-blue-500/15 flex items-center justify-center text-blue-400">
                        <FileText className="w-4 h-4" />
                      </div>
                      <span>Document or PDF</span>
                      <input type="file" accept=".pdf,.doc,.docx,.txt" className="hidden" onChange={handleFileUpload} />
                    </label>

                    <label className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 cursor-pointer text-xs text-zinc-200 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-purple-500/15 flex items-center justify-center text-purple-400">
                        <Volume2 className="w-4 h-4" />
                      </div>
                      <span>Audio Clip</span>
                      <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
                    </label>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Drag & Drop Overlay */}
              {isDragActive && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85 backdrop-blur-sm border-2 border-dashed border-[#D4AF37] rounded-xl m-2 pointer-events-none">
                  <div className="flex flex-col items-center text-[#D4AF37]">
                    <Upload className="w-10 h-10 mb-2 animate-bounce" />
                    <span className="font-bold tracking-widest text-sm uppercase font-[Cinzel]">Drop file to attach</span>
                  </div>
                </div>
              )}

              {/* Upload Progress Bar */}
              {isUploading && uploadProgress !== null && (
                <div className="bg-[#141416] border-t border-[#D4AF37]/20 px-4 py-2 flex items-center gap-3">
                  <Loader2 className="w-4 h-4 text-[#D4AF37] animate-spin shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-[11px] font-mono text-zinc-300 mb-1">
                      <span>Uploading attachment...</span>
                      <span>{Math.round(uploadProgress)}%</span>
                    </div>
                    <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-[#D4AF37] h-full transition-all duration-150" 
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Microphone Permission Notice Banner */}
              {micPermissionError && (
                <div className="p-3 bg-red-950/40 border-t border-red-500/30 text-red-200 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{micPermissionError}</span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => setMicPermissionError(null)}
                    className="text-red-400 hover:text-white px-1.5 font-bold"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* WhatsApp Bottom Composer */}
              <div 
                className="bg-[#121214] border-t border-[#D4AF37]/15 p-2 sm:p-2.5 flex items-end gap-1.5 shrink-0 relative z-20 pb-[max(env(safe-area-inset-bottom),0.5rem)]"
                onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(true); }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(true); }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(false); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragActive(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    handleFileUpload({ target: { files: e.dataTransfer.files } });
                  }
                }}
              >
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />

                {!isRecording ? (
                  <>
                    {/* Left Action Buttons: Emoji & Paperclip */}
                    <div className="flex items-center gap-0.5 text-zinc-400 shrink-0 mb-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowEmojiPicker(prev => !prev);
                          setShowAttachMenu(false);
                        }}
                        className={`p-2 rounded-full transition-colors ${showEmojiPicker ? 'text-[#D4AF37] bg-white/10' : 'hover:text-zinc-200 hover:bg-white/5'}`}
                        title="Emojis"
                        aria-label="Emojis"
                      >
                        <Smile className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAttachMenu(prev => !prev);
                          setShowEmojiPicker(false);
                        }}
                        className={`p-2 rounded-full transition-colors ${showAttachMenu ? 'text-[#D4AF37] bg-white/10' : 'hover:text-zinc-200 hover:bg-white/5'}`}
                        title="Attach"
                        aria-label="Attach"
                      >
                        <Paperclip className="w-5 h-5" />
                      </button>
                    </div>

                    {/* WhatsApp Pill Input */}
                    <div className="flex-1 min-w-0 bg-[#1c1c20] border border-white/10 focus-within:border-[#D4AF37]/50 rounded-[22px] px-3.5 py-1.5 transition-colors flex items-center">
                      <textarea 
                        ref={textareaRef}
                        rows={1}
                        value={text}
                        onChange={handleTextChange}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (text.trim()) {
                              handleSend();
                              handleTypingStatus(false);
                            }
                          }
                        }}
                        placeholder="Type a message..."
                        className="w-full bg-transparent text-zinc-100 text-[14px] leading-relaxed resize-none outline-none max-h-[120px] placeholder:text-zinc-500 overflow-y-auto"
                      />
                    </div>

                    {/* Right Circle Action: Send or Mic */}
                    <div className="shrink-0 mb-0.5">
                      {text.trim() ? (
                        <button
                          type="button"
                          onClick={() => {
                            handleSend();
                            handleTypingStatus(false);
                          }}
                          className="w-10 h-10 rounded-full bg-[#D4AF37] text-black hover:bg-[#e0bb40] transition-all flex items-center justify-center shadow-md active:scale-95 cursor-pointer"
                          title="Send message"
                          aria-label="Send message"
                        >
                          <Send className="w-4 h-4 ml-0.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={startRecording}
                          className="w-10 h-10 rounded-full bg-[#1c1c20] border border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black transition-all flex items-center justify-center shadow active:scale-95 cursor-pointer"
                          title="Record voice note"
                          aria-label="Record voice note"
                        >
                          <Mic className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  /* WhatsApp-Style Live Voice Recording Bar */
                  <div className="flex-1 flex items-center justify-between gap-2 bg-[#1c1c20] border border-[#D4AF37]/40 rounded-full px-3 py-1.5 shadow-lg animate-in fade-in duration-200">
                    {/* Left: Cancel / Trash Icon */}
                    <button
                      type="button"
                      onClick={cancelRecording}
                      className="p-2 text-zinc-400 hover:text-red-400 hover:bg-white/5 rounded-full transition-colors shrink-0 cursor-pointer"
                      title="Discard voice note"
                      aria-label="Discard voice note"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>

                    {/* Pulsing Red Mic & Duration Timer */}
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="relative flex items-center justify-center">
                        <Mic className="w-4 h-4 text-red-500 animate-pulse" />
                      </div>
                      <span className="text-zinc-100 font-sans tabular-nums text-sm font-medium">
                        {formatDuration(recordingDuration)}
                      </span>
                    </div>

                    {/* Real-time WhatsApp Voice Audio Visualizer Wave */}
                    <div className="flex-1 flex items-center justify-center gap-[2.5px] h-6 px-2 overflow-hidden">
                      {liveVolumeBars.map((height, i) => (
                        <div 
                          key={i} 
                          className="w-[2.5px] bg-zinc-300 rounded-full transition-all duration-75"
                          style={{ height: `${Math.max(4, height)}px` }}
                        />
                      ))}
                    </div>

                    {/* Right: WhatsApp Circular Send Button */}
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="w-9 h-9 rounded-full bg-[#D4AF37] text-black hover:bg-[#e0bb40] flex items-center justify-center shadow-md active:scale-95 transition-all shrink-0 cursor-pointer"
                      title="Send voice note"
                      aria-label="Send voice note"
                    >
                      <Send className="w-4 h-4 ml-0.5" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Fullscreen Media Modal */}
      <AnimatePresence>
        {fullscreenMedia && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md"
          >
            <button 
              type="button"
              onClick={() => setFullscreenMedia(null)}
              className="absolute top-4 right-4 text-white hover:text-[#D4AF37] bg-black/60 p-3 rounded-full backdrop-blur-md border border-white/10 transition-all shadow-xl z-10"
              aria-label="Close fullscreen media"
            >
              <X className="w-6 h-6" />
            </button>
            {fullscreenMedia.type === 'image' ? (
              <img 
                src={fullscreenMedia.url} 
                alt="Fullscreen" 
                className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
              />
            ) : (
              <video 
                src={fullscreenMedia.url} 
                controls
                autoPlay
                className="max-w-full max-h-full rounded-xl shadow-2xl"
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChatModal;
