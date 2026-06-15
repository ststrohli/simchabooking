import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Send, User, Mail, MessageSquare, Bot, Image as ImageIcon, Paperclip, Mic, StopCircle, Play, Volume2, FileText, Download, Loader2, Shield, ArrowLeft } from 'lucide-react';
import { Vendor, Message, UserAccount } from '../types';
import { storage, auth, db, handleFirestoreError, OperationType } from '../services/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, limit, startAfter, getDocs, setDoc } from 'firebase/firestore';
import { uploadFileRobustly } from '../services/uploadService';
import { CustomAudioPlayer } from './CustomAudioPlayer';

interface ImageWithPlaceholderProps {
  src: string;
  alt: string;
  onLoadCompletes: () => void;
  isSent: boolean;
}

const ImageWithPlaceholder: React.FC<ImageWithPlaceholderProps> = ({ src, alt, onLoadCompletes, isSent }) => {
  const [loaded, setLoaded] = useState(false);
  
  return (
    <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-[#D4AF37]/20 bg-zinc-950">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-zinc-900 to-zinc-950 animate-pulse">
          <ImageIcon className="w-8 h-8 text-[#D4AF37]/40 mb-2" />
          <span className="text-[9px] uppercase tracking-widest text-[#D4AF37]/50 font-bold font-mono">Loading Image...</span>
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

interface ChatModalProps {
  isOpen: boolean;
  vendor: Vendor | null; // For vendor chat
  isAdminMode?: boolean; // For client-to-admin chat
  onClose: () => void;
  onSendMessage: (payload: Partial<Message>) => void;
  showNotification: (message: string, type?: 'success' | 'info') => void;
  messages: Message[];
  user: UserAccount;
  recipientUid?: string;
  recipientName?: string;
  recipientEmail?: string;
  isAdminReplying?: boolean;
}

const ChatModal: React.FC<ChatModalProps> = ({ 
  isOpen, 
  vendor, 
  isAdminMode, 
  onClose, 
  onSendMessage, 
  showNotification, 
  messages, 
  user,
  recipientUid,
  recipientName,
  recipientEmail,
  isAdminReplying
}) => {
  const [text, setText] = useState('');
  const [clientName, setClientName] = useState(isAdminReplying ? (recipientName || '') : (user?.name || ''));
  const [clientEmail, setClientEmail] = useState(isAdminReplying ? (recipientEmail || '') : (user?.username || ''));
  const [isIdentityVerified, setIsIdentityVerified] = useState(isAdminReplying ? true : !!(user?.name && user?.username));
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<Message[]>([]);
  
  // Historical, Optimistic, and Pagination-related States
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [historicalMessages, setHistoricalMessages] = useState<Message[]>([]);
  const [lastVisibleDoc, setLastVisibleDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [otherIsTyping, setOtherIsTyping] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const lastMessageCountRef = useRef(0);
  const typingTimeoutRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const myUid = isAdminReplying ? 'admin' : (user?.id || auth.currentUser?.uid || '');
  const targetUid = isAdminReplying ? (recipientUid || '') : (isAdminMode ? 'admin' : (vendor?.id || ''));
  const isSupportChat = !!(isAdminMode || isAdminReplying);

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
    if (isAdminReplying) {
      setClientEmail(recipientEmail || '');
      setClientName(recipientName || 'User');
      setIsIdentityVerified(true);
    } else if (user?.username) {
      setClientEmail(user.username);
      setClientName(user.name || user.username.split('@')[0] || 'Guest');
      setIsIdentityVerified(true);
    }
  }, [user, isAdminReplying, recipientEmail, recipientName]);

  // Real-time onSnapshot listener querying the messages collection by activeConversationId
  useEffect(() => {
    if (!isOpen || !myUid || !targetUid) {
      setActiveMessages([]);
      setOptimisticMessages([]);
      setHistoricalMessages([]);
      setLastVisibleDoc(null);
      setHasMore(true);
      setIsLoadingMore(false);
      lastMessageCountRef.current = 0;
      return;
    }

    const activeConversationId = [myUid, targetUid].sort().join('_');
    const q = query(
      collection(db, 'messages'),
      where('conversationId', '==', activeConversationId),
      where('participants', 'array-contains', myUid),
      orderBy('timestamp', 'desc'),
      limit(30)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const seenIds = new Set<string>();
      const msgsRaw = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Message));

      // Client-Side Deduplication: Filter out any duplicates based on message.id
      const cleanMsgs: Message[] = [];
      msgsRaw.forEach(m => {
        if (m.id && !seenIds.has(m.id)) {
          seenIds.add(m.id);
          cleanMsgs.push(m);
        }
      });

      // Reverse messages to chronological order for UI array representation
      cleanMsgs.reverse();
      setActiveMessages(cleanMsgs);

      // Save cursor for Pagination / Lazy Loading previous messages
      if (snapshot.docs.length > 0) {
        setLastVisibleDoc(snapshot.docs[snapshot.docs.length - 1]);
      }
      if (snapshot.docs.length < 30) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
    }, (err) => {
      console.warn("Firestore ordered messages query failed (composite index might be building), falling back to client-side sort:", err);
      const fallbackQ = query(
        collection(db, 'messages'),
        where('conversationId', '==', activeConversationId),
        where('participants', 'array-contains', myUid),
        limit(30)
      );
      return onSnapshot(fallbackQ, (snapshot) => {
        const msgsRaw = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Message));

        const seenIds = new Set<string>();
        const cleanMsgs: Message[] = [];
        msgsRaw.forEach(m => {
          if (m.id && !seenIds.has(m.id)) {
            seenIds.add(m.id);
            cleanMsgs.push(m);
          }
        });

        cleanMsgs.sort((a, b) => {
          const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
        });
        
        setActiveMessages(cleanMsgs);

        if (snapshot.docs.length > 0) {
          setLastVisibleDoc(snapshot.docs[snapshot.docs.length - 1]);
        }
        if (snapshot.docs.length < 30) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }
      }, (err2) => {
        handleFirestoreError(err2, OperationType.LIST, 'messages');
      });
    });

    return () => unsubscribe();
  }, [isOpen, myUid, targetUid]);

  // Clean resolved local optimistic messages once they appear in the real-time database state
  useEffect(() => {
    if (activeMessages.length > 0 && optimisticMessages.length > 0) {
      const dbTempIds = new Set(activeMessages.map(m => m.tempId).filter(Boolean));
      const stillPending = optimisticMessages.filter(om => !dbTempIds.has(om.tempId));
      if (stillPending.length !== optimisticMessages.length) {
        setOptimisticMessages(stillPending);
      }
    }
  }, [activeMessages, optimisticMessages]);

  // Listening to the conversation typing status in real-time
  useEffect(() => {
    if (!isOpen || !myUid || !targetUid) {
      setOtherIsTyping(false);
      return;
    }
    const activeConversationId = [myUid, targetUid].sort().join('_');
    const unsub = onSnapshot(doc(db, 'conversations', activeConversationId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const typing = data?.typing || {};
        const otherTyping = typing[targetUid] || false;
        setOtherIsTyping(otherTyping);
      } else {
        setOtherIsTyping(false);
      }
    }, (err) => {
      console.warn("Error listening to conversation document:", err);
    });
    return () => unsub();
  }, [isOpen, myUid, targetUid]);

  // Auto-read incoming messages within the open modal and reset DB unread count
  useEffect(() => {
    if (isOpen && activeMessages.length > 0) {
      const activeConversationId = [myUid, targetUid].sort().join('_');
      const incomingUnread = activeMessages.filter(m => m.senderId !== myUid && !m.isRead);
      if (incomingUnread.length > 0) {
        incomingUnread.forEach(async (m) => {
          try {
            await updateDoc(doc(db, 'messages', m.id), { isRead: true, status: 'read' });
          } catch (err) {
            console.error("Auto mark read in ChatModal failed", err);
          }
        });
      }
      
      const resetUnread = async () => {
        try {
          await setDoc(doc(db, 'conversations', activeConversationId), {
            [`unreadCount.${myUid}`]: 0
          }, { merge: true });
        } catch (err) {
          console.warn("Reset unread count in conversations failed:", err);
        }
      };
      resetUnread();
    }
  }, [isOpen, activeMessages, myUid, targetUid]);

  // Merge, format and client-side deduplicate all messages
  const chatMessages = useMemo(() => {
    const seenIds = new Set<string>();
    const uniqueMessages: Message[] = [];

    // 1. Append older historical messages (loaded via startAfter pagination)
    historicalMessages.forEach(m => {
      if (m.id && !seenIds.has(m.id)) {
        seenIds.add(m.id);
        uniqueMessages.push(m);
      }
    });

    // 2. Append active real-time messages
    activeMessages.forEach(m => {
      if (m.id && !seenIds.has(m.id)) {
        seenIds.add(m.id);
        uniqueMessages.push(m);
      }
    });

    // 3. Mark database matched optimistic records as 'sent'
    const dbTempIds = new Set(uniqueMessages.map(m => m.tempId).filter(Boolean));
    const resolvedDbMessages = uniqueMessages.map(m => {
      if (m.tempId) {
        return { ...m, status: 'sent' as const };
      }
      return m;
    });

    // 4. Append outstanding pending optimistic updates
    const pendingOptimistic = optimisticMessages
      .filter(om => !dbTempIds.has(om.tempId))
      .map(om => ({ ...om, isOptimistic: true, status: om.status || ('sending' as const) }));

    return [...resolvedDbMessages, ...pendingOptimistic];
  }, [historicalMessages, activeMessages, optimisticMessages]);

  const loadMoreMessages = async () => {
    if (isLoadingMore || !hasMore || !lastVisibleDoc || !myUid || !targetUid) return;
    
    setIsLoadingMore(true);
    const container = scrollRef.current;
    
    // Save scroll dimensions prior to insertion to prevent jumping
    const previousScrollHeight = container ? container.scrollHeight : 0;
    const previousScrollTop = container ? container.scrollTop : 0;

    try {
      const activeConversationId = [myUid, targetUid].sort().join('_');
      const q = query(
        collection(db, 'messages'),
        where('conversationId', '==', activeConversationId),
        where('participants', 'array-contains', myUid),
        orderBy('timestamp', 'desc'),
        startAfter(lastVisibleDoc),
        limit(30)
      );

      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.docs.length > 0) {
        const olderMsgs = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Message));
        
        olderMsgs.reverse();

        setHistoricalMessages(prev => [...olderMsgs, ...prev]);
        setLastVisibleDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
        
        if (querySnapshot.docs.length < 30) {
          setHasMore(false);
        }
        
        // Retain scroll height offset so the visual presentation remains persistent
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

  const scrollToBottomSmart = (force = false) => {
    const el = scrollRef.current;
    if (!el) return;
    
    // Checks if current viewport is within 150px of scrollable bottom
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 150;
    
    if (force || isNearBottom) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    }
  };

  // Scroll handler for paging older history
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop <= 50 && hasMore && !isLoadingMore) {
      loadMoreMessages();
    }
  };

  // Monitor total messages for auto-scrolling
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

  // Handle forcing to bottom on registration / opening modal
  useEffect(() => {
    if (isOpen && isIdentityVerified) {
      const timer1 = setTimeout(() => scrollToBottomSmart(true), 50);
      const timer2 = setTimeout(() => scrollToBottomSmart(true), 150);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [isOpen, isIdentityVerified]);

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
      fileName: payload.fileName,
      fileType: payload.fileType,
    };

    setOptimisticMessages(prev => [...prev, optMsg]);
    
    // Call the parent sendMessage function, passing payload with a tracking tempId
    try {
      await onSendMessage({
        ...payload,
        tempId,
      });
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
        fileName: msg.fileName,
        fileType: msg.fileType,
        tempId: msg.tempId
      });
    } catch (err) {
      console.error("Failed retry of message send:", err);
      setOptimisticMessages(prev =>
        prev.map(m => m.tempId === msg.tempId ? { ...m, status: 'error' as const } : m)
      );
    }
  };

  const handleTypingStatus = async (isTyping: boolean) => {
    if (!myUid || !targetUid) return;
    const activeConversationId = [myUid, targetUid].sort().join('_');
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
    
    if (!isIdentityVerified) {
      if (clientName && clientEmail) {
        setIsIdentityVerified(true);
      } else {
        return;
      }
    }

    const conversationId = [myUid, targetUid].sort().join('_');

    sendOptimisticMessage({
      text,
      clientName,
      clientEmail,
      senderId: myUid,
      receiverId: targetUid,
      conversationId,
      isAdminInquiry: isSupportChat,
      type: 'text'
    });
    setText('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const storagePath = `chats/${Date.now()}_${file.name}`;
      const url = await uploadFileRobustly(file, storagePath);

      const isImage = file.type.startsWith('image/');
      const conversationId = [myUid, targetUid].sort().join('_');

      sendOptimisticMessage({
        text: isImage ? 'Sent an image' : `Sent a file: ${file.name}`,
        clientName,
        clientEmail,
        senderId: myUid,
        receiverId: targetUid,
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
    }
  };

  const startRecording = async () => {
    setMicPermissionError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      const msg = "Your browser does not support audio recording or you are in an insecure context.";
      setMicPermissionError(msg);
      showNotification(msg, "info");
      return;
    }

    try {
      if (!window.isSecureContext) {
        const msg = "Audio recording requires a secure (HTTPS) connection.";
        setMicPermissionError(msg);
        showNotification(msg, "info");
        return;
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const mimeTypes = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/wav'];
        const mimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported
          ? (mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || 'audio/webm')
          : 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        setIsUploading(true);
        try {
          const fileExt = mimeType.split('/')[1].split(';')[0];
          const storagePath = `chats/voice_${Date.now()}.${fileExt}`;
          const url = await uploadFileRobustly(audioBlob, storagePath);
          const conversationId = [myUid, targetUid].sort().join('_');

          sendOptimisticMessage({
            text: 'Voice note',
            clientName,
            clientEmail,
            senderId: myUid,
            receiverId: targetUid,
            conversationId,
            isAdminInquiry: isSupportChat,
            type: 'voice',
            fileUrl: url,
            audioUrl: url
          });
        } catch (err: any) {
          console.error("Voice upload failed:", err);
          showNotification("Failed to upload voice message: " + err.message, "info");
        } finally {
          setIsUploading(false);
        }
        
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Microphone access denied detail:", err);
      
      const originalDetail = err?.message || err?.name || String(err) || "Permission denied";
      let errorMessage = `Microphone access was blocked by the browser (${originalDetail}). Since this application runs in a sandboxed preview iframe, browsers reject microphone access by default. Please click the "Open in new window" button in the top-right of the preview title bar to load the application in a new tab, where microphone permissions can be granted.`;
      const errStr = originalDetail.toLowerCase();
      
      if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError' || errStr.includes('notfound') || errStr.includes('device')) {
        errorMessage = `No microphone found on your device (${originalDetail}). Please connect a microphone and try again.`;
      } else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError' || errStr.includes('readable') || errStr.includes('in use')) {
        errorMessage = `Your microphone is already in use by another application (${originalDetail}). Please close other apps and try again.`;
      }
      
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

  const formatDuration = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  const checkIfSent = (msg: Message) => {
    if (!msg) return false;
    if (isAdminReplying) {
      return msg.senderId === 'admin';
    }
    const loggedInUid = user?.id || auth.currentUser?.uid;
    
    if (loggedInUid && msg.senderId === loggedInUid) {
      return true;
    }
    
    if (msg.senderId === 'client') {
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

  const lastSenderMessageId = useMemo(() => {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (checkIfSent(chatMessages[i])) {
        return chatMessages[i].id;
      }
    }
    return null;
  }, [chatMessages]);

  const getDynamicTimestamp = (timestampString: string) => {
    if (!timestampString) return '';
    const date = new Date(timestampString);
    if (isNaN(date.getTime())) return '';
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) {
      if (now.getDate() === date.getDate()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return 'Yesterday';
    }
    
    const options: Intl.DateTimeFormatOptions = { weekday: 'short', hour: '2-digit', minute: '2-digit' };
    if (diffMs < 7 * 24 * 60 * 60 * 1000) {
      return date.toLocaleDateString([], options);
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', ...options });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="fixed inset-0 z-50 w-full h-[100svh] bg-black rounded-none md:relative md:max-w-xl md:h-[80vh] md:rounded-xl md:border md:border-zinc-800 md:shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-black p-4 border-b border-[#D4AF37]/20 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <button 
              onClick={onClose} 
              className="md:hidden flex items-center justify-center text-[#D4AF37] hover:text-[#E5C76B] transition-colors p-2 -ml-2 h-11 w-11"
              title="Back"
            >
              <ArrowLeft className="w-6 h-6 stroke-[2.5]" />
            </button>
            {isAdminMode || isAdminReplying ? (
              <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 flex items-center justify-center border border-[#D4AF37]/30">
                <Shield className="w-5 h-5 text-[#D4AF37]" />
              </div>
            ) : (
              <img src={vendor?.image} className="w-10 h-10 rounded-full object-cover border border-[#D4AF37]/30" alt="" />
            )}
            <div>
              <h3 className="font-bold text-[#D4AF37] font-[Cinzel] text-sm">
                {isAdminReplying ? `Chat with ${clientName}` : (isAdminMode ? 'System Concierge' : vendor?.name)}
              </h3>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                {isAdminReplying ? `${clientEmail}` : (isAdminMode ? 'Direct Support' : 'In-App Messaging')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="hidden md:block text-slate-500 hover:text-white p-2 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Identity Verification */}
        {!isIdentityVerified ? (
          <div className="p-6 space-y-4">
            <div className="text-center mb-4">
              <User className="w-10 h-10 text-[#D4AF37] mx-auto mb-2 opacity-50" />
              <h4 className="text-white font-bold">Who are you?</h4>
              <p className="text-xs text-slate-500">Provide your details to start a conversation.</p>
            </div>
            <div className="space-y-3">
              <input 
                type="text" 
                placeholder="Your Name" 
                className="w-full bg-[#111] border border-[#D4AF37]/20 rounded-lg px-4 py-2.5 text-base text-white outline-none focus:border-[#D4AF37]" 
                value={clientName} 
                onChange={e => setClientName(e.target.value)} 
              />
              <input 
                type="email" 
                placeholder="Your Email" 
                className="w-full bg-[#111] border border-[#D4AF37]/20 rounded-lg px-4 py-2.5 text-base text-white outline-none focus:border-[#D4AF37]" 
                value={clientEmail} 
                onChange={e => setClientEmail(e.target.value)} 
              />
              <button 
                onClick={() => clientName && clientEmail && setIsIdentityVerified(true)}
                className="w-full bg-[#D4AF37] text-black font-bold h-11 rounded-lg hover:bg-[#E5C76B] transition-all text-sm uppercase tracking-widest"
              >
                Start Chatting
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Body */}
            <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-4 bg-black/40">
              {/* Pagination Loader */}
              {hasMore && (
                <div className="flex justify-center py-2 border-b border-white/5 bg-zinc-950/20 rounded-lg mb-2">
                  {isLoadingMore ? (
                    <div className="flex items-center gap-2 text-xs text-[#D4AF37] tracking-wider uppercase font-mono animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading History...
                    </div>
                  ) : (
                    <button 
                      onClick={loadMoreMessages} 
                      className="text-[10px] text-zinc-500 hover:text-[#D4AF37] transition-colors font-mono uppercase tracking-widest"
                    >
                      Scroll up or click to load history
                    </button>
                  )}
                </div>
              )}

              {chatMessages.length === 0 ? (
                <div className="text-center py-10 opacity-30">
                  <MessageSquare className="w-12 h-12 mx-auto mb-2 text-[#D4AF37]" />
                  <p className="text-xs font-[Cinzel]">
                    {isAdminReplying ? "Send a message to start this discussion." : (isAdminMode ? 'Have a question? We are here to help.' : 'Send a message to inquire about services.')}
                  </p>
                </div>
              ) : (
                chatMessages.map((msg) => {
                  const isSent = checkIfSent(msg);
                  return (
                    <div key={msg.id} className={`flex flex-col ${isSent ? 'items-end' : 'items-start'}`}>
                      <div className={`max-w-[70%] p-4 rounded-[20px] transition-all duration-300 relative shadow-md ${
                        isSent 
                          ? 'bg-[#D4AF37] text-black' 
                          : 'bg-zinc-900 border border-zinc-800 text-white'
                      }`}>
                        {msg.type === 'image' || msg.imageUrl ? (
                          <div className="space-y-2">
                             <ImageWithPlaceholder 
                               src={msg.imageUrl || msg.fileUrl || ''} 
                               alt="Sent" 
                               isSent={isSent}
                               onLoadCompletes={() => scrollToBottomSmart(false)} 
                             />
                             {msg.text && msg.text !== 'Sent an image' && <p className="text-sm">{msg.text}</p>}
                          </div>
                        ) : msg.type === 'file' ? (
                          <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-3 p-3 rounded-xl transition-all text-sm ${isSent ? 'bg-black/10 hover:bg-black/20 text-black' : 'bg-black/30 hover:bg-black/40 text-white'}`}>
                            <FileText className="w-8 h-8 opacity-60 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                               <p className="truncate font-bold text-xs">{msg.fileName || 'Document'}</p>
                               <p className="text-[10px] opacity-60">Click to download</p>
                            </div>
                            <Download className="w-4 h-4 opacity-60 flex-shrink-0" />
                          </a>
                        ) : msg.type === 'voice' || msg.audioUrl ? (
                          <div className="space-y-1">
                             <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${isSent ? 'text-black/60' : 'text-zinc-400'}`}>Voice Note</p>
                             {msg.isOptimistic ? (
                               <div className="flex items-center gap-3 bg-zinc-950 border border-[#D4AF37]/20 rounded-xl p-3 w-[240px] animate-pulse">
                                 <div className="w-8 h-8 rounded-full bg-[#D4AF37]/10 flex items-center justify-center border border-[#D4AF37]/20">
                                   <Play className="w-4 h-4 text-[#D4AF37]/40" />
                                 </div>
                                 <div className="flex-1 space-y-1.5">
                                   <div className="h-1.5 w-24 bg-[#D4AF37]/20 rounded" />
                                   <div className="h-1 w-16 bg-[#D4AF37]/10 rounded" />
                                 </div>
                                </div>
                             ) : (
                               <CustomAudioPlayer src={msg.audioUrl || msg.fileUrl || ''} theme={isSent ? 'sent' : 'received'} />
                             )}
                          </div>
                        ) : (
                          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{msg.text}</p>
                        )}
                        
                        <div className="flex justify-end items-center gap-1 mt-2 select-none leading-none">
                          <span className={`text-[9px] font-medium opacity-65 ${isSent ? 'text-black/75' : 'text-zinc-400'}`}>
                            {msg.status === 'sending' ? 'Sending...' : getDynamicTimestamp(msg.timestamp)}
                          </span>
                          {isSent && (
                            msg.status === 'sending' ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin text-black/50" />
                            ) : msg.status === 'error' ? (
                              <span className="text-red-600 text-[10px] font-bold font-mono">⚠️</span>
                            ) : (
                              <span className={`text-[10px] ${msg.isRead ? 'text-blue-500' : 'text-black/40'}`}>
                                ✓✓
                              </span>
                            )
                          )}
                        </div>

                        {/* Failed sending state with Retry */}
                        {isSent && msg.status === 'error' && (
                          <div className="mt-2 pt-2 border-t border-red-500/10 flex items-center justify-end gap-1.5">
                            <span className="text-red-600 text-[9px] font-bold uppercase tracking-wider font-mono">Failed</span>
                            <button 
                              onClick={() => handleRetryMessage(msg)}
                              className="bg-black/80 hover:bg-black text-red-500 font-bold px-2 py-0.5 rounded text-[9px] border border-red-500/20 uppercase tracking-widest transition-all"
                            >
                              Retry
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Seen / Delivered receipts below last message bubble */}
                      {isSent && msg.id === lastSenderMessageId && (
                        <div className="text-[9px] mt-1 pr-2 opacity-60 text-slate-400 tracking-wider font-mono">
                          {msg.status === 'sending' ? 'Sending...' : (msg.status === 'error' ? 'Not Sent' : (msg.isRead ? 'Seen' : 'Delivered'))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* Typing Indicator */}
              {otherIsTyping && (
                <div className="flex justify-start px-2 py-1">
                  <div className="bg-zinc-900 border border-[#D4AF37]/10 text-[#D4AF37] px-4 py-2.5 rounded-full text-[11px] flex items-center gap-2 shadow-lg animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span className="font-semibold">
                      {(isAdminReplying ? clientName : (isAdminMode ? 'System Concierge' : vendor?.name)) || 'Someone'} is typing...
                    </span>
                  </div>
                </div>
              )}
              
              {/* Scroll anchor */}
              <div ref={bottomRef} className="h-2" />
            </div>

            {/* Input Footer */}
            <div className="p-4 border-t border-[#D4AF37]/20 bg-black space-y-3 sticky bottom-0 pb-safe pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
              
              {micPermissionError && (
                <div id="mic-perm-error-alert" className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-100 text-xs flex items-start gap-2.5 shadow-md">
                  <span className="text-red-400 font-bold mt-0.5" aria-hidden="true">⚠️</span>
                  <div className="flex-1 space-y-1">
                    <p className="font-semibold text-red-400">Microphone Access Needed</p>
                    <p className="opacity-90 leading-relaxed text-[11px]">{micPermissionError}</p>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      💡 **Alternative:** You can record audio on your device and attach the file using the paperclip icon (📎) instead!
                    </p>
                  </div>
                  <button 
                    onClick={() => setMicPermissionError(null)}
                    className="text-slate-500 hover:text-white transition-colors text-sm px-1.5 focus:outline-none"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              )}
              
              <div className="flex items-center gap-2">
                {!isRecording ? (
                  <>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center justify-center h-11 w-11 text-slate-400 hover:text-[#D4AF37] transition-all flex-shrink-0 rounded-xl hover:bg-zinc-900"
                      title="Attach file"
                    >
                      <Paperclip className="w-5 h-5" />
                    </button>
                    <button 
                       onClick={startRecording}
                       className="flex items-center justify-center h-11 w-11 text-slate-400 hover:text-[#D4AF37] transition-all flex-shrink-0 rounded-xl hover:bg-zinc-900"
                       title="Record voice note"
                    >
                       <Mic className="w-5 h-5" />
                    </button>
                    <div className="relative flex-1 flex items-center">
                      <input 
                        type="text" 
                        value={text}
                        onChange={e => {
                          setText(e.target.value);
                          handleTypingStatus(true);
                          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                          typingTimeoutRef.current = setTimeout(() => {
                            handleTypingStatus(false);
                          }, 2000);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (text.trim()) {
                              handleSend();
                              handleTypingStatus(false);
                            }
                          }
                        }}
                        placeholder="Type a message..."
                        className="w-full bg-[#111] border border-[#D4AF37]/20 rounded-xl pl-4 pr-10 h-11 text-base text-white focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all placeholder:text-zinc-600"
                      />
                    </div>
                    <button 
                      onClick={() => {
                        handleSend();
                        handleTypingStatus(false);
                      }}
                      disabled={!text.trim()}
                      className={`flex items-center justify-center h-11 w-11 rounded-xl transition-all shadow-lg flex-shrink-0 ${
                        text.trim() 
                          ? 'bg-[#D4AF37] text-black hover:bg-[#E5C76B] shadow-[#D4AF37]/10 cursor-pointer' 
                          : 'bg-zinc-800 text-zinc-500 cursor-not-allowed shadow-none'
                      }`}
                      title="Send message"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-xl px-4 h-11 animate-pulse">
                    <div className="flex items-center gap-3">
                       <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                       <span className="text-red-500 text-xs font-bold font-mono">{formatDuration(recordingDuration)}</span>
                    </div>
                    <button 
                      onClick={stopRecording}
                      className="bg-red-500 text-white h-9 w-9 flex items-center justify-center rounded-lg hover:bg-red-600 transition-all flex-shrink-0"
                    >
                      <StopCircle className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
              {isUploading && (
                <div className="flex items-center justify-center gap-2 text-[10px] text-[#D4AF37] font-black uppercase tracking-widest animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" /> Uploading Media...
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ChatModal;
