import React, { useState, useMemo, useEffect } from 'react';
import { ShoppingBag, Search, Filter, Menu, User, Star, Calendar, LogIn, Mail, PartyPopper, CheckCircle, X, DollarSign, Clock, Loader2, Shield, MapPin, Lock, ChevronLeft, Tag, Trash2, ExternalLink, ChevronRight, UserPlus, Key, LogOut, MessageSquare, LayoutDashboard, ClipboardList, Camera, AlertCircle, Plus, Send, RefreshCw } from 'lucide-react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut, 
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider,
  deleteUser,
  User as FirebaseUser 
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, onSnapshot, query, where, orderBy, getDocs, addDoc, arrayUnion, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from './firebase';
import VendorCard from './VendorCard';
import QuickViewModal from './QuickViewModal';
import BookingModal from './BookingModal';
import VendorPortal from './VendorPortal';
import AdminPanel from './AdminPanel';
import PayPalButton from './PayPalButton';
import ContactModal from './ContactModal';
import PostsPage from './PostsPage';
import ChatModal from './ChatModal';
import SuggestionModal from './SuggestionModal';
import ClientPortal from './ClientPortal';
import PaymentSuccess from './PaymentSuccess';
import { VENDORS as INITIAL_VENDORS, MOCK_BOOKINGS } from './mockData';
import { Vendor, VendorCategory, CartItem, Booking, Review, Post, Message, UserAccount } from './types';

// Helper to strip undefined values for Firestore
const clean = (obj: any) => {
  if (obj === undefined) return null;
  try {
    const serialized = JSON.stringify(obj);
    if (serialized === undefined) return null;
    return JSON.parse(serialized);
  } catch (e) {
    console.error("Error cleaning object for Firestore:", e);
    return null;
  }
};

const SimchaLogo = ({ className = "h-10 w-10" }: { className?: string }) => (
  <svg className={`${className}`} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <text x="50" y="75" fontFamily="'Cinzel', serif" fontSize="85" fill="#D4AF37" textAnchor="middle" fontWeight="bold" letterSpacing="-5">SB</text>
  </svg>
);

const INITIAL_CATEGORY_IMAGES: Record<string, string> = {
  [VendorCategory.VENUE]: "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=600",
  [VendorCategory.CATERING]: "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&q=80&w=600",
  [VendorCategory.MUSIC]: "https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&q=80&w=600",
  [VendorCategory.PHOTOGRAPHY]: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&q=80&w=600",
  [VendorCategory.VIDEOGRAPHY]: "https://images.unsplash.com/photo-1579632652768-6cb9dcf85912?auto=format&fit=crop&q=80&w=600",
  [VendorCategory.FLORIST]: "https://images.unsplash.com/photo-1507290439931-a861b5a38200?auto=format&fit=crop&q=80&w=600",
  [VendorCategory.PLANNER]: "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&q=80&w=600",
  [VendorCategory.ATTIRE]: "https://images.unsplash.com/photo-1594552072238-b8a33785b261?auto=format&fit=crop&q=80&w=600",
  [VendorCategory.MAKEUP]: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=600",
  [VendorCategory.JUDAICA]: "https://images.unsplash.com/photo-1590845947698-8924d7409b56?auto=format&fit=crop&q=80&w=600",
  [VendorCategory.OFFICIANT]: "https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?ixlib=rb-1.2.1&auto=format&fit=crop&w=1950&q=80",
  [VendorCategory.INVITATIONS]: "https://images.unsplash.com/photo-1550953683-9366e632b6a9?auto=format&fit=crop&q=80&w=600",
  [VendorCategory.ENTERTAINMENT]: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&q=80&w=600",
  [VendorCategory.RENTALS]: "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=80&w=600",
  [VendorCategory.TRANSPORTATION]: "https://images.unsplash.com/photo-1563297775-81676646bc5f?auto=format&fit=crop&q=80&w=600",
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // throw new Error(JSON.stringify(errInfo));
};

function App() {
  const [view, setView] = useState<'marketplace' | 'vendor-portal' | 'admin' | 'posts' | 'client-portal' | 'payment-success' | 'verify-account'>('marketplace');
  const welcomeScheduled = React.useRef(false);
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [userDocData, setUserDocData] = useState<any>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [userRole, setUserRole] = useState<'client' | 'vendor' | 'admin' | null>(null);
  const [currentUserVendorId, setCurrentUserVendorId] = useState<string | null>(null);
  const [paymentBookingId, setPaymentBookingId] = useState<string | null>(null);
  const [paymentVendorId, setPaymentVendorId] = useState<string | null>(null);
  
  const [activeCategories, setActiveCategories] = useState<string[]>(Object.values(VendorCategory));
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>(INITIAL_CATEGORY_IMAGES);
  const [categorySubCategories, setCategorySubCategories] = useState<Record<string, Record<string, string[]>>>({});
  const [heroBackgroundUrl, setHeroBackgroundUrl] = useState<string>("https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?ixlib=rb-1.2.1&auto=format&fit=crop&w=1950&q=80");

  const syncUserProfile = async (user: FirebaseUser, additionalData: { fullName?: string, photoURL?: string, photoStoragePath?: string } = {}) => {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      const userData: any = {
        uid: user.uid,
        email: user.email,
        name: additionalData.fullName || user.displayName || user.email?.split('@')[0] || 'Guest',
        photoURL: additionalData.photoURL || user.photoURL || '',
        updatedAt: new Date().toISOString()
      };

      if (additionalData.photoStoragePath !== undefined) {
        userData.photoStoragePath = additionalData.photoStoragePath;
      }

      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          ...userData,
          createdAt: new Date().toISOString()
        });
      } else {
        await updateDoc(userDocRef, userData);
      }
    } catch (err) {
      console.error("Error syncing user profile:", err);
    }
  };

  // Firestore Sync - Global Data
  useEffect(() => {
    const unsubVendors = onSnapshot(collection(db, 'vendors'), (snapshot) => {
      const vData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vendor));
      if (vData.length === 0) {
        // Seed if empty
        INITIAL_VENDORS.forEach(v => setDoc(doc(db, 'vendors', v.id), clean(v)));
      } else {
        setVendors(vData);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'vendors'));

    const unsubPosts = onSnapshot(collection(db, 'posts'), (snapshot) => {
      const pData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
      setPosts(pData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'posts'));

    const unsubMetadata = onSnapshot(doc(db, 'metadata', 'app_config'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.categories) setActiveCategories(data.categories);
        if (data.categoryImages) setCategoryImages(data.categoryImages);
        if (data.categorySubCategories) setCategorySubCategories(data.categorySubCategories);
        if (data.heroBackgroundUrl) setHeroBackgroundUrl(data.heroBackgroundUrl);
      } else {
        // Seed metadata
        setDoc(doc(db, 'metadata', 'app_config'), {
          categories: Object.values(VendorCategory),
          categoryImages: INITIAL_CATEGORY_IMAGES,
          categorySubCategories: {},
          heroBackgroundUrl: "https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?ixlib=rb-1.2.1&auto=format&fit=crop&w=1950&q=80"
        });
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'metadata/app_config'));

    return () => {
      unsubVendors();
      unsubPosts();
      unsubMetadata();
    };
  }, []);

  // Webhook Debug Listener
  useEffect(() => {
    if (!fbUser) return;

    const unsubWebhooks = onSnapshot(
      query(collection(db, 'webhook_debug'), orderBy('timestamp', 'desc'), limit(1)),
      (snapshot) => {
        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const data = doc.data();
          // Only show if it's recent (within last 30 seconds)
          const now = new Date().getTime();
          const webhookTime = data.timestamp?.toMillis() || 0;
          if (now - webhookTime < 30000) {
            showNotification(`Webhook Received: ${data.type}`, 'info');
          }
        }
      }
    );
    return () => unsubWebhooks();
  }, [fbUser]);

  // Firestore Sync - User Data
  useEffect(() => {
    if (!fbUser || !userRole) {
      setBookings([]);
      setMessages([]);
      setCart([]);
      return;
    }

    // Bookings
    let bookingsQuery;
    if (userRole === 'admin') {
      bookingsQuery = collection(db, 'bookings');
    } else if (userRole === 'vendor' && currentUserVendorId) {
      bookingsQuery = query(collection(db, 'bookings'), where('vendorId', '==', currentUserVendorId));
    } else {
      bookingsQuery = query(collection(db, 'bookings'), where('contactEmail', '==', fbUser.email));
    }

    const unsubBookings = onSnapshot(bookingsQuery, (snapshot) => {
      const bData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      setBookings(bData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'bookings'));

    // Messages
    let messagesQuery;
    if (userRole === 'admin') {
      messagesQuery = collection(db, 'messages');
    } else if (userRole === 'vendor' && currentUserVendorId) {
      messagesQuery = query(collection(db, 'messages'), where('receiverId', '==', currentUserVendorId));
    } else {
      messagesQuery = query(collection(db, 'messages'), where('clientEmail', '==', fbUser.email));
    }

    const unsubMessages = onSnapshot(messagesQuery, (snapshot) => {
      const mData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(mData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'messages'));

    const unsubCart = onSnapshot(doc(db, 'users', fbUser.uid, 'cart', 'current'), (docSnap) => {
      if (docSnap.exists()) {
        setCart(docSnap.data().items || []);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${fbUser.uid}/cart/current`));

    // Users (Admin only)
    let unsubUsers = () => {};
    if (userRole === 'admin') {
      unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        const uData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserAccount));
        setUsers(uData);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'users'));
    }

    return () => {
      unsubBookings();
      unsubMessages();
      unsubCart();
      unsubUsers();
    };
  }, [fbUser, userRole, currentUserVendorId]);

  // Firebase Auth Observer
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // Only set the authenticated user if their email is verified
      if (user && user.emailVerified) {
        setFbUser(user);
        await syncUserProfile(user);
        
        // Fetch user doc data
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserDocData(data);
          const hardcodedAdminEmail = 'bookingsimcha@gmail.com';
          const role = data.role || (user.email === hardcodedAdminEmail ? 'admin' : 'client');
          setUserRole(role);
          setCurrentUserVendorId(data.vendorId || null);
        } else {
          // Default for new users
          const hardcodedAdminEmail = 'bookingsimcha@gmail.com';
          setUserRole(user.email === hardcodedAdminEmail ? 'admin' : 'client');
          setCurrentUserVendorId(null);
        }
      } else {
        setFbUser(null);
        setUserDocData(null);
        setUserRole(null);
        setCurrentUserVendorId(null);
      }
      setIsInitializing(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (fbUser && userRole) {
      updateDoc(doc(db, 'users', fbUser.uid), { role: userRole, vendorId: currentUserVendorId });
    }
  }, [userRole, currentUserVendorId, fbUser]);

  const [cart, setCart] = useState<CartItem[]>([]);
  
  // Sync cart to Firestore
  useEffect(() => {
    if (fbUser) {
      const cartRef = doc(db, 'users', fbUser.uid, 'cart', 'current');
      if (cart.length > 0) {
        setDoc(cartRef, { items: clean(cart) }).catch(err => {
          console.error("Error syncing cart to Firestore:", err);
          handleFirestoreError(err, OperationType.WRITE, `users/${fbUser.uid}/cart/current`);
        });
      } else {
        // If cart is empty, we can either delete the doc or set items to empty array
        setDoc(cartRef, { items: [] }).catch(() => {});
      }
    }
  }, [cart, fbUser]);
  const [activeCategory, setActiveCategory] = useState<string | 'All'>('All');
  const [activeSubCategories, setActiveSubCategories] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [bookingVendor, setBookingVendor] = useState<Vendor | null>(null);
  const [quickViewVendor, setQuickViewVendor] = useState<Vendor | null>(null);
  const [chatVendor, setChatVendor] = useState<Vendor | null>(null);
  const [isAdminChatOpen, setIsAdminChatOpen] = useState(false);
  const [adminInquiryText, setAdminInquiryText] = useState('');

  const handleSendAdminInquiry = async () => {
    if (!adminInquiryText.trim() || !fbUser) return;
    
    await handleSendMessage({
      text: adminInquiryText,
      clientEmail: fbUser.email || 'anonymous',
      clientName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Client',
      isAdminInquiry: true,
      receiverId: 'admin',
      type: 'text'
    });
    
    setAdminInquiryText('');
  };
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'info'} | null>(null);
  
  const [suggestedVendors, setSuggestedVendors] = useState<Vendor[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [sourceVendorForSuggestions, setSourceVendorForSuggestions] = useState<Vendor | null>(null);

  const filteredVendors = useMemo(() => {
    return vendors.filter(vendor => {
      const matchesCategory = activeCategory === 'All' || vendor.category === activeCategory;
      const matchesSearch = vendor.name.toLowerCase().includes(searchTerm.toLowerCase()) || vendor.location.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSubCategories = activeSubCategories.length === 0 || 
        activeSubCategories.some(sub => vendor.subCategories?.includes(sub));
      return matchesCategory && matchesSearch && matchesSubCategories;
    }).sort((a, b) => {
        if (eventDate) {
            const aUnavailable = a.unavailableDates?.includes(eventDate);
            const bUnavailable = b.unavailableDates?.includes(eventDate);
            if (!aUnavailable && bUnavailable) return -1;
            if (aUnavailable && !bUnavailable) return 1;
        }
        if (b.rating !== a.rating) return b.rating - a.rating;
        return a.name.localeCompare(b.name);
    });
  }, [vendors, activeCategory, searchTerm, eventDate, activeSubCategories]);

  useEffect(() => {
    setActiveSubCategories([]);
  }, [activeCategory]);

  const showNotification = (message: string, type: 'success' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // URL Parameter Handling for Stripe Redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const onboardStatus = params.get('onboard');
    const paymentStatus = params.get('payment'); // We can add this to success/cancel URLs
    const bookingId = params.get('bookingId');
    const checkStripe = params.get('check_stripe');

    if (onboardStatus === 'success') {
      setView('vendor-portal');
      showNotification('Stripe account connected successfully!', 'success');
      // Only clean up if we don't need the bypass in VendorPortal
      if (!params.get('stripeAccountId') && !params.get('stripe_acc_id')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } else if (onboardStatus === 'pending') {
      setView('vendor-portal');
      showNotification('Stripe account is pending. Please complete all requirements in the Stripe dashboard.', 'info');
      if (!params.get('stripeAccountId') && !params.get('stripe_acc_id')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } else if (onboardStatus === 'refresh') {
      setView('vendor-portal');
      showNotification('Stripe onboarding session refreshed.', 'info');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (onboardStatus === 'error') {
      const msg = params.get('message');
      setView('vendor-portal');
      showNotification(msg ? `Stripe Error: ${msg}` : 'There was an error connecting your Stripe account.', 'info');
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Proactive Stripe check if requested via URL
    if (checkStripe === 'true' && currentUserVendorId) {
      const vendor = vendors.find(v => v.id === currentUserVendorId);
      if (vendor?.stripeAccountId) {
        console.log("[Stripe] Proactive check triggered by URL parameter");
        fetch('/api/stripe/verify-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            vendorId: currentUserVendorId, 
            stripeAccountId: vendor.stripeAccountId 
          })
        })
        .then(res => res.json())
        .then(data => {
          if (data.stripeConnected) {
            showNotification('Stripe connection verified!', 'success');
          }
        })
        .catch(err => console.error("[Stripe] Error verifying connection:", err));
      }
    }

    // Handle payment success/cancel from Stripe Checkout
    const path = window.location.pathname;
    if (path === '/payment-success') {
      const bId = params.get('bookingId');
      const vId = params.get('vendorId');
      if (bId) {
        setPaymentBookingId(bId);
        setPaymentVendorId(vId);
        setView('payment-success');
      } else {
        setView('client-portal');
        showNotification('Payment successful! Your booking is confirmed.', 'success');
      }
      window.history.replaceState({}, '', '/');
    } else if (path === '/payment-cancel') {
      setView('client-portal');
      showNotification('Payment was cancelled.', 'info');
      window.history.replaceState({}, '', '/');
    }

    // Handle verification success redirect
    if (path === '/verify-account') {
      setView('verify-account');
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const navigateToVendor = (vendor: Vendor) => {
    setBookingVendor(vendor);
    setView('marketplace');
    window.scrollTo(0, 0);
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setCart([]);
      setUserRole(null);
      setCurrentUserVendorId(null);
      setView('marketplace');
      showNotification('Signed out safely.');
    } catch (err) {
      console.error("Sign out error", err);
    }
  };

  const handleUpdateVendor = async (updated: Vendor) => {
    try {
      await setDoc(doc(db, 'vendors', updated.id), clean(updated));
      showNotification('Vendor updated successfully!');
    } catch (err) {
      console.error("Error updating vendor:", err);
    }
  };

  const handleUpdateBookingStatus = async (id: string, status: Booking['status']) => {
    try {
      await updateDoc(doc(db, 'bookings', id), { status });
      showNotification(`Booking ${status}!`);
    } catch (err) {
      console.error("Error updating booking status:", err);
    }
  };

  const handleReplyMessage = async (email: string, name: string, text: string) => {
    if (!currentUserVendorId) return;
    try {
      await addDoc(collection(db, 'messages'), {
        senderId: currentUserVendorId,
        receiverId: 'client',
        clientEmail: email,
        clientName: name,
        text,
        timestamp: new Date().toISOString(),
        isRead: false
      });
      showNotification('Reply sent!');
    } catch (err) {
      console.error("Error replying to message:", err);
    }
  };

  const handleProcessCart = async () => {
    if (!fbUser) return;
    try {
      const newBookings = cart.map(item => ({
        vendorId: item.vendor.id,
        clientName: item.clientName,
        eventName: item.eventName,
        date: item.date,
        status: 'pending' as const,
        paymentStatus: 'pending' as const,
        amount: item.amount,
        contactEmail: item.contactEmail,
        selectedServices: item.selectedServices,
        eventLocation: item.eventLocation,
        eventTime: item.eventTime,
        notes: item.notes,
        createdAt: new Date().toISOString()
      }));

      for (const b of newBookings) {
        await addDoc(collection(db, 'bookings'), b);
        await sendBookingConfirmation(b);
      }

      setCart([]);
      await deleteDoc(doc(db, 'users', fbUser.uid, 'cart', 'current'));
      showNotification('Requests sent!');
    } catch (err) {
      console.error("Error processing cart:", err);
    }
  };

  const handlePaymentSuccess = async (id: string, method: string) => {
    try {
      await updateDoc(doc(db, 'bookings', id), {
        paymentStatus: 'paid',
        paymentMethod: method
      });
      showNotification('Payment successful!');
    } catch (err) {
      console.error("Error updating payment:", err);
    }
  };

  const handleAddReview = async (vendorId: string, review: Omit<Review, 'id' | 'date'>) => {
    try {
      const vendor = vendors.find(v => v.id === vendorId);
      if (!vendor) return;

      const newReview = {
        ...review,
        id: Math.random().toString(36).substr(2, 9),
        date: new Date().toISOString().split('T')[0]
      };

      await updateDoc(doc(db, 'vendors', vendorId), {
        reviews: [...(vendor.reviews || []), newReview]
      });
      showNotification('Review added!');
    } catch (err) {
      console.error("Error adding review:", err);
    }
  };

  const handleAdminAddVendor = async (vendor: Vendor) => {
    try {
      await setDoc(doc(db, 'vendors', vendor.id), clean(vendor));
      showNotification('Vendor added!');
    } catch (err) {
      console.error("Error adding vendor:", err);
    }
  };

  const handleAdminRemoveVendor = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'vendors', id));
      showNotification('Vendor removed.');
    } catch (err) {
      console.error("Error removing vendor:", err);
    }
  };

  const handleAdminToggleVerify = async (id: string) => {
    try {
      const vendor = vendors.find(v => v.id === id);
      if (!vendor) return;
      await updateDoc(doc(db, 'vendors', id), { isVerified: !vendor.isVerified });
      showNotification('Verification toggled.');
    } catch (err) {
      console.error("Error toggling verification:", err);
    }
  };

  const handleAdminAddPost = async (post: Post) => {
    try {
      await setDoc(doc(db, 'posts', post.id), clean(post));
      showNotification('Post published!');
    } catch (err) {
      console.error("Error adding post:", err);
    }
  };

  const handleAdminRemovePost = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'posts', id));
      showNotification('Post removed.');
    } catch (err) {
      console.error("Error removing post:", err);
    }
  };

  const handleAdminUpdateCategoryImage = async (cat: string, url: string) => {
    try {
      await updateDoc(doc(db, 'metadata', 'app_config'), {
        [`categoryImages.${cat}`]: url
      });
      showNotification('Category image updated!');
    } catch (err) {
      console.error("Error updating category image:", err);
    }
  };

  const handleAdminAddCategory = async (name: string, image: string, subCats: string[]) => {
    try {
      await updateDoc(doc(db, 'metadata', 'app_config'), {
        categories: arrayUnion(name),
        [`categoryImages.${name}`]: image
      });
      showNotification('Category added!');
    } catch (err) {
      console.error("Error adding category:", err);
    }
  };

  const handleAdminUpdateCategorySubCategories = async (cat: string, subs: Record<string, string[]>) => {
    try {
      await updateDoc(doc(db, 'metadata', 'app_config'), {
        [`categorySubCategories.${cat}`]: subs
      });
      showNotification('Taxonomy updated!');
    } catch (err) {
      console.error("Error updating taxonomy:", err);
    }
  };

  const handleAdminUpdateHeroBackground = async (url: string) => {
    try {
      await updateDoc(doc(db, 'metadata', 'app_config'), {
        heroBackgroundUrl: url
      });
      showNotification('Hero background updated!');
    } catch (err) {
      console.error("Error updating hero background:", err);
    }
  };

  const handleSendMessage = async (payload: Partial<Message>) => {
    try {
      const msgData = {
        senderId: (userRole === 'vendor' ? currentUserVendorId : 'client') || 'client',
        isRead: false,
        timestamp: new Date().toISOString(),
        ...payload
      };
      
      // If payload already has a senderId (like 'admin'), respect it
      if (payload.senderId) msgData.senderId = payload.senderId;

      await addDoc(collection(db, 'messages'), msgData);
      
      if (!payload.receiverId?.startsWith('admin') && !isAdminChatOpen) {
          showNotification('Message sent!', 'success');
      }
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  const AuthWall = () => {
    const [step, setStep] = useState<'choice' | 'login' | 'register' | 'verification' | 'forgot-password' | 'reset-success'>('choice');
    const [targetRole, setTargetRole] = useState<'client' | 'vendor' | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // Form States
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [photo, setPhoto] = useState<File | null>(null);
    const [error, setError] = useState('');
    const [unverifiedEmail, setUnverifiedEmail] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);
      setError('');
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        if (!user.emailVerified) {
          await sendEmailVerification(user);
          setUnverifiedEmail(email);
          setStep('verification');
          await signOut(auth);
          return;
        }

        if (targetRole === 'vendor') {
           const vendor = vendors.find(v => v.username === email);
           if (vendor) {
             setCurrentUserVendorId(vendor.id);
             setUserRole('vendor');
           } else {
             setUserRole('client'); 
           }
        } else {
          setUserRole('client');
        }
        await syncUserProfile(user);
        setView('marketplace');
      } catch (err: any) {
        setError('Password or email incorrect, or account requires verification.');
      } finally {
        setIsLoading(false);
      }
    };

    const handleGoogleSignIn = async () => {
      setIsLoading(true);
      setError('');
      try {
        const provider = new GoogleAuthProvider();
        const userCredential = await signInWithPopup(auth, provider);
        const user = userCredential.user;

        // For Google sign-in, we assume email is verified by Google
        if (targetRole === 'vendor') {
          const vendor = vendors.find(v => v.username === user.email);
          if (vendor) {
            setCurrentUserVendorId(vendor.id);
            setUserRole('vendor');
          } else {
            setUserRole('client');
          }
        } else {
          setUserRole('client');
        }
        await syncUserProfile(user);
        setView('marketplace');
        showNotification(`Welcome, ${user.displayName || 'User'}!`);
      } catch (err: any) {
        setError(err.message || 'An error occurred during Google Sign-In.');
      } finally {
        setIsLoading(false);
      }
    };

    const handleRegister = async (e: React.FormEvent) => {
      e.preventDefault();
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      setIsLoading(true);
      setError('');
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        let photoURL = '';
        let photoStoragePath = '';

        if (photo) {
          try {
            const storagePath = `user_uploads/${user.uid}/profile_photo_${Date.now()}`;
            
            const formData = new FormData();
            formData.append('file', photo);
            formData.append('path', storagePath);

            const response = await fetch('/api/upload', {
              method: 'POST',
              body: formData,
            });

            if (response.ok) {
              const { url } = await response.json();
              photoURL = url;
              photoStoragePath = storagePath;
            } else {
              console.error("Registration photo upload failed:", await response.text());
            }
          } catch (uploadErr) {
            console.error("Registration photo upload failed:", uploadErr);
          }
        }

        await updateProfile(user, {
          displayName: fullName,
          photoURL: photoURL
        });

        await syncUserProfile(user, { fullName, photoURL, photoStoragePath });

        // Use custom verification email via server SMTP
        try {
          await fetch('/api/auth/send-verification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name: fullName })
          });
        } catch (emailErr) {
          console.error("Failed to trigger custom verification email:", emailErr);
        }

        setUnverifiedEmail(email);
        setStep('verification');
        await signOut(auth);
      } catch (err: any) {
        if (err.code === 'auth/email-already-in-use') {
          setError('An account with this email already exists.');
        } else {
          setError(err.message || 'An error occurred during registration.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim()) {
        setError('Please enter your email address');
        return;
      }
      setIsLoading(true);
      setError('');
      try {
        // Use custom password reset email via server SMTP
        const response = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to send reset email');
        }

        setUnverifiedEmail(email);
        setStep('reset-success');
      } catch (err: any) {
        setError(err.message || 'Could not send reset link. Verify email.');
      } finally {
        setIsLoading(false);
      }
    };

    if (step === 'verification') {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#D4AF37]/5 via-black to-black" aria-hidden="true"></div>
          <div className="bg-[#111] rounded-3xl p-8 md:p-12 max-w-lg w-full border border-[#D4AF37]/20 shadow-2xl animate-in zoom-in-95 duration-500 relative z-10 text-center">
            <div className="bg-[#D4AF37]/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Mail className="w-10 h-10 text-[#D4AF37]" />
            </div>
            <h2 className="text-2xl font-bold font-[Cinzel] text-[#D4AF37] mb-4">Email Verification Sent</h2>
            <p className="text-slate-300 mb-8 leading-relaxed">
              We have sent a verification email to <span className="text-white font-bold">{unverifiedEmail}</span>. 
              Please verify your account via the link in your inbox and then log in.
            </p>
            <button 
              onClick={() => setStep('login')}
              className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-xl hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" /> Return to Login
            </button>
          </div>
        </div>
      );
    }

    if (step === 'reset-success') {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#D4AF37]/5 via-black to-black" aria-hidden="true"></div>
          <div className="bg-[#111] rounded-3xl p-8 md:p-12 max-w-lg w-full border border-[#D4AF37]/20 shadow-2xl animate-in zoom-in-95 duration-500 relative z-10 text-center">
            <div className="bg-green-500/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-500/20">
              <RefreshCw className="w-10 h-10 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold font-[Cinzel] text-green-500 mb-4">Reset Link Sent</h2>
            <p className="text-slate-300 mb-8 leading-relaxed">
              We sent you a password change link to <span className="text-white font-bold">{unverifiedEmail}</span>. 
              Please follow the instructions in the email to set a new password.
            </p>
            <button 
              onClick={() => setStep('login')}
              className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-xl hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4" /> Sign In
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden" role="main">
        <div className="absolute inset-0 bg-gradient-to-br from-[#D4AF37]/5 via-black to-black" aria-hidden="true"></div>
        <div className="bg-[#111] rounded-3xl p-8 md:p-12 max-w-lg w-full border border-[#D4AF37]/20 shadow-2xl animate-in zoom-in-95 duration-500 relative z-10">
          <header className="text-center mb-10">
            <div className="flex items-center justify-center mx-auto mb-6"><SimchaLogo className="w-20 h-20" /></div>
            <h1 className="text-3xl font-bold font-[Cinzel] text-[#D4AF37] tracking-wider uppercase">Simcha Sign-Up</h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-[0.4em] mt-2">Professional Planning Access</p>
          </header>

          {step === 'choice' ? (
            <nav className="flex flex-col gap-6" aria-label="Account Type Selection">
              <button onClick={() => { setTargetRole('client'); setStep('login'); }} className="group bg-black/40 border border-[#D4AF37]/20 p-10 rounded-3xl hover:border-[#D4AF37] focus-visible:ring-2 focus-visible:ring-[#D4AF37] transition-all text-center outline-none">
                <div className="w-16 h-16 bg-[#D4AF37]/10 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-[#D4AF37] transition-colors" aria-hidden="true"><User className="w-8 h-8 text-[#D4AF37] group-hover:text-black" /></div>
                <h2 className="text-white font-bold uppercase tracking-[0.3em] text-lg mb-2">Simcha Planner</h2>
                <p className="text-xs text-slate-500 font-light px-4">I am planning a celebration and need professional help</p>
              </button>
            </nav>
          ) : step === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-4 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="sarah@example.com" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Password</label>
                  <button type="button" onClick={() => setStep('forgot-password')} className="text-[10px] text-[#D4AF37] hover:underline font-bold uppercase tracking-widest">Forgot password?</button>
                </div>
                <input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-4 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="••••••••" />
              </div>
              
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg flex items-center gap-3 animate-shake">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-red-500 text-xs font-bold uppercase tracking-tighter">{error}</p>
                </div>
              )}

              <button disabled={isLoading} type="submit" className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-xl hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Sign In as ${targetRole}`}
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
                  <span className="bg-[#111] px-4 text-slate-500 font-black">Or continue with</span>
                </div>
              </div>

              <button 
                type="button" 
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full bg-white text-black font-black py-4 rounded-xl hover:bg-slate-200 transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-3"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z"
                  />
                </svg>
                Google
              </button>
              
              <div className="flex flex-col gap-4 mt-6">
                <button type="button" onClick={() => setStep('choice')} className="text-slate-500 hover:text-white text-[10px] font-black uppercase tracking-widest">Return to Roles</button>
                <button type="button" onClick={() => setStep('register')} className="text-[#D4AF37] hover:underline text-[10px] font-black uppercase tracking-widest">
                  Need an account? Register here
                </button>
              </div>
            </form>
          ) : step === 'forgot-password' ? (
            <form onSubmit={handleResetPassword} className="space-y-6 animate-in fade-in duration-300">
               <div className="bg-[#D4AF37]/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                  <RefreshCw className="w-8 h-8 text-[#D4AF37]" />
               </div>
               <div className="text-center mb-6">
                  <h2 className="text-white font-bold uppercase tracking-widest text-sm mb-2">Password Reset</h2>
                  <p className="text-[10px] text-slate-500 uppercase leading-relaxed px-4">Enter your email and we'll send you a link to regain access to your simcha planning.</p>
               </div>
               <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-4 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="sarah@example.com" />
              </div>
              {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg flex items-center gap-3 animate-shake">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-red-500 text-xs font-bold uppercase tracking-tighter">{error}</p>
                </div>
              )}
              <button disabled={isLoading} type="submit" className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-xl hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Get Reset Link'}
              </button>
              <button type="button" onClick={() => setStep('login')} className="w-full text-slate-500 hover:text-white text-[10px] font-black uppercase tracking-widest">Return to Login</button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="flex flex-col items-center mb-4">
                <label className="relative group cursor-pointer">
                   <div className="w-20 h-20 bg-black/60 border-2 border-dashed border-[#D4AF37]/30 rounded-full flex items-center justify-center overflow-hidden transition-all group-hover:border-[#D4AF37]">
                     {photo ? <img src={URL.createObjectURL(photo)} className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-[#D4AF37]/40" />}
                   </div>
                   <input type="file" className="hidden" accept="image/*" onChange={e => setPhoto(e.target.files?.[0] || null)} />
                   <div className="absolute -bottom-1 -right-1 bg-[#D4AF37] p-1.5 rounded-full text-black shadow-lg">
                     <Plus className="w-3 h-3" />
                   </div>
                </label>
                <p className="text-[8px] text-slate-500 font-black uppercase tracking-widest mt-2">Upload Profile Photo</p>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
                <input required type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="Sarah Cohen" />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="sarah@example.com" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Password</label>
                  <input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="••••••••" />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Repeat Password</label>
                  <input required type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="••••••••" />
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg flex items-center gap-3 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-red-500 text-xs font-bold uppercase tracking-tighter">{error}</p>
                </div>
              )}

              <button disabled={isLoading} type="submit" className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-xl hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2 mt-4">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Complete Registration'}
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
                  <span className="bg-[#111] px-4 text-slate-500 font-black">Or join with</span>
                </div>
              </div>

              <button 
                type="button" 
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full bg-white text-black font-black py-4 rounded-xl hover:bg-slate-200 transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-3"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z"
                  />
                </svg>
                Google
              </button>
              
              <button type="button" onClick={() => setStep('login')} className="w-full text-slate-500 hover:text-white text-[10px] font-black uppercase tracking-widest mt-2">
                Already registered? Sign in
              </button>
            </form>
          )}
          
          <div className="mt-12 pt-8 border-t border-white/5 text-center flex flex-col items-center gap-4">
             <button onClick={() => { setTargetRole('vendor'); setStep('login'); }} className="text-[#D4AF37]/40 hover:text-[#D4AF37] text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-colors outline-none border border-[#D4AF37]/10 px-3 py-1 rounded-full bg-black/40">
               <Shield className="w-2.5 h-2.5" /> Vendor Access
             </button>
          </div>
        </div>
      </div>
    );
  };

  const handleUpdateProfile = async (data: { name: string, photoURL: string, photoStoragePath?: string }) => {
    if (!fbUser) return;
    try {
      await updateProfile(fbUser, {
        displayName: data.name,
        photoURL: data.photoURL
      });
      await syncUserProfile(fbUser, { 
        fullName: data.name, 
        photoURL: data.photoURL,
        photoStoragePath: data.photoStoragePath 
      });
      
      // Update local state to reflect changes immediately
      setUserDocData(prev => ({
        ...prev,
        name: data.name,
        photoURL: data.photoURL,
        photoStoragePath: data.photoStoragePath
      }));

      showNotification('Profile updated successfully!');
    } catch (err) {
      console.error("Error updating profile:", err);
      showNotification('Failed to update profile.', 'info');
    }
  };

  const sendBookingConfirmation = async (booking: any) => {
    const vendor = vendors.find(v => v.id === booking.vendorId);
    if (!vendor) return;

    try {
      await fetch('/api/email/confirm-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: booking.contactEmail,
          clientName: booking.clientName,
          eventName: booking.eventName,
          vendorName: vendor.name,
          vendorCategory: vendor.category,
          date: booking.date,
          priceStart: booking.amount,
          notes: booking.notes,
          eventLocation: booking.eventLocation,
          eventTime: booking.eventTime,
          selectedServices: booking.selectedServices
        })
      });
    } catch (err) {
      console.error("Error sending booking confirmation email:", err);
    }
  };

  const handleDeleteAccount = async () => {
    if (!fbUser) return;
    if (!window.confirm('Are you sure you want to delete your account? This action is permanent.')) return;
    
    try {
      const uid = fbUser.uid;
      await deleteDoc(doc(db, 'users', uid));
      await deleteUser(fbUser);
      setFbUser(null);
      setUserRole(null);
      setCurrentUserVendorId(null);
      setView('marketplace');
      showNotification('Account deleted successfully.');
    } catch (err: any) {
      console.error("Error deleting account:", err);
      if (err.code === 'auth/requires-recent-login') {
        showNotification('Please sign in again to delete your account.', 'info');
        await signOut(auth);
      } else {
        showNotification('Failed to delete account.', 'info');
      }
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center">
        <SimchaLogo className="w-24 h-24 animate-pulse mb-8" />
        <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
      </div>
    );
  }

  if (view === 'admin') {
    if (fbUser?.email !== 'bookingsimcha@gmail.com') {
      setView('marketplace');
      return null;
    }
    return <AdminPanel 
    vendors={vendors} 
    posts={posts} 
    bookings={bookings} 
    users={users}
    onAddVendor={handleAdminAddVendor} 
    onUpdateVendor={handleUpdateVendor}
    onRemoveVendor={handleAdminRemoveVendor} 
    onToggleVerify={handleAdminToggleVerify} 
    onUpdateBookingStatus={handleUpdateBookingStatus}
    onLoginAsVendor={id => { setCurrentUserVendorId(id); setUserRole('vendor'); setView('marketplace'); }} 
    onAddPost={handleAdminAddPost} 
    onRemovePost={handleAdminRemovePost} 
    onBack={() => setView('marketplace')} 
    categoryImages={categoryImages} 
    onUpdateCategoryImage={handleAdminUpdateCategoryImage} 
    categories={activeCategories} 
    onAddCategory={handleAdminAddCategory} 
    categorySubCategories={categorySubCategories} 
    onUpdateCategorySubCategories={handleAdminUpdateCategorySubCategories} 
    heroBackgroundUrl={heroBackgroundUrl}
    onUpdateHeroBackground={handleAdminUpdateHeroBackground}
    messages={messages}
    onSendMessage={handleSendMessage}
    showNotification={showNotification}
  />;
  }

  if (!fbUser && view !== 'admin') return <AuthWall />;

  const currentAuthenticatedUser: UserAccount = {
    id: fbUser?.uid || '',
    name: userDocData?.name || fbUser?.displayName || fbUser?.email?.split('@')[0] || 'Guest',
    username: fbUser?.email || '',
    photoURL: userDocData?.photoURL || fbUser?.photoURL || '',
    photoStoragePath: userDocData?.photoStoragePath || ''
  };

  if (view === 'vendor-portal' && currentUserVendorId) {
    const v = vendors.find(v => v.id === currentUserVendorId);
    return v ? <VendorPortal 
      vendor={v} 
      bookings={bookings.filter(b => b.vendorId === v.id)} 
      messages={messages.filter(m => m.receiverId === v.id || m.senderId === v.id)} 
      onUpdateVendor={handleUpdateVendor} 
      onUpdateBookingStatus={handleUpdateBookingStatus} 
      onReplyMessage={handleReplyMessage} 
      onLogout={handleSignOut} 
      showNotification={showNotification}
    /> : <AuthWall />;
  }

  if (view === 'client-portal' && fbUser && userRole === 'client') {
    const myBookings = bookings.filter(b => b.contactEmail === fbUser.email);
    const myMessages = messages.filter(m => m.clientEmail === fbUser.email);
    return <ClientPortal 
      user={currentAuthenticatedUser} 
      cart={cart} 
      bookings={myBookings} 
      messages={myMessages} 
      vendors={vendors} 
      onRemoveFromCart={i => setCart(prev => prev.filter((_, idx) => idx !== i))} 
      onProcessCart={handleProcessCart} 
      onPaymentSuccess={handlePaymentSuccess} 
      onLogout={handleSignOut} 
      onClose={() => setView('marketplace')} 
      onUpdateProfile={handleUpdateProfile} 
      onDeleteAccount={handleDeleteAccount} 
    />;
  }

  if (view === 'posts') return <PostsPage posts={posts} vendors={vendors} onBack={() => setView('marketplace')} onViewVendor={navigateToVendor} />;

  if (view === 'payment-success') {
    return <PaymentSuccess 
      bookingId={paymentBookingId || ''} 
      vendorId={paymentVendorId || ''} 
      onReturn={() => setView('client-portal')} 
    />;
  }

  if (view === 'verify-account') {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#111] border border-[#D4AF37] p-8 rounded-2xl text-center shadow-2xl">
          <div className="flex justify-center mb-6">
            <CheckCircle className="w-16 h-16 text-[#D4AF37]" />
          </div>
          <h2 className="text-3xl font-bold font-[Cinzel] text-[#D4AF37] mb-4">Account Verified!</h2>
          <p className="text-slate-300 mb-8">Your email has been successfully verified. You can now access all features of Simcha Booking.</p>
          <button 
            onClick={() => setView('marketplace')}
            className="w-full bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black py-4 rounded-xl uppercase tracking-widest transition-all"
          >
            Go to Marketplace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-slate-100 flex flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-[#D4AF37] focus:text-black focus:p-4 focus:rounded-lg focus:font-bold">Skip to main content</a>
      <nav className="bg-black sticky top-0 z-40 border-b border-[#D4AF37]/20 shadow-xl" aria-label="Main Navigation">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <button className="flex items-center gap-3 cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-lg p-1" onClick={() => { setView('marketplace'); setActiveCategory('All'); }} aria-label="Simcha Booking Home">
                <SimchaLogo className="h-9 w-9 group-hover:scale-110 transition-transform" />
                <div className="text-left">
                    <h1 className="text-xl md:text-2xl font-bold text-[#D4AF37] tracking-tight font-[Cinzel] leading-tight md:leading-normal">
                      <span className="block md:inline">Simcha</span><span className="block md:inline md:ml-1.5">Booking</span>
                    </h1>
                </div>
            </button>
            <div className="flex items-center gap-6">
                <button onClick={() => setView('posts')} className="hidden md:block text-slate-300 hover:text-[#D4AF37] transition-colors text-sm font-bold uppercase tracking-widest focus-visible:ring-2 focus-visible:ring-[#D4AF37] outline-none rounded p-1">Moments</button>
                <button onClick={() => setView(userRole === 'client' ? 'client-portal' : 'vendor-portal')} className="flex items-center gap-2 bg-[#D4AF37]/10 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border border-[#D4AF37]/20 px-4 py-2 rounded-full transition-all text-[10px] font-black uppercase tracking-widest focus-visible:ring-2 focus-visible:ring-white outline-none" aria-label="Open My Dashboard">
                  <LayoutDashboard className="w-4 h-4" aria-hidden="true" /><span>My Portal</span>
                </button>
                <button onClick={handleSignOut} className="text-slate-500 hover:text-red-500 transition-colors focus-visible:ring-2 focus-visible:ring-red-500 outline-none rounded-lg p-1" aria-label="Sign Out"><LogOut className="w-5 h-5" /></button>
            </div>
          </div>
        </div>
      </nav>

      <main id="main-content" className="flex-1 flex flex-col">
        <section className="relative bg-black text-white overflow-hidden" aria-labelledby="hero-title">
          <div className="absolute inset-0" aria-hidden="true">
            <img src={heroBackgroundUrl} alt="" className="w-full h-full object-cover opacity-80" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent"></div>
          </div>
          <div className="relative max-w-7xl mx-auto px-4 py-16 md:py-32 text-center">
            <h2 id="hero-title" className="text-4xl md:text-7xl font-bold font-[Cinzel] mb-6 tracking-tight text-white drop-shadow-[0_2px_10px_rgba(212,175,55,0.3)]">Celebrate Your <span className="text-[#D4AF37]">Simcha.</span> <br /> <span className="text-3xl md:text-5xl opacity-90">Book Perfection.</span></h2>
            <p className="mb-10 text-slate-300 text-base md:text-lg font-light max-w-2xl mx-auto leading-relaxed">From world-class kosher caterers to soulful bands, curate your complete simcha in one place.</p>
            <div className="max-w-4xl mx-auto bg-[#111] rounded-2xl md:rounded-full p-2 flex flex-col md:flex-row items-stretch md:items-center shadow-2xl border border-[#D4AF37]/20 gap-2 md:gap-0">
              <div className="flex-1 flex items-center px-6 py-3">
                <label htmlFor="search-input" className="sr-only">Search vendors</label>
                <Search className="w-5 h-5 text-[#D4AF37]/50 mr-3 flex-shrink-0" aria-hidden="true" />
                <input id="search-input" type="text" placeholder="Search elite vendors..." className="flex-1 focus:outline-none text-slate-100 placeholder:text-slate-600 bg-transparent h-10 md:h-14 font-medium" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <div className="flex items-center px-6 py-3 border-t md:border-t-0 md:border-l border-[#D4AF37]/10">
                <label htmlFor="date-input" className="sr-only">Event date</label>
                <Calendar className="w-5 h-5 text-[#D4AF37]/50 mr-3 flex-shrink-0" aria-hidden="true" />
                <input id="date-input" type="date" className="focus:outline-none text-slate-300 bg-transparent w-full md:w-auto h-10 md:h-14 font-bold [color-scheme:dark]" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              </div>
              <button className="bg-[#D4AF37] hover:bg-[#E5C76B] text-black px-10 py-4 rounded-xl md:rounded-full font-black uppercase tracking-widest text-sm transition-all shadow-xl focus-visible:ring-2 focus-visible:ring-white outline-none">Search</button>
            </div>
          </div>
        </section>

        {activeCategory === 'All' && !searchTerm ? (
            <section className="py-12 bg-black flex-1" aria-labelledby="categories-heading">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-10"><h2 id="categories-heading" className="text-3xl font-bold font-[Cinzel] mb-4 text-[#D4AF37]">Explore Signature Categories</h2></div>
                    <nav className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" aria-label="Category Browser">
                        {activeCategories.map((cat) => (
                            <button key={cat} onClick={() => setActiveCategory(cat)} className="group relative h-40 rounded-xl overflow-hidden border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 focus-visible:ring-2 focus-visible:ring-[#D4AF37] outline-none transition-all">
                                <img src={categoryImages[cat]} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform" aria-hidden="true" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                                <div className="absolute inset-0 flex items-center justify-center p-2 text-center"><h3 className="text-[#D4AF37] font-bold text-lg font-[Cinzel] tracking-wide">{cat}</h3></div>
                            </button>
                        ))}
                    </nav>
                </div>
            </section>
        ) : (
            <section className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full animate-in fade-in" aria-labelledby="results-heading">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                     <nav className="flex flex-wrap items-center gap-2" aria-label="Breadcrumb">
                        <button onClick={() => setActiveCategory('All')} className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all border outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${activeCategory === 'All' ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-black text-[#D4AF37]/70 hover:bg-[#D4AF37]/10 border-[#D4AF37]/30'}`}>All Categories</button>
                        {activeCategory !== 'All' && <><span className="text-slate-600" aria-hidden="true">/</span><span id="results-heading" className="font-bold text-[#D4AF37]">{activeCategory}</span></>}
                     </nav>
                </header>

                {activeCategory !== 'All' && categorySubCategories[activeCategory] && (
                  <div className="mb-10 space-y-4 animate-in slide-in-from-top-2 duration-300">
                    {Object.entries(categorySubCategories[activeCategory]).map(([group, subCats]) => (
                      <div key={group} className="flex flex-wrap gap-2 items-center bg-[#111]/50 p-3 rounded-xl border border-white/5">
                        <span className="text-[9px] uppercase tracking-[0.2em] text-[#D4AF37]/60 font-black mr-2 min-w-[80px]">{group}</span>
                        <div className="flex flex-wrap gap-2">
                          {(subCats as string[]).map(sub => (
                            <button
                              key={sub}
                              onClick={() => setActiveSubCategories(prev => 
                                prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]
                              )}
                              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                                activeSubCategories.includes(sub)
                                  ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.3)]'
                                  : 'bg-black text-slate-500 border-white/10 hover:border-[#D4AF37]/50 hover:text-slate-300'
                              }`}
                            >
                              {sub}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
                    {filteredVendors.map(v => (
                      <div id={`vendor-${v.id}`} key={v.id} tabIndex={-1} className="outline-none focus:ring-2 focus:ring-[#D4AF37] rounded-xl">
                        <VendorCard 
                          vendor={v} 
                          onBook={v => setBookingVendor(v)} 
                          onMessage={v => setChatVendor(v)} 
                          onQuickView={v => setQuickViewVendor(v)}
                          selectedDate={eventDate} 
                          onAddReview={handleAddReview} 
                        />
                      </div>
                    ))}
                </div>
                {filteredVendors.length === 0 && (
                    <div className="py-20 text-center opacity-40" role="status">
                      <Search className="w-16 h-16 mx-auto mb-4 text-[#D4AF37]" aria-hidden="true" />
                      <p className="text-xl font-[Cinzel]">No vendors match your query.</p>
                    </div>
                )}
            </section>
        )}
      </main>

      <footer className="bg-black border-t border-[#D4AF37]/10 py-16" role="contentinfo">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-10">
                <div className="flex flex-col items-center md:items-start gap-4">
                    <div className="flex items-center gap-3">
                      <SimchaLogo className="h-10 w-10" /><span className="text-2xl font-bold font-[Cinzel] text-[#D4AF37] tracking-wider leading-tight">Simcha Booking</span>
                    </div>
                    <p className="text-slate-400 text-sm max-w-xs text-center md:text-left leading-relaxed">Curating exceptional Jewish celebrations with world-class professional partners.</p>
                </div>
                <nav className="flex flex-col md:flex-row items-center gap-8 md:gap-16" aria-label="Footer Navigation">
                    <div className="flex flex-col gap-3 items-center md:items-start">
                        <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.3em]">Directory</p>
                        <button onClick={() => {setView('marketplace'); setActiveCategory('All');}} className="text-slate-400 hover:text-white text-sm transition-colors outline-none focus-visible:underline">Browse Marketplace</button>
                        <button onClick={() => setView('posts')} className="text-slate-400 hover:text-white text-sm transition-colors outline-none focus-visible:underline">Community Gallery</button>
                    </div>
                    <div className="flex flex-col gap-3 items-center md:items-start">
                        <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.3em]">Access</p>
                        { fbUser?.email === 'bookingsimcha@gmail.com' && (
                          <button onClick={() => setView('admin')} className="text-slate-400 hover:text-[#D4AF37] text-sm flex items-center gap-1.5 transition-colors outline-none focus-visible:underline"><Shield className="w-3.5 h-3.5" aria-hidden="true" /> Administration</button>
                        )}
                    </div>
                </nav>
            </div>
        </div>
      </footer>

      <SuggestionModal isOpen={showSuggestions} onClose={() => setShowSuggestions(false)} sourceVendor={sourceVendorForSuggestions} recommendations={suggestedVendors} onBook={v => setBookingVendor(v)} cartItems={cart.map(i => i.vendor.id)} />
      <BookingModal isOpen={!!bookingVendor} vendor={bookingVendor} selectedDate={eventDate} onClose={() => setBookingVendor(null)} onConfirm={d => { setCart(prev => [...prev, { vendor: bookingVendor!, date: eventDate || new Date().toISOString().split('T')[0], notes: d.notes, clientName: currentAuthenticatedUser.name || d.clientName, eventName: d.eventName, eventLocation: d.eventLocation, eventTime: d.eventTime, contactEmail: currentAuthenticatedUser.username || d.contactEmail, selectedServices: d.selectedServices, amount: d.totalAmount }]); setBookingVendor(null); showNotification(`${bookingVendor!.name} added to plan!`); }} initialDetails={{ clientName: currentAuthenticatedUser.name || '', contactEmail: currentAuthenticatedUser.username || '', eventName: '' }} />
      <ChatModal 
        isOpen={!!chatVendor || isAdminChatOpen} 
        vendor={chatVendor} 
        isAdminMode={isAdminChatOpen}
        messages={messages} 
        user={currentAuthenticatedUser} 
        onSendMessage={handleSendMessage} 
        onClose={() => { setChatVendor(null); setIsAdminChatOpen(false); }} 
        showNotification={showNotification}
      />

      {/* Floating Support Button */}
      {view === 'marketplace' && !isAdminChatOpen && !chatVendor && (
        <button 
          onClick={() => setIsAdminChatOpen(true)}
          className="fixed bottom-8 right-8 z-40 w-14 h-14 bg-[#D4AF37] text-black rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all group shadow-[#D4AF37]/20"
          aria-label="Contact Support"
        >
          <div className="absolute -top-12 right-0 bg-black text-[#D4AF37] px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-[#D4AF37]/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl">
            Need Help?
          </div>
          <AlertCircle className="w-6 h-6" />
        </button>
      )}

      {quickViewVendor && (
        <QuickViewModal 
          vendor={quickViewVendor} 
          onClose={() => setQuickViewVendor(null)} 
          onBook={(v) => { setQuickViewVendor(null); setBookingVendor(v); }}
          onMessage={(v) => { setQuickViewVendor(null); setChatVendor(v); }}
        />
      )}

      {notification && (
        <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300 w-full max-w-sm px-4 pointer-events-none">
          <div className="bg-[#111] text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-[#D4AF37]/40 backdrop-blur-md">
            <CheckCircle className="w-5 h-5 text-green-500" aria-hidden="true" />
            <span className="font-bold text-sm flex-1">{notification.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;