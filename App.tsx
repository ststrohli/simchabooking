import React, { useState, useMemo, useEffect, useRef, useCallback, startTransition } from 'react';
import { motion, AnimatePresence, useMotionValue, animate, useScroll, useTransform } from 'motion/react';
import { ShoppingBag, Search, Filter, Menu, User, Star, Calendar, LogIn, Mail, PartyPopper, CheckCircle, X, DollarSign, Clock, Loader2, Shield, MapPin, Lock, ChevronLeft, Tag, Trash2, ExternalLink, ChevronRight, UserPlus, Key, LogOut, MessageSquare, LayoutDashboard, ClipboardList, Camera, AlertCircle, Plus, Send, RefreshCw, ShieldCheck, Check, ShieldAlert, HelpCircle, UserRound, Store, Eye, EyeOff, Sun, Moon } from 'lucide-react';
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
import { auth, db, storage, getDocSafe, getDocsSafe } from './services/firebase';
import { uploadFileRobustly } from './services/uploadService';
import { trackFunnelStep } from './services/analyticsService';
import { botDetectionService } from './services/botDetectionService';
import { sendNewMessage, subscribeToUserInbox, ensureAdminSupportConversation } from './services/messagingService';
import VendorCard from './components/VendorCard';
import VendorCardSkeleton from './components/VendorCardSkeleton';
import QuickViewModal from './components/QuickViewModal';
import BookingModal from './components/BookingModal';
import { useModalDragDismiss, ModalDragIndicator } from './components/useModalDragDismiss';
import VendorPortal from './components/VendorPortal';
import AdminPanel from './components/AdminPanel';
import ContactModal from './components/ContactModal';
import PostsPage from './components/PostsPage';
import BottomNav from './components/BottomNav';
import ChatModal from './components/ChatModal';
import SuggestionModal from './components/SuggestionModal';
import ClientPortal from './components/ClientPortal';
import PaymentSuccess from './components/PaymentSuccess';
import { ThemeModeSwitch } from './components/ThemeModeSwitch';
import { SearchDateCalendar } from './components/SearchDateCalendar';
import { VENDORS as INITIAL_VENDORS, MOCK_BOOKINGS } from './services/mockData';
import { Vendor, VendorCategory, CartItem, Booking, Review, Post, Message, UserAccount, SelectedService } from './types';

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

const AnimatedRoleSwitcher: React.FC<{
  isVendorView: boolean;
  onToggleVendor: (targetVendorView?: boolean) => void;
}> = React.memo(({ isVendorView, onToggleVendor }) => {
  const clientBtnRef = useRef<HTMLButtonElement | null>(null);
  const vendorBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastRoleRef = useRef(isVendorView);
  const activeControlsRef = useRef<Array<{ stop: () => void }>>([]);

  const pillX = useMotionValue(0);
  const pillRotate = useMotionValue(0);
  const pillScaleX = useMotionValue(1);

  const getVendorOffsetX = () => {
    if (vendorBtnRef.current && clientBtnRef.current) {
      return vendorBtnRef.current.offsetLeft - clientBtnRef.current.offsetLeft;
    }
    return 62;
  };

  const runSlideWiggle = useCallback((targetVendor: boolean) => {
    activeControlsRef.current.forEach(ctrl => ctrl.stop());

    const targetX = targetVendor ? getVendorOffsetX() : 0;
    const currentX = pillX.get();
    const delta = targetX - currentX;

    if (Math.abs(delta) < 1) {
      pillX.set(targetX);
      pillRotate.set(0);
      pillScaleX.set(1);
      return;
    }

    const dir = delta > 0 ? 1 : -1;

    activeControlsRef.current = [
      animate(
        pillX,
        [
          currentX,
          targetX + dir * 6.5,
          targetX - dir * 6,
          targetX + dir * 4.5,
          targetX - dir * 3.2,
          targetX + dir * 1.8,
          targetX - dir * 0.9,
          targetX,
        ],
        {
          duration: 1.25,
          times: [0, 0.36, 0.51, 0.65, 0.77, 0.87, 0.94, 1],
          ease: 'easeInOut',
        }
      ),
      animate(
        pillRotate,
        [
          0,
          dir * 4.2,
          -dir * 4.2,
          dir * 3.2,
          -dir * 2.4,
          dir * 1.4,
          -dir * 0.7,
          0,
        ],
        {
          duration: 1.25,
          times: [0, 0.36, 0.51, 0.65, 0.77, 0.87, 0.94, 1],
          ease: 'easeInOut',
        }
      ),
      animate(
        pillScaleX,
        [1, 1.06, 0.94, 1.04, 0.96, 1.02, 0.99, 1],
        {
          duration: 1.25,
          times: [0, 0.36, 0.51, 0.65, 0.77, 0.87, 0.94, 1],
          ease: 'easeInOut',
        }
      ),
    ];
  }, [pillX, pillRotate, pillScaleX]);

  const hasMountedRef = useRef(false);

  // Sync position on initial mount and when role is changed externally (e.g. clicking header logo)
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      lastRoleRef.current = isVendorView;
      pillX.set(isVendorView ? getVendorOffsetX() : 0);
      return;
    }
    if (lastRoleRef.current !== isVendorView) {
      lastRoleRef.current = isVendorView;
      runSlideWiggle(isVendorView);
    }
  }, [isVendorView, pillX, runSlideWiggle]);

  useEffect(() => {
    return () => {
      activeControlsRef.current.forEach(ctrl => ctrl.stop());
    };
  }, []);

  const handleSelectRole = useCallback((targetVendor: boolean) => {
    if (lastRoleRef.current === targetVendor) return;
    lastRoleRef.current = targetVendor;
    // Start GPU-accelerated motion-value animation immediately before main app re-render
    runSlideWiggle(targetVendor);
    onToggleVendor(targetVendor);
  }, [onToggleVendor, runSlideWiggle]);

  return (
    <nav aria-label="Account Role Switcher" className="fixed top-[84px] sm:top-24 left-3 sm:left-4 z-50 flex items-center pointer-events-auto">
      <div className="simcha-switch-track relative flex items-center gap-[3px] h-[28px] sm:h-[30px] bg-zinc-950/95 border border-[#D4AF37]/45 backdrop-blur-xl rounded-full p-[3px] shadow-[0_6px_16px_rgba(0,0,0,0.9),0_0_10px_rgba(212,175,55,0.2)] text-[9.5px] sm:text-[10px] tracking-normal uppercase font-extrabold leading-none">
        <motion.div
          style={{
            x: pillX,
            rotate: pillRotate,
            scaleX: pillScaleX,
          }}
          className="simcha-gold-pill absolute left-[3px] top-[3px] bottom-[3px] w-[54px] sm:w-[58px] rounded-full bg-gradient-to-r from-[#FFE885] via-[#D4AF37] to-[#A37B0D] border border-[#FFF8D1] shadow-[0_2px_10px_rgba(212,175,55,0.6),inset_0_1px_2px_rgba(255,255,255,0.85)] pointer-events-none z-0 transform-gpu will-change-transform"
        />

        <button
          ref={clientBtnRef}
          type="button"
          onClick={() => handleSelectRole(false)}
          className={`relative z-10 h-full w-[54px] sm:w-[58px] inline-flex items-center justify-center gap-1 rounded-full transition-colors duration-300 select-none leading-none ${
            !isVendorView
              ? 'simcha-switch-btn-active text-black font-black'
              : 'simcha-switch-btn-inactive text-zinc-300 hover:text-white cursor-pointer'
          }`}
          aria-label="Switch to Client View"
        >
          <UserRound className="w-2.5 h-2.5 shrink-0 stroke-[2.5]" />
          <span className="leading-none">Client</span>
        </button>

        <button
          ref={vendorBtnRef}
          type="button"
          onClick={() => handleSelectRole(true)}
          className={`relative z-10 h-full w-[54px] sm:w-[58px] inline-flex items-center justify-center gap-1 rounded-full transition-colors duration-300 select-none leading-none ${
            isVendorView
              ? 'simcha-switch-btn-active text-black font-black'
              : 'simcha-switch-btn-inactive text-zinc-300 hover:text-white cursor-pointer'
          }`}
          aria-label="Switch to Vendor View"
        >
          <Store className="w-2.5 h-2.5 shrink-0 stroke-[2.5]" />
          <span className="leading-none">Vendor</span>
        </button>
      </div>
    </nav>
  );
});

const FixedGoldScrollbar: React.FC = () => {
  const [scrollTop, setScrollTop] = useState(0);
  const [scrollHeight, setScrollHeight] = useState(1);
  const [clientHeight, setClientHeight] = useState(1);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = document.body.style.position === 'fixed' 
        ? Math.abs(parseInt(document.body.style.top || '0')) 
        : window.scrollY;
      setScrollTop(currentScrollY);
      setScrollHeight(document.documentElement.scrollHeight);
      setClientHeight(window.innerHeight);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const thumbHeight = Math.max(30, (clientHeight / scrollHeight) * clientHeight);
  const maxScroll = scrollHeight - clientHeight;
  const thumbTop = maxScroll > 0 ? (scrollTop / maxScroll) * (clientHeight - thumbHeight) : 0;

  return (
    <div className="fixed top-0 right-0 w-[4px] h-full z-[200] pointer-events-none bg-black/20">
      <div 
        className="absolute w-full bg-[#D4AF37] rounded-full shadow-[0_0_8px_rgba(212,175,55,0.8)]"
        style={{
          top: `${thumbTop}px`,
          height: `${thumbHeight}px`
        }}
      />
    </div>
  );
};

const ADMIN_EMAILS = ['bookingsimcha@gmail.com', 'adminbookingsimcha@gmail.com', 'shimpose@gmail.com'];
const CLIENT_OVERRIDE_EMAILS = ['ststrohli@gmail.com'];
const NON_VENDOR_EMAILS = ['bookingsimcha@gmail.com', 'adminbookingsimcha@gmail.com', 'ststrohli@gmail.com'];

const isWhitelistedAdminEmail = (email?: string | null): boolean => {
  if (!email) return false;
  const userEmail = email.trim().toLowerCase();
  if (CLIENT_OVERRIDE_EMAILS.includes(userEmail)) return false;
  return ADMIN_EMAILS.includes(userEmail);
};

const isNonVendorEmail = (email?: string | null): boolean => {
  if (!email) return false;
  return NON_VENDOR_EMAILS.includes(email.trim().toLowerCase());
};

const fetchUserRole = async (user: FirebaseUser): Promise<'admin' | 'vendor' | 'client'> => {
  try {
    const userEmail = user.email ? user.email.trim().toLowerCase() : '';

    if (isWhitelistedAdminEmail(userEmail)) {
      return 'admin';
    }
    
    if (CLIENT_OVERRIDE_EMAILS.includes(userEmail)) {
      return 'client';
    }

    // 1. Check Custom Claims in Auth token
    try {
      const tokenResult = await user.getIdTokenResult();
      if (tokenResult.claims.role === 'admin') return 'admin';
      if (tokenResult.claims.role === 'vendor') return 'vendor';
    } catch (err) {}

    let foundVendor = false;

    // 2. Query secure user_roles/{uid} collection
    try {
      const userRoleDocRef = doc(db, 'user_roles', user.uid);
      const userRoleDocSnap = await getDocSafe(userRoleDocRef);
      if (userRoleDocSnap.exists()) {
        const data = userRoleDocSnap.data();
        const roleVal = typeof data?.role === 'string' ? data.role.toLowerCase() : '';
        if (roleVal === 'admin' || data?.isAdmin === true) return 'admin';
        if (roleVal === 'vendor' || data?.isVendor === true) foundVendor = true;
      }
    } catch (err) {}

    // 3. Query roles/{uid} collection
    try {
      const roleDocRef = doc(db, 'roles', user.uid);
      const roleDocSnap = await getDocSafe(roleDocRef);
      if (roleDocSnap.exists()) {
        const data = roleDocSnap.data();
        const roleVal = typeof data?.role === 'string' ? data.role.toLowerCase() : '';
        if (roleVal === 'admin' || data?.isAdmin === true) return 'admin';
        if (roleVal === 'vendor' || data?.isVendor === true) foundVendor = true;
      }
    } catch (err) {}

    // 4. Query users/{uid} collection
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDocSafe(userDocRef);
      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        const roleVal = typeof data?.role === 'string' ? data.role.toLowerCase() : '';
        if (roleVal === 'admin' || data?.isAdmin === true) return 'admin';
        if (roleVal === 'vendor' || data?.isVendor === true || data?.vendorId) foundVendor = true;
      }
    } catch (err) {}

    // 5. Query vendors collection by uid or email
    try {
      const vendorDocRef = doc(db, 'vendors', user.uid);
      const vendorDocSnap = await getDocSafe(vendorDocRef);
      if (vendorDocSnap.exists()) foundVendor = true;

      if (!foundVendor && userEmail) {
        const q1 = query(collection(db, 'vendors'), where('contactEmail', '==', userEmail));
        const snap1 = await getDocsSafe(q1);
        if (!snap1.empty) foundVendor = true;

        if (!foundVendor) {
          const q2 = query(collection(db, 'vendors'), where('username', '==', userEmail));
          const snap2 = await getDocsSafe(q2);
          if (!snap2.empty) foundVendor = true;
        }
      }
    } catch (err) {}

    if (foundVendor) return 'vendor';
  } catch (err) {
    console.warn("[Auth] Error fetching user role from token or roles collection:", err);
  }
  return 'client';
};

const SimchaLogo = ({ className = "h-7 w-7" }: { className?: string; viewBox?: string }) => (
  <img
    src="/sb-logo-old-gold.png?v=5"
    alt="Simcha Booking"
    aria-hidden="true"
    className={`simcha-logo-svg block object-contain select-none shrink-0 bg-transparent border-0 shadow-none p-0 ${className}`}
  />
);

const AUTH_MODAL_TRANSITION = { duration: 1.15, ease: [0.25, 0.85, 0.35, 1] as const };

const AuthSlideActionButton: React.FC<{
  visible: boolean;
  disabled?: boolean;
  label?: string;
  onSlideComplete: () => void;
}> = React.memo(({ visible, disabled = false, label = 'Slide to Sign In', onSlideComplete }) => {
  const thumbX = useMotionValue(0);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const triggeredRef = useRef(false);
  const maxTravel = 150;

  useEffect(() => {
    if (!visible || !disabled) {
      triggeredRef.current = false;
      thumbX.set(0);
    }
  }, [visible, disabled, thumbX]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || triggeredRef.current) return;
    e.stopPropagation();
    isDraggingRef.current = true;
    startXRef.current = e.clientX - thumbX.get();
    startYRef.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || disabled || triggeredRef.current) return;
    e.stopPropagation();
    const rawX = e.clientX - startXRef.current;
    const deltaY = startYRef.current - e.clientY;
    // Allow horizontal slide OR upward paper-flip gesture
    const combinedProgress = Math.max(rawX, deltaY * 1.6);
    const clampedX = Math.max(0, Math.min(maxTravel, combinedProgress));
    thumbX.set(clampedX);

    if (clampedX >= maxTravel * 0.72) {
      triggeredRef.current = true;
      isDraggingRef.current = false;
      animate(thumbX, maxTravel, {
        duration: 0.2,
        ease: 'easeOut',
        onComplete: () => {
          onSlideComplete();
        },
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.stopPropagation();
    isDraggingRef.current = false;
    if (triggeredRef.current) return;

    const currentX = thumbX.get();
    if (currentX >= maxTravel * 0.55) {
      triggeredRef.current = true;
      animate(thumbX, maxTravel, {
        duration: 0.22,
        ease: 'easeOut',
        onComplete: () => {
          onSlideComplete();
        },
      });
    } else {
      animate(thumbX, 0, {
        type: 'spring',
        stiffness: 380,
        damping: 26,
      });
    }
  };

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0, y: 6 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0, y: 6 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden flex justify-center pt-1"
        >
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            role="button"
            tabIndex={0}
            aria-label={label}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !disabled && !triggeredRef.current) {
                e.preventDefault();
                triggeredRef.current = true;
                animate(thumbX, maxTravel, {
                  duration: 0.25,
                  ease: 'easeOut',
                  onComplete: () => onSlideComplete(),
                });
              }
            }}
            className={`simcha-switch-track relative flex items-center w-[196px] h-[34px] bg-zinc-950/95 border border-[#D4AF37]/45 rounded-full p-[3px] shadow-[0_6px_16px_rgba(0,0,0,0.6),0_0_12px_rgba(212,175,55,0.22)] select-none touch-none cursor-grab active:cursor-grabbing ${
              disabled ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <span className="simcha-switch-btn-inactive w-full text-center pl-7 pr-2 text-[9.5px] font-extrabold uppercase tracking-[0.18em] text-zinc-300 pointer-events-none">
              <span>{label}</span>
            </span>
            <motion.div
              style={{ x: thumbX }}
              className="simcha-gold-pill absolute left-[3px] top-[3px] bottom-[3px] w-[38px] rounded-full bg-gradient-to-r from-[#FFE885] via-[#D4AF37] to-[#A37B0D] border border-[#FFF8D1] shadow-[0_2px_10px_rgba(212,175,55,0.6),inset_0_1px_2px_rgba(255,255,255,0.85)] flex items-center justify-center pointer-events-none z-10 transform-gpu will-change-transform"
            >
              <ChevronRight className="simcha-switch-btn-active w-3.5 h-3.5 text-black stroke-[2.75]" />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

interface AuthSignUpModalProps {
  onClose: () => void;
  onDismissStart?: () => void;
  isLoading: boolean;
  email: string;
  onEmailChange: (val: string) => void;
  password: string;
  onPasswordChange: (val: string) => void;
  confirmPassword: string;
  onConfirmPasswordChange: (val: string) => void;
  fullName: string;
  onFullNameChange: (val: string) => void;
  photo: File | null;
  onPhotoChange: (file: File | null) => void;
  themeMode: 'dark' | 'light';
  onThemeModeChange: (mode: 'dark' | 'light') => void;
  error: string;
  onRegister: (e: React.FormEvent) => void;
  onGoogleSignIn: () => void;
}

const AuthSignUpModal: React.FC<AuthSignUpModalProps> = React.memo(({
  onClose,
  onDismissStart,
  isLoading,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
  fullName,
  onFullNameChange,
  photo,
  onPhotoChange,
  themeMode,
  onThemeModeChange,
  error,
  onRegister,
  onGoogleSignIn,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const signUpFormRef = useRef<HTMLFormElement | null>(null);
  const isSignUpReady =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length > 0 &&
    confirmPassword.length > 0;

  const { backdropOpacity, isDismissing, dragModalProps, dragHandleProps, dismissWithSlideOut } = useModalDragDismiss(
    onClose,
    !isLoading,
    onDismissStart
  );

  const photoPreviewUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : ''), [photo]);
  useEffect(() => {
    botDetectionService.markSignInFormOpened();
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  return (
    <motion.div
      style={{ opacity: backdropOpacity }}
      transition={AUTH_MODAL_TRANSITION}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-signup-title"
      className={`simcha-modal-gpu-wrapper will-change-transform transform-gpu absolute inset-0 z-30 bg-black/75 backdrop-blur-sm flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 overflow-hidden ${isDismissing ? 'pointer-events-none' : ''}`}
    >
      <motion.div
        {...dragModalProps}
        transition={AUTH_MODAL_TRANSITION}
        className={`simcha-modal-gpu-wrapper will-change-transform transform-gpu bg-[#111] w-full sm:w-full sm:max-w-xl h-[calc(93dvh+2.5rem)] pb-[2.5rem] sm:h-auto sm:pb-0 sm:max-h-[88vh] rounded-t-[2.5rem] rounded-b-[2.5rem] sm:rounded-2xl border-2 sm:border border-[#D4AF37]/30 shadow-2xl overflow-hidden relative flex flex-col mt-auto sm:mt-0 ${isDismissing ? 'pointer-events-none' : ''}`}
      >
        {/* Top bar drag indicator positioned across the top edge, leaving top-right corner clear for X button */}
        <div
          {...dragHandleProps}
          data-drag-handle="true"
          className="absolute top-0 left-0 right-14 z-30 pt-1.5 pb-4 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
        >
          <div className="pl-14">
            <ModalDragIndicator />
          </div>
        </div>

        {/* Floating close button rendered at root z-[120] top-4 right-4 - identical to BookingModal */}
        <button
          type="button"
          onClick={dismissWithSlideOut}
          disabled={isLoading}
          className={`absolute top-4 right-4 z-[120] w-8 h-8 flex items-center justify-center bg-[#1a1a1a] hover:bg-[#262626] border border-[#D4AF37]/40 rounded-full text-[#D4AF37] transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] shadow-xl cursor-pointer ${isLoading ? 'pointer-events-none opacity-30' : ''}`}
          aria-label="Close sign up modal"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y custom-scrollbar p-6 md:p-8 pt-8 pb-12 flex flex-col">
          <header
            {...dragHandleProps}
            data-drag-handle="true"
            className="text-center mb-6 cursor-grab active:cursor-grabbing select-none"
          >
            <div className="flex items-center justify-center mx-auto mb-4">
              <SimchaLogo className="w-14 h-14 overflow-visible" viewBox="-10 -8 120 110" />
            </div>
            <h2 id="auth-signup-title" className="text-2xl sm:text-3xl font-bold font-[Cinzel] text-[#D4AF37] tracking-wider uppercase">
              WELCOME TO SIMCHA SIGN UP
            </h2>
            <p className="text-[10px] text-zinc-300 uppercase tracking-[0.4em] mt-2">Professional Planning Access</p>
          </header>

          <form ref={signUpFormRef} aria-label="Registration Form" onSubmit={onRegister} className="space-y-4">
            <input
              type="text"
              name="website_company_url"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              onChange={e => botDetectionService.setHoneypotValue(e.target.value)}
              className="absolute -left-[9999px] top-0 w-px h-px opacity-0 pointer-events-none"
            />
            <div className="flex flex-col items-center mb-4">
              <label className="relative group cursor-pointer">
                <div className="w-20 h-20 bg-black/60 border-2 border-dashed border-[#D4AF37]/30 rounded-full flex items-center justify-center overflow-hidden transition-all group-hover:border-[#D4AF37]">
                  {photoPreviewUrl ? <img src={photoPreviewUrl} alt="Profile preview" className="w-full h-full object-cover" /> : <Camera className="w-6 h-6 text-[#D4AF37]/40" />}
                </div>
                <input type="file" className="hidden" accept="image/*" onChange={e => onPhotoChange(e.target.files?.[0] || null)} />
                <div className="absolute -bottom-1 -right-1 bg-[#D4AF37] p-1.5 rounded-full text-black shadow-lg">
                  <Plus className="w-3 h-3" />
                </div>
              </label>
              <p className="text-[8px] text-zinc-300 font-black uppercase tracking-widest mt-2">Upload Profile Photo</p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest ml-1">Full Name</label>
              <input required type="text" value={fullName} onChange={e => onFullNameChange(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="Sarah Cohen" />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest ml-1">Email Address</label>
              <input required type="email" value={email} onChange={e => onEmailChange(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="sarah@example.com" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest ml-1">Password</label>
                <div className="relative">
                  <input required type={showPassword ? 'text' : 'password'} value={password} onChange={e => onPasswordChange(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl pl-4 pr-10 py-3 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="••••••••" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-[#D4AF37] focus-visible:text-[#D4AF37] transition-colors outline-none cursor-pointer p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest ml-1">Repeat Password</label>
                <div className="relative">
                  <input required type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => onConfirmPasswordChange(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl pl-4 pr-10 py-3 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="••••••••" />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(prev => !prev)}
                    aria-label={showConfirmPassword ? 'Hide repeat password' : 'Show repeat password'}
                    aria-pressed={showConfirmPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-[#D4AF37] focus-visible:text-[#D4AF37] transition-colors outline-none cursor-pointer p-1"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center space-y-2 py-1 text-center w-full">
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest text-center">App Appearance</label>
              <div className="flex items-center justify-center w-full">
                <ThemeModeSwitch
                  themeMode={themeMode}
                  onToggleThemeMode={onThemeModeChange}
                />
              </div>
              <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest text-center pt-0.5 whitespace-nowrap">Can always be changed in Profile</p>
            </div>

            {error && (
              <div className="bg-zinc-400/10 border border-zinc-400/20 p-3 rounded-lg flex items-center gap-3 animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                <p className="text-zinc-400 text-xs font-bold uppercase tracking-tighter">{error}</p>
              </div>
            )}

            <button disabled={isLoading} type="submit" className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-full hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2 mt-4 cursor-pointer">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Complete Registration'}
            </button>

            <div className="flex items-center gap-4 my-4">
              <div className="flex-1 border-t border-white/10" aria-hidden="true"></div>
              <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-black">Or join with</span>
              <div className="flex-1 border-t border-white/10" aria-hidden="true"></div>
            </div>

            <button
              type="button"
              onClick={onGoogleSignIn}
              disabled={isLoading}
              className="w-full bg-white text-black font-black py-4 rounded-full hover:bg-zinc-200 transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-3 cursor-pointer"
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
          </form>
        </div>
      </motion.div>
    </motion.div>
  );
});

interface AuthSignInModalProps {
  openId: number;
  step: 'login' | 'forgot-password';
  onChangeStep: (step: 'login' | 'forgot-password') => void;
  onClose: (openId: number) => void;
  isSignUpOpen: boolean;
  onOpenSignUp: () => void;
  onCloseSignUp: () => void;
  isLoading: boolean;
  email: string;
  onEmailChange: (val: string) => void;
  password: string;
  onPasswordChange: (val: string) => void;
  confirmPassword: string;
  onConfirmPasswordChange: (val: string) => void;
  fullName: string;
  onFullNameChange: (val: string) => void;
  photo: File | null;
  onPhotoChange: (file: File | null) => void;
  themeMode: 'dark' | 'light';
  onThemeModeChange: (mode: 'dark' | 'light') => void;
  error: string;
  onLogin: (e: React.FormEvent) => void;
  onRegister: (e: React.FormEvent) => void;
  onResetPassword: (e: React.FormEvent) => void;
  onGoogleSignIn: () => void;
}

const AuthSignInModal: React.FC<AuthSignInModalProps> = React.memo(({
  openId,
  step,
  onChangeStep,
  onClose,
  isSignUpOpen,
  onOpenSignUp,
  onCloseSignUp,
  isLoading,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  confirmPassword,
  onConfirmPasswordChange,
  fullName,
  onFullNameChange,
  photo,
  onPhotoChange,
  themeMode,
  onThemeModeChange,
  error,
  onLogin,
  onRegister,
  onResetPassword,
  onGoogleSignIn,
}) => {
  const [isNestedSignUpDismissing, setIsNestedSignUpDismissing] = useState(false);
  const [nestedSignUpKey, setNestedSignUpKey] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const isSignInDismissingRef = useRef(false);
  const signInFormRef = useRef<HTMLFormElement | null>(null);
  const isSignInReady = email.trim().length > 0 && password.length > 0;

  useEffect(() => {
    if (isSignUpOpen) {
      setIsNestedSignUpDismissing(false);
    }
  }, [isSignUpOpen]);

  useEffect(() => {
    botDetectionService.markSignInFormOpened();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
    };
  }, []);

  const handleSignUpClick = useCallback(() => {
    setIsNestedSignUpDismissing(false);
    setNestedSignUpKey((prev) => prev + 1);
    onOpenSignUp();
  }, [onOpenSignUp]);

  const handleNestedSignUpClose = useCallback(() => {
    if (isSignInDismissingRef.current) return;
    onCloseSignUp();
  }, [onCloseSignUp]);

  const handleNestedSignUpDismissStart = useCallback(() => {
    setIsNestedSignUpDismissing(true);
  }, []);

  const handleSignInDismissStart = useCallback(() => {
    isSignInDismissingRef.current = true;
    document.body.style.overflow = '';
    if (isNestedSignUpDismissing) {
      onCloseSignUp();
    }
  }, [isNestedSignUpDismissing, onCloseSignUp]);

  const handleSignInFinishClose = useCallback(() => {
    onClose(openId);
  }, [onClose, openId]);

  const isSignInInteractive = !isSignUpOpen || isNestedSignUpDismissing;
  const { backdropOpacity, isDismissing, dragModalProps, dragHandleProps, dismissWithSlideOut } = useModalDragDismiss(
    handleSignInFinishClose,
    isSignInInteractive,
    handleSignInDismissStart
  );

  return (
    <motion.div
      style={{ opacity: backdropOpacity }}
      transition={AUTH_MODAL_TRANSITION}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-signin-title"
      className={`simcha-modal-gpu-wrapper will-change-transform transform-gpu fixed inset-0 z-[150] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 bg-black/80 backdrop-blur-md overflow-hidden ${isDismissing ? 'pointer-events-none' : ''}`}
    >
      <motion.div
        {...dragModalProps}
        transition={AUTH_MODAL_TRANSITION}
        className={`simcha-modal-gpu-wrapper will-change-transform transform-gpu bg-[#111] w-full sm:max-w-xl h-[calc(96dvh+2.5rem)] -mb-[2.5rem] pb-[2.5rem] sm:h-auto sm:mb-0 sm:pb-0 sm:max-h-[90vh] rounded-t-[2.5rem] rounded-b-[2.5rem] sm:rounded-3xl border-2 sm:border border-[#D4AF37]/30 shadow-2xl overflow-hidden relative flex flex-col mt-auto sm:mt-0 ${isDismissing ? 'pointer-events-none' : ''}`}
      >
        {/* Top bar drag area with centered drag indicator pill, leaving top-right corner clear for X button */}
        <div
          {...dragHandleProps}
          data-drag-handle="true"
          className="absolute top-0 left-0 right-14 z-30 pt-1.5 pb-4 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
        >
          <div className="pl-14">
            <ModalDragIndicator />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col bg-[#111] rounded-t-[2.5rem] sm:rounded-t-3xl p-6 md:p-8 pt-8 pb-12">
          <header
            {...dragHandleProps}
            data-drag-handle="true"
            className="text-center mb-6 cursor-grab active:cursor-grabbing select-none"
          >
            <div className="flex items-center justify-center mx-auto mb-4">
              <SimchaLogo className="w-14 h-14 overflow-visible" viewBox="-10 -8 120 110" />
            </div>
            <h2 id="auth-signin-title" className="text-2xl sm:text-3xl font-bold font-[Cinzel] text-[#D4AF37] tracking-wider uppercase">
              WELCOME TO SIMCHA SIGN IN
            </h2>
            <p className="text-[10px] text-zinc-300 uppercase tracking-[0.4em] mt-2">Professional Planning Access</p>
          </header>

          {step === 'login' ? (
            <form ref={signInFormRef} aria-label="Sign In Form" onSubmit={onLogin} className="space-y-6">
              <input
                type="text"
                name="website_company_url"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                onChange={e => botDetectionService.setHoneypotValue(e.target.value)}
                className="absolute -left-[9999px] top-0 w-px h-px opacity-0 pointer-events-none"
              />
              <div className="flex rounded-full border border-[#D4AF37]/20 bg-black/60 p-1 mb-4">
                <button
                  type="button"
                  onClick={() => onChangeStep('login')}
                  className="flex-1 rounded-full px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors bg-[#D4AF37] text-black shadow cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={handleSignUpClick}
                  className="flex-1 rounded-full px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-colors text-zinc-400 hover:text-white cursor-pointer"
                >
                  Sign Up
                </button>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest ml-1">Email Address</label>
                <input required type="email" value={email} onChange={e => onEmailChange(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-4 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="sarah@example.com" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest ml-1">Password</label>
                  <button type="button" onClick={() => onChangeStep('forgot-password')} className="text-[10px] text-[#D4AF37] hover:underline font-bold uppercase tracking-widest px-2 py-0.5 rounded-full hover:bg-[#D4AF37]/10 transition-colors cursor-pointer">Forgot password?</button>
                </div>
                <div className="relative">
                  <input required type={showPassword ? 'text' : 'password'} value={password} onChange={e => onPasswordChange(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl pl-4 pr-11 py-4 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="••••••••" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-[#D4AF37] focus-visible:text-[#D4AF37] transition-colors outline-none cursor-pointer p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-zinc-400/10 border border-zinc-400/20 p-3 rounded-lg flex items-center gap-3 animate-shake">
                  <AlertCircle className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                  <p className="text-zinc-400 text-xs font-bold uppercase tracking-tighter">{error}</p>
                </div>
              )}

              <button disabled={isLoading} type="submit" className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-full hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2 cursor-pointer">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
              </button>

              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 border-t border-white/10" aria-hidden="true"></div>
                <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-black">Or continue with</span>
                <div className="flex-1 border-t border-white/10" aria-hidden="true"></div>
              </div>

              <button
                type="button"
                onClick={onGoogleSignIn}
                disabled={isLoading}
                className="w-full bg-white text-black font-black py-4 rounded-full hover:bg-zinc-200 transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-3 cursor-pointer"
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
            </form>
          ) : (
            <form aria-label="Password Reset Form" onSubmit={onResetPassword} className="space-y-6 animate-in fade-in duration-300">
              <div className="flex items-center justify-between mb-4">
                <button
                  type="button"
                  onClick={() => onChangeStep('login')}
                  className="text-xs text-zinc-300 hover:text-[#D4AF37] flex items-center gap-1 font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </button>
              </div>
              <div className="bg-[#D4AF37]/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6">
                <RefreshCw className="w-8 h-8 text-[#D4AF37]" />
              </div>
              <div className="text-center mb-6">
                <h2 className="text-white font-bold uppercase tracking-widest text-sm mb-2">Password Reset</h2>
                <p className="text-[10px] text-zinc-300 uppercase leading-relaxed px-4">Enter your email and we'll send you a link to regain access to your simcha planning.</p>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest ml-1">Email Address</label>
                <input required type="email" value={email} onChange={e => onEmailChange(e.target.value)} className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-4 text-sm text-white outline-none focus:border-[#D4AF37]" placeholder="sarah@example.com" />
              </div>
              {error && (
                <div className="bg-zinc-400/10 border border-zinc-400/20 p-3 rounded-lg flex items-center gap-3 animate-shake">
                  <AlertCircle className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                  <p className="text-zinc-400 text-xs font-bold uppercase tracking-tighter">{error}</p>
                </div>
              )}
              <button disabled={isLoading} type="submit" className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-full hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2 cursor-pointer">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Get Reset Link'}
              </button>
              <button type="button" onClick={() => onChangeStep('login')} className="w-full text-zinc-300 hover:text-white text-[10px] font-black uppercase tracking-widest cursor-pointer">Return to Login</button>
            </form>
          )}
        </div>

        {/* Nested Sign Up Fill-Up Form Modal layered inside AuthSignInModal */}
        {isSignUpOpen && (
          <AuthSignUpModal
            key={`auth-signup-${nestedSignUpKey}`}
            onClose={handleNestedSignUpClose}
            onDismissStart={handleNestedSignUpDismissStart}
            isLoading={isLoading}
            email={email}
            onEmailChange={onEmailChange}
            password={password}
            onPasswordChange={onPasswordChange}
            confirmPassword={confirmPassword}
            onConfirmPasswordChange={onConfirmPasswordChange}
            fullName={fullName}
            onFullNameChange={onFullNameChange}
            photo={photo}
            onPhotoChange={onPhotoChange}
            themeMode={themeMode}
            onThemeModeChange={onThemeModeChange}
            error={error}
            onRegister={onRegister}
            onGoogleSignIn={onGoogleSignIn}
          />
        )}

        {/* Floating close button rendered above the sheet - immediately active as soon as nested Sign Up starts dismissing */}
        {isSignInInteractive && (
          <button
            type="button"
            onClick={dismissWithSlideOut}
            className="absolute top-4 right-4 z-[120] w-8 h-8 flex items-center justify-center bg-[#1a1a1a] hover:bg-[#262626] border border-[#D4AF37]/40 rounded-full text-[#D4AF37] transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] shadow-xl cursor-pointer"
            aria-label="Close sign in modal"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </motion.div>
    </motion.div>
  );
});

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

const handleFirestoreError = (
  error: unknown, 
  operationType: OperationType, 
  path: string | null,
  onNotify?: (msg: string, type?: 'success' | 'info' | 'error') => void
) => {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errCode = (error as any)?.code || '';
  const isOffline = errCode === 'unavailable' || 
                    errMsg.includes('unavailable') || 
                    errMsg.includes('offline') || 
                    errMsg.includes('Failed to get document') || 
                    errMsg.includes('client is offline');

  if (isOffline) {
    console.warn(`[App] Firestore operation/listener offline for ${operationType} on ${path}:`, errMsg);
    return;
  }

  const isPermissionDenied = errCode === 'permission-denied' || 
                             errMsg.includes('permission-denied') || 
                             errMsg.includes('Missing or insufficient permissions') ||
                             errMsg.includes('Insufficient permissions');

  if (isPermissionDenied) {
    console.warn(`[App] Permission denied for ${operationType} on ${path}:`, errMsg);
    const friendlyMsg = `Access restricted: You do not have permission to access ${path ? `'${path}'` : 'this resource'}.`;
    if (onNotify) {
      onNotify(friendlyMsg, 'error');
    }
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
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
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
};

const isVideo = (url?: string | null) => {
  if (!url) return false;
  return !!(url.match(/\.(mp4|webm|ogg|mov)(?:\?|$|%)/i) || url.includes('video%2F') || url.includes('video/'));
};

const renderMedia = (url: string | undefined | null, className: string, alt?: string, ariaHidden?: boolean, priority?: boolean) => {
  if (!url) return null;
  if (isVideo(url)) {
    return <video src={url} className={className} autoPlay muted loop playsInline aria-hidden={ariaHidden} />;
  }
  return (
    <img
      src={url}
      alt={alt || ""}
      decoding={priority ? "sync" : "async"}
      loading={priority ? "eager" : undefined}
      fetchPriority={priority ? "high" : undefined}
      className={className}
      aria-hidden={ariaHidden}
    />
  );
};

const APP_SLIDE_UP_TRANSITION = {
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1] as const,
};

const CARD_GRID_VARIANTS = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
    },
  },
};

const CARD_ITEM_VARIANTS = {
  hidden: { opacity: 0, y: 30 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 100,
      damping: 15,
    },
  },
};

const HERO_TITLE_CONTAINER_VARIANTS = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0,
    },
  },
};

const HERO_TITLE_LINE_VARIANTS = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.22, 1, 0.36, 1] as const,
    },
  },
};

function App() {
  const { scrollY } = useScroll();
  const heroTitleOpacity = useTransform(scrollY, [0, 200], [1, 0]);
  const heroTitleScale = useTransform(scrollY, [0, 200], [1, 0.8]);
  const heroTitleY = useTransform(scrollY, [0, 200], [0, -28]);
  const heroBgY = useTransform(scrollY, [0, 320], [0, 32]);
  const heroBgScale = useTransform(scrollY, [0, 320], [1, 1.06]);

  const [view, setView] = useState<'marketplace' | 'vendor-portal' | 'admin' | 'posts' | 'client-portal' | 'payment-success' | 'verify-account' | 'portal'>('marketplace');
  const [portalTab, setPortalTab] = useState<'client' | 'vendor'>('client');
  const [portalInitialTab, setPortalInitialTab] = useState<string>('overview');
  const [activeBottomTab, setActiveBottomTab] = useState<string>('home');
  const welcomeScheduled = React.useRef(false);
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [userDocData, setUserDocData] = useState<any>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isRoleLoading, setIsRoleLoading] = useState(true);
  const [permissionErrorBanner, setPermissionErrorBanner] = useState<string | null>(null);
  const [planConfirmation, setPlanConfirmation] = useState<{ show: boolean; vendorName: string } | null>(null);
  
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isLoadingVendors, setIsLoadingVendors] = useState(true);
  const [posts, setPosts] = useState<Post[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [userRole, setUserRole] = useState<'client' | 'vendor' | 'admin' | null>(null);
  const [currentUserVendorId, setCurrentUserVendorId] = useState<string | null>(null);
  const [paymentBookingId, setPaymentBookingId] = useState<string | null>(null);
  const [paymentVendorId, setPaymentVendorId] = useState<string | null>(null);

  const vendorProfileId = useMemo(() => {
    if (!fbUser) return null;
    const lowerEmail = (fbUser.email || '').trim().toLowerCase();
    // bookingsimcha@gmail.com is strictly an Admin & Client, NEVER a Vendor
    if (isNonVendorEmail(lowerEmail)) return null;
    if (currentUserVendorId) return currentUserVendorId;
    if (userDocData?.vendorId) return userDocData.vendorId;
    const matchedVendor = vendors.find(
      v =>
        v.id === fbUser.uid ||
        (lowerEmail &&
          (v.username?.toLowerCase() === lowerEmail ||
            v.contactEmail?.toLowerCase() === lowerEmail ||
            (lowerEmail === 'shimpose@gmail.com' &&
              (v.contactEmail?.toLowerCase() === 'bookingsimcha@gmail.com' ||
                v.username?.toLowerCase() === 'bookingsimcha@gmail.com'))))
    );
    return matchedVendor ? matchedVendor.id : null;
  }, [fbUser, currentUserVendorId, userDocData, vendors]);

  const ownedVendorIds = useMemo(() => {
    if (!fbUser) return [];
    const lowerEmail = (fbUser.email || '').trim().toLowerCase();
    // bookingsimcha@gmail.com is strictly an Admin & Client, NEVER a Vendor
    if (isNonVendorEmail(lowerEmail)) return [];
    const ids = new Set<string>();
    if (currentUserVendorId) ids.add(currentUserVendorId);
    if (vendorProfileId) ids.add(vendorProfileId);
    if (userDocData?.vendorId) ids.add(userDocData.vendorId);
    vendors.forEach(v => {
      if (
        v.id === fbUser.uid ||
        (lowerEmail &&
          (v.username?.toLowerCase() === lowerEmail ||
            v.contactEmail?.toLowerCase() === lowerEmail ||
            (lowerEmail === 'shimpose@gmail.com' &&
              (v.contactEmail?.toLowerCase() === 'bookingsimcha@gmail.com' ||
                v.username?.toLowerCase() === 'bookingsimcha@gmail.com'))))
      ) {
        ids.add(v.id);
      }
    });
    return Array.from(ids);
  }, [currentUserVendorId, vendorProfileId, userDocData, fbUser, vendors]);

  useEffect(() => {
    if (fbUser && isNonVendorEmail(fbUser.email)) {
      if (currentUserVendorId !== null) setCurrentUserVendorId(null);
      return;
    }
    if (vendorProfileId && !currentUserVendorId) {
      setCurrentUserVendorId(vendorProfileId);
    }
  }, [vendorProfileId, currentUserVendorId, fbUser]);

  const isAdmin = useMemo(() => {
    const email = fbUser?.email?.trim().toLowerCase();
    if (email && CLIENT_OVERRIDE_EMAILS.includes(email)) return false;
    if (email && isWhitelistedAdminEmail(email)) return true;
    if (userRole === 'admin') return true;
    if (userDocData?.isAdmin === true || userDocData?.role === 'admin') return true;
    return false;
  }, [fbUser, userDocData, userRole]);

  const isActuallyVendor = useMemo(() => {
    const email = fbUser?.email?.trim().toLowerCase();
    // bookingsimcha@gmail.com is strictly an Admin & Client, NEVER a Vendor
    if (email && isNonVendorEmail(email)) return false;
    if (userRole === 'vendor') return true;
    if (ownedVendorIds.length > 0) return true;
    if (isInitializing || isRoleLoading) return false;
    if (!fbUser || !userDocData) return false;
    return userDocData.isVendor === true || userDocData.role === 'vendor';
  }, [isInitializing, isRoleLoading, fbUser, userDocData, userRole, ownedVendorIds]);

  useEffect(() => {
    if (!isInitializing && !isRoleLoading) {
      console.log(`[Role Validation Completed] Auth User: ${fbUser ? fbUser.email : 'Guest'} | Profile Loaded: ${!!userDocData} | isAdmin: ${isAdmin} | isVendor: ${isActuallyVendor}`);
    }
  }, [isInitializing, isRoleLoading, fbUser, userDocData, isAdmin, isActuallyVendor]);

  const [isVendorView, setIsVendorView] = useState(false);
  const isVendorViewRef = useRef(isVendorView);
  isVendorViewRef.current = isVendorView;
  const activeBottomTabRef = useRef(activeBottomTab);
  activeBottomTabRef.current = activeBottomTab;

  const handleToggleVendor = useCallback((targetVendorView?: boolean) => {
    const currentVendorView = isVendorViewRef.current;
    const nextVendorView = typeof targetVendorView === 'boolean' ? targetVendorView : !currentVendorView;
    if (nextVendorView === currentVendorView) return;

    isVendorViewRef.current = nextVendorView;
    setIsVendorView(nextVendorView);

    startTransition(() => {
      if (nextVendorView) {
        setView(prev => (prev === 'portal' ? prev : 'portal'));
        setPortalTab(prev => (prev === 'vendor' ? prev : 'vendor'));

        const currentTab = activeBottomTabRef.current;
        if (currentTab === 'plan' || currentTab === 'events') {
          setPortalInitialTab(prev => (prev === 'overview' ? prev : 'overview'));
          setActiveBottomTab(prev => (prev === 'home' ? prev : 'home'));
        } else if (currentTab === 'chat') {
          setPortalInitialTab(prev => (prev === 'messages' ? prev : 'messages'));
        } else if (currentTab === 'profile') {
          setPortalInitialTab(prev => (prev === 'profile' ? prev : 'profile'));
        } else if (currentTab === 'home') {
          setPortalInitialTab(prev => (prev === 'overview' ? prev : 'overview'));
        }
      } else {
        // Switching from Vendor back to Client takes the user directly to the homepage (marketplace)
        setPortalTab(prev => (prev === 'client' ? prev : 'client'));
        setActiveBottomTab(prev => (prev === 'home' ? prev : 'home'));
        setView(prev => (prev === 'marketplace' ? prev : 'marketplace'));
      }
    });
  }, []);
  
  const [activeCategories, setActiveCategories] = useState<string[]>(Object.values(VendorCategory));
  const [categoryImages, setCategoryImages] = useState<Record<string, string>>(INITIAL_CATEGORY_IMAGES);
  const [categorySubCategories, setCategorySubCategories] = useState<Record<string, Record<string, string[]>>>({});
  const [subCategoryImages, setSubCategoryImages] = useState<Record<string, string>>({});
  const [heroBackgroundUrl, setHeroBackgroundUrl] = useState<string>("https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?ixlib=rb-1.2.1&auto=format&fit=crop&w=1950&q=80");
  const [maxSearchDates, setMaxSearchDates] = useState<number>(4);
  const [searchDateResetHours, setSearchDateResetHours] = useState<number>(24);
  const [searchDateResetNonce, setSearchDateResetNonce] = useState<number>(0);

  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    try {
      const activeUid = localStorage.getItem('simcha_active_uid');
      const saved = (activeUid && localStorage.getItem(`simcha_theme_mode_${activeUid}`)) || localStorage.getItem('simcha_theme_mode');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {}
    return 'dark';
  });

  const applyThemeDomClasses = useCallback((mode: 'dark' | 'light') => {
    const isLight = mode === 'light';
    document.documentElement.classList.toggle('light-mode', isLight);
    document.body.classList.toggle('light-mode', isLight);
    document.documentElement.classList.remove('outline-mode');
    document.body.classList.remove('outline-mode');
    document.documentElement.setAttribute('data-theme', mode);
  }, []);

  useEffect(() => {
    applyThemeDomClasses(themeMode);
  }, [themeMode, applyThemeDomClasses]);

  // Preload hero background image while on sign-in screen so it renders immediately on login
  useEffect(() => {
    if (!heroBackgroundUrl || isVideo(heroBackgroundUrl)) return;
    const img = new Image();
    img.decoding = 'sync';
    img.src = heroBackgroundUrl;
  }, [heroBackgroundUrl]);

  const handleToggleThemeMode = useCallback((nextMode: 'dark' | 'light') => {
    applyThemeDomClasses(nextMode);
    setThemeMode(nextMode);
    try {
      localStorage.setItem('simcha_theme_mode', nextMode);
    } catch (e) {}
    setUserDocData((prev: any) => (prev ? { ...prev, themeMode: nextMode } : prev));
    if (fbUser) {
      try {
        localStorage.setItem('simcha_active_uid', fbUser.uid);
        localStorage.setItem(`simcha_theme_mode_${fbUser.uid}`, nextMode);
      } catch (e) {}
      setDoc(doc(db, 'users', fbUser.uid), {
        themeMode: nextMode,
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(err => {
        console.warn('Error updating theme mode in user profile:', err);
      });
    }
  }, [fbUser, applyThemeDomClasses]);

  const syncUserProfile = async (user: FirebaseUser, additionalData: { fullName?: string, photoURL?: string, photoStoragePath?: string, themeMode?: 'dark' | 'light' } = {}) => {
    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDocSafe(userDocRef);
      
      const userData: any = {
        uid: user.uid,
        email: user.email,
        name: additionalData.fullName || user.displayName || user.email?.split('@')[0] || 'Guest',
        photoURL: additionalData.photoURL || user.photoURL || '',
        updatedAt: new Date().toISOString()
      };

      if (isWhitelistedAdminEmail(user.email)) {
        userData.role = 'admin';
        userData.isAdmin = true;
      }

      if (isNonVendorEmail(user.email)) {
        userData.isVendor = false;
      }

      if (additionalData.photoStoragePath !== undefined) {
        userData.photoStoragePath = additionalData.photoStoragePath;
      }

      if (additionalData.themeMode !== undefined) {
        userData.themeMode = additionalData.themeMode;
      }

      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          ...userData,
          themeMode: userData.themeMode || 'dark',
          createdAt: new Date().toISOString()
        });
      } else {
        const existingData = userDoc.data();
        if (existingData?.themeMode === undefined && userData.themeMode === undefined) {
          userData.themeMode = 'dark';
        }
        if (isNonVendorEmail(user.email)) {
          userData.vendorId = deleteField();
          userData.isVendor = false;
        }
        await updateDoc(userDocRef, userData);
      }

      // If any vendor document in Firestore accidentally had bookingsimcha@gmail.com as contactEmail/username,
      // migrate it to shimpose@gmail.com so shimpose@gmail.com owns it and bookingsimcha@gmail.com never appears as a vendor
      if (isWhitelistedAdminEmail(user.email)) {
        vendors.forEach(v => {
          const cEmail = (v.contactEmail || '').trim().toLowerCase();
          const uName = (v.username || '').trim().toLowerCase();
          if (cEmail === 'bookingsimcha@gmail.com' || uName === 'bookingsimcha@gmail.com' || cEmail === 'adminbookingsimcha@gmail.com' || uName === 'adminbookingsimcha@gmail.com') {
            updateDoc(doc(db, 'vendors', v.id), {
              contactEmail: 'shimpose@gmail.com',
              ...(uName.includes('@') ? { username: 'shimpose@gmail.com' } : {})
            }).catch(() => {});
          }
        });
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
    const notifyErr = (msg: string, type: 'success' | 'info' | 'error' = 'error') => {
      setPermissionErrorBanner(msg);
      showNotification(msg, type);
    };

    const unsubVendors = onSnapshot(collection(db, 'vendors'), (snapshot) => {
      const vDataRaw = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Vendor));
      const vData = Array.from(new Map(vDataRaw.map(v => [v.id, v])).values());
      if (snapshot.empty && INITIAL_VENDORS.length > 0) {
        // Seed if empty efficiently
        console.log("[Firebase] Seeding initial vendors...");
        Promise.all(INITIAL_VENDORS.map(v => setDoc(doc(db, 'vendors', v.id), clean(v))))
          .catch(err => handleFirestoreError(err, OperationType.CREATE, 'vendors', notifyErr))
          .finally(() => setIsLoadingVendors(false));
      } else {
        setVendors(vData);
        setIsLoadingVendors(false);
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'vendors', notifyErr);
      setIsLoadingVendors(false);
    });

    const unsubPosts = onSnapshot(collection(db, 'posts'), (snapshot) => {
      const pDataRaw = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
      const pData = Array.from(new Map(pDataRaw.map(p => [p.id, p])).values());
      setPosts(pData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'posts', notifyErr));

    const unsubMetadata = onSnapshot(doc(db, 'metadata', 'app_config'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.heroBackgroundUrl) setHeroBackgroundUrl(data.heroBackgroundUrl);
        if (typeof data.maxSearchDates === 'number' && data.maxSearchDates >= 1) setMaxSearchDates(data.maxSearchDates);
        if (typeof data.searchDateResetHours === 'number' && data.searchDateResetHours >= 0) setSearchDateResetHours(data.searchDateResetHours);
        if (typeof data.searchDateResetNonce === 'number') setSearchDateResetNonce(data.searchDateResetNonce);
      } else {
        // Seed metadata
        setDoc(doc(db, 'metadata', 'app_config'), {
          categories: Object.values(VendorCategory),
          categoryImages: INITIAL_CATEGORY_IMAGES,
          categorySubCategories: {},
          subCategoryImages: {},
          heroBackgroundUrl: "https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?ixlib=rb-1.2.1&auto=format&fit=crop&w=1950&q=80",
          maxSearchDates: 4,
          searchDateResetHours: 24,
          searchDateResetNonce: 0
        }).catch(err => handleFirestoreError(err, OperationType.CREATE, 'metadata/app_config', notifyErr));
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'metadata/app_config', notifyErr));

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
      (err) => handleFirestoreError(err, OperationType.LIST, 'categories', notifyErr)
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

  // Firebase Auth Observer & 3D Angled Paper Roll Sign-In Transition State
  const isFirstAuthCheckRef = useRef(true);
  const appMountTimeRef = useRef(Date.now());
  const [isSignInFlipping, setIsSignInFlipping] = useState(false);
  const [isHeroTitleHoldForSignIn, setIsHeroTitleHoldForSignIn] = useState(false);
  const isSignInFlippingRef = useRef(false);
  const heroTitleHoldRef = useRef(false);
  const isInteractiveSignInRef = useRef(false);
  const peelWindowRef = useRef<HTMLDivElement | null>(null);
  const peelSceneRef = useRef<HTMLDivElement | null>(null);
  const peelFlapTrackRef = useRef<HTMLDivElement | null>(null);
  const peelFlapBodyRef = useRef<HTMLDivElement | null>(null);
  const mainMenuUnfoldRef = useRef<HTMLElement | null>(null);
  const pageFlipAnimRef = useRef<{ stop: () => void } | null>(null);

  const startSignInPageFlip = useCallback(() => {
    if (isSignInFlippingRef.current) return;
    isSignInFlippingRef.current = true;
    heroTitleHoldRef.current = true;
    setIsHeroTitleHoldForSignIn(true);
    setIsSignInFlipping(true);
  }, []);

  // Firestore Sync - User Data
  useEffect(() => {
    if (!fbUser || !userRole) {
      setBookings([]);
      setMessages([]);
      setCart([]);
      return;
    }
    if (isSignInFlipping) return;

    const notifyErr = (msg: string, type: 'success' | 'info' | 'error' = 'error') => {
      setPermissionErrorBanner(msg);
      showNotification(msg, type);
    };

    // Bookings (Real-time sync for both client and vendor views with strict deduplication & newest-first order)
    let unsubBookings = () => {};
    if (userRole === 'admin') {
      unsubBookings = onSnapshot(
        collection(db, 'bookings'),
        (snapshot) => {
          const bData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Booking));
          bData.sort((a, b) => {
            const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return tB - tA;
          });
          setBookings(bData);
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'bookings', notifyErr)
      );
    } else {
      const bookingBuckets = new Map<string, Booking[]>();
      const rebuildMergedBookings = () => {
        const byId = new Map<string, Booking>();
        for (const list of bookingBuckets.values()) {
          for (const item of list) {
            const existing = byId.get(item.id);
            if (!existing) {
              byId.set(item.id, item);
            } else {
              const tNew = item.createdAt ? new Date(item.createdAt).getTime() : 0;
              const tOld = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
              if (tNew >= tOld) byId.set(item.id, item);
            }
          }
        }
        const sorted = Array.from(byId.values()).sort((a, b) => {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tB - tA;
        });
        // Deduplicate by vendorId + date + client identifier so multiple identical bookings never appear
        const seenKeys = new Set<string>();
        const deduped: Booking[] = [];
        for (const b of sorted) {
          const clientKey = (b.userId || b.clientId || b.contactEmail || b.clientName || '').toLowerCase();
          const compositeKey = `${b.vendorId}_${b.date}_${clientKey}`;
          if (!seenKeys.has(compositeKey)) {
            seenKeys.add(compositeKey);
            deduped.push(b);
          }
        }
        setBookings(deduped);
      };

      const unsubs: Array<() => void> = [];
      const qByUserId = query(collection(db, 'bookings'), where('userId', '==', fbUser.uid));
      unsubs.push(
        onSnapshot(
          qByUserId,
          (snap) => {
            bookingBuckets.set('userId', snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
            rebuildMergedBookings();
          },
          () => {}
        )
      );

      const qByClientId = query(collection(db, 'bookings'), where('clientId', '==', fbUser.uid));
      unsubs.push(
        onSnapshot(
          qByClientId,
          (snap) => {
            bookingBuckets.set('clientId', snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
            rebuildMergedBookings();
          },
          () => {}
        )
      );

      const activeVendorTarget = currentUserVendorId || vendorProfileId;
      if (activeVendorTarget) {
        const qByVendorId = query(collection(db, 'bookings'), where('vendorId', '==', activeVendorTarget));
        unsubs.push(
          onSnapshot(
            qByVendorId,
            (snap) => {
              bookingBuckets.set('vendorId', snap.docs.map(d => ({ id: d.id, ...d.data() } as Booking)));
              rebuildMergedBookings();
            },
            (err) => handleFirestoreError(err, OperationType.LIST, 'bookings', notifyErr)
          )
        );
      }

      unsubBookings = () => {
        unsubs.forEach(u => u());
      };
    }

    // Messages (Subcollection aggregation to keep existing UI fully intact without deep structural rewrite of all panels)
    let unsubMessages = () => {};
    
    // First, determine conversation query based on role (Admin only queries 'admin' support threads, never private vendor-client chats)
    const participantTargets = Array.from(
      new Set(
        [
          ...(userRole === 'admin' || isAdmin ? ['admin'] : []),
          fbUser.uid,
          currentUserVendorId,
          vendorProfileId,
          ...ownedVendorIds,
        ].filter(Boolean)
      )
    ).slice(0, 10) as string[];

    const convoQuery = participantTargets.length > 1
      ? query(
          collection(db, 'conversations'),
          where('participant_ids', 'array-contains-any', participantTargets)
        )
      : query(
          collection(db, 'conversations'),
          where('participant_ids', 'array-contains', participantTargets[0] || fbUser.uid)
        );

    const activeListeners = new Map<string, () => void>();
    const allConvoMessages = new Map<string, Message[]>();

    const rebuildMergedMessages = () => {
      const seenIds = new Set<string>();
      const merged: Message[] = [];
      for (const msgs of allConvoMessages.values()) {
        for (const m of msgs) {
          if (m.id && seenIds.has(m.id)) continue;
          if (m.id) seenIds.add(m.id);
          merged.push(m);
        }
      }
      // Chronological sort
      merged.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeA - timeB;
      });
      setMessages(merged);
    };

    const attachConversationMessagesListener = (convoDoc: any) => {
      const cid = convoDoc.id;
      const convoData = convoDoc.data() || {};
      if (activeListeners.has(cid)) return;

      const mapSnapToMessages = (msgSnap: any): Message[] => {
        return msgSnap.docs.map((docSnap: any) => {
          const data = docSnap.data() || {};
          let timestampStr = new Date().toISOString();
          if (data.timestamp) {
            timestampStr = typeof data.timestamp === 'string'
              ? data.timestamp
              : (typeof data.timestamp?.toDate === 'function' ? data.timestamp.toDate().toISOString() : timestampStr);
          } else if (data.sent_at) {
            if (typeof data.sent_at.toDate === 'function') {
              timestampStr = data.sent_at.toDate().toISOString();
            } else {
              timestampStr = new Date(data.sent_at).toISOString();
            }
          }
          const senderId = data.senderId || data.sender_id || '';
          const receiverId =
            data.receiverId ||
            data.receiver_id ||
            (senderId === fbUser.uid ? (convoData.vendor_id || 'admin') : fbUser.uid);
          return {
            id: docSnap.id,
            ...data,
            conversationId: cid,
            senderId,
            receiverId,
            vendorId: data.vendorId || data.vendor_id || convoData.vendor_id || undefined,
            vendorName: data.vendorName || data.vendor_name || convoData.vendor_name || undefined,
            clientEmail: data.clientEmail || data.client_email || convoData.client_email || undefined,
            participants: Array.isArray(data.participants)
              ? data.participants
              : (Array.isArray(convoData.participant_ids) ? convoData.participant_ids : [senderId, receiverId]),
            isAdminInquiry: Boolean(
              data.isAdminInquiry ||
                convoData.type === 'admin_support' ||
                senderId === 'admin' ||
                receiverId === 'admin'
            ),
            timestamp: timestampStr,
          } as Message;
        });
      };

      const msgQuery = query(
        collection(db, 'conversations', cid, 'messages'),
        orderBy('sent_at', 'asc')
      );

      const unsubMsg = onSnapshot(
        msgQuery,
        (msgSnap) => {
          allConvoMessages.set(cid, mapSnapToMessages(msgSnap));
          rebuildMergedMessages();
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, `conversations/${cid}/messages`, notifyErr);
          const fallbackQuery = collection(db, 'conversations', cid, 'messages');
          const unsubFallback = onSnapshot(
            fallbackQuery,
            (msgSnap) => {
              allConvoMessages.set(cid, mapSnapToMessages(msgSnap));
              rebuildMergedMessages();
            },
            (err2) => {
              handleFirestoreError(err2, OperationType.LIST, `conversations/${cid}/messages`, notifyErr);
            }
          );
          activeListeners.set(cid + '_fallback', unsubFallback);
        }
      );
      activeListeners.set(cid, unsubMsg);
    };

    const unsubConvos = onSnapshot(
      convoQuery,
      (snapshot) => {
        snapshot.docs.forEach(attachConversationMessagesListener);
        rebuildMergedMessages();
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'conversations', notifyErr);
      }
    );

    const qByClientId = query(collection(db, 'conversations'), where('client_id', '==', fbUser.uid));
    const unsubByClientId = onSnapshot(
      qByClientId,
      (snapshot) => {
        snapshot.docs.forEach(attachConversationMessagesListener);
        rebuildMergedMessages();
      },
      () => {}
    );

    const lowerAuthEmail = (fbUser.email || '').trim().toLowerCase();
    let unsubByClientEmail = () => {};
    let unsubByEmailParticipant = () => {};
    let unsubByClientIdEmail = () => {};
    if (lowerAuthEmail) {
      const qByClientEmail = query(collection(db, 'conversations'), where('client_email', '==', lowerAuthEmail));
      unsubByClientEmail = onSnapshot(
        qByClientEmail,
        (snapshot) => {
          snapshot.docs.forEach(attachConversationMessagesListener);
          rebuildMergedMessages();
        },
        () => {}
      );
      const qByEmailParticipant = query(collection(db, 'conversations'), where('participant_ids', 'array-contains', lowerAuthEmail));
      unsubByEmailParticipant = onSnapshot(
        qByEmailParticipant,
        (snapshot) => {
          snapshot.docs.forEach(attachConversationMessagesListener);
          rebuildMergedMessages();
        },
        () => {}
      );
      const qByClientIdEmail = query(collection(db, 'conversations'), where('client_id', '==', lowerAuthEmail));
      unsubByClientIdEmail = onSnapshot(
        qByClientIdEmail,
        (snapshot) => {
          snapshot.docs.forEach(attachConversationMessagesListener);
          rebuildMergedMessages();
        },
        () => {}
      );
    }

    unsubMessages = () => {
      unsubConvos();
      unsubByClientId();
      unsubByClientEmail();
      unsubByEmailParticipant();
      unsubByClientIdEmail();
      activeListeners.forEach(unsub => unsub());
      activeListeners.clear();
    };

    const unsubCart = onSnapshot(doc(db, 'users', fbUser.uid, 'cart', 'current'), (docSnap) => {
      if (docSnap.exists()) {
        const incomingItems = docSnap.data().items || [];
        const incomingJson = JSON.stringify(clean(incomingItems));
        if (incomingJson !== lastSyncedCartJsonRef.current) {
          lastSyncedCartJsonRef.current = incomingJson;
          setCart(incomingItems);
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, `users/${fbUser.uid}/cart/current`, notifyErr));

    // Real-time listener for current user document for instant role & admin toggling
    const unsubUserDoc = onSnapshot(doc(db, 'users', fbUser.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setUserDocData(data);
        let cachedTheme: string | null = null;
        try {
          cachedTheme = localStorage.getItem(`simcha_theme_mode_${fbUser.uid}`) || localStorage.getItem('simcha_theme_mode');
        } catch (e) {}
        const resolvedTheme: 'dark' | 'light' =
          data.themeMode === 'light' || data.themeMode === 'dark'
            ? data.themeMode
            : (cachedTheme === 'light' ? 'light' : 'dark');
        applyThemeDomClasses(resolvedTheme);
        setThemeMode(resolvedTheme);
        try {
          localStorage.setItem('simcha_active_uid', fbUser.uid);
          localStorage.setItem('simcha_theme_mode', resolvedTheme);
          localStorage.setItem(`simcha_theme_mode_${fbUser.uid}`, resolvedTheme);
        } catch (e) {}
        const userEmail = fbUser.email ? fbUser.email.trim().toLowerCase() : '';
        if (isWhitelistedAdminEmail(userEmail)) {
          setUserRole('admin');
          try { localStorage.setItem('simcha_user_role', 'admin'); } catch (e) {}
        } else if (CLIENT_OVERRIDE_EMAILS.includes(userEmail)) {
          setUserRole('client');
          try { localStorage.setItem('simcha_user_role', 'client'); } catch (e) {}
        } else if (data.role || data.isAdmin !== undefined) {
          const docRole = typeof data.role === 'string' ? data.role.toLowerCase() : '';
          if (docRole === 'admin' || data.isAdmin === true) {
            setUserRole('admin');
            try { localStorage.setItem('simcha_user_role', 'admin'); } catch (e) {}
          } else if (docRole === 'vendor' || data.isVendor === true) {
            setUserRole('vendor');
            try { localStorage.setItem('simcha_user_role', 'vendor'); } catch (e) {}
          } else if (data.role) {
            setUserRole(data.role);
            try { localStorage.setItem('simcha_user_role', data.role); } catch (e) {}
          }
        }
      }
    }, (err) => {
      // Non-blocking sync error
    });

    // Users (Admin only)
    let unsubUsers = () => {};
    if (isAdmin || userRole === 'admin') {
      unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        const uDataRaw = snapshot.docs.map(docSnap => {
          const d = docSnap.data();
          return {
            id: docSnap.id,
            ...d,
            username: d.email || d.username || '',
          } as UserAccount;
        });
        const uData = Array.from(new Map(uDataRaw.map(u => [u.id, u])).values());
        setUsers(uData);
      }, (err) => handleFirestoreError(err, OperationType.LIST, 'users', notifyErr));
    }

    return () => {
      unsubBookings();
      unsubMessages();
      unsubCart();
      unsubUserDoc();
      unsubUsers();
    };
  }, [fbUser, userRole, currentUserVendorId, vendorProfileId, ownedVendorIds.join(','), isAdmin, isSignInFlipping, applyThemeDomClasses]);

  // Clean Layer Slide-Up Sign-In Transition Effect (1.25s Modal Speed)
  useEffect(() => {
    if (!isSignInFlipping) return;

    if (peelWindowRef.current) {
      peelWindowRef.current.style.willChange = 'transform';
      peelWindowRef.current.style.transformOrigin = '50% 50%';
      peelWindowRef.current.style.transform = 'translate3d(0px, 0%, 0px)';
    }

    pageFlipAnimRef.current?.stop();

    let rafId = 0;
    let controls: { stop: () => void } | null = null;

    rafId = requestAnimationFrame(() => {
      controls = animate(0, 1, {
        duration: 1.25,
        ease: [0.25, 0.85, 0.35, 1],
        onUpdate: (t) => {
          const liftY = t * 100;
          if (peelWindowRef.current) {
            peelWindowRef.current.style.transform = `translate3d(0px, -${liftY.toFixed(3)}%, 0px)`;
          }
          // Trigger the hero title staggered entrance once the sliding sign-in sheet passes "Celebrate Your"
          if (heroTitleHoldRef.current && liftY >= 80) {
            heroTitleHoldRef.current = false;
            setIsHeroTitleHoldForSignIn(false);
          }
        },
        onComplete: () => {
          isSignInFlippingRef.current = false;
          isInteractiveSignInRef.current = false;
          heroTitleHoldRef.current = false;
          setIsHeroTitleHoldForSignIn(false);
          setIsSignInFlipping(false);
          setIsAuthLoading(false);
          setIsAuthSignUpOpen(false);
          setAuthStep('welcome');
          document.body.style.overflow = '';
          document.body.style.position = '';
          document.body.style.top = '';
          document.body.style.width = '';
        },
      });
      pageFlipAnimRef.current = controls;
    });

    return () => {
      cancelAnimationFrame(rafId);
      controls?.stop();
    };
  }, [isSignInFlipping]);

  useEffect(() => {
    const waitMinReloadTime = async () => {
      if (isFirstAuthCheckRef.current) {
        isFirstAuthCheckRef.current = false;
        const elapsed = Date.now() - appMountTimeRef.current;
        const minDisplayMs = 650;
        if (elapsed < minDisplayMs) {
          await new Promise(resolve => setTimeout(resolve, minDisplayMs - elapsed));
        }
      }
    };

    const syncSavedThemePreference = () => {
      let savedTheme: 'dark' | 'light' = 'dark';
      try {
        const activeUid = localStorage.getItem('simcha_active_uid');
        const rawTheme = (activeUid && localStorage.getItem(`simcha_theme_mode_${activeUid}`)) || localStorage.getItem('simcha_theme_mode');
        if (rawTheme === 'light' || rawTheme === 'dark') savedTheme = rawTheme;
      } catch (e) {}
      applyThemeDomClasses(savedTheme);
      setThemeMode(savedTheme);
    };

    const unsubscribe = onAuthStateChanged(auth, async (rawUser) => {
      const isInitialBoot = isFirstAuthCheckRef.current;
      try {
        if (typeof auth.authStateReady === 'function') {
          await auth.authStateReady();
        }
      } catch (e) {}

      const user = auth.currentUser ?? rawUser;

      if (!user) {
        await waitMinReloadTime();
        syncSavedThemePreference();
        setFbUser(null);
        setUserDocData(null);
        setUserRole(null);
        setCurrentUserVendorId(null);
        setIsRoleLoading(false);
        setIsInitializing(false);
        return;
      }

      // If handleAuthLogin / handleAuthGoogleSignIn is actively authenticating the user,
      // let it finish full role/vendor/admin verification while the Sign In button loads
      // so the slide-up animation only starts once everything is authenticated with zero mid-animation re-renders.
      if (isInteractiveSignInRef.current) {
        isFirstAuthCheckRef.current = false;
        return;
      }

      if (isInitialBoot) {
        setIsRoleLoading(true);
      }

      const userEmail = user.email ? user.email.trim().toLowerCase() : '';

      // If logged in but email not verified, we also treat it as not fully authenticated for the app, EXCEPT if they are a vendor or admin!
      if (!user.emailVerified && !isWhitelistedAdminEmail(userEmail)) {
        let isVendor = false;
        try {
          const vendorDoc = await getDocSafe(doc(db, 'vendors', user.uid));
          if (vendorDoc.exists()) {
            isVendor = true;
          } else if (user.email) {
            const q = query(collection(db, 'vendors'), where('contactEmail', '==', user.email));
            const snapshot = await getDocsSafe(q);
            if (!snapshot.empty) {
              isVendor = true;
            } else {
              const q2 = query(collection(db, 'vendors'), where('username', '==', user.email));
              const snapshot2 = await getDocsSafe(q2);
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
          await waitMinReloadTime();
          syncSavedThemePreference();
          setFbUser(null);
          setUserDocData(null);
          setUserRole(null);
          setCurrentUserVendorId(null);
          setIsRoleLoading(false);
          setIsInitializing(false);
          return;
        }
      }

      // If signing in interactively from the Sign-In screen, immediately mount the Main App underneath and start the bottom-up paper peel animation with zero loading screen!
      if (!isInitialBoot) {
        startSignInPageFlip();
        setIsRoleLoading(false);
        setIsInitializing(false);
        setFbUser(user);
      }

      // Non-blocking profile sync
      syncUserProfile(user).catch(err => console.error("Background profile sync failed:", err));
      
      // Fetch user doc data and role in parallel
      try {
        const [initialUserDoc, secureRole] = await Promise.all([
          getDocSafe(doc(db, 'users', user.uid)).catch(() => null),
          fetchUserRole(user)
        ]);

        let finalRole = secureRole;
        if (isWhitelistedAdminEmail(userEmail)) {
          finalRole = 'admin';
        } else if (CLIENT_OVERRIDE_EMAILS.includes(userEmail)) {
          finalRole = 'client';
        }

        let cachedUidTheme: string | null = null;
        try {
          cachedUidTheme = localStorage.getItem(`simcha_theme_mode_${user.uid}`) || localStorage.getItem('simcha_theme_mode');
        } catch (e) {}

        let resolvedTheme: 'dark' | 'light' = cachedUidTheme === 'light' ? 'light' : 'dark';

        let resolvedUserDocData: any = {
          role: finalRole,
          isAdmin: finalRole === 'admin',
          isVendor: finalRole === 'vendor',
          email: userEmail,
          themeMode: resolvedTheme,
        };
        let resolvedVendorId: string | null = null;

        if (initialUserDoc && initialUserDoc.exists()) {
          const data = initialUserDoc.data();
          if (data.themeMode === 'light' || data.themeMode === 'dark') {
            resolvedTheme = data.themeMode;
          }
          resolvedUserDocData = {
            ...data,
            themeMode: resolvedTheme,
          };
          if (isWhitelistedAdminEmail(userEmail)) {
            finalRole = 'admin';
          } else if (finalRole === 'client' && data.role && !CLIENT_OVERRIDE_EMAILS.includes(userEmail)) {
             const docRole = typeof data.role === 'string' ? data.role.toLowerCase() : '';
             if (docRole === 'admin' || data.isAdmin === true) finalRole = 'admin';
             else if (docRole === 'vendor' || data.isVendor === true) finalRole = 'vendor';
             else finalRole = data.role;
          }
          if (isNonVendorEmail(userEmail)) {
            resolvedVendorId = null;
            resolvedUserDocData.isVendor = false;
            delete resolvedUserDocData.vendorId;
          } else {
            resolvedVendorId = data.vendorId || null;
          }
        }

        applyThemeDomClasses(resolvedTheme);
        setThemeMode(resolvedTheme);
        try {
          localStorage.setItem('simcha_active_uid', user.uid);
          localStorage.setItem('simcha_theme_mode', resolvedTheme);
          localStorage.setItem(`simcha_theme_mode_${user.uid}`, resolvedTheme);
        } catch (e) {}

        await waitMinReloadTime();

        if (isNonVendorEmail(userEmail)) {
          setIsVendorView(false);
          setPortalTab('client');
        }
        setUserDocData(resolvedUserDocData);
        setUserRole(finalRole);
        try { localStorage.setItem('simcha_user_role', finalRole); } catch (e) {}
        setCurrentUserVendorId(isNonVendorEmail(userEmail) ? null : resolvedVendorId);
        setFbUser(user);
        console.log("Logged in UID:", user.uid, "| Detected Role:", finalRole);
      } catch (err: any) {
        if (err.message?.includes('offline') || err.message?.includes('Failed to get document')) {
          console.warn("User document fetch paused (offline mode):", err.message);
        } else {
          console.error("Error fetching user document:", err);
        }
        let fallbackTheme: 'dark' | 'light' = 'dark';
        try {
          const t = localStorage.getItem(`simcha_theme_mode_${user.uid}`) || localStorage.getItem('simcha_theme_mode');
          if (t === 'light') fallbackTheme = 'light';
          localStorage.setItem('simcha_active_uid', user.uid);
          localStorage.setItem('simcha_theme_mode', fallbackTheme);
        } catch (e) {}
        applyThemeDomClasses(fallbackTheme);
        setThemeMode(fallbackTheme);
        await waitMinReloadTime();
        if (isWhitelistedAdminEmail(userEmail)) {
          setUserRole('admin');
          setUserDocData({ role: 'admin', isAdmin: true, isVendor: false, email: userEmail, themeMode: fallbackTheme });
        } else {
          setUserRole('client');
          setUserDocData({ role: 'client', isAdmin: false, isVendor: false, email: user.email || '', themeMode: fallbackTheme });
        }
        setFbUser(user);
      } finally {
        setIsRoleLoading(false);
        setIsInitializing(false);
      }
    });
    return () => unsubscribe();
  }, [applyThemeDomClasses, startSignInPageFlip]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const lastSyncedCartJsonRef = useRef<string>('');
  
  // Sync cart to Firestore
  useEffect(() => {
    if (fbUser) {
      const currentCartJson = JSON.stringify(clean(cart));
      if (currentCartJson !== lastSyncedCartJsonRef.current) {
        lastSyncedCartJsonRef.current = currentCartJson;
        const cartRef = doc(db, 'users', fbUser.uid, 'cart', 'current');
        if (cart.length > 0) {
          setDoc(cartRef, { items: clean(cart) }).catch(err => {
            console.error("Error syncing cart to Firestore:", err);
            handleFirestoreError(err, OperationType.WRITE, `users/${fbUser.uid}/cart/current`);
          });
        } else {
          setDoc(cartRef, { items: [] }).catch(() => {});
        }
      }
    }
  }, [cart, fbUser]);
  const [activeCategory, setActiveCategory] = useState<string | 'All'>('All');
  const [showAllCategoriesGrid, setShowAllCategoriesGrid] = useState(false);
  const [activeSubCategoryGroup, setActiveSubCategoryGroup] = useState<string | null>(null);
  const [activeSubCategories, setActiveSubCategories] = useState<string[]>([]);
  const [activeSubSubCategory, setActiveSubSubCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [selectedSearchDates, setSelectedSearchDates] = useState<string[]>([]);

  const handleSelectedSearchDatesChange = useCallback((dates: string[]) => {
    setSelectedSearchDates(dates);
    setEventDate(dates[0] || '');
  }, []);
  const [bookingVendor, setBookingVendor] = useState<Vendor | null>(null);
  const [bookingOpenCount, setBookingOpenCount] = useState(0);
  const [initialBookingDetails, setInitialBookingDetails] = useState<any>(null);
  const [quickViewVendor, setQuickViewVendor] = useState<Vendor | null>(null);
  const [quickViewOpenCount, setQuickViewOpenCount] = useState(0);

  const handleOpenBooking = (v: Vendor | null, clearQuickView = false) => {
    if (clearQuickView) {
      setQuickViewVendor(null);
    }
    if (v) {
      setBookingOpenCount(c => c + 1);
    }
    setBookingVendor(v);
  };

  const handleViewVendor = (v: Vendor | null) => {
    if (v) {
      trackFunnelStep.viewVendor(v.id, v.name, v.category);
      setQuickViewOpenCount(c => c + 1);
    }
    setIsBookingModalSuccess(false);
    setBookingVendor(null);
    setInitialBookingDetails(null);
    setQuickViewVendor(v);
  };
  const [chatVendor, setChatVendor] = useState<Vendor | null>(null);
  const [chatConversationId, setChatConversationId] = useState<string | undefined>(undefined);
  const [chatThreadMessages, setChatThreadMessages] = useState<Message[]>([]);
  const [isAdminChatOpen, setIsAdminChatOpen] = useState(false);
  const [isPortalChatActive, setIsPortalChatActive] = useState(false);
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
  const [isBookingModalSuccess, setIsBookingModalSuccess] = useState(false);

  const normalizeDateKey = useCallback((rawDate: string): string => {
    if (!rawDate || typeof rawDate !== 'string') return '';
    const trimmed = rawDate.trim();
    const datePart = trimmed.includes('T') ? trimmed.split('T')[0] : trimmed;
    const parts = datePart.split('-');
    if (parts.length === 3) {
      const y = parts[0];
      const m = parts[1].padStart(2, '0');
      const d = parts[2].padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return datePart;
  }, []);

  const isVendorAvailableForSearchDates = useCallback((vendor: Vendor, dates: string[]): boolean => {
    if (!dates || dates.length === 0) return true;
    const normalizedTargetDates = dates.map(normalizeDateKey).filter(Boolean);
    if (normalizedTargetDates.length === 0) return true;

    const blockedSet = new Set<string>();

    // 1. Vendor's explicit unavailableDates array
    (vendor.unavailableDates || []).forEach(d => {
      const norm = normalizeDateKey(d);
      if (norm) blockedSet.add(norm);
    });

    // 2. Vendor's synced Google Calendar events (googleEvents)
    if (Array.isArray(vendor.googleEvents)) {
      vendor.googleEvents.forEach((ev: any) => {
        if (!ev?.start) return;
        const startNorm = normalizeDateKey(ev.start);
        const endNorm = ev.end ? normalizeDateKey(ev.end) : startNorm;
        if (!startNorm) return;
        if (!endNorm || endNorm <= startNorm) {
          blockedSet.add(startNorm);
        } else {
          // For multi-day events or exclusive end dates in Google Calendar
          const startParts = startNorm.split('-').map(Number);
          const endParts = endNorm.split('-').map(Number);
          const cur = new Date(startParts[0], startParts[1] - 1, startParts[2]);
          const endD = new Date(endParts[0], endParts[1] - 1, endParts[2]);
          const isAllDayExclusive = !ev.end.includes('T') && endNorm > startNorm;
          let steps = 0;
          while ((isAllDayExclusive ? cur < endD : cur <= endD) && steps < 60) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const day = String(cur.getDate()).padStart(2, '0');
            blockedSet.add(`${y}-${m}-${day}`);
            cur.setDate(cur.getDate() + 1);
            steps++;
          }
        }
      });
    }

    // 3. Active/Confirmed Bookings for this vendor
    bookings.forEach(b => {
      if (
        b.vendorId === vendor.id &&
        b.date &&
        (b.status as string) !== 'declined' &&
        (b.status as string) !== 'cancelled' &&
        (b.status as string) !== 'rejected'
      ) {
        const norm = normalizeDateKey(b.date);
        if (norm) blockedSet.add(norm);
      }
    });

    // Exclude vendor if ANY selected date in the search calendar is marked unavailable
    return normalizedTargetDates.every(d => !blockedSet.has(d));
  }, [bookings, normalizeDateKey]);

  const countAvailableVendorsForDate = useCallback((dateStr: string): number => {
    return vendors.filter(v => isVendorAvailableForSearchDates(v, [dateStr])).length;
  }, [vendors, isVendorAvailableForSearchDates]);

  const filteredVendors = useMemo(() => {
    return vendors.filter(vendor => {
      if (selectedSearchDates.length > 0 && !isVendorAvailableForSearchDates(vendor, selectedSearchDates)) {
        return false;
      }
      if (eventDate && !isVendorAvailableForSearchDates(vendor, [eventDate])) {
        return false;
      }
      const matchesCategory = activeCategory === 'All' || showAllCategoriesGrid || vendor.category === activeCategory;
      const matchesSearch = vendor.name.toLowerCase().includes(searchTerm.toLowerCase()) || vendor.location.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSubCategories = activeSubSubCategory && activeSubSubCategory !== '__ALL__'
        ? vendor.subCategories?.includes(activeSubSubCategory)
        : (activeSubCategoryGroup && activeSubCategoryGroup !== '__ALL__'
            ? (categorySubCategories[activeCategory]?.[activeSubCategoryGroup] || []).some(sub => vendor.subCategories?.includes(sub))
            : (activeSubCategories.length === 0 || activeSubCategories.some(sub => vendor.subCategories?.includes(sub))));
      return matchesCategory && matchesSearch && matchesSubCategories;
    }).sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return a.name.localeCompare(b.name);
    });
  }, [vendors, activeCategory, showAllCategoriesGrid, searchTerm, eventDate, selectedSearchDates, isVendorAvailableForSearchDates, activeSubCategories, activeSubCategoryGroup, activeSubSubCategory, categorySubCategories]);

  useEffect(() => {
    setActiveSubCategories(prev => (prev.length === 0 ? prev : []));
    setActiveSubCategoryGroup(null);
    setActiveSubSubCategory(null);
    setShowAllCategoriesGrid(false);
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

  useEffect(() => {
    if (view === 'marketplace') setActiveBottomTab('home');
    else if (view === 'portal') {
      if (portalTab === 'client') {
        if (['plan', 'events', 'chats', 'profile'].includes(portalInitialTab)) {
          setActiveBottomTab(portalInitialTab === 'chats' ? 'chat' : portalInitialTab);
        } else {
          setActiveBottomTab('home');
        }
      } else if (portalTab === 'vendor') {
        if (['bookings', 'calendar', 'messages', 'profile', 'overview'].includes(portalInitialTab)) {
          if (portalInitialTab === 'messages') {
            setActiveBottomTab('chat');
          } else if (portalInitialTab === 'overview') {
            setActiveBottomTab('home');
          } else {
            setActiveBottomTab(portalInitialTab);
          }
        } else {
          setActiveBottomTab('home');
        }
      }
    }
  }, [view, portalTab, portalInitialTab]);

  const handleBottomNav = (tab: string) => {
    setActiveBottomTab(tab);
    if (isVendorView && isActuallyVendor) {
      setPortalTab('vendor');
      if (tab === 'home') {
        setPortalInitialTab('overview');
      } else if (tab === 'bookings') {
        setPortalInitialTab('bookings');
      } else if (tab === 'calendar') {
        setPortalInitialTab('calendar');
      } else if (tab === 'chat') {
        setPortalInitialTab('messages');
      } else if (tab === 'profile') {
        setPortalInitialTab('profile');
      }
      setView('portal');
    } else {
      if (tab === 'home') {
        setView('marketplace');
      } else {
        setPortalTab('client');
        if (tab === 'plan') {
          setPortalInitialTab('plan');
        } else if (tab === 'events') {
          setPortalInitialTab('events');
        } else if (tab === 'chat') {
          setPortalInitialTab('chats');
        } else if (tab === 'profile') {
          setPortalInitialTab('profile');
        }
        setView('portal');
      }
    }
  };

  const handleSignOut = async () => {
    try {
      try {
        localStorage.removeItem('simcha_user_role');
      } catch (e) {}
      setNotification(null);
      await signOut(auth);
      setCart([]);
      setUserRole(null);
      setUserDocData(null);
      setIsRoleLoading(false);
      setCurrentUserVendorId(null);
      setView('marketplace');
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
    const cleanEmail = email.trim().toLowerCase();
    const foundUser = users.find(
      u => (u.username || (u as any).email || '').toLowerCase() === cleanEmail
    );
    if (foundUser) return foundUser.id;

    const matchingBooking = bookings.find(
      b => b.contactEmail?.toLowerCase() === cleanEmail && (b.userId || b.clientId)
    );
    if (matchingBooking) return (matchingBooking.userId || matchingBooking.clientId)!;

    const vendorIds = new Set(vendors.map(v => v.id));
    if (currentUserVendorId) vendorIds.add(currentUserVendorId);

    const msgFromClient = messages.find(
      m =>
        m.clientEmail?.toLowerCase() === cleanEmail &&
        m.senderId &&
        m.senderId !== 'admin' &&
        !vendorIds.has(m.senderId)
    );
    if (msgFromClient) return msgFromClient.senderId;

    const msgToClient = messages.find(
      m =>
        m.clientEmail?.toLowerCase() === cleanEmail &&
        m.receiverId &&
        m.receiverId !== 'admin' &&
        m.receiverId !== 'client_legacy' &&
        !vendorIds.has(m.receiverId)
    );
    if (msgToClient) return msgToClient.receiverId;

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

  const isBookingSubmitInFlightRef = useRef(false);

  const handleProcessCart = async () => {
    if (!fbUser || isBookingSubmitInFlightRef.current || cart.length === 0) return;
    isBookingSubmitInFlightRef.current = true;
    try {
      const clientPhoto = currentAuthenticatedUser.photoURL || fbUser.photoURL || '';
      const nowIso = new Date().toISOString();

      // Deduplicate cart items by vendor.id + date so we never send multiple requests for the same event
      const uniqueCartMap = new Map<string, CartItem>();
      for (const item of cart) {
        uniqueCartMap.set(`${item.vendor.id}_${item.date}`, item);
      }
      const uniqueCartItems = Array.from(uniqueCartMap.values());

      const createdBookings: Booking[] = [];
      for (let i = 0; i < uniqueCartItems.length; i++) {
        const item = uniqueCartItems[i];
        const safeDate = (item.date || new Date().toLocaleDateString('en-CA')).replace(/[^a-zA-Z0-9_-]/g, '-');
        const deterministicId = `booking_${fbUser.uid}_${item.vendor.id}_${safeDate}`;
        // Slight millisecond offset per item so newest order is deterministic
        const itemCreatedAt = new Date(Date.now() + i).toISOString();
        const bPayload = {
          userId: fbUser.uid,
          clientId: fbUser.uid,
          vendorId: item.vendor.id,
          clientName: item.clientName || currentAuthenticatedUser.name || '',
          clientPhotoURL: clientPhoto,
          eventName: item.eventName || 'Simcha Celebration',
          date: item.date,
          status: 'pending' as const,
          paymentStatus: 'pending' as const,
          amount: item.amount,
          contactEmail: item.contactEmail || currentAuthenticatedUser.username || fbUser.email || '',
          selectedServices: item.selectedServices || [],
          eventLocation: item.eventLocation || '',
          eventTime: item.eventTime || '',
          notes: item.notes || '',
          isOffer: !!item.isOffer || !!item.notes?.includes('OFFERED PRICE:'),
          offeredPrice: item.offeredPrice,
          createdAt: itemCreatedAt || nowIso
        };

        await setDoc(doc(db, 'bookings', deterministicId), clean(bPayload));
        createdBookings.push({ id: deterministicId, ...bPayload });
        await sendBookingConfirmation(bPayload);
      }

      if (createdBookings.length > 0) {
        setBookings(prev => {
          const merged = [...createdBookings.reverse(), ...prev];
          const seen = new Set<string>();
          return merged.filter(b => {
            const key = `${b.vendorId}_${b.date}_${(b.userId || b.clientId || b.contactEmail || '').toLowerCase()}`;
            if (seen.has(b.id) || seen.has(key)) return false;
            seen.add(b.id);
            seen.add(key);
            return true;
          });
        });
        const totalAmt = uniqueCartItems.reduce((acc, curr) => acc + curr.amount, 0);
        trackFunnelStep.submitBookingRequest(uniqueCartItems.length, totalAmt);
      }

      setCart([]);
      await deleteDoc(doc(db, 'users', fbUser.uid, 'cart', 'current')).catch(() => {});
      setPortalInitialTab('events');
      setActiveBottomTab('events');
      setShowPriorityHoldPopup(true);
      showNotification('Requests sent!');
    } catch (err) {
      console.error("Error processing cart:", err);
    } finally {
      isBookingSubmitInFlightRef.current = false;
    }
  };

  const handleConfirmBooking = async (d: any) => {
    if (!bookingVendor || isBookingSubmitInFlightRef.current) return;
    isBookingSubmitInFlightRef.current = true;

    try {
      trackFunnelStep.addToPlan(bookingVendor.id, bookingVendor.name, bookingVendor.category, d.totalAmount);

      const bookingDate = d.date || eventDate || new Date().toLocaleDateString('en-CA');
      const finalClientName = d.clientName || currentAuthenticatedUser.name || '';
      const finalContactEmail = d.contactEmail || currentAuthenticatedUser.username || fbUser?.email || '';
      const clientPhoto = currentAuthenticatedUser.photoURL || fbUser?.photoURL || '';
      const clientUid = fbUser?.uid || currentAuthenticatedUser.id || 'anonymous';

      if (d.isDirectBook) {
        const safeDate = bookingDate.replace(/[^a-zA-Z0-9_-]/g, '-');
        const deterministicBookingId = `booking_${clientUid}_${bookingVendor.id}_${safeDate}`;
        const newBooking = {
          userId: clientUid,
          clientId: clientUid,
          vendorId: bookingVendor.id,
          clientName: finalClientName,
          clientPhotoURL: clientPhoto,
          eventName: d.eventName,
          date: bookingDate,
          status: 'pending' as const,
          paymentStatus: 'pending' as const,
          amount: d.totalAmount,
          contactEmail: finalContactEmail,
          selectedServices: d.selectedServices || [],
          eventLocation: d.eventLocation || '',
          eventTime: d.eventTime || '',
          notes: d.isOffer && d.offeredPrice && !d.notes?.includes('OFFERED PRICE:')
            ? `OFFERED PRICE: $${d.offeredPrice}. ${d.notes || ''}`.trim()
            : (d.notes || ''),
          isOffer: !!d.isOffer,
          offeredPrice: d.offeredPrice,
          createdAt: new Date().toISOString()
        };

        try {
          await setDoc(doc(db, 'bookings', deterministicBookingId), clean(newBooking));
        } catch (dbErr) {
          console.warn("Could not save booking to database (possibly offline), continuing flow:", dbErr);
        }

        const savedBookingObj: Booking = { id: deterministicBookingId, ...newBooking };
        // Immediately place at the very top of bookings state & deduplicate
        setBookings(prev => {
          const filtered = prev.filter(
            b =>
              b.id !== deterministicBookingId &&
              !(
                b.vendorId === bookingVendor.id &&
                b.date === bookingDate &&
                (b.userId === clientUid || b.clientId === clientUid || b.contactEmail?.toLowerCase() === finalContactEmail.toLowerCase())
              )
          );
          return [savedBookingObj, ...filtered];
        });

        // IMPORTANT: Book Now must NEVER show up in Plan (cart). If this vendor+date was in Plan, remove it.
        setCart(prev => prev.filter(item => !(item.vendor.id === bookingVendor.id && item.date === bookingDate)));

        await sendBookingConfirmation(newBooking);

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
      } else {
        // Add to Plan ONLY (vendor does not receive until client clicks "Send All Booking Requests" in Plan)
        const newCartItem: CartItem = {
          vendor: bookingVendor,
          date: bookingDate,
          notes: d.notes,
          clientName: finalClientName,
          eventName: d.eventName,
          eventLocation: d.eventLocation,
          eventTime: d.eventTime,
          contactEmail: finalContactEmail,
          selectedServices: d.selectedServices,
          amount: d.totalAmount,
          isOffer: !!d.isOffer,
          offeredPrice: d.offeredPrice
        };

        setCart(prev => {
          const existingIdx = prev.findIndex(item => item.vendor.id === bookingVendor.id && item.date === bookingDate);
          if (existingIdx !== -1) {
            const next = [...prev];
            next[existingIdx] = newCartItem;
            return next;
          }
          return [newCartItem, ...prev];
        });

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
        setPlanConfirmation({
          show: true,
          vendorName: bookingVendor.name
        });
      }
    } catch (err) {
      console.error("Error confirming booking/plan:", err);
      showNotification("Error processing request. Please try again.", "error");
    } finally {
      isBookingSubmitInFlightRef.current = false;
    }
  };

  const handleGoToPlan = () => {
    setPlanConfirmation(null);
    setQuickViewVendor(null);
    setBookingVendor(null);
    setPortalTab('client');
    setPortalInitialTab('plan');
    setActiveBottomTab('plan');
    setView('portal');
  };

  const handleGoToEvents = () => {
    setPlanConfirmation(null);
    setQuickViewVendor(null);
    setBookingVendor(null);
    setPortalTab('client');
    setPortalInitialTab('events');
    setActiveBottomTab('events');
    setView('portal');
  };

  const handleAddToPlan = (vendor: Vendor) => {
    if (!vendor) return;
    const isAlreadyInPlan = cart.some(item => item.vendor.id === vendor.id);
    if (isAlreadyInPlan) {
      showNotification(`${vendor.name} is already in your plan.`, 'info');
      return;
    }

    try {
      const defaultServices: SelectedService[] = vendor.services && vendor.services.length > 0
        ? [{
            id: vendor.services[0].id,
            name: vendor.services[0].name,
            price: vendor.services[0].price,
            quantity: 1,
            unit: vendor.services[0].unit
          }]
        : [];
      const totalAmount = defaultServices.length > 0 
        ? defaultServices[0].price 
        : (vendor.priceStart || 0);

      const bookingDate = eventDate || new Date().toLocaleDateString('en-CA');
      const finalClientName = currentAuthenticatedUser.name || '';
      const finalContactEmail = currentAuthenticatedUser.username || '';

      const newPlanItem: CartItem = {
        vendor,
        date: bookingDate,
        notes: '',
        clientName: finalClientName,
        eventName: 'Simcha Celebration',
        eventLocation: vendor.location || '',
        eventTime: '18:00',
        contactEmail: finalContactEmail,
        selectedServices: defaultServices,
        amount: totalAmount
      };

      trackFunnelStep.addToPlan(vendor.id, vendor.name, vendor.category, totalAmount);
      setCart(prev => [...prev, newPlanItem]);

      setPlanConfirmation({
        show: true,
        vendorName: vendor.name
      });
    } catch (err: any) {
      console.error("Error adding vendor to plan:", err);
      showNotification("Failed to add to plan. Please try again.", 'error');
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
    if (userRole !== 'admin') return;
    
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

  const handleAdminUpdateSearchCalendarSettings = async (settings: { maxSearchDates: number; searchDateResetHours: number; resetAllNow?: boolean }) => {
    try {
      const payload: Record<string, any> = {
        maxSearchDates: Math.max(1, Number(settings.maxSearchDates) || 4),
        searchDateResetHours: Math.max(0, Number(settings.searchDateResetHours) ?? 24)
      };
      if (settings.resetAllNow) {
        payload.searchDateResetNonce = Date.now();
      }
      await setDoc(doc(db, 'metadata', 'app_config'), payload, { merge: true });
      setMaxSearchDates(payload.maxSearchDates);
      setSearchDateResetHours(payload.searchDateResetHours);
      if (payload.searchDateResetNonce) {
        setSearchDateResetNonce(payload.searchDateResetNonce);
      }
      showNotification(
        settings.resetAllNow
          ? 'Search calendar rules saved and 24h cooldown reset for all users!'
          : 'Search calendar rules updated!'
      );
    } catch (err) {
      console.error("Error updating search calendar settings:", err);
      showNotification('Failed to update search calendar settings.', 'error');
    }
  };

  const handleSendMessage = async (payload: Partial<Message>) => {
    try {
      const currentUid = fbUser?.uid || '';
      const activeVendorId = currentUserVendorId || vendorProfileId || '';

      const isSendingFromAdminPanel =
        payload.senderId === 'admin' ||
        (view === 'admin' && payload.receiverId !== 'admin');

      const isSendingFromAskButton =
        !isSendingFromAdminPanel &&
        (Boolean(payload.isAdminInquiry) || payload.receiverId === 'admin' || isAdminChatOpen);

      // Only send as a vendor when actively inside the Vendor Portal
      const isSendingFromVendorPortal =
        !isSendingFromAdminPanel &&
        !isSendingFromAskButton &&
        view === 'portal' &&
        portalTab === 'vendor' &&
        !!activeVendorId;

      let senderId = payload.senderId || currentUid;
      let receiverId = payload.receiverId || '';
      let effectiveSenderRole: 'client' | 'vendor' | 'admin' = 'client';

      if (isSendingFromAdminPanel) {
        senderId = 'admin';
        effectiveSenderRole = 'admin';
        if (!receiverId && payload.clientEmail) {
          receiverId = getClientUidSync(payload.clientEmail) || 'client_legacy';
        }
      } else if (isSendingFromAskButton) {
        senderId = currentUid;
        receiverId = 'admin';
        effectiveSenderRole = 'client';
      } else if (isSendingFromVendorPortal) {
        senderId = activeVendorId;
        effectiveSenderRole = 'vendor';
        if ((!receiverId || receiverId === 'client_legacy') && payload.clientEmail) {
          const resolvedUid = getClientUidSync(payload.clientEmail);
          if (resolvedUid) receiverId = resolvedUid;
        }
      } else {
        // Sending from Client Portal or Marketplace always sends from the user's client account
        senderId = currentUid;
        effectiveSenderRole = 'client';
      }

      if (payload.isAdminInquiry || payload.receiverId === 'admin' || isSendingFromAskButton) {
        if (senderId !== 'admin') {
          receiverId = 'admin';
        } else if ((!receiverId || receiverId === 'admin' || receiverId === 'client_legacy') && payload.clientEmail) {
          receiverId = getClientUidSync(payload.clientEmail) || receiverId || 'client_legacy';
        }
      }

      const conversationId = [senderId, receiverId].sort().join('_');

      let resolvedVendorEmail = payload.vendorEmail || '';
      if (effectiveSenderRole === 'vendor') {
        const myVendor = vendors.find(v => v.id === senderId);
        resolvedVendorEmail = myVendor?.contactEmail || fbUser?.email || '';
      } else {
        const targetVendor = vendors.find(v => v.id === senderId || v.id === receiverId);
        if (targetVendor) {
          resolvedVendorEmail = targetVendor.contactEmail || '';
        }
      }

      const cleanPayloadEmail =
        payload.clientEmail && payload.clientEmail.includes('@')
          ? payload.clientEmail.trim()
          : '';
      const resolvedClientEmail =
        effectiveSenderRole === 'client'
          ? (cleanPayloadEmail || fbUser?.email || currentAuthenticatedUser.username || '')
          : (cleanPayloadEmail || '');

      const cleanPayloadName = (payload.clientName || '').trim();
      const resolvedClientName =
        effectiveSenderRole === 'client'
          ? (cleanPayloadName && cleanPayloadName !== 'Guest' && cleanPayloadName !== 'Client'
              ? cleanPayloadName
              : (currentAuthenticatedUser.name || fbUser?.displayName || fbUser?.email?.split('@')[0] || 'Client'))
          : (cleanPayloadName || 'Client');

      const msgData = {
        ...payload,
        clientEmail: resolvedClientEmail,
        clientName: resolvedClientName,
        senderId, // ensure locked
        receiverId, // ensure locked
        conversationId, // ensure locked
        participants: [senderId, receiverId],
        vendorEmail: resolvedVendorEmail,
        senderRole: effectiveSenderRole,
      };

      await sendNewMessage(msgData);
      
      if (!payload.receiverId?.startsWith('admin') && !isAdminChatOpen) {
          showNotification('Message sent!', 'success');
      }
    } catch (err) {
      console.error("Error sending message:", err);
    }
  };

  const [authStep, setAuthStep] = useState<'welcome' | 'login' | 'verification' | 'forgot-password' | 'reset-success'>('welcome');
  const [isAuthSignUpOpen, setIsAuthSignUpOpen] = useState(false);
  const [authSignInOpenCount, setAuthSignInOpenCount] = useState(0);
  const authSignInOpenCountRef = useRef(0);
  const [authTargetRole] = useState<'client' | 'vendor' | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authPhoto, setAuthPhoto] = useState<File | null>(null);
  const [authError, setAuthError] = useState('');
  const [unverifiedEmail, setUnverifiedEmail] = useState('');

  const handleOpenAuthSignIn = useCallback(() => {
    setAuthError('');
    setIsAuthSignUpOpen(false);
    setAuthSignInOpenCount(prev => {
      const next = prev + 1;
      authSignInOpenCountRef.current = next;
      return next;
    });
    setAuthStep('login');
  }, []);

  const handleCloseAuthSignIn = useCallback((closingOpenId: number) => {
    if (authSignInOpenCountRef.current !== closingOpenId) return;
    setIsAuthSignUpOpen(false);
    setAuthError('');
    setAuthStep(prev => (prev === 'verification' || prev === 'reset-success' ? prev : 'welcome'));
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
  }, []);

  const completeAuthenticatedSignIn = async (user: FirebaseUser, fallbackEmail?: string) => {
    const rawEmail = (user.email || fallbackEmail || '').trim();
    const lowerEmail = rawEmail.toLowerCase();
    const isKnownAdmin = isWhitelistedAdminEmail(lowerEmail);
    const isBlockedFromVendor = isNonVendorEmail(lowerEmail);

    let matchedVendor: Vendor | null = isBlockedFromVendor
      ? null
      : (vendors.find(
          v =>
            v.id === user.uid ||
            v.username?.toLowerCase() === lowerEmail ||
            v.contactEmail?.toLowerCase() === lowerEmail ||
            (lowerEmail === 'shimpose@gmail.com' &&
              (v.contactEmail?.toLowerCase() === 'bookingsimcha@gmail.com' ||
                v.username?.toLowerCase() === 'bookingsimcha@gmail.com'))
        ) || null);

    let isVendor = isBlockedFromVendor
      ? false
      : (Boolean(matchedVendor) ||
        (lowerEmail ? INITIAL_VENDORS.some(v => v.username?.toLowerCase() === lowerEmail) : false));

    // Only wait for remote vendor lookup before sliding if the email is unverified and not already known as admin/vendor
    if (!user.emailVerified && !isVendor && !isKnownAdmin && !isBlockedFromVendor) {
      try {
        const directVendorDoc = await getDocSafe(doc(db, 'vendors', user.uid)).catch(() => null);
        if (directVendorDoc && directVendorDoc.exists()) {
          isVendor = true;
          matchedVendor = { id: directVendorDoc.id, ...directVendorDoc.data() } as Vendor;
        } else if (rawEmail) {
          const q = query(collection(db, 'vendors'), where('contactEmail', '==', rawEmail));
          const qSnap = await getDocsSafe(q);
          if (!qSnap.empty) {
            isVendor = true;
            matchedVendor = { id: qSnap.docs[0].id, ...qSnap.docs[0].data() } as Vendor;
          } else {
            const q2 = query(collection(db, 'vendors'), where('username', '==', rawEmail));
            const qSnap2 = await getDocsSafe(q2);
            if (!qSnap2.empty) {
              isVendor = true;
              matchedVendor = { id: qSnap2.docs[0].id, ...qSnap2.docs[0].data() } as Vendor;
            }
          }
        }
      } catch (err) {}

      if (!isVendor) {
        isInteractiveSignInRef.current = false;
        setIsAuthLoading(false);
        setUnverifiedEmail(rawEmail || authEmail);
        setIsAuthSignUpOpen(false);
        setAuthStep('verification');
        await signOut(auth);
        return;
      }
    }

    // Resolve initial role and appearance synchronously so the slide-up begins immediately while the Sign In button stays loading
    let cachedUidTheme: string | null = null;
    let cachedRole: string | null = null;
    try {
      cachedUidTheme = localStorage.getItem(`simcha_theme_mode_${user.uid}`) || localStorage.getItem('simcha_theme_mode');
      if (localStorage.getItem('simcha_active_uid') === user.uid) {
        cachedRole = localStorage.getItem('simcha_user_role');
      }
    } catch (e) {}

    let initialRole: 'admin' | 'vendor' | 'client' = 'client';
    if (isKnownAdmin) {
      initialRole = 'admin';
    } else if (CLIENT_OVERRIDE_EMAILS.includes(lowerEmail)) {
      initialRole = 'client';
    } else if (isVendor || matchedVendor) {
      initialRole = 'vendor';
    } else if (cachedRole === 'admin' || cachedRole === 'vendor' || cachedRole === 'client') {
      initialRole = cachedRole;
    }

    let resolvedTheme: 'dark' | 'light' = cachedUidTheme === 'light' ? 'light' : 'dark';
    let resolvedVendorId: string | null = matchedVendor?.id || null;

    applyThemeDomClasses(resolvedTheme);
    setThemeMode(resolvedTheme);
    try {
      localStorage.setItem('simcha_active_uid', user.uid);
      localStorage.setItem('simcha_theme_mode', resolvedTheme);
      localStorage.setItem(`simcha_theme_mode_${user.uid}`, resolvedTheme);
      localStorage.setItem('simcha_user_role', initialRole);
    } catch (e) {}

    // Start the slide-up immediately while keeping isAuthLoading=true so the button keeps spinning during the slide
    setNotification(null);
    setUserDocData({
      role: initialRole,
      isAdmin: initialRole === 'admin',
      isVendor: initialRole === 'vendor',
      email: lowerEmail,
      themeMode: resolvedTheme,
    });
    setCurrentUserVendorId(resolvedVendorId);
    setUserRole(initialRole);
    setView('marketplace');
    setIsRoleLoading(false);
    setIsInitializing(false);
    setFbUser(user);
    startSignInPageFlip();

    // Verify full Firestore role & profile in parallel without blocking or lagging the slide animation
    void (async () => {
      try {
        const [initialUserDoc, secureRole, directVendorDoc] = await Promise.all([
          getDocSafe(doc(db, 'users', user.uid)).catch(() => null),
          fetchUserRole(user).catch(() => initialRole),
          !matchedVendor ? getDocSafe(doc(db, 'vendors', user.uid)).catch(() => null) : Promise.resolve(null),
        ]);

        if (!matchedVendor && !isBlockedFromVendor && directVendorDoc && directVendorDoc.exists()) {
          isVendor = true;
          matchedVendor = { id: directVendorDoc.id, ...directVendorDoc.data() } as Vendor;
        }

        let finalRole: 'admin' | 'vendor' | 'client' = secureRole;
        if (isKnownAdmin) {
          finalRole = 'admin';
        } else if (CLIENT_OVERRIDE_EMAILS.includes(lowerEmail)) {
          finalRole = 'client';
        } else if (!isBlockedFromVendor && (isVendor || matchedVendor)) {
          finalRole = 'vendor';
        }

        let updatedTheme = resolvedTheme;
        let updatedVendorId = isBlockedFromVendor ? null : (matchedVendor?.id || resolvedVendorId);

        if (initialUserDoc && initialUserDoc.exists()) {
          const data = initialUserDoc.data();
          if (data.themeMode === 'light' || data.themeMode === 'dark') {
            updatedTheme = data.themeMode;
          }
          if (isKnownAdmin) {
            finalRole = 'admin';
          } else if (!CLIENT_OVERRIDE_EMAILS.includes(lowerEmail)) {
            const docRole = typeof data.role === 'string' ? data.role.toLowerCase() : '';
            if (docRole === 'admin' || data.isAdmin === true) finalRole = 'admin';
            else if (!isBlockedFromVendor && (docRole === 'vendor' || data.isVendor === true || isVendor)) finalRole = 'vendor';
          }
          updatedVendorId = isBlockedFromVendor ? null : (matchedVendor?.id || data.vendorId || null);
          setUserDocData({
            ...data,
            role: finalRole,
            isAdmin: finalRole === 'admin',
            isVendor: isBlockedFromVendor ? false : finalRole === 'vendor',
            vendorId: updatedVendorId || undefined,
            themeMode: updatedTheme,
          });
        }

        if (isBlockedFromVendor) {
          setIsVendorView(false);
          setPortalTab('client');
        }
        if (updatedTheme !== resolvedTheme) {
          applyThemeDomClasses(updatedTheme);
          setThemeMode(updatedTheme);
        }
        if (updatedVendorId !== resolvedVendorId) {
          setCurrentUserVendorId(updatedVendorId);
        }
        if (finalRole !== initialRole) {
          setUserRole(finalRole);
        }

        try {
          localStorage.setItem('simcha_theme_mode', updatedTheme);
          localStorage.setItem(`simcha_theme_mode_${user.uid}`, updatedTheme);
          localStorage.setItem('simcha_user_role', finalRole);
        } catch (e) {}

        await syncUserProfile(user).catch(() => {});
      } catch (e) {}
    })();
  };

  const handleAuthLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const botEval = botDetectionService.evaluateSignInAttempt(e);
    if (!botEval.allowed) {
      void botDetectionService.flagBlockedAttempt(botEval, authEmail, 'sign-in');
      setIsAuthLoading(false);
      setAuthError('Automated or non-human activity detected. Sign-in request blocked and flagged.');
      return;
    }
    setIsAuthLoading(true);
    setAuthError('');
    setNotification(null);
    isInteractiveSignInRef.current = true;
    try {
      const userCredential = await signInWithEmailAndPassword(auth, authEmail, authPassword);
      await completeAuthenticatedSignIn(userCredential.user, authEmail);
    } catch (err: any) {
      isInteractiveSignInRef.current = false;
      setIsAuthLoading(false);
      setAuthError('Password or email incorrect, or account requires verification.');
    }
  };

  const handleAuthGoogleSignIn = async () => {
    setIsAuthLoading(true);
    setAuthError('');
    setNotification(null);
    isInteractiveSignInRef.current = true;
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      await completeAuthenticatedSignIn(userCredential.user);
    } catch (err: any) {
      isInteractiveSignInRef.current = false;
      setIsAuthLoading(false);
      setAuthError(err.message || 'An error occurred during Google Sign-In.');
    }
  };

  const handleAuthRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const botEval = botDetectionService.evaluateSignInAttempt(e);
    if (!botEval.allowed) {
      void botDetectionService.flagBlockedAttempt(botEval, authEmail, 'sign-up');
      setIsAuthLoading(false);
      setAuthError('Automated or non-human activity detected. Registration request blocked and flagged.');
      return;
    }
    if (authPassword !== authConfirmPassword) {
      setAuthError('Passwords do not match');
      return;
    }
    setIsAuthLoading(true);
    setAuthError('');
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      const user = userCredential.user;
      
      let photoURL = '';
      let photoStoragePath = '';

      if (authPhoto) {
        try {
          const storagePath = `user_uploads/${user.uid}/profile_photo_${Date.now()}`;
          const url = await uploadFileRobustly(authPhoto, storagePath);
          photoURL = url;
          photoStoragePath = storagePath;
        } catch (uploadErr) {
          console.error("Registration photo upload failed:", uploadErr);
        }
      }

      const safeAuthPhotoURL = (photoURL && photoURL.length <= 2000 && !photoURL.startsWith('data:')) ? photoURL : undefined;
      try {
        await updateProfile(user, {
          displayName: authFullName,
          photoURL: safeAuthPhotoURL
        });
      } catch (authErr: any) {
        console.warn("Firebase Auth updateProfile non-fatal error during registration:", authErr);
      }

      const chosenThemeMode = themeMode;
      try {
        localStorage.setItem('simcha_active_uid', user.uid);
        localStorage.setItem('simcha_theme_mode', chosenThemeMode);
        localStorage.setItem(`simcha_theme_mode_${user.uid}`, chosenThemeMode);
      } catch (e) {}
      await syncUserProfile(user, { fullName: authFullName, photoURL, photoStoragePath, themeMode: chosenThemeMode });

      try {
        await sendEmailVerification(user);
      } catch (fbVerifErr: any) {
        console.warn("Firebase Auth SDK sendEmailVerification failed or rate-limited during registration:", fbVerifErr?.message || fbVerifErr);
      }

      try {
        const apiUrl = `${window.location.protocol}//${window.location.host}/api/auth/send-verification`;
        await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: authEmail, name: authFullName })
        });
      } catch (emailErr) {
        console.error("Failed to trigger custom verification email:", emailErr);
      }

      setUnverifiedEmail(authEmail);
      setIsAuthSignUpOpen(false);
      setAuthStep('verification');
      await signOut(auth);
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setAuthError('An account with this email already exists.');
      } else {
        setAuthError(err.message || 'An error occurred during registration.');
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleAuthResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim()) {
      setAuthError('Please enter your email address');
      return;
    }
    setIsAuthLoading(true);
    setAuthError('');
    try {
      const apiUrl = `${window.location.protocol}//${window.location.host}/api/auth/reset-password`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail })
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send reset email');
      }

      setUnverifiedEmail(authEmail);
      setIsAuthSignUpOpen(false);
      setAuthStep('reset-success');
    } catch (err: any) {
      setAuthError(err.message || 'Could not send reset link. Verify email.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleAuthResendVerification = async () => {
    if (!unverifiedEmail) {
      showNotification('No unverified email set. Please log in first.', 'info');
      return;
    }
    setIsAuthLoading(true);
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
      setIsAuthLoading(false);
    }
  };

  const renderAuthWall = () => {
    if (authStep === 'verification') {
      return (
        <main className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden" aria-label="Email Verification">
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
                onClick={handleAuthResendVerification}
                disabled={isAuthLoading}
                className="w-full bg-[#111] border border-[#D4AF37]/30 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black font-black py-4 rounded-full transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isAuthLoading ? 'animate-spin' : ''}`} /> Resend Verification Email
              </button>
              <button 
                onClick={handleOpenAuthSignIn}
                className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-full hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogIn className="w-4 h-4" /> Return to Login
              </button>
            </div>
          </div>
        </main>
      );
    }

    if (authStep === 'reset-success') {
      return (
        <main className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden" aria-label="Password Reset Confirmation">
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
              onClick={handleOpenAuthSignIn}
              className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-full hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogIn className="w-4 h-4" /> Sign In
            </button>
          </div>
        </main>
      );
    }

    return (
      <main className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden" aria-label="Sign In">
        <div className="absolute inset-0 bg-gradient-to-br from-[#D4AF37]/5 via-black to-black" aria-hidden="true"></div>

        {/* Centered Welcome Card */}
        <div className="bg-[#111] rounded-3xl p-8 md:p-12 max-w-lg w-full border border-[#D4AF37]/20 shadow-2xl relative z-10 text-center">
          <header className="text-center mb-10">
            <div className="flex items-center justify-center mx-auto mb-6"><SimchaLogo className="w-14 h-14" /></div>
            <h1 className="text-3xl font-bold font-[Cinzel] text-[#D4AF37] tracking-wider uppercase">WELCOME TO SIMCHA BOOKING</h1>
            <p className="text-[10px] text-zinc-300 uppercase tracking-[0.4em] mt-2">Professional Planning Access</p>
          </header>

          <div className="space-y-6">
            <div
              onClick={handleOpenAuthSignIn}
              className="bg-[#0d0d0d] border border-[#D4AF37]/30 rounded-2xl p-8 text-center cursor-pointer hover:border-[#D4AF37] hover:bg-black/60 hover:scale-[1.02] transition-all duration-300 shadow-xl group"
            >
              <div className="bg-[#D4AF37]/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 border border-[#D4AF37]/20 group-hover:border-[#D4AF37]/40 group-hover:bg-[#D4AF37]/20 transition-all">
                <User className="w-8 h-8 text-[#D4AF37]" />
              </div>
              <h2 className="text-lg font-bold font-[Cinzel] text-white tracking-[0.2em] uppercase mb-2 group-hover:text-[#D4AF37] transition-colors">
                SIMCHA SIGN IN
              </h2>
              <p className="text-xs text-zinc-400 font-medium">
                The perfect platform to book and manage your simcha
              </p>
            </div>
          </div>
        </div>

        {(authStep === 'login' || authStep === 'forgot-password') && (
          <AuthSignInModal
            key={`auth-signin-${authSignInOpenCount}`}
            openId={authSignInOpenCount}
            step={authStep}
            onChangeStep={(nextStep) => {
              setAuthError('');
              setAuthStep(nextStep);
            }}
            onClose={handleCloseAuthSignIn}
            isSignUpOpen={isAuthSignUpOpen}
            onOpenSignUp={() => {
              setAuthError('');
              setIsAuthSignUpOpen(true);
            }}
            onCloseSignUp={() => {
              setAuthError('');
              setIsAuthSignUpOpen(false);
            }}
            isLoading={isAuthLoading}
            email={authEmail}
            onEmailChange={setAuthEmail}
            password={authPassword}
            onPasswordChange={setAuthPassword}
            confirmPassword={authConfirmPassword}
            onConfirmPasswordChange={setAuthConfirmPassword}
            fullName={authFullName}
            onFullNameChange={setAuthFullName}
            photo={authPhoto}
            onPhotoChange={setAuthPhoto}
            themeMode={themeMode}
            onThemeModeChange={handleToggleThemeMode}
            error={authError}
            onLogin={handleAuthLogin}
            onRegister={handleAuthRegister}
            onResetPassword={handleAuthResetPassword}
            onGoogleSignIn={handleAuthGoogleSignIn}
          />
        )}
      </main>
    );
  };

  const handleUpdateProfile = async (data: { name: string, photoURL: string, photoStoragePath?: string }) => {
    if (!fbUser) return;
    try {
      const safeAuthPhotoURL = (data.photoURL && data.photoURL.length <= 2000 && !data.photoURL.startsWith('data:')) ? data.photoURL : undefined;
      try {
        await updateProfile(fbUser, {
          displayName: data.name,
          photoURL: safeAuthPhotoURL
        });
      } catch (authProfileErr: any) {
        console.warn("Firebase Auth updateProfile non-fatal warning (e.g. photo URL length):", authProfileErr);
      }

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
      <main className="min-h-screen bg-black flex flex-col items-center justify-center" aria-label="Loading Simcha Booking">
        <SimchaLogo className="w-16 h-16 animate-pulse mb-8" />
        <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
        <span className="sr-only">Loading application...</span>
      </main>
    );
  }

  const authWallOverlay = (!fbUser || isSignInFlipping) ? (
    <div
      key="simcha-auth-peel-overlay"
      className={
        isSignInFlipping
          ? "fixed inset-0 z-[300] pointer-events-none overflow-hidden transform-gpu"
          : "relative z-10 w-full min-h-screen transform-gpu"
      }
    >
      <div
        ref={peelWindowRef}
        className={
          isSignInFlipping
            ? "simcha-signin-slide-layer simcha-signin-sliding will-change-transform transform-gpu relative z-20 w-full h-full overflow-hidden rounded-b-[2.5rem] border-b-2 border-x border-[#D4AF37]/50 shadow-[0_24px_60px_rgba(0,0,0,0.85)]"
            : "simcha-signin-slide-layer will-change-transform transform-gpu w-full min-h-screen"
        }
      >
        {renderAuthWall()}
      </div>
    </div>
  ) : null;

  const currentAuthenticatedUser: UserAccount = {
    id: fbUser?.uid || '',
    name: userDocData?.name || fbUser?.displayName || fbUser?.email?.split('@')[0] || 'Guest',
    username: fbUser?.email || '',
    photoURL: userDocData?.photoURL || fbUser?.photoURL || '',
    photoStoragePath: userDocData?.photoStoragePath || ''
  };

  const renderActiveView = () => {
    if (view === 'admin') {
      if (!isAdmin && userRole !== 'admin') {
        setView('marketplace');
        return null;
      }
      return (
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0, transitionEnd: { transform: 'none' } }}
          transition={APP_SLIDE_UP_TRANSITION}
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
            messages={messages.filter(
              m =>
                m.isAdminInquiry ||
                m.senderId === 'admin' ||
                m.receiverId === 'admin' ||
                (m.participants && m.participants.includes('admin')) ||
                (m.conversationId && m.conversationId.split('_').includes('admin'))
            )}
            onSendMessage={handleSendMessage}
            showNotification={showNotification}
            onSeedTaxonomy={handleSeedTaxonomy}
            onUpdateCategoryOrder={handleAdminUpdateCategoryOrder}
            onDeleteCategory={handleAdminDeleteCategory}
            onActiveChatChange={setIsPortalChatActive}
            maxSearchDates={maxSearchDates}
            searchDateResetHours={searchDateResetHours}
            onUpdateSearchCalendarSettings={handleAdminUpdateSearchCalendarSettings}
          />
        </motion.div>
      );
    }

    if (view === 'portal' && fbUser) {
      const isVendor = isActuallyVendor;
      const effectiveVendorId = currentUserVendorId || vendorProfileId;

      if (portalTab === 'vendor' && isVendor) {
        const v = vendors.find(v => v.id === effectiveVendorId) || vendors.find(v => ownedVendorIds.includes(v.id));
        if (v) {
          const vendorIdsSet = new Set([v.id, ...ownedVendorIds].filter(Boolean));
          const vEmailLower = (v.contactEmail || v.username || '').trim().toLowerCase();
          const vendorMessages = messages.filter(m => {
            if (!m) return false;
            if (m.isAdminInquiry || m.senderId === 'admin' || m.receiverId === 'admin') return false;
            const role = (m as any).sender_role;
            if (role === 'client') {
              return (
                vendorIdsSet.has(m.receiverId) ||
                (vEmailLower && m.vendorEmail?.toLowerCase() === vEmailLower)
              );
            }
            if (role === 'vendor') {
              return (
                vendorIdsSet.has(m.senderId) ||
                (vEmailLower && m.vendorEmail?.toLowerCase() === vEmailLower)
              );
            }
            return (
              vendorIdsSet.has(m.receiverId) ||
              vendorIdsSet.has(m.senderId) ||
              (m.participants && m.participants.some(p => vendorIdsSet.has(p))) ||
              (m.conversationId && m.conversationId.split('_').some(p => vendorIdsSet.has(p))) ||
              (vEmailLower && m.vendorEmail?.toLowerCase() === vEmailLower)
            );
          });

          return (
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0, transitionEnd: { transform: 'none' } }}
              transition={APP_SLIDE_UP_TRANSITION}
              className="flex-1 bg-[#050505] flex flex-col"
            >
              <div className="flex-grow flex flex-col">
                <VendorPortal 
                  vendor={v} 
                  initialTab={portalInitialTab}
                  bookings={bookings.filter(b => vendorIdsSet.has(b.vendorId))} 
                  messages={vendorMessages} 
                  onUpdateVendor={handleUpdateVendor} 
                  onUpdateBookingStatus={handleUpdateBookingStatus} 
                  onReplyMessage={handleReplyMessage} 
                  onLogout={handleSignOut} 
                  showNotification={showNotification}
                  onSwitchToClientView={() => setView('marketplace')}
                  onActiveChatChange={setIsPortalChatActive}
                  onTabChange={tab => setPortalInitialTab(tab)}
                  themeMode={themeMode}
                  onToggleThemeMode={handleToggleThemeMode}
                />
              </div>
            </motion.div>
          );
        }
      }

      // Otherwise render client portal (strictly exclude incoming client-to-vendor inquiries meant for the user's vendor profile)
      const myBookings = bookings.filter(
        b =>
          b.userId === fbUser.uid ||
          b.clientId === fbUser.uid ||
          (b.contactEmail && fbUser.email && b.contactEmail.toLowerCase() === fbUser.email.toLowerCase())
      );
      const myVendorIdsSet = new Set(ownedVendorIds);
      const myEmailLower = (fbUser.email || '').trim().toLowerCase();
      const myMessages = messages.filter(m => {
        if (!m) return false;
        const isAdminMsg =
          m.isAdminInquiry ||
          m.senderId === 'admin' ||
          m.receiverId === 'admin' ||
          (m.participants && m.participants.includes('admin')) ||
          (m.conversationId && m.conversationId.split('_').includes('admin'));

        if (isAdminMsg) {
          return (
            m.senderId === fbUser.uid ||
            m.receiverId === fbUser.uid ||
            (m.participants && m.participants.includes(fbUser.uid)) ||
            (m.conversationId && m.conversationId.split('_').includes(fbUser.uid)) ||
            (myEmailLower && m.clientEmail?.toLowerCase() === myEmailLower)
          );
        }

        const role = (m as any).sender_role;
        const msgClientId = role === 'vendor' ? m.receiverId : (role === 'client' ? m.senderId : '');

        // Exclude incoming/outgoing messages where ANOTHER client is messaging a vendor business owned by this user
        if (role === 'client' && m.senderId && m.senderId !== fbUser.uid && (!myEmailLower || m.clientEmail?.toLowerCase() !== myEmailLower)) {
          return false;
        }
        if (role === 'vendor' && myVendorIdsSet.has(m.senderId) && m.receiverId !== fbUser.uid && (!myEmailLower || m.clientEmail?.toLowerCase() !== myEmailLower)) {
          return false;
        }

        return (
          msgClientId === fbUser.uid ||
          m.senderId === fbUser.uid ||
          m.receiverId === fbUser.uid ||
          (m.participants && m.participants.includes(fbUser.uid)) ||
          (m.conversationId && m.conversationId.split('_').includes(fbUser.uid)) ||
          (myEmailLower && m.clientEmail?.toLowerCase() === myEmailLower)
        );
      });
      return (
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0, transitionEnd: { transform: 'none' } }}
          transition={APP_SLIDE_UP_TRANSITION}
          className="flex-1 bg-[#050505] flex flex-col"
        >
          <div className="flex-grow flex flex-col">
            <ClientPortal 
              user={currentAuthenticatedUser} 
              initialTab={portalInitialTab}
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
              onMessageVendor={(v, convoId, threadMsgs) => {
                setChatConversationId(convoId);
                setChatThreadMessages(threadMsgs || []);
                setChatVendor(v);
              }}
              onOpenAdminChat={(convoId, threadMsgs) => {
                setChatConversationId(convoId);
                setChatThreadMessages(threadMsgs || []);
                setIsAdminChatOpen(true);
              }}
              onActiveChatChange={setIsPortalChatActive}
              onTabChange={tab => setPortalInitialTab(tab)}
              themeMode={themeMode}
              onToggleThemeMode={handleToggleThemeMode}
            />
          </div>
        </motion.div>
      );
    }

    if (view === 'posts') {
      return (
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0, transitionEnd: { transform: 'none' } }}
          transition={APP_SLIDE_UP_TRANSITION}
          className="min-h-screen bg-black flex flex-col"
        >
          <PostsPage posts={posts} vendors={vendors} onBack={() => setView('marketplace')} onViewVendor={navigateToVendor} />
        </motion.div>
      );
    }

    if (view === 'payment-success') {
      return (
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0, transitionEnd: { transform: 'none' } }}
          transition={APP_SLIDE_UP_TRANSITION}
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
        <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4" aria-label="Account Verification">
          <div className="max-w-md w-full bg-[#111] border border-[#D4AF37] p-8 rounded-2xl text-center shadow-2xl">
            <div className="flex justify-center mb-6">
              <CheckCircle className="w-16 h-16 text-[#D4AF37]" />
            </div>
            <h2 className="text-3xl font-bold font-[Cinzel] text-[#D4AF37] mb-4">Account Verified!</h2>
            <p className="text-zinc-300 mb-8">Your email has been successfully verified. You can now access all features of Simcha Booking.</p>
            <button 
              onClick={() => setView('marketplace')}
              className="w-full bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black py-4 rounded-full uppercase tracking-widest transition-all"
            >
              Go to Marketplace
            </button>
          </div>
        </main>
      );
    }

    return (
      <>
            
      <main 
        id="main-content" 
        ref={mainMenuUnfoldRef}
        className="flex-1 flex flex-col pb-36 md:pb-0 will-change-transform"
      >
        <section className="simcha-hero-section relative bg-black text-white z-20" aria-labelledby="hero-title">
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
            <motion.div
              className="absolute -inset-x-1 -top-1 -bottom-2 z-0 will-change-transform transform-gpu"
              style={{ y: heroBgY, scale: heroBgScale }}
            >
              {renderMedia(heroBackgroundUrl, "simcha-hero-media w-full h-full object-cover opacity-80", undefined, true, true)}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent simcha-image-fader-hero"></div>
            </motion.div>
          </div>
          <div className="relative z-10 max-w-7xl mx-auto px-4 py-[72px] md:py-32 text-center">
            <motion.h2
              id="hero-title"
              variants={HERO_TITLE_CONTAINER_VARIANTS}
              initial="hidden"
              animate={isHeroTitleHoldForSignIn ? "hidden" : "show"}
              style={{ opacity: heroTitleOpacity, scale: heroTitleScale, y: heroTitleY }}
              className="will-change-[opacity,transform] transform-gpu font-bold font-[Cinzel] mb-6 tracking-[0.015em] leading-tight text-white drop-shadow-[0_2px_10px_rgba(212,175,55,0.3)] flex flex-col items-center gap-y-2 sm:gap-y-3 md:gap-y-4"
            >
              <motion.span variants={HERO_TITLE_LINE_VARIANTS} className="simcha-hero-title-line simcha-hero-title-main block text-3xl sm:text-4xl md:text-6xl will-change-[opacity,transform] transform-gpu">Celebrate Your</motion.span>
              <motion.span variants={HERO_TITLE_LINE_VARIANTS} className="simcha-hero-title-line simcha-hero-title-gold block text-3xl sm:text-4xl md:text-6xl text-[#D4AF37] will-change-[opacity,transform] transform-gpu">Simcha.</motion.span>
              <motion.span variants={HERO_TITLE_LINE_VARIANTS} className="simcha-hero-title-line simcha-hero-title-main block text-3xl sm:text-4xl md:text-6xl will-change-[opacity,transform] transform-gpu">Book Perfection.</motion.span>
            </motion.h2>
            <p className="mb-10 text-zinc-300 text-base md:text-lg font-light max-w-2xl mx-auto leading-relaxed">From world-class kosher caterers to soulful bands, create your complete simcha in one place.</p>
            <SearchDateCalendar
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              onSearchSubmit={() => {
                if (activeCategory !== 'All') setActiveCategory('All');
              }}
              selectedDates={selectedSearchDates}
              onSelectedDatesChange={handleSelectedSearchDatesChange}
              maxSearchDates={maxSearchDates}
              searchDateResetHours={searchDateResetHours}
              searchDateResetNonce={searchDateResetNonce}
              userId={fbUser?.uid}
              availableVendorCountForDate={countAvailableVendorsForDate}
            />
          </div>
        </section>

        {activeCategory === 'All' && !showAllCategoriesGrid && !searchTerm ? (
            <div className="py-4 sm:py-6 bg-black flex-1 border-b border-[#D4AF37]/10">
                <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
                    {/* When dates are selected in the calendar, immediately pop up all available vendors right at the top above categories */}
                    {selectedSearchDates.length > 0 && (
                      <div className="mb-10 pb-8 border-b border-[#D4AF37]/15">
                        <div className="flex items-center justify-between mb-5">
                          <div>
                            <h3 className="text-xl sm:text-2xl font-bold font-[Cinzel] text-[#D4AF37] tracking-wider">
                              Available Vendors ({filteredVendors.length})
                            </h3>
                            <p className="text-xs text-zinc-400 mt-1">
                              Showing only vendors available on your selected {selectedSearchDates.length === 1 ? 'date' : 'dates'}. Select any category below to narrow by service.
                            </p>
                          </div>
                        </div>
                        {filteredVendors.length > 0 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                            {filteredVendors.map(v => (
                              <div
                                id={`vendor-home-${v.id}`}
                                key={v.id}
                                tabIndex={-1}
                                className="outline-none focus:ring-2 focus:ring-[#D4AF37] rounded-xl transform-gpu"
                              >
                                <VendorCard
                                  vendor={v}
                                  onBook={v => handleOpenBooking(v, true)}
                                  onMessage={v => setChatVendor(v)}
                                  onQuickView={handleViewVendor}
                                  selectedDate={selectedSearchDates[0] || eventDate}
                                  onAddReview={handleAddReview}
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-12 text-center" role="status">
                            <Calendar className="w-12 h-12 mx-auto mb-3 text-[#D4AF37]/60" aria-hidden="true" />
                            <p className="text-lg font-[Cinzel] text-zinc-200">No vendors are available for the selected {selectedSearchDates.length === 1 ? 'date' : 'dates'}.</p>
                          </div>
                        )}
                      </div>
                    )}

                    <motion.nav 
                      key="main-categories-grid"
                      variants={CARD_GRID_VARIANTS}
                      initial={isSignInFlipping ? false : "hidden"}
                      animate="show"
                      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4" 
                      aria-label="Category Browser"
                    >
                        {activeCategories.map((cat) => (
                            <motion.div
                              key={cat}
                              variants={CARD_ITEM_VARIANTS}
                              className="transform-gpu will-change-transform"
                            >
                              <motion.button 
                                whileHover={{ scale: 1.02, y: -4 }}
                                whileTap={{ scale: 0.97 }}
                                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                                onClick={() => { setActiveCategory(cat); setActiveSubCategoryGroup(null); setActiveSubSubCategory(null); }} 
                                className="group relative w-full h-32 sm:h-36 rounded-xl overflow-hidden border-2 border-[#D4AF37]/30 hover:border-[#D4AF37]/80 focus-visible:ring-2 focus-visible:ring-[#D4AF37] outline-none transition-colors duration-300 cursor-pointer shadow-lg transform-gpu"
                              >
                                  {renderMedia(categoryImages[cat], "absolute inset-0 w-full h-full object-cover opacity-50 group-hover:scale-110 transition-transform duration-500 transform-gpu", undefined, true)}
                                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/30 simcha-image-fader-card"></div>
                                  <div className="absolute inset-0 flex items-center justify-center p-3.5 sm:p-4 text-center">
                                    <h3 className="text-[#D4AF37] font-black text-base sm:text-lg font-[Cinzel] tracking-wider group-hover:text-white transition-colors drop-shadow-md">{cat}</h3>
                                  </div>
                              </motion.button>
                            </motion.div>
                        ))}
                        {/* View All Card */}
                        <motion.div
                          key="view-all-main-categories"
                          variants={CARD_ITEM_VARIANTS}
                          className="transform-gpu will-change-transform"
                        >
                          <motion.button 
                            whileHover={{ scale: 1.02, y: -4 }}
                            whileTap={{ scale: 0.97 }}
                            transition={{ type: "spring", stiffness: 260, damping: 20 }}
                            onClick={() => setShowAllCategoriesGrid(true)} 
                            className="group relative w-full h-32 sm:h-36 rounded-xl overflow-hidden border-2 border-[#D4AF37]/30 hover:border-[#D4AF37]/80 focus-visible:ring-2 focus-visible:ring-[#D4AF37] outline-none transition-colors duration-300 cursor-pointer shadow-lg transform-gpu"
                          >
                              {renderMedia("https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=600", "absolute inset-0 w-full h-full object-cover opacity-50 group-hover:scale-110 transition-transform duration-500 transform-gpu", undefined, true)}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/30 simcha-image-fader-card"></div>
                              <div className="absolute inset-0 flex items-center justify-center p-3.5 sm:p-4 text-center">
                                <h3 className="text-[#D4AF37] font-black text-base sm:text-lg font-[Cinzel] tracking-wider group-hover:text-white transition-colors drop-shadow-md">View All</h3>
                              </div>
                          </motion.button>
                        </motion.div>
                    </motion.nav>
                </div>
            </div>
        ) : (
            <div className="flex-1 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 w-full">
                <div className="flex flex-wrap items-center gap-2 mb-6" aria-label="Breadcrumb">
                   {/* Selected Category Pill with integrated back arrow */}
                   {activeCategory !== 'All' && (
                     <motion.button 
                       key={`crumb-cat-${activeCategory}`}
                       initial={{ opacity: 0, y: 18 }}
                       animate={{ opacity: 1, y: 0 }}
                       transition={APP_SLIDE_UP_TRANSITION}
                       onClick={() => { setActiveCategory('All'); setShowAllCategoriesGrid(false); setActiveSubCategoryGroup(null); setActiveSubSubCategory(null); }}
                       className="h-7 px-3 rounded-full flex items-center gap-1.5 bg-[#111] border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black font-black text-[10px] uppercase tracking-wider transition-colors duration-300 cursor-pointer shadow-sm transform-gpu"
                     >
                       <ChevronLeft className="w-3.5 h-3.5" />
                       <span>{activeCategory}</span>
                     </motion.button>
                   )}

                   {/* Subcategory Pill with integrated back arrow */}
                   {activeSubCategoryGroup && activeSubCategoryGroup !== '__ALL__' && (
                     <motion.button 
                       key={`crumb-sub-${activeSubCategoryGroup}`}
                       initial={{ opacity: 0, y: 18 }}
                       animate={{ opacity: 1, y: 0 }}
                       transition={APP_SLIDE_UP_TRANSITION}
                       onClick={() => { setActiveSubCategoryGroup(null); setActiveSubSubCategory(null); }}
                       className="h-7 px-3 rounded-full flex items-center gap-1.5 bg-[#111] border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black font-black text-[10px] uppercase tracking-wider transition-colors duration-300 cursor-pointer shadow-sm transform-gpu"
                     >
                       <ChevronLeft className="w-3.5 h-3.5" />
                       <span>{activeSubCategoryGroup}</span>
                     </motion.button>
                   )}

                   {/* Sub-Subcategory Pill with integrated back arrow */}
                   {activeSubSubCategory && activeSubSubCategory !== '__ALL__' && (
                     <motion.button 
                       key={`crumb-subsub-${activeSubSubCategory}`}
                       initial={{ opacity: 0, y: 18 }}
                       animate={{ opacity: 1, y: 0 }}
                       transition={APP_SLIDE_UP_TRANSITION}
                       onClick={() => setActiveSubSubCategory(null)}
                       className="h-7 px-3 rounded-full flex items-center gap-1.5 bg-[#111] border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black font-black text-[10px] uppercase tracking-wider transition-colors duration-300 cursor-pointer shadow-sm transform-gpu"
                     >
                       <ChevronLeft className="w-3.5 h-3.5" />
                       <span>{activeSubSubCategory}</span>
                     </motion.button>
                   )}
                </div>

                {activeCategory !== 'All' && !showAllCategoriesGrid && categorySubCategories?.[activeCategory] && Object.keys(categorySubCategories[activeCategory]).length > 0 && !activeSubCategoryGroup && (
                  <div className="mb-12">
                    <motion.div 
                      key={`subcategories-${activeCategory}`}
                      variants={CARD_GRID_VARIANTS}
                      initial="hidden"
                      animate="show"
                      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4"
                    >
                      {Object.keys(categorySubCategories[activeCategory] || {}).map(group => (
                        <motion.div
                          key={group}
                          variants={CARD_ITEM_VARIANTS}
                          className="transform-gpu will-change-transform"
                        >
                          <motion.button
                            whileHover={{ scale: 1.02, y: -4 }}
                            whileTap={{ scale: 0.97 }}
                            transition={{ type: "spring", stiffness: 260, damping: 20 }}
                            onClick={() => { setActiveSubCategoryGroup(group); setActiveSubSubCategory(null); }}
                            className="group relative w-full h-32 sm:h-36 rounded-xl overflow-hidden border-2 border-[#D4AF37]/30 hover:border-[#D4AF37]/80 focus-visible:ring-2 focus-visible:ring-[#D4AF37] outline-none transition-colors duration-300 cursor-pointer shadow-lg transform-gpu"
                          >
                             {subCategoryImages[group] ? (
                               <>{renderMedia(subCategoryImages[group], "absolute inset-0 w-full h-full object-cover opacity-50 group-hover:scale-110 transition-transform duration-500 transform-gpu", group, true)}</>
                             ) : (
                               <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center opacity-60 group-hover:scale-110 transition-transform duration-500 transform-gpu">
                                 <span className="text-zinc-400 font-bold uppercase tracking-widest text-xs">No Image</span>
                               </div>
                             )}
                             <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/30 simcha-image-fader-card"></div>
                             <div className="absolute inset-0 flex flex-col items-center justify-center p-3.5 sm:p-4 text-center">
                               <h3 className="text-[#D4AF37] font-black text-base sm:text-lg font-[Cinzel] tracking-wider group-hover:text-white transition-colors drop-shadow-md">{group}</h3>
                             </div>
                          </motion.button>
                        </motion.div>
                      ))}
                      {/* Subcategory View All */}
                      <motion.div
                        key={`view-all-subcategories-${activeCategory}`}
                        variants={CARD_ITEM_VARIANTS}
                        className="transform-gpu will-change-transform"
                      >
                        <motion.button
                          whileHover={{ scale: 1.02, y: -4 }}
                          whileTap={{ scale: 0.97 }}
                          transition={{ type: "spring", stiffness: 260, damping: 20 }}
                          onClick={() => { setActiveSubCategoryGroup('__ALL__'); setActiveSubSubCategory(null); }}
                          className="group relative w-full h-32 sm:h-36 rounded-xl overflow-hidden border-2 border-[#D4AF37]/30 hover:border-[#D4AF37]/80 focus-visible:ring-2 focus-visible:ring-[#D4AF37] outline-none transition-colors duration-300 cursor-pointer shadow-lg transform-gpu"
                        >
                           {renderMedia("https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&q=80&w=600", "absolute inset-0 w-full h-full object-cover opacity-50 group-hover:scale-110 transition-transform duration-500 transform-gpu", undefined, true)}
                           <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/30 simcha-image-fader-card"></div>
                           <div className="absolute inset-0 flex flex-col items-center justify-center p-3.5 sm:p-4 text-center">
                             <h3 className="text-[#D4AF37] font-black text-base sm:text-lg font-[Cinzel] tracking-wider group-hover:text-white transition-colors drop-shadow-md">View All</h3>
                           </div>
                        </motion.button>
                      </motion.div>
                    </motion.div>
                  </div>
                )}

                {activeCategory !== 'All' && !showAllCategoriesGrid && activeSubCategoryGroup && activeSubCategoryGroup !== '__ALL__' && !activeSubSubCategory && (
                  <div className="mb-12">
                    <motion.div 
                      key={`subsubcategories-${activeCategory}-${activeSubCategoryGroup}`}
                      variants={CARD_GRID_VARIANTS}
                      initial="hidden"
                      animate="show"
                      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4"
                    >
                      {(categorySubCategories[activeCategory]?.[activeSubCategoryGroup] || []).map(sub => (
                        <motion.div
                          key={sub}
                          variants={CARD_ITEM_VARIANTS}
                          className="transform-gpu will-change-transform"
                        >
                          <motion.button
                            whileHover={{ scale: 1.02, y: -4 }}
                            whileTap={{ scale: 0.97 }}
                            transition={{ type: "spring", stiffness: 260, damping: 20 }}
                            onClick={() => setActiveSubSubCategory(sub)}
                            className="group relative w-full h-32 sm:h-36 rounded-xl overflow-hidden border-2 border-[#D4AF37]/30 hover:border-[#D4AF37]/80 focus-visible:ring-2 focus-visible:ring-[#D4AF37] outline-none transition-colors duration-300 cursor-pointer shadow-lg transform-gpu"
                          >
                            {subCategoryImages[sub] ? (
                              <>{renderMedia(subCategoryImages[sub], "absolute inset-0 w-full h-full object-cover opacity-50 group-hover:scale-110 transition-transform duration-500 transform-gpu", sub, true)}</>
                            ) : (
                              <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center opacity-60 group-hover:scale-110 transition-transform duration-500 transform-gpu">
                                <span className="text-zinc-400 font-bold uppercase tracking-widest text-xs">No Image</span>
                              </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/30 simcha-image-fader-card"></div>
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-3.5 sm:p-4 text-center">
                              <h3 className="text-[#D4AF37] font-black text-base sm:text-lg font-[Cinzel] tracking-wider group-hover:text-white transition-colors drop-shadow-md">{sub}</h3>
                            </div>
                          </motion.button>
                        </motion.div>
                      ))}
                      {/* Sub-subcategory View All */}
                      <motion.div
                        key={`view-all-subsubcategories-${activeCategory}-${activeSubCategoryGroup}`}
                        variants={CARD_ITEM_VARIANTS}
                        className="transform-gpu will-change-transform"
                      >
                        <motion.button
                          whileHover={{ scale: 1.02, y: -4 }}
                          whileTap={{ scale: 0.97 }}
                          transition={{ type: "spring", stiffness: 260, damping: 20 }}
                          onClick={() => setActiveSubSubCategory('__ALL__')}
                          className="group relative w-full h-32 sm:h-36 rounded-xl overflow-hidden border-2 border-[#D4AF37]/30 hover:border-[#D4AF37]/80 focus-visible:ring-2 focus-visible:ring-[#D4AF37] outline-none transition-colors duration-300 cursor-pointer shadow-lg transform-gpu"
                        >
                          {renderMedia("https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&q=80&w=600", "absolute inset-0 w-full h-full object-cover opacity-50 group-hover:scale-110 transition-transform duration-500 transform-gpu", undefined, true)}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/30 simcha-image-fader-card"></div>
                          <div className="absolute inset-0 flex flex-col items-center justify-center p-3.5 sm:p-4 text-center">
                            <h3 className="text-[#D4AF37] font-black text-base sm:text-lg font-[Cinzel] tracking-wider group-hover:text-white transition-colors drop-shadow-md">View All</h3>
                          </div>
                        </motion.button>
                      </motion.div>
                    </motion.div>
                  </div>
                )}



                {/* Vendors List */}
                {(selectedSearchDates.length > 0 || showAllCategoriesGrid || activeSubCategoryGroup === '__ALL__' || activeSubSubCategory === '__ALL__' || activeSubSubCategory || !categorySubCategories?.[activeCategory] || Object.keys(categorySubCategories[activeCategory] || {}).length === 0) && (
                  <>
                  <motion.div 
                    key={`vendors-${activeCategory}-${showAllCategoriesGrid}-${activeSubCategoryGroup}-${activeSubSubCategory}-${searchTerm}-${selectedSearchDates.join(',')}-${isLoadingVendors}`}
                    variants={CARD_GRID_VARIANTS}
                    initial={selectedSearchDates.length > 0 ? false : "hidden"}
                    animate="show"
                    className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4"
                  >
                    {isLoadingVendors ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <motion.div
                          key={`skeleton-main-${i}`}
                          variants={CARD_ITEM_VARIANTS}
                          className="outline-none rounded-xl w-full aspect-[4/5] transform-gpu will-change-transform"
                        >
                          <VendorCardSkeleton />
                        </motion.div>
                      ))
                    ) : (
                      filteredVendors.map(v => (
                        <motion.div 
                          variants={CARD_ITEM_VARIANTS}
                          id={`vendor-${v.id}`} 
                          key={v.id} 
                          tabIndex={-1} 
                          className="outline-none focus:ring-2 focus:ring-[#D4AF37] rounded-xl transform-gpu will-change-transform"
                        >
                          <VendorCard 
                            vendor={v} 
                            onBook={v => handleOpenBooking(v, true)} 
                            onMessage={v => setChatVendor(v)} 
                            onQuickView={handleViewVendor}
                            selectedDate={eventDate} 
                            onAddReview={handleAddReview} 
                          />
                        </motion.div>
                      ))
                    )}
                  </motion.div>
                {!isLoadingVendors && filteredVendors.length === 0 && (
                    <div className="py-20 text-center" role="status">
                      <Search className="w-16 h-16 mx-auto mb-4 text-[#D4AF37]" aria-hidden="true" />
                      <p className="text-xl font-[Cinzel] text-zinc-200">No vendors match your query.</p>
                    </div>
                )}
                </>
                )}
            </div>
        )}
      </main>

      <footer className="bg-black border-t border-[#D4AF37]/10 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-10">
                <div className="flex flex-col items-center md:items-start gap-4">
                    <div className="flex items-center gap-2.5">
                      <SimchaLogo className="h-7 w-7 sm:h-8 sm:w-8" /><span className="text-2xl font-bold font-[Cinzel] text-[#D4AF37] tracking-wider leading-tight">Simcha Booking</span>
                    </div>
                    <p className="text-zinc-300 text-sm max-w-xs text-center md:text-left leading-relaxed">Curating exceptional Jewish celebrations with world-class professional partners.</p>
                </div>
                <nav className="flex flex-col md:flex-row items-center gap-8 md:gap-16" aria-label="Footer Navigation">
                    <div className="flex flex-col gap-3 items-center md:items-start">
                      <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.3em]">Directory</p>
                      <button onClick={() => {setView('marketplace'); setActiveCategory('All');}} className="text-zinc-400 hover:text-white text-sm transition-colors outline-none focus-visible:underline">Browse Marketplace</button>
                      <button onClick={() => setView('posts')} className="text-zinc-400 hover:text-white text-sm transition-colors outline-none focus-visible:underline">Community Gallery</button>
                    </div>
                    <div className="flex flex-col gap-3 items-center md:items-start">
                        <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.3em]">Access</p>
                        {!isInitializing && !isRoleLoading && !!fbUser && !!userDocData && isAdmin && (
                          <button onClick={() => setView('admin')} className="text-zinc-400 hover:text-[#D4AF37] text-sm flex items-center gap-1.5 transition-colors outline-none focus-visible:underline"><Shield className="w-3.5 h-3.5" aria-hidden="true" /> Administration</button>
                        )}
                    </div>
                </nav>
            </div>
        </div>
      </footer>
      </>
    );
  };

  return (
    <>
      {authWallOverlay}
      {fbUser && (
        <motion.div 
          key={fbUser.uid}
          initial={isSignInFlipping ? false : { opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0, transitionEnd: { transform: 'none' } }}
          transition={APP_SLIDE_UP_TRANSITION}
          className={`min-h-screen bg-black text-zinc-100 flex flex-col relative ${view === 'portal' ? '' : 'pb-28'}`}
        >
      <FixedGoldScrollbar />
      {permissionErrorBanner && (
        <aside aria-label="System Notice" className="bg-red-950/80 border-b border-red-500/40 px-4 py-3 text-red-200 text-xs font-medium flex items-center justify-between gap-3 backdrop-blur-md sticky top-0 z-[120]">
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span className="flex-1 font-semibold">{permissionErrorBanner}</span>
            <button 
              onClick={() => setPermissionErrorBanner(null)} 
              className="text-red-400 hover:text-white p-1 rounded-full hover:bg-red-900/30 transition-colors cursor-pointer"
              aria-label="Dismiss message"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </aside>
      )}
      {/* Floating Header Controls (? Ask on Right & Role Switcher on Left below header) */}
      {!isInitializing && !isRoleLoading && !!fbUser && !!userDocData && isActuallyVendor && (
        <AnimatedRoleSwitcher
          isVendorView={isVendorView}
          onToggleVendor={handleToggleVendor}
        />
      )}

      <aside aria-label="Support Assistance" className="fixed top-[84px] sm:top-24 right-3 sm:right-4 z-50 flex items-center pointer-events-auto">
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          type="button" 
          onClick={() => {
            if (fbUser) {
              ensureAdminSupportConversation(fbUser.uid, 'admin').catch(console.error);
            }
            setIsAdminChatOpen(true);
          }}
          className="h-[28px] sm:h-[30px] inline-flex items-center justify-center gap-1 px-3 sm:px-3.5 rounded-full bg-zinc-950/90 border border-[#D4AF37]/40 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black font-extrabold text-[9.5px] sm:text-[10px] tracking-normal uppercase leading-none shadow-[0_4px_15px_rgba(0,0,0,0.8),0_0_10px_rgba(212,175,55,0.2)] backdrop-blur-md transition-all duration-300 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
          aria-label="Ask Support"
        >
          <HelpCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0 stroke-[2.5]" />
          <span className="leading-none">Ask</span>
        </motion.button>
      </aside>

      <header className="bg-black sticky top-0 z-40 border-b border-[#D4AF37]/20 shadow-xl rounded-b-lg sm:rounded-b-none" aria-label="Main Navigation">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-[#D4AF37] focus:text-black focus:p-4 focus:rounded-full focus:font-bold">Skip to main content</a>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-[72px] sm:h-20 items-center">
            <div className="flex items-center gap-4 md:gap-8 ml-0">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex items-center gap-2 sm:gap-2.5 cursor-pointer group outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-full p-1 bg-transparent border-0 shadow-none" 
                onClick={() => { setView('marketplace'); setActiveCategory('All'); setIsVendorView(false); }} 
                aria-label="Simcha Booking Home"
              >
                  <SimchaLogo className="h-7 w-7 sm:h-7 sm:w-7 md:h-8 md:w-8 group-hover:scale-110 transition-transform" />
                  <div className="text-left">
                      <h1 className="simcha-brand-title text-lg sm:text-xl md:text-2xl font-bold text-[#D4AF37] tracking-tight font-[Cinzel] leading-tight md:leading-normal">
                        <span className="block md:inline">Simcha</span><span className="block md:inline md:ml-1.5">Booking</span>
                      </h1>
                  </div>
              </motion.button>
              
            </div>
            
            <div className="flex items-center gap-3 md:gap-6 mr-0">
                

                {!!fbUser && isAdmin && (
                  <motion.button 
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setView('admin')} 
                    className="text-zinc-300 hover:text-[#D4AF37] transition-colors focus-visible:ring-2 focus-visible:ring-[#D4AF37] outline-none rounded-full p-2 hover:bg-white/10 cursor-pointer" 
                    aria-label="Admin Panel"
                  >
                    <Shield className="w-5 h-5" />
                  </motion.button>
                )}

                <motion.button 
                  whileTap={{ scale: 0.9 }}
                  onClick={handleSignOut} 
                  className="text-zinc-300 hover:text-zinc-200 transition-colors focus-visible:ring-2 focus-visible:ring-red-500 outline-none rounded-full p-2 hover:bg-white/10 cursor-pointer" 
                  aria-label="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </motion.button>
            </div>
          </div>
        </div>
      </header>
      {renderActiveView()}

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
            aria-labelledby="priority-hold-title"
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
                
                <h2 id="priority-hold-title" className="text-2xl md:text-3xl font-bold font-[Cinzel] text-[#D4AF37] tracking-wider text-center mx-auto w-full mb-6">
                  BOOKING REQUEST RECEIVED
                </h2>
                
                <p className="text-zinc-300 text-sm leading-relaxed mb-8 font-light text-center mx-auto w-full break-words px-4">
                  Your request has been forwarded to the vendor. We will notify you once they have reviewed it. You can check the status in your portal.
                </p>
                
                <button 
                  onClick={() => setShowPriorityHoldPopup(false)}
                  className="w-full bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black py-3.5 rounded-full text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-xl shadow-[#D4AF37]/10 hover:shadow-[#D4AF37]/20 outline-none hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {bookingVendor && !quickViewVendor && (
        <BookingModal 
          key={`${bookingVendor.id}-${bookingOpenCount}`}
          isOpen={!!bookingVendor} 
          isNested={false}
          vendor={bookingVendor} 
          selectedDate={suggestionsEventDate || eventDate} 
          isPriorityFromSuggestions={isPriorityFromSuggestions}
          onSuccessStateChange={(isSuccess) => setIsBookingModalSuccess(isSuccess)}
          onClose={() => { 
            const closingId = bookingVendor.id;
            setIsBookingModalSuccess(false);
            setBookingVendor(prev => (prev?.id === closingId ? null : prev)); 
            setInitialBookingDetails(null); 
            setPendingPrioritySuggestions(false);
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            if (isPriorityFromSuggestions) {
              setIsPriorityFromSuggestions(false);
              setShowSuggestions(true);
            }
          }} 
          onDone={(isPriority: boolean) => {
            setIsBookingModalSuccess(false);
            setBookingVendor(null);
            setInitialBookingDetails(null);
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            if (isPriority) {
              setShowSuggestions(true);
              setPendingPrioritySuggestions(false);
            } else {
              setShowSuggestions(false);
              setPendingPrioritySuggestions(false);
              setIsPriorityFromSuggestions(false);
              setView('marketplace');
              setActiveCategory('All');
              setSearchTerm('');
              setActiveBottomTab('home');
            }
          }}
          onConfirm={handleConfirmBooking} 
          onGoToPlan={handleGoToPlan}
          onGoToEvents={handleGoToEvents}
          initialDetails={initialBookingDetails || { clientName: currentAuthenticatedUser.name || '', contactEmail: currentAuthenticatedUser.username || '', eventName: '' }} 
        />
      )}
      <ChatModal 
        isOpen={!!chatVendor || isAdminChatOpen} 
        vendor={chatVendor} 
        isAdminMode={isAdminChatOpen}
        conversationIdOverride={chatConversationId}
        threadMessages={chatThreadMessages}
        messages={chatThreadMessages.length > 0 ? [...messages, ...chatThreadMessages] : messages} 
        user={currentAuthenticatedUser} 
        onSendMessage={handleSendMessage} 
        onClose={() => { setChatVendor(null); setChatConversationId(undefined); setChatThreadMessages([]); setIsAdminChatOpen(false); }} 
        showNotification={showNotification}
        vendors={vendors}
      />

      {quickViewVendor && (
        <QuickViewModal 
          key={`${quickViewVendor.id}-${quickViewOpenCount}`}
          vendor={quickViewVendor} 
          onClose={() => {
            const closingId = quickViewVendor.id;
            setIsBookingModalSuccess(false);
            setQuickViewVendor(prev => (prev?.id === closingId ? null : prev));
            setBookingVendor(prev => (prev?.id === closingId ? null : prev));
            setInitialBookingDetails(null);
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
          }} 
          bookingVendor={bookingVendor}
          onBook={(v) => handleOpenBooking(v)}
          onCloseBooking={() => {
            setIsBookingModalSuccess(false);
            setBookingVendor(null);
            setInitialBookingDetails(null);
          }}
          onAddReview={handleAddReview}
          onConfirmBooking={handleConfirmBooking}
          isInPlan={quickViewVendor ? cart.some(c => c.vendor.id === quickViewVendor.id) : false}
          onAddToPlan={handleAddToPlan}
          onGoToPlan={handleGoToPlan}
          onGoToEvents={handleGoToEvents}
          onBookingDone={(isPriority) => {
            setIsBookingModalSuccess(false);
            setQuickViewVendor(null);
            setBookingVendor(null);
            setInitialBookingDetails(null);
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.width = '';
            if (isPriority) {
              setShowSuggestions(true);
              setPendingPrioritySuggestions(false);
            } else {
              setShowSuggestions(false);
              setPendingPrioritySuggestions(false);
              setIsPriorityFromSuggestions(false);
              setView('marketplace');
              setActiveCategory('All');
              setSearchTerm('');
              setActiveBottomTab('home');
            }
          }}
        />
      )}

      {/* Add-to-Plan Interactive Confirmation Notification */}
      <AnimatePresence>
        {planConfirmation?.show && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[210] w-[92vw] max-w-md pointer-events-auto"
            role="status"
            aria-live="polite"
          >
            <div className="bg-[#0b0b0b]/95 border-2 border-[#D4AF37] rounded-2xl p-4 sm:p-5 shadow-[0_12px_36px_rgba(0,0,0,0.95),0_0_24px_rgba(212,175,55,0.3)] backdrop-blur-xl flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/50 flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-5 h-5 text-[#D4AF37] stroke-[3]" />
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-zinc-100 leading-snug">
                      Your booking has been added to your plan. Go to plan to finalize.
                    </p>
                    {planConfirmation.vendorName && (
                      <p className="text-[10px] text-[#D4AF37] uppercase tracking-wider font-bold mt-1">
                        {planConfirmation.vendorName}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setPlanConfirmation(null)}
                  className="text-zinc-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                  aria-label="Dismiss confirmation"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                <button
                  onClick={handleGoToPlan}
                  className="flex-1 bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black py-2.5 px-4 rounded-full text-xs uppercase tracking-widest transition-all shadow-md shadow-[#D4AF37]/20 hover:scale-[1.02] active:scale-[0.98] cursor-pointer text-center"
                >
                  Go to Plan
                </button>
                <button
                  onClick={() => setPlanConfirmation(null)}
                  className="px-4 py-2.5 rounded-full border border-white/20 text-zinc-300 hover:text-white hover:border-white/40 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {notification && (
        <aside aria-label="Notifications" role="status" aria-live="polite" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-5 fade-in duration-300 w-full max-w-sm px-4 pointer-events-none">
          <div className={`bg-[#111] text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border backdrop-blur-md ${notification.type === 'error' ? 'border-red-500/40 bg-red-950/20' : 'border-green-500/40 bg-green-950/20'}`}>
            {notification.type === 'error' ? (
              <X className="w-5 h-5 text-red-500 animate-pulse" aria-hidden="true" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-500" aria-hidden="true" />
            )}
            <span className={`font-bold text-sm flex-1 ${notification.type === 'error' ? 'text-red-200' : 'text-green-200'}`}>{notification.message}</span>
          </div>
        </aside>
      )}
      
      {currentAuthenticatedUser && 
        !showSuggestions && 
        !showPriorityHoldPopup && 
        !chatVendor && 
        !isAdminChatOpen && 
        !isPortalChatActive && (
        <BottomNav 
          currentView={activeBottomTab} 
          onNavigate={handleBottomNav} 
          isVendorView={isVendorView && isActuallyVendor}
          showVendorToggle={false}
          onToggleVendor={handleToggleVendor}
        />
      )}
        </motion.div>
      )}
    </>
  );
}

export default App;