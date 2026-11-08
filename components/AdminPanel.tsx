import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import {
  ShieldCheck, Plus, Image as ImageIcon, MapPin, DollarSign, ArrowLeft,
  Trash2, Search, Settings, User, Key, Upload, Tag, X, Check, CheckCheck,
  Play, Loader2, BarChart3, Wallet, LogIn, Edit2, ChevronDown, ChevronRight,
  MessageSquare, Camera, FolderPlus, ListTree, Layers, CreditCard,
  ShoppingBag, Calendar, FileText, ArrowUp, ArrowDown, UserPlus, UserCheck,
  Mic, Sparkles, CheckCircle2, RefreshCw, AlertTriangle
} from 'lucide-react';
import { auth, db, firebaseConfig } from '../services/firebase';
import { markChatAsRead } from '../services/messagingService';
import {
  collection, query, orderBy, limit, onSnapshot, doc, updateDoc,
  deleteDoc, setDoc, where, getDocs, getDoc, deleteField
} from 'firebase/firestore';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { uploadFileRobustly, uploadFileWithProgress } from '../services/uploadService';
import ChatModal from './ChatModal';
import LocationAutocomplete from './LocationAutocomplete';
import { useModalDragDismiss, ModalDragIndicator } from './useModalDragDismiss';
import { Vendor, Post, Booking, UserAccount, Message, HeroImage } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const getSecondaryAuth = () => {
  const apps = getApps();
  const existingSecondary = apps.find(a => a.name === 'secondary-vendor-auth');
  if (existingSecondary) {
    return getAuth(existingSecondary);
  }
  const secondaryApp = initializeApp(firebaseConfig, 'secondary-vendor-auth');
  return getAuth(secondaryApp);
};

interface AdminPanelProps {
  vendors: Vendor[];
  posts: Post[];
  bookings: Booking[];
  users: UserAccount[];
  messages: Message[];
  onAddVendor: (vendor: Vendor) => void;
  onUpdateVendor: (vendor: Vendor) => void;
  onRemoveVendor: (id: string) => void;
  onToggleVerify: (id: string) => void;
  onUpdateBookingStatus: (id: string, status: Booking['status']) => void;
  onLoginAsVendor: (id: string) => void;
  onAddPost: (post: Post) => void;
  onRemovePost: (id: string) => void;
  onBack: () => void;
  categoryImages: Record<string, string>;
  onUpdateCategoryImage: (category: string, url: string) => void;
  categories: string[];
  onAddCategory: (name: string, image: string, subCats: string[]) => void;
  categorySubCategories: Record<string, Record<string, string[]>>;
  onUpdateCategorySubCategories: (category: string, subCategories: Record<string, string[]>) => void;
  subCategoryImages?: Record<string, string>;
  onUpdateSubCategoryImage?: (subCategory: string, url: string) => void;
  heroBackgroundUrl: string;
  onUpdateHeroBackground: (url: string) => void;
  heroImages?: HeroImage[];
  onAddHeroImage?: (image: HeroImage) => void;
  onDeleteHeroImage?: (id: string) => void;
  onUpdateHeroImages?: (images: HeroImage[]) => void;
  onSendMessage: (payload: Partial<Message>) => void;
  showNotification: (message: string, type?: 'success' | 'info' | 'error') => void;
  onSeedTaxonomy?: () => Promise<void>;
  onUpdateCategoryOrder: (orderedCategories: string[]) => void;
  onDeleteCategory?: (name: string) => void;
  onActiveChatChange?: (isActive: boolean) => void;
  maxSearchDates?: number;
  searchDateResetHours?: number;
  onUpdateSearchCalendarSettings?: (settings: { maxSearchDates: number; searchDateResetHours: number; resetAllNow?: boolean }) => Promise<void> | void;
}

const FALLBACK_HERO_IMAGES: HeroImage[] = [
  {
    id: 'hero-chuppah-canopy',
    name: 'Traditional Chuppah Canopy',
    url: 'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?ixlib=rb-1.2.1&auto=format&fit=crop&w=1950&q=80',
    uploadedAt: '2026-01-01T00:00:00.000Z',
    isDefault: true,
  },
  {
    id: 'hero-grand-hall',
    name: 'Grand Celebration Hall',
    url: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=1950',
    uploadedAt: '2026-01-02T00:00:00.000Z',
    isDefault: true,
  },
  {
    id: 'hero-simcha-garden',
    name: 'Enchanted Simcha Garden',
    url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=80&w=1950',
    uploadedAt: '2026-01-03T00:00:00.000Z',
    isDefault: true,
  },
  {
    id: 'hero-dance-lights',
    name: 'Celebration Dance & Lights',
    url: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&q=80&w=1950',
    uploadedAt: '2026-01-04T00:00:00.000Z',
    isDefault: true,
  },
  {
    id: 'hero-stone-courtyard',
    name: 'Jerusalem Stone Courtyard',
    url: 'https://images.unsplash.com/photo-1544077960-604201fe74bc?auto=format&fit=crop&q=80&w=1950',
    uploadedAt: '2026-01-05T00:00:00.000Z',
    isDefault: true,
  },
];

const COMMISSION_RATE = 0.10;

const isVideo = (url?: string | null) => {
  if (!url) return false;
  return !!(
    url.startsWith('data:video/') ||
    url.match(/\.(mp4|webm|ogg|mov|m4v|avi|ogv)(?:\?|$|%)/i) ||
    url.includes('video%2F') ||
    url.includes('video/')
  );
};

const renderMedia = (url: string | undefined | null, className: string, defaultContent?: React.ReactNode) => {
  if (!url) return defaultContent || null;
  if (isVideo(url)) {
    return <video controls autoPlay muted loop playsInline src={url} className={className} />;
  }
  return <img src={url} className={className} alt="" />;
};

type AdminTab = 'overview' | 'vendors' | 'bookings' | 'categories' | 'visuals' | 'messages' | 'users';

const AdminPanel: React.FC<AdminPanelProps> = ({
  vendors, posts, bookings, users, messages, onAddVendor, onUpdateVendor, onRemoveVendor,
  onToggleVerify, onUpdateBookingStatus, onLoginAsVendor, onAddPost, onRemovePost, onBack,
  categoryImages, onUpdateCategoryImage, categories, onAddCategory, categorySubCategories,
  onUpdateCategorySubCategories, subCategoryImages = {}, onUpdateSubCategoryImage,
  heroBackgroundUrl, onUpdateHeroBackground, heroImages = [], onAddHeroImage, onDeleteHeroImage,
  onUpdateHeroImages, onSendMessage, showNotification, onSeedTaxonomy, onUpdateCategoryOrder,
  onDeleteCategory, onActiveChatChange, maxSearchDates = 4, searchDateResetHours = 24,
  onUpdateSearchCalendarSettings
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [isUploading, setIsUploading] = useState(false);
  const [isSeedingTaxonomy, setIsSeedingTaxonomy] = useState(false);
  const [localMaxSearchDates, setLocalMaxSearchDates] = useState<number>(maxSearchDates);
  const [localSearchDateResetHours, setLocalSearchDateResetHours] = useState<number>(searchDateResetHours);

  useEffect(() => {
    setLocalMaxSearchDates(maxSearchDates);
  }, [maxSearchDates]);

  useEffect(() => {
    setLocalSearchDateResetHours(searchDateResetHours);
  }, [searchDateResetHours]);

  // Hero Background Library State
  const [localHeroImages, setLocalHeroImages] = useState<HeroImage[]>(() => {
    if (heroImages && heroImages.length > 0) return heroImages;
    return FALLBACK_HERO_IMAGES;
  });

  useEffect(() => {
    if (heroImages && heroImages.length > 0) {
      setLocalHeroImages(heroImages);
    }
  }, [heroImages]);

  const allDisplayHeroImages = useMemo(() => {
    const map = new Map<string, HeroImage>();
    FALLBACK_HERO_IMAGES.forEach(img => map.set(img.url, img));
    localHeroImages.forEach(img => map.set(img.url, img));
    return Array.from(map.values());
  }, [localHeroImages]);

  // Optimistic Local States for Taxonomy
  const [localCategories, setLocalCategories] = useState<string[]>(categories);
  const [localCategorySubCategories, setLocalCategorySubCategories] = useState<Record<string, Record<string, string[]>>>(categorySubCategories);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);

  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  useEffect(() => {
    setLocalCategorySubCategories(categorySubCategories);
  }, [categorySubCategories]);

  // Upload Previews and Progress
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [uploadProgresses, setUploadProgresses] = useState<Record<string, number>>({});

  // Search & Filter states
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorCategoryFilter, setVendorCategoryFilter] = useState<string>('ALL');
  const [vendorVerifyFilter, setVendorVerifyFilter] = useState<'all' | 'verified' | 'unverified'>('all');

  const [bookingSearch, setBookingSearch] = useState('');
  const [bookingStatusFilter, setBookingStatusFilter] = useState<'all' | 'confirmed' | 'pending' | 'cancelled' | 'paid'>('all');

  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'client' | 'vendor' | 'admin'>('all');

  // Selected items for drag-dismiss sheets
  const [selectedVendorForSheet, setSelectedVendorForSheet] = useState<Vendor | null>(null);
  const [isCreatingNewVendor, setIsCreatingNewVendor] = useState(false);
  const [confirmDeleteVendorId, setConfirmDeleteVendorId] = useState<string | null>(null);
  const [confirmResetStripeVendorId, setConfirmResetStripeVendorId] = useState<string | null>(null);
  const [manualStripeInput, setManualStripeInput] = useState<string>('');
  const [showManualStripeInput, setShowManualStripeInput] = useState(false);

  const [selectedBookingForSheet, setSelectedBookingForSheet] = useState<Booking | null>(null);
  const [editingBookingAmount, setEditingBookingAmount] = useState<string>('');
  const [editingBookingDate, setEditingBookingDate] = useState<string>('');
  const [confirmDeleteBookingId, setConfirmDeleteBookingId] = useState<string | null>(null);

  const [selectedUserForSheet, setSelectedUserForSheet] = useState<UserAccount | null>(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);

  // Quick Whitelist / Invite Vendor state
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInvitingVendor, setIsInvitingVendor] = useState(false);
  const [vendorUserRoles, setVendorUserRoles] = useState<Array<{ id: string; email?: string; role: string; updatedAt?: string; createdAt?: string; invitedAt?: string; isInvite?: boolean }>>([]);
  const [isRunningCleanup, setIsRunningCleanup] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<null | {
    deletedUserRolesCount: number;
    deletedUsersCount: number;
    deletedVendorsCount: number;
    deletedPostsCount: number;
    activeAuthUsersCount: number;
  }>(null);

  // Messages & Conversations state
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedInquiryEmail, setSelectedInquiryEmail] = useState<string | null>(null);
  const [convoSearchQuery, setConvoSearchQuery] = useState('');
  const [convoReadFilter, setConvoReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [locallyReadThreadCids, setLocallyReadThreadCids] = useState<Set<string>>(new Set());

  useEffect(() => {
    onActiveChatChange?.(Boolean(selectedConversationId));
    return () => {
      onActiveChatChange?.(false);
    };
  }, [selectedConversationId, onActiveChatChange]);

  // Analytics state
  const [analyticsLogs, setAnalyticsLogs] = useState<any[]>([]);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Forms
  const [formData, setFormData] = useState({
    name: '',
    category: categories[0] || 'Catering',
    subCategories: [] as string[],
    description: '',
    priceStart: '',
    location: '',
    image: '',
    username: '',
    password: '',
    contactEmail: '',
    commissionRate: '10',
    kosherStatus: 'Kosher Certified',
    isVerified: true
  });

  const [postForm, setPostForm] = useState({
    title: '', description: '', url: '', type: 'image' as 'image' | 'video', vendorId: ''
  });
  const [showMomentModal, setShowMomentModal] = useState(false);

  const [newCategoryForm, setNewCategoryForm] = useState({
    name: '', image: '', subCatsString: ''
  });

  const [newSubCategoryInputs, setNewSubCategoryInputs] = useState<Record<string, string>>({});
  const [newNestedSubCategoryInputs, setNewNestedSubCategoryInputs] = useState<Record<string, string>>({});

  // Refs
  const postFileInputRef = useRef<HTMLInputElement>(null);
  const vendorFileInputRef = useRef<HTMLInputElement>(null);
  const heroFileInputRef = useRef<HTMLInputElement>(null);
  const categoryImageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const subCategoryImageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const newCatImageInputRef = useRef<HTMLInputElement | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(false);

  // Drag dismiss hooks for sheets
  const vendorSheetDrag = useModalDragDismiss(() => {
    setSelectedVendorForSheet(null);
    setIsCreatingNewVendor(false);
    setConfirmDeleteVendorId(null);
    setConfirmResetStripeVendorId(null);
    setShowManualStripeInput(false);
  });

  const bookingSheetDrag = useModalDragDismiss(() => {
    setSelectedBookingForSheet(null);
    setConfirmDeleteBookingId(null);
  });

  const userSheetDrag = useModalDragDismiss(() => {
    setSelectedUserForSheet(null);
    setConfirmDeleteUserId(null);
  });

  const addCategoryModalDrag = useModalDragDismiss(() => {
    setShowAddCategoryModal(false);
  });

  const momentModalDrag = useModalDragDismiss(() => {
    setShowMomentModal(false);
  });

  useEffect(() => {
    if (selectedVendorForSheet || isCreatingNewVendor) {
      return vendorSheetDrag.triggerSlideUpEntry();
    }
  }, [Boolean(selectedVendorForSheet || isCreatingNewVendor)]);

  useEffect(() => {
    if (selectedBookingForSheet) {
      return bookingSheetDrag.triggerSlideUpEntry();
    }
  }, [Boolean(selectedBookingForSheet)]);

  useEffect(() => {
    if (selectedUserForSheet) {
      return userSheetDrag.triggerSlideUpEntry();
    }
  }, [Boolean(selectedUserForSheet)]);

  useEffect(() => {
    if (showAddCategoryModal) {
      return addCategoryModalDrag.triggerSlideUpEntry();
    }
  }, [showAddCategoryModal]);

  useEffect(() => {
    if (showMomentModal) {
      return momentModalDrag.triggerSlideUpEntry();
    }
  }, [showMomentModal]);

  // Listen to user_roles
  useEffect(() => {
    const q = query(collection(db, 'user_roles'), where('role', '==', 'vendor'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const roles = snapshot.docs.map(d => ({
        id: d.id,
        ...(d.data() as any)
      }));
      setVendorUserRoles(roles);
    }, (err) => {
      console.warn('Error fetching vendor roles:', err);
    });
    return () => unsubscribe();
  }, []);

  // Listen to analytics_logs when on overview
  useEffect(() => {
    if (activeTab === 'overview') {
      setIsLoadingAnalytics(true);
      const q = query(collection(db, 'analytics_logs'), orderBy('timestamp', 'desc'), limit(200));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const logs = snapshot.docs.map(d => ({
          id: d.id,
          ...d.data()
        }));
        setAnalyticsLogs(logs);
        setIsLoadingAnalytics(false);
      }, () => {
        setIsLoadingAnalytics(false);
      });
      return () => unsubscribe();
    }
  }, [activeTab]);

  // Sync selectedVendorForSheet with live vendor updates
  useEffect(() => {
    if (selectedVendorForSheet) {
      const updated = vendors.find(v => v.id === selectedVendorForSheet.id);
      if (updated) {
        setSelectedVendorForSheet(updated);
      }
    }
  }, [vendors]);

  // Sync selectedBookingForSheet with live booking updates
  useEffect(() => {
    if (selectedBookingForSheet) {
      const updated = bookings.find(b => b.id === selectedBookingForSheet.id);
      if (updated) {
        setSelectedBookingForSheet(updated);
      }
    }
  }, [bookings]);

  // Sync selectedUserForSheet with live user updates
  useEffect(() => {
    if (selectedUserForSheet) {
      const updated = users.find(u => u.id === selectedUserForSheet.id);
      if (updated) {
        setSelectedUserForSheet(updated);
      }
    }
  }, [users]);

  const analyticsStats = useMemo(() => {
    const counts = {
      view_vendor: 0,
      add_to_plan: 0,
      submit_booking_request: 0,
      payment_completed: 0
    };
    analyticsLogs.forEach(log => {
      if (counts[log.eventName as keyof typeof counts] !== undefined) {
        counts[log.eventName as keyof typeof counts]++;
      }
    });
    const planRate = counts.view_vendor > 0 ? (counts.add_to_plan / counts.view_vendor) * 100 : 0;
    const requestRate = counts.add_to_plan > 0 ? (counts.submit_booking_request / counts.add_to_plan) * 100 : 0;
    const purchaseRate = counts.submit_booking_request > 0 ? (counts.payment_completed / counts.submit_booking_request) * 100 : 0;
    const overallRate = counts.view_vendor > 0 ? (counts.payment_completed / counts.view_vendor) * 100 : 0;

    return {
      ...counts,
      planRate,
      requestRate,
      purchaseRate,
      overallRate
    };
  }, [analyticsLogs]);

  const bookingChartData = useMemo(() => {
    const last14Days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      return d.toISOString().split('T')[0];
    });
    const countsByDate: Record<string, number> = {};
    last14Days.forEach(date => { countsByDate[date] = 0; });

    analyticsLogs.forEach(log => {
      if (log.eventName === 'submit_booking_request' && log.timestamp) {
        const dateStr = new Date(log.timestamp).toISOString().split('T')[0];
        if (countsByDate[dateStr] !== undefined) {
          countsByDate[dateStr]++;
        }
      }
    });

    return last14Days.map(date => {
      const [, month, day] = date.split('-');
      return {
        date: `${month}/${day}`,
        requests: countsByDate[date]
      };
    });
  }, [analyticsLogs]);

  const paidBookings = useMemo(() => bookings.filter(b => b.paymentStatus === 'paid'), [bookings]);
  const totalPaidVolume = useMemo(() => paidBookings.reduce((sum, b) => sum + b.amount, 0), [paidBookings]);
  const totalCommission = useMemo(() => paidBookings.reduce((sum, b) => {
    const vendor = vendors.find(v => v.id === b.vendorId);
    const rate = vendor?.commissionRate !== undefined ? vendor.commissionRate / 100 : COMMISSION_RATE;
    return sum + (b.amount * rate);
  }, 0), [paidBookings, vendors]);

  // Process Admin Support Messages & Unread Count
  const processedSupportThreads = useMemo(() => {
    const isLegacySupportMessage = (m: Message) => {
      const isDirectSupport =
        m.senderId === 'admin' ||
        m.receiverId === 'admin' ||
        m.isAdminInquiry === true ||
        (m.conversationId && m.conversationId.includes('admin'));
      if (!isDirectSupport) return false;
      const isAutomatedNotification =
        Boolean((m as any).bookingId) ||
        Boolean((m as any).eventType) ||
        m.senderId === 'system' ||
        (typeof m.text === 'string' && m.text.startsWith('New Booking Request:'));
      return !isAutomatedNotification;
    };

    const allAdminSupportMessages = messages.filter(isLegacySupportMessage);

    const getOtherUserId = (m: Message) => {
      if (m.senderId === 'admin') {
        if (m.receiverId && m.receiverId !== 'admin' && m.receiverId !== 'client_legacy') return m.receiverId;
        if (m.clientEmail) return m.clientEmail;
      } else {
        if (m.senderId && m.senderId !== 'client_legacy') return m.senderId;
        if (m.clientEmail) return m.clientEmail;
      }
      if (m.conversationId && m.conversationId !== 'admin_client_legacy') {
        const parts = m.conversationId.split('_').filter(p => p !== 'admin' && p !== 'support' && p !== 'client' && p !== 'legacy');
        if (parts.length > 0) return parts.join('_');
      }
      return m.clientEmail || m.senderId || m.receiverId || 'unknown';
    };

    const getOtherUserDetails = (id: string, m: Message) => {
      const normalizedId = (id || '').trim().toLowerCase();
      const normalizedClientEmail = (m.clientEmail || '').trim().toLowerCase();

      const foundUser = users.find(u => {
        const uEmail = ((u as any).email || (u as any).username || '').trim().toLowerCase();
        return (
          (id && id !== 'client_legacy' && u.id === id) ||
          (normalizedId && normalizedId !== 'client_legacy' && uEmail === normalizedId) ||
          (normalizedClientEmail && uEmail === normalizedClientEmail)
        );
      });
      if (foundUser) {
        const resolvedEmail = (foundUser as any).email || (foundUser as any).username || m.clientEmail || (id.includes('@') ? id : '');
        const resolvedName = foundUser.name || m.clientName || (resolvedEmail ? resolvedEmail.split('@')[0] : 'Client');
        return { id: foundUser.id, name: resolvedName, email: resolvedEmail, role: 'client' as const, avatar: foundUser.photoURL };
      }

      const foundVendor = vendors.find(v => {
        const vEmail = (v.contactEmail || v.username || '').trim().toLowerCase();
        return (
          (id && id !== 'client_legacy' && v.id === id) ||
          (normalizedId && normalizedId !== 'client_legacy' && vEmail === normalizedId) ||
          (normalizedClientEmail && vEmail === normalizedClientEmail)
        );
      });
      if (foundVendor) {
        return { id: foundVendor.id, name: foundVendor.name, email: foundVendor.contactEmail || m.clientEmail || '', role: 'vendor' as const, avatar: foundVendor.image };
      }

      const fallbackEmail = m.clientEmail || (id && id.includes('@') ? id : '');
      const fallbackName = m.clientName || (fallbackEmail ? fallbackEmail.split('@')[0] : (id && id !== 'client_legacy' ? id : 'Client'));
      return {
        id: id && id !== 'client_legacy' ? id : (fallbackEmail || 'client_legacy'),
        name: fallbackName,
        email: fallbackEmail,
        role: 'client' as const,
        avatar: (m as any).senderPhoto
      };
    };

    type ConversationBucket = {
      cid: string;
      cids: Set<string>;
      isAdminSupport: boolean;
      clientDetails: { id: string; name: string; email: string; avatar?: string };
      otherUser: { id: string; name: string; email: string; role: 'client' | 'vendor'; avatar?: string };
      messages: Message[];
      msg: Message;
    };

    const buckets: ConversationBucket[] = [];

    allAdminSupportMessages.forEach(m => {
      const rawCid = m.conversationId || [m.senderId, m.receiverId].sort().join('_');
      const rawOther = m.senderId === 'admin' ? m.receiverId : m.senderId;
      const msgEmailLower = (m.clientEmail || (rawOther && rawOther.includes('@') ? rawOther : '')).trim().toLowerCase();

      const matchedAccount = users.find(u => {
        const uEmail = ((u as any).email || (u as any).username || '').trim().toLowerCase();
        if (rawOther && rawOther !== 'client_legacy' && rawOther !== 'admin' && u.id === rawOther) return true;
        if (msgEmailLower && uEmail === msgEmailLower) return true;
        if (rawCid && rawCid !== 'admin_client_legacy' && rawCid.includes(u.id)) return true;
        return false;
      });

      const resolvedUid = matchedAccount?.id || (rawOther && rawOther !== 'client_legacy' && rawOther !== 'admin' && !rawOther.includes('@') ? rawOther : '');
      const resolvedEmail = (matchedAccount as any)?.email || (matchedAccount as any)?.username || m.clientEmail || (rawOther && rawOther.includes('@') ? rawOther : '');
      const resolvedEmailLower = (resolvedEmail || '').trim().toLowerCase();
      const resolvedName = matchedAccount?.name || m.clientName || (resolvedEmail ? resolvedEmail.split('@')[0] : 'Client');
      const resolvedAvatar = matchedAccount?.photoURL || (m as any).senderPhoto;

      const canonicalCid = resolvedUid
        ? ['admin', resolvedUid].sort().join('_')
        : (resolvedEmailLower ? `admin_${resolvedEmailLower}` : rawCid);

      const clientDetails = {
        id: resolvedUid || resolvedEmailLower || rawOther || 'client_legacy',
        name: resolvedName,
        email: resolvedEmail,
        avatar: resolvedAvatar
      };

      const otherUser = {
        id: resolvedUid || rawOther || resolvedEmail,
        name: resolvedName,
        email: resolvedEmail,
        role: 'client' as const,
        avatar: resolvedAvatar
      };

      let bucket = buckets.find(b => {
        const bClientUid = b.clientDetails.id && b.clientDetails.id !== 'client_legacy' && b.clientDetails.id !== 'admin' && !b.clientDetails.id.includes('@') ? b.clientDetails.id : '';
        const bEmailLower = (b.clientDetails.email || '').trim().toLowerCase();
        if (resolvedUid && bClientUid && resolvedUid === bClientUid) return true;
        if (resolvedEmailLower && bEmailLower && resolvedEmailLower === bEmailLower) return true;
        if (b.cids.has(rawCid) || b.cids.has(canonicalCid)) return true;
        return false;
      });

      if (!bucket) {
        bucket = {
          cid: canonicalCid,
          cids: new Set([rawCid, canonicalCid]),
          isAdminSupport: true,
          clientDetails,
          otherUser,
          messages: [],
          msg: { ...m, conversationId: canonicalCid }
        };
        buckets.push(bucket);
      } else {
        bucket.cids.add(rawCid);
        bucket.cids.add(canonicalCid);
        if (bucket.cid.includes('client_legacy') && !canonicalCid.includes('client_legacy')) {
          bucket.cid = canonicalCid;
        }
        if ((!bucket.clientDetails.id || bucket.clientDetails.id === 'client_legacy') && resolvedUid) {
          bucket.clientDetails.id = resolvedUid;
        }
        if (!bucket.clientDetails.email && resolvedEmail) {
          bucket.clientDetails.email = resolvedEmail;
        }
        if ((bucket.clientDetails.name === 'Client' || bucket.clientDetails.name === 'User') && resolvedName !== 'Client') {
          bucket.clientDetails.name = resolvedName;
        }
        if (!bucket.clientDetails.avatar && resolvedAvatar) {
          bucket.clientDetails.avatar = resolvedAvatar;
        }
        if ((!bucket.otherUser.id || bucket.otherUser.id === 'client_legacy') && otherUser.id && otherUser.id !== 'client_legacy') {
          bucket.otherUser = otherUser;
        }
      }

      bucket.messages.push(m);
    });

    const list = buckets.map(bucket => {
      bucket.messages.sort((a, b) => {
        const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tA - tB;
      });
      const latest = bucket.messages[bucket.messages.length - 1] || bucket.msg;
      const msg = { ...latest, conversationId: bucket.cid };
      const isLocallyMarkedRead = locallyReadThreadCids.has(bucket.cid) || Array.from(bucket.cids).some(c => locallyReadThreadCids.has(c));
      const hasUnread = !isLocallyMarkedRead && bucket.messages.some(m => m.senderId !== 'admin' && !m.isRead);

      return {
        msg,
        cid: bucket.cid,
        cids: bucket.cids,
        messages: bucket.messages,
        isAdminSupport: true,
        hasUnread,
        clientDetails: bucket.clientDetails,
        otherUser: bucket.otherUser
      };
    });

    list.sort((a, b) => {
      const timeA = a.msg.timestamp ? new Date(a.msg.timestamp).getTime() : 0;
      const timeB = b.msg.timestamp ? new Date(b.msg.timestamp).getTime() : 0;
      return timeB - timeA;
    });

    return {
      list,
      allAdminSupportMessages,
      getOtherUserId,
      getOtherUserDetails,
      unreadCount: list.filter(t => t.hasUnread).length
    };
  }, [messages, users, vendors, locallyReadThreadCids]);

  // Handlers
  const handleOpenNewVendorModal = () => {
    setFormData({
      name: '',
      category: categories[0] || 'Catering',
      subCategories: [],
      description: '',
      priceStart: '',
      location: '',
      image: '',
      username: '',
      password: '',
      contactEmail: '',
      commissionRate: '10',
      kosherStatus: 'Kosher Certified',
      isVerified: true
    });
    setSelectedVendorForSheet(null);
    setIsCreatingNewVendor(true);
  };

  const handleOpenEditVendorModal = (vendor: Vendor) => {
    setFormData({
      name: vendor.name || '',
      category: vendor.category || categories[0] || 'Catering',
      subCategories: vendor.subCategories || [],
      description: vendor.description || '',
      priceStart: (vendor.downPayment ?? vendor.priceStart) > 0 ? (vendor.downPayment ?? vendor.priceStart).toString() : '',
      location: vendor.location || '',
      image: vendor.image || '',
      username: vendor.username || '',
      password: vendor.password || '',
      contactEmail: vendor.contactEmail || '',
      commissionRate: (vendor.commissionRate ?? 10).toString(),
      kosherStatus: vendor.isKosher === false ? 'Non-Kosher' : 'Kosher Certified',
      isVerified: vendor.isVerified ?? true
    });
    setManualStripeInput(vendor.stripeAccountId || '');
    setShowManualStripeInput(false);
    setConfirmDeleteVendorId(null);
    setConfirmResetStripeVendorId(null);
    setIsCreatingNewVendor(false);
    setSelectedVendorForSheet(vendor);
  };

  const handleVendorFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const downloadUrl = await uploadFileRobustly(file, 'vendors');
      setFormData(prev => ({ ...prev, image: downloadUrl }));
      showNotification('Vendor photo uploaded.', 'success');
    } catch {
      showNotification('Failed to upload image.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const toggleSubCategorySelection = (subCat: string) => {
    setFormData(prev => {
      const current = prev.subCategories;
      const updated = current.includes(subCat)
        ? current.filter(item => item !== subCat)
        : [...current, subCat];
      return { ...prev, subCategories: updated };
    });
  };

  const handleStripeOnboard = async (vendorId: string, email: string) => {
    setIsOnboarding(true);
    try {
      const response = await fetch('/api/stripe/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId,
          email: email || 'vendor@simchamarket.com',
          origin: window.location.origin
        })
      });
      const contentType = response.headers.get('content-type');
      let data: any;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        throw new Error('Stripe server error');
      }
      if (!response.ok) throw new Error(data.error || 'Failed to start Stripe onboarding');

      const vendorToUpdate = vendors.find(v => v.id === vendorId);
      if (vendorToUpdate && data.accountId) {
        onUpdateVendor({
          ...vendorToUpdate,
          stripeAccountId: data.accountId
        });
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      showNotification(err.message || 'Stripe onboarding error', 'error');
    } finally {
      setIsOnboarding(false);
    }
  };

  const handleSaveManualStripeId = (vendor: Vendor) => {
    const trimmed = manualStripeInput.trim();
    onUpdateVendor({
      ...vendor,
      stripeAccountId: trimmed || undefined
    });
    setShowManualStripeInput(false);
    showNotification(trimmed ? 'Stripe Account ID updated.' : 'Stripe Account ID cleared.', 'success');
  };

  const handleResetVendorStripe = (vendor: Vendor) => {
    onUpdateVendor({
      ...vendor,
      stripeAccountId: undefined
    });
    setConfirmResetStripeVendorId(null);
    setManualStripeInput('');
    showNotification(`Disconnected Stripe for ${vendor.name}.`, 'info');
  };

  const handleVendorSubmit = async (e: React.FormEvent, startStripe = false) => {
    e.preventDefault();
    if (!formData.location || !formData.location.trim()) {
      showNotification('Please enter a location for this vendor.', 'error');
      return;
    }

    const parsedDownPayment = formData.priceStart !== '' ? Math.max(0, Number(formData.priceStart)) : 0;

    if (selectedVendorForSheet && !isCreatingNewVendor) {
      const updatedVendor: Vendor = {
        ...selectedVendorForSheet,
        name: formData.name,
        category: formData.category,
        subCategories: formData.subCategories,
        description: formData.description,
        priceStart: parsedDownPayment,
        downPayment: parsedDownPayment,
        location: formData.location,
        image: formData.image || selectedVendorForSheet.image,
        username: formData.username,
        password: formData.password,
        contactEmail: formData.contactEmail,
        commissionRate: Number(formData.commissionRate),
        isKosher: formData.kosherStatus === 'Kosher Certified',
        isVerified: formData.isVerified
      };
      onUpdateVendor(updatedVendor);
      showNotification(`${updatedVendor.name} updated.`, 'success');
      if (startStripe) {
        await handleStripeOnboard(updatedVendor.id, updatedVendor.contactEmail || '');
      } else {
        setSelectedVendorForSheet(null);
      }
    } else {
      let vendorId = Math.random().toString(36).substr(2, 9);
      const emailToRegister = formData.contactEmail?.trim() || (formData.username?.includes('@') ? formData.username.trim() : '');
      const passwordToRegister = formData.password?.trim() || 'SimchaVendor123!';

      if (emailToRegister && passwordToRegister) {
        try {
          const secondaryAuth = getSecondaryAuth();
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, emailToRegister, passwordToRegister);
          vendorId = userCredential.user.uid;
          await signOut(secondaryAuth);
        } catch (authErr: any) {
          if (authErr.code === 'auth/email-already-in-use') {
            const existingUser = users.find(u => ((u as any).email || u.username)?.toLowerCase() === emailToRegister.toLowerCase());
            if (existingUser) vendorId = existingUser.id;
          }
        }
      }

      const newVendor: Vendor = {
        id: vendorId,
        name: formData.name,
        category: formData.category,
        subCategories: formData.subCategories,
        description: formData.description,
        priceStart: parsedDownPayment,
        downPayment: parsedDownPayment,
        rating: 5.0,
        isKosher: formData.kosherStatus === 'Kosher Certified',
        isVerified: formData.isVerified,
        image: formData.image || 'https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&q=80&w=1000',
        location: formData.location,
        reviews: [],
        unavailableDates: [],
        username: formData.username || emailToRegister,
        password: formData.password,
        contactEmail: formData.contactEmail || emailToRegister,
        commissionRate: Number(formData.commissionRate)
      };

      onAddVendor(newVendor);
      showNotification(`${newVendor.name} added to marketplace.`, 'success');
      if (startStripe) {
        await handleStripeOnboard(newVendor.id, newVendor.contactEmail || '');
      } else {
        setIsCreatingNewVendor(false);
      }
    }
  };

  const handleConfirmDeleteVendor = async (vendor: Vendor) => {
    try {
      await deleteDoc(doc(db, 'user_roles', vendor.id)).catch(() => {});
      await deleteDoc(doc(db, 'users', vendor.id)).catch(() => {});
      onRemoveVendor(vendor.id);
      setSelectedVendorForSheet(null);
      setConfirmDeleteVendorId(null);
      showNotification(`Removed ${vendor.name}.`, 'info');
    } catch {
      onRemoveVendor(vendor.id);
      setSelectedVendorForSheet(null);
      setConfirmDeleteVendorId(null);
    }
  };

  // Booking sheet handlers
  const handleOpenBookingSheet = (booking: Booking) => {
    setSelectedBookingForSheet(booking);
    setEditingBookingAmount(booking.amount.toString());
    setEditingBookingDate(booking.date || '');
    setConfirmDeleteBookingId(null);
  };

  const handleSaveBookingDetails = async () => {
    if (!selectedBookingForSheet) return;
    const parsedAmount = Math.max(0, Number(editingBookingAmount) || 0);
    try {
      await updateDoc(doc(db, 'bookings', selectedBookingForSheet.id), {
        amount: parsedAmount,
        date: editingBookingDate.trim() || selectedBookingForSheet.date
      });
      showNotification('Booking details updated.', 'success');
    } catch (err: any) {
      showNotification('Failed to update booking: ' + (err.message || ''), 'error');
    }
  };

  const handleToggleBookingPaymentStatus = async (booking: Booking) => {
    const nextPaymentStatus = booking.paymentStatus === 'paid' ? 'unpaid' : 'paid';
    try {
      await updateDoc(doc(db, 'bookings', booking.id), {
        paymentStatus: nextPaymentStatus
      });
      showNotification(`Payment status marked as ${nextPaymentStatus}.`, 'success');
    } catch (err: any) {
      showNotification('Failed to update payment status: ' + (err.message || ''), 'error');
    }
  };

  const handleDeleteBooking = async (bookingId: string) => {
    try {
      await deleteDoc(doc(db, 'bookings', bookingId));
      setSelectedBookingForSheet(null);
      setConfirmDeleteBookingId(null);
      showNotification('Booking deleted.', 'info');
    } catch (err: any) {
      showNotification('Failed to delete booking: ' + (err.message || ''), 'error');
    }
  };

  // User Role & Account Management
  const handleChangeUserRole = async (userAcc: UserAccount, nextRole: 'client' | 'vendor' | 'admin') => {
    try {
      const email = ((userAcc as any).email || userAcc.username || '').trim().toLowerCase();
      await updateDoc(doc(db, 'users', userAcc.id), {
        role: nextRole,
        updatedAt: new Date().toISOString()
      });
      await setDoc(doc(db, 'user_roles', userAcc.id), {
        role: nextRole,
        email,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      showNotification(`Updated ${userAcc.name || email || 'user'} role to ${nextRole.toUpperCase()}.`, 'success');
    } catch (err: any) {
      showNotification('Failed to update role: ' + (err.message || ''), 'error');
    }
  };

  const handleDeleteUserAccount = async (userAcc: UserAccount) => {
    try {
      await deleteDoc(doc(db, 'users', userAcc.id)).catch(() => {});
      await deleteDoc(doc(db, 'user_roles', userAcc.id)).catch(() => {});
      setSelectedUserForSheet(null);
      setConfirmDeleteUserId(null);
      showNotification(`Deleted user record for ${userAcc.name || userAcc.username || userAcc.id}.`, 'info');
    } catch (err: any) {
      showNotification('Failed to delete user: ' + (err.message || ''), 'error');
    }
  };

  const handleInviteVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = inviteEmail.trim().toLowerCase();
    if (!cleanEmail) return;
    setIsInvitingVendor(true);
    try {
      const existingUser = users.find(
        u => ((u as any).email || (u as any).username || '').trim().toLowerCase() === cleanEmail
      );
      if (existingUser) {
        await setDoc(doc(db, 'user_roles', existingUser.id), {
          role: 'vendor',
          email: cleanEmail,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        await updateDoc(doc(db, 'users', existingUser.id), {
          role: 'vendor'
        }).catch(() => {});
        showNotification(`Elevated ${cleanEmail} to Vendor.`, 'success');
      } else {
        const inviteDocId = `invite_${cleanEmail.replace(/[^a-z0-9]/g, '_')}`;
        await setDoc(doc(db, 'user_roles', inviteDocId), {
          role: 'vendor',
          email: cleanEmail,
          invitedAt: new Date().toISOString(),
          isInvite: true
        }, { merge: true });
        showNotification(`Pre-authorized ${cleanEmail} for Vendor access.`, 'success');
      }
      setInviteEmail('');
    } catch (err: any) {
      showNotification('Failed to assign vendor role: ' + (err.message || ''), 'error');
    } finally {
      setIsInvitingVendor(false);
    }
  };

  const handleRunOrphanedCleanup = async () => {
    setIsRunningCleanup(true);
    setCleanupResult(null);
    try {
      let idToken = '';
      if (auth.currentUser) {
        idToken = await auth.currentUser.getIdToken();
      }
      const response = await fetch('/api/admin/cleanup-orphaned-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {})
        }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Cleanup failed');
      }
      setCleanupResult(data.summary);
      const totalRemoved =
        (data.summary?.deletedUserRolesCount || 0) +
        (data.summary?.deletedUsersCount || 0) +
        (data.summary?.deletedVendorsCount || 0) +
        (data.summary?.deletedPostsCount || 0);
      showNotification(
        totalRemoved > 0
          ? `Cleanup complete: Removed ${totalRemoved} orphaned record(s).`
          : 'Database is clean! Zero orphaned records found.',
        'success'
      );
    } catch (err: any) {
      showNotification(err.message || 'Failed to clean up orphaned data.', 'error');
    } finally {
      setIsRunningCleanup(false);
    }
  };

  // Hero & Visuals Handlers
  const handleHeroFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const downloadUrl = await uploadFileRobustly(file, 'hero');
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      const newHeroImage: HeroImage = {
        id: `hero-${Date.now()}`,
        name: baseName ? baseName.charAt(0).toUpperCase() + baseName.slice(1) : 'Uploaded Hero Image',
        url: downloadUrl,
        uploadedAt: new Date().toISOString(),
        isDefault: false,
      };
      const nextImages = [newHeroImage, ...localHeroImages];
      setLocalHeroImages(nextImages);
      if (onAddHeroImage) {
        onAddHeroImage(newHeroImage);
      } else if (onUpdateHeroImages) {
        onUpdateHeroImages(nextImages);
      }
      onUpdateHeroBackground(downloadUrl);
      showNotification('Hero background uploaded and set active.', 'success');
    } catch {
      showNotification('Failed to upload hero image.', 'error');
    } finally {
      setIsUploading(false);
      if (heroFileInputRef.current) heroFileInputRef.current.value = '';
    }
  };

  const handleSelectHeroImage = (img: HeroImage) => {
    onUpdateHeroBackground(img.url);
    showNotification(`Active background set to "${img.name}".`, 'success');
  };

  const handleRemoveHeroImageFromLibrary = (img: HeroImage, e: React.MouseEvent) => {
    e.stopPropagation();
    if (img.isDefault) {
      showNotification('Default backgrounds cannot be deleted.', 'info');
      return;
    }
    const nextImages = localHeroImages.filter(item => item.id !== img.id && item.url !== img.url);
    setLocalHeroImages(nextImages);
    if (onDeleteHeroImage) {
      onDeleteHeroImage(img.id);
    } else if (onUpdateHeroImages) {
      onUpdateHeroImages(nextImages);
    }
    if (heroBackgroundUrl === img.url) {
      const fallback = nextImages[0] || FALLBACK_HERO_IMAGES[0];
      if (fallback) onUpdateHeroBackground(fallback.url);
    }
    showNotification(`Removed "${img.name}".`, 'info');
  };

  // Moments / Posts Handlers
  const handlePostFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const type = file.type.startsWith('video') ? 'video' : 'image';
      const downloadUrl = await uploadFileRobustly(file, 'posts');
      setPostForm(prev => ({ ...prev, url: downloadUrl, type }));
      showNotification('Media uploaded.', 'success');
    } catch {
      showNotification('Upload failed.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handlePostSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!postForm.url) return;
    onAddPost({
      id: Math.random().toString(36).substr(2, 9),
      title: postForm.title,
      description: postForm.description,
      url: postForm.url,
      type: postForm.type,
      vendorId: postForm.vendorId || undefined,
      timestamp: new Date().toISOString().split('T')[0]
    });
    setPostForm({ title: '', description: '', url: '', type: 'image', vendorId: '' });
    setShowMomentModal(false);
    showNotification('Community moment published.', 'success');
  };

  // Category & Taxonomy Handlers
  const handleMoveCategory = (catName: string, direction: 'up' | 'down') => {
    const currentIndex = localCategories.indexOf(catName);
    if (currentIndex === -1) return;
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= localCategories.length) return;
    const updated = [...localCategories];
    const [moved] = updated.splice(currentIndex, 1);
    updated.splice(newIndex, 0, moved);
    setLocalCategories(updated);
    onUpdateCategoryOrder(updated);
  };

  const handleSeed = async () => {
    if (!onSeedTaxonomy) return;
    setIsSeedingTaxonomy(true);
    try {
      await onSeedTaxonomy();
      showNotification('Default taxonomy seeded.', 'success');
    } finally {
      setIsSeedingTaxonomy(false);
    }
  };

  const handleCategoryImageUpload = async (category: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const localPreview = URL.createObjectURL(file);
    setPreviewUrls(prev => ({ ...prev, [category]: localPreview }));
    setUploadProgresses(prev => ({ ...prev, [category]: 0 }));
    try {
      const downloadUrl = await uploadFileWithProgress(file, 'categories', (progress) => {
        setUploadProgresses(prev => ({ ...prev, [category]: progress }));
      });
      onUpdateCategoryImage(category, downloadUrl);
      showNotification(`Updated banner for ${category}.`, 'success');
    } catch {
      showNotification('Failed to upload category image.', 'error');
    } finally {
      setUploadProgresses(prev => {
        const next = { ...prev };
        delete next[category];
        return next;
      });
    }
  };

  const handleSubCategoryImageUpload = async (subCategory: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateSubCategoryImage) return;
    const localPreview = URL.createObjectURL(file);
    setPreviewUrls(prev => ({ ...prev, [subCategory]: localPreview }));
    setUploadProgresses(prev => ({ ...prev, [subCategory]: 0 }));
    try {
      const downloadUrl = await uploadFileWithProgress(file, 'subcategories', (progress) => {
        setUploadProgresses(prev => ({ ...prev, [subCategory]: progress }));
      });
      onUpdateSubCategoryImage(subCategory, downloadUrl);
      showNotification(`Updated image for ${subCategory}.`, 'success');
    } catch {
      showNotification('Failed to upload subcategory image.', 'error');
    } finally {
      setUploadProgresses(prev => {
        const next = { ...prev };
        delete next[subCategory];
        return next;
      });
    }
  };

  const handleNewCategoryImgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const downloadUrl = await uploadFileRobustly(file, 'categories');
      setNewCategoryForm(prev => ({ ...prev, image: downloadUrl }));
      showNotification('Category banner uploaded.', 'success');
    } catch {
      showNotification('Failed to upload banner.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddCategorySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryForm.name) return;
    const subCats = newCategoryForm.subCatsString.split(',').map(s => s.trim()).filter(s => s !== '');
    onAddCategory(
      newCategoryForm.name,
      newCategoryForm.image || 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&q=80&w=1000',
      subCats
    );
    setNewCategoryForm({ name: '', image: '', subCatsString: '' });
    setShowAddCategoryModal(false);
    showNotification(`Added category "${newCategoryForm.name}".`, 'success');
  };

  const handleDeleteCategorySilent = async (categoryName: string) => {
    setLocalCategories(prev => prev.filter(c => c !== categoryName));
    setLocalCategorySubCategories(prev => {
      const next = { ...prev };
      delete next[categoryName];
      return next;
    });
    if (onDeleteCategory) {
      onDeleteCategory(categoryName);
    }
    try {
      const q = query(collection(db, 'categories'), where('name', '==', categoryName));
      const snap = await getDocs(q);
      await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'categories', d.id))));
      await deleteDoc(doc(db, 'categories', categoryName)).catch(() => {});
      await updateDoc(doc(db, 'settings', 'taxonomy'), {
        [`categories.${categoryName}`]: deleteField(),
        [`categoryImages.${categoryName}`]: deleteField(),
        [`categorySubCategories.${categoryName}`]: deleteField(),
        updatedAt: new Date().toISOString()
      }).catch(() => {});
      showNotification(`Deleted category "${categoryName}".`, 'info');
    } catch (err: any) {
      showNotification('Failed to delete category: ' + (err.message || ''), 'error');
    }
  };

  const handleAddSubCategory = (category: string) => {
    const val = newSubCategoryInputs[category]?.trim();
    if (!val) return;
    const current = localCategorySubCategories[category] || {};
    if (!current[val]) {
      const updated = { ...current, [val]: [] };
      setLocalCategorySubCategories(prev => ({ ...prev, [category]: updated }));
      onUpdateCategorySubCategories(category, updated);
    }
    setNewSubCategoryInputs(prev => ({ ...prev, [category]: '' }));
  };

  const handleDeleteSubcategorySilent = async (categoryName: string, subCategoryName: string) => {
    const current = localCategorySubCategories[categoryName] || {};
    const updated = { ...current };
    delete updated[subCategoryName];
    setLocalCategorySubCategories(prev => ({ ...prev, [categoryName]: updated }));
    onUpdateCategorySubCategories(categoryName, updated);
    try {
      await updateDoc(doc(db, 'settings', 'taxonomy'), {
        [`categorySubCategories.${categoryName}.${subCategoryName}`]: deleteField(),
        updatedAt: new Date().toISOString()
      }).catch(() => {});
      showNotification(`Removed group "${subCategoryName}".`, 'info');
    } catch {
      // handled via onUpdateCategorySubCategories
    }
  };

  const handleAddNestedSubCategory = (category: string, subCategory: string) => {
    const key = `${category}-${subCategory}`;
    const val = newNestedSubCategoryInputs[key]?.trim();
    if (!val) return;
    const current = localCategorySubCategories[category] || {};
    const nested = current[subCategory] || [];
    if (!nested.includes(val)) {
      const updated = { ...current, [subCategory]: [...nested, val] };
      setLocalCategorySubCategories(prev => ({ ...prev, [category]: updated }));
      onUpdateCategorySubCategories(category, updated);
    }
    setNewNestedSubCategoryInputs(prev => ({ ...prev, [key]: '' }));
  };

  const handleRemoveNestedSubCategorySilent = async (category: string, subCategory: string, itemToRemove: string) => {
    const current = localCategorySubCategories[category] || {};
    const nested = (current[subCategory] || []).filter(i => i !== itemToRemove);
    const updated = { ...current, [subCategory]: nested };
    setLocalCategorySubCategories(prev => ({ ...prev, [category]: updated }));
    onUpdateCategorySubCategories(category, updated);
    try {
      await updateDoc(doc(db, 'settings', 'taxonomy'), {
        [`categorySubCategories.${category}.${subCategory}`]: nested,
        [`subCategoryImages.${itemToRemove}`]: deleteField(),
        updatedAt: new Date().toISOString()
      }).catch(() => {});
    } catch {
      // handled via onUpdateCategorySubCategories
    }
  };

  // Filtered Lists
  const filteredVendors = useMemo(() => {
    return vendors.filter(v => {
      const matchesText =
        !vendorSearch.trim() ||
        v.name.toLowerCase().includes(vendorSearch.toLowerCase()) ||
        v.category.toLowerCase().includes(vendorSearch.toLowerCase()) ||
        (v.location || '').toLowerCase().includes(vendorSearch.toLowerCase()) ||
        (v.contactEmail || '').toLowerCase().includes(vendorSearch.toLowerCase());
      const matchesCat = vendorCategoryFilter === 'ALL' || v.category === vendorCategoryFilter;
      const matchesVer =
        vendorVerifyFilter === 'all' ||
        (vendorVerifyFilter === 'verified' && v.isVerified) ||
        (vendorVerifyFilter === 'unverified' && !v.isVerified);
      return matchesText && matchesCat && matchesVer;
    });
  }, [vendors, vendorSearch, vendorCategoryFilter, vendorVerifyFilter]);

  const filteredBookings = useMemo(() => {
    return bookings
      .filter(b => {
        const vendor = vendors.find(v => v.id === b.vendorId);
        const vendorName = vendor?.name || '';
        const matchesText =
          !bookingSearch.trim() ||
          (b.clientName || '').toLowerCase().includes(bookingSearch.toLowerCase()) ||
          (b.eventName || '').toLowerCase().includes(bookingSearch.toLowerCase()) ||
          vendorName.toLowerCase().includes(bookingSearch.toLowerCase()) ||
          (b.date || '').includes(bookingSearch);
        const matchesStatus =
          bookingStatusFilter === 'all' ||
          (bookingStatusFilter === 'paid' ? b.paymentStatus === 'paid' : b.status === bookingStatusFilter);
        return matchesText && matchesStatus;
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [bookings, vendors, bookingSearch, bookingStatusFilter]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const role = ((u as any).role || 'client').toLowerCase();
      const email = ((u as any).email || u.username || '').toLowerCase();
      const name = (u.name || '').toLowerCase();
      const matchesText =
        !userSearch.trim() ||
        name.includes(userSearch.toLowerCase()) ||
        email.includes(userSearch.toLowerCase()) ||
        u.id.toLowerCase().includes(userSearch.toLowerCase());
      const matchesRole = userRoleFilter === 'all' || role === userRoleFilter;
      return matchesText && matchesRole;
    });
  }, [users, userSearch, userRoleFilter]);

  const inputClass = 'w-full px-3.5 py-2.5 bg-black/80 border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none font-medium text-xs text-white transition-all placeholder-zinc-500';
  const labelClass = 'block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1.5';

  const navItems: Array<{ id: AdminTab; label: string; badge?: number }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'vendors', label: 'Vendors' },
    { id: 'bookings', label: 'Bookings' },
    { id: 'categories', label: 'Taxonomy' },
    { id: 'visuals', label: 'Visuals' },
    { id: 'messages', label: 'Messages', badge: processedSupportThreads.unreadCount > 0 ? processedSupportThreads.unreadCount : undefined },
    { id: 'users', label: 'Users' }
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 overflow-x-hidden pb-28">
      {/* Sleek Compact Luxury Top Bar */}
      <header className="sticky top-0 z-30 bg-[#050505]/90 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-5xl mx-auto px-3 sm:px-5 pt-10 sm:pt-11 pb-2.5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#D4AF37] to-[#AA820A] text-black flex items-center justify-center shadow-[0_0_15px_rgba(212,175,55,0.3)] shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold font-[Cinzel] text-white tracking-wider truncate">
                  Executive Control
                </h1>
                <p className="text-[8px] text-[#D4AF37]/80 uppercase tracking-[0.25em] font-black">
                  Simcha Master Suite
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleOpenNewVendorModal}
                className="h-7 px-3 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black text-[9px] font-black uppercase tracking-widest flex items-center gap-1 transition-all cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span className="hidden xs:inline">Vendor</span>
              </button>
              <button
                type="button"
                onClick={onBack}
                className="h-7 px-3 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-zinc-300 hover:text-white text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3 text-[#D4AF37]" />
                <span>Marketplace</span>
              </button>
            </div>
          </div>

          {/* Compact Segmented Pill Bar — Fits Cleanly Without Wasted Space */}
          <nav aria-label="Admin Navigation" className="grid grid-cols-4 sm:grid-cols-7 gap-1 bg-[#111] p-1 rounded-2xl border border-white/[0.06]">
            {navItems.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`relative h-7 px-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                    isActive
                      ? 'bg-[#D4AF37] text-black shadow-[0_2px_10px_rgba(212,175,55,0.3)]'
                      : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className={`px-1.5 py-0.2 rounded-full text-[8px] font-black leading-tight ${
                      isActive ? 'bg-black text-[#D4AF37]' : 'bg-[#D4AF37] text-black'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Container — Constrained Width, Zero Horizontal Overflow */}
      <main className="max-w-5xl mx-auto px-3 sm:px-5 pt-4 space-y-4">
        {/* ==================== TAB 1: OVERVIEW ==================== */}
        {activeTab === 'overview' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Compact 2x2 / 4-col Executive Metric Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-[#111] p-3.5 rounded-2xl border border-[#D4AF37]/20 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400">Paid Volume</span>
                  <BarChart3 className="w-3.5 h-3.5 text-[#D4AF37]/60" />
                </div>
                <p className="text-lg sm:text-xl font-bold text-white font-mono mt-1.5">
                  ${totalPaidVolume.toLocaleString()}
                </p>
              </div>

              <div className="bg-gradient-to-br from-[#171307] to-[#111] p-3.5 rounded-2xl border border-[#D4AF37]/35 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-black uppercase tracking-widest text-[#D4AF37]">Commission</span>
                  <Wallet className="w-3.5 h-3.5 text-[#D4AF37]" />
                </div>
                <p className="text-lg sm:text-xl font-bold text-[#D4AF37] font-mono mt-1.5">
                  ${totalCommission.toLocaleString()}
                </p>
              </div>

              <div
                onClick={() => setActiveTab('vendors')}
                className="bg-[#111] hover:bg-[#161616] p-3.5 rounded-2xl border border-white/[0.07] hover:border-[#D4AF37]/40 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400">Professionals</span>
                  <span className="text-[8px] font-bold text-[#D4AF37] uppercase tracking-wider">Tap to view</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-white font-mono mt-1.5">
                  {vendors.length}
                </p>
              </div>

              <div
                onClick={() => setActiveTab('bookings')}
                className="bg-[#111] hover:bg-[#161616] p-3.5 rounded-2xl border border-white/[0.07] hover:border-[#D4AF37]/40 transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400">Bookings</span>
                  <span className="text-[8px] font-bold text-[#D4AF37] uppercase tracking-wider">Tap to view</span>
                </div>
                <p className="text-lg sm:text-xl font-bold text-white font-mono mt-1.5">
                  {bookings.length}
                </p>
              </div>
            </div>

            {/* Quick Access Control Rows ("Tap to view") */}
            <div className="bg-[#111] rounded-2xl border border-white/[0.07] divide-y divide-white/[0.05] overflow-hidden">
              <div className="px-4 py-2.5 bg-black/40 flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#D4AF37]">
                  Platform Control Modules
                </span>
                <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold">
                  Full App Authority
                </span>
              </div>

              {[
                {
                  id: 'vendors' as AdminTab,
                  title: 'Vendor Profiles, Pricing & Stripe',
                  subtitle: 'Edit businesses, down payments, commission %, verification & Stripe payouts',
                  icon: ShoppingBag
                },
                {
                  id: 'bookings' as AdminTab,
                  title: 'Bookings & Payment Ledger',
                  subtitle: 'Confirm reservations, adjust amounts, toggle paid status & inspect events',
                  icon: Calendar
                },
                {
                  id: 'categories' as AdminTab,
                  title: 'Marketplace Categories & Subcategories',
                  subtitle: 'Reorder categories, upload vertical banners & manage nested classifications',
                  icon: ListTree
                },
                {
                  id: 'visuals' as AdminTab,
                  title: 'Landing Hero & Community Moments',
                  subtitle: 'Switch active hero background, upload custom visuals & publish highlights',
                  icon: Camera
                },
                {
                  id: 'messages' as AdminTab,
                  title: 'Concierge Support Inbox',
                  subtitle: 'Direct client & vendor support threads with voice, photo & instant replies',
                  icon: MessageSquare,
                  badge: processedSupportThreads.unreadCount
                },
                {
                  id: 'users' as AdminTab,
                  title: 'User Accounts & Role Permissions',
                  subtitle: 'Elevate users to Vendor or Admin, pre-authorize emails & scrub orphaned data',
                  icon: UserCheck
                }
              ].map(row => {
                const Icon = row.icon;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setActiveTab(row.id)}
                    className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.03] active:bg-white/[0.05] transition-colors text-left cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-black border border-[#D4AF37]/25 flex items-center justify-center text-[#D4AF37] shrink-0 group-hover:border-[#D4AF37] transition-colors">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-white group-hover:text-[#D4AF37] transition-colors truncate">
                            {row.title}
                          </p>
                          {row.badge !== undefined && row.badge > 0 && (
                            <span className="px-1.5 py-0.5 rounded-full bg-[#D4AF37] text-black text-[8px] font-black uppercase">
                              {row.badge} New
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                          {row.subtitle}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[9px] font-bold text-[#D4AF37]/80 group-hover:text-[#D4AF37] uppercase tracking-wider">
                        Tap to view
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-[#D4AF37] group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Global Search Calendar Quota & System Maintenance Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Search Date Quota Settings */}
              <div className="bg-[#111] p-4 rounded-2xl border border-white/[0.07] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-[#D4AF37]" />
                    <h3 className="text-xs font-bold font-[Cinzel] text-white">Client Date Search Limits</h3>
                  </div>
                  <span className="text-[8px] text-[#D4AF37] font-black uppercase tracking-widest bg-[#D4AF37]/10 px-2 py-0.5 rounded-full border border-[#D4AF37]/20">
                    Anti-Scraping
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className={labelClass}>Max Dates / Window</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={localMaxSearchDates}
                      onChange={e => setLocalMaxSearchDates(Math.max(1, Number(e.target.value) || 1))}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Reset Window (Hours)</label>
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={localSearchDateResetHours}
                      onChange={e => setLocalSearchDateResetHours(Math.max(1, Number(e.target.value) || 1))}
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      if (onUpdateSearchCalendarSettings) {
                        await onUpdateSearchCalendarSettings({
                          maxSearchDates: localMaxSearchDates,
                          searchDateResetHours: localSearchDateResetHours,
                          resetAllNow: false
                        });
                      } else {
                        await setDoc(doc(db, 'settings', 'searchCalendar'), {
                          maxSearchDates: localMaxSearchDates,
                          searchDateResetHours: localSearchDateResetHours,
                          updatedAt: new Date().toISOString()
                        }, { merge: true });
                        showNotification('Search calendar limits saved.', 'success');
                      }
                    }}
                    className="flex-1 h-8 rounded-full bg-[#D4AF37] text-black font-black text-[9px] uppercase tracking-widest hover:bg-[#E5C76B] transition-all cursor-pointer"
                  >
                    Save Limits
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (onUpdateSearchCalendarSettings) {
                        await onUpdateSearchCalendarSettings({
                          maxSearchDates: localMaxSearchDates,
                          searchDateResetHours: localSearchDateResetHours,
                          resetAllNow: true
                        });
                      } else {
                        await setDoc(doc(db, 'settings', 'searchCalendar'), {
                          maxSearchDates: localMaxSearchDates,
                          searchDateResetHours: localSearchDateResetHours,
                          globalResetTimestamp: Date.now(),
                          updatedAt: new Date().toISOString()
                        }, { merge: true });
                        showNotification('Reset all client date search quotas.', 'success');
                      }
                    }}
                    className="h-8 px-3 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-zinc-200 font-black text-[9px] uppercase tracking-widest flex items-center gap-1 transition-all cursor-pointer"
                    title="Immediately reset every client's used date search count"
                  >
                    <RefreshCw className="w-3 h-3 text-[#D4AF37]" />
                    <span>Reset Quotas</span>
                  </button>
                </div>
              </div>

              {/* Database Integrity & Orphaned Data Scrub */}
              <div className="bg-[#111] p-4 rounded-2xl border border-white/[0.07] flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
                      <h3 className="text-xs font-bold font-[Cinzel] text-white">Database Integrity</h3>
                    </div>
                    <span className="text-[8px] text-emerald-400 font-black uppercase tracking-widest bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Firestore Sync
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 mt-1.5 leading-relaxed">
                    Cross-check Firestore roles, users, and vendor profiles against active Firebase Auth accounts and remove orphaned records.
                  </p>
                  {cleanupResult && (
                    <div className="mt-2 p-2 bg-black/60 rounded-xl border border-emerald-500/30 text-[9px] text-emerald-400 grid grid-cols-3 gap-1 font-mono">
                      <span>Roles: -{cleanupResult.deletedUserRolesCount}</span>
                      <span>Users: -{cleanupResult.deletedUsersCount}</span>
                      <span>Vendors: -{cleanupResult.deletedVendorsCount}</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleRunOrphanedCleanup}
                  disabled={isRunningCleanup}
                  className="w-full h-8 rounded-full bg-white/[0.06] hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 text-zinc-200 hover:text-red-300 font-black text-[9px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isRunningCleanup ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Scanning Firestore...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3 h-3 text-red-400" />
                      <span>Scrub Orphaned Records</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Compact Conversion Pulse & 14-Day Activity Chart */}
            <div className="bg-[#111] p-4 rounded-2xl border border-white/[0.07] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold font-[Cinzel] text-white">Marketplace Funnel & Activity</h3>
                  <p className="text-[10px] text-zinc-400">Real-time client discovery to booking conversion</p>
                </div>
                {isLoadingAnalytics && <Loader2 className="w-3.5 h-3.5 text-[#D4AF37] animate-spin" />}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-black/50 p-2.5 rounded-xl border border-white/5">
                  <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">1. Profile Views</span>
                  <p className="text-base font-bold text-white font-mono mt-0.5">{analyticsStats.view_vendor}</p>
                </div>
                <div className="bg-black/50 p-2.5 rounded-xl border border-white/5">
                  <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">2. Added to Plan</span>
                  <p className="text-base font-bold text-[#D4AF37] font-mono mt-0.5">
                    {analyticsStats.add_to_plan} <span className="text-[9px] text-zinc-500">({analyticsStats.planRate.toFixed(0)}%)</span>
                  </p>
                </div>
                <div className="bg-black/50 p-2.5 rounded-xl border border-white/5">
                  <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">3. Inquiries</span>
                  <p className="text-base font-bold text-white font-mono mt-0.5">{analyticsStats.submit_booking_request}</p>
                </div>
                <div className="bg-black/50 p-2.5 rounded-xl border border-white/5">
                  <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">4. Paid Orders</span>
                  <p className="text-base font-bold text-emerald-400 font-mono mt-0.5">{analyticsStats.payment_completed}</p>
                </div>
              </div>

              <div className="h-36 w-full pt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={bookingChartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f1f22" vertical={false} />
                    <XAxis dataKey="date" stroke="#71717a" fontSize={9} axisLine={false} tickLine={false} />
                    <YAxis stroke="#71717a" fontSize={9} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#111', border: '1px solid rgba(212, 175, 55, 0.3)', borderRadius: '12px', fontSize: '10px' }}
                      itemStyle={{ color: '#D4AF37' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="requests"
                      name="Inquiries"
                      stroke="#D4AF37"
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: '#D4AF37', strokeWidth: 0 }}
                      activeDot={{ r: 4, fill: '#E5C76B' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 2: VENDOR DIRECTORY & CONTROL ==================== */}
        {activeTab === 'vendors' && (
          <div className="space-y-3 animate-in fade-in duration-300">
            {/* Compact Filter & Action Bar */}
            <div className="bg-[#111] p-3 rounded-2xl border border-white/[0.07] flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search vendors by name, category, city, or email..."
                  value={vendorSearch}
                  onChange={e => setVendorSearch(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-xl pl-8 pr-7 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]"
                />
                {vendorSearch && (
                  <button
                    type="button"
                    onClick={() => setVendorSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <select
                  value={vendorCategoryFilter}
                  onChange={e => setVendorCategoryFilter(e.target.value)}
                  className="bg-black/60 border border-white/10 rounded-xl px-2.5 py-2 text-[10px] font-bold text-zinc-200 focus:outline-none focus:border-[#D4AF37] flex-1 sm:flex-initial"
                >
                  <option value="ALL">All Categories</option>
                  {localCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                <select
                  value={vendorVerifyFilter}
                  onChange={e => setVendorVerifyFilter(e.target.value as any)}
                  className="bg-black/60 border border-white/10 rounded-xl px-2.5 py-2 text-[10px] font-bold text-zinc-200 focus:outline-none focus:border-[#D4AF37]"
                >
                  <option value="all">All Status</option>
                  <option value="verified">Verified</option>
                  <option value="unverified">Unverified</option>
                </select>

                <button
                  type="button"
                  onClick={handleOpenNewVendorModal}
                  className="h-8 px-3.5 rounded-xl bg-[#D4AF37] text-black font-black text-[9px] uppercase tracking-widest flex items-center gap-1 shrink-0 hover:bg-[#E5C76B] transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New</span>
                </button>
              </div>
            </div>

            {/* Pill-Shaped Vendor Cards — Zero Horizontal Scroll */}
            <div className="space-y-2">
              {filteredVendors.length === 0 ? (
                <div className="bg-[#111] rounded-2xl border border-dashed border-white/10 py-10 px-4 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400">No Matching Professionals</p>
                </div>
              ) : (
                filteredVendors.map(v => {
                  const downPaymentVal = v.downPayment ?? v.priceStart ?? 0;
                  return (
                    <div
                      key={v.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpenEditVendorModal(v)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleOpenEditVendorModal(v);
                        }
                      }}
                      className="w-full bg-[#111] hover:bg-[#161616] border border-white/[0.08] hover:border-[#D4AF37]/50 rounded-full px-3.5 sm:px-5 py-2.5 flex items-center justify-between gap-3 transition-all duration-200 cursor-pointer group shadow-md active:scale-[0.995]"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <img
                          src={v.image}
                          alt={v.name}
                          className="w-10 h-10 rounded-full object-cover bg-black border border-[#D4AF37]/30 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs sm:text-sm font-bold text-white group-hover:text-[#D4AF37] transition-colors truncate font-[Cinzel]">
                              {v.name}
                            </span>
                            {v.isVerified ? (
                              <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                            ) : (
                              <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[7px] font-black uppercase shrink-0">
                                Unverified
                              </span>
                            )}
                            {v.stripeAccountId && (
                              <span className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-[7px] font-black uppercase shrink-0">
                                Stripe
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-400 truncate mt-0.5">
                            <span className="text-[#D4AF37]/90 font-semibold">{v.category}</span>
                            {v.location && (
                              <>
                                <span>•</span>
                                <span className="truncate">{v.location}</span>
                              </>
                            )}
                            {downPaymentVal > 0 && (
                              <>
                                <span className="hidden md:inline">•</span>
                                <span className="hidden md:inline text-zinc-300 font-mono">
                                  ${downPaymentVal.toLocaleString()} deposit
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            onLoginAsVendor(v.id);
                          }}
                          title="Enter Vendor Portal"
                          className="h-7 px-2.5 rounded-full bg-white/[0.05] hover:bg-[#D4AF37] text-zinc-300 hover:text-black border border-white/10 text-[8px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <LogIn className="w-3 h-3" />
                          <span className="hidden sm:inline">Portal</span>
                        </button>
                        <span className="text-[9px] font-bold text-[#D4AF37]/85 group-hover:text-[#D4AF37] uppercase tracking-wider hidden xs:inline">
                          Tap to view
                        </span>
                        <div className="w-6 h-6 rounded-full bg-white/[0.04] group-hover:bg-[#D4AF37] text-zinc-400 group-hover:text-black flex items-center justify-center transition-all">
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 3: PLATFORM BOOKINGS ==================== */}
        {activeTab === 'bookings' && (
          <div className="space-y-3 animate-in fade-in duration-300">
            {/* Search & Status Filter Pills */}
            <div className="bg-[#111] p-3 rounded-2xl border border-white/[0.07] space-y-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search bookings by client, event, vendor, or date..."
                  value={bookingSearch}
                  onChange={e => setBookingSearch(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-xl pl-8 pr-7 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]"
                />
                {bookingSearch && (
                  <button
                    type="button"
                    onClick={() => setBookingSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                {(['all', 'pending', 'confirmed', 'paid', 'cancelled'] as const).map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setBookingStatusFilter(st)}
                    className={`h-6 px-3 rounded-full text-[8px] font-black uppercase tracking-widest transition-all shrink-0 cursor-pointer ${
                      bookingStatusFilter === st
                        ? 'bg-[#D4AF37] text-black'
                        : 'bg-black/50 text-zinc-400 hover:text-white border border-white/5'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Pill-Shaped Booking Cards ("Tap to view") */}
            <div className="space-y-2">
              {filteredBookings.length === 0 ? (
                <div className="bg-[#111] rounded-2xl border border-dashed border-white/10 py-10 px-4 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400">No Bookings Found</p>
                </div>
              ) : (
                filteredBookings.map(b => {
                  const vendor = vendors.find(v => v.id === b.vendorId);
                  return (
                    <div
                      key={b.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpenBookingSheet(b)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleOpenBookingSheet(b);
                        }
                      }}
                      className="w-full bg-[#111] hover:bg-[#161616] border border-white/[0.08] hover:border-[#D4AF37]/50 rounded-full px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3 transition-all cursor-pointer group shadow-md"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${
                          b.status === 'confirmed'
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                            : b.status === 'cancelled'
                            ? 'bg-red-500/15 border-red-500/30 text-red-400'
                            : 'bg-[#D4AF37]/15 border-[#D4AF37]/30 text-[#D4AF37]'
                        }`}>
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs sm:text-sm font-bold text-white group-hover:text-[#D4AF37] transition-colors truncate">
                              {b.clientName}
                            </span>
                            <span className="text-[10px] text-zinc-500">•</span>
                            <span className="text-[11px] font-semibold text-[#D4AF37] truncate">
                              {vendor?.name || 'Vendor'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-zinc-400 truncate mt-0.5">
                            <span className="truncate">{b.eventName}</span>
                            <span>•</span>
                            <span className="font-mono text-zinc-300">{b.date}</span>
                            <span>•</span>
                            <span className="font-mono font-bold text-white">${b.amount.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border ${
                          b.paymentStatus === 'paid'
                            ? 'bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/30'
                            : 'bg-white/5 text-zinc-400 border-white/10'
                        }`}>
                          {b.paymentStatus}
                        </span>
                        <span className="text-[9px] font-bold text-[#D4AF37]/85 group-hover:text-[#D4AF37] uppercase tracking-wider hidden sm:inline">
                          Tap to view
                        </span>
                        <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-[#D4AF37]" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 4: TAXONOMY (CATEGORIES & SUBCATEGORIES) ==================== */}
        {activeTab === 'categories' && (
          <div className="space-y-3 animate-in fade-in duration-300">
            {/* Top Action Bar */}
            <div className="bg-[#111] p-3.5 rounded-2xl border border-white/[0.07] flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-xs sm:text-sm font-bold font-[Cinzel] text-white">Marketplace Taxonomy</h2>
                <p className="text-[10px] text-zinc-400">Tap any category to manage banners, rank order, and subcategories</p>
              </div>
              <div className="flex items-center gap-1.5">
                {onSeedTaxonomy && (
                  <button
                    type="button"
                    disabled={isSeedingTaxonomy}
                    onClick={handleSeed}
                    className="h-7 px-3 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-zinc-300 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSeedingTaxonomy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-[#D4AF37]" />}
                    <span>Seed Defaults</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowAddCategoryModal(true)}
                  className="h-7 px-3 rounded-full bg-[#D4AF37] text-black text-[9px] font-black uppercase tracking-wider flex items-center gap-1 hover:bg-[#E5C76B] transition-all cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Category</span>
                </button>
              </div>
            </div>

            {/* Collapsible Pill-Style Category Cards */}
            <div className="space-y-2">
              {localCategories.map((cat, index) => {
                const isExpanded = expandedCategory === cat;
                const catBanner = previewUrls[cat] || categoryImages[cat];
                const subGroups = localCategorySubCategories[cat] || {};

                return (
                  <div
                    key={cat}
                    className="bg-[#111] rounded-2xl border border-white/[0.08] overflow-hidden transition-all"
                  >
                    {/* Compact Category Row Header */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedCategory(isExpanded ? null : cat);
                        }
                      }}
                      className="p-3 flex items-center justify-between gap-3 hover:bg-white/[0.02] cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-black border border-[#D4AF37]/30 shrink-0 relative">
                          {renderMedia(catBanner, 'w-full h-full object-cover')}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono font-bold text-[#D4AF37] bg-[#D4AF37]/10 px-1.5 py-0.5 rounded border border-[#D4AF37]/20">
                              #{index + 1}
                            </span>
                            <h3 className="text-xs sm:text-sm font-bold font-[Cinzel] text-white truncate">
                              {cat}
                            </h3>
                          </div>
                          <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                            {Object.keys(subGroups).length === 0 ? 'Tap to configure subcategories' : Object.keys(subGroups).join(' • ')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMoveCategory(cat, 'up')}
                          className="p-1.5 rounded-full text-zinc-400 hover:text-[#D4AF37] hover:bg-white/5 disabled:opacity-25 cursor-pointer"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={index === localCategories.length - 1}
                          onClick={() => handleMoveCategory(cat, 'down')}
                          className="p-1.5 rounded-full text-zinc-400 hover:text-[#D4AF37] hover:bg-white/5 disabled:opacity-25 cursor-pointer"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => categoryImageInputRefs.current[cat]?.click()}
                          className="p-1.5 rounded-full text-zinc-400 hover:text-[#D4AF37] hover:bg-white/5 cursor-pointer"
                          title="Change Banner"
                        >
                          <Camera className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          ref={el => { categoryImageInputRefs.current[cat] = el; }}
                          onChange={e => handleCategoryImageUpload(cat, e)}
                        />
                        <button
                          type="button"
                          onClick={() => handleDeleteCategorySilent(cat)}
                          className="p-1.5 rounded-full text-zinc-500 hover:text-red-400 hover:bg-red-500/10 cursor-pointer"
                          title="Delete Category"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpandedCategory(isExpanded ? null : cat)}
                          className="ml-1 px-2 py-1 rounded-full bg-white/[0.04] text-[8px] font-black text-[#D4AF37] uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                        >
                          <span>{isExpanded ? 'Close' : 'Tap to view'}</span>
                          <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Subcategory & Option Editor */}
                    {isExpanded && (
                      <div className="p-3.5 border-t border-white/[0.06] bg-black/40 space-y-3">
                        {/* Add New Classification Group */}
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className={inputClass + ' py-1.5'}
                            placeholder="Add classification group (e.g. Style, Tier, Service Type)..."
                            value={newSubCategoryInputs[cat] || ''}
                            onChange={e => setNewSubCategoryInputs({ ...newSubCategoryInputs, [cat]: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && handleAddSubCategory(cat)}
                          />
                          <button
                            type="button"
                            onClick={() => handleAddSubCategory(cat)}
                            className="px-3 rounded-xl bg-[#D4AF37] text-black font-black text-[9px] uppercase tracking-wider shrink-0 hover:bg-[#E5C76B] cursor-pointer"
                          >
                            Add Group
                          </button>
                        </div>

                        {Object.entries(subGroups).map(([sub, nestedItems]) => {
                          const nestedKey = `${cat}-${sub}`;
                          const items = nestedItems as string[];
                          return (
                            <div key={sub} className="bg-[#111] rounded-xl border border-white/[0.06] p-3 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
                                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-200">{sub}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSubcategorySilent(cat, sub)}
                                  className="text-zinc-500 hover:text-red-400 p-1 rounded-full hover:bg-red-500/10 transition-colors cursor-pointer"
                                  title="Delete group"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>

                              {/* Compact Sub-option Pills with Thumbnail + Camera + Remove */}
                              <div className="flex flex-wrap gap-1.5">
                                {items.map(item => {
                                  const itemImg = previewUrls[item] || subCategoryImages[item];
                                  return (
                                    <div
                                      key={item}
                                      className="inline-flex items-center gap-1.5 bg-black border border-white/10 rounded-full pl-1.5 pr-2 py-1"
                                    >
                                      <button
                                        type="button"
                                        onClick={() => subCategoryImageInputRefs.current[item]?.click()}
                                        className="w-5 h-5 rounded-full overflow-hidden bg-zinc-900 border border-[#D4AF37]/40 flex items-center justify-center shrink-0 hover:border-[#D4AF37] cursor-pointer"
                                        title="Upload option photo"
                                      >
                                        {itemImg ? (
                                          <img src={itemImg} alt={item} className="w-full h-full object-cover" />
                                        ) : (
                                          <Camera className="w-2.5 h-2.5 text-[#D4AF37]" />
                                        )}
                                      </button>
                                      <input
                                        type="file"
                                        accept="image/*,video/*"
                                        className="hidden"
                                        ref={el => { subCategoryImageInputRefs.current[item] = el; }}
                                        onChange={e => handleSubCategoryImageUpload(item, e)}
                                      />
                                      <span className="text-[10px] font-semibold text-zinc-200">{item}</span>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveNestedSubCategorySilent(cat, sub, item)}
                                        className="text-zinc-500 hover:text-red-400 ml-0.5 cursor-pointer"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="flex gap-1.5">
                                <input
                                  type="text"
                                  className="flex-1 bg-black/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white outline-none focus:border-[#D4AF37]"
                                  placeholder={`Add option to ${sub}...`}
                                  value={newNestedSubCategoryInputs[nestedKey] || ''}
                                  onChange={e => setNewNestedSubCategoryInputs({ ...newNestedSubCategoryInputs, [nestedKey]: e.target.value })}
                                  onKeyDown={e => e.key === 'Enter' && handleAddNestedSubCategory(cat, sub)}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAddNestedSubCategory(cat, sub)}
                                  className="px-2.5 py-1 rounded-lg bg-[#D4AF37]/15 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black text-[9px] font-black uppercase cursor-pointer transition-all"
                                >
                                  + Add
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ==================== TAB 5: VISUALS (HERO & COMMUNITY MOMENTS) ==================== */}
        {activeTab === 'visuals' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Hero Background Manager */}
            <div className="bg-[#111] p-4 rounded-2xl border border-white/[0.07] space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h2 className="text-xs sm:text-sm font-bold font-[Cinzel] text-white">Landing Page Hero Background</h2>
                  <p className="text-[10px] text-zinc-400">Tap any visual below to set it as the live marketplace hero</p>
                </div>
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => heroFileInputRef.current?.click()}
                  className="h-7 px-3 rounded-full bg-[#D4AF37] text-black font-black text-[9px] uppercase tracking-wider flex items-center gap-1.5 hover:bg-[#E5C76B] transition-all cursor-pointer disabled:opacity-50"
                >
                  {isUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  <span>Upload Hero</span>
                </button>
                <input
                  type="file"
                  ref={heroFileInputRef}
                  className="hidden"
                  accept="image/*,video/*"
                  onChange={handleHeroFileUpload}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                {allDisplayHeroImages.map(img => {
                  const isActive = heroBackgroundUrl === img.url;
                  return (
                    <div
                      key={img.id || img.url}
                      onClick={() => handleSelectHeroImage(img)}
                      className={`group relative rounded-xl overflow-hidden border transition-all cursor-pointer aspect-[16/10] bg-black ${
                        isActive
                          ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/30'
                          : 'border-white/10 hover:border-[#D4AF37]/50'
                      }`}
                    >
                      {renderMedia(img.url, 'w-full h-full object-cover group-hover:scale-105 transition-transform duration-500')}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                      {isActive && (
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full bg-[#D4AF37] text-black text-[7px] font-black uppercase tracking-widest flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5 stroke-[3]" /> Active
                        </span>
                      )}
                      {!img.isDefault && (
                        <button
                          type="button"
                          onClick={e => handleRemoveHeroImageFromLibrary(img, e)}
                          className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/70 text-zinc-300 hover:bg-red-500 hover:text-white transition-colors"
                          title="Delete custom hero"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                      <p className="absolute bottom-1.5 left-2 right-2 text-[9px] font-bold text-white truncate">
                        {img.name}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Community Moments Manager */}
            <div className="bg-[#111] p-4 rounded-2xl border border-white/[0.07] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs sm:text-sm font-bold font-[Cinzel] text-white">Community Moments Feed</h2>
                  <p className="text-[10px] text-zinc-400">Manage visual highlights published in the Simcha feed</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMomentModal(true)}
                  className="h-7 px-3 rounded-full bg-[#D4AF37] text-black font-black text-[9px] uppercase tracking-wider flex items-center gap-1 hover:bg-[#E5C76B] transition-all cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Publish Moment</span>
                </button>
              </div>

              {posts.length === 0 ? (
                <div className="py-8 text-center text-zinc-500 text-xs border border-dashed border-white/10 rounded-xl">
                  No moments published yet.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {posts.map(post => {
                    const assocVendor = vendors.find(v => v.id === post.vendorId);
                    return (
                      <div key={post.id} className="relative group rounded-xl overflow-hidden border border-white/10 bg-black aspect-square">
                        {renderMedia(post.url, 'w-full h-full object-cover')}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                        <button
                          type="button"
                          onClick={() => {
                            onRemovePost(post.id);
                            showNotification('Moment removed.', 'info');
                          }}
                          className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-zinc-300 hover:bg-red-500 hover:text-white transition-all cursor-pointer"
                          title="Delete Moment"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        <div className="absolute bottom-2 left-2.5 right-2.5">
                          <p className="text-[10px] font-bold text-white truncate">{post.title}</p>
                          {assocVendor && (
                            <p className="text-[8px] text-[#D4AF37] truncate">{assocVendor.name}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== TAB 6: MESSAGES (CONCIERGE INBOX) ==================== */}
        {activeTab === 'messages' && (() => {
          const { list, allAdminSupportMessages, getOtherUserId, getOtherUserDetails } = processedSupportThreads;
          const filteredList = list.filter(item => {
            const matchesSearch =
              !convoSearchQuery.trim() ||
              item.clientDetails.name.toLowerCase().includes(convoSearchQuery.toLowerCase()) ||
              item.clientDetails.email.toLowerCase().includes(convoSearchQuery.toLowerCase()) ||
              (item.msg.text || '').toLowerCase().includes(convoSearchQuery.toLowerCase());
            const matchesRead =
              convoReadFilter === 'all' ||
              (convoReadFilter === 'unread' && item.hasUnread) ||
              (convoReadFilter === 'read' && !item.hasUnread);
            return matchesSearch && matchesRead;
          });

          const getInitials = (name?: string): string => {
            if (!name || !name.trim()) return 'U';
            const parts = name.trim().split(/\s+/);
            if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
          };

          return (
            <div className="space-y-3 animate-in fade-in duration-300">
              <div className="bg-[#111] p-3 rounded-2xl border border-white/[0.07] flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                  <input
                    type="text"
                    value={convoSearchQuery}
                    onChange={e => setConvoSearchQuery(e.target.value)}
                    placeholder="Search support threads..."
                    className="w-full bg-black/60 border border-white/10 rounded-xl pl-8 pr-7 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div className="flex items-center gap-1">
                  {(['all', 'unread', 'read'] as const).map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setConvoReadFilter(f)}
                      className={`h-7 px-3 rounded-xl text-[9px] font-black uppercase tracking-wider cursor-pointer transition-all ${
                        convoReadFilter === f
                          ? 'bg-[#D4AF37] text-black'
                          : 'bg-black/50 text-zinc-400 hover:text-white border border-white/5'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {filteredList.length === 0 ? (
                  <div className="bg-[#111] rounded-2xl border border-dashed border-white/10 py-10 px-4 text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400">No Support Conversations</p>
                  </div>
                ) : (
                  filteredList.map(({ msg, cid, cids, hasUnread, clientDetails, otherUser }, idx) => {
                    const displayPhoto = otherUser.avatar || clientDetails.avatar;
                    const displayName = clientDetails.name || otherUser.name || 'Client';
                    const initials = getInitials(displayName);
                    const isVoice = msg.type === 'voice' || !!msg.audioUrl;
                    const isImg = msg.type === 'image' || !!msg.imageUrl;

                    const handleOpenAdminThread = () => {
                      setLocallyReadThreadCids(prev => {
                        const next = new Set(prev);
                        next.add(cid);
                        cids.forEach(c => next.add(c));
                        return next;
                      });
                      setSelectedInquiryEmail(otherUser.email);
                      setSelectedConversationId(cid);
                      cids.forEach(c => {
                        if (c) markChatAsRead(c, 'admin').catch(() => {});
                      });
                    };

                    return (
                      <div
                        key={cid ? `${cid}-${idx}` : `${otherUser.id}-${idx}`}
                        role="button"
                        tabIndex={0}
                        onClick={handleOpenAdminThread}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleOpenAdminThread();
                          }
                        }}
                        className={`w-full bg-[#111] hover:bg-[#161616] rounded-full px-4 sm:px-5 py-2.5 border transition-all cursor-pointer group flex items-center justify-between gap-3 ${
                          hasUnread
                            ? 'border-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.15)]'
                            : 'border-white/[0.08] hover:border-[#D4AF37]/50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {displayPhoto ? (
                            <img src={displayPhoto} alt={displayName} className="w-10 h-10 rounded-full object-cover border border-[#D4AF37]/40 shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center shrink-0 text-[#D4AF37] font-[Cinzel] font-bold text-xs">
                              {initials}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs sm:text-sm text-white font-[Cinzel] group-hover:text-[#D4AF37] transition-colors truncate">
                                {displayName}
                              </span>
                              {hasUnread && (
                                <span className="bg-[#D4AF37] text-black text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0">
                                  New
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 truncate mt-0.5">
                              {msg.senderId === 'admin' && (
                                msg.isRead ? (
                                  <CheckCheck className="w-3.5 h-3.5 text-[#34B7F1] shrink-0" />
                                ) : (
                                  <Check className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                )
                              )}
                              {isVoice ? (
                                <span className="inline-flex items-center gap-1 truncate"><Mic className="w-3 h-3 text-[#D4AF37]" /> Voice note</span>
                              ) : isImg ? (
                                <span className="inline-flex items-center gap-1 truncate"><ImageIcon className="w-3 h-3 text-[#D4AF37]" /> Photo</span>
                              ) : (
                                <span className="truncate">{msg.text || 'Tap to view conversation'}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {msg.timestamp && (
                            <span className="text-[9px] font-mono text-zinc-400 hidden sm:inline">
                              {new Date(msg.timestamp).toLocaleDateString()}
                            </span>
                          )}
                          <span className="text-[9px] font-bold text-[#D4AF37] uppercase tracking-wider">
                            Tap to view
                          </span>
                          <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-[#D4AF37]" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {selectedConversationId && (() => {
                const matchedBucket = list.find(
                  item => item.cid === selectedConversationId || item.cids?.has(selectedConversationId)
                );
                const conversationMessages = matchedBucket
                  ? matchedBucket.messages
                  : allAdminSupportMessages.filter(m =>
                      (selectedConversationId && (m.conversationId === selectedConversationId || [m.senderId, m.receiverId].sort().join('_') === selectedConversationId)) ||
                      (!selectedConversationId && m.clientEmail === selectedInquiryEmail)
                    );
                const lastMsg = conversationMessages[conversationMessages.length - 1];
                const otherId = matchedBucket?.clientDetails.id || matchedBucket?.otherUser.id || (lastMsg ? getOtherUserId(lastMsg) : '');
                const otherUser = matchedBucket?.otherUser || (lastMsg ? getOtherUserDetails(otherId, lastMsg) : { id: selectedInquiryEmail || '', name: 'User', email: selectedInquiryEmail || '', role: 'client' as const, avatar: '' });

                return (
                  <ChatModal
                    isOpen={true}
                    vendor={null}
                    isAdminMode={true}
                    onClose={() => {
                      setSelectedConversationId(null);
                      setSelectedInquiryEmail(null);
                    }}
                    onSendMessage={async payload => {
                      await onSendMessage({
                        ...payload,
                        senderId: 'admin',
                        receiverId: payload.receiverId || otherId || otherUser.id || otherUser.email,
                        conversationId: payload.conversationId || matchedBucket?.cid || selectedConversationId,
                        clientEmail: payload.clientEmail || otherUser.email || (lastMsg?.clientEmail || ''),
                        clientName: payload.clientName || otherUser.name || (lastMsg?.clientName || 'Client'),
                        isAdminInquiry: true,
                        isRead: false
                      });
                    }}
                    showNotification={showNotification}
                    messages={allAdminSupportMessages}
                    user={{
                      id: 'admin',
                      name: 'Admin support',
                      username: 'Admin'
                    }}
                    recipientUid={otherId || otherUser.id || otherUser.email}
                    recipientName={otherUser.name || 'User'}
                    recipientEmail={otherUser.email}
                    recipientImage={otherUser.avatar}
                    conversationIdOverride={matchedBucket?.cid || selectedConversationId}
                    isAdminReplying={true}
                    vendors={vendors}
                    customConversations={filteredList.map(item => ({
                      id: item.cid,
                      contactId: item.clientDetails.id || item.otherUser.id || item.otherUser.email || item.cid,
                      name: item.clientDetails.name || item.otherUser.name || 'User',
                      email: item.clientDetails.email || item.otherUser.email,
                      category: 'Support Inquiry',
                      image: item.clientDetails.avatar || item.otherUser.avatar,
                      isAdmin: false,
                      lastMessage: typeof item.msg?.text === 'string' ? item.msg.text : '',
                      lastMessageType: item.msg?.type,
                      lastMessageTime: item.msg?.timestamp,
                      lastMessageIsSent: item.msg?.senderId === 'admin',
                      lastMessageIsRead: Boolean(item.msg?.isRead),
                      unreadCount: item.hasUnread ? 1 : 0,
                      conversationId: item.cid
                    }))}
                  />
                );
              })()}
            </div>
          );
        })()}

        {/* ==================== TAB 7: USERS & ROLES ==================== */}
        {activeTab === 'users' && (
          <div className="space-y-3 animate-in fade-in duration-300">
            {/* Quick Pre-Authorize Vendor by Email Bar */}
            <form onSubmit={handleInviteVendor} className="bg-[#111] p-3 rounded-2xl border border-[#D4AF37]/25 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex items-center gap-2 flex-1">
                <UserPlus className="w-4 h-4 text-[#D4AF37] shrink-0 ml-1" />
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  placeholder="Grant Vendor access by email (pre-authorizes or elevates user)..."
                  className="w-full bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
              <button
                type="submit"
                disabled={isInvitingVendor}
                className="h-8 px-4 rounded-xl bg-[#D4AF37] text-black font-black text-[9px] uppercase tracking-widest hover:bg-[#E5C76B] transition-all shrink-0 cursor-pointer disabled:opacity-50"
              >
                {isInvitingVendor ? 'Saving...' : 'Grant Vendor Role'}
              </button>
            </form>

            {/* Search & Role Filter */}
            <div className="bg-[#111] p-3 rounded-2xl border border-white/[0.07] flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search users by name or email..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-xl pl-8 pr-7 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
              <div className="flex items-center gap-1">
                {(['all', 'client', 'vendor', 'admin'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setUserRoleFilter(r)}
                    className={`h-7 px-3 rounded-xl text-[9px] font-black uppercase tracking-wider cursor-pointer transition-all ${
                      userRoleFilter === r
                        ? 'bg-[#D4AF37] text-black'
                        : 'bg-black/50 text-zinc-400 hover:text-white border border-white/5'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Pill-Shaped User Directory Cards ("Tap to view") */}
            <div className="space-y-2">
              {filteredUsers.length === 0 ? (
                <div className="bg-[#111] rounded-2xl border border-dashed border-white/10 py-10 px-4 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400">No Matching Users</p>
                </div>
              ) : (
                filteredUsers.map(u => {
                  const role = ((u as any).role || 'client').toLowerCase();
                  const email = (u as any).email || u.username || '';
                  return (
                    <div
                      key={u.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setConfirmDeleteUserId(null);
                        setSelectedUserForSheet(u);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setConfirmDeleteUserId(null);
                          setSelectedUserForSheet(u);
                        }
                      }}
                      className="w-full bg-[#111] hover:bg-[#161616] border border-white/[0.08] hover:border-[#D4AF37]/50 rounded-full px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt="" className="w-9 h-9 rounded-full object-cover bg-black border border-white/15 shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-zinc-900 border border-[#D4AF37]/30 flex items-center justify-center font-bold text-[#D4AF37] text-xs uppercase shrink-0">
                            {(u.name || email || 'U').slice(0, 2)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-bold text-white group-hover:text-[#D4AF37] transition-colors truncate">
                              {u.name || 'Platform User'}
                            </span>
                            <span className={`px-2 py-0.2 rounded-full text-[8px] font-black uppercase tracking-wider border ${
                              role === 'admin'
                                ? 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/40'
                                : role === 'vendor'
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : 'bg-white/5 text-zinc-400 border-white/10'
                            }`}>
                              {role}
                            </span>
                          </div>
                          <p className="text-[10px] text-zinc-400 font-mono truncate mt-0.5">
                            {email || u.id}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[9px] font-bold text-[#D4AF37]/85 group-hover:text-[#D4AF37] uppercase tracking-wider">
                          Tap to view
                        </span>
                        <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-[#D4AF37]" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* ==================== MODAL 1: VENDOR CREATE / EDIT SHEET ==================== */}
      {(selectedVendorForSheet || isCreatingNewVendor) && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => {
            setSelectedVendorForSheet(null);
            setIsCreatingNewVendor(false);
          }}
        >
          <motion.div
            {...vendorSheetDrag.dragModalProps}
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[88vh] bg-[#0e0e0e] border-t sm:border border-[#D4AF37]/30 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          >
            <div {...vendorSheetDrag.dragHandleProps} className="pt-2 px-4 pb-3 border-b border-white/[0.07] bg-black/60 shrink-0">
              <ModalDragIndicator />
              <div className="flex items-center justify-between mt-1">
                <div>
                  <h3 className="text-sm font-bold font-[Cinzel] text-[#D4AF37]">
                    {isCreatingNewVendor ? 'Add New Professional' : formData.name || 'Vendor Control'}
                  </h3>
                  <p className="text-[9px] text-zinc-400 uppercase tracking-widest">
                    {isCreatingNewVendor ? 'Create Marketplace Profile' : `ID: ${selectedVendorForSheet?.id}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {selectedVendorForSheet && !isCreatingNewVendor && (
                    <button
                      type="button"
                      onClick={() => {
                        const vid = selectedVendorForSheet.id;
                        setSelectedVendorForSheet(null);
                        onLoginAsVendor(vid);
                      }}
                      className="h-7 px-2.5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <LogIn className="w-3 h-3" />
                      <span>Open Portal</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedVendorForSheet(null);
                      setIsCreatingNewVendor(false);
                    }}
                    className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <form onSubmit={e => handleVendorSubmit(e, false)} className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Quick Toggles Row (Verified & Kosher) */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !formData.isVerified;
                    setFormData(prev => ({ ...prev, isVerified: nextVal }));
                    if (selectedVendorForSheet && !isCreatingNewVendor) {
                      onToggleVerify(selectedVendorForSheet.id);
                    }
                  }}
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                    formData.isVerified
                      ? 'bg-[#D4AF37]/15 border-[#D4AF37]/40 text-[#D4AF37]'
                      : 'bg-black/60 border-white/10 text-zinc-400'
                  }`}
                >
                  <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> Verified
                  </span>
                  <span className="text-[9px] font-bold uppercase">{formData.isVerified ? 'Yes' : 'No'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setFormData(prev => ({
                      ...prev,
                      kosherStatus: prev.kosherStatus === 'Kosher Certified' ? 'Non-Kosher' : 'Kosher Certified'
                    }))
                  }
                  className={`p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                    formData.kosherStatus === 'Kosher Certified'
                      ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                      : 'bg-black/60 border-white/10 text-zinc-400'
                  }`}
                >
                  <span className="text-[10px] font-black uppercase tracking-wider">Kosher</span>
                  <span className="text-[9px] font-bold uppercase">
                    {formData.kosherStatus === 'Kosher Certified' ? 'Certified' : 'Standard'}
                  </span>
                </button>
              </div>

              {/* Photo + Core Identity */}
              <div className="flex items-center gap-3">
                <div
                  onClick={() => vendorFileInputRef.current?.click()}
                  className="w-16 h-16 rounded-2xl bg-black border border-dashed border-[#D4AF37]/40 hover:border-[#D4AF37] flex items-center justify-center overflow-hidden shrink-0 cursor-pointer relative group"
                >
                  {formData.image ? (
                    renderMedia(formData.image, 'w-full h-full object-cover')
                  ) : (
                    <Camera className="w-5 h-5 text-[#D4AF37]/60" />
                  )}
                </div>
                <input type="file" accept="image/*,video/*" className="hidden" ref={vendorFileInputRef} onChange={handleVendorFileUpload} />

                <div className="flex-1 space-y-2">
                  <div>
                    <label className={labelClass}>Business Name</label>
                    <input
                      required
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className={inputClass}
                      placeholder="e.g. Royal Glatt Catering"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className={labelClass}>Primary Category</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className={inputClass}
                  >
                    {localCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Contact Email</label>
                  <input
                    required
                    type="email"
                    value={formData.contactEmail}
                    onChange={e => setFormData({ ...formData, contactEmail: e.target.value })}
                    className={inputClass}
                    placeholder="vendor@example.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={labelClass}>Commission (%)</label>
                  <input
                    required
                    type="number"
                    min="0"
                    max="100"
                    value={formData.commissionRate}
                    onChange={e => setFormData({ ...formData, commissionRate: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Down Payment ($ Optional)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.priceStart}
                    onChange={e => setFormData({ ...formData, priceStart: e.target.value })}
                    className={inputClass}
                    placeholder="Optional deposit"
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Location</label>
                <LocationAutocomplete
                  id="admin-sheet-vendor-location"
                  required
                  floating={false}
                  placeholder="City, State or Address..."
                  value={formData.location}
                  onChange={val => setFormData({ ...formData, location: val })}
                />
              </div>

              <div>
                <label className={labelClass}>Description / Bio</label>
                <textarea
                  required
                  rows={2}
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className={inputClass + ' resize-none'}
                  placeholder="Describe the vendor's offerings..."
                />
              </div>

              {/* Subcategories Selector */}
              {Object.keys(localCategorySubCategories[formData.category] || {}).length > 0 && (
                <div className="bg-black/50 p-3 rounded-xl border border-white/[0.06] space-y-2">
                  <span className={labelClass}>Subcategories ({formData.category})</span>
                  {Object.entries(localCategorySubCategories[formData.category] || {}).map(([group, opts]) => (
                    <div key={group} className="space-y-1">
                      <p className="text-[8px] font-bold text-[#D4AF37]/70 uppercase tracking-widest">{group}</p>
                      <div className="flex flex-wrap gap-1">
                        {(opts as string[]).map(option => {
                          const active = formData.subCategories.includes(option);
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => toggleSubCategorySelection(option)}
                              className={`px-2.5 py-1 rounded-full text-[9px] font-bold transition-all cursor-pointer border ${
                                active
                                  ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                                  : 'bg-black text-zinc-400 border-white/10 hover:border-[#D4AF37]/40'
                              }`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Credentials */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className={labelClass}>Portal Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                    className={inputClass}
                    placeholder="Username / Email"
                  />
                </div>
                <div>
                  <label className={labelClass}>Portal Password</label>
                  <input
                    type="text"
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    className={inputClass}
                    placeholder="Password"
                  />
                </div>
              </div>

              {/* Stripe Control Block (For Existing Vendor) */}
              {selectedVendorForSheet && !isCreatingNewVendor && (
                <div className="bg-black/60 p-3 rounded-xl border border-white/[0.07] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span className="text-[10px] font-black uppercase tracking-wider text-white">Stripe Connect</span>
                    </div>
                    {selectedVendorForSheet.stripeAccountId ? (
                      <span className="text-[9px] font-mono text-emerald-400">{selectedVendorForSheet.stripeAccountId}</span>
                    ) : (
                      <span className="text-[9px] text-zinc-500 uppercase font-bold">Not Connected</span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isOnboarding}
                      onClick={() => handleStripeOnboard(selectedVendorForSheet.id, formData.contactEmail)}
                      className="h-7 px-3 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black text-[9px] font-black uppercase tracking-wider cursor-pointer transition-all"
                    >
                      {selectedVendorForSheet.stripeAccountId ? 'Re-Run Onboarding' : 'Start Onboarding'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowManualStripeInput(!showManualStripeInput)}
                      className="h-7 px-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-[9px] font-bold uppercase tracking-wider cursor-pointer"
                    >
                      Set ID Manually
                    </button>
                    {selectedVendorForSheet.stripeAccountId && (
                      confirmResetStripeVendorId === selectedVendorForSheet.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleResetVendorStripe(selectedVendorForSheet)}
                            className="h-7 px-2.5 rounded-full bg-red-500 text-white text-[8px] font-black uppercase cursor-pointer"
                          >
                            Confirm Reset
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmResetStripeVendorId(null)}
                            className="h-7 px-2 rounded-full bg-white/10 text-zinc-300 text-[8px] font-bold uppercase cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmResetStripeVendorId(selectedVendorForSheet.id)}
                          className="h-7 px-2.5 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-red-400 text-[9px] font-bold uppercase cursor-pointer"
                        >
                          Reset Stripe
                        </button>
                      )
                    )}
                  </div>

                  {showManualStripeInput && (
                    <div className="flex gap-1.5 pt-1">
                      <input
                        type="text"
                        value={manualStripeInput}
                        onChange={e => setManualStripeInput(e.target.value)}
                        placeholder="acct_123456789..."
                        className={inputClass + ' py-1.5 font-mono'}
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveManualStripeId(selectedVendorForSheet)}
                        className="px-3 rounded-xl bg-[#D4AF37] text-black font-black text-[9px] uppercase shrink-0 cursor-pointer"
                      >
                        Save ID
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Footer Actions */}
              <div className="pt-2 flex items-center justify-between gap-2">
                {selectedVendorForSheet && !isCreatingNewVendor && (
                  confirmDeleteVendorId === selectedVendorForSheet.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleConfirmDeleteVendor(selectedVendorForSheet)}
                        className="h-9 px-3 rounded-full bg-red-600 text-white text-[9px] font-black uppercase tracking-wider cursor-pointer"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteVendorId(null)}
                        className="h-9 px-3 rounded-full bg-white/10 text-zinc-300 text-[9px] font-bold uppercase cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteVendorId(selectedVendorForSheet.id)}
                      className="h-9 px-3.5 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[9px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  )
                )}

                <button
                  type="submit"
                  disabled={isUploading}
                  className="flex-1 h-9 rounded-full bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black text-[10px] uppercase tracking-widest shadow-lg transition-all cursor-pointer"
                >
                  {isCreatingNewVendor ? 'Create Vendor Profile' : 'Save Changes'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>,
        document.body
      )}

      {/* ==================== MODAL 2: BOOKING INSPECTOR SHEET ==================== */}
      {selectedBookingForSheet && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedBookingForSheet(null)}
        >
          <motion.div
            {...bookingSheetDrag.dragModalProps}
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-md bg-[#0e0e0e] border-t sm:border border-[#D4AF37]/30 rounded-t-3xl sm:rounded-3xl shadow-2xl p-4 space-y-4"
          >
            <div {...bookingSheetDrag.dragHandleProps}>
              <ModalDragIndicator />
              <div className="flex items-center justify-between mt-1">
                <div>
                  <h3 className="text-sm font-bold font-[Cinzel] text-[#D4AF37]">{selectedBookingForSheet.clientName}</h3>
                  <p className="text-[10px] text-zinc-400">{selectedBookingForSheet.eventName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBookingForSheet(null)}
                  className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Status & Payment Controls */}
            <div className="space-y-2">
              <label className={labelClass}>Booking Confirmation Status</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['pending', 'confirmed', 'cancelled'] as const).map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => onUpdateBookingStatus(selectedBookingForSheet.id, st)}
                    className={`h-8 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                      selectedBookingForSheet.status === st
                        ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                        : 'bg-black/60 text-zinc-400 border-white/10 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-black/50 rounded-xl border border-white/[0.06]">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-white">Payment Status</p>
                <p className="text-[9px] text-zinc-400">Currently marked as {selectedBookingForSheet.paymentStatus}</p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleBookingPaymentStatus(selectedBookingForSheet)}
                className={`h-7 px-3 rounded-full text-[9px] font-black uppercase tracking-wider border cursor-pointer transition-all ${
                  selectedBookingForSheet.paymentStatus === 'paid'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/30'
                }`}
              >
                Mark as {selectedBookingForSheet.paymentStatus === 'paid' ? 'Unpaid' : 'Paid'}
              </button>
            </div>

            {/* Editable Date & Amount */}
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className={labelClass}>Event Date</label>
                <input
                  type="date"
                  value={editingBookingDate}
                  onChange={e => setEditingBookingDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Amount ($)</label>
                <input
                  type="number"
                  min="0"
                  value={editingBookingAmount}
                  onChange={e => setEditingBookingAmount(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              {confirmDeleteBookingId === selectedBookingForSheet.id ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleDeleteBooking(selectedBookingForSheet.id)}
                    className="h-8 px-3 rounded-full bg-red-600 text-white text-[9px] font-black uppercase cursor-pointer"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteBookingId(null)}
                    className="h-8 px-2.5 rounded-full bg-white/10 text-zinc-300 text-[9px] font-bold uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteBookingId(selectedBookingForSheet.id)}
                  className="h-8 px-3 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[9px] font-black uppercase flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSaveBookingDetails}
                className="flex-1 h-8 rounded-full bg-[#D4AF37] text-black font-black text-[9px] uppercase tracking-widest hover:bg-[#E5C76B] transition-all cursor-pointer"
              >
                Save Booking Changes
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* ==================== MODAL 3: USER ROLE & ACCOUNT SHEET ==================== */}
      {selectedUserForSheet && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedUserForSheet(null)}
        >
          <motion.div
            {...userSheetDrag.dragModalProps}
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-md bg-[#0e0e0e] border-t sm:border border-[#D4AF37]/30 rounded-t-3xl sm:rounded-3xl shadow-2xl p-4 space-y-4"
          >
            <div {...userSheetDrag.dragHandleProps}>
              <ModalDragIndicator />
              <div className="flex items-center justify-between mt-1">
                <div className="min-w-0">
                  <h3 className="text-sm font-bold font-[Cinzel] text-white truncate">
                    {selectedUserForSheet.name || 'User Account'}
                  </h3>
                  <p className="text-[10px] text-zinc-400 font-mono truncate">
                    {(selectedUserForSheet as any).email || selectedUserForSheet.username || selectedUserForSheet.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedUserForSheet(null)}
                  className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className={labelClass}>Platform Access Role</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['client', 'vendor', 'admin'] as const).map(r => {
                  const currentRole = ((selectedUserForSheet as any).role || 'client').toLowerCase();
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleChangeUserRole(selectedUserForSheet, r)}
                      className={`h-8 rounded-xl text-[9px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                        currentRole === r
                          ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                          : 'bg-black/60 text-zinc-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
              {confirmDeleteUserId === selectedUserForSheet.id ? (
                <div className="flex items-center gap-1.5 w-full">
                  <button
                    type="button"
                    onClick={() => handleDeleteUserAccount(selectedUserForSheet)}
                    className="flex-1 h-8 rounded-full bg-red-600 text-white text-[9px] font-black uppercase cursor-pointer"
                  >
                    Confirm Delete User
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteUserId(null)}
                    className="h-8 px-3 rounded-full bg-white/10 text-zinc-300 text-[9px] font-bold uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteUserId(selectedUserForSheet.id)}
                  className="w-full h-8 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete User Account</span>
                </button>
              )}
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {/* ==================== MODAL 4: ADD NEW CATEGORY SHEET ==================== */}
      {showAddCategoryModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setShowAddCategoryModal(false)}
        >
          <motion.div
            {...addCategoryModalDrag.dragModalProps}
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-md bg-[#0e0e0e] border-t sm:border border-[#D4AF37]/30 rounded-t-3xl sm:rounded-3xl shadow-2xl p-4 space-y-4"
          >
            <div {...addCategoryModalDrag.dragHandleProps}>
              <ModalDragIndicator />
              <div className="flex items-center justify-between mt-1">
                <h3 className="text-sm font-bold font-[Cinzel] text-[#D4AF37]">Add Marketplace Category</h3>
                <button
                  type="button"
                  onClick={() => setShowAddCategoryModal(false)}
                  className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form onSubmit={handleAddCategorySubmit} className="space-y-3">
              <div>
                <label className={labelClass}>Category Name</label>
                <input
                  required
                  type="text"
                  value={newCategoryForm.name}
                  onChange={e => setNewCategoryForm({ ...newCategoryForm, name: e.target.value })}
                  placeholder="e.g. Sound & Lighting"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Initial Subcategory Groups (comma separated)</label>
                <input
                  type="text"
                  value={newCategoryForm.subCatsString}
                  onChange={e => setNewCategoryForm({ ...newCategoryForm, subCatsString: e.target.value })}
                  placeholder="Style, Tier, Equipment"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Banner Image</label>
                <div
                  onClick={() => newCatImageInputRef.current?.click()}
                  className="h-28 bg-black border border-dashed border-[#D4AF37]/30 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden"
                >
                  {newCategoryForm.image ? (
                    renderMedia(newCategoryForm.image, 'w-full h-full object-cover')
                  ) : (
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-[#D4AF37]" /> Select Banner
                    </span>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  ref={el => { newCatImageInputRef.current = el; }}
                  onChange={handleNewCategoryImgUpload}
                />
              </div>
              <button
                type="submit"
                className="w-full h-9 rounded-full bg-[#D4AF37] text-black font-black text-[10px] uppercase tracking-widest hover:bg-[#E5C76B] transition-all cursor-pointer"
              >
                Create Category
              </button>
            </form>
          </motion.div>
        </div>,
        document.body
      )}

      {/* ==================== MODAL 5: PUBLISH COMMUNITY MOMENT SHEET ==================== */}
      {showMomentModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setShowMomentModal(false)}
        >
          <motion.div
            {...momentModalDrag.dragModalProps}
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-md bg-[#0e0e0e] border-t sm:border border-[#D4AF37]/30 rounded-t-3xl sm:rounded-3xl shadow-2xl p-4 space-y-4"
          >
            <div {...momentModalDrag.dragHandleProps}>
              <ModalDragIndicator />
              <div className="flex items-center justify-between mt-1">
                <h3 className="text-sm font-bold font-[Cinzel] text-[#D4AF37]">Publish Community Moment</h3>
                <button
                  type="button"
                  onClick={() => setShowMomentModal(false)}
                  className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <form onSubmit={handlePostSubmit} className="space-y-3">
              <div>
                <label className={labelClass}>Title</label>
                <input
                  required
                  type="text"
                  value={postForm.title}
                  onChange={e => setPostForm({ ...postForm, title: e.target.value })}
                  placeholder="e.g. Lakewood Grand Wedding"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Caption / Context</label>
                <textarea
                  required
                  rows={2}
                  value={postForm.description}
                  onChange={e => setPostForm({ ...postForm, description: e.target.value })}
                  placeholder="Brief highlight description..."
                  className={inputClass + ' resize-none'}
                />
              </div>
              <div>
                <label className={labelClass}>Featured Vendor (Optional)</label>
                <select
                  value={postForm.vendorId}
                  onChange={e => setPostForm({ ...postForm, vendorId: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Independent Highlight</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Photo or Video</label>
                <div
                  onClick={() => postFileInputRef.current?.click()}
                  className="h-32 bg-black border border-dashed border-[#D4AF37]/30 rounded-xl flex items-center justify-center cursor-pointer overflow-hidden"
                >
                  {isUploading ? (
                    <Loader2 className="w-5 h-5 text-[#D4AF37] animate-spin" />
                  ) : postForm.url ? (
                    renderMedia(postForm.url, 'w-full h-full object-cover')
                  ) : (
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Upload className="w-4 h-4 text-[#D4AF37]" /> Upload Visual
                    </span>
                  )}
                </div>
                <input
                  type="file"
                  ref={postFileInputRef}
                  className="hidden"
                  accept="image/*,video/*"
                  onChange={handlePostFileUpload}
                />
              </div>
              <button
                type="submit"
                disabled={isUploading || !postForm.url}
                className="w-full h-9 rounded-full bg-[#D4AF37] text-black font-black text-[10px] uppercase tracking-widest hover:bg-[#E5C76B] transition-all cursor-pointer disabled:opacity-40"
              >
                Publish Highlight
              </button>
            </form>
          </motion.div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AdminPanel;