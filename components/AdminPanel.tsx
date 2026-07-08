import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Plus, Image as ImageIcon, MapPin, DollarSign, LayoutList, ArrowLeft, LogOut, Lock, Trash2, Search, Settings, User, Key, Upload, Tag, X, CheckSquare, Square, Film, Play, Loader2, BarChart3, Wallet, LogIn, Edit2, ChevronDown, ChevronRight, MessageSquare, Camera, FolderPlus, ListTree, Layers, CreditCard, Bot, Volume2, Send, ShoppingBag, Calendar, FileText, Download, Mail, MailOpen, Eye, EyeOff, Filter, ArrowUpDown } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType, firebaseConfig } from '../services/firebase';
import { markChatAsRead } from '../services/messagingService';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { getApps, initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { uploadFileRobustly, uploadFileWithProgress } from '../services/uploadService';
import { CustomAudioPlayer } from './CustomAudioPlayer';
import ChatModal from './ChatModal';
import { Vendor, VendorCategory, Post, Booking, UserAccount, Message } from '../types';

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
  onSendMessage: (payload: Partial<Message>) => void;
  showNotification: (message: string, type?: 'success' | 'info' | 'error') => void;
  onSeedTaxonomy?: () => Promise<void>;
}

const TableContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftShadow, setShowLeftShadow] = useState(false);
  const [showRightShadow, setShowRightShadow] = useState(false);

  const checkScroll = () => {
    if (containerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
      setShowLeftShadow(scrollLeft > 10);
      setShowRightShadow(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      checkScroll();
      el.addEventListener('scroll', checkScroll);
      window.addEventListener('resize', checkScroll);
      
      const observer = new ResizeObserver(checkScroll);
      observer.observe(el);
      
      return () => {
        el.removeEventListener('scroll', checkScroll);
        window.removeEventListener('resize', checkScroll);
        observer.disconnect();
      };
    }
  }, [children]);

  return (
    <div className="relative group/table w-full rounded-xl overflow-hidden border border-white/5 bg-black/40">
      <div 
        className={`pointer-events-none absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-black via-black/90 to-transparent z-20 transition-all duration-300 ${
          showLeftShadow ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
        }`}
      />
      <div 
        className={`pointer-events-none absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-black via-black/90 to-transparent z-20 transition-all duration-300 ${
          showRightShadow ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
        }`}
      />
      <div 
        ref={containerRef}
        className="overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent w-full"
      >
        {children}
      </div>
    </div>
  );
};

const ADMIN_CODE = "ss-77859";
const COMMISSION_RATE = 0.10;

const AdminPanel: React.FC<AdminPanelProps> = ({ 
    vendors, posts, bookings, users, messages, onAddVendor, onUpdateVendor, onRemoveVendor, onToggleVerify, onUpdateBookingStatus, onLoginAsVendor, onAddPost, onRemovePost, onBack, categoryImages, onUpdateCategoryImage, categories, onAddCategory, categorySubCategories, onUpdateCategorySubCategories, subCategoryImages = {}, onUpdateSubCategoryImage, heroBackgroundUrl, onUpdateHeroBackground, onSendMessage, showNotification, onSeedTaxonomy
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'add' | 'manage' | 'posts' | 'categories' | 'bookings' | 'stripe' | 'users' | 'messages' | 'analytics' | 'moderation'>('manage');
  const [isUploading, setIsUploading] = useState(false);
  const [isSeedingTaxonomy, setIsSeedingTaxonomy] = useState(false);

  const handleSeed = async () => {
    alert("Alert #1: Entered handleSeed function successfully.");
    
    try {
      const taxonomyData = [
        { name: "Music", subcategories: ["DJ", "Band", "Choir", "One-Man Band"] },
        { name: "Catering", subcategories: ["Meat", "Dairy", "Pareve", "Food Trucks"] },
        { name: "Photography & Video", subcategories: ["Wedding Photo", "Event Video", "Drone"] },
        { name: "Design & Florals", subcategories: ["Chupah Design", "Table Centerpieces", "Lighting"] }
      ];
      
      alert("Alert #2: Data array created. Testing if 'db' variable exists: " + (typeof db !== 'undefined' ? "Yes" : "No"));
      
      if (typeof db === 'undefined') {
        alert("Error: 'db' is undefined! Stopping here.");
        return;
      }

      alert("Alert #3: Starting loop to write to Firestore collection 'categories'...");

      // Using a standard modern loop to add documents safely
      for (const cat of taxonomyData) {
        alert("Alert #4: Attempting to add category: " + cat.name);
        await addDoc(collection(db, "categories"), {
          name: cat.name,
          subcategories: cat.subcategories,
          imageUrl: "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=400", // placeholder
          icon: "star"
        });
        alert("Alert #5: Successfully added category: " + cat.name);
      }

      alert("Alert #6: Database loop finished! Seeding complete!");

    } catch (globalError: any) {
      alert("CRASH DETECTED inside catch block: " + (globalError?.message || globalError || "Unknown error"));
    }
  };

  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [selectedPostFile, setSelectedPostFile] = useState<File | null>(null);
  const [selectedVendorFile, setSelectedVendorFile] = useState<File | null>(null);
  const [selectedCategoryFile, setSelectedCategoryFile] = useState<File | null>(null);
  const [selectedHeroFile, setSelectedHeroFile] = useState<File | null>(null);

  // Real-time Upload Progress & Optimistic Previews
  const [uploadProgresses, setUploadProgresses] = useState<Record<string, number>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  // Advanced Back-Office moderation & search states
  const [moderationActioning, setModerationActioning] = useState<Record<string, 'approve' | 'reject'>>({});
  const [removedModerationIds, setRemovedModerationIds] = useState<string[]>([]);
  const [filterText, setFilterText] = useState('');

  const [analyticsLogs, setAnalyticsLogs] = useState<any[]>([]);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(false);

  // Analytics calculations
  const analyticsStats = React.useMemo(() => {
    let view_vendor = 0;
    let add_to_plan = 0;
    let submit_booking_request = 0;
    let payment_completed = 0;

    analyticsLogs.forEach(log => {
      if (log.eventName === 'view_vendor') view_vendor++;
      if (log.eventName === 'add_to_plan') add_to_plan++;
      if (log.eventName === 'submit_booking_request') submit_booking_request++;
      if (log.eventName === 'payment_completed') payment_completed++;
    });

    const planRate = view_vendor > 0 ? (add_to_plan / view_vendor) * 100 : 0;
    const requestRate = add_to_plan > 0 ? (submit_booking_request / add_to_plan) * 100 : 0;
    const purchaseRate = submit_booking_request > 0 ? (payment_completed / submit_booking_request) * 100 : 0;
    const overallRate = view_vendor > 0 ? (payment_completed / view_vendor) * 100 : 0;

    return {
      view_vendor,
      add_to_plan,
      submit_booking_request,
      payment_completed,
      planRate,
      requestRate,
      purchaseRate,
      overallRate
    };
  }, [analyticsLogs]);

  useEffect(() => {
    if (activeTab === 'analytics') {
      setIsLoadingAnalytics(true);
      const q = query(
        collection(db, "analytics_logs"),
        orderBy("timestamp", "desc"),
        limit(500)
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const logs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setAnalyticsLogs(logs);
        setIsLoadingAnalytics(false);
      }, (err) => {
        console.error("Failed to load analytics logs:", err);
        setIsLoadingAnalytics(false);
      });

      return () => unsubscribe();
    }
  }, [activeTab]);
  
  const postFileInputRef = useRef<HTMLInputElement>(null);
  const vendorFileInputRef = useRef<HTMLInputElement>(null);
  const categoryImageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const newCatImageInputRef = useRef<HTMLInputElement>(null);
  const heroImageInputRef = useRef<HTMLInputElement>(null);

  const [postForm, setPostForm] = useState({
    title: '',
    description: '',
    type: 'image' as 'image' | 'video',
    url: '',
    vendorId: ''
  });

  const [newSubCategoryInputs, setNewSubCategoryInputs] = useState<Record<string, string>>({});
  const [newNestedSubCategoryInputs, setNewNestedSubCategoryInputs] = useState<Record<string, string>>({});

  const [newCategoryForm, setNewCategoryForm] = useState({
    name: '',
    image: '',
    subCatsString: '' // comma separated
  });

  const [formData, setFormData] = useState({
    name: '', 
    category: categories[0] || 'Catering', 
    subCategories: [] as string[], 
    description: '', 
    priceStart: '', 
    location: '', 
    image: '', 
    isKosher: false, 
    isVerified: false, 
    username: '', 
    password: '',
    commissionRate: '5',
    contactEmail: ''
  });

  const [onboardingVendorId, setOnboardingVendorId] = useState<string | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [selectedInquiryEmail, setSelectedInquiryEmail] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  
  // Conversation search & filter states
  const [convoSearchQuery, setConvoSearchQuery] = useState('');
  const [convoTypeFilter, setConvoTypeFilter] = useState<'all' | 'admin' | 'vendor_client'>('all');
  const [convoReadFilter, setConvoReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [convoSortBy, setConvoSortBy] = useState<'recent' | 'oldest' | 'alphabetical'>('recent');
  
  const [chatOpen, setChatOpen] = useState(false);
  const [chatRecipient, setChatRecipient] = useState<{
    id: string;
    name: string;
    email: string;
    role: 'client' | 'vendor';
  } | null>(null);

  const getOtherUserId = (msg: Message) => {
    if (msg.senderId === 'admin') return msg.receiverId;
    return msg.senderId;
  };

  const getOtherUserDetails = (otherId: string, lastMsg: Message) => {
    // Try to find in vendors first if they are a vendor
    const vendor = vendors.find(v => v.id === otherId || v.contactEmail === lastMsg.vendorEmail);
    if (vendor) {
      return {
        id: vendor.id,
        name: vendor.name,
        email: vendor.contactEmail || lastMsg.vendorEmail || '',
        role: 'vendor' as 'vendor' | 'client',
        avatar: vendor.image || ''
      };
    }

    // Try to find in users
    const user = users.find(u => u.id === otherId || u.username?.toLowerCase() === lastMsg.clientEmail?.toLowerCase());
    if (user) {
      return {
        id: user.id,
        name: user.name || user.username?.split('@')[0] || 'Client',
        email: user.username || lastMsg.clientEmail || '',
        role: 'client' as 'vendor' | 'client',
        avatar: user.photoURL || ''
      };
    }

    // Fallback to message info
    return {
      id: otherId,
      name: lastMsg.clientName || 'User',
      email: lastMsg.clientEmail || '',
      role: (lastMsg.vendorEmail ? 'vendor' : 'client') as 'vendor' | 'client',
      avatar: ''
    };
  };

  const getConversationParticipants = (lastMsg: Message) => {
    const sId = lastMsg.senderId || '';
    const rId = lastMsg.receiverId || '';
    
    // Find vendor in vendors list by either senderId, receiverId, or vendorEmail
    const vendor = vendors.find(v => 
      v.id === sId || 
      v.id === rId || 
      (lastMsg.vendorEmail && v.contactEmail?.toLowerCase() === lastMsg.vendorEmail.toLowerCase())
    );
    
    // Find client in users list by either senderId, receiverId, or clientEmail
    const client = users.find(u => 
      u.id === sId || 
      u.id === rId || 
      (lastMsg.clientEmail && u.username?.toLowerCase() === lastMsg.clientEmail.toLowerCase())
    );
    
    const clientDetails = {
      id: client?.id || (sId === vendor?.id ? rId : sId),
      name: client?.name || lastMsg.clientName || 'Client',
      email: client?.username || lastMsg.clientEmail || '',
      avatar: client?.photoURL || ''
    };

    const vendorDetails = {
      id: vendor?.id || (sId === clientDetails.id ? rId : sId),
      name: vendor?.name || 'Vendor',
      email: vendor?.contactEmail || lastMsg.vendorEmail || '',
      avatar: vendor?.image || ''
    };

    return { vendor: vendorDetails, client: clientDetails };
  };

  const handleOpenChat = (conversationId: string, lastMsg: Message) => {
    const otherId = getOtherUserId(lastMsg);
    const otherUser = getOtherUserDetails(otherId, lastMsg);
    setSelectedInquiryEmail(otherUser.email);
    setSelectedConversationId(conversationId);
    setActiveTab('messages');
  };

  const toggleMessageReadStatus = async (messageId: string, currentStatus: boolean, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const msg = messages.find(m => m.id === messageId);
      if (msg && msg.conversationId) {
        await markChatAsRead(msg.conversationId, 'admin');
        showNotification(`Marked conversation as read`, 'success');
      } else {
        showNotification('Unable to resolve conversation', 'info');
      }
    } catch (err) {
      console.error('Error updating message read status:', err);
    }
  };

  const toggleConversationReadStatus = async (conversationId: string, otherEmail: string, hasUnread: boolean, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      if (conversationId) {
        await markChatAsRead(conversationId, 'admin');
        showNotification('Conversation marked as read', 'success');
      } else {
        showNotification('Invalid conversation ID', 'info');
      }
    } catch (err) {
      console.error('Error toggling conversation read status:', err);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [fullscreenMedia, setFullscreenMedia] = useState<{url: string, type: 'image' | 'video'} | null>(null);

  // Automatically scroll to bottom of active message thread
  useEffect(() => {
    if (messagesEndRef.current) {
        messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight;
    }
  }, [selectedInquiryEmail, selectedConversationId, messages]);

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedInquiryEmail) return;
    
    // Find matching message in this conversation to determine recipient ID
    const conversationMessages = messages.filter(m => 
      m.conversationId === selectedConversationId || 
      [m.senderId, m.receiverId].sort().join('_') === selectedConversationId ||
      m.clientEmail === selectedInquiryEmail || 
      m.vendorEmail === selectedInquiryEmail
    );
    
    const lastMsg = conversationMessages[conversationMessages.length - 1];
    const otherId = lastMsg ? getOtherUserId(lastMsg) : 'client_legacy';
    const otherDetails = lastMsg ? getOtherUserDetails(otherId, lastMsg) : { name: 'Client', email: selectedInquiryEmail, role: 'client' as const };
    
    onSendMessage({
        text: replyText,
        receiverId: otherId,
        clientEmail: otherDetails.role === 'client' ? otherDetails.email : undefined,
        clientName: otherDetails.role === 'client' ? otherDetails.name : undefined,
        senderId: 'admin',
        isAdminInquiry: true,
        type: 'text',
        conversationId: selectedConversationId || lastMsg?.conversationId || [ 'admin', otherId ].sort().join('_'),
        vendorEmail: otherDetails.role === 'vendor' ? otherDetails.email : undefined
    });
    
    setReplyText('');
  };

  useEffect(() => {
    // Reset sub-selections when primary category changes
    setFormData(prev => ({ ...prev, subCategories: [] }));
  }, [formData.category]);

  const totalPaidVolume = bookings
    .filter(b => b.paymentStatus === 'paid')
    .reduce((sum, b) => sum + b.amount, 0);
    
  const totalCommission = bookings
    .filter(b => b.paymentStatus === 'paid')
    .reduce((sum, b) => {
      const vendor = vendors.find(v => v.id === b.vendorId);
      const rate = vendor?.commissionRate || 5;
      return sum + (b.amount * (rate / 100));
    }, 0);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessCode === ADMIN_CODE) { setIsAuthenticated(true); setError(''); }
    else setError('Invalid Access Code');
  };

  const uploadFile = async (file: File, path: string): Promise<string> => {
    return await uploadFileRobustly(file, `${path}/${Date.now()}_${file.name}`);
  };

  const handleVendorFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedVendorFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setFormData(prev => ({ ...prev, image: e.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleVendorSubmit = async (e: React.FormEvent, triggerOnboarding = false) => {
    e.preventDefault();
    setIsUploading(true);
    try {
      let imageUrl = formData.image || 'https://picsum.photos/800/600';
      if (selectedVendorFile) {
        imageUrl = await uploadFile(selectedVendorFile, 'vendors');
      }

      let vendorId = editingVendor ? editingVendor.id : '';

      // For new vendors, automatically create their login credentials in Firebase Auth
      if (!editingVendor) {
        if (!formData.contactEmail.trim()) {
          showNotification('A contact email is required to create vendor credentials.', 'info');
          setIsUploading(false);
          return;
        }
        if (!formData.password || formData.password.length < 6) {
          showNotification('A temporary portal password of at least 6 characters is required.', 'info');
          setIsUploading(false);
          return;
        }

        const emailLower = formData.contactEmail.trim().toLowerCase();
        const existingUserInUsers = users?.find(u => ((u as any).email || (u as any).username)?.trim().toLowerCase() === emailLower);
        const existingUserInVendors = vendors?.find(v => v.contactEmail?.trim().toLowerCase() === emailLower);
        let reusedUid = existingUserInUsers?.id || existingUserInVendors?.id;

        if (!reusedUid) {
          try {
            const lookupResp = await fetch(`/api/auth/lookup-uid?email=${encodeURIComponent(emailLower)}`);
            if (lookupResp.ok) {
              const lookupData = await lookupResp.json();
              if (lookupData.uid) {
                reusedUid = lookupData.uid;
              }
            }
          } catch (lookupErr) {
            console.warn("Could not query backend UID lookup for registered email:", lookupErr);
          }
        }

        if (reusedUid) {
          vendorId = reusedUid;
          showNotification('Reusing existing account registered under this email.', 'success');
        } else {
          try {
            const secAuth = getSecondaryAuth();
            const userCredential = await createUserWithEmailAndPassword(
              secAuth,
              formData.contactEmail.trim(),
              formData.password
            );
            
            vendorId = userCredential.user.uid;
            
            // Sign out of the secondary auth session right away to keep it clean
            await signOut(secAuth);
          } catch (authErr: any) {
            console.error("Firebase Authentication Vendor creation failed:", authErr);
            let errMsg = authErr.message || "Failed to create vendor login credentials.";
            let recovered = false;

            if (authErr.code === 'auth/email-already-in-use') {
              try {
                const lookupResp = await fetch(`/api/auth/lookup-uid?email=${encodeURIComponent(emailLower)}`);
                if (lookupResp.ok) {
                  const lookupData = await lookupResp.json();
                  if (lookupData.uid) {
                    vendorId = lookupData.uid;
                    showNotification('Reusing existing auth account with this email.', 'success');
                    recovered = true;
                  }
                }
              } catch (fallbackErr) {
                console.error("Fallback UID lookup failed:", fallbackErr);
              }
              errMsg = "The email is already registered in Firebase Authentication.";
            } else if (authErr.code === 'auth/invalid-email') {
              errMsg = "The provided contact email starts with or contains invalid characters.";
            } else if (authErr.code === 'auth/weak-password') {
              errMsg = "The password is too weak. Must be at least 6 characters.";
            }

            if (!recovered) {
              showNotification(errMsg, 'info');
              setIsUploading(false);
              return;
            }
          }
        }
      }

      const newVendor: Vendor = {
        ...formData,
        id: vendorId, 
        image: imageUrl, 
        priceStart: Number(formData.priceStart),
        rating: editingVendor ? editingVendor.rating : 5.0, 
        password: formData.password || '123', 
        unavailableDates: editingVendor ? editingVendor.unavailableDates : [], 
        reviews: editingVendor ? editingVendor.reviews : [], 
        services: editingVendor ? editingVendor.services : [], 
        paymentMethods: editingVendor ? editingVendor.paymentMethods : ['Check', 'Cash'],
        commissionRate: Number(formData.commissionRate) || 5,
        stripeConnected: editingVendor ? editingVendor.stripeConnected : false,
        stripeAccountId: editingVendor ? editingVendor.stripeAccountId : undefined
      };

      if (editingVendor) {
        onUpdateVendor(newVendor);
        showNotification('Professional profile updated!');
        setEditingVendor(null);
      } else {
        onAddVendor(newVendor);
        showNotification('New professional added!');
      }

      if (triggerOnboarding) {
        await handleStripeOnboard(vendorId, formData.contactEmail);
      }

      setFormData({ 
        name: '', 
        category: categories[0] || 'Catering', 
        subCategories: [], 
        description: '', 
        priceStart: '', 
        location: '', 
        image: '', 
        isKosher: false, 
        isVerified: false, 
        username: '', 
        password: '',
        commissionRate: '5',
        contactEmail: ''
      });
      setSelectedVendorFile(null);
      setActiveTab('manage');
    } catch (err) {
      showNotification("Failed to save vendor.", 'info');
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditVendor = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setFormData({
      name: vendor.name,
      category: vendor.category,
      subCategories: vendor.subCategories || [],
      description: vendor.description,
      priceStart: vendor.priceStart.toString(),
      location: vendor.location,
      image: vendor.image,
      isKosher: vendor.isKosher || false,
      isVerified: vendor.isVerified || false,
      username: vendor.username || '',
      password: vendor.password || '',
      commissionRate: (vendor.commissionRate || 5).toString(),
      contactEmail: vendor.contactEmail || ''
    });
    setActiveTab('add');
  };

  const handleStripeOnboard = async (vendorId: string, email: string) => {
    setIsOnboarding(true);
    try {
      const response = await fetch('/api/stripe/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, email }),
      });
      const data = await response.json();
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error(data.error || "Failed to get onboarding URL");
      }
    } catch (err: any) {
      showNotification(err.message || "Stripe onboarding failed.", 'info');
    } finally {
      setIsOnboarding(false);
    }
  };

  const handleManualStripeId = async (vendorId: string) => {
    const stripeId = prompt("Enter the Stripe Account ID (e.g., acct_...) for this vendor:");
    if (!stripeId || !stripeId.startsWith('acct_')) {
        if (stripeId) showNotification("Invalid Stripe Account ID format.", 'info');
        return;
    }

    try {
        const response = await fetch('/api/stripe/force-connect-db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vendorId, stripeAccountId: stripeId }),
        });
        const data = await response.json();
        if (data.status === 'ok') {
            showNotification("Stripe ID updated successfully!", 'success');
            // Update local state if needed, though Firestore listener in App.tsx should handle it
        } else {
            throw new Error(data.error || "Failed to update Stripe ID");
        }
    } catch (err: any) {
        showNotification(err.message || "Failed to update Stripe ID.", 'info');
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) { 
      showNotification("Please upload an image or video file.", 'info'); 
      return; 
    }

    setSelectedPostFile(file);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setPostForm(prev => ({ 
        ...prev, 
        url: base64, 
        type: isVideo ? 'video' : 'image' 
      }));
    };

    reader.readAsDataURL(file);
  };

  const subCategoryImageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleSubCategoryImageUpload = async (subCategory: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpdateSubCategoryImage) return;
    
    // Optimistic Preview
    const previewUrl = URL.createObjectURL(file);
    setPreviewUrls(prev => ({ ...prev, [subCategory]: previewUrl }));
    setUploadProgresses(prev => ({ ...prev, [subCategory]: 0 }));

    try {
      const url = await uploadFileWithProgress(file, `taxonomy/${Date.now()}_${file.name}`, (progress) => {
        setUploadProgresses(prev => ({ ...prev, [subCategory]: progress }));
      });
      onUpdateSubCategoryImage(subCategory, url);
    } catch (err) {
      console.error("Upload error:", err);
      showNotification('Upload failed', 'info');
    } finally {
      setUploadProgresses(prev => { const newP = {...prev}; delete newP[subCategory]; return newP; });
    }
  };

  const handleCategoryImageUpload = async (category: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Optimistic Preview
    const previewUrl = URL.createObjectURL(file);
    setPreviewUrls(prev => ({ ...prev, [category]: previewUrl }));
    setUploadProgresses(prev => ({ ...prev, [category]: 0 }));

    try {
      const url = await uploadFileWithProgress(file, `categories/${Date.now()}_${file.name}`, (progress) => {
        setUploadProgresses(prev => ({ ...prev, [category]: progress }));
      });
      onUpdateCategoryImage(category, url);
    } catch (err) {
      showNotification("Failed to upload category image.", 'info');
    } finally {
      setUploadProgresses(prev => { const newP = {...prev}; delete newP[category]; return newP; });
    }
  };

  const handleNewCategoryImgUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedCategoryFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setNewCategoryForm(prev => ({ ...prev, image: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleHeroBackgroundUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Optimistic Preview
    const previewUrl = URL.createObjectURL(file);
    setPreviewUrls(prev => ({ ...prev, 'hero': previewUrl }));
    setUploadProgresses(prev => ({ ...prev, 'hero': 0 }));

    try {
      const url = await uploadFileWithProgress(file, `hero/${Date.now()}_${file.name}`, (progress) => {
        setUploadProgresses(prev => ({ ...prev, 'hero': progress }));
      });
      onUpdateHeroBackground(url);
    } catch (err) {
      showNotification("Failed to upload hero background.", 'info');
    } finally {
      setUploadProgresses(prev => { const newP = {...prev}; delete newP['hero']; return newP; });
    }
  };

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPostFile && !postForm.url) { 
      showNotification("Please select an image or video to upload.", 'info'); 
      return; 
    }
    
    setIsUploading(true);
    try {
      let finalUrl = postForm.url;
      if (selectedPostFile) {
        finalUrl = await uploadFile(selectedPostFile, 'posts');
      }

      const newPost: Post = {
        id: Math.random().toString(36).substr(2, 9),
        type: postForm.type,
        url: finalUrl,
        title: postForm.title || "Community Moment",
        description: postForm.description,
        timestamp: new Date().toISOString(),
        ...(postForm.vendorId ? { vendorId: postForm.vendorId } : {})
      };

      onAddPost(newPost);
      setPostForm({ title: '', description: '', type: 'image', url: '', vendorId: '' });
      setSelectedPostFile(null);
      if (postFileInputRef.current) postFileInputRef.current.value = "";
    } catch (err) {
      showNotification("Failed to publish post.", 'info');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryForm.name.trim()) return;
    
    setIsUploading(true);
    try {
      let imageUrl = newCategoryForm.image || 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=600';
      if (selectedCategoryFile) {
        imageUrl = await uploadFile(selectedCategoryFile, 'categories');
      }

      const subCats = newCategoryForm.subCatsString
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      const defaultSubs: Record<string, string[]> = {};
      subCats.forEach(sc => defaultSubs[sc] = []);

      onAddCategory(newCategoryForm.name.trim(), imageUrl, []);
      onUpdateCategorySubCategories(newCategoryForm.name.trim(), defaultSubs);
      
      setNewCategoryForm({ name: '', image: '', subCatsString: '' });
      setSelectedCategoryFile(null);
      if (newCatImageInputRef.current) newCatImageInputRef.current.value = "";
    } catch (err) {
      showNotification("Failed to add category.", 'info');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddSubCategory = (category: string) => {
    const newSub = newSubCategoryInputs[category];
    if (!newSub?.trim()) return;
    const currentSubs = categorySubCategories[category] || {};
    if (currentSubs[newSub.trim()]) { showNotification("Classification group already exists!", 'info'); return; }
    
    onUpdateCategorySubCategories(category, { 
      ...currentSubs, 
      [newSub.trim()]: [] 
    });
    setNewSubCategoryInputs(prev => ({ ...prev, [category]: '' }));
  };

  const handleRemoveSubCategory = (category: string, sub: string) => {
    const currentSubs = { ...categorySubCategories[category] };
    delete currentSubs[sub];
    onUpdateCategorySubCategories(category, currentSubs);
  };

  const handleAddNestedSubCategory = (category: string, sub: string) => {
    const key = `${category}-${sub}`;
    const newNested = newNestedSubCategoryInputs[key];
    if (!newNested?.trim()) return;
    
    const currentSubs = { ...categorySubCategories[category] };
    const nestedList = currentSubs[sub] || [];
    
    if (nestedList.includes(newNested.trim())) { showNotification("Option already exists!", 'info'); return; }
    
    currentSubs[sub] = [...nestedList, newNested.trim()];
    onUpdateCategorySubCategories(category, currentSubs);
    setNewNestedSubCategoryInputs(prev => ({ ...prev, [key]: '' }));
  };

  const handleRemoveNestedSubCategory = (category: string, sub: string, nested: string) => {
    const currentSubs = { ...categorySubCategories[category] };
    currentSubs[sub] = (currentSubs[sub] || []).filter(n => n !== nested);
    onUpdateCategorySubCategories(category, currentSubs);
  };

  const toggleSubCategorySelection = (sub: string) => {
    setFormData(prev => ({
      ...prev,
      subCategories: prev.subCategories.includes(sub)
        ? prev.subCategories.filter(s => s !== sub)
        : [...prev.subCategories, sub]
    }));
  };

  const handleDeleteVendor = (id: string, name: string) => {
    onRemoveVendor(id);
  };

  const inputClass = "w-full bg-black border border-[#D4AF37]/20 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-[#D4AF37] outline-none transition-all placeholder:text-slate-600";
  const labelClass = "block text-[10px] font-bold text-[#D4AF37]/70 uppercase tracking-widest mb-1.5";

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-[#111] rounded-2xl p-8 max-w-md w-full shadow-2xl border border-[#D4AF37]/20">
          <div className="text-center mb-8">
            <div className="bg-black w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[#D4AF37]/30">
              <ShieldCheck className="w-8 h-8 text-[#D4AF37]" />
            </div>
            <h2 className="text-2xl font-bold font-[Cinzel] text-[#D4AF37]">Admin Access</h2>
            <p className="text-slate-500 text-sm">System Restricted Area</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className={labelClass}>Access Code</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
                <input type="password" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} placeholder="Enter code" className={inputClass + " pl-10"} />
              </div>
              {error && <p className="text-red-500 text-xs mt-2 font-bold">{error}</p>}
            </div>
            <button type="submit" className="w-full bg-[#D4AF37] text-black font-bold py-3 rounded-lg hover:bg-[#E5C76B] transition-all shadow-lg mt-2">Unlock Panel</button>
            <button type="button" onClick={onBack} className="w-full text-slate-500 text-xs font-bold py-2 hover:text-[#D4AF37] transition-colors uppercase tracking-widest">Back to Marketplace</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-slate-100">
      <header className="bg-black border-b border-[#D4AF37]/20 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
             <div className="bg-[#111] p-2 rounded-lg border border-[#D4AF37]/20"><ShieldCheck className="w-6 h-6 text-[#D4AF37]" /></div>
             <div><h1 className="text-xl font-bold font-[Cinzel] text-[#D4AF37]">Simcha Admin</h1><p className="text-[10px] text-slate-500 uppercase tracking-widest">Platform Management</p></div>
          </div>
          <div className="flex gap-6">
            <button onClick={onBack} className="text-slate-400 hover:text-[#D4AF37] font-bold text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"><ArrowLeft className="w-4 h-4" /> Marketplace</button>
            <button onClick={() => setIsAuthenticated(false)} className="text-red-500 hover:text-red-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"><LogOut className="w-4 h-4" /> Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12">
        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="bg-[#111] p-6 rounded-2xl border border-[#D4AF37]/10 shadow-xl">
                <p className="text-[10px] font-black text-[#D4AF37]/60 uppercase tracking-widest mb-2">Total Volume</p>
                <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-bold text-white">${totalPaidVolume.toLocaleString()}</h3>
                    <BarChart3 className="w-8 h-8 text-[#D4AF37]/20" />
                </div>
            </div>
            <div className="bg-[#111] p-6 rounded-2xl border border-[#D4AF37]/10 shadow-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#D4AF37]/5 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110"></div>
                <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest mb-2">Platform Revenue (Dynamic)</p>
                <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-bold text-[#D4AF37]">${totalCommission.toLocaleString()}</h3>
                    <Wallet className="w-8 h-8 text-[#D4AF37]/40" />
                </div>
            </div>
            <div className="bg-[#111] p-6 rounded-2xl border border-[#D4AF37]/10 shadow-xl">
                <p className="text-[10px] font-black text-[#D4AF37]/60 uppercase tracking-widest mb-2">Active Professionals</p>
                <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-bold text-white">{vendors.length}</h3>
                    <User className="w-8 h-8 text-[#D4AF37]/20" />
                </div>
            </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-start md:justify-center mb-10 overflow-x-auto pb-3 scrollbar-none">
            <div className="bg-[#111] p-1.5 rounded-xl border border-white/5 flex shrink-0 gap-1">
                {['manage', 'users', 'moderation', 'bookings', 'messages', 'stripe', 'posts', 'categories', 'analytics', 'add'].map(tab => {
                    const pendingVendorsCount = vendors.filter(v => !v.isVerified && !removedModerationIds.includes(v.id)).length;
                    const pendingUsersCount = users.filter(u => !(u as any).isApproved && !removedModerationIds.includes(u.id)).length;
                    const totalPendingCount = pendingVendorsCount + pendingUsersCount;

                    const getTabLabel = (t: string) => {
                        if (t === 'add') return editingVendor ? 'Edit Professional' : 'Add New';
                        if (t === 'manage') return 'Professionals';
                        if (t === 'users') return 'User Directory';
                        if (t === 'moderation') return 'Moderation Queue';
                        if (t === 'analytics') return 'Funnel Insights';
                        if (t === 'bookings') return 'Platform Bookings';
                        if (t === 'messages') return 'Inbox';
                        if (t === 'stripe') return 'Stripe Hub';
                        if (t === 'posts') return 'Moments';
                        if (t === 'categories') return 'Taxonomy';
                        return t;
                    };

                    const isActive = activeTab === tab;
                    return (
                        <button 
                            key={tab} 
                            onClick={() => {
                                setActiveTab(tab as any);
                                setFilterText(''); // reset search on change
                                if (tab !== 'add') setEditingVendor(null);
                            }} 
                            className={`px-5 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-200 flex items-center gap-2 shrink-0 ${
                                isActive 
                                    ? 'bg-[#D4AF37] text-black shadow-lg font-black' 
                                    : 'text-slate-500 hover:text-white hover:bg-white/[0.02]'
                            }`}
                        >
                            <span>{getTabLabel(tab)}</span>
                            {tab === 'moderation' && totalPendingCount > 0 && (
                                <span className={`px-1.5 py-0.5 text-[8px] font-bold rounded-full ${
                                    isActive ? 'bg-black text-[#D4AF37]' : 'bg-[#D4AF37] text-black animate-pulse'
                                }`}>
                                    {totalPendingCount}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>

        {activeTab === 'add' && (
            <div className="bg-[#111] rounded-2xl border border-[#D4AF37]/10 shadow-2xl max-w-4xl mx-auto animate-in fade-in duration-300">
                <div className="bg-black p-6 border-b border-[#D4AF37]/20 flex items-center justify-between">
                    <div><h2 className="text-xl font-bold text-[#D4AF37] font-[Cinzel]">New Professional</h2><p className="text-slate-500 text-xs">Invite a new service provider to the platform.</p></div>
                    <Plus className="w-8 h-8 text-[#D4AF37]/20" />
                </div>
                <form onSubmit={handleVendorSubmit} className="p-8 space-y-10">
                    <div className="space-y-6">
                        <h3 className="text-xs font-black text-[#D4AF37] uppercase tracking-[0.2em] border-b border-[#D4AF37]/10 pb-2 flex items-center gap-2"><User className="w-4 h-4" /> Business Identity</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div><label className={labelClass}>Business Name</label><input required type="text" className={inputClass} value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} /></div>
                                <div><label className={labelClass}>Contact Email</label><input required type="email" className={inputClass} value={formData.contactEmail} onChange={(e) => setFormData({...formData, contactEmail: e.target.value})} placeholder="professional@example.com" /></div>
                                <div><label className={labelClass}>Primary Category</label><select className={inputClass + " bg-black"} value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})}>{categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select></div>
                            </div>
                            <div className="space-y-4">
                                <label className={labelClass}>Business Profile Image</label>
                                <div onClick={() => vendorFileInputRef.current?.click()} className="h-44 bg-black border-2 border-dashed border-[#D4AF37]/20 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-[#D4AF37]/50 transition-all overflow-hidden relative">
                                    {formData.image ? <img src={formData.image} className="w-full h-full object-cover" /> : <div className="text-center p-4"><ImageIcon className="w-8 h-8 text-[#D4AF37]/30 mx-auto mb-2" /><p className="text-slate-600 font-bold uppercase tracking-widest text-[9px]">Select Image</p></div>}
                                </div>
                                <input type="file" accept="image/*" className="hidden" ref={vendorFileInputRef} onChange={handleVendorFileUpload} />
                            </div>
                        </div>
                        <div><label className={labelClass}>Elevator Pitch / Description</label><textarea required rows={4} className={inputClass + " resize-none"} value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} /></div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-xs font-black text-[#D4AF37] uppercase tracking-[0.2em] border-b border-[#D4AF37]/10 pb-2 flex items-center gap-2"><Tag className="w-4 h-4" /> Detailed Classification</h3>
                        <div className="grid grid-cols-1 gap-8">
                            {Object.entries(categorySubCategories[formData.category] || {}).map(([classification, options]) => (
                                <div key={classification} className="space-y-3 bg-black/30 p-5 rounded-xl border border-white/5">
                                    <h4 className="text-[10px] font-black text-[#D4AF37]/60 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <ChevronRight className="w-3 h-3" /> {classification}
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {(options as string[]).map(option => (
                                            <button
                                                key={option}
                                                type="button"
                                                onClick={() => toggleSubCategorySelection(option)}
                                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                                                    formData.subCategories.includes(option)
                                                        ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                                                        : 'bg-black text-slate-400 border-white/10 hover:border-[#D4AF37]/50'
                                                }`}
                                            >
                                                {option}
                                            </button>
                                        ))}
                                        {(options as string[]).length === 0 && <p className="text-[9px] text-slate-700 italic">No specific options defined yet.</p>}
                                    </div>
                                </div>
                            ))}
                            {Object.keys(categorySubCategories[formData.category] || {}).length === 0 && (
                                <div className="py-6 bg-black/40 rounded-xl border border-dashed border-[#D4AF37]/10 text-center">
                                    <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">No detailed classifications defined for {formData.category}</p>
                                    <button type="button" onClick={() => setActiveTab('categories')} className="text-[9px] text-[#D4AF37] hover:underline mt-2 uppercase tracking-widest">Configure Taxonomy</button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-xs font-black text-[#D4AF37] uppercase tracking-[0.2em] border-b border-[#D4AF37]/10 pb-2 flex items-center gap-2"><DollarSign className="w-4 h-4" /> Financial Terms</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className={labelClass}>Commission Percentage (%)</label>
                                <div className="relative">
                                    <Tag className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" />
                                    <input required type="number" min="0" max="100" className={inputClass + " pl-10"} value={formData.commissionRate} onChange={(e) => setFormData({...formData, commissionRate: e.target.value})} />
                                </div>
                                <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mt-2">The percentage of each sale that goes to the platform.</p>
                            </div>
                            <div>
                                <label className={labelClass}>Starting Fee ($)</label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" />
                                    <input required type="number" className={inputClass + " pl-10"} value={formData.priceStart} onChange={(e) => setFormData({...formData, priceStart: e.target.value})} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-xs font-black text-[#D4AF37] uppercase tracking-[0.2em] border-b border-[#D4AF37]/10 pb-2 flex items-center gap-2"><MapPin className="w-4 h-4" /> Logistics</h3>
                        <div className="grid grid-cols-1 gap-6">
                            <div><label className={labelClass}>Location (City, State)</label><input required type="text" className={inputClass} value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} /></div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-xs font-black text-[#D4AF37] uppercase tracking-[0.2em] border-b border-[#D4AF37]/10 pb-2 flex items-center gap-2"><Key className="w-4 h-4" /> Credential Configuration</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="relative">
                                <label className={labelClass}>Portal Username</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" />
                                    <input required type="text" className={inputClass + " pl-10"} placeholder="e.g. janes_catering" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} />
                                </div>
                            </div>
                            <div className="relative">
                                <label className={labelClass}>Portal Password</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" />
                                    <input required type="text" className={inputClass + " pl-10"} placeholder="Temporary password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button type="submit" disabled={isUploading || isOnboarding} className="w-full bg-black text-[#D4AF37] border border-[#D4AF37] font-bold py-4 rounded-xl hover:bg-[#D4AF37]/10 transition-all shadow-xl font-[Cinzel] text-lg uppercase tracking-widest disabled:opacity-50">
                            {editingVendor ? 'Update Professional' : 'Save Professional'}
                        </button>
                        {!editingVendor && (
                            <button type="button" onClick={(e) => handleVendorSubmit(e as any, true)} disabled={isUploading || isOnboarding} className="w-full bg-[#D4AF37] text-black font-bold py-4 rounded-xl hover:bg-[#E5C76B] transition-all shadow-xl font-[Cinzel] text-lg uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                                {isOnboarding ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                                Save & Start Stripe Onboarding
                            </button>
                        )}
                    </div>
                </form>
            </div>
        )}

        {activeTab === 'manage' && (
            <div className="space-y-4 animate-in fade-in duration-300">
                <div className="bg-[#111] p-4 rounded-xl border border-white/5 flex items-center gap-4 mb-6">
                    <Search className="w-5 h-5 text-slate-500" />
                    <input 
                        type="text" 
                        placeholder="Filter professionals by name, category, or location..." 
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="bg-transparent border-none outline-none text-sm w-full text-white" 
                    />
                </div>
                <TableContainer>
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="border-b border-white/10 bg-black/40 text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Professional</th>
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Classification</th>
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Location</th>
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Starting Price</th>
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Contact Email</th>
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Stripe Status</th>
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {vendors
                                .filter(v => 
                                    v.name.toLowerCase().includes(filterText.toLowerCase()) || 
                                    v.category.toLowerCase().includes(filterText.toLowerCase()) || 
                                    v.location.toLowerCase().includes(filterText.toLowerCase())
                                )
                                .map(v => (
                                    <tr key={v.id} className="hover:bg-white/[0.02] active:bg-white/[0.03] transition-colors duration-150">
                                        <td className="p-4 font-bold text-slate-100">
                                            <div className="flex items-center gap-3">
                                                <img src={v.image} className="w-10 h-10 rounded-lg object-cover bg-black border border-white/10 shrink-0" />
                                                <div>
                                                    <div className="font-bold text-white text-sm flex items-center gap-1.5">
                                                        {v.name}
                                                        {v.isVerified && <ShieldCheck className="w-3.5 h-3.5 text-green-500 fill-green-500/10" />}
                                                    </div>
                                                    <span className="text-[9px] text-slate-500 uppercase tracking-widest">{v.category}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                {v.subCategories?.slice(0, 3).map(s => (
                                                    <span key={s} className="bg-white/5 px-2 py-0.5 rounded text-[8px] font-black uppercase text-slate-400 tracking-widest">{s}</span>
                                                ))}
                                                {(v.subCategories?.length || 0) > 3 && <span className="text-[8px] text-slate-600 font-bold">+{v.subCategories!.length - 3}</span>}
                                                {(!v.subCategories || v.subCategories.length === 0) && <span className="text-slate-600 italic">None</span>}
                                            </div>
                                        </td>
                                        <td className="p-4 text-slate-400 font-medium">
                                            {v.location}
                                        </td>
                                        <td className="p-4 text-[#D4AF37] font-bold font-mono">
                                            ${v.priceStart.toLocaleString()}
                                        </td>
                                        <td className="p-4 text-slate-400 font-mono text-[11px]">
                                            {v.contactEmail || 'N/A'}
                                        </td>
                                        <td className="p-4">
                                            {v.stripeAccountId ? (
                                                <span className="inline-flex items-center gap-1.5 bg-green-500/15 border border-green-500/20 px-2 py-1 rounded text-[8px] font-black text-green-400 uppercase tracking-widest" title={`Stripe Account ID: ${v.stripeAccountId}`}>
                                                    <CheckSquare className="w-3 h-3" /> Stripe Active
                                                </span>
                                            ) : (
                                                <button onClick={() => handleStripeOnboard(v.id, v.contactEmail || '')} className="inline-flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/25 px-2 py-1 rounded text-[8px] font-black text-red-400 uppercase tracking-widest transition-all cursor-pointer" title="Initiate Connection">
                                                    <CreditCard className="w-3 h-3" /> Connect Stripe
                                                </button>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <button onClick={() => onLoginAsVendor(v.id)} title="Login to Portal" className="p-2 text-slate-500 hover:text-[#D4AF37] hover:bg-white/5 rounded-lg transition-all"><LogIn className="w-4 h-4" /></button>
                                                <button onClick={() => handleEditVendor(v)} title="Edit Professional" className="p-2 text-slate-500 hover:text-[#D4AF37] hover:bg-white/5 rounded-lg transition-all"><Edit2 className="w-4 h-4" /></button>
                                                <button onClick={() => onToggleVerify(v.id)} title="Toggle Verification" className={`p-2 rounded-lg transition-all ${v.isVerified ? 'text-green-500 hover:bg-green-500/10' : 'text-slate-500 hover:text-white hover:bg-white/5'}`}><ShieldCheck className="w-4 h-4" /></button>
                                                <button onClick={() => handleDeleteVendor(v.id, v.name)} title="Remove Professional" className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            {vendors.filter(v => 
                                v.name.toLowerCase().includes(filterText.toLowerCase()) || 
                                v.category.toLowerCase().includes(filterText.toLowerCase()) || 
                                v.location.toLowerCase().includes(filterText.toLowerCase())
                            ).length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-slate-500 uppercase tracking-widest text-[10px]">No professionals found</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </TableContainer>
            </div>
        )}

        {activeTab === 'posts' && (
            <div className="space-y-12 max-w-5xl mx-auto animate-in fade-in duration-300">
                <div className="bg-[#111] rounded-2xl border border-[#D4AF37]/10 shadow-2xl overflow-hidden">
                    <div className="bg-black p-6 border-b border-[#D4AF37]/20 flex items-center justify-between">
                        <div><h2 className="text-xl font-bold text-[#D4AF37] font-[Cinzel]">Moment Publisher</h2><p className="text-slate-500 text-xs">Establish new visual highlights.</p></div>
                        <Camera className="w-8 h-8 text-[#D4AF37]/20" />
                    </div>
                    <form onSubmit={handlePostSubmit} className="p-8 space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div><label className={labelClass}>Visual Title</label><input required type="text" className={inputClass} value={postForm.title} onChange={(e) => setPostForm({...postForm, title: e.target.value})} placeholder="e.g. Brooklyn Gala" /></div>
                                <div><label className={labelClass}>Brief Context</label><textarea required rows={4} className={inputClass + " resize-none"} value={postForm.description} onChange={(e) => setPostForm({...postForm, description: e.target.value})} placeholder="Contextual description..." /></div>
                                <div>
                                    <label className={labelClass}>Associate Professional</label>
                                    <select className={inputClass + " bg-black"} value={postForm.vendorId} onChange={(e) => setPostForm({...postForm, vendorId: e.target.value})}>
                                        <option value="">Independent Highlight</option>
                                        {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-6">
                                <label className={labelClass}>Source File</label>
                                <div onClick={() => postFileInputRef.current?.click()} className="aspect-square bg-black border-2 border-dashed border-[#D4AF37]/20 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-[#D4AF37]/50 transition-all overflow-hidden relative group">
                                    {isUploading ? (
                                        <Loader2 className="w-10 h-10 text-[#D4AF37] animate-spin" />
                                    ) : postForm.url ? (
                                        <>{postForm.type === 'video' ? <video src={postForm.url} className="w-full h-full object-cover" /> : <img src={postForm.url} className="w-full h-full object-cover" />}</>
                                    ) : (
                                        <div className="text-center p-8">
                                            <Upload className="w-12 h-12 text-[#D4AF37]/30 mx-auto mb-4" />
                                            <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Upload Visual Asset</p>
                                        </div>
                                    )}
                                </div>
                                <input type="file" ref={postFileInputRef} className="hidden" accept="image/*,video/*" onChange={handleFileUpload} />
                            </div>
                        </div>
                        <button type="submit" disabled={isUploading || !postForm.url} className="w-full bg-[#D4AF37] text-black font-bold py-4 rounded-xl hover:bg-[#E5C76B] transition-all shadow-xl text-lg disabled:opacity-30">Publish Highlight</button>
                    </form>
                </div>
            </div>
        )}

        {activeTab === 'categories' && (
          <div className="space-y-12 max-w-5xl mx-auto pb-20 animate-in fade-in duration-300">
              {/* Hero Visual System */}
              <div className="bg-[#111] rounded-2xl border border-[#D4AF37]/10 shadow-2xl overflow-hidden">
                  <div className="bg-black p-6 border-b border-[#D4AF37]/20 flex items-center justify-between">
                      <div><h2 className="text-xl font-bold text-[#D4AF37] font-[Cinzel]">Global Aesthetic</h2><p className="text-slate-500 text-xs">Manage the landing page visual identity.</p></div>
                      <Camera className="w-8 h-8 text-[#D4AF37]/20" />
                  </div>
                  <div className="p-8">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                        <div className="md:col-span-1 space-y-4">
                           <h3 className={labelClass}>Hero Background</h3>
                           <p className="text-[10px] text-slate-500 leading-relaxed">This image appears behind the "Celebrate Your Simcha" title. High-resolution horizontal assets work best.</p>
                           <button 
                             onClick={() => heroImageInputRef.current?.click()} 
                             disabled={isUploading}
                             className="w-full bg-[#D4AF37] text-black font-black py-3 rounded-lg hover:bg-[#E5C76B] transition-all uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
                           >
                             {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                             Change Hero Image
                           </button>
                           <input type="file" accept="image/*" className="hidden" ref={heroImageInputRef} onChange={handleHeroBackgroundUpload} />
                        </div>
                        <div className="md:col-span-2">
                           <div className="aspect-[21/9] bg-black rounded-xl border border-[#D4AF37]/20 overflow-hidden relative group">
                              <img src={previewUrls['hero'] || heroBackgroundUrl} className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-1000" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
                              <div className="absolute bottom-4 left-6">
                                 <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.3em]">Live Preview</p>
                              </div>
                              
                              {typeof uploadProgresses['hero'] === 'number' && (
                                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-10 transition-opacity">
                                  <div className="w-12 h-12 border-2 border-[#D4AF37]/20 border-t-[#D4AF37] rounded-full animate-spin shadow-[0_0_15px_rgba(212,175,55,0.3)]"></div>
                                  <div className="text-[#D4AF37] font-bold text-[10px] mt-3 tracking-widest">{Math.round(uploadProgresses['hero'])}%</div>
                                </div>
                              )}
                           </div>
                        </div>
                     </div>
                  </div>
              </div>

              {/* Add New Category */}
              <div className="bg-[#111] rounded-2xl border border-[#D4AF37]/10 shadow-2xl overflow-hidden">
                  <div className="bg-black p-6 border-b border-[#D4AF37]/20 flex items-center justify-between">
                      <div><h2 className="text-xl font-bold text-[#D4AF37] font-[Cinzel]">Taxonomy Expansion</h2><p className="text-slate-500 text-xs">Establish a new service category for the platform.</p></div>
                      <FolderPlus className="w-8 h-8 text-[#D4AF37]/20" />
                  </div>
                  <form onSubmit={handleAddCategorySubmit} className="p-8 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-6">
                              <div><label className={labelClass}>Vertical Title</label><input required type="text" className={inputClass} placeholder="e.g. Sound & Lighting" value={newCategoryForm.name} onChange={e => setNewCategoryForm({...newCategoryForm, name: e.target.value})} /></div>
                              <div>
                                <label className={labelClass}>Initial Classification Groups</label>
                                <input type="text" className={inputClass} placeholder="Style, Tier, Gear (comma separated)" value={newCategoryForm.subCatsString} onChange={e => setNewCategoryForm({...newCategoryForm, subCatsString: e.target.value})} />
                                <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mt-2">These serve as headers for granular sub-categories.</p>
                              </div>
                          </div>
                          <div className="space-y-4">
                              <label className={labelClass}>Vertical Hero Asset</label>
                              <div onClick={() => newCatImageInputRef.current?.click()} className="h-44 bg-black border-2 border-dashed border-[#D4AF37]/20 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-[#D4AF37]/50 transition-all overflow-hidden relative">
                                {newCategoryForm.image ? <img src={newCategoryForm.image} className="w-full h-full object-cover" /> : <div className="text-center p-4"><ImageIcon className="w-8 h-8 text-[#D4AF37]/30 mx-auto mb-2" /><p className="text-slate-600 font-bold uppercase tracking-widest text-[9px]">Select Banner</p></div>}
                              </div>
                              <input type="file" accept="image/*" className="hidden" ref={el => { newCatImageInputRef.current = el; }} onChange={handleNewCategoryImgUpload} />
                          </div>
                      </div>
                      <button type="submit" className="w-full bg-[#D4AF37] text-black font-bold py-4 rounded-xl hover:bg-[#E5C76B] transition-all text-xs uppercase tracking-[0.2em]">Commit New Vertical</button>
                  </form>
              </div>

              {/* Advanced Taxonomy Management */}
              <div className="space-y-8">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <div className="flex items-center gap-3">
                        <ListTree className="w-6 h-6 text-[#D4AF37]" />
                        <h3 className="text-xl font-bold font-[Cinzel] text-white">Active Taxonomy Control</h3>
                    </div>
                    {onSeedTaxonomy && (
                        <button 
                            type="button" 
                            disabled={isSeedingTaxonomy}
                            onClick={async () => { 
                                if(window.confirm('This will populate the entire detailed Jewish Event taxonomy structure. Proceed?')) { 
                                    setIsSeedingTaxonomy(true);
                                    try {
                                        await handleSeed(); 
                                    } finally {
                                        setIsSeedingTaxonomy(false);
                                    }
                                } 
                            }} 
                            className="px-4 py-2 bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37] hover:bg-[#D4AF37] hover:text-black transition-all rounded text-[10px] font-bold uppercase tracking-widest cursor-pointer shadow-[0_0_15px_rgba(212,175,55,0.2)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isSeedingTaxonomy ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Seeding Database...
                              </>
                            ) : (
                              'Seed Taxonomy'
                            )}
                        </button>
                    )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {categories.map(cat => (
                        <div key={cat} className="bg-[#111] rounded-2xl border border-[#D4AF37]/10 overflow-hidden flex flex-col shadow-2xl group relative">
                            <div className="relative h-44 bg-black">
                                <img src={previewUrls[cat] || categoryImages[cat]} className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700" />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#111] via-transparent to-black/30"></div>
                                <button onClick={() => categoryImageInputRefs.current[cat]?.click()} className="absolute top-4 right-4 bg-black/60 hover:bg-[#D4AF37] hover:text-black p-2 rounded-lg text-slate-300 transition-all border border-white/10" title="Modify Banner"><Camera className="w-4 h-4" /></button>
                                <input type="file" accept="image/*" className="hidden" ref={el => { categoryImageInputRefs.current[cat] = el; }} onChange={(e) => handleCategoryImageUpload(cat, e)} />
                                <h3 className="absolute bottom-4 left-6 text-2xl font-bold font-[Cinzel] text-[#D4AF37]">{cat}</h3>
                                
                                {typeof uploadProgresses[cat] === 'number' && (
                                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-10 transition-opacity">
                                    <div className="w-12 h-12 border-2 border-[#D4AF37]/20 border-t-[#D4AF37] rounded-full animate-spin shadow-[0_0_15px_rgba(212,175,55,0.3)]"></div>
                                    <div className="text-[#D4AF37] font-bold text-xs mt-3 tracking-widest">{Math.round(uploadProgresses[cat])}%</div>
                                  </div>
                                )}
                            </div>
                            
                            <div className="p-6 space-y-6">
                                <div className="space-y-2">
                                    <label className={labelClass}>Establish New Classification Group</label>
                                    <div className="flex gap-2">
                                        <input type="text" className={inputClass + " py-2 text-xs"} placeholder="e.g. Menu Grade, Room Type..." value={newSubCategoryInputs[cat] || ''} onChange={(e) => setNewSubCategoryInputs({...newSubCategoryInputs, [cat]: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && handleAddSubCategory(cat)} />
                                        <button onClick={() => handleAddSubCategory(cat)} className="bg-[#D4AF37] text-black p-2 rounded-lg hover:bg-[#E5C76B] transition-colors"><Plus className="w-5 h-5" /></button>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                   {Object.entries(categorySubCategories[cat] || {}).map(([sub, nestedItems]) => {
                                      const nestedKey = `${cat}-${sub}`;
                                      const items = nestedItems as string[];
                                      return (
                                          <div key={sub} className="bg-black/30 rounded-xl border border-white/5 overflow-hidden">
                                              <div className="p-3 flex items-center justify-between border-b border-white/5 bg-black/20">
                                                  <div className="flex items-center gap-2">
                                                      <Layers className="w-3.5 h-3.5 text-[#D4AF37]/50" />
                                                      <span className="text-[10px] font-black uppercase text-slate-300 tracking-widest">{sub}</span>
                                                  </div>
                                                  <button onClick={() => handleRemoveSubCategory(cat, sub)} className="text-red-500/30 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                              </div>
                                              <div className="p-4 space-y-4">
                                                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                                      {items.map(item => (
                                                          <div key={item} className="relative group overflow-hidden bg-black/40 rounded-xl border border-white/5 aspect-square flex flex-col">
                                                              <div className="flex-1 relative">
                                                                  {(previewUrls[item] || subCategoryImages[item]) ? (
                                                                      <img src={previewUrls[item] || subCategoryImages[item]} alt={item} className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
                                                                  ) : (
                                                                      <div className="w-full h-full bg-zinc-900 flex items-center justify-center">
                                                                          <ImageIcon className="w-6 h-6 text-zinc-700" />
                                                                      </div>
                                                                  )}
                                                                  <button onClick={() => subCategoryImageInputRefs.current[item]?.click()} className="absolute inset-0 m-auto w-8 h-8 bg-black/60 hover:bg-[#D4AF37] hover:text-black rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all border border-white/10" title="Modify Image"><Camera className="w-4 h-4" /></button>
                                                                  <input type="file" accept="image/*" className="hidden" ref={el => { subCategoryImageInputRefs.current[item] = el; }} onChange={(e) => handleSubCategoryImageUpload(item, e)} />
                                                                  
                                                                  {typeof uploadProgresses[item] === 'number' && (
                                                                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-10 transition-opacity">
                                                                      <div className="w-6 h-6 border-2 border-[#D4AF37]/20 border-t-[#D4AF37] rounded-full animate-spin shadow-[0_0_10px_rgba(212,175,55,0.3)]"></div>
                                                                      <div className="text-[#D4AF37] font-bold text-[8px] mt-2 tracking-widest">{Math.round(uploadProgresses[item])}%</div>
                                                                    </div>
                                                                  )}
                                                              </div>
                                                              <div className="p-2 bg-black border-t border-white/5 flex items-center justify-between">
                                                                  <span className="text-[10px] font-bold text-slate-300 truncate">{item}</span>
                                                                  <button onClick={() => handleRemoveNestedSubCategory(cat, sub, item)} className="text-red-500/50 hover:text-red-500 transition-colors shrink-0 ml-2" title="Remove subcategory"><Trash2 className="w-3 h-3" /></button>
                                                              </div>
                                                          </div>
                                                      ))}
                                                      {items.length === 0 && <span className="text-[9px] text-slate-700 italic col-span-full">No specific sub-category options added.</span>}
                                                  </div>
                                                  <div className="flex gap-2 pt-1">
                                                      <input type="text" className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-slate-400 outline-none focus:border-[#D4AF37]/40" placeholder={`Add ${sub} option...`} value={newNestedSubCategoryInputs[nestedKey] || ''} onChange={(e) => setNewNestedSubCategoryInputs({...newNestedSubCategoryInputs, [nestedKey]: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && handleAddNestedSubCategory(cat, sub)} />
                                                      <button onClick={() => handleAddNestedSubCategory(cat, sub)} className="bg-[#D4AF37]/10 text-[#D4AF37] px-2 rounded-lg hover:bg-[#D4AF37] hover:text-black transition-all"><Plus className="w-4 h-4" /></button>
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                   })}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
              </div>
          </div>
        )}

        {activeTab === 'bookings' && (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <h2 className="text-2xl font-bold font-[Cinzel] text-white">Platform Bookings</h2>
                        <p className="text-xs text-slate-500 mt-1">Unified transactional records across the entire marketplace.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="bg-[#111] px-4 py-2 rounded-xl border border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            Total Bookings: {bookings.length}
                        </div>
                    </div>
                </div>

                <div className="bg-[#111] p-4 rounded-xl border border-white/5 flex items-center gap-4 mb-6">
                    <Search className="w-5 h-5 text-slate-500" />
                    <input 
                        type="text" 
                        placeholder="Filter bookings by client name, event name, or professional..." 
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="bg-transparent border-none outline-none text-sm w-full text-white" 
                    />
                </div>

                <TableContainer>
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="border-b border-white/10 bg-black/40 text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Client & Event</th>
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Professional</th>
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Date</th>
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Transaction Amount</th>
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Payment Status</th>
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Confirmation</th>
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {bookings
                                .filter(b => {
                                    const vendor = vendors.find(v => v.id === b.vendorId);
                                    const vendorName = vendor?.name || 'Unknown';
                                    return (
                                        b.clientName.toLowerCase().includes(filterText.toLowerCase()) ||
                                        b.eventName.toLowerCase().includes(filterText.toLowerCase()) ||
                                        vendorName.toLowerCase().includes(filterText.toLowerCase())
                                    );
                                })
                                .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                                .map(b => {
                                    const vendor = vendors.find(v => v.id === b.vendorId);
                                    return (
                                        <tr key={b.id} className="hover:bg-white/[0.02] active:bg-white/[0.03] transition-colors duration-150">
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="bg-black p-2 rounded-lg border border-white/5 text-[#D4AF37] shrink-0">
                                                        <LayoutList className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-white text-sm">{b.clientName}</h4>
                                                        <span className="text-[10px] text-slate-500 uppercase tracking-widest">{b.eventName}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 font-semibold text-[#D4AF37] text-sm">
                                                {vendor?.name || 'Unknown'}
                                            </td>
                                            <td className="p-4 text-slate-400 font-mono text-[11px]">
                                                {b.date}
                                            </td>
                                            <td className="p-4 font-bold text-white text-sm font-mono">
                                                ${b.amount.toLocaleString()}
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                                                    b.paymentStatus === 'paid' 
                                                        ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                                                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                                                }`}>
                                                    {b.paymentStatus}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                                                    b.status === 'confirmed' 
                                                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' 
                                                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                }`}>
                                                    {b.status}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right">
                                                <button 
                                                    onClick={() => onUpdateBookingStatus(b.id, b.status === 'confirmed' ? 'pending' : 'confirmed')}
                                                    className={`p-2 rounded-lg transition-all ${
                                                        b.status === 'confirmed' 
                                                            ? 'bg-green-500/10 text-green-500' 
                                                            : 'bg-white/5 text-slate-500 hover:text-[#D4AF37]'
                                                    }`}
                                                    title="Toggle Confirmation"
                                                >
                                                    <ShieldCheck className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            {bookings.filter(b => {
                                const vendor = vendors.find(v => v.id === b.vendorId);
                                const vendorName = vendor?.name || 'Unknown';
                                return (
                                    b.clientName.toLowerCase().includes(filterText.toLowerCase()) ||
                                    b.eventName.toLowerCase().includes(filterText.toLowerCase()) ||
                                    vendorName.toLowerCase().includes(filterText.toLowerCase())
                                );
                            }).length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-slate-500 uppercase tracking-widest text-[10px]">No bookings logged</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </TableContainer>
            </div>
        )}

        {activeTab === 'stripe' && (
            <div className="space-y-8 animate-in fade-in duration-300">
                <div className="bg-[#111] p-8 rounded-3xl border border-[#D4AF37]/10 shadow-2xl">
                    <h3 className="text-xl font-bold font-[Cinzel] text-[#D4AF37] mb-6">Stripe Connection Hub</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-black/40 p-6 rounded-2xl border border-white/5">
                            <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mb-1">Connected Vendors</p>
                            <h4 className="text-3xl font-bold text-white">{vendors.filter(v => !!v.stripeAccountId).length}</h4>
                        </div>
                        <div className="bg-black/40 p-6 rounded-2xl border border-white/5">
                            <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mb-1">Pending Connections</p>
                            <h4 className="text-3xl font-bold text-white">{vendors.filter(v => !v.stripeAccountId).length}</h4>
                        </div>
                        <div className="bg-black/40 p-6 rounded-2xl border border-white/5">
                            <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mb-1">Platform Revenue</p>
                            <h4 className="text-3xl font-bold text-[#D4AF37]">${totalCommission.toLocaleString()}</h4>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">Vendor Stripe Status</h4>
                        {vendors.map(v => (
                            <div key={v.id} className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/5">
                                <div className="flex items-center gap-4">
                                    <img src={v.image} className="w-10 h-10 rounded-lg object-cover" />
                                    <div>
                                        <p className="text-sm font-bold text-white">{v.name}</p>
                                        <p className="text-[9px] text-slate-500 uppercase tracking-widest">{v.contactEmail}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    {v.stripeAccountId ? (
                                        <div className="flex flex-col items-end">
                                            <span className="text-[9px] font-black text-green-500 uppercase tracking-widest flex items-center gap-1">
                                                <ShieldCheck className="w-3 h-3" /> Connected
                                            </span>
                                            <span className="text-[8px] text-slate-600 font-mono">{v.stripeAccountId}</span>
                                            <button 
                                                onClick={() => handleManualStripeId(v.id)}
                                                className="text-[8px] text-[#D4AF37] hover:underline mt-1 uppercase tracking-widest font-bold"
                                            >
                                                Change ID
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => handleStripeOnboard(v.id, v.contactEmail || '')}
                                                className="px-4 py-2 bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-[#D4AF37] hover:text-black transition-all"
                                            >
                                                Initiate Onboarding
                                            </button>
                                            <button 
                                                onClick={() => handleManualStripeId(v.id)}
                                                className="p-2 bg-white/5 text-slate-400 border border-white/10 rounded-lg hover:text-white transition-all"
                                                title="Manually Set ID"
                                            >
                                                <Settings className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'users' && (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                    <div>
                        <h2 className="text-2xl font-bold font-[Cinzel] text-white">User Directory</h2>
                        <p className="text-xs text-slate-500 mt-1">Manage active platform registrants and client profiles.</p>
                    </div>
                    <div className="bg-[#111] px-4 py-2 rounded-xl border border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Total Users: {users.length}
                    </div>
                </div>

                <div className="bg-[#111] p-4 rounded-xl border border-white/5 flex items-center gap-4 mb-6">
                    <Search className="w-5 h-5 text-slate-500" />
                    <input 
                        type="text" 
                        placeholder="Filter users by name or email..." 
                        value={filterText}
                        onChange={(e) => setFilterText(e.target.value)}
                        className="bg-transparent border-none outline-none text-sm w-full text-white" 
                    />
                </div>

                <TableContainer>
                    <table className="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr className="border-b border-white/10 bg-black/40 text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">User Profile</th>
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">User ID</th>
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Contact Email</th>
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Account Status</th>
                                <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {users
                                .filter(u => 
                                    (u.name || '').toLowerCase().includes(filterText.toLowerCase()) || 
                                    (u.username || '').toLowerCase().includes(filterText.toLowerCase())
                                )
                                .map(u => (
                                    <tr key={u.id} className="hover:bg-white/[0.02] active:bg-white/[0.03] transition-colors duration-150">
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                {u.photoURL ? (
                                                    <img src={u.photoURL} className="w-9 h-9 rounded-full object-cover bg-black border border-white/10 shrink-0" />
                                                ) : (
                                                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-zinc-800 to-zinc-700 border border-white/10 flex items-center justify-center font-bold text-white text-xs uppercase shrink-0">
                                                        {(u.name || u.username || 'U').slice(0, 2)}
                                                    </div>
                                                )}
                                                <div>
                                                    <h4 className="font-bold text-white text-sm">{u.name || 'Anonymous User'}</h4>
                                                    <span className="text-[9px] text-slate-500 uppercase tracking-widest">
                                                        {(u as any).role || 'Client'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 font-mono text-slate-500 text-[10px]">
                                            {u.id}
                                        </td>
                                        <td className="p-4 text-slate-300 font-mono text-xs">
                                            {u.username || 'N/A'}
                                        </td>
                                        <td className="p-4">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                                                (u as any).isApproved || (u as any).role === 'admin'
                                                    ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                                                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                            }`}>
                                                {(u as any).isApproved || (u as any).role === 'admin' ? 'Approved' : 'Deactivated'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {!(u as any).isApproved && (u as any).role !== 'admin' && (
                                                    <button 
                                                        onClick={async () => {
                                                            setModerationActioning(prev => ({ ...prev, [u.id]: 'approve' }));
                                                            await new Promise(r => setTimeout(r, 800));
                                                            try {
                                                                await updateDoc(doc(db, 'users', u.id), { isApproved: true });
                                                                showNotification('User profile approved successfully.', 'success');
                                                            } catch (err: any) {
                                                                showNotification('Failed to approve: ' + err.message, 'info');
                                                            } finally {
                                                                setModerationActioning(prev => { const c = { ...prev }; delete c[u.id]; return c; });
                                                            }
                                                        }}
                                                        title="Approve User Account" 
                                                        className="p-2 text-slate-500 hover:text-green-500 hover:bg-green-500/10 rounded-lg transition-all"
                                                    >
                                                        <ShieldCheck className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button 
                                                    onClick={async () => {
                                                        if (window.confirm(`Are you sure you want to permanently delete user ${u.name || u.username}?`)) {
                                                            try {
                                                                await deleteDoc(doc(db, 'users', u.id));
                                                                showNotification('User profile deleted successfully.', 'success');
                                                            } catch (err: any) {
                                                                showNotification('Failed to delete user: ' + err.message, 'info');
                                                            }
                                                        }
                                                    }}
                                                    title="Permanently Delete User" 
                                                    className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            {users.filter(u => 
                                (u.name || '').toLowerCase().includes(filterText.toLowerCase()) || 
                                (u.username || '').toLowerCase().includes(filterText.toLowerCase())
                            ).length === 0 && (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-slate-500 uppercase tracking-widest text-[10px]">No users registered</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </TableContainer>
            </div>
        )}

        {activeTab === 'moderation' && (() => {
            const pendingVendors = vendors.filter(v => !v.isVerified && !removedModerationIds.includes(v.id));
            const pendingUsers = users.filter(u => !(u as any).isApproved && (u as any).role !== 'admin' && !removedModerationIds.includes(u.id));
            
            const moderationQueueItems = [
                ...pendingVendors.map(v => ({
                    id: v.id,
                    type: 'professional' as const,
                    name: v.name,
                    email: v.contactEmail || 'N/A',
                    category: v.category,
                    image: v.image,
                    details: `${v.location} • Starting $${v.priceStart.toLocaleString()}`,
                    raw: v,
                })),
                ...pendingUsers.map(u => ({
                    id: u.id,
                    type: 'client' as const,
                    name: u.name || 'Anonymous Client',
                    email: u.username || 'N/A',
                    category: 'Client Access Request',
                    image: u.photoURL || '',
                    details: `Privileges: ${(u as any).role || 'Client'}`,
                    raw: u,
                }))
            ];

            const handleApproveAction = async (itemId: string, type: 'professional' | 'client') => {
                setModerationActioning(prev => ({ ...prev, [itemId]: 'approve' }));
                await new Promise(r => setTimeout(r, 850));
                
                try {
                    if (type === 'professional') {
                        await updateDoc(doc(db, 'vendors', itemId), { isVerified: true });
                        showNotification('Service provider approved and listed.', 'success');
                    } else {
                        await updateDoc(doc(db, 'users', itemId), { isApproved: true });
                        showNotification('Client credentials authorized.', 'success');
                    }
                    setRemovedModerationIds(prev => [...prev, itemId]);
                } catch (err: any) {
                    showNotification('Approval update failed: ' + err.message, 'info');
                } finally {
                    setModerationActioning(prev => { const c = { ...prev }; delete c[itemId]; return c; });
                }
            };

            const handleRejectAction = async (itemId: string, type: 'professional' | 'client', name: string) => {
                if (!window.confirm(`Are you sure you want to decline registration for ${name}?`)) return;
                setModerationActioning(prev => ({ ...prev, [itemId]: 'reject' }));
                await new Promise(r => setTimeout(r, 850));
                
                try {
                    if (type === 'professional') {
                        await deleteDoc(doc(db, 'vendors', itemId));
                        showNotification('Provider application declined and deleted.', 'success');
                    } else {
                        await deleteDoc(doc(db, 'users', itemId));
                        showNotification('Client request declined and deleted.', 'success');
                    }
                    setRemovedModerationIds(prev => [...prev, itemId]);
                } catch (err: any) {
                    showNotification('Rejection failed: ' + err.message, 'info');
                } finally {
                    setModerationActioning(prev => { const c = { ...prev }; delete c[itemId]; return c; });
                }
            };

            return (
                <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div>
                            <h2 className="text-2xl font-bold font-[Cinzel] text-white">Moderation Queue</h2>
                            <p className="text-xs text-slate-500 mt-1">Audit and authorize incoming vendor and client registrants.</p>
                        </div>
                        <div className="bg-[#111] px-4 py-2 rounded-xl border border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            Pending Audit: {moderationQueueItems.length}
                        </div>
                    </div>

                    <TableContainer>
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-white/10 bg-black/40 text-slate-400 font-bold uppercase tracking-widest text-[9px]">
                                    <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Applicant profile</th>
                                    <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Request Type</th>
                                    <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Credential Email</th>
                                    <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10">Summary / Particulars</th>
                                    <th className="p-4 sticky top-0 bg-[#0c0c0c] z-10 text-right">Moderation Actions</th>
                                </tr>
                            </thead>
                            <tbody className="relative divide-y divide-white/5">
                                <AnimatePresence mode="popLayout">
                                    {moderationQueueItems.map(item => {
                                        const action = moderationActioning[item.id];
                                        return (
                                            <motion.tr 
                                                key={item.id}
                                                layout
                                                initial={{ opacity: 0, y: 12 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ 
                                                    opacity: 0, 
                                                    x: action === 'approve' ? 120 : -120,
                                                    backgroundColor: action === 'approve' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                    transition: { duration: 0.4, ease: 'easeOut' }
                                                }}
                                                className="hover:bg-white/[0.02] active:bg-white/[0.03] transition-colors duration-150 relative"
                                            >
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        {item.image ? (
                                                            <img src={item.image} className="w-10 h-10 rounded-lg object-cover bg-black border border-white/10 shrink-0" />
                                                        ) : (
                                                            <div className="w-10 h-10 rounded-lg bg-zinc-800 border border-white/10 flex items-center justify-center font-bold text-slate-400 text-xs shrink-0">
                                                                {item.name.slice(0, 2).toUpperCase()}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <h4 className="font-bold text-white text-sm">{item.name}</h4>
                                                            <span className="text-[9px] text-slate-500 uppercase tracking-widest">{item.category}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-4">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${
                                                        item.type === 'professional'
                                                            ? 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20' 
                                                            : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                                    }`}>
                                                        {item.type}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-slate-300 font-mono text-xs">
                                                    {item.email}
                                                </td>
                                                <td className="p-4 text-slate-400">
                                                    {item.details}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button 
                                                            onClick={() => handleApproveAction(item.id, item.type)}
                                                            disabled={!!action}
                                                            className={`p-2 rounded-lg transition-all flex items-center justify-center min-w-[36px] min-h-[36px] ${
                                                                action === 'approve'
                                                                    ? 'bg-green-500/20 text-green-400'
                                                                    : 'text-slate-500 hover:text-green-500 hover:bg-green-500/10 cursor-pointer'
                                                            }`}
                                                            title="Approve Registration"
                                                        >
                                                            {action === 'approve' ? (
                                                                <motion.div
                                                                    initial={{ scale: 0.5, rotate: -45 }}
                                                                    animate={{ scale: 1.1, rotate: 0 }}
                                                                    className="bg-green-500 text-black p-1 rounded-full"
                                                                >
                                                                    <ShieldCheck className="w-3.5 h-3.5 stroke-[3.5]" />
                                                                </motion.div>
                                                            ) : (
                                                                <ShieldCheck className="w-5 h-5" />
                                                            )}
                                                        </button>
                                                        <button 
                                                            onClick={() => handleRejectAction(item.id, item.type, item.name)}
                                                            disabled={!!action}
                                                            className={`p-2 rounded-lg transition-all flex items-center justify-center min-w-[36px] min-h-[36px] ${
                                                                action === 'reject'
                                                                    ? 'bg-red-500/20 text-red-400'
                                                                    : 'text-slate-500 hover:text-red-500 hover:bg-red-500/10 cursor-pointer'
                                                            }`}
                                                            title="Decline registration"
                                                        >
                                                            {action === 'reject' ? (
                                                                <motion.div
                                                                    initial={{ scale: 0.5 }}
                                                                    animate={{ scale: [1.1, 1] }}
                                                                    className="bg-red-500 text-white p-1 rounded-full"
                                                                >
                                                                    <X className="w-3.5 h-3.5 stroke-[3.5]" />
                                                                </motion.div>
                                                            ) : (
                                                                <X className="w-5 h-5" />
                                                            )}
                                                        </button>
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </AnimatePresence>
                                {moderationQueueItems.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-slate-500 uppercase tracking-widest text-[10px]">Audit complete! Moderation queue is empty</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </TableContainer>
                </div>
            );
        })()}

        {activeTab === 'messages' && (() => {
            const lastMessagesByConversation: Record<string, Message> = {};
            const allMessagesByConversation: Record<string, Message[]> = {};
            messages.forEach(m => {
                if (!m) return;
                const cid = m.conversationId || (m.senderId === 'admin' ? `admin_${m.receiverId || 'unknown'}` : `${m.senderId || 'unknown'}_admin`);
                if (!lastMessagesByConversation[cid] || new Date(m.timestamp) > new Date(lastMessagesByConversation[cid].timestamp)) {
                    const msgCopy = { ...m, conversationId: cid };
                    lastMessagesByConversation[cid] = msgCopy;
                }
                if (!allMessagesByConversation[cid]) {
                    allMessagesByConversation[cid] = [];
                }
                allMessagesByConversation[cid].push(m);
            });

            const processedList = Object.values(lastMessagesByConversation).map(msg => {
                const cid = msg.conversationId || '';
                const isAdminSupport = msg.senderId === 'admin' || msg.receiverId === 'admin' || msg.participants?.includes('admin') || msg.isAdminInquiry;
                const hasUnread = (allMessagesByConversation[cid] || []).some(m => m.senderId !== 'admin' && !m.isRead);
                
                const { vendor: vendorDetails, client: clientDetails } = getConversationParticipants(msg);
                const otherId = getOtherUserId(msg);
                const otherUser = getOtherUserDetails(otherId, msg);

                return {
                    msg,
                    cid,
                    isAdminSupport,
                    hasUnread,
                    vendorDetails,
                    clientDetails,
                    otherUser
                };
            });

            const filteredList = processedList.filter(item => {
                const matchesSearch = convoSearchQuery === '' ||
                    item.clientDetails.name.toLowerCase().includes(convoSearchQuery.toLowerCase()) ||
                    item.clientDetails.email.toLowerCase().includes(convoSearchQuery.toLowerCase()) ||
                    item.vendorDetails.name.toLowerCase().includes(convoSearchQuery.toLowerCase()) ||
                    item.vendorDetails.email.toLowerCase().includes(convoSearchQuery.toLowerCase()) ||
                    (item.msg.text || '').toLowerCase().includes(convoSearchQuery.toLowerCase());

                const matchesType = convoTypeFilter === 'all' ||
                    (convoTypeFilter === 'admin' && item.isAdminSupport) ||
                    (convoTypeFilter === 'vendor_client' && !item.isAdminSupport);

                const matchesRead = convoReadFilter === 'all' ||
                    (convoReadFilter === 'unread' && item.hasUnread) ||
                    (convoReadFilter === 'read' && !item.hasUnread);

                return matchesSearch && matchesType && matchesRead;
            });

            filteredList.sort((a, b) => {
                if (convoSortBy === 'recent') {
                    return new Date(b.msg.timestamp).getTime() - new Date(a.msg.timestamp).getTime();
                } else if (convoSortBy === 'oldest') {
                    return new Date(a.msg.timestamp).getTime() - new Date(b.msg.timestamp).getTime();
                } else {
                    return a.clientDetails.name.localeCompare(b.clientDetails.name);
                }
            });

            return (
                <div className="space-y-6 animate-in slide-in-from-right-10 duration-500">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-[600px]">
                        {/* Inbox Sidebar */}
                        <div className="bg-[#111] rounded-2xl border border-white/5 overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-white/5 bg-black/40">
                                 <h3 className="font-bold text-[#D4AF37] font-[Cinzel] flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4" /> Message Inbox
                                 </h3>
                            </div>

                            {/* Search and Filters panel */}
                            <div className="p-4 border-b border-white/5 bg-zinc-950/40 space-y-3">
                                {/* Search bar */}
                                <div className="relative">
                                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                                    <input
                                        type="text"
                                        value={convoSearchQuery}
                                        onChange={(e) => setConvoSearchQuery(e.target.value)}
                                        placeholder="Search clients, vendors, texts..."
                                        className="w-full bg-black border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#D4AF37] transition-all"
                                    />
                                    {convoSearchQuery && (
                                        <button 
                                            onClick={() => setConvoSearchQuery('')}
                                            className="absolute right-3 top-2.5 text-slate-500 hover:text-white transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>

                                {/* Filter Grid */}
                                <div className="grid grid-cols-2 gap-2 text-[10px]">
                                    {/* Chat Type */}
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Chat Type</label>
                                        <div className="relative">
                                            <select
                                                value={convoTypeFilter}
                                                onChange={(e) => setConvoTypeFilter(e.target.value as any)}
                                                className="w-full bg-black border border-white/10 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:border-[#D4AF37] appearance-none cursor-pointer"
                                            >
                                                <option value="all">All Chats</option>
                                                <option value="admin">Support / Admin</option>
                                                <option value="vendor_client">Vendor-Client</option>
                                            </select>
                                            <ChevronDown className="absolute right-2 top-2.5 w-3 h-3 text-slate-500 pointer-events-none" />
                                        </div>
                                    </div>

                                    {/* Status */}
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Status</label>
                                        <div className="relative">
                                            <select
                                                value={convoReadFilter}
                                                onChange={(e) => setConvoReadFilter(e.target.value as any)}
                                                className="w-full bg-black border border-white/10 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:border-[#D4AF37] appearance-none cursor-pointer"
                                            >
                                                <option value="all">All Status</option>
                                                <option value="unread">Unread</option>
                                                <option value="read">Read</option>
                                            </select>
                                            <ChevronDown className="absolute right-2 top-2.5 w-3 h-3 text-slate-500 pointer-events-none" />
                                        </div>
                                    </div>
                                </div>

                                {/* Sort & Stats */}
                                <div className="flex justify-between items-center text-[10px] pt-2 border-t border-white/5">
                                    <div className="flex items-center gap-1.5">
                                        <ArrowUpDown className="w-3.5 h-3.5 text-[#D4AF37]" />
                                        <select
                                            value={convoSortBy}
                                            onChange={(e) => setConvoSortBy(e.target.value as any)}
                                            className="bg-transparent text-slate-300 focus:outline-none cursor-pointer font-medium"
                                        >
                                            <option value="recent">Newest First</option>
                                            <option value="oldest">Oldest First</option>
                                            <option value="alphabetical">Name A-Z</option>
                                        </select>
                                    </div>
                                    <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px]">
                                        Results: <span className="text-[#D4AF37]">{filteredList.length}</span>
                                    </span>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto">
                                {filteredList.length === 0 ? (
                                    <div className="p-12 text-center opacity-30 flex flex-col items-center justify-center">
                                        <Bot className="w-12 h-12 mx-auto mb-2 text-[#D4AF37]" />
                                        <p className="text-xs font-[Cinzel] font-bold text-[#D4AF37] uppercase tracking-wider">No chats found</p>
                                        <p className="text-[10px] mt-1 text-slate-400">Try adjusting your filters or search query.</p>
                                    </div>
                                ) : (
                                    filteredList.map(({ msg, cid, isAdminSupport, hasUnread, vendorDetails, clientDetails, otherUser }) => {
                                        const isSelected = selectedConversationId === cid || selectedInquiryEmail === otherUser.email;
                                        const itemBgClass = isSelected 
                                            ? 'bg-[#D4AF37]/5 border-r-2 border-r-[#D4AF37]' 
                                            : (hasUnread ? 'bg-white/[0.04] border-l-2 border-l-[#D4AF37]' : '');
                                        
                                        return (
                                            <div 
                                                key={cid || otherUser.id}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => {
                                                    setSelectedInquiryEmail(otherUser.email);
                                                    setSelectedConversationId(cid);
                                                    
                                                    // Auto mark unread incoming messages as read when opening conversation
                                                    if (cid && isAdminSupport) {
                                                        markChatAsRead(cid, 'admin').catch(console.error);
                                                    }
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        setSelectedInquiryEmail(otherUser.email);
                                                        setSelectedConversationId(cid);
                                                        
                                                        // Auto mark unread incoming messages as read when opening conversation
                                                        if (cid && isAdminSupport) {
                                                            markChatAsRead(cid, 'admin').catch(console.error);
                                                        }
                                                    }
                                                }}
                                                className={`w-full p-6 text-left border-b border-white/5 transition-all hover:bg-white/5 flex flex-col gap-1.5 cursor-pointer outline-none focus-visible:bg-white/5 ${itemBgClass}`}
                                            >
                                                <div className="flex justify-between items-center w-full gap-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        {hasUnread && (
                                                            <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse shadow-[0_0_8px_rgba(212,175,55,0.6)] flex-shrink-0"></span>
                                                        )}
                                                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isAdminSupport ? 'bg-emerald-400' : 'bg-[#D4AF37]'}`}></span>
                                                        
                                                        <h4 className={`text-white text-sm truncate max-w-[130px] ${hasUnread ? 'font-bold text-[#D4AF37]' : 'font-semibold'}`}>
                                                            {isAdminSupport ? `Support: ${clientDetails.name}` : `${clientDetails.name}`}
                                                        </h4>

                                                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                                                            isAdminSupport 
                                                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                                                : 'bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20'
                                                        }`}>
                                                            {isAdminSupport ? 'Support' : 'Client-Vendor'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 flex-shrink-0">
                                                        <span className="text-[9px] text-slate-500">
                                                            {msg.timestamp ? new Date(msg.timestamp).toLocaleDateString() : ''}
                                                        </span>
                                                        {isAdminSupport && (
                                                            <button
                                                                onClick={(e) => toggleConversationReadStatus(cid, otherUser.email, hasUnread, e)}
                                                                title={hasUnread ? "Mark as Read" : "Mark as Unread"}
                                                                className="p-1 hover:bg-white/10 rounded transition-all"
                                                            >
                                                                {hasUnread ? (
                                                                    <Mail className="w-3.5 h-3.5 text-[#D4AF37]" />
                                                                ) : (
                                                                    <MailOpen className="w-3.5 h-3.5 text-slate-500 hover:text-white" />
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                
                                                {/* Details subtext */}
                                                {!isAdminSupport && (
                                                    <p className="text-[9px] font-medium text-[#D4AF37]/75">
                                                        ↔️ {vendorDetails.name} ({vendorDetails.email})
                                                    </p>
                                                )}
                                                
                                                <p className="text-[10px] text-slate-500 truncate">
                                                    {clientDetails.email}
                                                </p>
                                                <p className={`text-xs line-clamp-1 ${hasUnread ? 'text-white font-medium' : 'text-slate-300 italic'}`}>
                                                    {msg.text || 'Shared attachment'}
                                                </p>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Chat Area */}
                        <div className="lg:col-span-2 bg-[#111] rounded-2xl border border-white/5 overflow-hidden flex flex-col">
                            {selectedInquiryEmail ? (() => {
                                const conversationMessages = messages.filter(m => 
                                    (selectedConversationId && (m.conversationId === selectedConversationId || [m.senderId, m.receiverId].sort().join('_') === selectedConversationId)) ||
                                    (!selectedConversationId && (m.clientEmail === selectedInquiryEmail || m.vendorEmail === selectedInquiryEmail))
                                );
                                const lastMsg = conversationMessages[conversationMessages.length - 1];
                                const isAdminSupport = lastMsg ? (lastMsg.senderId === 'admin' || lastMsg.receiverId === 'admin' || lastMsg.participants?.includes('admin') || lastMsg.isAdminInquiry) : true;
                                
                                const { client: otherUserClient, vendor: otherUserVendor } = lastMsg 
                                    ? getConversationParticipants(lastMsg)
                                    : { client: { name: 'Client', email: selectedInquiryEmail || '', avatar: '' }, vendor: { name: 'Vendor', email: '', avatar: '' } };
                                
                                const otherId = lastMsg ? getOtherUserId(lastMsg) : '';
                                const otherUser = lastMsg ? getOtherUserDetails(otherId, lastMsg) : { name: 'User', email: selectedInquiryEmail || '', role: 'client' as const, avatar: '' };

                                return (
                                    <>
                                        <div className="p-6 border-b border-white/5 bg-black/40 flex justify-between items-center">
                                            <div className="flex items-center gap-3">
                                                {isAdminSupport ? (
                                                    <>
                                                        <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37] border border-[#D4AF37]/20 font-bold">
                                                            {otherUser.name?.[0] || 'U'}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="font-bold text-white text-sm">
                                                                    {otherUser.name || 'User'}
                                                                </h3>
                                                                <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded">
                                                                    Admin Support Chat
                                                                </span>
                                                            </div>
                                                            <p className="text-[10px] text-slate-500">{otherUser.email}</p>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37] border border-[#D4AF37]/20 font-bold">
                                                            🤝
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="font-bold text-white text-sm">
                                                                    {otherUserClient.name} ↔ {otherUserVendor.name}
                                                                </h3>
                                                                <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 rounded">
                                                                    B2C direct oversight
                                                                </span>
                                                            </div>
                                                            <p className="text-[10px] text-slate-500">
                                                                Client: {otherUserClient.email} | Vendor: {otherUserVendor.email}
                                                            </p>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => { setSelectedInquiryEmail(null); setSelectedConversationId(null); }} className="p-2 text-slate-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                                            </div>
                                        </div>
                                        
                                        <div className="flex-1 overflow-y-auto p-6 space-y-6" id="admin-chat-scroll-container" ref={messagesEndRef}>
                                            {conversationMessages
                                                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                                                .map((msg, idx) => (
                                                    <div key={idx} className={`flex ${msg.senderId === 'admin' ? 'justify-end' : 'justify-start'}`}>
                                                        <div className={`max-w-[70%] p-4 rounded-[20px] transition-all duration-300 relative shadow-md ${
                                                            msg.senderId === 'admin' 
                                                                ? 'bg-[#D4AF37] text-black' 
                                                                : 'bg-zinc-900 text-white border border-zinc-800'
                                                        }`}>
                                                            {msg.type === 'image' || msg.imageUrl ? (
                                                                <div className="space-y-2 cursor-pointer" onClick={() => setFullscreenMedia({url: msg.imageUrl || msg.fileUrl || '', type: 'image'})}>
                                                                    <img 
                                                                      src={msg.imageUrl || msg.fileUrl} 
                                                                      onLoad={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })} 
                                                                      className="rounded-lg w-full max-h-80 object-cover border border-white/5 shadow-lg" 
                                                                      alt="Sent" 
                                                                    />
                                                                    {msg.text && msg.text !== 'Sent an image' && <p className="mt-2 text-sm leading-relaxed">{msg.text}</p>}
                                                                </div>
                                                            ) : msg.type === 'voice' || msg.audioUrl ? (
                                                                <div className="space-y-2 min-w-[200px] sm:min-w-[240px]">
                                                                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">Voice note</p>
                                                                    <CustomAudioPlayer src={msg.audioUrl || msg.fileUrl || ''} theme={msg.senderId === 'admin' ? 'sent' : 'received'} />
                                                                </div>
                                                            ) : msg.type === 'file' ? (
                                                                msg.fileType?.startsWith('video/') ? (
                                                                    <div className="space-y-2 cursor-pointer" onClick={() => setFullscreenMedia({url: msg.fileUrl || '', type: 'video'})}>
                                                                        <video src={msg.fileUrl} className="w-full aspect-video rounded-lg object-cover bg-black" />
                                                                        {msg.text && msg.text !== 'Sent a video' && <p className="text-sm">{msg.text}</p>}
                                                                    </div>
                                                                ) : (
                                                                <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 bg-black/10 p-2 rounded-lg hover:bg-black/20 transition-all text-sm">
                                                                    <FileText className="w-8 h-8 opacity-50" />
                                                                    <div className="flex-1 min-w-0">
                                                                       <p className="truncate font-bold text-xs">{msg.fileName}</p>
                                                                       <p className="text-[10px] opacity-50">Click to download</p>
                                                                    </div>
                                                                    <Download className="w-4 h-4 opacity-50" />
                                                                </a>
                                                                )
                                                            ) : (
                                                                <p className="leading-relaxed">{msg.text}</p>
                                                            )}
                                                            
                                                            <div className="flex justify-between items-center gap-2 mt-2 select-none leading-none w-full">
                                                                {msg.senderId !== 'admin' ? (
                                                                    <button
                                                                        onClick={(e) => toggleMessageReadStatus(msg.id, msg.isRead, e)}
                                                                        title={msg.isRead ? "Mark as Unread" : "Mark as Read"}
                                                                        className="flex items-center gap-1.5 text-[9px] text-[#D4AF37] hover:text-[#E2C562] transition-colors py-0.5 px-2 bg-black/40 rounded border border-[#D4AF37]/10"
                                                                    >
                                                                        {msg.isRead ? (
                                                                            <>
                                                                                <Eye className="w-3 h-3 text-[#D4AF37]" />
                                                                                <span>Read</span>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <EyeOff className="w-3 h-3 text-red-400 animate-pulse" />
                                                                                <span className="text-red-400 font-bold">Unread</span>
                                                                            </>
                                                                        )}
                                                                    </button>
                                                                ) : (
                                                                    <div />
                                                                )}
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className={`text-[9px] text-zinc-400`}>
                                                                        {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                                                    </span>
                                                                    {msg.senderId === 'admin' && (
                                                                        <span className={`text-[10px] ${msg.isRead ? 'text-blue-600' : 'text-black/40'}`}>
                                                                            ✓✓
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>

                                        {!isAdminSupport ? (
                                            <div className="p-6 border-t border-[#D4AF37]/20 bg-amber-500/5 text-center animate-in fade-in duration-300">
                                                <p className="text-[#D4AF37] text-xs font-bold uppercase tracking-wider mb-1 flex items-center justify-center gap-1.5">
                                                    👁️ Direct Oversight Mode
                                                </p>
                                                <p className="text-slate-400 text-[11px] leading-relaxed max-w-lg mx-auto">
                                                    You are spectating a direct thread between Client <span className="text-white font-bold">{otherUserClient.name}</span> and Vendor <span className="text-[#D4AF37] font-bold">{otherUserVendor.name}</span>. Messaging is disabled to maintain standard direct-booking communications.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="p-6 border-t border-white/5 bg-black/20">
                                                <div className="flex gap-4">
                                                    <div className="flex-1 relative">
                                                        <textarea 
                                                            rows={1}
                                                            value={replyText}
                                                            onChange={(e) => setReplyText(e.target.value)}
                                                            onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                                                            placeholder="Type your response..."
                                                            className="w-full bg-black border border-[#D4AF37]/20 rounded-xl px-4 py-3 text-sm text-white resize-none outline-none focus:border-[#D4AF37] transition-all"
                                                        />
                                                    </div>
                                                    <button 
                                                        onClick={handleSendReply}
                                                        disabled={!replyText.trim()}
                                                        className="bg-[#D4AF37] text-black w-14 h-12 flex items-center justify-center rounded-xl hover:bg-[#E5C76B] transition-all disabled:opacity-30 shadow-lg shadow-[#D4AF37]/10"
                                                    >
                                                        <Send className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                );
                            })() : (
                                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-20">
                                    <Bot className="w-20 h-20 mb-4" />
                                    <h3 className="text-xl font-bold font-[Cinzel]">No Conversation Selected</h3>
                                    <p className="text-sm max-w-xs">Select an inquiry from the sidebar to view details and respond.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            );
        })()}

        {activeTab === 'analytics' && (
            <div className="space-y-8 animate-in fade-in duration-500">
                {/* Visual Title Header */}
                <div className="bg-[#111] border border-[#D4AF37]/15 p-8 rounded-3xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <BarChart3 className="w-36 h-36 text-[#D4AF37]" />
                    </div>
                    <div className="relative z-10 max-w-2xl">
                        <span className="text-[#D4AF37] text-[10px] font-black uppercase tracking-widest bg-[#D4AF37]/10 px-3 py-1 rounded-full border border-[#D4AF37]/20">
                            Operational Intel
                        </span>
                        <h2 className="text-3xl font-bold font-[Cinzel] text-white mt-4 tracking-tight">Booking Funnel Conversion Index</h2>
                        <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                            Monitor client discovery loops, plan additions, submission conversion rates, and revenue acquisitions. Driven in real-time by integrated Firebase Analytics log streams.
                        </p>
                    </div>
                </div>

                {/* KPI Metrics List */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-[#111] p-6 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden group hover:border-[#D4AF37]/20 transition-all">
                        <div className="absolute top-4 right-4 bg-blue-500/10 p-2 rounded-lg border border-blue-500/20">
                            <Search className="w-5 h-5 text-blue-400" />
                        </div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">1. Discovery</p>
                        <h3 className="text-3xl font-bold text-white mt-4 font-mono">{analyticsStats.view_vendor}</h3>
                        <p className="text-xs text-slate-400 mt-1">Vendor list & profile views</p>
                    </div>
                    
                    <div className="bg-[#111] p-6 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden group hover:border-[#D4AF37]/20 transition-all">
                        <div className="absolute top-4 right-4 bg-[#D4AF37]/10 p-2 rounded-lg border border-[#D4AF37]/25">
                            <ShoppingBag className="w-5 h-5 text-[#D4AF37]" />
                        </div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">2. Plan Intent</p>
                        <h3 className="text-3xl font-bold text-[#D4AF37] mt-4 font-mono">{analyticsStats.add_to_plan}</h3>
                        <p className="text-xs text-slate-400 mt-1">{analyticsStats.planRate.toFixed(1)}% loop add-to-plan rate</p>
                    </div>

                    <div className="bg-[#111] p-6 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden group hover:border-[#D4AF37]/20 transition-all">
                        <div className="absolute top-4 right-4 bg-orange-500/10 p-2 rounded-lg border border-orange-500/20">
                            <Calendar className="w-5 h-5 text-orange-400" />
                        </div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">3. Book Requests</p>
                        <h3 className="text-3xl font-bold text-white mt-4 font-mono">{analyticsStats.submit_booking_request}</h3>
                        <p className="text-xs text-slate-400 mt-1">{analyticsStats.requestRate.toFixed(1)}% plan conversion rate</p>
                    </div>

                    <div className="bg-[#111] p-6 rounded-2xl border border-white/5 shadow-xl relative overflow-hidden group hover:border-[#D4AF37]/20 transition-all">
                        <div className="absolute top-4 right-4 bg-green-500/10 p-2 rounded-lg border border-green-500/20">
                            <DollarSign className="w-5 h-5 text-green-400" />
                        </div>
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">4. Acquisitions</p>
                        <h3 className="text-3xl font-bold text-green-400 mt-4 font-mono">{analyticsStats.payment_completed}</h3>
                        <p className="text-xs text-slate-400 mt-1">{analyticsStats.purchaseRate.toFixed(1)}% booking close rate</p>
                    </div>
                </div>

                {/* Funnel Graph Visualizer */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 bg-[#111] p-8 rounded-2xl border border-white/5 shadow-2xl flex flex-col justify-between">
                        <div>
                            <h3 className="text-lg font-bold font-[Cinzel] text-white">Funnel Leakage & Progress Chart</h3>
                            <p className="text-xs text-slate-500 mt-1">Mathematical representation of client conversion phases.</p>
                        </div>

                        {/* Interactive Bars representing Funnel Volume */}
                        <div className="space-y-6 mt-8">
                            {/* Discovery step */}
                            <div>
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                                    <span>Step 1: Discovery (Total Card Views)</span>
                                    <span>{analyticsStats.view_vendor} Views (100%)</span>
                                </div>
                                <div className="h-4 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                                    <div className="h-full bg-blue-500 rounded-full transition-all duration-1000" style={{ width: '105%' }}></div>
                                </div>
                            </div>

                            {/* Plan step */}
                            <div>
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                                    <span>Step 2: Micro-Conversion (Added to Event Plan)</span>
                                    <span>{analyticsStats.add_to_plan} Added ({analyticsStats.planRate.toFixed(1)}%)</span>
                                </div>
                                <div className="h-4 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                                    <div className="h-full bg-[#D4AF37] rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, Math.max(0, analyticsStats.planRate))}%` }}></div>
                                </div>
                            </div>

                            {/* Booking requests step */}
                            <div>
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                                    <span>Step 3: Intent (Booking Inquiry Sent)</span>
                                    <span>{analyticsStats.submit_booking_request} Enquiries ({analyticsStats.view_vendor > 0 ? ((analyticsStats.submit_booking_request / analyticsStats.view_vendor) * 100).toFixed(1) : 0}%)</span>
                                </div>
                                <div className="h-4 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                                    <div className="h-full bg-orange-400 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, Math.max(0, analyticsStats.view_vendor > 0 ? (analyticsStats.submit_booking_request / analyticsStats.view_vendor) * 100 : 0))}%` }}></div>
                                </div>
                            </div>

                            {/* Acquisition/Checkout step */}
                            <div>
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">
                                    <span>Step 4: Ultimate Acquisition (Securely Paid)</span>
                                    <span>{analyticsStats.payment_completed} Orders ({analyticsStats.view_vendor > 0 ? ((analyticsStats.payment_completed / analyticsStats.view_vendor) * 100).toFixed(1) : 0}%)</span>
                                </div>
                                <div className="h-4 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                                    <div className="h-full bg-green-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, Math.max(0, analyticsStats.view_vendor > 0 ? (analyticsStats.payment_completed / analyticsStats.view_vendor) * 100 : 0))}%` }}></div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 pt-6 border-t border-white/5 flex flex-wrap gap-6 items-center justify-between text-xs text-slate-400">
                            <div>
                                <span className="text-white font-bold font-mono">Overall Close Target:</span> {analyticsStats.overallRate.toFixed(2)}% of visitors convert to revenue.
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-2.5 h-2.5 bg-blue-500 rounded-full"></span> Discovery
                                <span className="inline-block w-2.5 h-2.5 bg-[#D4AF37] rounded-full"></span> Interest
                                <span className="inline-block w-2.5 h-2.5 bg-orange-400 rounded-full"></span> Intent
                                <span className="inline-block w-2.5 h-2.5 bg-green-500 rounded-full"></span> Purchase
                            </div>
                        </div>
                    </div>

                    {/* Circular Conversion Stats */}
                    <div className="bg-[#111] p-8 rounded-2xl border border-white/5 shadow-2xl flex flex-col justify-between">
                        <div>
                            <h3 className="text-lg font-bold font-[Cinzel] text-white">Conversion Funnel Ratios</h3>
                            <p className="text-xs text-slate-500 mt-1">Leakage between steps & segments.</p>
                        </div>
                        
                        <div className="space-y-6 mt-6">
                            <div className="p-4 bg-zinc-900/60 rounded-xl border border-white/5 flex items-center justify-between">
                                <div>
                                    <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Interest Rate</h4>
                                    <p className="text-[10px] text-slate-500 mt-1">From viewing cards to adding items to plan</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-xl font-bold font-mono text-[#D4AF37]">{analyticsStats.planRate.toFixed(1)}%</span>
                                </div>
                            </div>

                            <div className="p-4 bg-zinc-900/60 rounded-xl border border-white/5 flex items-center justify-between">
                                <div>
                                    <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Plan Commitment</h4>
                                    <p className="text-[10px] text-slate-500 mt-1">From adding to plan to submitting booking inquiries</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-xl font-bold font-mono text-orange-400">{analyticsStats.requestRate.toFixed(1)}%</span>
                                </div>
                            </div>

                            <div className="p-4 bg-zinc-900/60 rounded-xl border border-white/5 flex items-center justify-between">
                                <div>
                                    <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Acquisition Fulfillment</h4>
                                    <p className="text-[10px] text-slate-500 mt-1">From sent inquiries to fully completed payments</p>
                                </div>
                                <div className="text-right">
                                    <span className="text-xl font-bold font-mono text-green-400">{analyticsStats.purchaseRate.toFixed(1)}%</span>
                                </div>
                            </div>
                        </div>

                        <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest text-center mt-6">
                            Secure Zero-Trust ABAC Logging
                        </div>
                    </div>
                </div>

                {/* Tracking Logs Records Table */}
                <div className="bg-[#111] rounded-2xl border border-white/5 overflow-hidden">
                    <div className="p-6 border-b border-white/5 bg-black/40 flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-bold font-[Cinzel] text-white">Live Firebase Analytics Logs</h3>
                            <p className="text-xs text-slate-500 mt-1">Real-time log entries captured through analytics hooks.</p>
                        </div>
                        <span className="text-[10px] bg-green-500/10 text-green-500 px-3 py-1 font-bold uppercase tracking-widest border border-green-500/20 rounded-full flex items-center gap-1.5 font-bold">
                            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Live Broadcast
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        {isLoadingAnalytics ? (
                            <div className="py-20 text-center flex flex-col items-center justify-center gap-4">
                                <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Streaming Firebase records...</span>
                            </div>
                        ) : analyticsLogs.length === 0 ? (
                            <div className="py-20 text-center opacity-40">
                                <BarChart3 className="w-12 h-12 mx-auto text-[#D4AF37]/40 mb-3" />
                                <p className="text-sm">No live analytics records logged yet.</p>
                            </div>
                        ) : (
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                    <tr className="border-b border-white/5 bg-black/20 text-slate-500 font-bold uppercase tracking-widest text-[9px]">
                                        <th className="p-4 bg-[#111]">Timestamp</th>
                                        <th className="p-4 bg-[#111]">Event Name</th>
                                        <th className="p-4 bg-[#111]">User Email</th>
                                        <th className="p-4 bg-[#111]">Payload Summary</th>
                                        <th className="p-4 bg-[#111]">Path</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {analyticsLogs.map(log => (
                                        <tr key={log.id} className="hover:bg-white/[0.02] transition-colors font-mono text-[11px] text-slate-300">
                                            <td className="p-4 text-slate-500">
                                                {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${
                                                    log.eventName === 'payment_completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                                    log.eventName === 'submit_booking_request' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                                    log.eventName === 'add_to_plan' ? 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20' :
                                                    'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                                }`}>
                                                    {log.eventName}
                                                </span>
                                            </td>
                                            <td className="p-4 text-slate-400 text-xs font-sans">
                                                {log.userEmail || 'Anonymous Guest'}
                                            </td>
                                            <td className="p-4 max-w-xs truncate text-[10px]" title={JSON.stringify(log.params)}>
                                                {log.params ? Object.entries(log.params).map(([k, v]) => `${k}: ${v}`).join(' | ') : 'None'}
                                            </td>
                                            <td className="p-4 text-slate-500">
                                                {log.path || '/'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        )}
      </main>



      {/* Fullscreen Media Viewer */}
      <AnimatePresence>
        {fullscreenMedia && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
          >
            <button 
              onClick={() => setFullscreenMedia(null)}
              className="absolute top-4 right-4 text-white hover:text-[#D4AF37] bg-black/50 p-3 rounded-full backdrop-blur-md border border-white/10 transition-all shadow-xl z-10"
            >
              <X className="w-6 h-6" />
            </button>
            {fullscreenMedia.type === 'image' ? (
              <img src={fullscreenMedia.url} alt="Fullscreen View" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
            ) : (
              <video src={fullscreenMedia.url} controls autoPlay className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl bg-black" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminPanel;