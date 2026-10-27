import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, ShoppingBag, Calendar, MessageSquare, LogOut, Trash2, 
  ChevronRight, MapPin, Clock, CreditCard, Check, CheckCircle, CheckCheck, Bell, X, Menu, Send,
  FileText, Upload, Download, Loader2, Plus, Search, Edit3, ArrowLeft, ShieldCheck,
  Mic, Image as ImageIcon, Play
} from 'lucide-react';
import { CartItem, Booking, Message, Vendor, UserAccount } from '../types';
import { storage, db } from '../services/firebase';
import { markChatAsRead } from '../services/messagingService';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { uploadFileRobustly } from '../services/uploadService';
import { CustomAudioPlayer } from './CustomAudioPlayer';
import { trackFunnelStep } from '../services/analyticsService';
import { EmbeddedCheckoutModal } from './EmbeddedCheckoutModal';
import { ThemeModeSwitch } from './ThemeModeSwitch';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy, onSnapshot, writeBatch } from 'firebase/firestore';

interface ClientPortalProps {
  user: UserAccount;
  cart: CartItem[];
  bookings: Booking[];
  messages: Message[];
  vendors: Vendor[];
  onRemoveFromCart: (index: number) => void;
  onEditCartItem: (index: number) => void;
  onProcessCart: () => void;
  onPaymentSuccess: (bookingId: string, method: string) => void;
  onLogout: () => void;
  onClose: () => void;
  onUpdateProfile: (data: { name: string, photoURL: string, photoStoragePath?: string }) => void;
  onDeleteAccount: () => void;
  onMessageVendor: (vendor: Vendor) => void;
  onOpenAdminChat?: () => void;
  onActiveChatChange?: (isActive: boolean) => void;
  onTabChange?: (tab: string) => void;
  initialTab?: string;
  themeMode?: 'dark' | 'light';
  onToggleThemeMode?: (mode: 'dark' | 'light') => void;
}

const ClientPortal: React.FC<ClientPortalProps> = ({ 
  user, cart, bookings, messages, vendors, onRemoveFromCart, onEditCartItem, onProcessCart, onPaymentSuccess, onLogout, onClose, onUpdateProfile, onDeleteAccount, onMessageVendor, onOpenAdminChat, onActiveChatChange, onTabChange, initialTab, themeMode = 'dark', onToggleThemeMode
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'plan' | 'events' | 'chats' | 'profile'>(initialTab as any || 'overview');
  
  const onTabChangeRef = useRef(onTabChange);
  useEffect(() => {
    onTabChangeRef.current = onTabChange;
  }, [onTabChange]);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab as any);
  }, [initialTab]);

  useEffect(() => {
    if (onTabChangeRef.current) onTabChangeRef.current(activeTab);
  }, [activeTab]);

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (tab === 'plan') {
      const totalAmt = cart.reduce((acc, curr) => acc + curr.amount, 0);
      trackFunnelStep.beginCheckout(cart.length, totalAmt);
    }
  };
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedThreadVendorId, setSelectedThreadVendorId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [fullscreenMedia, setFullscreenMedia] = useState<{url: string, type: 'image' | 'video'} | null>(null);

  // Automatically scroll to the bottom of the chat pane when thread changes or new message is received
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedThreadVendorId, messages]);



  const [editName, setEditName] = useState(user.name);
  const [editPhotoURL, setEditPhotoURL] = useState(user.photoURL || ''); 
  const [editPhotoStoragePath, setEditPhotoStoragePath] = useState(user.photoStoragePath || '');

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [checkoutBookingInfo, setCheckoutBookingInfo] = useState<{ id: string; amount: number; vendorName?: string } | null>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user.id) return;

    setIsUploadingPhoto(true);
    try {
      const storagePath = `user_uploads/${user.id}/profile_photo_${Date.now()}`;
      const downloadURL = await uploadFileRobustly(file, storagePath);
      
      // Update local state and call parent update
      setEditPhotoURL(downloadURL);
      setEditPhotoStoragePath(storagePath);
      onUpdateProfile({ name: editName, photoURL: downloadURL, photoStoragePath: storagePath });
    } catch (error: any) {
      console.error("Profile photo upload error:", error);
      alert("Failed to upload profile photo: " + error.message);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleProfilePhotoDelete = async () => {
    if (!user.id || !editPhotoURL) return;
    if (!window.confirm("Are you sure you want to remove your profile photo?")) return;

    try {
      // Try to delete from storage if it's a storage URL
      if (editPhotoURL.includes('firebasestorage.googleapis.com')) {
        const decodedUrl = decodeURIComponent(editPhotoURL);
        const pathStart = decodedUrl.indexOf('/o/') + 3;
        const pathEnd = decodedUrl.indexOf('?alt=media');
        if (pathStart > 2 && pathEnd > pathStart) {
          const fullPath = decodedUrl.substring(pathStart, pathEnd);
          const storageRef = ref(storage, fullPath);
          await deleteObject(storageRef);
        }
      }
      
      setEditPhotoURL('');
      setEditPhotoStoragePath('');
      onUpdateProfile({ name: editName, photoURL: '', photoStoragePath: '' });
    } catch (error) {
      console.error("Profile photo delete error:", error);
      // Still update UI/Auth if storage delete fails
      setEditPhotoURL('');
      setEditPhotoStoragePath('');
      onUpdateProfile({ name: editName, photoURL: '', photoStoragePath: '' });
    }
  };

  const handlePay = async (bookingId: string, vendorId: string, amount: number) => {
    setIsProcessingPayment(true);
    try {
      trackFunnelStep.initiatePayment(bookingId, vendorId, amount, 'Stripe');
      const response = await fetch(`/api/stripe/create-checkout-session?vendorId=${vendorId}&amount=${amount}&bookingId=${bookingId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create checkout session');
      }
      const data = await response.json();
      const clientSecret = data.clientSecret || data.client_secret;

      if (clientSecret) {
        const vendor = vendors.find(v => v.id === vendorId);
        setCheckoutBookingInfo({
          id: bookingId,
          amount,
          vendorName: vendor?.name
        });
        setCheckoutClientSecret(clientSecret);
      } else if (data.url) {
        // Fallback redirect if server returned URL
        try {
          window.top!.location.href = data.url;
        } catch (e) {
          console.warn('window.top navigation blocked, falling back to window.open', e);
          window.open(data.url, '_blank');
        }
      } else {
        throw new Error('No client secret returned from payment server.');
      }
    } catch (error: any) {
      console.error('Payment Error:', error);
      alert(`Payment Error: ${error.message || 'Failed to start payment. Please try again.'}`);
    } finally {
      setIsProcessingPayment(false);
    }
  };


  const getCountdown = (dateString: string) => {
    const eventDate = new Date(dateString);
    const today = new Date();
    
    // Normalize dates to midnight for accurate day calculation
    const eventDateMidnight = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const diffTime = eventDateMidnight.getTime() - todayMidnight.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return null; // Past event
    if (diffDays === 0) return { text: 'Today is the day! Mazel Tov!', isToday: true };
    return { text: `${diffDays} Day${diffDays === 1 ? '' : 's'} to go!`, isToday: false };
  };

  const [selectedEventCategory, setSelectedEventCategory] = useState<string>('All');

  const clientBookings = useMemo(() => {
    const sorted = bookings
      .filter(
        b =>
          (user.id && (b.userId === user.id || b.clientId === user.id)) ||
          (b.contactEmail && user.username && b.contactEmail.toLowerCase() === user.username.toLowerCase()) ||
          (b.clientName && user.name && b.clientName.toLowerCase() === user.name.toLowerCase())
      )
      .map((booking, idx) => ({ booking, idx }))
      .sort((a, b) => {
        const timeA = a.booking.createdAt ? new Date(a.booking.createdAt).getTime() : 0;
        const timeB = b.booking.createdAt ? new Date(b.booking.createdAt).getTime() : 0;
        if (timeA !== timeB) {
          return timeB - timeA; // Latest booked event always on top
        }
        return b.idx - a.idx;
      })
      .map(item => item.booking);

    // Strictly deduplicate so the same vendor + date never appears multiple times
    const seen = new Set<string>();
    const deduped: Booking[] = [];
    for (const b of sorted) {
      const key = `${b.vendorId}_${b.date}`;
      if (!seen.has(b.id) && !seen.has(key)) {
        seen.add(b.id);
        seen.add(key);
        deduped.push(b);
      }
    }
    return deduped;
  }, [bookings, user.id, user.username, user.name]);

  const eventCategories = useMemo(() => {
    const bookedCats = new Set<string>();
    clientBookings.forEach(b => {
      const v = vendors.find(vendor => vendor.id === b.vendorId);
      if (v?.category) bookedCats.add(v.category);
    });
    const allVendorCats = new Set<string>();
    vendors.forEach(v => {
      if (v.category) allVendorCats.add(v.category);
    });
    const defaultCats = ['Music', 'Photography', 'Videography', 'Catering', 'Venue', 'Decor', 'Entertainment'];
    const ordered = [
      'All',
      ...Array.from(bookedCats),
      ...defaultCats.filter(c => !bookedCats.has(c)),
      ...Array.from(allVendorCats).filter(c => !bookedCats.has(c) && !defaultCats.includes(c))
    ];
    return Array.from(new Set(ordered));
  }, [clientBookings, vendors]);

  const filteredClientBookings = useMemo(() => {
    if (selectedEventCategory === 'All') return clientBookings;
    return clientBookings.filter(b => {
      const v = vendors.find(vendor => vendor.id === b.vendorId);
      return v?.category?.toLowerCase() === selectedEventCategory.toLowerCase();
    });
  }, [clientBookings, vendors, selectedEventCategory]);
  
  // Group messages by vendor/contact for the chat hub (strictly one thread per contact, newest on top)
  const chatThreads = useMemo(() => {
    const groups: Record<string, { vendor: Vendor; messages: Message[]; lastMessage: Message }> = {};
    const seenMessageIds = new Set<string>();

    messages.forEach((m) => {
      if (!m) return;
      if (m.id && seenMessageIds.has(m.id)) return;
      if (m.id) seenMessageIds.add(m.id);

      let vendor: Vendor | undefined;

      // 1. Check if this message belongs to the Admin Support thread
      if (
        m.isAdminInquiry ||
        m.senderId === 'admin' ||
        m.receiverId === 'admin' ||
        (m.participants && m.participants.includes('admin')) ||
        (m.conversationId && m.conversationId.split('_').includes('admin'))
      ) {
        vendor = {
          id: 'admin',
          name: 'Simcha Admin',
          category: 'Support',
          description: 'Direct support from the Simcha platform.',
          priceRange: 'N/A',
          location: 'System',
          image: '',
          rating: 5,
          reviews: [],
        } as unknown as Vendor;
      } else {
        // 2. Resolve vendor by senderId, receiverId, participants, conversationId, or vendorEmail
        const candidateOtherId = m.senderId === user.id ? m.receiverId : m.senderId;
        vendor =
          vendors.find((v) => v.id === candidateOtherId) ||
          vendors.find(
            (v) =>
              v.id === m.senderId ||
              v.id === m.receiverId ||
              (m.participants && m.participants.includes(v.id)) ||
              (m.conversationId && m.conversationId.split('_').includes(v.id)) ||
              (m.vendorEmail && v.contactEmail && v.contactEmail.toLowerCase() === m.vendorEmail.toLowerCase())
          );
      }

      if (vendor) {
        const actualVendorId = vendor.id || 'admin';
        if (!groups[actualVendorId]) {
          groups[actualVendorId] = { vendor, messages: [], lastMessage: m };
        }
        groups[actualVendorId].messages.push(m);
      }
    });

    Object.values(groups).forEach((g) => {
      g.messages.sort((a, b) => {
        const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tA - tB;
      });
      if (g.messages.length > 0) {
        g.lastMessage = g.messages[g.messages.length - 1];
      }
    });

    return Object.entries(groups).sort((a, b) => {
      const timeA = a[1].lastMessage?.timestamp ? new Date(a[1].lastMessage.timestamp).getTime() : 0;
      const timeB = b[1].lastMessage?.timestamp ? new Date(b[1].lastMessage.timestamp).getTime() : 0;
      return timeB - timeA;
    });
  }, [messages, vendors, user.id]);

  const onActiveChatChangeRef = useRef(onActiveChatChange);
  useEffect(() => {
    onActiveChatChangeRef.current = onActiveChatChange;
  }, [onActiveChatChange]);

  useEffect(() => {
    if (onActiveChatChangeRef.current) {
      onActiveChatChangeRef.current(!!checkoutClientSecret);
    }
  }, [checkoutClientSecret]);

  const getVendorInitials = (name?: string): string => {
    if (!name || !name.trim()) return 'V';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const subtotal = cart.reduce((sum, item) => sum + item.amount, 0);

  const NavItem = ({ id, icon: Icon, label, badge }: { id: typeof activeTab, icon: any, label: string, badge?: number }) => (
    <button 
      onClick={() => { handleTabChange(id); setIsSidebarOpen(false); }} 
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-full transition-all ${activeTab === id ? 'bg-[#D4AF37] text-black font-bold shadow-lg' : 'text-zinc-400 hover:text-[#D4AF37] hover:bg-white/5'}`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-xs font-black uppercase tracking-widest">{label}</span>
      <AnimatePresence mode="popLayout">
        {!!badge && (
          <motion.span
            key={`badge-${id}-${badge}`}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="ml-auto bg-[#D4AF37] text-black text-[9px] font-black px-2 py-0.5 rounded-full"
          >
            {badge}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );

  return (
    <div className="min-h-[calc(100dvh-72px)] sm:min-h-[calc(100dvh-5rem)] flex-1 bg-[#050505] text-zinc-100 flex flex-col md:flex-row relative">
      {/* Desktop Sidebar (BottomNav handles mobile navigation) */}
      <aside className="hidden md:flex md:w-72 bg-[#0a0a0a] border-r border-[#D4AF37]/10 flex-col md:h-[calc(100dvh-5rem)] md:sticky md:top-20 shadow-2xl">
        <div className="p-6 md:p-8 flex items-center justify-between border-b border-white/5">
          <div>
            <h2 className="text-xl md:text-2xl font-bold font-[Cinzel] text-[#D4AF37] uppercase tracking-tighter">Planner</h2>
            <p className="text-[9px] md:text-[10px] text-zinc-400 font-bold uppercase tracking-[0.3em] mt-1">Client Station</p>
          </div>
        </div>
        
        <div className="p-6 flex items-center gap-4 bg-black/40 border-b border-white/5">
          <div className="w-10 h-10 rounded-full bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] font-bold overflow-hidden border border-[#D4AF37]/20">
            {user.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" /> : user.name[0]}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{user.name}</p>
            <p className="text-[9px] text-zinc-400 uppercase tracking-widest leading-none">Simcha Organizer</p>
          </div>
        </div>

        <nav aria-label="Client Portal Navigation" className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <NavItem id="overview" icon={LayoutDashboard} label="Dashboard" />
          <NavItem id="plan" icon={ShoppingBag} label="My Plan" badge={cart.length > 0 ? cart.length : undefined} />
          <NavItem id="events" icon={Calendar} label="My Events" badge={clientBookings.filter(b => b.status === 'pending').length || undefined} />
          <NavItem id="chats" icon={MessageSquare} label="Chats" badge={messages.filter(m => m.receiverId === user.id && !m.isRead).length || undefined} />
          <NavItem id="profile" icon={CheckCircle} label="Profile" />
        </nav>

        <div className="p-6 border-t border-white/5 bg-black">
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 text-zinc-400 hover:text-white rounded-full hover:bg-white/5 transition-colors text-xs font-black uppercase tracking-widest">
            <LogOut className="w-5 h-5" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-[#050505] p-4 pb-36 md:p-8 md:pb-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-bold font-[Cinzel] text-white capitalize tracking-tight">{activeTab}</h1>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#111] p-5 rounded-3xl border border-white/5 shadow-2xl space-y-3">
                <div className="bg-[#D4AF37]/10 p-2.5 w-fit rounded-2xl"><ShoppingBag className="w-5 h-5 text-[#D4AF37]" /></div>
                <div><p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Items in Plan</p><h3 className="text-2xl font-bold text-white">{cart.length}</h3></div>
              </div>
              <div className="bg-[#111] p-5 rounded-3xl border border-white/5 shadow-2xl space-y-3">
                <div className="bg-[#D4AF37]/10 p-2.5 w-fit rounded-2xl"><CheckCircle className="w-5 h-5 text-[#D4AF37]" /></div>
                <div><p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Confirmed</p><h3 className="text-2xl font-bold text-white">{clientBookings.filter(b => b.status === 'confirmed').length}</h3></div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'plan' && (
          <div className="max-w-4xl mx-auto w-full space-y-3 animate-in slide-in-from-bottom-5 duration-500">
            {cart.length === 0 ? (
              <div className="text-center py-14 bg-[#0a0a0a] rounded-3xl border border-dashed border-white/10">
                <ShoppingBag className="w-12 h-12 mx-auto mb-3 text-[#D4AF37]" />
                <p className="text-base font-[Cinzel] text-zinc-300">Your plan is empty.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item, index) => (
                  <div
                    key={`${item.vendor.id}-${index}`}
                    className="simcha-event-card relative overflow-hidden rounded-[2rem] border border-[#D4AF37]/35 hover:border-[#D4AF37]/75 px-5 py-4 sm:px-6 sm:py-4.5 transition-all group flex items-center justify-between gap-4 shadow-xl min-h-[104px]"
                  >
                    {/* Full Background Musician / Vendor Profile Image */}
                    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                      <img
                        src={item.vendor.image}
                        alt={item.vendor.name}
                        className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                      />
                      <div className="absolute inset-0 simcha-event-card-overlay" />
                    </div>

                    {/* Left Balanced Event & Musician Info (No broken-off text) */}
                    <div className="relative z-10 min-w-0 flex-1 flex flex-col justify-center gap-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="simcha-event-pill px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest text-[#D4AF37] border border-[#D4AF37]/40">
                          {item.vendor.category}
                        </span>
                        {item.selectedServices && item.selectedServices.length > 0 && (
                          <span className="simcha-event-pill px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest text-[#D4AF37] border border-[#D4AF37]/30">
                            {item.selectedServices.length} {item.selectedServices.length === 1 ? 'Add-on' : 'Add-ons'}
                          </span>
                        )}
                      </div>

                      <h4 className="font-bold text-base sm:text-lg text-white font-[Cinzel] group-hover:text-[#D4AF37] transition-colors leading-snug break-words drop-shadow-sm">
                        {item.vendor.name}
                      </h4>

                      <div className="text-zinc-200 text-[11px] flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-medium leading-snug">
                        <span className="inline-flex items-center gap-1 shrink-0 text-white font-semibold">
                          <Calendar className="w-3 h-3 text-[#D4AF37] shrink-0" />
                          {item.date}
                        </span>
                        {item.eventName && (
                          <>
                            <span className="text-[#D4AF37]">•</span>
                            <span className="text-zinc-100">{item.eventName}</span>
                          </>
                        )}
                        {item.eventTime && (
                          <>
                            <span className="text-[#D4AF37]">•</span>
                            <span className="text-zinc-200 shrink-0">{item.eventTime}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Right Stepped Price & Pill Actions */}
                    <div className="relative z-10 flex flex-col items-end justify-center gap-2 shrink-0">
                      <p className="text-base sm:text-xl font-bold text-[#D4AF37] font-[Cinzel] leading-none drop-shadow-sm">
                        ${item.amount.toLocaleString()}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEditCartItem(index)}
                          className="simcha-event-btn p-2 text-zinc-100 hover:bg-[#D4AF37] hover:text-black rounded-full transition-all border border-[#D4AF37]/40 cursor-pointer shadow-md"
                          title="Edit Request"
                          aria-label="Edit Request"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveFromCart(index)}
                          className="simcha-event-btn p-2 text-zinc-200 hover:bg-red-500 hover:text-white rounded-full transition-all border border-white/20 hover:border-red-500 cursor-pointer shadow-md"
                          title="Remove"
                          aria-label="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="pt-4 mt-4 bg-[#0a0a0a] p-4 sm:p-5 rounded-3xl border border-[#D4AF37]/25 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-400 font-black uppercase tracking-[0.2em] text-[10px]">Plan Subtotal</span>
                    <span className="text-xl sm:text-2xl font-bold text-[#D4AF37] font-[Cinzel]">${subtotal.toLocaleString()}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onProcessCart}
                    className="w-full sm:w-auto px-7 bg-[#D4AF37] text-black py-3 rounded-full font-black text-[11px] uppercase tracking-[0.25em] hover:bg-[#E5C76B] transition-all shadow-xl shadow-[#D4AF37]/20 cursor-pointer"
                  >
                    Send All Booking Requests
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-3 animate-in slide-in-from-bottom-5 duration-500 max-w-4xl mx-auto w-full">
            {/* Compact Horizontally Slidable Pill Category Filter with Edge Fades */}
            <div className="relative w-full overflow-hidden">
              <div className="simcha-pill-fade-left pointer-events-none absolute inset-y-0 left-0 w-7 z-10" />
              <div className="simcha-pill-fade-right pointer-events-none absolute inset-y-0 right-0 w-7 z-10" />
              <div
                className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 px-2 touch-pan-x select-none"
                role="tablist"
                aria-label="Filter booked events by category"
              >
                {eventCategories.map((cat) => {
                  const isActive = selectedEventCategory.toLowerCase() === cat.toLowerCase();
                  return (
                    <button
                      key={cat}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setSelectedEventCategory(cat)}
                      className={`shrink-0 px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border ${
                        isActive
                          ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.35)]'
                          : 'bg-black/70 text-zinc-300 border-[#D4AF37]/25 hover:border-[#D4AF37]/60 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredClientBookings.length === 0 ? (
              <div className="py-14 text-center bg-[#0a0a0a] rounded-3xl border border-dashed border-white/10">
                <Calendar className="w-12 h-12 mx-auto mb-3 text-[#D4AF37]" />
                <p className="text-base font-[Cinzel] text-zinc-300">
                  {selectedEventCategory === 'All' ? 'No active reservations.' : `No ${selectedEventCategory} events found.`}
                </p>
              </div>
            ) : filteredClientBookings.map((booking, index) => {
              const vendor = vendors.find(v => v.id === booking.vendorId);
              if (!vendor) return null;
              const countdown = getCountdown(booking.date);
              const isLatestBooking = index === 0 && selectedEventCategory === 'All';

              return (
                <div
                  key={booking.id}
                  className="simcha-event-card relative overflow-hidden rounded-[2rem] border border-[#D4AF37]/35 hover:border-[#D4AF37]/75 px-5 py-4 sm:px-6 sm:py-4.5 transition-all group flex items-center justify-between gap-4 shadow-xl min-h-[108px]"
                >
                  {/* Full Background Musician / Vendor Profile Image */}
                  <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                    <img
                      src={vendor.image}
                      alt={vendor.name}
                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 simcha-event-card-overlay" />
                  </div>

                  {/* Left Balanced Event & Vendor Details (Never broken off) */}
                  <div className="relative z-10 min-w-0 flex-1 flex flex-col justify-center gap-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isLatestBooking && (
                        <span className="px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-[#D4AF37] text-black shadow-sm">
                          Latest
                        </span>
                      )}
                      <span className="simcha-event-pill px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest text-[#D4AF37] border border-[#D4AF37]/40">
                        {vendor.category}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                        booking.status === 'confirmed' 
                          ? 'bg-green-500/25 text-green-300 border-green-500/45' 
                          : booking.status === 'cancelled'
                          ? 'bg-red-500/25 text-red-300 border-red-500/45'
                          : 'simcha-event-pill text-[#D4AF37] border-[#D4AF37]/40'
                      }`}>
                        {booking.status}
                      </span>
                      {booking.paymentStatus === 'paid' && (
                        <span className="bg-green-500/25 text-green-300 border border-green-500/45 px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">
                          Paid
                        </span>
                      )}
                      {countdown && (
                        <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                          countdown.isToday
                            ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                            : 'simcha-event-pill text-[#D4AF37] border-[#D4AF37]/40'
                        }`}>
                          {countdown.text}
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-base sm:text-lg text-white font-[Cinzel] group-hover:text-[#D4AF37] transition-colors leading-snug break-words drop-shadow-sm">
                      {vendor.name}
                    </h3>

                    <div className="text-zinc-200 text-[11px] flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-medium leading-snug">
                      <span className="inline-flex items-center gap-1 shrink-0 text-white font-semibold">
                        <Calendar className="w-3 h-3 text-[#D4AF37] shrink-0" />
                        {booking.date}
                      </span>
                      {booking.eventName && (
                        <>
                          <span className="text-[#D4AF37]">•</span>
                          <span className="text-zinc-100">{booking.eventName}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right Stepped / Staircase Layout: Top (Price + Pay), Bottom (Message) */}
                  <div className="relative z-10 flex flex-col items-end justify-center gap-2 shrink-0">
                    {/* Top Stair Step: Price next to Pay button */}
                    <div className="flex items-center justify-end gap-2">
                      <p className="text-base sm:text-xl font-bold text-[#D4AF37] font-[Cinzel] leading-none drop-shadow-sm">
                        ${booking.amount.toLocaleString()}
                      </p>
                      {booking.status === 'confirmed' && booking.paymentStatus === 'pending' && (
                        <button 
                          type="button"
                          onClick={() => handlePay(booking.id, booking.vendorId, booking.amount)}
                          disabled={isProcessingPayment}
                          className="bg-[#D4AF37] hover:bg-[#E5C76B] active:scale-95 text-black font-black px-4 py-1.5 rounded-full shadow-lg flex items-center justify-center gap-1.5 transition-all text-[10px] uppercase tracking-widest cursor-pointer"
                        >
                          {isProcessingPayment ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                          <span>Pay</span>
                        </button>
                      )}
                    </div>

                    {/* Bottom Stair Step: Message button */}
                    <button
                      type="button"
                      onClick={() => onMessageVendor(vendor)}
                      className="simcha-event-btn px-4 py-1.5 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black active:scale-95 rounded-full transition-all border border-[#D4AF37]/50 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest cursor-pointer shadow-md"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>Message</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'chats' && (
          <div className="space-y-3 animate-in fade-in duration-500">
            {chatThreads.length === 0 ? (
              <div className="bg-[#0a0a0a] rounded-full border border-dashed border-white/10 py-12 px-6 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">No Active Chats</p>
              </div>
            ) : (
              chatThreads.map(([vendorId, data], idx) => {
                const unreadInThread = data.messages.filter(m => m.receiverId === user.id && !m.isRead).length;
                const vendorPhoto = data.vendor.image;
                const initials = getVendorInitials(data.vendor.name);
                const lastMsg = data.lastMessage;
                const isLastSentByMe = lastMsg.senderId === user.id || (lastMsg as any).sender_role === 'client';
                const lastReadByMap = (lastMsg as any).read_by || {};
                const isLastReadByOther = Boolean(
                  lastMsg.isRead ||
                  Object.keys(lastReadByMap).some(k => k !== lastMsg.senderId && k !== user.id)
                );
                const isVoice = lastMsg.type === 'voice' || !!lastMsg.audioUrl;
                const isImg = lastMsg.type === 'image' || !!lastMsg.imageUrl;
                const isVid = lastMsg.type === 'file' && lastMsg.fileType?.startsWith('video/');
                const isDoc = lastMsg.type === 'file' && !lastMsg.fileType?.startsWith('video/');

                const handleOpenThread = () => {
                  const conId = lastMsg.conversationId || [user.id, vendorId].sort().filter(Boolean).join('_');
                  if (conId && user.id) {
                    markChatAsRead(conId, user.id).catch(() => {});
                  }
                  if (vendorId === 'admin' && onOpenAdminChat) {
                    onOpenAdminChat();
                  } else {
                    onMessageVendor(data.vendor);
                  }
                };

                return (
                  <div
                    key={vendorId}
                    role="button"
                    tabIndex={0}
                    onClick={handleOpenThread}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenThread();
                      }
                    }}
                    className={`simcha-event-card relative w-full overflow-hidden rounded-full border transition-all duration-300 cursor-pointer group flex items-center justify-between gap-3 px-5 sm:px-7 py-3.5 sm:py-4 min-h-[68px] sm:min-h-[74px] shadow-xl active:scale-[0.99] ${
                      unreadInThread > 0 || idx === 0
                        ? 'border-[#D4AF37] shadow-[0_0_24px_rgba(212,175,55,0.18)]'
                        : 'border-[#D4AF37]/35 hover:border-[#D4AF37]/80'
                    }`}
                  >
                    {/* Full Background: Vendor Photo OR Initials Pattern */}
                    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                      {vendorPhoto ? (
                        <>
                          <img
                            src={vendorPhoto}
                            alt={data.vendor.name}
                            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                          />
                          <div className="absolute inset-0 simcha-event-card-overlay" />
                        </>
                      ) : (
                        <div className="w-full h-full bg-gradient-to-r from-[#0c0c0c] via-[#151208] to-[#0c0c0c] flex items-center justify-center relative">
                          <span className="font-[Cinzel] font-black text-5xl sm:text-6xl tracking-[0.25em] text-[#D4AF37]/15 select-none">
                            {initials}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Left Side: Initials Badge (when no photo) + Vendor Name + Latest Message */}
                    <div className="relative z-10 flex items-center gap-3 min-w-0 flex-1">
                      {!vendorPhoto && (
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 flex items-center justify-center shrink-0 text-[#D4AF37] font-[Cinzel] font-bold text-xs sm:text-sm shadow-inner">
                          {initials}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm sm:text-base text-white font-[Cinzel] group-hover:text-[#D4AF37] transition-colors truncate drop-shadow-sm">
                            {data.vendor.name}
                          </span>
                          <AnimatePresence mode="popLayout">
                            {unreadInThread > 0 && (
                              <motion.span
                                key={`unread-client-${vendorId}-${unreadInThread}`}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                                className="bg-[#D4AF37] text-black text-[9px] font-black px-2 py-0.5 rounded-full flex-shrink-0 shadow-sm"
                              >
                                {unreadInThread}
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-zinc-200/90 truncate mt-0.5 drop-shadow-sm">
                          {isLastSentByMe && (
                            isLastReadByOther ? (
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
                              <Mic className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                              <span className="truncate">Voice note</span>
                            </>
                          ) : isImg ? (
                            <>
                              <ImageIcon className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                              <span className="truncate">{lastMsg.text && lastMsg.text !== 'Sent an image' ? lastMsg.text : 'Photo'}</span>
                            </>
                          ) : isVid ? (
                            <>
                              <Play className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                              <span className="truncate">{lastMsg.text && lastMsg.text !== 'Sent a video' ? lastMsg.text : 'Video'}</span>
                            </>
                          ) : isDoc ? (
                            <>
                              <FileText className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                              <span className="truncate">{lastMsg.fileName || 'Document'}</span>
                            </>
                          ) : (
                            <span className="truncate">{lastMsg.text || 'Tap to open chat'}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Side: Date/Time + Chevron */}
                    <div className="relative z-10 flex items-center gap-2 shrink-0">
                      <span className="simcha-event-pill px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-bold text-zinc-100 border border-white/15">
                        {new Date(lastMsg.timestamp).toLocaleDateString()}
                      </span>
                      <div className="w-7 h-7 rounded-full simcha-event-pill border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
        {activeTab === 'profile' && (
          <div className="max-w-2xl mx-auto animate-in fade-in duration-500">
            <div className="bg-[#111] rounded-3xl border border-white/5 p-8 shadow-2xl space-y-8">
              <div className="flex flex-col items-center text-center space-y-6">
                <div className="relative group">
                  <div className="w-32 h-32 rounded-full bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] text-5xl font-bold border-2 border-[#D4AF37]/30 overflow-hidden shadow-2xl">
                    {editPhotoURL ? (
                      <img src={editPhotoURL} className="w-full h-full object-cover" />
                    ) : (
                      user.name[0]
                    )}
                    {isUploadingPhoto && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
                      </div>
                    )}
                  </div>
                  
                  <div className="absolute -bottom-2 -right-2 flex gap-2">
                    <input 
                      type="file" 
                      ref={profilePhotoInputRef}
                      onChange={handleProfilePhotoUpload}
                      className="hidden"
                      accept="image/*"
                    />
                    <button 
                      onClick={() => profilePhotoInputRef.current?.click()}
                      className="p-3 bg-[#D4AF37] text-black rounded-full shadow-xl hover:scale-110 transition-transform"
                      title="Upload Photo"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                    {editPhotoURL && (
                      <button 
                        onClick={handleProfilePhotoDelete}
                        className="p-3 bg-zinc-800 text-white rounded-full shadow-xl hover:scale-110 transition-transform"
                        title="Remove Photo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-2xl font-bold text-white font-[Cinzel]">{user.name}</h3>
                  <p className="text-zinc-400 text-xs uppercase tracking-widest">{user.username}</p>
                </div>
              </div>

              <div className="space-y-6">
                {onToggleThemeMode && (
                  <div className="flex flex-col items-center justify-center gap-2.5 py-1 text-center w-full">
                    <span className="text-xs font-bold font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.2em] text-center">App Preference</span>
                    <div className="flex items-center justify-center w-full">
                      <ThemeModeSwitch
                        themeMode={themeMode}
                        onToggleThemeMode={onToggleThemeMode}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Full Name</label>
                  <input 
                    type="text" 
                    value={editName} 
                    onChange={e => setEditName(e.target.value)} 
                    className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-4 text-sm text-white outline-none focus:border-[#D4AF37]" 
                    placeholder="Your Name" 
                  />
                </div>

                <div className="pt-4 flex flex-col gap-4">
                  <button 
                    onClick={() => onUpdateProfile({ name: editName, photoURL: editPhotoURL, photoStoragePath: editPhotoStoragePath })}
                    className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-full hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl"
                  >
                    Save Profile Info
                  </button>
                  
                  <div className="pt-8 border-t border-white/5">
                    <button 
                      onClick={onDeleteAccount}
                      className="w-full bg-zinc-800 text-zinc-400 border border-zinc-400/20 font-black py-4 rounded-full hover:bg-zinc-800 hover:text-white transition-all uppercase tracking-[0.2em] text-xs"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      {/* Embedded Stripe Paywall Modal */}
      {checkoutClientSecret && (
        <EmbeddedCheckoutModal
          clientSecret={checkoutClientSecret}
          bookingId={checkoutBookingInfo?.id}
          amount={checkoutBookingInfo?.amount}
          vendorName={checkoutBookingInfo?.vendorName}
          onClose={() => {
            setCheckoutClientSecret(null);
            setCheckoutBookingInfo(null);
          }}
        />
      )}

      {/* Fullscreen Media Viewer */}
      <AnimatePresence>
        {fullscreenMedia && (
          <motion.div 
            role="dialog"
            aria-modal="true"
            aria-label="Media Preview"
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

export default ClientPortal;