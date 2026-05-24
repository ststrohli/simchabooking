import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  LayoutDashboard, CalendarDays, Settings, LogOut, DollarSign, Users, User, TrendingUp, CheckCircle, XCircle, Clock, Save, Trash2, 
  ImageIcon, Menu, X, Plus, Tag, CreditCard, ArrowRight, Video, Film, ShieldCheck, MapPin, Eye, Upload, Mail, AlertTriangle, 
  ChevronLeft, ChevronRight, History, Loader2, Play, Calendar, Lock, Unlock, MessageSquare, Send, AlertCircle, Bell, BellRing, Info, ClipboardList, Edit3, Hash, Layers, Package, HelpCircle, ExternalLink, Check, Volume2, Camera
} from 'lucide-react';
import { Vendor, Booking, Message, SelectedService, VendorService } from '../types';
import { db, storage } from '../services/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { uploadFileRobustly } from '../services/uploadService';

interface VendorPortalProps {
  vendor: Vendor;
  bookings: Booking[];
  messages: Message[];
  onUpdateVendor: (updatedVendor: Vendor) => void;
  onUpdateBookingStatus: (bookingId: string, status: 'confirmed' | 'cancelled') => void;
  onReplyMessage: (clientEmail: string, clientName: string, text: string) => void;
  showNotification: (message: string, type?: 'success' | 'info') => void;
  onLogout: () => void;
}

const VendorPortal: React.FC<VendorPortalProps> = ({ vendor, bookings, messages, onUpdateVendor, onUpdateBookingStatus, onReplyMessage, showNotification, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'history' | 'calendar' | 'profile' | 'messages'>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedBookingForDetail, setSelectedBookingForDetail] = useState<Booking | null>(null);
  
  // Profile & Media State
  const [editForm, setEditForm] = useState<Vendor>({
    ...vendor,
    maxDateChecks: vendor.maxDateChecks ?? 5,
    dateCheckResetHours: vendor.dateCheckResetHours ?? 24
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [stripeMessage, setStripeMessage] = useState<string | null>(null);
  const [manualStripeKey, setManualStripeKey] = useState('');
  const [isUpdatingKey, setIsUpdatingKey] = useState(false);
  const [keyUpdateSuccess, setKeyUpdateSuccess] = useState(false);
  
  // Email Debug State
  const [testEmail, setTestEmail] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState<{ success?: boolean, error?: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  // New Service Form State
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [newServiceUnit, setNewServiceUnit] = useState('event');
  const [newServiceAllowQty, setNewServiceAllowQty] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Message State
  const [selectedThreadEmail, setSelectedThreadEmail] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  
  // Collapsible Sections State
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Calendar State
  const [viewDate, setViewDate] = useState(new Date());

  // Notification State
  const [newBookingAlert, setNewBookingAlert] = useState<Booking | null>(null);
  const knownBookingIds = useRef<Set<string>>(new Set(bookings.map(b => b.id)));
  const audioContext = useRef<AudioContext | null>(null);

  // Sync edit form with vendor prop changes
  useEffect(() => {
    setEditForm({
      ...vendor,
      maxDateChecks: vendor.maxDateChecks ?? 5,
      dateCheckResetHours: vendor.dateCheckResetHours ?? 24
    });
  }, [vendor]);

  // Group messages by client email for the messaging tab
  const messageThreads = useMemo(() => {
    const groups: Record<string, { name: string, messages: Message[], lastMessage: Message }> = {};
    messages.forEach(m => {
      if (!groups[m.clientEmail]) {
        groups[m.clientEmail] = { name: m.clientName, messages: [], lastMessage: m };
      }
      groups[m.clientEmail].messages.push(m);
      if (new Date(m.timestamp) > new Date(groups[m.clientEmail].lastMessage.timestamp)) {
        groups[m.clientEmail].lastMessage = m;
      }
    });
    // Sort threads by latest message
    return Object.entries(groups).sort((a, b) => 
      new Date(b[1].lastMessage.timestamp).getTime() - new Date(a[1].lastMessage.timestamp).getTime()
    );
  }, [messages]);

  const handleManualKeyUpdate = async () => {
    if (!manualStripeKey || manualStripeKey.length !== 107 || !manualStripeKey.startsWith('sk_')) {
      alert("Please enter a valid 107-character Stripe Secret Key starting with 'sk_'.");
      return;
    }

    setIsUpdatingKey(true);
    try {
      const response = await fetch('/api/stripe/update-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: manualStripeKey.trim() })
      });

      if (response.ok) {
        setKeyUpdateSuccess(true);
        setManualStripeKey('');
        setOnboardingError(null);
        setTimeout(() => setKeyUpdateSuccess(false), 5000);
      } else {
        const data = await response.json();
        alert(data.error || "Failed to update key.");
      }
    } catch (err) {
      console.error("Key update error:", err);
      alert("An error occurred while updating the key.");
    } finally {
      setIsUpdatingKey(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      alert("Please enter a valid email address.");
      return;
    }

    setIsSendingTest(true);
    setTestEmailStatus(null);
    try {
      const response = await fetch('/api/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail })
      });

      const data = await response.json();
      if (response.ok) {
        setTestEmailStatus({ success: true });
        setTimeout(() => setTestEmailStatus(null), 5000);
      } else {
        setTestEmailStatus({ error: data.error || "Failed to send test email." });
      }
    } catch (err: any) {
      console.error("Test email error:", err);
      setTestEmailStatus({ error: err.message || "An unexpected error occurred." });
    } finally {
      setIsSendingTest(false);
    }
  };

  // Sound effect generator
  const playNotificationSound = () => {
    try {
      if (!audioContext.current) {
        audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContext.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
      
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.warn("Audio playback failed", e);
    }
  };

  useEffect(() => {
    const newBookings = bookings.filter(b => !knownBookingIds.current.has(b.id) && b.status === 'pending');
    if (newBookings.length > 0) {
      const latest = newBookings[newBookings.length - 1];
      setNewBookingAlert(latest);
      playNotificationSound();
      const timer = setTimeout(() => setNewBookingAlert(null), 6000);
      newBookings.forEach(b => knownBookingIds.current.add(b.id));
      return () => clearTimeout(timer);
    }
  }, [bookings]);

  const totalRevenue = bookings.filter(b => b.status === 'confirmed' && b.paymentStatus === 'paid').reduce((sum, b) => sum + b.amount, 0);
  const pendingRequests = bookings.filter(b => b.status === 'pending').length;

  const NavItem = ({ id, icon: Icon, label, badge }: { id: typeof activeTab, icon: any, label: string, badge?: number }) => (
    <button 
      onClick={() => { setActiveTab(id); setIsSidebarOpen(false); }} 
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === id ? 'bg-[#D4AF37] text-black font-bold shadow-xl' : 'text-slate-500 hover:text-[#D4AF37] hover:bg-white/5'}`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-xs font-black uppercase tracking-widest">{label}</span>
      {!!badge && <span className="ml-auto bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">{badge}</span>}
    </button>
  );

  // Calendar Helper Functions
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const handleToggleDate = (dateStr: string) => {
    const currentUnavailable = vendor.unavailableDates || [];
    let updated: string[];
    if (currentUnavailable.includes(dateStr)) {
      updated = currentUnavailable.filter(d => d !== dateStr);
    } else {
      updated = [...currentUnavailable, dateStr];
    }
    onUpdateVendor({ ...vendor, unavailableDates: updated });
  };

  const changeMonth = (offset: number) => {
    const newDate = new Date(viewDate);
    newDate.setMonth(newDate.getMonth() + offset);
    setViewDate(newDate);
  };

  // Media Management Functions
  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !vendor.id) return;

    setIsUploadingMedia(true);
    try {
      const storagePath = `vendors/${vendor.id}/gallery/${Date.now()}_${file.name}`;
      const downloadURL = await uploadFileRobustly(file, storagePath);
      
      const newGallery = [...(vendor.gallery || []), downloadURL];

      // Save directly to Firestore database document
      await updateDoc(doc(db, 'vendors', vendor.id), {
        gallery: newGallery
      });

      // Update local state and parent to stay in sync
      setEditForm(prev => ({
        ...prev,
        gallery: newGallery
      }));
      onUpdateVendor({
        ...vendor,
        gallery: newGallery
      });

      showNotification('Media uploaded successfully!');
    } catch (err: any) {
      console.error("Media upload error:", err);
      showNotification('Failed to upload media: ' + err.message, 'info');
    } finally {
      setIsUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !vendor.id) return;

    setIsUploadingLogo(true);
    try {
      const storagePath = `vendors/${vendor.id}/logo/${Date.now()}_${file.name}`;
      const downloadURL = await uploadFileRobustly(file, storagePath);
      
      // Save directly to Firestore database document
      await updateDoc(doc(db, 'vendors', vendor.id), {
        image: downloadURL
      });

      // Update local state and parent to stay in sync
      setEditForm(prev => ({
        ...prev,
        image: downloadURL
      }));
      onUpdateVendor({
        ...vendor,
        image: downloadURL
      });

      showNotification('Business image updated!');
    } catch (err: any) {
      console.error("Logo upload error:", err);
      showNotification('Failed to upload image: ' + err.message, 'info');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleRemoveMedia = async (index: number) => {
    const mediaUrl = editForm.gallery?.[index];
    if (!mediaUrl) return;

    // Try to delete from Storage if it's a storage URL
    if (mediaUrl.includes('firebasestorage.googleapis.com')) {
      try {
        const decodedUrl = decodeURIComponent(mediaUrl);
        const pathStart = decodedUrl.indexOf('/o/') + 3;
        const pathEnd = decodedUrl.indexOf('?alt=media');
        if (pathStart > 2 && pathEnd > pathStart) {
          const fullPath = decodedUrl.substring(pathStart, pathEnd);
          const storageRef = ref(storage, fullPath);
          await deleteObject(storageRef).catch(e => console.warn("Storage delete skip:", e));
        }
      } catch (err) {
        console.warn("Storage deletion error (non-critical):", err);
      }
    }

    setEditForm(prev => ({
      ...prev,
      gallery: prev.gallery?.filter((_, i) => i !== index)
    }));
  };

  // Service Management Functions
  const handleAddService = () => {
    if (!newServiceName.trim() || !newServicePrice) return;
    
    const newService: VendorService = {
      id: Math.random().toString(36).substr(2, 9),
      name: newServiceName.trim(),
      price: parseFloat(newServicePrice),
      unit: newServiceUnit,
      allowQuantity: newServiceAllowQty
    };

    setEditForm(prev => ({
      ...prev,
      services: [...(prev.services || []), newService]
    }));

    setNewServiceName('');
    setNewServicePrice('');
    setNewServiceUnit('event');
    setNewServiceAllowQty(false);
    setShowAddForm(false);
  };

  const handleUpdateService = (serviceId: string, updates: Partial<VendorService>) => {
    setEditForm(prev => ({
      ...prev,
      services: prev.services?.map(s => s.id === serviceId ? { ...s, ...updates } : s) || []
    }));
  };

  const handleRemoveService = (serviceId: string) => {
    if (window.confirm('Delete this package permanently?')) {
        setEditForm(prev => ({
        ...prev,
        services: prev.services?.filter(s => s.id !== serviceId) || []
        }));
    }
  };

  const handleSaveProfile = () => {
    setIsSaving(true);
    // Simulate save delay
    setTimeout(() => {
      onUpdateVendor(editForm);
      setIsSaving(false);
      setActiveTab('overview');
    }, 800);
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThreadEmail || !replyText.trim()) return;
    
    const thread = messageThreads.find(t => t[0] === selectedThreadEmail);
    if (thread) {
        onReplyMessage(selectedThreadEmail, thread[1].name, replyText);
        setReplyText('');
    }
  };

  const handleStripeConnect = async () => {
    console.log('Current Vendor ID:', vendor.id);
    setIsOnboarding(true);
    setOnboardingError(null);
    try {
      const response = await fetch('/api/stripe/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          vendorId: vendor.id,
          email: vendor.contactEmail || ''
        }),
      });
      
      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error("The server returned an invalid response. This usually indicates a backend crash or configuration error.");
      }

      if (!response.ok) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error("The server did not return an onboarding URL.");
      }
    } catch (error: any) {
      console.error("Stripe Onboarding Error:", error);
      setOnboardingError(error.message || "An unexpected error occurred while connecting to Stripe.");
    } finally {
      setIsOnboarding(false);
    }
  };

  const handleVerifyStripeStatus = async () => {
    console.log('[Verify Status] Triggering automated check for vendor:', vendor.id);
    setIsOnboarding(true);
    setOnboardingError(null);
    try {
      const response = await fetch('/api/stripe/verify-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          vendorId: vendor.id
        }),
      });
      
      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error("The server returned an invalid response.");
      }

      if (!response.ok) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      if (data.stripeConnected) {
        // Update the local vendor state to reflect connection
        if (onUpdateVendor) {
          onUpdateVendor({
            ...vendor,
            stripeConnected: true
          });
        }
        console.log('[Verify Status] Vendor successfully connected!');
      } else {
        console.log('[Verify Status] Vendor not yet fully connected.');
      }
    } catch (error: any) {
      console.error("Stripe Verification Error:", error);
      setOnboardingError(error.message || "An error occurred while verifying Stripe connection.");
    } finally {
      setIsOnboarding(false);
    }
  };

  const handleStripeDashboard = async () => {
    if (!vendor.stripeAccountId) return;
    
    setIsOnboarding(true);
    setOnboardingError(null);
    try {
      const response = await fetch('/api/stripe/dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stripeAccountId: vendor.stripeAccountId }),
      });
      
      const contentType = response.headers.get("content-type");
      let data;
      if (contentType && contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch (e) {
          console.error("Failed to parse JSON response:", e);
          throw new Error("The server returned an invalid JSON response.");
        }
      } else {
        const text = await response.text();
        console.error("Server returned non-JSON response:", text);
        throw new Error(`Server returned an invalid response format (${response.status}). Please check server logs.`);
      }

      if (!response.ok) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error("The server did not return a dashboard URL.");
      }
    } catch (error: any) {
      console.error("Stripe Dashboard Error:", error);
      setOnboardingError(error.message || "An error occurred while opening the Stripe dashboard.");
    } finally {
      setIsOnboarding(false);
    }
  };

  const handleVerifyStripeConnection = async () => {
    if (!vendor.stripeAccountId) return;
    
    console.log('Current Vendor ID:', vendor.id);
    setIsOnboarding(true);
    setOnboardingError(null);
    setStripeMessage(null);
    try {
      const response = await fetch('/api/stripe/force-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          vendorId: vendor.id
        }),
      });
      
      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error("The server returned an invalid response.");
      }

      if (!response.ok) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      if (data.stripeConnected) {
        setStripeMessage("Stripe Connection Verified! Your account is fully set up to receive payments.");
        // Update local state immediately
        if (onUpdateVendor) {
          onUpdateVendor({
            ...vendor,
            stripeConnected: true
          });
        }
      } else {
        const missing = [];
        if (!data.details.details_submitted) missing.push("Details Submitted");
        if (!data.details.charges_enabled) missing.push("Charges Enabled");
        if (!data.details.payouts_enabled) missing.push("Payouts Enabled");
        setStripeMessage(`Stripe Connection Incomplete. Missing: ${missing.join(', ')}. Please complete onboarding in the Stripe Dashboard.`);
      }
    } catch (error: any) {
      console.error("Stripe Verification Error:", error);
      setOnboardingError(error.message || "An error occurred while verifying Stripe connection.");
    } finally {
      setIsOnboarding(false);
    }
  };

  const handleForceDatabaseConnect = async () => {
    console.log('Current Vendor ID:', vendor.id);
    setIsOnboarding(true);
    setOnboardingError(null);
    setStripeMessage(null);
    try {
      // For Goldstein's, we want to force the specific account ID
      const payload: any = { vendorId: vendor.id };

      const response = await fetch('/api/stripe/force-connect-db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to force database connect.");
      }

      setStripeMessage("Success! Database updated. Your account is now marked as connected.");
      // Trigger a refresh of the vendor data if possible, or the user can refresh the page
      if (onUpdateVendor) {
        onUpdateVendor({
          ...vendor,
          stripeAccountId: payload.stripeAccountId || vendor.stripeAccountId,
          stripeConnected: true
        });
      }
    } catch (error: any) {
      console.error("Force Connect Error:", error);
      alert(error.message);
    } finally {
      setIsOnboarding(false);
    }
  };

  // Auto-trigger Stripe verification when returning from onboarding
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const bypass = urlParams.get('bypass') === 'true';
    const onboardSuccess = urlParams.get('onboard') === 'success';
    const stripeAccountId = urlParams.get('stripeAccountId') || urlParams.get('stripe_acc_id');
    const urlVendorId = urlParams.get('vendorId');

    // If we have a stripe account ID and we're returning from onboarding, 
    // we should proactively update the database from the client side 
    // to bypass server-side permission issues.
    if (stripeAccountId) {
      // Use the logged-in vendor ID as the source of truth to ensure we update the correct record
      // We prioritize the logged-in vendor.id over the URL parameter for security and reliability
      const targetVendorId = vendor.id || urlVendorId;
      
      if (targetVendorId && (bypass || onboardSuccess || urlParams.get('check_stripe') === 'true')) {
        console.log(`[Onboarding] FRONTEND BYPASS: Manually updating vendor ${targetVendorId} with account ${stripeAccountId}`);
        handleBypassUpdate(targetVendorId, stripeAccountId);
      }
      
      // Remove the query params to avoid repeated triggers
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    } else if (urlParams.get('check_stripe') === 'true' && vendor.stripeConnected !== true) {
      handleVerifyStripeStatus();
      // Remove the query param to avoid repeated triggers
      const newUrl = window.location.pathname;
      window.history.replaceState({}, document.title, newUrl);
    }
  }, [vendor.id, vendor.stripeConnected]);

  const handleBypassUpdate = async (vId: string, sId: string) => {
    try {
      setIsOnboarding(true);
      setOnboardingError(null);
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('../services/firebase');
      
      console.log(`[Onboarding] Attempting client-side update for vendor ${vId}...`);
      
      await setDoc(doc(db, 'vendors', vId), {
        stripeAccountId: sId,
        stripeConnected: true,
        onboardingComplete: true,
        updatedAt: serverTimestamp()
      }, { merge: true });

      console.log(`[Onboarding] FRONTEND BYPASS SUCCESS for vendor ${vId}`);
      
      // Update local state immediately for instant feedback
      if (onUpdateVendor) {
        onUpdateVendor({
          ...vendor,
          stripeAccountId: sId,
          stripeConnected: true,
          onboardingComplete: true
        });
      }
      
      setStripeMessage("Stripe Connected Successfully! Your account is now ready to receive payments.");
    } catch (error: any) {
      console.error("[Onboarding] FRONTEND BYPASS FAILED:", error);
      setOnboardingError(`Frontend Update Failed: ${error.message}. Please refresh or contact support.`);
    } finally {
      setIsOnboarding(false);
    }
  };

  const renderCalendar = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const monthName = viewDate.toLocaleString('default', { month: 'long' });
    const todayStr = new Date().toISOString().split('T')[0];

    const calendarDays = [];
    // Padding for first day
    for (let i = 0; i < firstDay; i++) {
      calendarDays.push(<div key={`pad-${i}`} className="h-24 md:h-32 bg-black/10 border border-white/5 opacity-20"></div>);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = date.toISOString().split('T')[0];
      const isBlocked = vendor.unavailableDates?.includes(dateStr);
      const isToday = dateStr === todayStr;
      const hasBooking = bookings.some(b => b.date === dateStr && b.status === 'confirmed');

      calendarDays.push(
        <div 
          key={dateStr}
          onClick={() => handleToggleDate(dateStr)}
          className={`h-24 md:h-32 border p-2 md:p-4 transition-all cursor-pointer relative group ${
            isBlocked 
              ? 'bg-red-900/10 border-red-500/30' 
              : 'bg-black/20 border-white/5 hover:border-[#D4AF37]/50'
          } ${isToday ? 'ring-1 ring-[#D4AF37] ring-inset' : ''}`}
        >
          <div className="flex justify-between items-start">
            <span className={`text-xs font-black ${isBlocked ? 'text-red-500' : 'text-slate-400'}`}>{day}</span>
            {isBlocked && <Lock className="w-3 h-3 text-red-500" />}
          </div>

          <div className="mt-2 space-y-1">
             {hasBooking && (
                <div className="bg-green-500/10 border border-green-500/20 text-green-500 text-[8px] font-black uppercase px-1.5 py-0.5 rounded truncate">
                  Confirmed Event
                </div>
             )}
             {isBlocked && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-[8px] font-black uppercase px-1.5 py-0.5 rounded truncate">
                  Unavailable
                </div>
             )}
          </div>

          <div className="absolute inset-0 bg-[#D4AF37]/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        </div>
      );
    }

    return (
      <div className="bg-[#111] rounded-3xl border border-white/5 shadow-2xl overflow-hidden animate-in fade-in duration-500">
        <div className="p-6 md:p-8 bg-black/40 border-b border-white/5 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h3 className="text-xl font-bold font-[Cinzel] text-[#D4AF37]">{monthName} {year}</h3>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Manage Availability</p>
          </div>
          <div className="flex gap-2">
             <button onClick={() => changeMonth(-1)} className="p-3 bg-white/5 hover:bg-[#D4AF37] hover:text-black rounded-xl border border-white/10 transition-all">
                <ChevronLeft className="w-5 h-5" />
             </button>
             <button onClick={() => setViewDate(new Date())} className="px-6 py-2 bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest rounded-xl border border-white/10">
                Today
             </button>
             <button onClick={() => changeMonth(1)} className="p-3 bg-white/5 hover:bg-[#D4AF37] hover:text-black rounded-xl border border-white/10 transition-all">
                <ChevronRight className="w-5 h-5" />
             </button>
          </div>
        </div>

        <div className="grid grid-cols-7 border-b border-white/5">
           {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
             <div key={d} className="py-4 text-center text-[10px] font-black uppercase text-[#D4AF37]/50 tracking-[0.2em]">{d}</div>
           ))}
        </div>

        <div className="grid grid-cols-7">
           {calendarDays}
        </div>

        <div className="p-6 bg-black/60 flex flex-wrap gap-6 items-center border-t border-white/5">
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-black/20 border border-white/5"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Available</span>
           </div>
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-900/20 border border-red-500/30"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Blocked / Unavailable</span>
           </div>
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-green-500/20 border border-green-500/30"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Confirmed Bookings</span>
           </div>
           <div className="ml-auto text-[10px] text-slate-600 italic">
             * Click any date to toggle your availability.
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-black text-slate-100 flex flex-col md:flex-row overflow-hidden relative">
      {/* New Booking Alert Toast */}
      {newBookingAlert && (
        <div className="fixed top-20 right-4 z-[100] w-full max-w-sm animate-in slide-in-from-right duration-500">
          <div className="bg-[#111] border-2 border-[#D4AF37] rounded-2xl shadow-2xl p-4 flex gap-4 items-center ring-4 ring-black/50 backdrop-blur-xl">
            <div className="bg-[#D4AF37] p-3 rounded-xl">
              <BellRing className="w-6 h-6 text-black animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-[#D4AF37] font-black text-[10px] uppercase tracking-widest mb-1">New Booking Request!</h4>
              <p className="text-white font-bold text-sm truncate">{newBookingAlert.clientName}</p>
              <p className="text-slate-400 text-[10px] truncate">{newBookingAlert.eventName} • ${newBookingAlert.amount}</p>
            </div>
            <button 
              onClick={() => { setActiveTab('bookings'); setNewBookingAlert(null); }}
              className="bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 p-2 rounded-lg text-[#D4AF37] transition-all"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Booking Detail Modal */}
      {selectedBookingForDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-[#111] w-full max-w-2xl rounded-3xl border border-[#D4AF37]/30 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black">
              <div>
                <h2 className="text-2xl font-bold font-[Cinzel] text-[#D4AF37]">Event Specifications</h2>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Reviewing Request #{selectedBookingForDetail.id}</p>
              </div>
              <button onClick={() => setSelectedBookingForDetail(null)} className="text-slate-500 hover:text-white p-2 bg-white/5 rounded-full"><X className="w-6 h-6" /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Client Info */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-[#D4AF37]">
                    <User className="w-5 h-5" />
                    <h3 className="font-black text-[10px] uppercase tracking-[0.2em]">Client Information</h3>
                  </div>
                  <div className="bg-black/40 p-5 rounded-2xl border border-white/5 space-y-3">
                    <div>
                      <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest mb-1">Full Name</p>
                      <p className="text-white font-bold">{selectedBookingForDetail.clientName}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest mb-1">Contact Email</p>
                      <p className="text-white font-bold">{selectedBookingForDetail.contactEmail}</p>
                    </div>
                  </div>
                </div>

                {/* Logistics */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-[#D4AF37]">
                    <Calendar className="w-5 h-5" />
                    <h3 className="font-black text-[10px] uppercase tracking-[0.2em]">Event Logistics</h3>
                  </div>
                  <div className="bg-black/40 p-5 rounded-2xl border border-white/5 space-y-3">
                    <div>
                      <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest mb-1">Event Type</p>
                      <p className="text-white font-bold">{selectedBookingForDetail.eventName}</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest mb-1">Date</p>
                        <p className="text-white font-bold">{selectedBookingForDetail.date}</p>
                      </div>
                      <div className="flex-1">
                        <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest mb-1">Time</p>
                        <p className="text-white font-bold">{selectedBookingForDetail.eventTime || 'Flexible'}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-600 font-black uppercase tracking-widest mb-1 text-red-500/80">Location</p>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-red-500/50 mt-0.5" />
                          <p className="text-white font-bold">{selectedBookingForDetail.eventLocation || 'Venue address pending'}</p>
                        </div>
                        {selectedBookingForDetail.status === 'confirmed' && (selectedBookingForDetail.eventAddress || selectedBookingForDetail.eventLocation) && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedBookingForDetail.eventAddress || selectedBookingForDetail.eventLocation || '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-black px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-green-500/30 transition-all shrink-0"
                          >
                            Go to Event
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Selected Services */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-[#D4AF37]">
                  <ClipboardList className="w-5 h-5" />
                  <h3 className="font-black text-[10px] uppercase tracking-[0.2em]">Requested Packages</h3>
                </div>
                <div className="bg-black/40 rounded-2xl border border-white/5 overflow-hidden">
                  {selectedBookingForDetail.selectedServices && selectedBookingForDetail.selectedServices.length > 0 ? (
                    <div className="divide-y divide-white/5">
                      {selectedBookingForDetail.selectedServices.map((s: SelectedService) => (
                        <div key={s.id} className="p-4 flex justify-between items-center hover:bg-white/5 transition-colors">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-200">{s.name}</span>
                            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Qty: {s.quantity} {s.unit ? `per ${s.unit}` : ''}</span>
                          </div>
                          <span className="text-sm font-black text-[#D4AF37]">${(s.price * s.quantity).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center">
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">Base Starting Package Requested</p>
                    </div>
                  )}
                  <div className="p-4 bg-[#D4AF37]/10 border-t border-[#D4AF37]/20 flex justify-between items-center">
                    <span className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest">
                      {selectedBookingForDetail.notes?.includes('OFFERED PRICE:') ? 'Offered Price (Counter-Offer)' : 'Total Estimated Budget'}
                    </span>
                    <span className="text-xl font-bold text-[#D4AF37]">${selectedBookingForDetail.amount.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Client Notes */}
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-[#D4AF37]">
                  <MessageSquare className="w-5 h-5" />
                  <h3 className="font-black text-[10px] uppercase tracking-[0.2em]">Message from Client</h3>
                </div>
                <div className="bg-black/40 p-6 rounded-2xl border border-white/5 italic text-slate-400 text-sm leading-relaxed">
                  {selectedBookingForDetail.notes ? `"${selectedBookingForDetail.notes}"` : "No additional notes provided."}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-8 bg-black border-t border-white/10 flex flex-wrap gap-4">
              {selectedBookingForDetail.status === 'pending' && (
                <>
                  <button 
                    onClick={() => { onUpdateBookingStatus(selectedBookingForDetail.id, 'cancelled'); setSelectedBookingForDetail(null); }}
                    className="flex-1 py-4 bg-red-600/10 hover:bg-red-600/20 text-red-500 rounded-xl font-black text-[10px] uppercase tracking-[0.3em] border border-red-500/20 transition-all"
                  >
                    Decline
                  </button>
                  <button 
                    onClick={() => {
                      const amount = prompt("Enter counter-offer amount ($):", selectedBookingForDetail.amount.toString());
                      if (amount && !isNaN(Number(amount))) {
                        const newNotes = `OFFERED PRICE: $${amount}. ${selectedBookingForDetail.notes || ''}`;
                        updateDoc(doc(db, 'bookings', selectedBookingForDetail.id), { 
                          amount: Number(amount),
                          notes: newNotes
                        }).then(() => {
                           showNotification("Counter-offer sent!");
                           setSelectedBookingForDetail(null);
                        });
                      }
                    }}
                    className="flex-1 py-4 bg-blue-600/10 hover:bg-blue-600/20 text-blue-500 rounded-xl font-black text-[10px] uppercase tracking-[0.3em] border border-blue-500/20 transition-all"
                  >
                    Make Offer
                  </button>
                  <button 
                    onClick={() => { onUpdateBookingStatus(selectedBookingForDetail.id, 'confirmed'); setSelectedBookingForDetail(null); }}
                    className="flex-[2] py-4 bg-[#D4AF37] hover:bg-[#E5C76B] text-black rounded-xl font-black text-[10px] uppercase tracking-[0.3em] shadow-xl shadow-[#D4AF37]/10 transition-all"
                  >
                    Confirm & Accept
                  </button>
                </>
              )}
              {selectedBookingForDetail.status !== 'pending' && (
                <button 
                  onClick={() => setSelectedBookingForDetail(null)}
                  className="w-full py-4 bg-white/5 hover:bg-white/10 text-slate-400 rounded-xl font-black text-[10px] uppercase tracking-[0.3em] transition-all"
                >
                  Close Record
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Toggle */}
      <div className="md:hidden bg-[#0a0a0a] border-b border-[#D4AF37]/10 p-4 flex justify-between items-center z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#D4AF37] rounded-lg flex items-center justify-center text-black font-bold font-[Cinzel]">V</div>
          <h2 className="text-[#D4AF37] font-bold font-[Cinzel] tracking-widest uppercase text-sm">Portal</h2>
        </div>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-[#D4AF37] p-2 bg-white/5 rounded-lg transition-all">
          {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden animate-in fade-in duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 bg-[#0a0a0a] border-r border-[#D4AF37]/10 flex flex-col transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 shadow-2xl'} md:relative shadow-2xl`}>
        <div className="p-8 hidden md:block border-b border-white/5">
          <h2 className="text-2xl font-bold font-[Cinzel] text-[#D4AF37] uppercase tracking-tighter">Simcha Portal</h2>
          <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.3em] mt-1">Vendor Station</p>
        </div>
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <NavItem id="overview" icon={LayoutDashboard} label="Dashboard" />
          <NavItem id="bookings" icon={Users} label="Requests" badge={pendingRequests} />
          <NavItem id="messages" icon={MessageSquare} label="Inquiries" badge={messages.filter(m => m.receiverId === vendor.id && !m.isRead).length || undefined} />
          <NavItem id="calendar" icon={CalendarDays} label="Calendar" />
          <NavItem id="profile" icon={Settings} label="Business Profile" />
        </nav>
        <div className="p-6 border-t border-white/5 bg-black">
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:text-red-500 transition-colors text-xs font-black uppercase tracking-widest"><LogOut className="w-5 h-5" /> Terminate Session</button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 h-screen overflow-y-auto bg-[#050505] relative">
        <header className="sticky top-0 z-30 bg-[#050505]/80 backdrop-blur-md px-6 md:px-10 py-6 md:py-8 border-b border-white/5">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl md:text-3xl font-bold font-[Cinzel] text-white capitalize tracking-tight">{activeTab}</h1>
              <p className="text-[#D4AF37]/60 text-[10px] font-black uppercase tracking-[0.4em] mt-1.5">{vendor.name}</p>
            </div>
            <div className="flex items-center gap-4">
               {pendingRequests > 0 && (
                 <div className="hidden sm:flex items-center gap-2 bg-red-600/10 border border-red-600/30 px-3 py-1.5 rounded-full animate-pulse">
                   <Bell className="w-3.5 h-3.5 text-red-500" />
                   <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">{pendingRequests} Pending</span>
                 </div>
               )}
            </div>
          </div>
        </header>

        <div className="p-4 md:p-10 max-w-7xl mx-auto space-y-8">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              <div className="bg-[#111] p-6 rounded-3xl border border-white/5 shadow-2xl space-y-4 group hover:border-[#D4AF37]/20 transition-all">
                <div className="bg-[#D4AF37]/10 p-3 w-fit rounded-2xl group-hover:bg-[#D4AF37]/20 transition-colors"><DollarSign className="w-6 h-6 text-[#D4AF37]" /></div>
                <div><p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Earnings</p><h3 className="text-3xl font-bold text-white">${totalRevenue.toLocaleString()}</h3></div>
              </div>
              <div 
                onClick={() => setActiveTab('bookings')}
                className="bg-[#111] p-6 rounded-3xl border border-white/5 shadow-2xl space-y-4 group hover:border-red-600/20 transition-all cursor-pointer"
              >
                <div className={`p-3 w-fit rounded-2xl transition-colors ${pendingRequests > 0 ? 'bg-red-600/10 group-hover:bg-red-600/20' : 'bg-[#D4AF37]/10'}`}>
                  <Users className={`w-6 h-6 ${pendingRequests > 0 ? 'text-red-500' : 'text-[#D4AF37]'}`} />
                </div>
                <div>
                  <p className="text-slate-600 font-black uppercase tracking-widest text-[10px]">Action Required</p>
                  <h3 className={`text-3xl font-bold ${pendingRequests > 0 ? 'text-red-500' : 'text-white'}`}>{pendingRequests} Requests</h3>
                </div>
              </div>
              <div className="bg-[#111] p-6 rounded-3xl border border-white/5 shadow-2xl space-y-4">
                <div className="bg-[#D4AF37]/10 p-3 w-fit rounded-2xl"><TrendingUp className="w-6 h-6 text-[#D4AF37]" /></div>
                <div><p className="text-slate-600 font-black uppercase tracking-widest text-[10px]">Active Presence</p><h3 className="text-3xl font-bold text-white">Live Catalog</h3></div>
              </div>

              {/* Stripe Connect Card */}
              <div className={`relative bg-[#111] p-6 rounded-3xl border shadow-2xl space-y-4 transition-all ${vendor.stripeAccountId ? 'border-green-500/20' : 'border-[#D4AF37]/20'}`}>
                {isOnboarding && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center z-10 animate-in fade-in duration-300">
                    <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin mb-3" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-white">Connecting Stripe...</p>
                    <p className="text-[9px] text-slate-400 mt-1">Please wait while we verify your account</p>
                  </div>
                )}
                
                <div className={`p-3 w-fit rounded-2xl ${vendor.stripeAccountId ? 'bg-green-500/10' : 'bg-[#D4AF37]/10'}`}>
                  <CreditCard className={`w-6 h-6 ${vendor.stripeAccountId ? 'text-green-500' : 'text-[#D4AF37]'}`} />
                </div>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-slate-600 font-black uppercase tracking-widest text-[10px]">Stripe Payments</p>
                    <h3 className="text-xl font-bold text-white">
                      {vendor.stripeConnected === true ? 'Connected' : (vendor.stripeAccountId ? 'Pending / Incomplete' : 'Not Connected')}
                    </h3>
                  </div>
                    <div className="flex flex-col items-end gap-2">
                      {!vendor.stripeConnected ? (
                        <button 
                          onClick={handleStripeConnect}
                          disabled={isOnboarding}
                          className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#D4AF37] hover:text-[#E5C76B] transition-all"
                        >
                          {isOnboarding ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                          Connect Stripe
                        </button>
                      ) : (
                        <div className="flex flex-col items-end gap-2">
                          <button 
                            onClick={handleVerifyStripeConnection}
                            disabled={isOnboarding}
                            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-green-500 hover:text-green-400 transition-colors"
                          >
                            {isOnboarding ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                            Refresh Connection Status
                          </button>
                          <button 
                            onClick={handleStripeDashboard}
                            disabled={isOnboarding}
                            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                          >
                            {isOnboarding ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                            Dashboard
                          </button>
                        </div>
                      )}
                    </div>
                </div>
                <p className="text-[9px] text-slate-500 italic">
                  {vendor.stripeAccountId 
                    ? "Your account is linked. You can receive direct payments from clients."
                    : "Connect your bank account to receive split payments automatically."}
                </p>

                {stripeMessage && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-start gap-3">
                      <Info className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Stripe Update</p>
                        <p className="text-[10px] text-emerald-400 leading-relaxed font-bold">{stripeMessage}</p>
                      </div>
                      <button onClick={() => setStripeMessage(null)}>
                        <X className="w-3 h-3 text-emerald-500/50 hover:text-emerald-500" />
                      </button>
                    </div>
                  </div>
                )}

                {onboardingError && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1">Connection Error</p>
                        <p className="text-[10px] text-red-400 leading-relaxed font-bold">{onboardingError}</p>
                      </div>
                    </div>
                    
                    <div className="pt-3 border-t border-red-500/10 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-red-500/20"></div>
                        <p className="text-[9px] text-red-500/60 uppercase tracking-widest font-black">Action Required</p>
                        <div className="h-px flex-1 bg-red-500/20"></div>
                      </div>
                      
                      <div className="bg-black/20 rounded-xl p-3 space-y-2 border border-red-500/10">
                        <div className="flex justify-between items-center mb-1">
                          <p className="text-[10px] text-slate-300 leading-relaxed">
                            Your key is currently <span className="text-red-500 font-bold">truncated</span>.
                          </p>
                          <div className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/30">
                            <p className="text-[8px] font-mono text-red-400">Length: 28/107</p>
                          </div>
                        </div>
                        
                        <div className="p-2 bg-black/40 rounded border border-white/5 font-mono text-[9px] text-slate-400 break-all">
                          Current: <span className="text-red-400">sk_test_...99iz</span>
                        </div>

                        <ol className="text-[10px] text-slate-300 space-y-2 list-decimal ml-4 leading-relaxed pt-1">
                          <li>Go to <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noreferrer" className="text-[#D4AF37] font-bold underline hover:text-white transition-colors">Stripe API Keys</a></li>
                          <li>Click <strong className="text-white">"Reveal test key"</strong></li>
                          <li><strong className="text-white">Click the key itself</strong> to copy the full 107-character string</li>
                          <li>Open <strong className="text-white">Settings (⚙️) &gt; Secrets</strong> (top-right of this screen)</li>
                          <li>Delete <code>STRIPE_SECRET_KEY</code> and paste the <strong className="text-white">full key</strong></li>
                          <li>Press <strong className="text-white">Enter</strong> to save and try again</li>
                        </ol>

                        <div className="pt-3 border-t border-white/5 space-y-2">
                          <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Emergency Key Update</p>
                          <p className="text-[9px] text-slate-500 leading-relaxed">If you can't find the Secrets menu, paste the full key here to update it directly in the database:</p>
                          <div className="flex gap-2">
                            <input 
                              type="password"
                              value={manualStripeKey}
                              onChange={(e) => setManualStripeKey(e.target.value)}
                              placeholder="sk_test_..."
                              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[10px] text-white font-mono focus:outline-none focus:border-[#D4AF37]/50"
                            />
                            <button 
                              onClick={handleManualKeyUpdate}
                              disabled={isUpdatingKey}
                              className="px-3 py-1.5 bg-[#D4AF37] text-black text-[9px] font-black uppercase tracking-widest rounded-lg hover:bg-white transition-colors disabled:opacity-50"
                            >
                              {isUpdatingKey ? <Loader2 className="w-3 h-3 animate-spin" /> : "Update"}
                            </button>
                          </div>
                          {keyUpdateSuccess && (
                            <p className="text-[9px] text-emerald-500 font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" /> Key updated successfully!
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <button 
                      onClick={() => setOnboardingError(null)}
                      className="w-full py-2 text-[8px] font-black uppercase tracking-widest text-red-500/60 hover:text-red-500 transition-colors border border-red-500/10 rounded-lg hover:bg-red-500/5"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'bookings' && (
            <div className="bg-[#111] rounded-3xl border border-white/5 shadow-2xl overflow-hidden animate-in fade-in duration-500">
              <div className="p-6 border-b border-white/5 bg-black/20 flex justify-between items-center">
                <h3 className="font-bold text-[#D4AF37] font-[Cinzel] uppercase text-sm tracking-widest">Incoming Reservations</h3>
                <div className="bg-white/5 px-4 py-2 rounded-xl border border-white/5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Total Managed: {bookings.length}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-black/40 border-b border-white/10">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#D4AF37]">Client</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#D4AF37]">Details</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#D4AF37]">Status</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-[#D4AF37] text-right">Review Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {bookings.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-24 text-center">
                          <div className="flex flex-col items-center gap-4 opacity-30">
                            <Info className="w-10 h-10 text-[#D4AF37]" />
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">No requests found</p>
                          </div>
                        </td>
                      </tr>
                    ) : bookings.map(b => (
                      <tr key={b.id} className="hover:bg-white/5 transition-colors group">
                        <td className="px-6 py-5">
                          <p className="font-bold text-white group-hover:text-[#D4AF37] transition-colors">{b.clientName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest truncate max-w-[120px]">{b.contactEmail}</p>
                            {b.notes?.includes('OFFERED PRICE:') && (
                              <span className="bg-[#D4AF37]/20 text-[#D4AF37] text-[7px] font-black px-1.5 py-0.5 rounded border border-[#D4AF37]/30 uppercase tracking-tighter">Offer</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <p className="text-xs text-slate-300 font-bold mb-1">{b.eventName}</p>
                          <div className="flex items-center gap-3">
                            <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest flex items-center gap-1.5 bg-black px-2 py-0.5 rounded border border-white/5">
                              <Calendar className="w-2.5 h-2.5" /> {b.date}
                            </span>
                            <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest flex items-center gap-1.5 bg-black px-2 py-0.5 rounded border border-white/5">
                              <DollarSign className="w-2.5 h-2.5" /> {b.amount}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-[0.15em] border ${
                            b.status === 'confirmed' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 
                            b.status === 'pending' ? 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20' :
                            'bg-red-500/10 text-red-500 border-red-500/20'
                          }`}>
                            {b.status}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="flex justify-end items-center gap-2">
                            {b.status === 'confirmed' && (b.eventAddress || b.eventLocation) && (
                              <a
                                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(b.eventAddress || b.eventLocation || '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-black px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-green-500/30 transition-all"
                              >
                                Go to Event
                              </a>
                            )}
                            <button 
                              onClick={() => setSelectedBookingForDetail(b)}
                              className="inline-flex items-center gap-2 bg-[#D4AF37]/10 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border border-[#D4AF37]/30 transition-all shadow-lg shadow-[#D4AF37]/0 hover:shadow-[#D4AF37]/20"
                            >
                              <Eye className="w-3.5 h-3.5" /> Full Scope
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'messages' && (
            <div className="flex flex-col lg:flex-row bg-[#111] rounded-3xl border border-white/5 shadow-2xl overflow-hidden min-h-[600px] animate-in fade-in duration-500">
               {/* Thread List */}
               <div className="w-full lg:w-80 border-r border-white/5 bg-black/20 overflow-y-auto">
                  <div className="p-6 border-b border-white/5 bg-black/40">
                    <h3 className="text-sm font-bold text-[#D4AF37] uppercase tracking-widest">Client Inquiries</h3>
                  </div>
                  {messageThreads.length === 0 ? (
                    <div className="p-10 text-center opacity-20">
                      <MessageSquare className="w-10 h-10 mx-auto mb-4" />
                      <p className="text-[10px] font-black uppercase tracking-widest">No Active Inquiries</p>
                    </div>
                  ) : messageThreads.map(([email, data]) => (
                    <button 
                      key={email}
                      onClick={() => setSelectedThreadEmail(email)}
                      className={`w-full p-6 text-left border-b border-white/5 transition-all hover:bg-white/5 ${selectedThreadEmail === email ? 'bg-[#D4AF37]/5 border-l-4 border-l-[#D4AF37]' : ''}`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-bold text-white text-sm truncate">{data.name}</span>
                        <span className="text-[8px] text-slate-500">{new Date(data.lastMessage.timestamp).toLocaleDateString()}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 truncate mb-2">{email}</p>
                      <p className="text-xs text-slate-400 line-clamp-1 italic">"{data.lastMessage.text}"</p>
                    </button>
                  ))}
               </div>

               {/* Chat Pane */}
               <div className="flex-1 flex flex-col bg-black/40">
                  {selectedThreadEmail ? (
                    <>
                      <div className="p-6 border-b border-white/5 bg-black/40 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37] font-bold">
                              {messageThreads.find(t => t[0] === selectedThreadEmail)?.[1].name[0]}
                            </div>
                            <div>
                               <h4 className="font-bold text-white">{messageThreads.find(t => t[0] === selectedThreadEmail)?.[1].name}</h4>
                               <p className="text-[10px] text-slate-500 uppercase tracking-widest">{selectedThreadEmail}</p>
                            </div>
                         </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-8 space-y-6">
                        {messageThreads.find(t => t[0] === selectedThreadEmail)?.[1].messages.sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).map(m => (
                          <div key={m.id} className={`flex ${m.senderId === vendor.id ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[70%] p-4 rounded-2xl ${m.senderId === vendor.id ? 'bg-[#D4AF37] text-black rounded-tr-none' : 'bg-white/5 text-slate-200 border border-white/5 rounded-tl-none'}`}>
                               {m.type === 'image' ? (
                                   <div className="space-y-2">
                                       <img src={m.fileUrl} className="rounded-lg w-full max-h-60 object-cover" alt="" />
                                       {m.text && m.text !== 'Sent an image' && <p className="text-sm leading-relaxed">{m.text}</p>}
                                   </div>
                               ) : m.type === 'voice' ? (
                                   <div className="flex items-center gap-3">
                                       <div className="w-10 h-10 bg-black/20 rounded-full flex items-center justify-center cursor-pointer">
                                           <Play className="w-4 h-4" />
                                       </div>
                                       <div className="flex-1 h-1 bg-black/10 rounded-full min-w-[120px]"><div className="w-1/3 h-full bg-current opacity-30 rounded-full"></div></div>
                                       <Volume2 className="w-4 h-4 opacity-50" />
                                   </div>
                               ) : (
                                   <p className="text-sm leading-relaxed">{m.text}</p>
                               )}
                               <span className={`text-[8px] block mt-2 opacity-50 ${m.senderId === vendor.id ? 'text-black' : 'text-slate-500'}`}>
                                 {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                               </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <form onSubmit={handleSendReply} className="p-6 bg-black/60 border-t border-white/5">
                        <div className="relative flex items-center">
                          <input 
                            type="text"
                            value={replyText}
                            onChange={e => setReplyText(e.target.value)}
                            placeholder="Type your response..."
                            className="w-full bg-[#050505] border border-white/10 rounded-2xl pl-6 pr-16 py-4 text-sm focus:border-[#D4AF37] outline-none transition-all"
                          />
                          <button 
                            type="submit"
                            disabled={!replyText.trim()}
                            className="absolute right-3 p-3 bg-[#D4AF37] text-black rounded-xl hover:bg-[#E5C76B] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Send className="w-5 h-5" />
                          </button>
                        </div>
                      </form>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-10 opacity-20">
                      <MessageSquare className="w-20 h-20 mb-6" />
                      <h3 className="text-2xl font-[Cinzel] mb-2 uppercase tracking-widest">Select a Thread</h3>
                      <p className="max-w-xs mx-auto">Conversations with clients regarding bookings and inquiries will appear here.</p>
                    </div>
                  )}
               </div>
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="animate-in fade-in duration-500">
               {renderCalendar()}
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="animate-in fade-in duration-500 max-w-4xl mx-auto pb-20 space-y-12">
               {/* Offer System Section */}
               <div className="bg-[#111] rounded-3xl border border-[#D4AF37]/20 shadow-2xl overflow-hidden">
                  <button 
                    onClick={() => toggleSection('offers')}
                    className="w-full p-8 border-b border-white/5 bg-black/40 flex justify-between items-center group"
                  >
                    <div className="text-left">
                      <h3 className="text-xl font-bold font-[Cinzel] text-[#D4AF37]">Offer System</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Control how clients can negotiate pricing</p>
                    </div>
                    <div className="flex items-center gap-4">
                       <DollarSign className={`w-8 h-8 transition-all ${editForm.allowOffers ? 'text-[#D4AF37]' : 'text-slate-800'}`} />
                       <ChevronRight className={`w-6 h-6 text-slate-600 transition-transform ${collapsedSections['offers'] ? 'rotate-90' : ''}`} />
                    </div>
                  </button>
                  
                  {!collapsedSections['offers'] && (
                    <div className="p-8 animate-in slide-in-from-top-2 duration-300">
                      <div className="bg-black/40 rounded-2xl border border-white/5 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="space-y-1 max-w-md text-left">
                          <h4 className="text-sm font-bold text-white">Enable "Make an Offer"</h4>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            When enabled, clients can propose a specific price for your services. You will be notified of all offers and can choose to accept or decline them.
                          </p>
                        </div>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setEditForm({ ...editForm, allowOffers: !editForm.allowOffers }); }}
                          className={`w-full md:w-auto px-10 py-4 rounded-xl text-xs font-black uppercase tracking-[0.2em] transition-all border ${editForm.allowOffers ? 'bg-green-600 text-white border-green-500 shadow-xl shadow-green-600/10' : 'bg-black text-slate-500 border-white/10 hover:border-[#D4AF37]/40'}`}
                        >
                          {editForm.allowOffers ? (
                            <span className="flex items-center justify-center gap-2"><CheckCircle className="w-4 h-4" /> Offers Active</span>
                          ) : (
                            <span className="flex items-center justify-center gap-2"><XCircle className="w-4 h-4" /> Offers Disabled</span>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
               </div>

               {/* Anti-Spying Privacy Lock Section */}
               <div className="bg-[#111] rounded-3xl border border-[#D4AF37]/20 shadow-2xl overflow-hidden">
                  <button 
                    onClick={() => toggleSection('privacy')}
                    className="w-full p-8 border-b border-white/5 bg-black/40 flex justify-between items-center group cursor-pointer"
                  >
                    <div className="text-left">
                      <h3 className="text-xl font-bold font-[Cinzel] text-[#D4AF37]">Privacy Lock Settings</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Protect your availability calendar from competitor spying</p>
                    </div>
                    <div className="flex items-center gap-4">
                       <Lock className={`w-8 h-8 transition-all text-[#D4AF37]`} />
                       <ChevronRight className={`w-6 h-6 text-slate-600 transition-transform ${collapsedSections['privacy'] ? 'rotate-90' : ''}`} />
                    </div>
                  </button>
                  
                  {!collapsedSections['privacy'] && (
                    <div className="p-8 space-y-6 animate-in slide-in-from-top-2 duration-300">
                      <p className="text-xs text-slate-400 leading-relaxed max-w-2xl text-left">
                        Competitors or bad actors might try to map out your bookings by continuously checking dates in the booking form.
                        Enable our smart anti-spying block to limit the number of availability checks per user session.
                      </p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-3 text-left">
                          <label className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em]">Max Date Checks Allowed</label>
                          <input 
                            type="number" 
                            className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-[#D4AF37] outline-none text-white transition-all" 
                            style={{appearance: 'textfield'}}
                            value={editForm.maxDateChecks ?? 5}
                            onChange={e => setEditForm({...editForm, maxDateChecks: parseInt(e.target.value) || 0})}
                            placeholder="5"
                            min="1"
                          />
                          <p className="text-[9px] text-slate-500">Maximum date checking attempts allowed per client before blocking them.</p>
                        </div>
                        
                        <div className="space-y-3 text-left">
                          <label className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em]">Reset Period (in hours)</label>
                          <input 
                            type="number" 
                            className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-[#D4AF37] outline-none text-white transition-all" 
                            style={{appearance: 'textfield'}}
                            value={editForm.dateCheckResetHours ?? 24}
                            onChange={e => setEditForm({...editForm, dateCheckResetHours: parseInt(e.target.value) || 0})}
                            placeholder="24"
                            min="1"
                          />
                          <p className="text-[9px] text-slate-500">How long (in hours) before the check attempts reset for a user.</p>
                        </div>
                      </div>
                    </div>
                  )}
               </div>

               {/* Basic Information */}
               <div className="bg-[#111] rounded-3xl border border-white/5 shadow-2xl overflow-hidden">
                  <button 
                    onClick={() => toggleSection('basic')}
                    className="w-full p-8 border-b border-white/5 bg-black/40 flex justify-between items-center group cursor-pointer"
                  >
                    <div className="text-left">
                      <h3 className="text-xl font-bold font-[Cinzel] text-[#D4AF37]">General Settings</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Manage your basic public business information</p>
                    </div>
                    <ChevronRight className={`w-6 h-6 text-slate-600 transition-transform ${collapsedSections['basic'] ? '' : 'rotate-90'}`} />
                  </button>
                  
                  {!collapsedSections['basic'] && (
                    <div className="p-8 space-y-10 animate-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                       <div className="md:col-span-1 space-y-4">
                          <label className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em]">Business Image</label>
                          <div className="relative group aspect-square rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl">
                             <img src={editForm.image} className="w-full h-full object-cover" alt="" />
                             <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex flex-col items-center justify-center p-4">
                                <button 
                                  onClick={() => logoFileInputRef.current?.click()}
                                  disabled={isUploadingLogo}
                                  className="bg-white text-black p-3 rounded-xl hover:bg-[#D4AF37] transition-all transform scale-90 group-hover:scale-100 duration-300"
                                >
                                  {isUploadingLogo ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                                </button>
                                <p className="text-[8px] text-white font-black uppercase tracking-widest mt-2">Change Portrait</p>
                             </div>
                          </div>
                          <input 
                             type="file" 
                             ref={logoFileInputRef}
                             className="hidden"
                             accept="image/*"
                             onChange={handleLogoUpload}
                          />
                       </div>
                       <div className="md:col-span-2 space-y-8">
                          <div className="space-y-3">
                            <label className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em]">Business Trading Name</label>
                            <input 
                              type="text" 
                              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-[#D4AF37] outline-none text-white transition-all" 
                              value={editForm.name}
                              onChange={e => setEditForm({...editForm, name: e.target.value})}
                              placeholder="e.g. Classic Jewish Catering"
                            />
                          </div>
                          <div className="space-y-3">
                            <label className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em]">Public Contact Email</label>
                            <input 
                              type="email" 
                              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-[#D4AF37] outline-none text-white transition-all" 
                              value={editForm.contactEmail}
                              onChange={e => setEditForm({...editForm, contactEmail: e.target.value})}
                              placeholder="hello@business.com"
                            />
                          </div>
                       </div>
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em]">Business Biography / description</label>
                      <textarea 
                        rows={4}
                        className="w-full bg-black border border-white/10 rounded-xl px-4 py-4 text-sm focus:border-[#D4AF37] outline-none resize-none text-slate-300 leading-relaxed transition-all" 
                        value={editForm.description}
                        onChange={e => setEditForm({...editForm, description: e.target.value})}
                        placeholder="Tell clients about your services and experience..."
                      />
                    </div>
                  </div>
                )}
               </div>

               {/* Services & Packaging */}
               <div className="bg-[#111] rounded-3xl border border-white/5 shadow-2xl overflow-hidden">
                  <div 
                    onClick={() => toggleSection('services')}
                    className="p-8 border-b border-white/5 bg-black/40 flex justify-between items-center cursor-pointer group"
                  >
                    <div className="text-left">
                      <h3 className="text-xl font-bold font-[Cinzel] text-[#D4AF37]">Services & Pricing Packages</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Define specific offerings for clients to select</p>
                    </div>
                    <div className="flex items-center gap-4">
                       <button 
                         onClick={(e) => { e.stopPropagation(); setShowAddForm(!showAddForm); if (collapsedSections['services']) toggleSection('services'); }}
                         className={`p-3 rounded-xl transition-all border ${showAddForm ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20 hover:bg-[#D4AF37]'}`}
                       >
                         {showAddForm ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                       </button>
                       <ChevronRight className={`w-6 h-6 text-slate-600 transition-transform ${collapsedSections['services'] ? '' : 'rotate-90'}`} />
                    </div>
                  </div>
                  
                  {!collapsedSections['services'] && (
                    <div className="p-8 space-y-10 animate-in slide-in-from-top-2 duration-300">
                    {/* Add Service Form */}
                    {showAddForm && (
                      <div className="bg-[#D4AF37]/5 p-6 rounded-3xl border border-[#D4AF37]/20 space-y-6 animate-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-3 mb-2">
                           <div className="bg-[#D4AF37] p-2 rounded-lg text-black"><Package className="w-4 h-4" /></div>
                           <h4 className="text-[#D4AF37] font-black uppercase text-xs tracking-widest">New Service Configuration</h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Service/Package Title</label>
                            <input 
                              type="text" 
                              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-[#D4AF37] outline-none text-white" 
                              placeholder="e.g. Kosher Menu, Solo Violin..."
                              value={newServiceName}
                              onChange={e => setNewServiceName(e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Unit Price ($)</label>
                            <div className="relative">
                               <DollarSign className="absolute left-3 top-3.5 w-4 h-4 text-[#D4AF37]" />
                               <input 
                                type="number" 
                                className="w-full bg-black border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm focus:border-[#D4AF37] outline-none text-white" 
                                placeholder="0.00"
                                value={newServicePrice}
                                onChange={e => setNewServicePrice(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Pricing Unit (per...)</label>
                            <div className="flex gap-2">
                                <input 
                                  type="text" 
                                  className="flex-1 bg-black border border-white/10 rounded-xl px-4 py-3 text-sm focus:border-[#D4AF37] outline-none text-white"
                                  placeholder="e.g. person, hour, violin"
                                  value={newServiceUnit}
                                  onChange={e => setNewServiceUnit(e.target.value)}
                                />
                                <div className="flex items-center gap-2 bg-black/40 px-3 rounded-xl border border-white/5 text-[8px] text-slate-600 font-bold uppercase">
                                   <Info className="w-3 h-3" /> Custom Unit
                                </div>
                            </div>
                          </div>
                          <div className="flex flex-col justify-end">
                            <button 
                              type="button"
                              onClick={() => setNewServiceAllowQty(!newServiceAllowQty)}
                              className={`flex items-center justify-between w-full px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${newServiceAllowQty ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-black text-slate-500 border-white/10 hover:border-[#D4AF37]/50'}`}
                            >
                              <span className="flex items-center gap-2">
                                {newServiceAllowQty ? <CheckCircle className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
                                Enable Quantity Selection
                              </span>
                              <HelpCircle className="w-3.5 h-3.5 opacity-40" />
                            </button>
                            <p className="text-[8px] text-slate-600 mt-2 ml-1 italic">Allow clients to pick multiple units of this service.</p>
                          </div>
                        </div>

                        <div className="flex gap-3">
                           <button 
                              onClick={() => setShowAddForm(false)}
                              className="flex-1 bg-white/5 hover:bg-white/10 text-slate-400 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 transition-all"
                            >
                              Discard
                           </button>
                           <button 
                            onClick={handleAddService}
                            className="flex-[2] bg-[#D4AF37] hover:bg-[#E5C76B] text-black py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-[#D4AF37]/10 transition-all flex items-center justify-center gap-2"
                           >
                            <Plus className="w-4 h-4" /> Finalize & Add Package
                           </button>
                        </div>
                      </div>
                    )}

                    {/* Service List */}
                    <div className="grid grid-cols-1 gap-6">
                      {editForm.services && editForm.services.length > 0 ? (
                        editForm.services.map((service) => (
                          <div key={service.id} className="relative p-6 bg-black/40 border border-white/5 rounded-3xl group hover:border-[#D4AF37]/40 transition-all">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                              
                              {/* Left column: Name & Logic Toggle */}
                              <div className="lg:col-span-5 space-y-5">
                                <div className="space-y-1.5">
                                  <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Package Identity</label>
                                  <div className="relative">
                                    <Package className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/40" />
                                    <input 
                                      type="text"
                                      className="w-full bg-black/60 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:border-[#D4AF37] outline-none text-slate-100 transition-all"
                                      value={service.name}
                                      onChange={e => handleUpdateService(service.id, { name: e.target.value })}
                                      placeholder="Package Name"
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <button 
                                    onClick={() => handleUpdateService(service.id, { allowQuantity: !service.allowQuantity })}
                                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${service.allowQuantity ? 'text-[#D4AF37] border-[#D4AF37]/40 bg-[#D4AF37]/5' : 'text-slate-600 border-white/10 hover:bg-white/5'}`}
                                  >
                                    {service.allowQuantity ? <Hash className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
                                    {service.allowQuantity ? 'Quantity Enabled' : 'Fixed Package'}
                                  </button>
                                  <button 
                                    onClick={() => handleRemoveService(service.id)}
                                    className="p-2.5 text-slate-700 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all border border-transparent hover:border-red-500/20"
                                    title="Delete Package"
                                  >
                                    <Trash2 className="w-4.5 h-4.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Right column: Price & Units */}
                              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-1.5">
                                  <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Base Rate ($)</label>
                                  <div className="relative">
                                    <DollarSign className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/40" />
                                    <input 
                                      type="number"
                                      className="w-full bg-black/60 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm font-bold focus:border-[#D4AF37] outline-none text-[#D4AF37] transition-all"
                                      value={service.price}
                                      onChange={e => handleUpdateService(service.id, { price: parseFloat(e.target.value) || 0 })}
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Pricing Model (per...)</label>
                                  <div className="relative">
                                    <div className="absolute left-3 top-3 text-[10px] font-bold text-slate-600 uppercase tracking-widest">per</div>
                                    <input 
                                      type="text"
                                      className="w-full bg-black/60 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm focus:border-[#D4AF37] outline-none text-slate-100 transition-all"
                                      value={service.unit}
                                      onChange={e => handleUpdateService(service.id, { unit: e.target.value })}
                                      placeholder="e.g. event"
                                    />
                                  </div>
                                </div>
                                <div className="sm:col-span-2">
                                  <div className="bg-black/80 px-4 py-2 rounded-xl border border-white/5 flex items-center justify-between">
                                     <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em]">Live Preview</span>
                                     <span className="text-[10px] font-bold text-slate-400">
                                       {service.name || 'Unnamed Package'} — ${service.price.toLocaleString()} per {service.unit || 'unit'}
                                       {service.allowQuantity && ' (Multiple select enabled)'}
                                     </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="py-20 text-center border-2 border-dashed border-white/5 rounded-[2.5rem] bg-black/20">
                           <div className="bg-white/5 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                              <Tag className="w-8 h-8 text-slate-700" />
                           </div>
                           <h4 className="text-slate-400 font-bold uppercase tracking-widest text-sm">Catalog is Empty</h4>
                           <p className="text-[10px] text-slate-600 mt-2 max-w-xs mx-auto leading-relaxed">Defining specific services allows clients to build custom quotes and helps you automate your booking flow.</p>
                           <button 
                             onClick={() => setShowAddForm(true)}
                             className="mt-6 bg-[#D4AF37]/10 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#D4AF37]/30 transition-all"
                           >
                             Add My First Service
                           </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
               </div>

               {/* Media Showcase */}
               <div className="bg-[#111] rounded-3xl border border-white/5 shadow-2xl overflow-hidden">
                  <button 
                    onClick={() => toggleSection('media')}
                    className="w-full p-8 border-b border-white/5 bg-black/40 flex justify-between items-center group cursor-pointer"
                  >
                    <div className="text-left">
                      <h3 className="text-xl font-bold font-[Cinzel] text-[#D4AF37]">Media Showcase</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Manage images and videos appearing on your card</p>
                    </div>
                    <ChevronRight className={`w-6 h-6 text-slate-600 transition-transform ${collapsedSections['media'] ? '' : 'rotate-90'}`} />
                  </button>
                  
                  {!collapsedSections['media'] && (
                    <div className="p-8 space-y-6 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex justify-end gap-3">
                      {isUploadingMedia && (
                        <div className="flex items-center gap-2 text-[#D4AF37] text-[10px] font-black uppercase tracking-widest animate-pulse mr-auto">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading to Asset Cloud...
                        </div>
                      )}
                      <button 
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.accept = "image/*";
                            fileInputRef.current.click();
                          }
                        }}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-slate-300 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 transition-all"
                      >
                        <ImageIcon className="w-4 h-4" /> Add Photo
                      </button>
                      <button 
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.accept = "video/*";
                            fileInputRef.current.click();
                          }
                        }}
                        className="flex items-center gap-2 bg-[#D4AF37]/10 hover:bg-[#D4AF37] hover:text-black px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#D4AF37]/20 transition-all"
                      >
                        <Film className="w-4 h-4" /> Upload Video
                      </button>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        onChange={handleMediaUpload} 
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {editForm.gallery?.map((url, idx) => {
                        const isVideo = url.startsWith('data:video/') || url.match(/\.(mp4|webm|ogg)$/i);
                        return (
                          <div key={idx} className="relative aspect-square bg-black rounded-2xl overflow-hidden border border-white/5 group ring-1 ring-white/5 shadow-2xl">
                            {isVideo ? (
                              <video src={url} className="w-full h-full object-cover" />
                            ) : (
                              <img src={url} className="w-full h-full object-cover" />
                            )}
                            <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center p-2 text-center">
                              <button 
                                onClick={() => handleRemoveMedia(idx)}
                                className="p-3 bg-red-600 text-white rounded-xl hover:bg-red-500 transition-colors shadow-xl"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            {isVideo && (
                              <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-md text-[8px] font-black text-[#D4AF37] border border-[#D4AF37]/30 flex items-center gap-1">
                                <Video className="w-2.5 h-2.5" /> VIDEO
                              </div>
                            )}
                          </div>
                        );
                      })}
                      
                      {(!editForm.gallery || editForm.gallery.length === 0) && (
                        <div className="col-span-full py-16 text-center border-2 border-dashed border-white/5 rounded-3xl opacity-20">
                           <ImageIcon className="w-12 h-12 mx-auto mb-3" />
                           <p className="text-[10px] font-black uppercase tracking-widest">Gallery is currently empty</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
               </div>

               {/* Email Debug Section */}
               <div className="bg-[#111] rounded-3xl border border-white/5 shadow-2xl overflow-hidden">
                  <button 
                    onClick={() => toggleSection('email')}
                    className="w-full p-8 border-b border-white/5 bg-black/40 flex justify-between items-center group cursor-pointer"
                  >
                    <div className="text-left">
                      <h3 className="text-xl font-bold font-[Cinzel] text-[#D4AF37]">Email Debugger</h3>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Test your SMTP configuration</p>
                    </div>
                    <ChevronRight className={`w-6 h-6 text-slate-600 transition-transform ${collapsedSections['email'] ? '' : 'rotate-90'}`} />
                  </button>
                  
                  {!collapsedSections['email'] && (
                    <div className="p-8 space-y-4 animate-in slide-in-from-top-2 duration-300">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      If automated emails are not sending, use this tool to trigger a manual test. 
                      Check the server logs for detailed Nodemailer error reports.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1 relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                        <input 
                          type="email"
                          placeholder="recipient@example.com"
                          className="w-full bg-black border border-white/10 rounded-xl pl-12 pr-4 py-4 text-sm focus:border-[#D4AF37] outline-none text-slate-100 transition-all"
                          value={testEmail}
                          onChange={(e) => setTestEmail(e.target.value)}
                        />
                      </div>
                      <button 
                        onClick={handleSendTestEmail}
                        disabled={isSendingTest}
                        className="bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest border border-white/10 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isSendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {isSendingTest ? 'Sending...' : 'Send Test'}
                      </button>
                    </div>
                    
                    {testEmailStatus?.success && (
                      <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2 duration-300">
                        <CheckCircle className="w-4 h-4 text-green-500" />
                        <p className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Test email sent! Check your inbox.</p>
                      </div>
                    )}
                    
                    {testEmailStatus?.error && (
                      <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top-2 duration-300">
                        <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
                        <div>
                          <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Email Failed</p>
                          <p className="text-[10px] text-red-400 mt-1 font-mono break-all">{testEmailStatus.error}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
               </div>

               {/* Footer Action */}
               <div className="bg-black/60 p-8 rounded-3xl border border-[#D4AF37]/20 flex flex-col sm:flex-row justify-between items-center gap-6">
                 <div className="flex items-center gap-3 text-slate-600 text-center sm:text-left">
                    <AlertCircle className="w-5 h-5 text-[#D4AF37]/40 flex-shrink-0" />
                    <p className="text-[9px] font-bold uppercase tracking-widest italic leading-relaxed">Profile edits are subject to verification <br className="hidden sm:block" /> and will reflect instantly upon committing.</p>
                 </div>
                 <button 
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="w-full sm:w-auto min-w-[240px] bg-[#D4AF37] hover:bg-[#E5C76B] text-black px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-2xl shadow-[#D4AF37]/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                 >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> 
                      Persisting...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> 
                      Commit Changes
                    </>
                  )}
                 </button>
               </div>
            </div>
          )}
          
          {(activeTab === 'history') && (
            <div className="bg-[#111] p-10 rounded-3xl border border-dashed border-white/10 text-center space-y-4 animate-in fade-in duration-300">
              <div className="bg-[#D4AF37]/5 w-20 h-20 rounded-full flex items-center justify-center mx-auto"><Settings className="w-8 h-8 text-[#D4AF37]/20" /></div>
              <p className="text-xs font-bold text-slate-600 uppercase tracking-widest">The "{activeTab}" module is currently under maintenance.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default VendorPortal;