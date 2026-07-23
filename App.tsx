import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingBag, Search, Filter, Menu, User, Star, Calendar, LogIn, Mail, PartyPopper, CheckCircle, X, DollarSign, Clock, Loader2, Shield, MapPin, Lock, ChevronLeft, Tag, Trash2, ExternalLink, ChevronRight, UserPlus, Key, LogOut, MessageSquare, LayoutDashboard, ClipboardList, Camera, AlertCircle, Plus, Send, RefreshCw, ShieldCheck, Check } from 'lucide-react';
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
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, onSnapshot, query, where, orderBy, getDocs, addDoc, arrayUnion, arrayRemove, deleteField, limit, or, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from './services/firebase';
import { uploadFileRobustly } from './services/uploadService';
import { trackFunnelStep } from './services/analyticsService';
import { sendNewMessage, subscribeToUserInbox, ensureAdminSupportConversation } from './services/messagingService';
import VendorCard from './components/VendorCard';
import QuickViewModal from './components/QuickViewModal';
import BookingModal from './components/BookingModal';
import VendorPortal from './components/VendorPortal';
import AdminPanel from './components/AdminPanel';
import PayPalButton from './components/PayPalButton';
import ContactModal from './components/ContactModal';
import PostsPage from './components/PostsPage';
import ChatModal from './components/ChatModal';
import SuggestionModal from './components/SuggestionModal';
import ClientPortal from './components/ClientPortal';
import PaymentSuccess from './components/PaymentSuccess';
import { VENDORS as INITIAL_VENDORS, MOCK_BOOKINGS } from './services/mockData';
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

const ADMIN_EMAILS = ['bookingsimcha@gmail.com', 'ststrohli@gmail.com'];
const isUserAdmin = (email: string | null | undefined): boolean => {
  return typeof email === 'string' && ADMIN_EMAILS.includes(email.trim().toLowerCase());
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

const JEWISH_TAXONOMY: Record<string, { icon: string; image: string; subcategories: Record<string, { image: string; items: string[] }> }> = {
  'Music': {
    icon: 'music',
    image: 'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'DJ': { image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&q=80&w=600', items: ['Wedding DJ', 'Bar Mitzvah DJ', 'Trance & Dance', 'Silent Disco'] },
      'Band': { image: 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?auto=format&fit=crop&q=80&w=600', items: ['Full Orchestra', 'Chassidish Band', 'Contemporary Pop', 'Mizrachi Band'] },
      'Choir': { image: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?auto=format&fit=crop&q=80&w=600', items: ['Adult Men Choir', 'Boys Choir', 'Chuppah Acapella', 'Cantor & Chazzanim'] },
      'One-Man Band': { image: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&q=80&w=600', items: ['Synthesizer Soloist', 'Kumzitz Guitarist', 'Acoustic Violinist'] },
    }
  },
  'Catering': {
    icon: 'utensils',
    image: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'Meat': { image: 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&q=80&w=600', items: ['Glatt Kosher Fine Dining', 'Elegant Plated Beef', 'Traditional Heimish Buffet', 'Gourmet French Cuisines'] },
      'Dairy': { image: 'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&q=80&w=600', items: ['Cholov Yisroel Pizza & Pasta', 'Artisanal Cheese Boards', 'Crepe & Waffle Stations', 'Fish & Salads'] },
      'Desserts & Sweets': { image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=600', items: ['Premium Pastry Buffets', 'Chocolate Fountains', 'Candy Wall Stations', 'Warm Donut Bars'] },
      'Food Trucks': { image: 'https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?auto=format&fit=crop&q=80&w=600', items: ['Pizza & Fries Truck', 'Gelato Ice Cream Truck', 'Churros & Waffles', 'Specialty Coffee Bar'] },
    }
  },
  'Photography': {
    icon: 'camera',
    image: 'https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'Wedding Portraiture': { image: 'https://images.unsplash.com/photo-1537633552985-df8429e8048b?auto=format&fit=crop&q=80&w=600', items: ['Candid Wedding Photos', 'Traditional Formals', 'Fine Art Editorials'] },
      'Pre-Wedding & Portraits': { image: 'https://images.unsplash.com/photo-1520390138845-fd2d229dd553?auto=format&fit=crop&q=80&w=600', items: ['Engagement Shoots', 'Bridal Solo Portraits', 'Family & Kids Portraits'] },
      'Event Photojournalism': { image: 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&q=80&w=600', items: ['Dancing Action Shots', 'Reception Candids', 'Simcha Highlights'] }
    }
  },
  'Videography': {
    icon: 'video',
    image: 'https://images.unsplash.com/photo-1579632652768-6cb9dcf85912?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'Cinematic Film': { image: 'https://images.unsplash.com/photo-1579632652768-6cb9dcf85912?auto=format&fit=crop&q=80&w=600', items: ['Feature Documentaries', 'Cinematic Highlights', 'Next-Day Edits'] },
      'Aerial & Drone': { image: 'https://images.unsplash.com/photo-1508614589041-895b88991e3e?auto=format&fit=crop&q=80&w=600', items: ['Scenic Venue Flyovers', 'Overhead Dancing Clips', 'Landscape Videography'] }
    }
  },
  'Photography & Video': {
    icon: 'camera',
    image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'Wedding Highlights': { image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&q=80&w=600', items: ['Candid Photography', 'Cinematic Videos', 'Aerial Drone Shoots', 'Portrait Studios'] }
    }
  },
  'Design & Florals': {
    icon: 'flower',
    image: 'https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'Chupah Design': { image: 'https://images.unsplash.com/photo-1478146896981-b80fe463b330?auto=format&fit=crop&q=80&w=600', items: ['Floral Chupah Canopy', 'Modern Plexiglass Chupah', 'Traditional Velvet Chupah'] },
      'Table Centerpieces': { image: 'https://images.unsplash.com/photo-1563241527-3004b7be0ffd?auto=format&fit=crop&q=80&w=600', items: ['Tall Flower Stands', 'Low Floral Cascades', 'Candles & Decor Sets'] },
      'Bouquets': { image: 'https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&q=80&w=600', items: ['Bridal Bouquets', 'Bridesmaid Bouquets', 'Boutonnieres & Pins'] },
      'Lighting & Production': { image: 'https://images.unsplash.com/photo-1470229722913-7c092db65f8c?auto=format&fit=crop&q=80&w=600', items: ['Ambient Uplighting', 'Spotlight Fixtures', 'Custom Gobo Projection'] },
    }
  },
  'Florist & Decor': {
    icon: 'flower',
    image: 'https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'Wedding Florals': { image: 'https://images.unsplash.com/photo-1507290439931-a861b5a38200?auto=format&fit=crop&q=80&w=600', items: ['Bridal Bouquets', 'Chuppah Florals', 'Boutonnieres'] },
      'Event Design': { image: 'https://images.unsplash.com/photo-1513201099705-a9746e1e201f?auto=format&fit=crop&q=80&w=600', items: ['Luxury Centerpieces', 'Table Scapes & Decor'] }
    }
  },
  'Venue': {
    icon: 'building',
    image: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'Grand Ballrooms': { image: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=600', items: ['Grand Ballroom', 'Historical Hall', 'Symphony Hall'] },
      'Boutique & Intimate': { image: 'https://images.unsplash.com/photo-1527529482837-4698179dc6ce?auto=format&fit=crop&q=80&w=600', items: ['Boutique Loft', 'Private Mansion', 'Secret Garden'] },
      'Outdoor & Scenic': { image: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&q=80&w=600', items: ['Vineyard', 'Beachside Pavilion', 'Country Estate'] }
    }
  },
  'Event Planning': {
    icon: 'calendar',
    image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'Planning Services': { image: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?auto=format&fit=crop&q=80&w=600', items: ['Full Service Planning', 'Month-Of Coordination', 'Day-Of Logistics'] }
    }
  },
  'Attire': {
    icon: 'shirt',
    image: 'https://images.unsplash.com/photo-1594552072238-b8a33785b261?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'Bridal Wear': { image: 'https://images.unsplash.com/photo-1594552072238-b8a33785b261?auto=format&fit=crop&q=80&w=600', items: ['Designer Gowns', 'Veils & Accessories'] },
      'Menswear': { image: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&q=80&w=600', items: ['Bespoke Tuxedos', 'Suit Rentals'] }
    }
  },
  'Makeup & Hair': {
    icon: 'sparkles',
    image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'Beauty Artistry': { image: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&q=80&w=600', items: ['Bridal Makeup', 'Airbrush Makeup', 'Event Hairstyling'] }
    }
  },
  'Judaica & Gifts': {
    icon: 'gift',
    image: 'https://images.unsplash.com/photo-1543157145-f78c636d023d?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'Ceremony & Gifts': { image: 'https://images.unsplash.com/photo-1543157145-f78c636d023d?auto=format&fit=crop&q=80&w=600', items: ['Custom Ketubah', 'Chuppah Glass Sets', 'Jewish Art & Gifts'] }
    }
  },
  'Rabbi & Officiants': {
    icon: 'user-check',
    image: 'https://images.unsplash.com/photo-1550592704-6c76defa99ce?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'Officiating': { image: 'https://images.unsplash.com/photo-1550592704-6c76defa99ce?auto=format&fit=crop&q=80&w=600', items: ['Orthodox Rabbi', 'Conservative Rabbi', 'Chuppah Cantor'] }
    }
  },
  'Invitations': {
    icon: 'mail',
    image: 'https://images.unsplash.com/photo-1550953683-9366e632b6a9?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'Stationery': { image: 'https://images.unsplash.com/photo-1550953683-9366e632b6a9?auto=format&fit=crop&q=80&w=600', items: ['Luxury Letterpress', 'Gold Foil Engraving', 'Digital Invitations'] }
    }
  },
  'Entertainment': {
    icon: 'sparkles',
    image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'Interactive Talent': { image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&q=80&w=600', items: ['Caricature Artists', 'Close-up Magicians', 'Interactive Dance Teams'] }
    }
  },
  'Rentals': {
    icon: 'package',
    image: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'Equipment': { image: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=80&w=600', items: ['Luxury Lounges', 'Chair & Table Rentals', 'Dance Floors & Stages'] }
    }
  },
  'Transportation': {
    icon: 'car',
    image: 'https://images.unsplash.com/photo-1563297775-81676646bc5f?auto=format&fit=crop&q=80&w=800',
    subcategories: {
      'Vehicles': { image: 'https://images.unsplash.com/photo-1563297775-81676646bc5f?auto=format&fit=crop&q=80&w=600', items: ['Chauffeur Limousines', 'Vintage Wedding Cars', 'Shuttle Buses'] }
    }
  }
};

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
  const [view, setView] = useState<'marketplace' | 'vendor-portal' | 'admin' | 'posts' | 'client-portal' | 'payment-success' | 'verify-account' | 'portal'>('marketplace');
  const [portalTab, setPortalTab] = useState<'client' | 'vendor'>('client');
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

  const isActuallyVendor = useMemo(() => {
    if (!fbUser?.email) return false;
    return userRole === 'vendor' || 
           userDocData?.role === 'vendor' || 
           vendors.some(v => v.username?.toLowerCase() === fbUser.email?.toLowerCase());
  }, [fbUser, userRole, userDocData, vendors]);

  const vendorProfileId = useMemo(() => {
    if (!fbUser?.email) return null;
    if (currentUserVendorId) return currentUserVendorId;
    if (userDocData?.vendorId) return userDocData.vendorId;
    const matchedVendor = vendors.find(v => v.username?.toLowerCase() === fbUser.email?.toLowerCase());
    return matchedVendor ? matchedVendor.id : null;
  }, [fbUser, currentUserVendorId, userDocData, vendors]);
  
  const [activeCategories, setActiveCategories] = useState<string[]>(Object.values(VendorCategory));
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>(INITIAL_CATEGORY_IMAGES);
  const [categorySubCategories, setCategorySubCategories] = useState<Record<string, Record<string, string[]>>>({});
  const [subCategoryImages, setSubCategoryImages] = useState<Record<string, string>>({});
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
    } catch (err: any) {
      if (err.message?.includes('offline') || err.message?.includes('Failed to get document')) {
        console.warn("User profile sync paused (offline mode):", err.message);
      } else {
        console.error("Error syncing user profile:", err);
      }
    }
  };

  // Sync legacy portal views to unified portal
  useEffect(() => {
    if (view === 'vendor-portal') {
      setPortalTab('vendor');
      setView('portal');
    } else if (view === 'client-portal') {
      setPortalTab('client');
      setView('portal');
    }
  }, [view]);

  // Firestore Sync - Global Data
  useEffect(() => {
    const unsubVendors = onSnapshot(collection(db, 'vendors'), (snapshot) => {
      const vDataRaw = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vendor));
      const vData = Array.from(new Map(vDataRaw.map(v => [v.id, v])).values());
      if (snapshot.empty && INITIAL_VENDORS.length > 0) {
        // Seed if empty efficiently
        console.log("[Firebase] Seeding initial vendors...");
        Promise.all(INITIAL_VENDORS.map(v => setDoc(doc(db, 'vendors', v.id), clean(v))))
          .catch(err => console.error("Error seeding vendors:", err));
      } else {
        setVendors(vData);
      }
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'vendors'));

    const unsubPosts = onSnapshot(collection(db, 'posts'), (snapshot) => {
      const pDataRaw = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
      const pData = Array.from(new Map(pDataRaw.map(p => [p.id, p])).values());
      setPosts(pData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'posts'));

    const unsubMetadata = onSnapshot(doc(db, 'metadata', 'app_config'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.heroBackgroundUrl) setHeroBackgroundUrl(data.heroBackgroundUrl);
      } else {
        // Seed metadata
        setDoc(doc(db, 'metadata', 'app_config'), {
          categories: Object.values(VendorCategory),
          categoryImages: INITIAL_CATEGORY_IMAGES,
          categorySubCategories: {},
          subCategoryImages: {},
          heroBackgroundUrl: "https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?ixlib=rb-1.2.1&auto=format&fit=crop&w=1950&q=80"
        });
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'metadata/app_config'));

    const unsubCategories = onSnapshot(
      query(collection(db, 'categories'), orderBy('order', 'asc')),
      (snapshot) => {
        if (!snapshot.empty) {
          const list: string[] = [];
          const imgs: Record<string, string> = { ...INITIAL_CATEGORY_IMAGES };
          const subCats: Record<string, Record<string, string[]>> = {};
          const subImgs: Record<string, string> = {};

          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            const catName = data.name;
            list.push(catName);
            if (data.image) {
              imgs[catName] = data.image;
            }
            if (data.subcategories) {
              subCats[catName] = {};
              for (const [subName, subData] of Object.entries(data.subcategories)) {
                const typedSubData = subData as { image?: string; items?: string[] };
                subCats[catName][subName] = typedSubData.items || [];
                if (typedSubData.image) {
                  subImgs[subName] = typedSubData.image;
                  (typedSubData.items || []).forEach(item => {
                    subImgs[item] = typedSubData.image!;
                  });
                }
              }
            }
          });

          setActiveCategories(list);
          setCategoryImages(imgs);
          setCategorySubCategories(subCats);
          setSubCategoryImages(prev => ({ ...prev, ...subImgs }));
        } else {
          setActiveCategories(Object.values(VendorCategory));
          setCategoryImages(INITIAL_CATEGORY_IMAGES);
          setCategorySubCategories({});
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'categories')
    );

    return () => {
      unsubVendors();
      unsubPosts();
      unsubMetadata();
      unsubCategories();
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

    // Messages (Subcollection aggregation to keep existing UI fully intact without deep structural rewrite of all panels)
    let unsubMessages = () => {};
    
    // First, determine conversation query based on role
    let convoQuery;
    if (userRole === 'admin') {
      convoQuery = collection(db, 'conversations');
    } else {
      convoQuery = query(
        collection(db, 'conversations'),
        where('participant_ids', 'array-contains', fbUser.uid)
      );
    }

    const activeListeners = new Map<string, () => void>();
    const allConvoMessages = new Map<string, Message[]>();

    const rebuildMergedMessages = () => {
      const merged: Message[] = [];
      for (const msgs of allConvoMessages.values()) {
        merged.push(...msgs);
      }
      // Chronological sort
      merged.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeA - timeB;
      });
      setMessages(merged);
    };

    const unsubConvos = onSnapshot(convoQuery, (snapshot) => {
      // For each conversation, subscribe to its subcollection message list
      const currentConversations = snapshot.docs.map(doc => doc.id);
      
      // Clean up listeners for conversations that are no longer active
      for (const cid of activeListeners.keys()) {
        if (!currentConversations.includes(cid)) {
          activeListeners.get(cid)?.();
          activeListeners.delete(cid);
          allConvoMessages.delete(cid);
        }
      }

      snapshot.docs.forEach((convoDoc) => {
        const cid = convoDoc.id;
        if (!activeListeners.has(cid)) {
          const msgQuery = query(
            collection(db, 'conversations', cid, 'messages'),
            orderBy('sent_at', 'asc')
          );
          
          const unsubMsg = onSnapshot(msgQuery, (msgSnap) => {
            const msgs = msgSnap.docs.map(docSnap => {
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
            allConvoMessages.set(cid, msgs);
            rebuildMergedMessages();
          }, (err) => {
            console.warn(`Fallback for message listener on ${cid}:`, err);
            // Fallback without ordering
            const fallbackQuery = collection(db, 'conversations', cid, 'messages');
            const unsubFallback = onSnapshot(fallbackQuery, (msgSnap) => {
              const msgs = msgSnap.docs.map(docSnap => {
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
              allConvoMessages.set(cid, msgs);
              rebuildMergedMessages();
            }, (err2) => {
              console.error(`Fallback failed on conversation messages query for ${cid}:`, err2);
            });
            activeListeners.set(cid + '_fallback', unsubFallback);
          });
          activeListeners.set(cid, unsubMsg);
        }
      });
      
      if (snapshot.docs.length === 0) {
        setMessages([]);
      } else {
        rebuildMergedMessages();
      }
    }, (err) => {
      console.error("Error subscribing to user conversations:", err);
    });

    unsubMessages = () => {
      unsubConvos();
      activeListeners.forEach(unsub => unsub());
      activeListeners.clear();
    };

    const unsubCart = onSnapshot(doc(db, 'users', fbUser.uid, 'cart', 'current'), (docSnap) => {
      if (docSnap.exists()) {
        setCart(docSnap.data().items || []);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${fbUser.uid}/cart/current`));

    // Users (Admin only)
    let unsubUsers = () => {};
    if (userRole === 'admin') {
      unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        const uDataRaw = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserAccount));
        const uData = Array.from(new Map(uDataRaw.map(u => [u.id, u])).values());
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
      // Set initializing to false early if not logged in to show guest UI faster
      if (!user) {
        setFbUser(null);
        setUserDocData(null);
        setUserRole(null);
        setCurrentUserVendorId(null);
        setIsInitializing(false);
        return;
      }

      // If logged in but email not verified, we also treat it as not fully authenticated for the app, EXCEPT if they are a vendor!
      if (!user.emailVerified) {
        let isVendor = false;
        try {
          const vendorDoc = await getDoc(doc(db, 'vendors', user.uid));
          if (vendorDoc.exists()) {
            isVendor = true;
          } else if (user.email) {
            const q = query(collection(db, 'vendors'), where('contactEmail', '==', user.email));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
              isVendor = true;
            } else {
              const q2 = query(collection(db, 'vendors'), where('username', '==', user.email));
              const snapshot2 = await getDocs(q2);
              if (!snapshot2.empty) {
                isVendor = true;
              }
            }
          }
        } catch (err: any) {
          if (err.message?.includes('offline') || err.message?.includes('Failed to get document')) {
            console.warn("Vendor status check paused (offline mode) during auth state change:", err.message);
            if (user.email && INITIAL_VENDORS.some(v => v.username?.toLowerCase() === user.email?.toLowerCase())) {
              isVendor = true;
            }
          } else {
            console.error("Error checking vendor status during auth state change:", err);
          }
        }

        if (!isVendor) {
          setFbUser(null);
          setIsInitializing(false);
          return;
        }
      }

      setFbUser(user);
      
      // Non-blocking profile sync
      syncUserProfile(user).catch(err => console.error("Background profile sync failed:", err));
      
      // Fetch user doc data
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserDocData(data);
          const role = data.role || (isUserAdmin(user.email) ? 'admin' : 'client');
          setUserRole(role);
          setCurrentUserVendorId(data.vendorId || null);
        } else {
          // Default for new users
          setUserRole(isUserAdmin(user.email) ? 'admin' : 'client');
          setCurrentUserVendorId(null);
        }
      } catch (err: any) {
        if (err.message?.includes('offline') || err.message?.includes('Failed to get document')) {
          console.warn("User document fetch paused (offline mode):", err.message);
        } else {
          console.error("Error fetching user document:", err);
        }
      } finally {
        setIsInitializing(false);
      }
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
  const [activeSubCategoryGroup, setActiveSubCategoryGroup] = useState<string | null>(null);
  const [activeSubCategories, setActiveSubCategories] = useState<string[]>([]);
  const [activeSubSubCategory, setActiveSubSubCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [bookingVendor, setBookingVendor] = useState<Vendor | null>(null);
  const [initialBookingDetails, setInitialBookingDetails] = useState<any>(null);
  const [quickViewVendor, setQuickViewVendor] = useState<Vendor | null>(null);

  const handleViewVendor = (v: Vendor | null) => {
    if (v) {
      trackFunnelStep.viewVendor(v.id, v.name, v.category);
    }
    setQuickViewVendor(v);
  };
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
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'info' | 'error'} | null>(null);
  
  const [suggestedVendors, setSuggestedVendors] = useState<Vendor[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showPriorityHoldPopup, setShowPriorityHoldPopup] = useState(false);
  const [sourceVendorForSuggestions, setSourceVendorForSuggestions] = useState<Vendor | null>(null);
  const [isPriorityLockForSuggestions, setIsPriorityLockForSuggestions] = useState(false);
  const [suggestionsEventDate, setSuggestionsEventDate] = useState('');
  const [pendingPrioritySuggestions, setPendingPrioritySuggestions] = useState(false);
  const [isPriorityFromSuggestions, setIsPriorityFromSuggestions] = useState(false);

  const filteredVendors = useMemo(() => {
    return vendors.filter(vendor => {
      const matchesCategory = activeCategory === 'All' || vendor.category === activeCategory;
      const matchesSearch = vendor.name.toLowerCase().includes(searchTerm.toLowerCase()) || vendor.location.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSubCategories = activeSubSubCategory 
        ? vendor.subCategories?.includes(activeSubSubCategory)
        : (activeSubCategories.length === 0 || activeSubCategories.some(sub => vendor.subCategories?.includes(sub)));
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
  }, [vendors, activeCategory, searchTerm, eventDate, activeSubCategories, activeSubSubCategory]);

  useEffect(() => {
    setActiveSubCategories([]);
    setActiveSubCategoryGroup(null);
    setActiveSubSubCategory(null);
  }, [activeCategory]);

  const showNotification = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
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
      setPortalTab('vendor');
      setView('portal');
      showNotification('Stripe account connected successfully!', 'success');
      // Only clean up if we don't need the bypass in VendorPortal
      if (!params.get('stripeAccountId') && !params.get('stripe_acc_id')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } else if (onboardStatus === 'pending') {
      setPortalTab('vendor');
      setView('portal');
      showNotification('Stripe account is pending. Please complete all requirements in the Stripe dashboard.', 'info');
      if (!params.get('stripeAccountId') && !params.get('stripe_acc_id')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    } else if (onboardStatus === 'refresh') {
      setPortalTab('vendor');
      setView('portal');
      showNotification('Stripe onboarding session refreshed.', 'info');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (onboardStatus === 'error') {
      const msg = params.get('message');
      setPortalTab('vendor');
      setView('portal');
      showNotification(msg ? `Stripe Error: ${msg}` : 'There was an error connecting your Stripe account.', 'info');
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Proactive Stripe check if requested via URL
    if (checkStripe === 'true' && currentUserVendorId) {
      const vendor = vendors.find(v => v.id === currentUserVendorId);
      if (vendor?.stripeAccountId) {
        console.log("[Stripe] Proactive check triggered by URL parameter");
        const apiUrl = `${window.location.protocol}//${window.location.host}/api/stripe/verify-connection`;
        fetch(apiUrl, {
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

  const getClientUidSync = (email: string): string => {
    if (!email) return '';
    const foundUser = users.find(u => u.username?.toLowerCase() === email.toLowerCase());
    if (foundUser) return foundUser.id;
    const msgFromClient = messages.find(m => m.clientEmail?.toLowerCase() === email.toLowerCase() && m.senderId && m.senderId !== 'admin');
    if (msgFromClient) return msgFromClient.senderId;
    return '';
  };

  const handleReplyMessage = async (email: string, name: string, text: string, type: 'text' | 'image' | 'voice' | 'file' = 'text', fileUrl?: string, audioUrl?: string, fileName?: string, fileType?: string) => {
    if (!currentUserVendorId) return;
    try {
      const clientUid = getClientUidSync(email) || 'client_legacy';
      const senderId = currentUserVendorId;
      const receiverId = clientUid;
      const conversationId = [senderId, receiverId].sort().join('_');

      await sendNewMessage({
        senderId,
        receiverId,
        conversationId,
        participants: [senderId, receiverId],
        clientEmail: email,
        clientName: name,
        text,
        senderRole: 'vendor',
        type,
        fileUrl,
        audioUrl,
        fileName,
        fileType
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

      if (cart.length > 0) {
        const totalAmt = cart.reduce((acc, curr) => acc + curr.amount, 0);
        trackFunnelStep.submitBookingRequest(cart.length, totalAmt);
      }

      setCart([]);
      await deleteDoc(doc(db, 'users', fbUser.uid, 'cart', 'current'));
      setShowPriorityHoldPopup(true);
      showNotification('Requests sent!');
    } catch (err) {
      console.error("Error processing cart:", err);
    }
  };

  const handleConfirmBooking = async (d: any) => {
    if (!bookingVendor) return;
    trackFunnelStep.addToPlan(bookingVendor.id, bookingVendor.name, bookingVendor.category, d.totalAmount);
    
    const bookingDate = d.date || eventDate || new Date().toLocaleDateString('en-CA');
    const finalClientName = d.clientName || currentAuthenticatedUser.name || '';
    const finalContactEmail = d.contactEmail || currentAuthenticatedUser.username || '';

    if (d.isDirectBook) {
      const newBooking = {
        vendorId: bookingVendor.id,
        clientName: finalClientName,
        eventName: d.eventName,
        date: bookingDate,
        status: 'pending' as const,
        paymentStatus: 'pending' as const,
        amount: d.totalAmount,
        contactEmail: finalContactEmail,
        selectedServices: d.selectedServices || [],
        eventLocation: d.eventLocation || '',
        eventTime: d.eventTime || '',
        notes: d.notes || '',
        createdAt: new Date().toISOString()
      };

      try {
        try {
          await addDoc(collection(db, 'bookings'), newBooking);
        } catch (dbErr) {
          console.warn("Could not save booking to database (possibly offline), continuing flow:", dbErr);
        }
        await sendBookingConfirmation(newBooking);

        setCart(prev => [...prev, {
          vendor: bookingVendor,
          date: bookingDate,
          notes: d.notes,
          clientName: finalClientName,
          eventName: d.eventName,
          eventLocation: d.eventLocation,
          eventTime: d.eventTime,
          contactEmail: finalContactEmail,
          selectedServices: d.selectedServices,
          amount: d.totalAmount
        }]);
        
        // Suggest other available vendors on the same date
        const availableOthers = vendors.filter(v => v.id !== bookingVendor.id && !v.unavailableDates?.includes(bookingDate) && cart.findIndex(c => c.vendor.id === v.id) === -1);
        setSuggestedVendors(availableOthers.sort((a,b) => b.rating - a.rating).slice(0, 4));
        setSourceVendorForSuggestions(bookingVendor);
        setIsPriorityLockForSuggestions(!!d.isPriorityDate || isPriorityFromSuggestions);
        setSuggestionsEventDate(bookingDate);
        
        if (d.isPriorityDate || isPriorityFromSuggestions) {
          setPendingPrioritySuggestions(true);
        } else {
          setPendingPrioritySuggestions(false);
        }
        setShowSuggestions(false);
      } catch (err) {
        console.error("Error creating direct booking:", err);
        showNotification("Error creating booking. Please try again.");
      }
    } else {
      try {
        setCart(prev => [...prev, {
          vendor: bookingVendor,
          date: bookingDate,
          notes: d.notes,
          clientName: finalClientName,
          eventName: d.eventName,
          eventLocation: d.eventLocation,
          eventTime: d.eventTime,
          contactEmail: finalContactEmail,
          selectedServices: d.selectedServices,
          amount: d.totalAmount
        }]);
        
        // Suggest other available vendors on the same date
        const availableOthers = vendors.filter(v => v.id !== bookingVendor.id && !v.unavailableDates?.includes(bookingDate) && cart.findIndex(c => c.vendor.id === v.id) === -1);
        setSuggestedVendors(availableOthers.sort((a,b) => b.rating - a.rating).slice(0, 4));
        setSourceVendorForSuggestions(bookingVendor);
        setIsPriorityLockForSuggestions(!!d.isPriorityDate || isPriorityFromSuggestions);
        setSuggestionsEventDate(bookingDate);
        
        if (d.isPriorityDate || isPriorityFromSuggestions) {
          setPendingPrioritySuggestions(true);
        } else {
          setPendingPrioritySuggestions(false);
        }
        setShowSuggestions(false);
      } catch (err) {
        console.error("Error adding to plan:", err);
        showNotification("Error adding to plan. Please try again.");
      }
    }
  };

  const handleEditCartItem = (index: number) => {
    const item = cart[index];
    if (item) {
      const selectedServiceIds = item.selectedServices?.map(s => s.id) || [];
      const selectedServiceQuantities: Record<string, number> = {};
      item.selectedServices?.forEach(s => {
        selectedServiceQuantities[s.id] = s.quantity || 1;
      });

      setInitialBookingDetails({
        clientName: item.clientName || currentAuthenticatedUser.name || '',
        contactEmail: item.contactEmail || currentAuthenticatedUser.username || '',
        eventName: item.eventName || '',
        eventLocation: item.eventLocation || '',
        eventTime: item.eventTime || '',
        notes: item.notes || '',
        selectedServiceIds,
        selectedServiceQuantities
      });
      setBookingVendor(item.vendor);
      handleRemoveFromCart(index);
    }
  };

  const handleRemoveFromCart = (index: number) => {
    const item = cart[index];
    if (item) {
      trackFunnelStep.removeFromPlan(item.vendor.id, item.vendor.name, item.vendor.category);
    }
    setCart(prev => prev.filter((_, idx) => idx !== index));
  };

  const handlePaymentSuccess = async (id: string, method: string) => {
    try {
      await updateDoc(doc(db, 'bookings', id), {
        paymentStatus: 'paid',
        paymentMethod: method
      });
      const bObj = bookings.find(b => b.id === id);
      if (bObj) {
        trackFunnelStep.completedPurchase(id, bObj.vendorId, bObj.amount, method);
      }
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
        date: new Date().toLocaleDateString('en-CA')
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
      
      // Also precheck/create their linked system user document so their role is mapped instantly
      const userDocRef = doc(db, 'users', vendor.id);
      await setDoc(userDocRef, {
        uid: vendor.id,
        email: vendor.contactEmail?.trim() || '',
        name: vendor.name,
        role: 'vendor',
        vendorId: vendor.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });

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

  const handleSeedTaxonomy = async () => {
    if (!isUserAdmin(fbUser?.email)) return;
    
    try {
      const batch = writeBatch(db);
      
      // Forcefully push this entire structure into a collection named 'categories'
      let index = 0;
      for (const [catName, catData] of Object.entries(JEWISH_TAXONOMY)) {
        // We'll use the category name as the document ID so it's clean and doesn't duplicate
        const catRef = doc(collection(db, 'categories'), catName.replace(/[^a-zA-Z0-9]/g, '_'));
        batch.set(catRef, {
          name: catName,
          icon: catData.icon,
          image: catData.image,
          subcategories: catData.subcategories,
          order: index++,
          updatedAt: new Date().toISOString()
        });
      }

      // Also update the legacy app_config to avoid breaking the rest of the app if it relies on it
      const newCategories = Object.keys(JEWISH_TAXONOMY);
      const newCategoryImages: Record<string, string> = {};
      const newCategorySubCategories: Record<string, Record<string, string[]>> = {};
      const newSubCategoryImages: Record<string, string> = {};

      for (const [catName, catData] of Object.entries(JEWISH_TAXONOMY)) {
        newCategoryImages[catName] = catData.image;
        newCategorySubCategories[catName] = {};
        for (const [subName, subData] of Object.entries(catData.subcategories)) {
          newCategorySubCategories[catName][subName] = subData.items;
          newSubCategoryImages[subName] = subData.image;
          for (const item of subData.items) {
            newSubCategoryImages[item] = subData.image;
          }
        }
      }

      const configRef = doc(db, 'metadata', 'app_config');
      batch.update(configRef, {
        categories: newCategories,
        categoryImages: newCategoryImages,
        categorySubCategories: newCategorySubCategories,
        subCategoryImages: newSubCategoryImages
      });
      
      await batch.commit();
      
      console.log('Taxonomy data successfully written to Firestore.');
      window.alert('Database successfully seeded with Jewish Event Taxonomy!');
      showNotification('Database successfully seeded with Jewish Event Taxonomy!', 'success');
    } catch (err: any) {
      console.error("Error seeding taxonomy:", err);
      showNotification(err.message || 'Failed to seed taxonomy.', 'error');
    }
  };

  const handleAdminUpdateSubCategoryImage = async (subCategory: string, url: string) => {
    try {
      // Find which category owns this subcategory
      let foundCatName: string | null = null;
      for (const [catName, subs] of Object.entries(categorySubCategories)) {
        if (subs && Object.keys(subs).includes(subCategory)) {
          foundCatName = catName;
          break;
        }
      }

      if (foundCatName) {
        const catId = foundCatName.replace(/[^a-zA-Z0-9]/g, '_');
        const catRef = doc(db, 'categories', catId);
        const docSnap = await getDoc(catRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const subcategories = data.subcategories || {};
          if (subcategories[subCategory]) {
            subcategories[subCategory].image = url;
            await updateDoc(catRef, { subcategories });
          }
        }
      }

      await updateDoc(doc(db, 'metadata', 'app_config'), {
        [`subCategoryImages.${subCategory}`]: url
      });
      
      setSubCategoryImages(prev => ({
        ...prev,
        [subCategory]: url
      }));

      showNotification('Subcategory image updated!');
    } catch (err) {
      console.error("Error updating subcategory image:", err);
    }
  };

  const handleAdminUpdateCategoryImage = async (cat: string, url: string) => {
    try {
      const catId = cat.replace(/[^a-zA-Z0-9]/g, '_');
      const catRef = doc(db, 'categories', catId);
      await updateDoc(catRef, {
        image: url,
        updatedAt: new Date().toISOString()
      });

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
      const nextOrder = activeCategories.length;
      const catId = name.replace(/[^a-zA-Z0-9]/g, '_');
      const catRef = doc(db, 'categories', catId);
      
      const initialSubcategories: Record<string, { image: string; items: string[] }> = {};
      subCats.forEach(sub => {
        initialSubcategories[sub] = {
          image: image,
          items: []
        };
      });

      await setDoc(catRef, {
        name,
        image,
        icon: 'folder',
        subcategories: initialSubcategories,
        order: nextOrder,
        updatedAt: new Date().toISOString()
      });

      await updateDoc(doc(db, 'metadata', 'app_config'), {
        categories: arrayUnion(name),
        [`categoryImages.${name}`]: image
      });
      showNotification('Category added!');
    } catch (err) {
      console.error("Error adding category:", err);
    }
  };

  const handleAdminDeleteCategory = async (name: string) => {
    try {
      const catId = name.replace(/[^a-zA-Z0-9]/g, '_');
      const catRef = doc(db, 'categories', catId);
      await deleteDoc(catRef);

      // Clean up metadata app_config
      const appConfigRef = doc(db, 'metadata', 'app_config');
      const appConfigSnap = await getDoc(appConfigRef);
      if (appConfigSnap.exists()) {
        await updateDoc(appConfigRef, {
          categories: arrayRemove(name),
          [`categoryImages.${name}`]: deleteField()
        });
      }
      showNotification('Category deleted successfully!');
    } catch (err) {
      console.error("Error deleting category:", err);
      showNotification('Failed to delete category.', 'info');
    }
  };

  const handleAdminUpdateCategorySubCategories = async (cat: string, subs: Record<string, string[]>) => {
    try {
      const catId = cat.replace(/[^a-zA-Z0-9]/g, '_');
      const catRef = doc(db, 'categories', catId);
      const docSnap = await getDoc(catRef);
      
      let existingSubcategories: Record<string, { image: string; items: string[] }> = {};
      if (docSnap.exists()) {
        const data = docSnap.data();
        existingSubcategories = data.subcategories || {};
      }

      const updatedSubcategories: Record<string, { image: string; items: string[] }> = {};
      for (const [subName, items] of Object.entries(subs)) {
        const oldSub = existingSubcategories[subName];
        updatedSubcategories[subName] = {
          image: oldSub?.image || "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&q=80&w=600",
          items: items || []
        };
      }

      await setDoc(catRef, {
        subcategories: updatedSubcategories,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      await updateDoc(doc(db, 'metadata', 'app_config'), {
        [`categorySubCategories.${cat}`]: subs
      });
      showNotification('Taxonomy updated!');
    } catch (err) {
      console.error("Error updating taxonomy:", err);
    }
  };

  const handleAdminUpdateCategoryOrder = async (orderedCategories: string[]) => {
    try {
      const batch = writeBatch(db);
      orderedCategories.forEach((catName, index) => {
        const catRef = doc(db, 'categories', catName.replace(/[^a-zA-Z0-9]/g, '_'));
        batch.set(catRef, { order: index }, { merge: true });
      });
      
      const configRef = doc(db, 'metadata', 'app_config');
      batch.update(configRef, {
        categories: orderedCategories
      });
      
      await batch.commit();
      showNotification('Category order updated!');
    } catch (err) {
      console.error("Error updating category order:", err);
      showNotification('Failed to update category order.', 'error');
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
      const currentUid = fbUser?.uid || '';
      
      let senderId = currentUid;
      let receiverId = payload.receiverId || '';

      // If sending from Admin panel
      if (payload.senderId === 'admin' || userRole === 'admin') {
        senderId = 'admin';
        // Resolve client's actual UID
        if (payload.clientEmail) {
          receiverId = getClientUidSync(payload.clientEmail) || 'client_legacy';
        }
      }
      
      // If sending from Vendor portal
      if (userRole === 'vendor' && currentUserVendorId) {
        senderId = currentUserVendorId;
      }

      // Overwrite with payload sender/receiver if specifically provided and valid
      if (payload.senderId) senderId = payload.senderId;
      if (payload.receiverId) receiverId = payload.receiverId;

      // Fix admin routing: Ensure that when a Client or Vendor initiates a chat with the Admin, 
      // the system targets a specific, globally recognized Admin UID ('admin')—not the user's own UID.
      if (payload.isAdminInquiry || payload.receiverId === 'admin') {
        if (senderId !== 'admin') {
          // Client or Vendor sending to Admin
          receiverId = 'admin';
        } else {
          // Admin replying to client; receiverId is resolved to the client
          if (payload.clientEmail) {
            receiverId = getClientUidSync(payload.clientEmail) || 'client_legacy';
          }
        }
      }

      const conversationId = [senderId, receiverId].sort().join('_');

      let resolvedVendorEmail = '';
      if (userRole === 'vendor') {
        resolvedVendorEmail = fbUser?.email || '';
      } else {
        const targetVendor = vendors.find(v => v.id === senderId || v.id === receiverId);
        if (targetVendor) {
          resolvedVendorEmail = targetVendor.contactEmail || '';
        }
      }

      const msgData = {
        clientEmail: payload.clientEmail || fbUser?.email || '',
        clientName: payload.clientName || fbUser?.displayName || fbUser?.email?.split('@')[0] || 'Guest',
        ...payload,
        senderId, // ensure locked
        receiverId, // ensure locked
        conversationId, // ensure locked
        participants: [senderId, receiverId],
        vendorEmail: resolvedVendorEmail,
        senderRole: userRole || 'client',
      };

      await sendNewMessage(msgData);
      
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

        // Determine if this user corresponds to a vendor
        let isVendor = false;
        let matchedVendor = null;
        try {
          const vendorDoc = await getDoc(doc(db, 'vendors', user.uid));
          if (vendorDoc.exists()) {
            isVendor = true;
            matchedVendor = { id: vendorDoc.id, ...vendorDoc.data() } as Vendor;
          } else {
            const q = query(collection(db, 'vendors'), where('contactEmail', '==', email.trim()));
            const qSnap = await getDocs(q);
            if (!qSnap.empty) {
              isVendor = true;
              matchedVendor = { id: qSnap.docs[0].id, ...qSnap.docs[0].data() } as Vendor;
            } else {
              const q2 = query(collection(db, 'vendors'), where('username', '==', email.trim()));
              const qSnap2 = await getDocs(q2);
              if (!qSnap2.empty) {
                isVendor = true;
                matchedVendor = { id: qSnap2.docs[0].id, ...qSnap2.docs[0].data() } as Vendor;
              }
            }
          }
        } catch (err: any) {
          if (err.message?.includes('offline') || err.message?.includes('Failed to get document')) {
            console.warn("Vendor status check paused (offline mode) on login:", err.message);
            if (email && INITIAL_VENDORS.some(v => v.username?.toLowerCase() === email.toLowerCase())) {
              isVendor = true;
            }
          } else {
            console.error("Error checking vendor status on login:", err);
          }
        }

        if (!user.emailVerified && !isVendor) {
          setUnverifiedEmail(email);
          setStep('verification');
          await signOut(auth);
          return;
        }

        if (targetRole === 'vendor' || isVendor) {
           const vendor = matchedVendor || vendors.find(v => 
             v.username?.toLowerCase() === email.toLowerCase() || 
             v.contactEmail?.toLowerCase() === email.toLowerCase()
           );
           if (vendor) {
             setCurrentUserVendorId(vendor.id);
             setUserRole('vendor');
             setView('marketplace');
             // Put role and vendorId inside the update so it's fully persistent in firestore
             await setDoc(doc(db, 'users', user.uid), {
               uid: user.uid,
               email: user.email,
               name: vendor.name,
               role: 'vendor',
               vendorId: vendor.id,
               updatedAt: new Date().toISOString()
             }, { merge: true });
           } else {
             setUserRole('client');
             setView('marketplace');
           }
        } else {
          setUserRole('client');
          setView('marketplace');
        }
        await syncUserProfile(user);
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
          const vendor = vendors.find(v => 
            v.username?.toLowerCase() === user.email?.toLowerCase() || 
            v.contactEmail?.toLowerCase() === user.email?.toLowerCase()
          );
          if (vendor) {
            setCurrentUserVendorId(vendor.id);
            setUserRole('vendor');
            setView('marketplace');
            // Put role and vendorId inside the update so it's fully persistent in firestore
            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              email: user.email,
              name: vendor.name,
              role: 'vendor',
              vendorId: vendor.id,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          } else {
            setUserRole('client');
            setView('marketplace');
          }
        } else {
          setUserRole('client');
          setView('marketplace');
        }
        await syncUserProfile(user);
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
            const url = await uploadFileRobustly(photo, storagePath);
            photoURL = url;
            photoStoragePath = storagePath;
          } catch (uploadErr) {
            console.error("Registration photo upload failed:", uploadErr);
          }
        }

        await updateProfile(user, {
          displayName: fullName,
          photoURL: photoURL
        });

        await syncUserProfile(user, { fullName, photoURL, photoStoragePath });

        // Trigger official Firebase Email Verification as well!
        try {
          await sendEmailVerification(user);
        } catch (fbVerifErr: any) {
          console.warn("Firebase Auth SDK sendEmailVerification failed or rate-limited during registration:", fbVerifErr?.message || fbVerifErr);
        }

        // Use custom verification email via server SMTP
        try {
          const apiUrl = `${window.location.protocol}//${window.location.host}/api/auth/send-verification`;
          await fetch(apiUrl, {
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
        const apiUrl = `${window.location.protocol}//${window.location.host}/api/auth/reset-password`;
        const response = await fetch(apiUrl, {
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

    const handleResendVerification = async () => {
      if (!unverifiedEmail) {
        showNotification('No unverified email set. Please log in first.', 'info');
        return;
      }
      setIsLoading(true);
      try {
        const apiUrl = `${window.location.protocol}//${window.location.host}/api/auth/send-verification`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: unverifiedEmail })
        });
        
        const data = await response.json();
        if (!response.ok) {
          if (response.status === 429 || data.error === 'TOO_MANY_ATTEMPTS') {
            showNotification('Rate limit exceeded. Please wait a few minutes before resending.', 'info');
          } else {
            showNotification(data.message || data.error || 'Failed to send verification email.', 'info');
          }
        } else {
          showNotification('Verification email resent successfully!', 'success');
        }
      } catch (err: any) {
        console.error("Resend error:", err);
        showNotification('Failed to connect to verification service.', 'info');
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
            <p className="text-zinc-300 mb-8 leading-relaxed">
              We have sent a verification email to <span className="text-white font-bold">{unverifiedEmail}</span>. 
              Please verify your account via the link in your inbox and then log in.
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleResendVerification}
                disabled={isLoading}
                className="w-full bg-[#111] border border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black font-black py-4 rounded-xl transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> Resend Verification Email
              </button>
              <button 
                onClick={() => setStep('login')}
                className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-xl hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" /> Return to Login
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (step === 'reset-success') {
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#D4AF37]/5 via-black to-black" aria-hidden="true"></div>
          <div className="bg-[#111] rounded-3xl p-8 md:p-12 max-w-lg w-full border border-[#D4AF37]/20 shadow-2xl animate-in zoom-in-95 duration-500 relative z-10 text-center">
            <div className="bg-[#D4AF37]/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border border-[#D4AF37]/20">
              <RefreshCw className="w-10 h-10 text-[#D4AF37]" />
            </div>
            <h2 className="text-2xl font-bold font-[Cinzel] text-[#D4AF37] mb-4">Reset Link Sent</h2>
            <p className="text-zinc-300 mb-8 leading-relaxed">
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
            <h1 className="text-3xl font-bold font-[Cinzel] text-[#D4AF37] tracking-wider uppercase">WELCOME TO SIMCHA BOOKING</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-[0.4em] mt-2">Professional Planning Access</p>
          </header>

          {step === 'choice' ? (
            <nav className="flex flex-col gap-6" aria-label="Account Type Selection">
              <button onClick={() => { setTargetRole('client'); setStep('login'); }} className="group bg-black/40 border border-[#D4AF37]/20 p-10 rounded-3xl hover:border-[#D4AF37] focus-visible:ring-2 focus-visible:ring-[#D4AF37] transition-all text-center outline-none">
                <div className="w-16 h-16 bg-[#D4AF37]/10 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-[#D4AF37] transition-colors" aria-hidden="true"><User className="w-8 h-8 text-[#D4AF37] group-hover:text-black" /></div>
                <h2 className="text-white font-bold uppercase tracking-[0.3em] text-lg mb-2">simcha sign in</h2>
                <p className="text-xs text-zinc-400 font-light px-4 leading-relaxed">The perfect platform to book and manage your simcha</p>
              </button>
            </nav>
          ) : step === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Email Address</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-4 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="sarah@example.com" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Password</label>
                  <button type="button" onClick={() => setStep('forgot-password')} className="text-[10px] text-[#D4AF37] hover:underline font-bold uppercase tracking-widest">Forgot password?</button>
                </div>
                <input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-4 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="••••••••" />
              </div>
              
              {error && (
                <div className="bg-zinc-500/10 border border-zinc-500/20 p-3 rounded-lg flex items-center gap-3 animate-shake">
                  <AlertCircle className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                  <p className="text-zinc-400 text-xs font-bold uppercase tracking-tighter">{error}</p>
                </div>
              )}

              <button disabled={isLoading} type="submit" className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-xl hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-white/10"></div>
                </div>
                <div className="relative flex justify-center text-[10px] uppercase tracking-widest">
                  <span className="bg-[#111] px-4 text-zinc-500 font-black">Or continue with</span>
                </div>
              </div>

              <button 
                type="button" 
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full bg-white text-black font-black py-4 rounded-xl hover:bg-zinc-200 transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-3"
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
                <button type="button" onClick={() => setStep('choice')} className="text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest">Return to Roles</button>
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
                  <p className="text-[10px] text-zinc-500 uppercase leading-relaxed px-4">Enter your email and we'll send you a link to regain access to your simcha planning.</p>
               </div>
               <div className="space-y-2">
                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Email Address</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-4 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="sarah@example.com" />
              </div>
              {error && (
                <div className="bg-zinc-500/10 border border-zinc-500/20 p-3 rounded-lg flex items-center gap-3 animate-shake">
                  <AlertCircle className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                  <p className="text-zinc-400 text-xs font-bold uppercase tracking-tighter">{error}</p>
                </div>
              )}
              <button disabled={isLoading} type="submit" className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-xl hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Get Reset Link'}
              </button>
              <button type="button" onClick={() => setStep('login')} className="w-full text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest">Return to Login</button>
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
                <p className="text-[8px] text-zinc-500 font-black uppercase tracking-widest mt-2">Upload Profile Photo</p>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Full Name</label>
                <input required type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="Sarah Cohen" />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Email Address</label>
                <input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="sarah@example.com" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Password</label>
                  <input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="••••••••" />
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Repeat Password</label>
                  <input required type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="••••••••" />
                </div>
              </div>

              {error && (
                <div className="bg-zinc-500/10 border border-zinc-500/20 p-3 rounded-lg flex items-center gap-3 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                  <p className="text-zinc-400 text-xs font-bold uppercase tracking-tighter">{error}</p>
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
                  <span className="bg-[#111] px-4 text-zinc-500 font-black">Or join with</span>
                </div>
              </div>

              <button 
                type="button" 
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full bg-white text-black font-black py-4 rounded-xl hover:bg-zinc-200 transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-3"
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
              
              <button type="button" onClick={() => setStep('login')} className="w-full text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest mt-2">
                Already registered? Sign in
              </button>
            </form>
          )}
          
          {/* Dual portal routing is now implicit. Vendors and clients use the main sign in form above. */}
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
      setUserDocData((prev: any) => ({
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
      const apiUrl = `${window.location.protocol}//${window.location.host}/api/email/confirm-booking`;
      const response = await fetch(apiUrl, {
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
      if (!response.ok) {
        throw new Error(`Email API returned status ${response.status}`);
      }
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
    if (!isUserAdmin(fbUser?.email)) {
      setView('marketplace');
      return null;
    }
    return (
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="min-h-screen bg-black"
      >
        <AdminPanel 
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
          subCategoryImages={subCategoryImages}
          onUpdateSubCategoryImage={handleAdminUpdateSubCategoryImage}
          heroBackgroundUrl={heroBackgroundUrl}
          onUpdateHeroBackground={handleAdminUpdateHeroBackground}
          messages={messages}
          onSendMessage={handleSendMessage}
          showNotification={showNotification}
          onSeedTaxonomy={handleSeedTaxonomy}
          onUpdateCategoryOrder={handleAdminUpdateCategoryOrder}
          onDeleteCategory={handleAdminDeleteCategory}
        />
      </motion.div>
    );
  }

  if (!fbUser) return <AuthWall />;

  const currentAuthenticatedUser: UserAccount = {
    id: fbUser?.uid || '',
    name: userDocData?.name || fbUser?.displayName || fbUser?.email?.split('@')[0] || 'Guest',
    username: fbUser?.email || '',
    photoURL: userDocData?.photoURL || fbUser?.photoURL || '',
    photoStoragePath: userDocData?.photoStoragePath || ''
  };

  if (view === 'portal' && fbUser) {
    const isVendor = isActuallyVendor;

    const renderVendorToggle = () => {
      if (!isVendor) return null;
      return (
        <div className="bg-[#111] border-b border-[#D4AF37]/20 py-4 px-4 flex justify-center gap-4 sticky top-0 z-50">
          <div className="flex bg-black border border-[#D4AF37]/30 p-1.5 rounded-full items-center">
            <button 
              onClick={() => setPortalTab('client')}
              className={`px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all ${
                portalTab === 'client'
                  ? 'bg-[#D4AF37] text-black shadow-lg font-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Client Portal
            </button>
            <button 
              onClick={() => setPortalTab('vendor')}
              className={`px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all ${
                portalTab === 'vendor'
                  ? 'bg-[#D4AF37] text-black shadow-lg font-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Vendor Portal
            </button>
          </div>
        </div>
      );
    };

    if (portalTab === 'vendor' && isVendor && currentUserVendorId) {
      const v = vendors.find(v => v.id === currentUserVendorId);
      if (v) {
        return (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="min-h-screen bg-black flex flex-col"
          >
            {renderVendorToggle()}
            <div className="flex-grow flex flex-col">
              <VendorPortal 
                vendor={v} 
                bookings={bookings.filter(b => b.vendorId === v.id)} 
                messages={messages.filter(m => m.receiverId === v.id || m.senderId === v.id)} 
                onUpdateVendor={handleUpdateVendor} 
                onUpdateBookingStatus={handleUpdateBookingStatus} 
                onReplyMessage={handleReplyMessage} 
                onLogout={handleSignOut} 
                showNotification={showNotification}
                onSwitchToClientView={() => setView('marketplace')}
              />
            </div>
          </motion.div>
        );
      }
    }

    // Otherwise render client portal
    const myBookings = bookings.filter(b => b.contactEmail === fbUser.email);
    const myMessages = messages.filter(m => m.clientEmail === fbUser.email);
    return (
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="min-h-screen bg-black flex flex-col"
      >
        {renderVendorToggle()}
        <div className="flex-grow flex flex-col">
          <ClientPortal 
            user={currentAuthenticatedUser} 
            cart={cart} 
            bookings={myBookings} 
            messages={myMessages} 
            vendors={vendors} 
            onRemoveFromCart={handleRemoveFromCart} 
            onEditCartItem={handleEditCartItem}
            onProcessCart={handleProcessCart} 
            onPaymentSuccess={handlePaymentSuccess} 
            onLogout={handleSignOut} 
            onClose={() => setView('marketplace')} 
            onUpdateProfile={handleUpdateProfile} 
            onDeleteAccount={handleDeleteAccount} 
            onMessageVendor={v => setChatVendor(v)}
          />
        </div>
      </motion.div>
    );
  }

  if (view === 'posts') {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="min-h-screen bg-black flex flex-col"
      >
        <PostsPage posts={posts} vendors={vendors} onBack={() => setView('marketplace')} onViewVendor={navigateToVendor} />
      </motion.div>
    );
  }

  if (view === 'payment-success') {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="min-h-screen bg-black flex flex-col"
      >
        <PaymentSuccess 
          bookingId={paymentBookingId || ''} 
          vendorId={paymentVendorId || ''} 
          onReturn={() => { setPortalTab('client'); setView('portal'); }} 
        />
      </motion.div>
    );
  }

  if (view === 'verify-account') {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#111] border border-[#D4AF37] p-8 rounded-2xl text-center shadow-2xl">
          <div className="flex justify-center mb-6">
            <CheckCircle className="w-16 h-16 text-[#D4AF37]" />
          </div>
          <h2 className="text-3xl font-bold font-[Cinzel] text-[#D4AF37] mb-4">Account Verified!</h2>
          <p className="text-zinc-300 mb-8">Your email has been successfully verified. You can now access all features of Simcha Booking.</p>
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
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="min-h-screen bg-black text-zinc-100 flex flex-col"
    >
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-[#D4AF37] focus:text-black focus:p-4 focus:rounded-lg focus:font-bold">Skip to main content</a>
      <nav className="bg-black sticky top-0 z-40 border-b border-[#D4AF37]/20 shadow-xl" aria-label="Main Navigation">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <motion.button 
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-3 cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-lg p-1" 
              onClick={() => { setView('marketplace'); setActiveCategory('All'); }} 
              aria-label="Simcha Booking Home"
            >
                <SimchaLogo className="h-9 w-9 group-hover:scale-110 transition-transform" />
                <div className="text-left">
                    <h1 className="text-xl md:text-2xl font-bold text-[#D4AF37] tracking-tight font-[Cinzel] leading-tight md:leading-normal">
                      <span className="block md:inline">Simcha</span><span className="block md:inline md:ml-1.5">Booking</span>
                    </h1>
                </div>
            </motion.button>
            <div className="flex items-center gap-6">
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setView('posts')} 
                  className="hidden md:block text-zinc-300 hover:text-[#D4AF37] transition-colors text-sm font-bold uppercase tracking-widest focus-visible:ring-2 focus-visible:ring-[#D4AF37] outline-none rounded p-1 cursor-pointer"
                >
                  Moments
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    if (isActuallyVendor) {
                      setPortalTab('vendor');
                    } else {
                      setPortalTab('client');
                    }
                    setView('portal');
                  }} 
                  className="flex items-center gap-2 bg-[#D4AF37]/10 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border border-[#D4AF37]/20 px-4 py-2 rounded-full transition-all text-[10px] font-black uppercase tracking-widest focus-visible:ring-2 focus-visible:ring-white outline-none cursor-pointer" 
                  aria-label="Open My Portal"
                >
                  <LayoutDashboard className="w-4 h-4" aria-hidden="true" />
                  <span>My Portal</span>
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  onClick={handleSignOut} 
                  className="text-zinc-500 hover:text-zinc-400 transition-colors focus-visible:ring-2 focus-visible:ring-red-500 outline-none rounded-lg p-1 cursor-pointer" 
                  aria-label="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </motion.button>
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
            <p className="mb-10 text-zinc-300 text-base md:text-lg font-light max-w-2xl mx-auto leading-relaxed">From world-class kosher caterers to soulful bands, curate your complete simcha in one place.</p>
            <div className="max-w-4xl mx-auto bg-[#111] rounded-2xl md:rounded-full p-2 flex flex-col md:flex-row items-stretch md:items-center shadow-2xl border border-[#D4AF37]/20 gap-2 md:gap-0">
              <div className="flex-1 flex items-center px-6 py-3">
                <label htmlFor="search-input" className="sr-only">Search vendors</label>
                <Search className="w-5 h-5 text-[#D4AF37]/50 mr-3 flex-shrink-0" aria-hidden="true" />
                <input id="search-input" type="text" placeholder="Search elite vendors..." className="flex-1 focus:outline-none text-zinc-100 placeholder:text-zinc-600 bg-transparent h-10 md:h-14 font-medium" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <motion.button 
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="bg-[#D4AF37] hover:bg-[#E5C76B] text-black px-10 py-4 rounded-xl md:rounded-full font-black uppercase tracking-widest text-sm transition-all shadow-xl focus-visible:ring-2 focus-visible:ring-white outline-none cursor-pointer"
              >
                Search
              </motion.button>
            </div>
          </div>
        </section>

        {activeCategory === 'All' && !searchTerm ? (
            <section className="py-12 bg-black flex-1" aria-labelledby="categories-heading">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-10"><h2 id="categories-heading" className="text-3xl font-bold font-[Cinzel] mb-4 text-[#D4AF37]">Explore Signature Categories</h2></div>
                    <nav className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" aria-label="Category Browser">
                        {activeCategories.map((cat) => (
                            <motion.button 
                              key={cat} 
                              whileHover={{ scale: 1.03, y: -4, borderColor: "rgba(212, 175, 55, 0.4)" }}
                              whileTap={{ scale: 0.97 }}
                              transition={{ type: "spring", stiffness: 300, damping: 20 }}
                              onClick={() => setActiveCategory(cat)} 
                              className="group relative h-40 rounded-xl overflow-hidden border border-[#D4AF37]/20 hover:border-[#D4AF37]/50 focus-visible:ring-2 focus-visible:ring-[#D4AF37] outline-none transition-all cursor-pointer"
                            >
                                <img src={categoryImages[cat]} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-110 transition-transform" aria-hidden="true" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                                <div className="absolute inset-0 flex items-center justify-center p-2 text-center"><h3 className="text-[#D4AF37] font-bold text-lg font-[Cinzel] tracking-wide">{cat}</h3></div>
                            </motion.button>
                        ))}
                    </nav>
                </div>
            </section>
        ) : (
            <section className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full animate-in fade-in" aria-labelledby="results-heading">
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                     <nav className="flex flex-wrap items-center gap-2" aria-label="Breadcrumb">
                        <motion.button 
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setActiveCategory('All')} 
                          className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all border outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] cursor-pointer ${activeCategory === 'All' ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-black text-[#D4AF37]/70 hover:bg-[#D4AF37]/10 border-[#D4AF37]/30'}`}
                        >
                          All Categories
                        </motion.button>
                        {activeCategory !== 'All' && <><span className="text-zinc-600" aria-hidden="true">/</span><span id="results-heading" className="font-bold text-[#D4AF37]">{activeCategory}</span></>}
                     </nav>
                </header>

                {activeCategory !== 'All' && categorySubCategories?.[activeCategory] && Object.keys(categorySubCategories[activeCategory]).length > 0 && (
                  <div className="mb-12 animate-in slide-in-from-top-4 duration-500">
                    {activeSubSubCategory ? (
                      // Dedicated Vendor List Page for specific Sub-subcategory (Tier 3)
                      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Golden back button */}
                        <div className="flex items-center gap-2 mb-6 text-sm">
                          <button 
                            onClick={() => setActiveSubSubCategory(null)} 
                            className="text-[#D4AF37] hover:text-[#FFDF73] flex items-center transition-colors font-bold uppercase tracking-[0.2em] text-[10px] py-1.5 px-3.5 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 border border-[#D4AF37]/30 rounded-lg shadow-sm cursor-pointer"
                          >
                            <ChevronLeft className="w-4 h-4 mr-1.5" />
                            Back to {activeSubCategoryGroup}
                          </button>
                        </div>

                        {/* Beautiful premium display heading */}
                        <div className="mb-8 p-6 rounded-2xl bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-white/5 relative overflow-hidden shadow-xl">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/5 rounded-full blur-2xl pointer-events-none"></div>
                          <p className="text-[10px] font-black uppercase text-[#D4AF37] tracking-[0.3em] mb-1.5">{activeSubCategoryGroup}</p>
                          <h2 className="text-3xl font-extrabold font-[Cinzel] tracking-widest text-white">{activeSubSubCategory}</h2>
                        </div>

                        {/* Premium Vendor Cards List for this specific sub-subcategory */}
                        <motion.div 
                          key={`subsubcategory-vendors-${activeSubSubCategory}-${filteredVendors.length}`}
                          variants={{
                            hidden: { opacity: 0 },
                            show: {
                              opacity: 1,
                              transition: {
                                staggerChildren: 0.05
                              }
                            }
                          }}
                          initial="hidden"
                          animate="show"
                          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8"
                        >
                          {filteredVendors.map(v => (
                            <motion.div
                              variants={{
                                hidden: { opacity: 0, y: 30 },
                                show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 15 } }
                              }}
                              key={v.id}
                              id={`vendor-${v.id}`}
                              className="outline-none focus:ring-2 focus:ring-[#D4AF37] rounded-xl"
                            >
                              <VendorCard 
                                vendor={v}
                                onBook={vendor => setBookingVendor(vendor)}
                                onMessage={vendor => setChatVendor(vendor)}
                                onQuickView={handleViewVendor}
                                selectedDate={eventDate}
                                onAddReview={handleAddReview}
                              />
                            </motion.div>
                          ))}
                        </motion.div>

                        {filteredVendors.length === 0 && (
                          <div className="py-20 text-center opacity-40" role="status">
                            <Search className="w-16 h-16 mx-auto mb-4 text-[#D4AF37]" aria-hidden="true" />
                            <p className="text-xl font-[Cinzel] text-zinc-300">No vendors specializing in {activeSubSubCategory} yet.</p>
                            <p className="text-xs text-zinc-500 mt-2 max-w-sm mx-auto">Please check other subcategories or search for similar services.</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {activeSubCategoryGroup && (
                          <div className="flex items-center gap-2 mb-6 text-sm">
                            <button 
                              onClick={() => setActiveSubCategoryGroup(null)} 
                              className="text-[#D4AF37] hover:text-[#FFDF73] flex items-center transition-colors font-bold uppercase tracking-widest text-xs cursor-pointer"
                            >
                              <ChevronLeft className="w-4 h-4 mr-1" />
                              Back to {activeCategory}
                            </button>
                            <span className="text-zinc-600">/</span>
                            <span className="text-zinc-400 uppercase tracking-widest text-xs">{activeSubCategoryGroup}</span>
                          </div>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {!activeSubCategoryGroup ? (
                            // Render Subcategory Groups (Tier 2)
                            Object.keys(categorySubCategories[activeCategory] || {}).map(group => (
                              <motion.button
                                key={group}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setActiveSubCategoryGroup(group)}
                                className="relative h-40 rounded-xl overflow-hidden border border-white/10 hover:border-[#D4AF37]/50 outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] transition-all cursor-pointer group shadow-lg"
                              >
                                 {subCategoryImages[group] ? (
                                   <img src={subCategoryImages[group]} alt={group} className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:scale-110 group-hover:opacity-70 transition-all duration-700" />
                                 ) : (
                                   <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center opacity-60 group-hover:scale-110 transition-all duration-700">
                                     <span className="text-zinc-700 font-bold uppercase tracking-widest text-xs">No Image</span>
                                    </div>
                                 )}
                                 <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                                 <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                                   <h3 className="text-[#D4AF37] font-bold text-lg font-[Cinzel] tracking-wide">{group}</h3>
                                 </div>
                              </motion.button>
                            ))
                          ) : (
                            // Render Sub-Subcategories (Tier 3)
                            (categorySubCategories[activeCategory]?.[activeSubCategoryGroup] || []).map(sub => (
                              <motion.button
                                key={sub}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setActiveSubSubCategory(sub)}
                                className={`relative h-40 rounded-xl overflow-hidden border outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] transition-all cursor-pointer group ${
                                  activeSubSubCategory === sub
                                    ? 'border-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.3)]'
                                    : 'border-white/10 hover:border-[#D4AF37]/50'
                                }`}
                              >
                                {subCategoryImages[sub] ? (
                                  <img src={subCategoryImages[sub]} alt={sub} className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:scale-110 group-hover:opacity-70 transition-all duration-700" />
                                ) : (
                                  <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center opacity-60 group-hover:scale-110 transition-transform duration-700">
                                    <span className="text-zinc-700 font-bold uppercase tracking-widest text-xs">No Image</span>
                                  </div>
                                )}
                                <div className={`absolute inset-0 bg-gradient-to-t ${activeSubSubCategory === sub ? 'from-[#D4AF37]/40 via-black/60 to-black/20' : 'from-black via-black/40 to-transparent'}`}></div>
                                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
                                  <h3 className="text-white font-bold text-lg font-[Cinzel] tracking-wide">{sub}</h3>
                                </div>
                              </motion.button>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {/* Vendors List */}
                {(!categorySubCategories[activeCategory] || Object.keys(categorySubCategories[activeCategory]).length === 0 || activeCategory === 'All' || (activeSubCategories.length > 0 && !activeSubSubCategory)) && !activeSubSubCategory && (
                  <>
                  <motion.div 
                    key={`${activeCategory}-${activeSubCategoryGroup}-${activeSubCategories.join(',')}-${searchTerm}-${filteredVendors.length}`}
                    variants={{
                      hidden: { opacity: 0 },
                      show: {
                        opacity: 1,
                        transition: {
                          staggerChildren: 0.05
                        }
                      }
                    }}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, amount: 0.02 }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8"
                >
                    {filteredVendors.map(v => (
                      <motion.div 
                        variants={{
                          hidden: { opacity: 0, y: 30 },
                          show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 15 } }
                        }}
                        id={`vendor-${v.id}`} 
                        key={v.id} 
                        tabIndex={-1} 
                        className="outline-none focus:ring-2 focus:ring-[#D4AF37] rounded-xl"
                      >
                        <VendorCard 
                          vendor={v} 
                          onBook={v => setBookingVendor(v)} 
                          onMessage={v => setChatVendor(v)} 
                          onQuickView={handleViewVendor}
                          selectedDate={eventDate} 
                          onAddReview={handleAddReview} 
                        />
                      </motion.div>
                    ))}
                </motion.div>
                {filteredVendors.length === 0 && (
                    <div className="py-20 text-center opacity-40" role="status">
                      <Search className="w-16 h-16 mx-auto mb-4 text-[#D4AF37]" aria-hidden="true" />
                      <p className="text-xl font-[Cinzel]">No vendors match your query.</p>
                    </div>
                )}
                </>
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
                    <p className="text-zinc-400 text-sm max-w-xs text-center md:text-left leading-relaxed">Curating exceptional Jewish celebrations with world-class professional partners.</p>
                </div>
                <nav className="flex flex-col md:flex-row items-center gap-8 md:gap-16" aria-label="Footer Navigation">
                    <div className="flex flex-col gap-3 items-center md:items-start">
                        <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.3em]">Directory</p>
                        <button onClick={() => {setView('marketplace'); setActiveCategory('All');}} className="text-zinc-400 hover:text-white text-sm transition-colors outline-none focus-visible:underline">Browse Marketplace</button>
                        <button onClick={() => setView('posts')} className="text-zinc-400 hover:text-white text-sm transition-colors outline-none focus-visible:underline">Community Gallery</button>
                    </div>
                    <div className="flex flex-col gap-3 items-center md:items-start">
                        <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.3em]">Access</p>
                        { isUserAdmin(fbUser?.email) && (
                          <button onClick={() => setView('admin')} className="text-zinc-400 hover:text-[#D4AF37] text-sm flex items-center gap-1.5 transition-colors outline-none focus-visible:underline"><Shield className="w-3.5 h-3.5" aria-hidden="true" /> Administration</button>
                        )}
                    </div>
                </nav>
            </div>
        </div>
      </footer>

      <SuggestionModal 
        isOpen={showSuggestions} 
        onClose={() => {
          setShowSuggestions(false);
          setBookingVendor(null);
          setQuickViewVendor(null);
          setInitialBookingDetails(null);
          setIsPriorityFromSuggestions(false);
          setPendingPrioritySuggestions(false);
          setView('marketplace');
          setActiveCategory('All');
          setActiveSubCategoryGroup('');
          setActiveSubCategories([]);
          setActiveSubSubCategory('');
          window.scrollTo({ top: 0, behavior: 'smooth' });
          if (window.location.hash !== '') {
            window.location.hash = '';
          }
        }} 
        sourceVendor={sourceVendorForSuggestions} 
        recommendations={suggestedVendors} 
        onBook={v => {
          const selectedServiceIds = v.services && v.services.length > 0 ? [v.services[0].id] : [];
          const selectedServiceQuantities = v.services && v.services.length > 0 ? { [v.services[0].id]: 1 } : {};
          setInitialBookingDetails({
            clientName: currentAuthenticatedUser.name,
            contactEmail: currentAuthenticatedUser.username,
            eventName: '',
            eventLocation: v.category === 'Venue' ? v.location : '',
            eventTime: '',
            notes: '',
            selectedServiceIds,
            selectedServiceQuantities
          });
          setIsPriorityFromSuggestions(true);
          setPendingPrioritySuggestions(true);
          setBookingVendor(v);
          setShowSuggestions(false);
        }} 
        cartItems={cart.map(i => i.vendor.id)} 
        isPriorityLock={isPriorityLockForSuggestions}
        eventDate={suggestionsEventDate}
        allVendors={vendors}
      />
      
      <AnimatePresence>
        {showPriorityHoldPopup && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
          >
            <motion.div 
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="bg-[#0a0a0a] w-full max-w-md rounded-2xl p-6 md:p-8 border border-[#D4AF37]/30 text-center relative overflow-hidden"
            >
              {/* Decorative radial background */}
              <div className="absolute -top-40 -left-40 w-80 h-80 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-16 h-16 bg-green-500/10 border border-green-500/30 rounded-full flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(34,197,94,0.1)] mx-auto">
                  <Check className="w-8 h-8 text-green-500 animate-bounce mx-auto" />
                </div>
                
                <h2 className="text-2xl md:text-3xl font-bold font-[Cinzel] text-[#D4AF37] tracking-wider text-center mx-auto w-full mb-6">
                  BOOKING REQUEST RECEIVED
                </h2>
                
                <p className="text-zinc-300 text-sm leading-relaxed mb-8 font-light text-center mx-auto w-full break-words px-4">
                  Your request has been forwarded to the vendor. We will notify you once they have reviewed it. You can check the status in your portal.
                </p>
                
                <button 
                  onClick={() => setShowPriorityHoldPopup(false)}
                  className="w-full bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black py-3.5 rounded-xl text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-xl shadow-[#D4AF37]/10 hover:shadow-[#D4AF37]/20 outline-none hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {bookingVendor && (
          <BookingModal 
            isOpen={!!bookingVendor} 
            vendor={bookingVendor} 
            selectedDate={suggestionsEventDate || eventDate} 
            isPriorityFromSuggestions={isPriorityFromSuggestions}
            onClose={() => { 
              setBookingVendor(null); 
              setInitialBookingDetails(null); 
              if (isPriorityFromSuggestions) {
                setShowSuggestions(true);
              }
            }} 
            onDone={(isPriority: boolean) => {
              setBookingVendor(null);
              setInitialBookingDetails(null);
              if (isPriority) {
                setShowSuggestions(true);
                setPendingPrioritySuggestions(false);
              } else {
                setShowSuggestions(false);
                setPendingPrioritySuggestions(false);
                setIsPriorityFromSuggestions(false);
              }
            }}
            onConfirm={handleConfirmBooking} 
            initialDetails={initialBookingDetails || { clientName: currentAuthenticatedUser.name || '', contactEmail: currentAuthenticatedUser.username || '', eventName: '' }} 
          />
        )}
      </AnimatePresence>
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
      {view === 'marketplace' && userDocData?.role !== 'admin' && !isAdminChatOpen && !chatVendor && (
        <button 
          onClick={() => {
            if (fbUser) {
              ensureAdminSupportConversation(fbUser.uid, 'admin').catch(console.error);
            }
            setIsAdminChatOpen(true);
          }}
          className="fixed bottom-8 right-8 z-40 w-14 h-14 bg-[#D4AF37] text-black rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all group shadow-[#D4AF37]/20"
          aria-label="Contact Support"
        >
          <div className="absolute -top-12 right-0 bg-black text-[#D4AF37] px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-[#D4AF37]/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl">
            Need Help?
          </div>
          <AlertCircle className="w-6 h-6" />
        </button>
      )}

      <AnimatePresence>
        {quickViewVendor && (
          <QuickViewModal 
            vendor={quickViewVendor} 
            onClose={() => setQuickViewVendor(null)} 
            onBook={(v) => { setQuickViewVendor(null); setBookingVendor(v); }}
            onMessage={(v) => { setQuickViewVendor(null); setChatVendor(v); }}
          />
        )}
      </AnimatePresence>

      {notification && (
        <div role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300 w-full max-w-sm px-4 pointer-events-none">
          <div className={`bg-[#111] text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border backdrop-blur-md ${notification.type === 'error' ? 'border-red-500/40 bg-red-950/20' : 'border-green-500/40 bg-green-950/20'}`}>
            {notification.type === 'error' ? (
              <X className="w-5 h-5 text-red-500 animate-pulse" aria-hidden="true" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-500" aria-hidden="true" />
            )}
            <span className={`font-bold text-sm flex-1 ${notification.type === 'error' ? 'text-red-200' : 'text-green-200'}`}>{notification.message}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default App;