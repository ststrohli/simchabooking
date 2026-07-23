import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, ShoppingBag, Calendar, MessageSquare, LogOut, Trash2, 
  ChevronRight, MapPin, Clock, CreditCard, CheckCircle, Bell, X, Menu, Send,
  FileText, Upload, Download, Loader2, Plus, Search, Edit3, ArrowLeft
} from 'lucide-react';
import { CartItem, Booking, Message, Vendor, UserAccount } from '../types';
import PayPalButton from './PayPalButton';
import { storage, db } from '../services/firebase';
import { markChatAsRead } from '../services/messagingService';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { uploadFileRobustly } from '../services/uploadService';
import { CustomAudioPlayer } from './CustomAudioPlayer';
import { trackFunnelStep } from '../services/analyticsService';
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
}

const ClientPortal: React.FC<ClientPortalProps> = ({ 
  user, cart, bookings, messages, vendors, onRemoveFromCart, onEditCartItem, onProcessCart, onPaymentSuccess, onLogout, onClose, onUpdateProfile, onDeleteAccount, onMessageVendor
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'plan' | 'events' | 'chats' | 'profile'>('overview');

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
    try {
      trackFunnelStep.initiatePayment(bookingId, vendorId, amount, 'Stripe');
      const response = await fetch(`/api/stripe/create-checkout-session?vendorId=${vendorId}&amount=${amount}&bookingId=${bookingId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create checkout session');
      }
      const data = await response.json();
      if (data.url) {
        // BREAKOUT: Try window.top.location.href first, fallback to window.open if blocked
        try {
          window.top!.location.href = data.url;
        } catch (e) {
          console.warn('window.top navigation blocked, falling back to window.open', e);
          window.open(data.url, '_blank');
        }
      }
    } catch (error: any) {
      console.error('Payment Error:', error);
      alert(`Payment Error: ${error.message || 'Failed to start payment. Please try again.'}`);
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

  const clientBookings = bookings.filter(b => b.contactEmail === user.username || b.clientName === user.name);
  
  // Group messages by vendor for the chat hub
  const chatThreads = useMemo(() => {
    const groups: Record<string, { vendor: Vendor, messages: Message[], lastMessage: Message }> = {};
    messages.forEach(m => {
      const vendorId = m.senderId === user.id ? m.receiverId : m.senderId;
      let vendor = vendors.find(v => v.id === vendorId);
      
      // If the chat is with the admin, create a mock vendor for the thread
      if (vendorId === 'admin' || m.isAdminInquiry || m.receiverId === 'admin') {
        vendor = {
          id: 'admin',
          name: 'Simcha Admin',
          category: 'Support',
          description: 'Direct support from the Simcha platform.',
          priceRange: 'N/A',
          location: 'System',
          image: '',
          rating: 5,
          reviews: []
        } as unknown as Vendor;
      }

      if (vendor) {
        const actualVendorId = vendor.id || 'admin';
        if (!groups[actualVendorId]) {
          groups[actualVendorId] = { vendor, messages: [], lastMessage: m };
        }
        groups[actualVendorId].messages.push(m);
        if (new Date(m.timestamp) > new Date(groups[actualVendorId].lastMessage.timestamp)) {
          groups[actualVendorId].lastMessage = m;
        }
      }
    });
    return Object.entries(groups).sort((a, b) => 
      new Date(b[1].lastMessage.timestamp).getTime() - new Date(a[1].lastMessage.timestamp).getTime()
    );
  }, [messages, vendors, user.id]);

  // Auto-select the first thread (the one with the most recent message) when activeTab is chats and no thread is selected
  useEffect(() => {
    if (activeTab === 'chats' && !selectedThreadVendorId && chatThreads.length > 0) {
      setSelectedThreadVendorId(chatThreads[0][0]);
    }
  }, [activeTab, selectedThreadVendorId, chatThreads]);

  // Automatically mark unread messages as read when viewing a thread
  useEffect(() => {
    if (selectedThreadVendorId && activeTab === 'chats') {
      const thread = chatThreads.find(t => t[0] === selectedThreadVendorId);
      if (thread) {
        const firstMsg = thread[1].messages[0];
        if (firstMsg) {
          const conId = firstMsg.conversationId || [user.id, selectedThreadVendorId].sort().filter(Boolean).join('_');
          markChatAsRead(conId, user.id).catch(err => {
            console.error("Error setting thread as read:", err);
          });
        }
      }
    }
  }, [selectedThreadVendorId, activeTab, chatThreads]);

  const [otherIsTyping, setOtherIsTyping] = useState(false);

  useEffect(() => {
    if (!selectedThreadVendorId || !user.id || activeTab !== 'chats') {
      setOtherIsTyping(false);
      return;
    }
    const activeConversationId = [user.id, selectedThreadVendorId].sort().join('_');
    const unsub = onSnapshot(doc(db, 'conversations', activeConversationId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const typing = data?.typing || {};
        const otherTyping = typing[selectedThreadVendorId] || false;
        setOtherIsTyping(otherTyping);
      } else {
        setOtherIsTyping(false);
      }
    }, (err) => {
      console.warn("Error listening to conversation document:", err);
    });
    return () => unsub();
  }, [selectedThreadVendorId, user.id, activeTab]);

  const subtotal = cart.reduce((sum, item) => sum + item.amount, 0);

  const NavItem = ({ id, icon: Icon, label, badge }: { id: typeof activeTab, icon: any, label: string, badge?: number }) => (
    <button 
      onClick={() => { handleTabChange(id); setIsSidebarOpen(false); }} 
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === id ? 'bg-[#D4AF37] text-black font-bold shadow-lg' : 'text-zinc-500 hover:text-[#D4AF37] hover:bg-white/5'}`}
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
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col md:flex-row overflow-hidden relative">
      {/* Mobile Header Toggle */}
      <div className="md:hidden bg-[#0a0a0a] border-b border-[#D4AF37]/10 p-4 flex justify-between items-center z-30 sticky top-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#D4AF37] rounded-lg flex items-center justify-center text-black font-bold font-[Cinzel]">P</div>
          <h2 className="text-[#D4AF37] font-bold font-[Cinzel] tracking-widest uppercase text-sm">Planner</h2>
        </div>
        <div className="flex items-center gap-2">
          {!isSidebarOpen && (
            <button 
              onClick={() => setIsSidebarOpen(true)} 
              className="text-[#D4AF37] p-2 bg-white/5 rounded-lg transition-all hover:bg-white/10"
              aria-label="Toggle navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-300"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsSidebarOpen(false); }}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0a0a0a] border-r border-[#D4AF37]/10 flex flex-col transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 md:h-screen md:sticky md:top-0 shadow-2xl`}>
        <div className="p-6 md:p-8 flex items-center justify-between border-b border-white/5">
          <div>
            <h2 className="text-xl md:text-2xl font-bold font-[Cinzel] text-[#D4AF37] uppercase tracking-tighter">Planner</h2>
            <p className="text-[9px] md:text-[10px] text-zinc-600 font-bold uppercase tracking-[0.3em] mt-1">Client Station</p>
          </div>
          <button 
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsSidebarOpen(false); }} 
            className="md:hidden z-[9999] p-3 cursor-pointer relative pointer-events-auto"
            aria-label="Close sidebar"
          >
            <X className="text-zinc-400 hover:text-white w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 flex items-center gap-4 bg-black/40 border-b border-white/5">
          <div className="w-10 h-10 rounded-full bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] font-bold overflow-hidden border border-[#D4AF37]/20">
            {user.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" /> : user.name[0]}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{user.name}</p>
            <p className="text-[9px] text-zinc-500 uppercase tracking-widest leading-none">Simcha Organizer</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <NavItem id="overview" icon={LayoutDashboard} label="Dashboard" />
          <NavItem id="plan" icon={ShoppingBag} label="My Plan" badge={cart.length > 0 ? cart.length : undefined} />
          <NavItem id="events" icon={Calendar} label="My Events" badge={clientBookings.filter(b => b.status === 'pending').length || undefined} />
          <NavItem id="chats" icon={MessageSquare} label="Chats" badge={messages.filter(m => m.receiverId === user.id && !m.isRead).length || undefined} />
          <NavItem id="profile" icon={CheckCircle} label="Profile" />
        </nav>

        <div className="p-6 border-t border-white/5 bg-black">
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 text-zinc-500 hover:text-zinc-400 transition-colors text-xs font-black uppercase tracking-widest">
            <LogOut className="w-5 h-5" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-[#050505] p-6 md:p-10">
        <header className="mb-10 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div className="flex flex-col items-start gap-4">
            <button onClick={onClose} className="text-[#D4AF37] hover:text-[#E5C76B] font-bold text-[10px] uppercase tracking-widest flex items-center gap-1.5 transition-colors border border-[#D4AF37]/30 px-3 py-1.5 rounded-full hover:bg-[#D4AF37]/10 w-fit">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Marketplace
            </button>
            <div>
              <h1 className="text-3xl font-bold font-[Cinzel] text-white capitalize tracking-tight">{activeTab}</h1>
              <p className="text-[#D4AF37]/60 text-[10px] font-black uppercase tracking-[0.4em] mt-1.5">Managing your celebrations</p>
            </div>
          </div>
        </header>

        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-[#111] p-6 rounded-3xl border border-white/5 shadow-2xl space-y-4">
                <div className="bg-[#D4AF37]/10 p-3 w-fit rounded-2xl"><ShoppingBag className="w-6 h-6 text-[#D4AF37]" /></div>
                <div><p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">Items in Plan</p><h3 className="text-3xl font-bold text-white">{cart.length}</h3></div>
              </div>
              <div className="bg-[#111] p-6 rounded-3xl border border-white/5 shadow-2xl space-y-4">
                <div className="bg-[#D4AF37]/10 p-3 w-fit rounded-2xl"><CheckCircle className="w-6 h-6 text-[#D4AF37]" /></div>
                <div><p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">Confirmed Events</p><h3 className="text-3xl font-bold text-white">{clientBookings.filter(b => b.status === 'confirmed').length}</h3></div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'plan' && (
          <div className="max-w-4xl animate-in slide-in-from-bottom-5 duration-500">
            {cart.length === 0 ? (
              <div className="text-center py-20 bg-[#111] rounded-3xl border border-dashed border-white/10 opacity-30">
                <ShoppingBag className="w-16 h-16 mx-auto mb-6 text-[#D4AF37]" />
                <p className="text-xl font-[Cinzel]">Your plan is empty.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {cart.map((item, index) => (
                  <div key={`${item.vendor.id}-${index}`} className="flex flex-col sm:flex-row gap-5 p-6 bg-[#111] rounded-3xl border border-[#D4AF37]/10 group transition-all items-center">
                    <img src={item.vendor.image} alt="" className="w-24 h-24 rounded-2xl object-cover border border-white/5" />
                    <div className="flex-1 min-w-0 text-center sm:text-left">
                      <h4 className="font-bold text-xl text-zinc-100 font-[Cinzel]">{item.vendor.name}</h4>
                      <p className="text-[10px] text-[#D4AF37] font-black uppercase tracking-widest mt-1">{item.vendor.category}</p>
                      
                      <div className="mt-3 flex flex-wrap justify-center sm:justify-start gap-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                        <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" />{item.date}</div>
                        <div className="flex items-center gap-2 text-[#D4AF37]"><CreditCard className="w-3.5 h-3.5" />${item.amount.toLocaleString()}</div>
                      </div>

                      {/* Display full filled-out details for verification and editing */}
                      <div className="mt-4 bg-black/40 p-4 rounded-xl border border-white/5 text-[11px] text-zinc-300 space-y-1.5 text-left max-w-md">
                        <div><span className="text-zinc-500 uppercase tracking-wider font-bold">Event Name:</span> {item.eventName}</div>
                        {item.eventTime && <div><span className="text-zinc-500 uppercase tracking-wider font-bold">Event Time:</span> {item.eventTime}</div>}
                        {item.eventLocation && <div><span className="text-zinc-500 uppercase tracking-wider font-bold">Location:</span> {item.eventLocation}</div>}
                        <div><span className="text-zinc-500 uppercase tracking-wider font-bold">Client Name:</span> {item.clientName}</div>
                        <div><span className="text-zinc-500 uppercase tracking-wider font-bold">Client Email:</span> {item.contactEmail}</div>
                        {item.notes && <div><span className="text-zinc-500 uppercase tracking-wider font-bold">Notes:</span> <span className="italic text-zinc-400">"{item.notes}"</span></div>}
                        {item.selectedServices && item.selectedServices.length > 0 && (
                          <div className="pt-2 border-t border-white/5 mt-2">
                            <span className="text-[#D4AF37] uppercase tracking-wider font-bold text-[9px]">Selected Services:</span>
                            <ul className="list-disc pl-4 mt-1 space-y-0.5 text-[10px] text-zinc-400">
                              {item.selectedServices.map(s => (
                                <li key={s.id}>{s.name} x {s.quantity} (${(s.price * s.quantity).toLocaleString()})</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button onClick={() => onEditCartItem(index)} className="p-3 bg-zinc-800 text-zinc-300 hover:bg-[#D4AF37] hover:text-black rounded-xl transition-all border border-zinc-700 hover:border-[#D4AF37]/50" title="Edit Request">
                        <Edit3 className="w-5 h-5" />
                      </button>
                      <button onClick={() => onRemoveFromCart(index)} className="p-3 bg-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white rounded-xl transition-all border border-zinc-500/20" title="Remove">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="pt-8 border-t border-[#D4AF37]/20 mt-10">
                  <div className="flex justify-between items-center mb-8">
                    <span className="text-zinc-400 font-black uppercase tracking-[0.2em] text-xs">Plan Subtotal</span>
                    <span className="text-4xl font-bold text-[#D4AF37] font-[Cinzel]">${subtotal.toLocaleString()}</span>
                  </div>
                  <button onClick={onProcessCart} className="w-full bg-[#D4AF37] text-black py-5 rounded-2xl font-black text-sm uppercase tracking-[0.3em] hover:bg-[#E5C76B] transition-all shadow-xl shadow-[#D4AF37]/10">
                    Send All Booking Requests
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-500">
            {clientBookings.length === 0 ? (
              <div className="py-20 text-center bg-[#111] rounded-3xl border border-dashed border-white/10 opacity-30">
                <Calendar className="w-16 h-16 mx-auto mb-6 text-[#D4AF37]" />
                <p className="text-xl font-[Cinzel]">No active reservations.</p>
              </div>
            ) : clientBookings.map((booking) => {
              const vendor = vendors.find(v => v.id === booking.vendorId);
              if (!vendor) return null;
              const countdown = getCountdown(booking.date);
              return (
                <div key={booking.id} className="bg-[#111] border border-[#D4AF37]/10 rounded-3xl p-8 flex flex-col md:flex-row gap-8 items-center group">
                  <img src={vendor.image} className="w-28 h-28 rounded-2xl object-cover border border-white/5" alt="" />
                  <div className="flex-1 text-center md:text-left">
                    <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-4">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                        booking.status === 'confirmed' 
                          ? 'bg-green-500/10 text-green-500 border-green-500/30' 
                          : booking.status === 'cancelled'
                          ? 'bg-red-500/10 text-red-500 border-red-500/30'
                          : 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/25'
                      }`}>{booking.status}</span>
                      {booking.paymentStatus === 'paid' && (
                        <span className="bg-green-500/10 text-green-500 border border-green-500/30 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
                          Paid
                        </span>
                      )}
                      {countdown && (
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${countdown.isToday ? 'bg-[#D4AF37] text-white border-[#D4AF37]' : 'text-[#D4AF37] border-[#D4AF37]/20'}`}>
                          {countdown.text}
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-2xl text-zinc-100 font-[Cinzel] group-hover:text-[#D4AF37] transition-colors">{vendor.name}</h3>
                    <p className="text-zinc-400 text-sm font-medium mt-2 flex items-center justify-center md:justify-start gap-2">
                      <Calendar className="w-4 h-4 text-[#D4AF37]/40" /> {booking.date} • {booking.eventName}
                    </p>
                  </div>
                  <div className="text-center md:text-right min-w-[200px]">
                    <p className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-1">Service Fee</p>
                    <p className="text-3xl font-bold text-[#D4AF37]">${booking.amount.toLocaleString()}</p>
                    <div className="flex flex-col gap-3 mt-6">
                      <button onClick={() => onMessageVendor(vendor)} className="w-full px-4 py-3 bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-[#D4AF37] rounded-xl transition-all border border-[#D4AF37]/20 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest">
                        <MessageSquare className="w-4 h-4" /> Message Professional
                      </button>
                      {booking.status === 'confirmed' && booking.paymentStatus === 'pending' && (
                        <>
                          <PayPalButton 
                            amount={booking.amount} 
                            onSuccess={() => onPaymentSuccess(booking.id, 'PayPal')} 
                            onClick={() => trackFunnelStep.initiatePayment(booking.id, booking.vendorId, booking.amount, 'PayPal')}
                          />
                          {(vendor.stripeConnected || vendor.stripeAccountId) && (
                            <button 
                              onClick={() => handlePay(
                                booking.id, 
                              booking.vendorId, 
                              booking.amount
                            )}
                            disabled={isProcessingPayment}
                            className="bg-black hover:bg-zinc-900 text-white font-bold px-4 py-3 rounded-full shadow-sm flex items-center justify-center gap-2 transition-colors text-sm border border-zinc-700 w-full"
                          >
                            {isProcessingPayment ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CreditCard className="w-4 h-4" />
                            )}
                            Pay with Card
                          </button>
                        )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'chats' && (
          <div className="flex flex-col lg:flex-row bg-[#111] rounded-3xl border border-white/5 shadow-2xl overflow-hidden min-h-[500px] animate-in fade-in duration-500">
             {/* Thread List */}
             <div className="w-full lg:w-80 border-r border-white/5 bg-black/20 overflow-y-auto">
                <div className="p-6 border-b border-white/5 bg-black/40">
                  <h3 className="text-xs font-black text-[#D4AF37] uppercase tracking-widest">Conversations</h3>
                </div>
                {chatThreads.length === 0 ? (
                  <div className="p-10 text-center opacity-20">
                    <MessageSquare className="w-10 h-10 mx-auto mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No Active Chats</p>
                  </div>
                ) : chatThreads.map(([vendorId, data]) => {
                  const unreadInThread = data.messages.filter(m => m.receiverId === user.id && !m.isRead).length;
                  return (
                    <button 
                      key={vendorId}
                      onClick={() => setSelectedThreadVendorId(vendorId)}
                      className={`w-full p-6 text-left border-b border-white/5 transition-all hover:bg-white/5 ${selectedThreadVendorId === vendorId ? 'bg-[#D4AF37]/5 border-l-4 border-l-[#D4AF37]' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex items-center gap-1.5 truncate max-w-[70%]">
                          <span className="font-bold text-white text-sm truncate">{data.vendor.name}</span>
                          <AnimatePresence mode="popLayout">
                            {unreadInThread > 0 && (
                              <motion.span
                                key={`unread-client-${vendorId}-${unreadInThread}`}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                                className="bg-zinc-800 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0 animate-pulse"
                              >
                                {unreadInThread}
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </div>
                        <span className="text-[8px] text-zinc-500">{new Date(data.lastMessage.timestamp).toLocaleDateString()}</span>
                      </div>
                      <p className="text-[10px] text-[#D4AF37] uppercase tracking-widest truncate mb-2">{data.vendor.category}</p>
                      <p className="text-xs text-zinc-400 line-clamp-1 italic">"{data.lastMessage.text}"</p>
                    </button>
                  );
                })}
             </div>

             {/* Chat Pane */}
             <div className="flex-1 flex flex-col bg-black/40">
                {selectedThreadVendorId ? (
                  <>
                    {(() => {
                       const activeThread = chatThreads.find(t => t[0] === selectedThreadVendorId);
                       const displayVendor = activeThread?.[1].vendor;
                       return (
                         <div className="p-6 border-b border-white/5 bg-black/40 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                               {displayVendor?.image ? (
                                 <img src={displayVendor.image} className="w-10 h-10 rounded-full object-cover border border-[#D4AF37]/30 animate-in fade-in duration-300" alt="" />
                               ) : (
                                 <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 flex items-center justify-center border border-[#D4AF37]/30 text-[#D4AF37] font-black text-xs animate-in fade-in duration-300">
                                   {displayVendor?.name?.[0] || 'A'}
                                 </div>
                               )}
                               <div>
                                   <h4 className="font-bold text-white leading-tight">{displayVendor?.name || 'Simcha Admin'}</h4>
                                   <p className="text-[10px] text-[#D4AF37] uppercase tracking-widest mt-0.5">{displayVendor?.category || 'Support'}</p>
                               </div>
                            </div>
                         </div>
                       );
                    })()}

                    <div className="flex-1 overflow-y-auto p-8 space-y-6" id="client-chat-scroll-container">
                      {chatThreads.find(t => t[0] === selectedThreadVendorId)?.[1].messages.sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).map(m => {
                        const isSent = m.senderId === user.id;
                        return (
                          <motion.div 
                            key={m.id || m.tempId} 
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-[70%] p-4 rounded-[20px] transition-all duration-300 relative ${
                              isSent 
                                ? 'bg-[#D4AF37] text-black shadow-md' 
                                : 'bg-zinc-900 text-white border border-zinc-800 shadow-md'
                            }`}>
                               {m.type === 'image' || m.imageUrl ? (
                                  <div className="space-y-2 cursor-pointer" onClick={() => setFullscreenMedia({url: m.imageUrl || m.fileUrl || '', type: 'image'})}>
                                    <img 
                                      src={m.imageUrl || m.fileUrl} 
                                      onLoad={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })} 
                                      className="rounded-lg w-full max-h-60 object-cover border border-white/5 shadow-lg" 
                                      alt="Sent" 
                                    />
                                    {m.text && m.text !== 'Sent an image' && <p className="text-sm">{m.text}</p>}
                                  </div>
                                ) : m.type === 'voice' || m.audioUrl ? (
                                  <div className="space-y-1">
                                    <p className={`text-[9px] font-bold uppercase tracking-wider mb-1 ${isSent ? 'text-black/60' : 'text-zinc-400'}`}>Voice Note</p>
                                    <CustomAudioPlayer src={m.audioUrl || m.fileUrl || ''} theme={isSent ? 'sent' : 'received'} />
                                  </div>
                                ) : m.type === 'file' ? (
                                  m.fileType?.startsWith('video/') ? (
                                     <div className="space-y-2 cursor-pointer" onClick={() => setFullscreenMedia({url: m.fileUrl || '', type: 'video'})}>
                                       <video src={m.fileUrl} className="w-full aspect-video rounded-lg object-cover bg-black" />
                                       {m.text && m.text !== 'Sent a video' && <p className="text-sm">{m.text}</p>}
                                     </div>
                                  ) : (
                                  <a href={m.fileUrl} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-3 p-3 rounded-xl transition-all text-sm ${isSent ? 'bg-black/10 hover:bg-black/20 text-black' : 'bg-black/30 hover:bg-black/40 text-white'}`}>
                                    <FileText className="w-8 h-8 opacity-60 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                       <p className="truncate font-bold text-xs">{m.fileName || 'Document'}</p>
                                       <p className="text-[10px] opacity-60">Click to download</p>
                                    </div>
                                    <Download className="w-4 h-4 opacity-60 flex-shrink-0" />
                                  </a>
                                  )
                                ) : (
                                  <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{m.text}</p>
                                )}

                               <div className="flex justify-end items-center gap-1 mt-2 select-none leading-none">
                                 <span className={`text-[9px] font-medium opacity-65 ${isSent ? 'text-black/75' : 'text-zinc-400'}`}>
                                   {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                 </span>
                                 {isSent && (
                                   <span className={`text-[10px] ${m.isRead ? 'text-[#D4AF37]' : 'text-black/40'}`}>
                                     <CheckCircle className="w-3 h-3" />
                                   </span>
                                 )}
                               </div>
                            </div>
                          </motion.div>
                        );
                      })}
                      {otherIsTyping && (
                        <div className="flex justify-start px-2 py-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                          <div className="bg-zinc-900 border border-[#D4AF37]/10 text-[#D4AF37] px-4 py-2.5 rounded-[20px] text-[11px] flex items-center gap-3 shadow-lg">
                            <span className="font-semibold">
                              {(chatThreads.find(t => t[0] === selectedThreadVendorId)?.[1].vendor.name) || 'Professional'} is typing
                            </span>
                            <div className="flex items-center gap-1 mt-0.5" aria-hidden="true">
                              <motion.span
                                animate={{ opacity: [0.3, 1, 0.3] }}
                                transition={{ repeat: Infinity, duration: 1.2, delay: 0 }}
                                className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]"
                              />
                              <motion.span
                                animate={{ opacity: [0.3, 1, 0.3] }}
                                transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }}
                                className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]"
                              />
                              <motion.span
                                animate={{ opacity: [0.3, 1, 0.3] }}
                                transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }}
                                className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                    
                    <div className="p-6 bg-black/40 border-t border-white/5 italic text-[10px] text-zinc-500 text-center">
                       Replying to vendors is currently available via the Vendor cards in the Marketplace.
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-10 opacity-20">
                    <MessageSquare className="w-16 h-16 mb-4" />
                    <p className="text-sm font-[Cinzel] uppercase tracking-widest">Select a professional to view history</p>
                  </div>
                )}
             </div>
          </div>
        )}
        {activeTab === 'profile' && (
          <div className="max-w-2xl animate-in fade-in duration-500">
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
                  <p className="text-zinc-500 text-xs uppercase tracking-widest">{user.username}</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest ml-1">Full Name</label>
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
                    className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-xl hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl"
                  >
                    Save Profile Info
                  </button>
                  
                  <div className="pt-8 border-t border-white/5">
                    <button 
                      onClick={onDeleteAccount}
                      className="w-full bg-zinc-800 text-zinc-400 border border-zinc-500/20 font-black py-4 rounded-xl hover:bg-zinc-800 hover:text-white transition-all uppercase tracking-[0.2em] text-xs"
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

export default ClientPortal;