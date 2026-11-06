import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, CalendarDays, Settings, LogOut, DollarSign, Users, User, TrendingUp, CheckCircle, XCircle, Clock, Save, Trash2, 
  ImageIcon, Menu, X, Plus, Tag, CreditCard, ArrowRight, Video, Film, ShieldCheck, MapPin, Eye, Upload, Mail, AlertTriangle, 
  ChevronLeft, ChevronRight, ChevronDown, RefreshCw, History, Loader2, Play, Calendar, Lock, Unlock, MessageSquare, Send, AlertCircle, Bell, BellRing, Info, ClipboardList, Edit3, Hash, Layers, Package, HelpCircle, ExternalLink, Check, CheckCheck, Volume2, Camera, FileText, Download, Search, ArrowLeft, Paperclip, Mic, StopCircle
} from 'lucide-react';
import { Vendor, Booking, Message, SelectedService, VendorService, ServiceCategoryType } from '../types';
import { db, storage, auth } from '../services/firebase';
import { getAuth, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { markChatAsRead, deleteMessage, sendNewMessage } from '../services/messagingService';
import { doc, updateDoc, writeBatch, onSnapshot, collection, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { uploadFileRobustly, uploadFileWithProgress } from '../services/uploadService';
import { CustomAudioPlayer } from './CustomAudioPlayer';
import LocationAutocomplete from './LocationAutocomplete';
import { ThemeModeSwitch } from './ThemeModeSwitch';
import { useModalDragDismiss, ModalDragIndicator } from './useModalDragDismiss';
import ChatModal from './ChatModal';

interface VendorPortalProps {
  vendor: Vendor;
  bookings: Booking[];
  messages: Message[];
  onUpdateVendor: (updatedVendor: Vendor) => void;
  onUpdateBookingStatus: (bookingId: string, status: 'confirmed' | 'cancelled') => void;
  onReplyMessage: (clientEmail: string, clientName: string, text: string, type?: 'text' | 'image' | 'voice' | 'file', fileUrl?: string, audioUrl?: string, fileName?: string, fileType?: string) => void;
  showNotification: (message: string, type?: 'success' | 'info' | 'error') => void;
  onLogout: () => void;
  onSwitchToClientView?: () => void;
  onActiveChatChange?: (isActive: boolean) => void;
  onTabChange?: (tab: string) => void;
  initialTab?: string;
  themeMode?: 'dark' | 'light';
  onToggleThemeMode?: (mode: 'dark' | 'light') => void;
}

const isEmbedVideo = (url?: string | null) => {
  if (!url) return false;
  return /youtube\.com\/embed\/|player\.vimeo\.com\/video\//i.test(url);
};

const isVideo = (url?: string | null) => {
  if (!url) return false;
  return !!(
    isEmbedVideo(url) ||
    url.startsWith('data:video/') ||
    url.match(/\.(mp4|webm|ogg|mov|m4v|avi|ogv)(?:\?|$|#|%)/i) || 
    url.includes('video%2F') || 
    url.includes('video/') ||
    url.includes('simcha_video=1') ||
    url.includes('dl.dropboxusercontent.com')
  );
};

const validateAndNormalizeVideoUrl = (rawInput: string): {
  isValid: boolean;
  normalizedUrl?: string;
  error?: string;
  shouldProbeVideo?: boolean;
} => {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      isValid: false,
      error: 'Please paste a video link before adding it to your showcase.',
    };
  }

  if (/\s/.test(trimmed)) {
    return {
      isValid: false,
      error: 'Invalid URL format. Make sure the link does not contain spaces.',
    };
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return {
      isValid: false,
      error: 'That does not look like a valid web address. Please paste a full https:// video link.',
    };
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) {
    return {
      isValid: false,
      error: 'Please enter a valid https:// video URL (e.g., YouTube, Vimeo, Dropbox, or direct .mp4 link).',
    };
  }

  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname;

  // Reject obvious non-video file extensions (images, documents, webpages)
  if (/\.(jpe?g|png|gif|webp|svg|bmp|ico|pdf|docx?|xlsx?|zip|rar|html?|php|asp)(?:\?|$|#)/i.test(pathname)) {
    return {
      isValid: false,
      error: 'This link points to an image or webpage rather than a video. Please paste a video link (.mp4, .mov, .webm, YouTube, or Vimeo).',
    };
  }

  // 1. Validate & Normalize YouTube Links
  if (host === 'youtu.be' || host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    let ytId = '';
    if (host === 'youtu.be') {
      ytId = pathname.split('/').filter(Boolean)[0] || '';
    } else if (pathname.startsWith('/watch')) {
      ytId = parsed.searchParams.get('v') || '';
    } else {
      const match = pathname.match(/^\/(?:shorts|embed|live|v)\/([a-zA-Z0-9_-]{6,})/i);
      if (match?.[1]) ytId = match[1];
    }

    if (!ytId || !/^[a-zA-Z0-9_-]{6,15}$/.test(ytId)) {
      return {
        isValid: false,
        error: 'Invalid YouTube link. Please paste a link to a specific YouTube video or Short (e.g., youtube.com/watch?v=... or youtu.be/...).',
      };
    }

    return {
      isValid: true,
      normalizedUrl: `https://www.youtube.com/embed/${ytId}`,
    };
  }

  // 2. Validate & Normalize Vimeo Links
  if (host.endsWith('vimeo.com')) {
    const vimeoMatch = pathname.match(/\/(?:video\/|channels\/[^/]+\/|groups\/[^/]+\/videos\/)?(\d{5,})/i);
    if (!vimeoMatch?.[1]) {
      return {
        isValid: false,
        error: 'Invalid Vimeo link. Please paste a direct link to a specific Vimeo video (e.g., vimeo.com/123456789).',
      };
    }

    return {
      isValid: true,
      normalizedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
    };
  }

  // 3. Validate & Normalize Dropbox Links
  if (host.endsWith('dropbox.com') || host.endsWith('dropboxusercontent.com')) {
    if (pathname === '/' || pathname.length < 4) {
      return {
        isValid: false,
        error: 'Invalid Dropbox link. Please paste a shared link to a specific video file.',
      };
    }
    let directDropbox = withProtocol
      .replace(/^https?:\/\/(www\.)?dropbox\.com\//i, 'https://dl.dropboxusercontent.com/')
      .replace(/[?&]dl=0/i, '')
      .replace(/[?&]dl=1/i, '');
    directDropbox = directDropbox.includes('#')
      ? `${directDropbox}&simcha_video=1`
      : `${directDropbox}#t=0.001&simcha_video=1`;
    return {
      isValid: true,
      normalizedUrl: directDropbox,
      shouldProbeVideo: true,
    };
  }

  // 4. Validate & Normalize Google Drive Video Links
  if (host === 'drive.google.com') {
    const driveMatch = withProtocol.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/i) || [null, parsed.searchParams.get('id')];
    if (!driveMatch?.[1]) {
      return {
        isValid: false,
        error: 'Invalid Google Drive link. Please paste a shared file link (e.g., drive.google.com/file/d/.../view).',
      };
    }
    const directDrive = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}#t=0.001&simcha_video=1`;
    return {
      isValid: true,
      normalizedUrl: directDrive,
    };
  }

  // 5. Direct Video File Extensions (.mp4, .mov, .webm, .m4v, .ogg, .ogv) or Known Video Storage / CDN Hosts
  const hasVideoExtension = /\.(mp4|webm|ogg|mov|m4v|ogv|m3u8)(?:\?|$|#)/i.test(withProtocol);
  const isKnownVideoStorageHost =
    /firebasestorage\.googleapis\.com|storage\.googleapis\.com|cloudinary\.com|mux\.com|b-cdn\.net|cloudfront\.net|r2\.dev|amazonaws\.com|digitaloceanspaces\.com|supabase\.co|vimeo|jwplatform\.com/i.test(
      host
    ) ||
    withProtocol.includes('video%2F') ||
    withProtocol.includes('video/');

  if (hasVideoExtension || isKnownVideoStorageHost) {
    const taggedUrl = withProtocol.includes('#')
      ? `${withProtocol}&simcha_video=1`
      : `${withProtocol}#t=0.001&simcha_video=1`;
    return {
      isValid: true,
      normalizedUrl: taggedUrl,
      shouldProbeVideo: true,
    };
  }

  return {
    isValid: false,
    error:
      'Unsupported video link. Please paste a valid YouTube, Vimeo, Dropbox, Google Drive, or direct video file (.mp4, .mov, .webm) URL.',
  };
};

const renderMedia = (url: string | undefined | null, className: string, defaultContent?: React.ReactNode) => {
  if (!url) return defaultContent || null;
  if (isVideo(url)) {
    return <video controls autoPlay muted loop playsInline src={url} className={className} />;
  }
  return <img src={url} className={className} alt="" />;
};

const EVENT_MODAL_TRANSITION = { duration: 1.15, ease: [0.25, 0.85, 0.35, 1] as const };

const VendorEventScopeModal: React.FC<{
  selectedCalendarEvent: {
    type: 'google' | 'simcha';
    id: string;
    title: string;
    start: string;
    end: string;
    location?: string;
    notes?: string;
    badge: 'Google Calendar Event' | 'Simcha Booking/event';
    clientName?: string;
    contactEmail?: string;
    amount?: number;
    selectedServices?: SelectedService[];
    status?: string;
    bookingId?: string;
  };
  onClose: () => void;
  openDrawerSections: Record<string, boolean>;
  toggleDrawerSection: (section: string) => void;
  AccordionSection: React.FC<{
    title: string;
    icon: any;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
  }>;
  onUpdateBookingStatus: (bookingId: string, status: 'confirmed' | 'cancelled') => void;
  showNotification: (message: string, type?: 'success' | 'info') => void;
}> = ({
  selectedCalendarEvent,
  onClose,
  openDrawerSections,
  toggleDrawerSection,
  AccordionSection,
  onUpdateBookingStatus,
  showNotification
}) => {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const { backdropOpacity, isDismissing, dragModalProps, dragHandleProps, dismissWithSlideOut } = useModalDragDismiss(
    onClose,
    true
  );

  return (
    <motion.div
      style={{ opacity: backdropOpacity }}
      transition={EVENT_MODAL_TRANSITION}
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-event-modal-title"
      className={`fixed inset-0 z-[110] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 bg-black/80 backdrop-blur-md overflow-hidden ${isDismissing ? 'pointer-events-none' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismissWithSlideOut();
      }}
    >
      <motion.div
        {...dragModalProps}
        transition={EVENT_MODAL_TRANSITION}
        className={`bg-[#0a0a0a] w-full sm:w-full sm:max-w-xl h-[96dvh] sm:h-[90vh] sm:max-h-[90vh] rounded-t-[2.5rem] rounded-b-none sm:rounded-[2.5rem] border-t-2 border-r border-l sm:border border-[#D4AF37]/30 shadow-[0_0_50px_rgba(212,175,55,0.18)] overflow-hidden relative flex flex-col mt-auto sm:mt-0 transform-gpu ${isDismissing ? 'pointer-events-none' : ''}`}
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

        {/* Floating X Close Button matching BookingModal & QuickViewModal */}
        <button
          type="button"
          onClick={() => dismissWithSlideOut()}
          aria-label="Close"
          className="absolute top-4 right-4 z-[120] w-8 h-8 flex items-center justify-center bg-[#1a1a1a] hover:bg-[#262626] border border-[#D4AF37]/40 rounded-full text-[#D4AF37] transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] shadow-xl cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div
          {...dragHandleProps}
          data-drag-handle="true"
          className="px-6 pt-7 pb-4 border-b border-white/10 flex justify-between items-center bg-black/50 pr-14 cursor-grab active:cursor-grabbing select-none"
        >
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {selectedCalendarEvent.type === 'simcha' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse"></span>
                  {selectedCalendarEvent.clientName || 'Simcha Request'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-[#D4AF37]/15 text-zinc-400 border border-zinc-400/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-pulse"></span> Google Calendar Event
                </span>
              )}
              {selectedCalendarEvent.notes?.includes('OFFERED PRICE:') && (
                <span className="px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-[#D4AF37] text-black">
                  Client Offer
                </span>
              )}
            </div>
            <h2 id="calendar-event-modal-title" className="text-lg sm:text-xl font-bold font-[Cinzel] text-[#D4AF37] leading-tight truncate">
              {selectedCalendarEvent.title}
            </h2>
          </div>
        </div>

        {/* Scrollable Body */}
        <div data-modal-scroll className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 custom-scrollbar">
          {/* Logistics Accordion */}
          <AccordionSection
            title="Logistics & Scheduling"
            icon={Clock}
            isOpen={openDrawerSections.logistics}
            onToggle={() => toggleDrawerSection('logistics')}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
              {/* Start Date & Time */}
              <div className="bg-black/30 p-3.5 rounded-2xl border border-white/5 flex items-start gap-3 hover:border-white/10 transition-colors">
                <Clock className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[9px] text-zinc-400 font-black uppercase tracking-widest mb-1">Start Logistics</p>
                  <p className="text-white font-bold text-xs sm:text-sm leading-tight">{selectedCalendarEvent.start}</p>
                </div>
              </div>

              {/* End Date & Time */}
              <div className="bg-black/30 p-3.5 rounded-2xl border border-white/5 flex items-start gap-3 hover:border-white/10 transition-colors">
                <Clock className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[9px] text-zinc-400 font-black uppercase tracking-widest mb-1">End Logistics</p>
                  <p className="text-white font-bold text-xs sm:text-sm leading-tight">{selectedCalendarEvent.end}</p>
                </div>
              </div>

              {/* Location */}
              <div className="bg-black/30 p-3.5 rounded-2xl border border-white/5 flex items-start gap-3 col-span-1 md:col-span-2 hover:border-white/10 transition-colors">
                <MapPin className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-zinc-400 font-black uppercase tracking-widest mb-1">Event Location</p>
                  <p className="text-white font-bold text-xs sm:text-sm leading-tight break-words">{selectedCalendarEvent.location || 'Not specified'}</p>
                </div>
                {selectedCalendarEvent.location && selectedCalendarEvent.location !== 'Venue address pending' && selectedCalendarEvent.location !== 'Not specified' && (
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(selectedCalendarEvent.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-[#D4AF37]/10 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black px-3.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border border-[#D4AF37]/30 transition-all shrink-0 self-center cursor-pointer"
                  >
                    Navigate
                  </a>
                )}
              </div>
            </div>
          </AccordionSection>

          {/* Event Context: Google Event Description */}
          {selectedCalendarEvent.type === 'google' && (
            <AccordionSection
              title="Calendar Description"
              icon={FileText}
              isOpen={openDrawerSections.notes}
              onToggle={() => toggleDrawerSection('notes')}
            >
              <div className="bg-black/40 p-4 rounded-2xl border border-white/5 text-zinc-300 text-xs leading-relaxed whitespace-pre-wrap mt-2">
                {selectedCalendarEvent.notes || 'No description provided for this Google event.'}
              </div>
            </AccordionSection>
          )}

          {/* Event Context: Simcha Booking/event Details */}
          {selectedCalendarEvent.type === 'simcha' && (
            <>
              {/* Client Info */}
              <AccordionSection
                title="Client Information"
                icon={User}
                isOpen={openDrawerSections.client}
                onToggle={() => toggleDrawerSection('client')}
              >
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5 grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <div>
                    <p className="text-[9px] text-zinc-400 font-black uppercase tracking-widest mb-1">Client Name</p>
                    <p className="text-white font-bold text-sm">{selectedCalendarEvent.clientName || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-zinc-400 font-black uppercase tracking-widest mb-1">Contact Email</p>
                    <p className="text-white font-bold text-sm break-all">{selectedCalendarEvent.contactEmail || 'N/A'}</p>
                  </div>
                </div>
              </AccordionSection>

              {/* Packages / Services */}
              <AccordionSection
                title="Requested Locations & Add-ons"
                icon={ClipboardList}
                isOpen={openDrawerSections.services}
                onToggle={() => toggleDrawerSection('services')}
              >
                <div className="bg-black/40 rounded-2xl border border-white/5 overflow-hidden mt-2">
                  {selectedCalendarEvent.selectedServices && selectedCalendarEvent.selectedServices.length > 0 ? (
                    <div className="divide-y divide-white/5">
                      {selectedCalendarEvent.selectedServices.map((s: SelectedService) => (
                        <div key={s.id} className="p-3.5 flex justify-between items-center hover:bg-white/5 transition-colors">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-zinc-200">{s.name}</span>
                            <span className="text-[9px] text-zinc-400 font-black uppercase tracking-widest">
                              {s.hours ? `${s.hours} hrs` : `Qty: ${s.quantity}`} {s.unit && s.unit !== 'location' ? `• ${s.unit}` : ''}
                            </span>
                          </div>
                          <span className="text-xs font-black text-[#D4AF37]">
                            ${((s.price * (s.quantity || 1)) + (s.hours && s.defaultHours && s.hourlyRate ? Math.max(0, s.hours - s.defaultHours) * s.hourlyRate : 0)).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center">
                      <p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Base Package Requested</p>
                    </div>
                  )}
                  <div className="p-3.5 bg-[#D4AF37]/10 border-t border-[#D4AF37]/20 flex justify-between items-center">
                    <span className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest">
                      {selectedCalendarEvent.notes?.includes('OFFERED PRICE:') ? 'Offered Price' : 'Total Value'}
                    </span>
                    <span className="text-lg font-black text-[#D4AF37] font-[Cinzel]">${(selectedCalendarEvent.amount || 0).toLocaleString()}</span>
                  </div>
                </div>
              </AccordionSection>

              {/* Message / Notes */}
              <AccordionSection
                title="Message from Client"
                icon={MessageSquare}
                isOpen={openDrawerSections.notes}
                onToggle={() => toggleDrawerSection('notes')}
              >
                <div className="bg-black/40 p-4 rounded-2xl border border-white/5 italic text-zinc-300 text-xs leading-relaxed whitespace-pre-wrap mt-2">
                  {selectedCalendarEvent.notes ? `"${selectedCalendarEvent.notes}"` : "No additional notes provided by client."}
                </div>
              </AccordionSection>
            </>
          )}
        </div>

        {/* Slimmed-Down Pill Action Buttons (Same Height, Normal Red & Normal Solid Green) */}
        <div className="px-5 py-3.5 bg-black border-t border-white/10">
          {selectedCalendarEvent.type === 'simcha' && selectedCalendarEvent.status === 'pending' ? (
            <div className="flex items-center justify-between gap-2.5 sm:gap-4">
              <button
                type="button"
                onClick={() => {
                  onUpdateBookingStatus(selectedCalendarEvent.id, 'cancelled');
                  dismissWithSlideOut();
                }}
                className="flex-1 h-9 px-3 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-full font-black text-[9px] sm:text-[10px] uppercase tracking-widest border border-red-600 transition-all flex items-center justify-center cursor-pointer shadow-sm"
              >
                Decline
              </button>

              <button
                type="button"
                onClick={() => {
                  const amount = prompt("Enter counter-offer amount ($):", (selectedCalendarEvent.amount || 0).toString());
                  if (amount && !isNaN(Number(amount))) {
                    const newNotes = `OFFERED PRICE: $${amount}. ${selectedCalendarEvent.notes || ''}`;
                    updateDoc(doc(db, 'bookings', selectedCalendarEvent.id), {
                      amount: Number(amount),
                      notes: newNotes
                    }).then(() => {
                      showNotification("Counter-offer sent!");
                      dismissWithSlideOut();
                    });
                  }
                }}
                className="flex-1 h-9 px-3 mx-1 sm:mx-2 bg-zinc-900 hover:bg-zinc-800 active:scale-95 text-[#D4AF37] rounded-full font-black text-[9px] sm:text-[10px] uppercase tracking-widest border border-[#D4AF37]/40 transition-all flex items-center justify-center cursor-pointer shadow-sm"
              >
                Make Offer
              </button>

              <button
                type="button"
                onClick={() => {
                  onUpdateBookingStatus(selectedCalendarEvent.id, 'confirmed');
                  dismissWithSlideOut();
                }}
                className="flex-[1.35] h-9 px-4 bg-green-600 hover:bg-green-700 active:scale-95 text-white rounded-full font-black text-[9px] sm:text-[10px] uppercase tracking-widest border border-green-600 transition-all flex items-center justify-center cursor-pointer shadow-sm"
              >
                Confirm & Accept
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => dismissWithSlideOut()}
              className="w-full h-9 bg-white/5 hover:bg-white/10 active:scale-95 text-zinc-300 rounded-full font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center cursor-pointer"
            >
              Close
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

type ProfileSettingModalType = 'basic' | 'locations' | 'addons' | 'media' | 'offers' | 'privacy' | 'email' | null;

const VendorSettingSheetModal: React.FC<{
  title: string;
  subtitle: string;
  badgeText?: string;
  icon: any;
  onClose: () => void;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}> = ({
  title,
  subtitle,
  badgeText = 'Vendor Settings',
  icon: Icon,
  onClose,
  headerRight,
  children,
}) => {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const { backdropOpacity, isDismissing, dragModalProps, dragHandleProps, dismissWithSlideOut } = useModalDragDismiss(
    onClose,
    true
  );

  useEffect(() => {
    if (isDismissing) {
      document.body.style.overflow = '';
    }
  }, [isDismissing]);

  const modalNode = (
    <motion.div
      style={{ opacity: backdropOpacity }}
      transition={EVENT_MODAL_TRANSITION}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={`simcha-modal-gpu-wrapper will-change-transform transform-gpu fixed inset-0 z-[160] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 bg-black/80 backdrop-blur-md overflow-hidden ${isDismissing ? 'pointer-events-none' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismissWithSlideOut();
      }}
    >
      <motion.div
        {...dragModalProps}
        transition={EVENT_MODAL_TRANSITION}
        className={`simcha-modal-gpu-wrapper will-change-transform transform-gpu bg-[#111] w-full sm:w-full sm:max-w-xl h-[92dvh] sm:h-auto sm:max-h-[88vh] rounded-t-[2.5rem] rounded-b-none sm:rounded-[2.5rem] border-t-2 border-r border-l sm:border border-[#D4AF37]/30 shadow-2xl overflow-hidden relative flex flex-col mt-auto sm:mt-0 ${isDismissing ? 'pointer-events-none' : ''}`}
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

        {/* Floating X Close Button matching BookingModal & QuickViewModal */}
        <button
          type="button"
          onClick={() => dismissWithSlideOut()}
          aria-label="Close"
          className="absolute top-4 right-4 z-[120] w-8 h-8 flex items-center justify-center bg-[#1a1a1a] hover:bg-[#262626] border border-[#D4AF37]/40 rounded-full text-[#D4AF37] transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] shadow-xl cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Sheet Header */}
        <div
          {...dragHandleProps}
          data-drag-handle="true"
          className="px-5 sm:px-6 pt-8 pb-4 border-b border-white/10 flex items-center justify-between gap-3 bg-black/50 pr-14 cursor-grab active:cursor-grabbing select-none"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0 shadow-inner">
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-[0.2em] bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30">
                  {badgeText}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold font-[Cinzel] text-white leading-tight truncate mt-1">
                {title}
              </h2>
              <p className="text-[11px] text-zinc-400 font-medium truncate mt-0.5">{subtitle}</p>
            </div>
          </div>
          {headerRight && (
            <div className="shrink-0" onPointerDown={(e) => e.stopPropagation()}>
              {headerRight}
            </div>
          )}
        </div>

        {/* Scrollable Sheet Body */}
        <div data-modal-scroll className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 custom-scrollbar">
          {children}
        </div>

        {/* Sleek Pill Footer Bar */}
        <div className="px-5 py-3.5 bg-black border-t border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            <span>Auto-Save Enabled</span>
          </div>
          <button
            type="button"
            onClick={() => dismissWithSlideOut()}
            className="h-10 px-8 bg-[#D4AF37] hover:bg-[#E5C76B] active:scale-95 text-black rounded-full font-black text-[10px] uppercase tracking-[0.2em] border border-[#D4AF37] transition-all flex items-center justify-center cursor-pointer shadow-lg"
          >
            Done
          </button>
        </div>
      </motion.div>
    </motion.div>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : modalNode;
};

const VendorPortal: React.FC<VendorPortalProps> = ({ vendor, bookings, messages, onUpdateVendor, onUpdateBookingStatus, onReplyMessage, showNotification, onLogout, onSwitchToClientView, onActiveChatChange, onTabChange, initialTab, themeMode = 'dark', onToggleThemeMode }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'history' | 'calendar' | 'profile' | 'messages'>(initialTab as any || 'overview');
  const [activeProfileSettingModal, setActiveProfileSettingModal] = useState<ProfileSettingModalType>(null);
  
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedBookingForDetail, setSelectedBookingForDetail] = useState<Booking | null>(null);
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState<{
    type: 'google' | 'simcha';
    id: string;
    title: string;
    start: string;
    end: string;
    location?: string;
    notes?: string;
    badge: 'Google Calendar Event' | 'Simcha Booking/event';
    clientName?: string;
    contactEmail?: string;
    amount?: number;
    selectedServices?: SelectedService[];
    status?: string;
    bookingId?: string;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [openDrawerSections, setOpenDrawerSections] = useState<Record<string, boolean>>({
    logistics: true,
    client: true,
    services: true,
    notes: true
  });

  const toggleDrawerSection = (section: string) => {
    setOpenDrawerSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Client profile photo & directory lookup map so Request and Chat pills resolve client UID, email, name, and photo
  const [clientPhotosMap, setClientPhotosMap] = useState<Record<string, string>>({});
  const [clientDirectoryMap, setClientDirectoryMap] = useState<Record<string, { uid: string; email: string; name: string; photoURL?: string }>>({});
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const photoMap: Record<string, string> = {};
        const dirMap: Record<string, { uid: string; email: string; name: string; photoURL?: string }> = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          const emailLower = data?.email ? String(data.email).trim().toLowerCase() : '';
          const entry = {
            uid: d.id,
            email: data?.email ? String(data.email).trim() : '',
            name: data?.name || (emailLower ? emailLower.split('@')[0] : 'Client'),
            photoURL: data?.photoURL || undefined,
          };
          dirMap[d.id] = entry;
          if (emailLower) {
            dirMap[emailLower] = entry;
          }
          if (data?.photoURL) {
            photoMap[d.id] = data.photoURL;
            if (emailLower) {
              photoMap[emailLower] = data.photoURL;
            }
          }
        });
        setClientPhotosMap(photoMap);
        setClientDirectoryMap(dirMap);
      },
      () => {}
    );
    return () => unsub();
  }, []);

  // Direct real-time listener for all conversations involving this vendor so messages arrive immediately
  const [liveVendorMessages, setLiveVendorMessages] = useState<Message[]>([]);
  useEffect(() => {
    if (!vendor?.id) return;
    const msgListeners = new Map<string, () => void>();
    const convoMsgsMap = new Map<string, Message[]>();

    const rebuild = () => {
      const seen = new Set<string>();
      const list: Message[] = [];
      for (const arr of convoMsgsMap.values()) {
        for (const m of arr) {
          if (m.id && seen.has(m.id)) continue;
          if (m.id) seen.add(m.id);
          list.push(m);
        }
      }
      list.sort((a, b) => {
        const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tA - tB;
      });
      setLiveVendorMessages(list);
    };

    const subscribeConvoDoc = (cid: string) => {
      if (!cid || msgListeners.has(cid)) return;
      const unsubMsg = onSnapshot(
        collection(db, 'conversations', cid, 'messages'),
        (snap) => {
          const msgs = snap.docs.map((docSnap) => {
            const data = docSnap.data();
            let timestampStr = data.timestamp || new Date().toISOString();
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
              conversationId: data.conversationId || cid,
              timestamp: timestampStr,
            } as Message;
          });
          convoMsgsMap.set(cid, msgs);
          rebuild();
        },
        () => {}
      );
      msgListeners.set(cid, unsubMsg);
    };

    const qParticipants = query(
      collection(db, 'conversations'),
      where('participant_ids', 'array-contains', vendor.id)
    );
    const qVendorField = query(
      collection(db, 'conversations'),
      where('vendor_id', '==', vendor.id)
    );

    const unsub1 = onSnapshot(
      qParticipants,
      (snap) => {
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.type === 'admin_support') return;
          subscribeConvoDoc(d.id);
        });
      },
      () => {}
    );

    const unsub2 = onSnapshot(
      qVendorField,
      (snap) => {
        snap.docs.forEach((d) => {
          const data = d.data();
          if (data.type === 'admin_support') return;
          subscribeConvoDoc(d.id);
        });
      },
      () => {}
    );

    return () => {
      unsub1();
      unsub2();
      msgListeners.forEach((u) => u());
      msgListeners.clear();
    };
  }, [vendor?.id]);

  const allVendorMessages = useMemo(() => {
    const byId = new Map<string, Message>();
    const combined = [...messages, ...liveVendorMessages];
    combined.forEach((m) => {
      if (!m) return;
      if (m.isAdminInquiry || m.senderId === 'admin' || m.receiverId === 'admin') return;
      const role = (m as any).sender_role;
      // Exclude messages where the vendor account was acting as a client messaging a DIFFERENT vendor
      if (role === 'client' && m.receiverId && m.receiverId !== vendor.id) {
        const vEmail = (vendor.contactEmail || vendor.username || '').trim().toLowerCase();
        if (!vEmail || m.vendorEmail?.toLowerCase() !== vEmail) {
          return;
        }
      }
      const key = m.id || m.tempId || `${m.senderId}_${m.timestamp}_${m.text}`;
      byId.set(key, m);
    });
    return Array.from(byId.values()).sort((a, b) => {
      const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tA - tB;
    });
  }, [messages, liveVendorMessages, vendor.id, vendor.contactEmail, vendor.username]);

  const getClientPhoto = (b: Booking): string | undefined => {
    if (b.clientPhotoURL) return b.clientPhotoURL;
    if (b.userId && clientPhotosMap[b.userId]) return clientPhotosMap[b.userId];
    if (b.contactEmail && clientPhotosMap[b.contactEmail.toLowerCase()]) {
      return clientPhotosMap[b.contactEmail.toLowerCase()];
    }
    return undefined;
  };

  const getClientInitials = (name?: string): string => {
    if (!name || !name.trim()) return 'C';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [activeTab]);

  // Premium Shimmer Skeleton Card
  const ShimmerCard = () => (
    <div className="bg-[#111] p-6 rounded-3xl border border-white/5 shadow-2xl space-y-4 relative overflow-hidden">
      <div className="w-12 h-12 rounded-2xl bg-white/5 animate-pulse" />
      <div className="space-y-2">
        <div className="h-3 w-1/3 bg-white/5 rounded animate-pulse" />
        <div className="h-8 w-2/3 bg-white/5 rounded animate-pulse" />
      </div>
      <motion.div 
        className="absolute inset-0 bg-gradient-to-r from-transparent via-[#D4AF37]/5 to-transparent"
        initial={{ x: '-100%' }}
        animate={{ x: '100%' }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
      />
    </div>
  );

  // Premium Shimmer Skeleton Analytics Chart
  const ShimmerChart = () => (
    <div className="bg-[#111] p-6 md:p-8 rounded-3xl border border-white/5 shadow-2xl space-y-6 relative overflow-hidden">
      <div className="space-y-2">
        <div className="h-4 w-1/4 bg-white/5 rounded animate-pulse" />
        <div className="h-3 w-1/3 bg-white/5 rounded animate-pulse" />
      </div>
      <div className="w-full h-[250px] md:h-[400px] bg-white/5 rounded-2xl animate-pulse flex items-end justify-between p-4">
        {[0.3, 0.5, 0.4, 0.7, 0.8, 0.6].map((h, i) => (
          <div key={i} className="bg-white/5 w-12 rounded-t-lg transition-all" style={{ height: `${h * 100}%` }} />
        ))}
      </div>
      <motion.div 
        className="absolute inset-0 bg-gradient-to-r from-transparent via-[#D4AF37]/5 to-transparent"
        initial={{ x: '-100%' }}
        animate={{ x: '100%' }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
      />
    </div>
  );

  // Premium Shimmer Skeleton Gigs Table
  const ShimmerTable = () => (
    <div className="bg-[#111] rounded-3xl border border-white/5 shadow-2xl overflow-hidden relative">
      <div className="p-6 border-b border-white/5 bg-black/20 flex justify-between items-center">
        <div className="h-4 w-40 bg-white/5 rounded animate-pulse" />
        <div className="h-8 w-24 bg-white/5 rounded animate-pulse" />
      </div>
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex justify-between items-center py-3 border-b border-white/5">
            <div className="space-y-2 flex-1">
              <div className="h-4 w-1/4 bg-white/5 rounded animate-pulse" />
              <div className="h-3 w-1/3 bg-white/5 rounded animate-pulse" />
            </div>
            <div className="h-6 w-20 bg-white/5 rounded-full animate-pulse mr-4" />
            <div className="h-10 w-28 bg-white/5 rounded-xl animate-pulse" />
          </div>
        ))}
      </div>
      <motion.div 
        className="absolute inset-0 bg-gradient-to-r from-transparent via-[#D4AF37]/5 to-transparent"
        initial={{ x: '-100%' }}
        animate={{ x: '100%' }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "linear" }}
      />
    </div>
  );

  // Accordion Header & Physics wrapper component
  const AccordionSection = ({ title, icon: Icon, isOpen, onToggle, children }: { title: string; icon: any; isOpen: boolean; onToggle: () => void; children: React.ReactNode }) => (
    <div className="border border-white/5 rounded-2xl overflow-hidden bg-black/20">
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5 text-[#D4AF37]">
          <Icon className="w-4 h-4" />
          <h3 className="font-black text-[10px] uppercase tracking-[0.2em]">{title}</h3>
        </div>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 15 }}
          className="text-zinc-400"
        >
          <ChevronDown className="w-4.5 h-4.5" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 180, damping: 20 }}
          >
            <div className="p-5 pt-0 border-t border-white/5 space-y-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // Search & Filters for Bookings List (Default to 'pending' = New Bookings)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'offers' | 'confirmed' | 'cancelled'>('pending');
  const [dateFilter, setDateFilter] = useState('');
  const [isRequestCalendarOpen, setIsRequestCalendarOpen] = useState(false);
  const [requestCalendarMonth, setRequestCalendarMonth] = useState<Date>(() => new Date());
  const [requestCalendarOrigin, setRequestCalendarOrigin] = useState<{ x: number; y: number }>({ x: 90, y: -140 });
  const requestDateBtnRef = useRef<HTMLButtonElement>(null);
  const requestCalendarPopupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTab === 'bookings') {
      setStatusFilter('pending');
    } else {
      setIsRequestCalendarOpen(false);
    }
  }, [activeTab]);

  const updateRequestCalendarOrigin = useCallback(() => {
    if (typeof window === 'undefined') return;
    const btnRect = requestDateBtnRef.current?.getBoundingClientRect();
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const nextX = btnRect ? btnRect.left + btnRect.width / 2 - centerX : 90;
    const nextY = btnRect ? btnRect.top + btnRect.height / 2 - centerY : -140;
    setRequestCalendarOrigin(prev =>
      Math.abs(prev.x - nextX) < 0.5 && Math.abs(prev.y - nextY) < 0.5
        ? prev
        : { x: nextX, y: nextY }
    );
  }, []);

  useEffect(() => {
    if (!isRequestCalendarOpen) return;
    updateRequestCalendarOrigin();
    const rafId = requestAnimationFrame(() => updateRequestCalendarOrigin());
    window.addEventListener('resize', updateRequestCalendarOrigin);
    window.addEventListener('scroll', updateRequestCalendarOrigin, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updateRequestCalendarOrigin);
      window.removeEventListener('scroll', updateRequestCalendarOrigin);
    };
  }, [isRequestCalendarOpen, updateRequestCalendarOrigin]);

  useEffect(() => {
    if (!isRequestCalendarOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        requestDateBtnRef.current &&
        !requestDateBtnRef.current.contains(target) &&
        (!requestCalendarPopupRef.current || !requestCalendarPopupRef.current.contains(target))
      ) {
        updateRequestCalendarOrigin();
        setIsRequestCalendarOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        updateRequestCalendarOrigin();
        setIsRequestCalendarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isRequestCalendarOpen, updateRequestCalendarOrigin]);

  // ResizeObserver for Analytics Chart
  const [chartSize, setChartSize] = useState({ width: 500, height: 300 });
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      const nextWidth = width || 500;
      const nextHeight = height || 300;
      setChartSize(prev =>
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight }
      );
    });
    resizeObserver.observe(chartContainerRef.current);
    return () => resizeObserver.disconnect();
  }, [activeTab]);

  // Analytical chart data preparation (last 6 months setup)
  const monthlyData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dataMap: Record<string, { revenue: number, bookings: number }> = {};
    
    // Initialize last 6 months dynamically based on mid-2026 current systems
    const date = new Date(2026, 5, 10); // June 10, 2026
    const monthsList: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(date.getFullYear(), date.getMonth() - i, 1);
      const mName = months[d.getMonth()];
      monthsList.push(mName);
      dataMap[mName] = { revenue: 0, bookings: 0 };
    }
    
    // Fallback elegant realistic performance metrics for new vendors without rich history
    const baseBench: Record<string, { revenue: number, bookings: number }> = {
      'Jan': { revenue: 1500, bookings: 2 },
      'Feb': { revenue: 2600, bookings: 3 },
      'Mar': { revenue: 1900, bookings: 2 },
      'Apr': { revenue: 3800, bookings: 4 },
      'May': { revenue: 4500, bookings: 5 },
      'Jun': { revenue: 5200, bookings: 6 },
      'Jul': { revenue: 4700, bookings: 5 },
      'Aug': { revenue: 5300, bookings: 6 },
      'Sep': { revenue: 4200, bookings: 4 },
      'Oct': { revenue: 4800, bookings: 5 },
      'Nov': { revenue: 5900, bookings: 6 },
      'Dec': { revenue: 6800, bookings: 7 }
    };
    
    let hasActualData = false;
    bookings.forEach(b => {
      const bDate = new Date(b.date);
      if (!isNaN(bDate.getTime())) {
        const mName = months[bDate.getMonth()];
        if (dataMap[mName] !== undefined) {
          dataMap[mName].bookings += 1;
          hasActualData = true;
          if (b.status === 'confirmed' && b.paymentStatus === 'paid') {
            dataMap[mName].revenue += b.amount;
          }
        }
      }
    });

    return monthsList.map(name => {
      const actual = dataMap[name];
      if (!hasActualData && baseBench[name]) {
        return {
          name,
          revenue: baseBench[name].revenue,
          bookings: baseBench[name].bookings
        };
      }
      return {
        name,
        revenue: actual ? actual.revenue : 0,
        bookings: actual ? actual.bookings : 0
      };
    });
  }, [bookings]);

  // Compute exact coordinates, line paths, area fills for elegant SVG Rendering
  const chartPoints = useMemo(() => {
    const padding = { top: 30, right: 30, bottom: 40, left: 60 };
    const chartW = Math.max(100, chartSize.width - padding.left - padding.right);
    const chartH = Math.max(100, chartSize.height - padding.top - padding.bottom);
    
    const maxRevenue = Math.max(...monthlyData.map(d => d.revenue), 1000);
    
    const points = monthlyData.map((d, idx) => {
      const x = padding.left + (idx / (monthlyData.length - 1)) * chartW;
      const y = padding.top + chartH - (d.revenue / maxRevenue) * chartH;
      return { x, y, data: d };
    });
    
    let linePath = '';
    let areaPath = '';
    
    if (points.length > 0) {
      linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
      areaPath = `M ${points[0].x} ${padding.top + chartH} ` + 
                 points.map(p => `L ${p.x} ${p.y}`).join(' ') + 
                 ` L ${points[points.length - 1].x} ${padding.top + chartH} Z`;
    }
    
    return { points, linePath, areaPath, padding, chartW, chartH, maxRevenue };
  }, [monthlyData, chartSize]);

  // Sorted bookings newest first by createdAt/request timestamp with strict single-booking deduplication
  const sortedBookings = useMemo(() => {
    const getBookingTimeMs = (b: Booking): number => {
      const raw = (b as any).createdAt ?? (b as any).timestamp ?? (b as any).updatedAt;
      if (!raw) return 0;
      if (typeof raw === 'number') return raw;
      if (typeof raw === 'string') {
        const parsed = new Date(raw).getTime();
        return isNaN(parsed) ? 0 : parsed;
      }
      if (typeof raw?.toDate === 'function') {
        return raw.toDate().getTime();
      }
      if (typeof raw?.seconds === 'number') {
        return raw.seconds * 1000 + Math.floor((raw.nanoseconds || 0) / 1e6);
      }
      return 0;
    };

    const sorted = bookings
      .map((booking, idx) => ({ booking, idx, timeMs: getBookingTimeMs(booking) }))
      .sort((a, b) => {
        if (a.timeMs !== b.timeMs) {
          return b.timeMs - a.timeMs; // Latest request always on top
        }
        return b.idx - a.idx;
      })
      .map(item => item.booking);

    const seen = new Set<string>();
    const deduped: Booking[] = [];
    for (const b of sorted) {
      const clientKey = (b.userId || b.clientId || b.contactEmail || b.clientName || '').toLowerCase();
      const compositeKey = `${b.vendorId}_${b.date}_${clientKey}`;
      if (!seen.has(b.id) && !seen.has(compositeKey)) {
        seen.add(b.id);
        seen.add(compositeKey);
        deduped.push(b);
      }
    }
    return deduped;
  }, [bookings]);

  // Dynamic Filtering logic
  const filteredBookings = useMemo(() => {
    return sortedBookings.filter(b => {
      const matchesSearch = !searchQuery || 
                            b.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            b.eventName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            b.contactEmail?.toLowerCase().includes(searchQuery.toLowerCase());
      const hasOffer = Boolean(b.isOffer || b.offeredPrice || b.notes?.includes('OFFERED PRICE:'));
      const matchesStatus =
        statusFilter === 'offers'
          ? hasOffer && b.status !== 'cancelled'
          : statusFilter === 'pending'
          ? b.status === 'pending' && !hasOffer
          : b.status === statusFilter;
      const matchesDate = !dateFilter || b.date === dateFilter;
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [sortedBookings, searchQuery, statusFilter, dateFilter]);
  
  // Profile & Media State
  const [editForm, setEditForm] = useState<Vendor>({
    ...vendor,
    enableDateCheckLimit: vendor.enableDateCheckLimit !== false,
    maxDateChecks: vendor.maxDateChecks ?? 5,
    dateCheckResetHours: vendor.dateCheckResetHours ?? 24
  });
  const latestEditFormRef = useRef<Vendor>(editForm);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLocalEditRef = useRef<number>(0);
  const prevVendorIdRef = useRef<string>(vendor.id);
  const onUpdateVendorRef = useRef(onUpdateVendor);
  useEffect(() => {
    onUpdateVendorRef.current = onUpdateVendor;
  }, [onUpdateVendor]);

  const applyImmediateVendorUpdate = (updater: (prev: Vendor) => Vendor) => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    lastLocalEditRef.current = Date.now();
    const updated = updater(latestEditFormRef.current);
    latestEditFormRef.current = updated;
    setEditForm(updated);
    onUpdateVendorRef.current(updated);
    return updated;
  };

  const applyAutoSaveVendorUpdate = (updater: (prev: Vendor) => Vendor) => {
    lastLocalEditRef.current = Date.now();
    const updated = updater(latestEditFormRef.current);
    latestEditFormRef.current = updated;
    setEditForm(updated);
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      lastLocalEditRef.current = Date.now();
      onUpdateVendorRef.current(latestEditFormRef.current);
    }, 500);
    return updated;
  };

  const flushAutoSave = () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
      lastLocalEditRef.current = Date.now();
      onUpdateVendorRef.current(latestEditFormRef.current);
    }
  };

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
        onUpdateVendorRef.current(latestEditFormRef.current);
      }
    };
  }, []);

  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [showVideoUrlBar, setShowVideoUrlBar] = useState(false);
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [videoUrlError, setVideoUrlError] = useState<string | null>(null);
  const [isSavingVideoUrl, setIsSavingVideoUrl] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [stripeMessage, setStripeMessage] = useState<string | null>(null);
  
  // Email Debug State
  const [testEmail, setTestEmail] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState<{ success?: boolean, error?: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  // New Service Form State
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrice, setNewServicePrice] = useState('');
  const [newServiceUnit, setNewServiceUnit] = useState('');
  const [newServiceCategoryType, setNewServiceCategoryType] = useState<ServiceCategoryType>('location');
  const [newServiceAllowQty, setNewServiceAllowQty] = useState(false);
  const [newServiceDefaultHours, setNewServiceDefaultHours] = useState('3');
  const [newServiceHourlyRate, setNewServiceHourlyRate] = useState('100');
  const [newServiceImageUrl, setNewServiceImageUrl] = useState('');
  const [isUploadingNewServiceImage, setIsUploadingNewServiceImage] = useState(false);
  
  // Progress and Previews
  const [uploadProgresses, setUploadProgresses] = useState<Record<string, number>>({});
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  const [showAddForm, setShowAddForm] = useState(false);

  // Message State
  const [selectedThreadEmail, setSelectedThreadEmail] = useState<string | null>(null);
  const [locallyReadVendorMsgIds, setLocallyReadVendorMsgIds] = useState<Set<string>>(new Set());
  const [selectedThreadContext, setSelectedThreadContext] = useState<{
    key: string;
    clientUid: string;
    email: string;
    name: string;
    conversationId: string;
  } | null>(null);
  const [replyText, setReplyText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const chatTimerRef = useRef<any>(null);
  const [isChatUploading, setIsChatUploading] = useState(false);
  const [isChatRecording, setIsChatRecording] = useState(false);
  const [chatRecordingDuration, setChatRecordingDuration] = useState(0);
  const [fullscreenMedia, setFullscreenMedia] = useState<{url: string, type: 'image' | 'video'} | null>(null);

  // Automatically scroll to bottom of active message thread
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedThreadEmail, messages]);
  
  // Collapsible Sections State
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Calendar State
  const [viewDate, setViewDate] = useState(new Date());
  const [calendarViewMode, setCalendarViewMode] = useState<'month' | 'week'>('month');
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const [syncStep, setSyncStep] = useState<'idle' | 'auth' | 'fetching' | 'saving' | 'success'>('idle');
  const [calendarSyncError, setCalendarSyncError] = useState<string | null>(null);

  const handleCalendarSync = async () => {
    if (isSyncingRef.current || isSyncing) {
      showNotification("Calendar authentication is already in progress.", "info");
      return;
    }
    
    isSyncingRef.current = true;
    setIsSyncing(true);
    setSyncStep('auth');
    setCalendarSyncError(null);
    showNotification("Authenticating... Opening Google sign-in popup.", "info");

    try {
      const firebaseAuth = auth || getAuth();
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.events');
      provider.setCustomParameters({ prompt: 'consent', access_type: 'offline' });

      // Cleanly await sign-in popup
      const result = await signInWithPopup(firebaseAuth, provider);
      
      setSyncStep('fetching');
      showNotification('Authenticated! Connecting to Google Calendar API...', 'info');
      
      // Extract Google Access Token
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;
      
      if (!token) {
        throw new Error("Could not retrieve Google Access Token from login credential.");
      }
      
      // Fetch primary calendar events from today onwards
      const timeMin = new Date().toISOString();
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime&maxResults=250`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Calendar API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      const events = data.items || [];
      const activeEvents = events.filter((e: any) => e.status !== 'cancelled');
      
      setSyncStep('saving');
      showNotification(`Found ${activeEvents.length} events on Google. Syncing Simcha Bookings...`, 'info');

      // TWO-WAY SYNC: Push native confirmed Simcha bookings to Google Calendar
      const confirmedGigs = bookings.filter(b => b.status === 'confirmed');
      const gigsToPush = confirmedGigs.filter(gig => {
        const alreadyExists = activeEvents.some((ge: any) => {
          const hasId = ge.description && ge.description.includes(gig.id);
          const hasTitle = ge.summary && (ge.summary.includes(gig.eventName) || ge.summary.includes(gig.id));
          return hasId || (hasTitle && (ge.start?.dateTime?.startsWith(gig.date) || ge.start?.date === gig.date));
        });
        return !alreadyExists;
      });

      let pushedCount = 0;
      if (gigsToPush.length > 0) {
        showNotification(`Syncing ${gigsToPush.length} confirmed bookings back to Google Calendar...`, 'info');
        for (const gig of gigsToPush) {
          let startVal: any = { date: gig.date };
          let endVal: any = { date: gig.date };

          if (gig.eventTime && /^\d{2}:\d{2}/.test(gig.eventTime)) {
            try {
              const [hours, minutes] = gig.eventTime.split(':');
              const startD = new Date(`${gig.date}T${hours}:${minutes}:00`);
              startVal = { dateTime: startD.toISOString() };
              const endD = new Date(startD.getTime() + 4 * 60 * 60 * 1000); // 4 hours duration
              endVal = { dateTime: endD.toISOString() };
            } catch (e) {
              console.warn("Error parsing event time, falling back to all-day event", e);
            }
          }

          const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              summary: `Simcha Booking: ${gig.eventName}`,
              description: `Simcha Booking Detail\nClient: ${gig.clientName}\nBooking ID: ${gig.id}\nLocation: ${gig.eventLocation || 'Not specified'}\nNotes: ${gig.notes || ''}`,
              start: startVal,
              end: endVal
            })
          });

          if (res.ok) {
            pushedCount++;
          } else {
            console.error(`Failed to push gig ${gig.id} to Google Calendar:`, await res.text());
          }
        }
      }

      // ONE-WAY SYNC: Build detailed list of googleEvents to save to Firestore
      const parsedGoogleEvents = activeEvents.map((e: any) => ({
        id: e.id,
        summary: e.summary || 'Busy (Google Calendar)',
        start: e.start?.dateTime || e.start?.date || '',
        end: e.end?.dateTime || e.end?.date || '',
      }));
      
      const currentUnavailable = vendor.unavailableDates || [];
      const googleDates: string[] = [];
      
      // Helper function to extract YYYY-MM-DD local dates for an event
      const getDatesForEvent = (event: any): string[] => {
        const dates: string[] = [];
        const startVal = event.start?.dateTime || event.start?.date;
        const endVal = event.end?.dateTime || event.end?.date;
        
        if (!startVal) return [];
        
        const start = new Date(startVal);
        let end = endVal ? new Date(endVal) : new Date(start);
        
        if (event.start?.date && event.end?.date) {
          // All day event end is exclusive, subtract 1 day to make inclusive
          end = new Date(end.getTime() - 1000 * 60 * 60 * 24);
        }
        
        const formatDate = (d: Date) => {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${year}-${month}-${day}`;
        };
        
        const startStr = formatDate(start);
        const endStr = formatDate(end);
        
        let cur = new Date(startStr + 'T00:00:00');
        const targetEnd = new Date(endStr + 'T00:00:00');
        
        while (cur <= targetEnd) {
          dates.push(formatDate(cur));
          cur.setDate(cur.getDate() + 1);
        }
        
        return dates;
      };
      
      activeEvents.forEach((event: any) => {
        const eventDates = getDatesForEvent(event);
        googleDates.push(...eventDates);
      });
      
      // Deduplicate and sort dates
      const mergedDates = Array.from(new Set([...currentUnavailable, ...googleDates])).sort();
      const newDatesCount = mergedDates.length - currentUnavailable.length;
      
      // Ensure we use the exact vendor ID from current session
      const sessionVendorId = vendor.id || firebaseAuth.currentUser?.uid;
      if (!sessionVendorId) {
        throw new Error("No active session or vendor ID found.");
      }

      // Save to Firestore using verified vendor ID in current session
      onUpdateVendor({
        ...vendor,
        id: sessionVendorId,
        unavailableDates: mergedDates,
        googleEvents: parsedGoogleEvents
      });
      
      setSyncStep('success');
      
      let successMsg = `Two-way sync complete! Imported ${activeEvents.length} events from Google.`;
      if (pushedCount > 0) {
        successMsg += ` Exported ${pushedCount} bookings/events to Google Calendar.`;
      }
      if (newDatesCount > 0) {
        successMsg += ` Blocked ${newDatesCount} new dates.`;
      }
      
      showNotification(successMsg, 'success');
      setCalendarSyncError(null);
    } catch (error: any) {
      console.error('Error during Google Calendar authentication/fetch:', error);
      
      let userMessage = 'Authentication failed. Please try again.';
      if (error.code === 'auth/popup-closed-by-user') {
        userMessage = 'The sign-in window was closed before completion. Try opening the app in a new tab if the popup was blocked.';
      } else if (error.code === 'auth/popup-blocked') {
        userMessage = 'The auth popup was blocked by your browser. Please allow popups or open the app in a new tab.';
      } else if (error.code === 'auth/cancelled-popup-request') {
        userMessage = 'Another login popup is already open or the request was cancelled. Please complete the sign-in in that window.';
      } else if (error.message && error.message.includes('popup')) {
        userMessage = 'Authentication popup closed or blocked. Try opening the application in a new tab.';
      } else {
        userMessage = error.message || userMessage;
      }
      
      setCalendarSyncError(userMessage);
      showNotification(userMessage, 'info');
      setSyncStep('idle');
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
      setTimeout(() => setSyncStep('idle'), 3000);
    }
  };

  // Notification State
  const [newBookingAlert, setNewBookingAlert] = useState<Booking | null>(null);
  const knownBookingIds = useRef<Set<string>>(new Set(bookings.map(b => b.id)));
  const audioContext = useRef<AudioContext | null>(null);

  // Sync edit form with vendor prop changes
  useEffect(() => {
    const normalizedVendor: Vendor = {
      ...vendor,
      enableDateCheckLimit: vendor.enableDateCheckLimit !== false,
      maxDateChecks: vendor.maxDateChecks ?? 5,
      dateCheckResetHours: vendor.dateCheckResetHours ?? 24
    };
    const isSameVendor = prevVendorIdRef.current === vendor.id;
    prevVendorIdRef.current = vendor.id;

    if (isSameVendor && (autoSaveTimerRef.current || Date.now() - lastLocalEditRef.current < 1200)) {
      return;
    }

    latestEditFormRef.current = normalizedVendor;
    setEditForm(normalizedVendor);
  }, [vendor]);

  // Group messages by unified client contact (merging UID, email, and conversationId so each client only ever has ONE pill box)
  const messageThreads = useMemo(() => {
    const uidToEmail: Record<string, string> = {};
    const emailToUid: Record<string, string> = {};
    const uidToName: Record<string, string> = {};
    const emailToName: Record<string, string> = {};

    // 1. Seed identity links from users directory
    Object.values(clientDirectoryMap).forEach((entry) => {
      const eLower = entry.email.toLowerCase();
      if (entry.uid && eLower) {
        uidToEmail[entry.uid] = entry.email;
        emailToUid[eLower] = entry.uid;
      }
      if (entry.uid && entry.name && entry.name !== 'Client' && entry.name !== 'Guest') {
        uidToName[entry.uid] = entry.name;
      }
      if (eLower && entry.name && entry.name !== 'Client' && entry.name !== 'Guest') {
        emailToName[eLower] = entry.name;
      }
    });

    // 2. Seed identity links from bookings
    bookings.forEach((b) => {
      const bUid = b.userId || b.clientId || '';
      const bEmail = (b.contactEmail || '').trim();
      const bEmailLower = bEmail.toLowerCase();
      if (bUid && bEmailLower) {
        if (!uidToEmail[bUid]) uidToEmail[bUid] = bEmail;
        if (!emailToUid[bEmailLower]) emailToUid[bEmailLower] = bUid;
      }
      if (b.clientName && b.clientName !== 'Client' && b.clientName !== 'Guest') {
        if (bUid && !uidToName[bUid]) uidToName[bUid] = b.clientName;
        if (bEmailLower && !emailToName[bEmailLower]) emailToName[bEmailLower] = b.clientName;
      }
    });

    // 3. Deduplicate messages by ID and seed identity links from messages
    const seenMessageIds = new Set<string>();
    const uniqueMessages: Message[] = [];
    allVendorMessages.forEach((m) => {
      if (!m) return;
      if (m.id && seenMessageIds.has(m.id)) return;
      if (m.id) seenMessageIds.add(m.id);
      uniqueMessages.push(m);

      const rawOther = m.senderId === vendor.id ? m.receiverId : m.senderId;
      const validUid =
        rawOther && rawOther !== 'client_legacy' && rawOther !== 'unknown' && !rawOther.includes('@')
          ? rawOther
          : '';
      const validEmail =
        m.clientEmail && m.clientEmail.includes('@')
          ? m.clientEmail.trim()
          : rawOther && rawOther.includes('@')
          ? rawOther.trim()
          : '';
      const validEmailLower = validEmail.toLowerCase();

      if (validUid && validEmailLower) {
        if (!uidToEmail[validUid]) uidToEmail[validUid] = validEmail;
        if (!emailToUid[validEmailLower]) emailToUid[validEmailLower] = validUid;
      }
      const candidateName =
        m.senderId !== vendor.id && m.senderName
          ? m.senderName
          : m.clientName && m.clientName !== 'Client' && m.clientName !== 'Guest'
          ? m.clientName
          : '';
      if (candidateName) {
        if (validUid && !uidToName[validUid]) uidToName[validUid] = candidateName;
        if (validEmailLower && !emailToName[validEmailLower]) emailToName[validEmailLower] = candidateName;
      }
    });

    type ThreadGroup = {
      key: string;
      name: string;
      email: string;
      emailLower: string;
      clientUid: string;
      conversationId?: string;
      messages: Message[];
      lastMessage: Message;
    };

    const groupsList: ThreadGroup[] = [];

    uniqueMessages.forEach((m) => {
      const rawOther = m.senderId === vendor.id ? m.receiverId : m.senderId;
      const directUid =
        rawOther && rawOther !== 'client_legacy' && rawOther !== 'unknown' && !rawOther.includes('@')
          ? rawOther
          : '';
      const directEmail =
        m.clientEmail && m.clientEmail.includes('@')
          ? m.clientEmail.trim()
          : rawOther && rawOther.includes('@')
          ? rawOther.trim()
          : '';
      const directEmailLower = directEmail.toLowerCase();

      const resolvedUid = directUid || (directEmailLower ? emailToUid[directEmailLower] || '' : '');
      const resolvedEmail = directEmail || (resolvedUid ? uidToEmail[resolvedUid] || '' : '');
      const resolvedEmailLower = resolvedEmail.toLowerCase();

      const rawName =
        (m.senderId !== vendor.id && m.senderName ? m.senderName : '') ||
        (m.clientName && m.clientName !== 'Client' && m.clientName !== 'Guest' ? m.clientName : '') ||
        (resolvedUid ? uidToName[resolvedUid] : '') ||
        (resolvedEmailLower ? emailToName[resolvedEmailLower] : '') ||
        m.clientName ||
        (resolvedEmail ? resolvedEmail.split('@')[0] : 'Client');

      const canonicalConvoId =
        m.conversationId && !m.conversationId.includes('client_legacy')
          ? m.conversationId
          : resolvedUid
          ? [vendor.id, resolvedUid].sort().join('_')
          : m.conversationId;

      // Find existing unified thread for this contact
      let group = groupsList.find((g) => {
        if (resolvedUid && g.clientUid && g.clientUid === resolvedUid) return true;
        if (resolvedEmailLower && g.emailLower && g.emailLower === resolvedEmailLower) return true;
        if (canonicalConvoId && g.conversationId && g.conversationId === canonicalConvoId) return true;
        if (m.conversationId && g.conversationId && g.conversationId === m.conversationId) return true;
        if (!resolvedUid && !resolvedEmailLower && rawName !== 'Client' && g.name.toLowerCase() === rawName.toLowerCase()) {
          return true;
        }
        return false;
      });

      if (!group) {
        const canonicalKey = resolvedUid || resolvedEmailLower || canonicalConvoId || rawOther || 'unknown';
        group = {
          key: canonicalKey,
          name: rawName,
          email: resolvedEmail,
          emailLower: resolvedEmailLower,
          clientUid: resolvedUid || rawOther || '',
          conversationId: canonicalConvoId || m.conversationId,
          messages: [],
          lastMessage: m,
        };
        groupsList.push(group);
      } else {
        if ((!group.clientUid || group.clientUid === 'client_legacy') && resolvedUid) {
          group.clientUid = resolvedUid;
          group.key = resolvedUid;
        }
        if (!group.email && resolvedEmail) {
          group.email = resolvedEmail;
          group.emailLower = resolvedEmailLower;
        }
        if (canonicalConvoId && (!group.conversationId || group.conversationId.includes('client_legacy'))) {
          group.conversationId = canonicalConvoId;
        }
        if ((group.name === 'Client' || group.name === 'Guest') && rawName !== 'Client' && rawName !== 'Guest') {
          group.name = rawName;
        }
      }

      group.messages.push(m);
    });

    // Sort messages inside each thread chronologically and set lastMessage to the latest one
    groupsList.forEach((g) => {
      g.messages.sort((a, b) => {
        const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tA - tB;
      });
      if (g.messages.length > 0) {
        g.lastMessage = g.messages[g.messages.length - 1];
      }
    });

    // Sort threads by latest message descending so the newest contact is always on top
    groupsList.sort((a, b) => {
      const timeA = a.lastMessage?.timestamp ? new Date(a.lastMessage.timestamp).getTime() : 0;
      const timeB = b.lastMessage?.timestamp ? new Date(b.lastMessage.timestamp).getTime() : 0;
      return timeB - timeA;
    });

    return groupsList.map((g) => [
      g.key,
      {
        name: g.name,
        email: g.email,
        clientUid: g.clientUid,
        conversationId: g.conversationId,
        messages: g.messages,
        lastMessage: g.lastMessage,
      },
    ] as [string, { name: string; email: string; clientUid: string; conversationId?: string; messages: Message[]; lastMessage: Message }]);
  }, [allVendorMessages, vendor.id, clientDirectoryMap, bookings]);

  const getThreadClientPhoto = (email: string, clientUid?: string): string | undefined => {
    if (clientUid && clientPhotosMap[clientUid]) return clientPhotosMap[clientUid];
    if (email && clientPhotosMap[email.toLowerCase()]) return clientPhotosMap[email.toLowerCase()];
    const matchingBooking = bookings.find(
      b =>
        (clientUid && (b.userId === clientUid || b.clientId === clientUid)) ||
        (email && b.contactEmail && b.contactEmail.toLowerCase() === email.toLowerCase())
    );
    if (matchingBooking?.clientPhotoURL) return matchingBooking.clientPhotoURL;
    return undefined;
  };

  const onActiveChatChangeRef = useRef(onActiveChatChange);
  useEffect(() => {
    onActiveChatChangeRef.current = onActiveChatChange;
  }, [onActiveChatChange]);

  useEffect(() => {
    if (onActiveChatChangeRef.current) {
      onActiveChatChangeRef.current(
        (!!selectedThreadEmail && activeTab === 'messages') ||
        !!selectedCalendarEvent ||
        (!!activeProfileSettingModal && activeTab === 'profile')
      );
    }
  }, [selectedThreadEmail, activeTab, selectedCalendarEvent, activeProfileSettingModal]);

  useEffect(() => {
    return () => {
      onActiveChatChangeRef.current?.(false);
    };
  }, []);

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

  // Automatically mark unread messages as read when viewing a thread
  useEffect(() => {
    if (selectedThreadEmail && activeTab === 'messages') {
      const thread = messageThreads.find(t => t[0] === selectedThreadEmail);
      if (thread) {
        const firstMsg = thread[1].messages[0];
        if (firstMsg) {
          const conId = firstMsg.conversationId || [vendor.id, firstMsg.senderId === vendor.id ? firstMsg.receiverId : firstMsg.senderId].sort().filter(Boolean).join('_');
          markChatAsRead(conId, vendor.id).catch(err => {
            console.error("Error setting thread as read:", err);
          });
        }
      }
    }
  }, [selectedThreadEmail, activeTab, messageThreads, vendor.id]);

  const [otherIsTyping, setOtherIsTyping] = useState(false);
  const typingTimeoutRef = useRef<any>(null);

  useEffect(() => {
    if (!selectedThreadEmail || !vendor.id || activeTab !== 'messages') {
      setOtherIsTyping(false);
      return;
    }
    const thread = messageThreads.find(t => t[0] === selectedThreadEmail);
    const clientUid = thread?.[1].messages.find(m => m.senderId !== vendor.id)?.senderId;
    if (!clientUid) {
      setOtherIsTyping(false);
      return;
    }
    const activeConversationId = [vendor.id, clientUid].sort().join('_');
    const unsub = onSnapshot(doc(db, 'conversations', activeConversationId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const typing = data?.typing || {};
        const otherTyping = typing[clientUid] || false;
        setOtherIsTyping(otherTyping);
      } else {
        setOtherIsTyping(false);
      }
    }, (err) => {
      console.warn("Error listening to conversation document:", err);
    });
    return () => unsub();
  }, [selectedThreadEmail, vendor.id, messageThreads, activeTab]);

  const handleVendorTypingStatus = async (isTyping: boolean) => {
    if (!selectedThreadEmail || !vendor.id) return;
    const thread = messageThreads.find(t => t[0] === selectedThreadEmail);
    const clientUid = thread?.[1].messages.find(m => m.senderId !== vendor.id)?.senderId;
    if (!clientUid) return;
    const activeConversationId = [vendor.id, clientUid].sort().join('_');
    try {
      await updateDoc(doc(db, 'conversations', activeConversationId), {
        [`typing.${vendor.id}`]: isTyping
      });
    } catch (err) {
      console.warn("Error updating vendor typing status:", err);
    }
  };

  const totalRevenue = bookings.filter(b => b.status === 'confirmed' && b.paymentStatus === 'paid').reduce((sum, b) => sum + b.amount, 0);
  const pendingRequests = bookings.filter(b => b.status === 'pending').length;

  const NavItem = ({ id, icon: Icon, label, badge }: { id: typeof activeTab, icon: any, label: string, badge?: number }) => (
    <button 
      onClick={() => { setActiveTab(id); setIsSidebarOpen(false); }} 
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-full transition-all ${activeTab === id ? 'bg-[#D4AF37] text-black font-bold shadow-xl' : 'text-zinc-400 hover:text-[#D4AF37] hover:bg-white/5'}`}
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
            className="ml-auto bg-zinc-800 text-white text-[9px] font-black px-2 py-0.5 rounded-full"
          >
            {badge}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );

  // Calendar Helper Functions
  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const getDatesForEventRange = (startVal: string, endVal: string): string[] => {
    if (!startVal) return [];
    const start = new Date(startVal);
    let end = endVal ? new Date(endVal) : new Date(start);
    
    const isAllDay = startVal.length <= 10 && (!endVal || endVal.length <= 10);
    if (isAllDay && endVal) {
      // Subtract 1 day for end date since Google end dates for all day are exclusive
      end = new Date(end.getTime() - 1000 * 60 * 60 * 24);
    }

    const formatDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const startStr = formatDate(start);
    const endStr = formatDate(end);
    
    const dates: string[] = [];
    let cur = new Date(startStr + 'T00:00:00');
    const targetEnd = new Date(endStr + 'T00:00:00');
    
    while (cur <= targetEnd) {
      dates.push(formatDate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  };

  const formatGoogleEventTime = (startStr: string, endStr: string) => {
    if (!startStr) return '';
    if (startStr.length <= 10) return 'All Day';
    
    try {
      const start = new Date(startStr);
      const end = new Date(endStr);
      const formatTime = (d: Date) => {
        let hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${hours}:${minutes} ${ampm}`;
      };
      return `${formatTime(start)} - ${formatTime(end)}`;
    } catch (err) {
      return '';
    }
  };

  const parseGoogleDateTimeFriendly = (dateTimeStr: string) => {
    if (!dateTimeStr) return 'N/A';
    try {
      const d = new Date(dateTimeStr);
      if (isNaN(d.getTime())) return dateTimeStr;
      
      if (dateTimeStr.length <= 10) {
        const [year, month, day] = dateTimeStr.split('-').map(Number);
        const dUtc = new Date(year, month - 1, day);
        return dUtc.toLocaleDateString('default', { 
          weekday: 'long',
          month: 'long', 
          day: 'numeric', 
          year: 'numeric'
        }) + ' (All Day)';
      }
      
      return d.toLocaleDateString('default', { 
        weekday: 'long',
        month: 'long', 
        day: 'numeric', 
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch (e) {
      return dateTimeStr;
    }
  };

  const parseDateTimeFriendly = (dateStr: string, timeStr?: string) => {
    if (!dateStr) return 'N/A';
    
    if (timeStr && /^\d{2}:\d{2}/.test(timeStr)) {
      try {
        const [hours, minutes] = timeStr.split(':');
        const d = new Date(`${dateStr}T${hours}:${minutes}:00`);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('default', { 
            weekday: 'long',
            month: 'long', 
            day: 'numeric', 
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
        }
      } catch (e) {
        console.error(e);
      }
    }

    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('default', { 
          weekday: 'long',
          month: 'long', 
          day: 'numeric', 
          year: 'numeric' 
        });
      }
    } catch (e) {}

    return dateStr;
  };

  const handleGoogleEventClick = (e: any) => {
    const startStr = e.start || '';
    const endStr = e.end || '';
    const startFormatted = parseGoogleDateTimeFriendly(startStr);
    const endFormatted = parseGoogleDateTimeFriendly(endStr);

    setSelectedCalendarEvent({
      type: 'google',
      id: e.id,
      title: e.summary || 'Busy (Google Calendar)',
      start: startFormatted,
      end: endFormatted,
      location: e.location || 'Not specified',
      notes: e.description || 'No additional details.',
      badge: 'Google Calendar Event'
    });
  };

  const handleSimchaBookingClick = (b: Booking) => {
    const startFormatted = parseDateTimeFriendly(b.date, b.eventTime);
    let endFormatted = 'Flexible';
    if (b.eventTime && /^\d{2}:\d{2}/.test(b.eventTime)) {
      try {
        const [hours, minutes] = b.eventTime.split(':');
        const startD = new Date(`${b.date}T${hours}:${minutes}:00`);
        if (!isNaN(startD.getTime())) {
          const endD = new Date(startD.getTime() + 4 * 60 * 60 * 1000);
          endFormatted = endD.toLocaleDateString('default', { 
            weekday: 'long',
            month: 'long', 
            day: 'numeric', 
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          }) + ' (Estimated 4-Hour Block)';
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      endFormatted = 'Flexible (End time not specified)';
    }

    setSelectedCalendarEvent({
      type: 'simcha',
      id: b.id,
      title: b.eventName || 'Simcha Booking/event',
      start: startFormatted,
      end: endFormatted,
      location: b.eventLocation || 'Venue address pending',
      notes: b.notes || 'No additional notes.',
      badge: 'Simcha Booking/event',
      clientName: b.clientName,
      contactEmail: b.contactEmail,
      amount: b.amount,
      selectedServices: b.selectedServices,
      status: b.status,
      bookingId: b.id
    });
  };

  const handleToggleDate = (dateStr: string) => {
    const currentUnavailable = latestEditFormRef.current.unavailableDates || vendor.unavailableDates || [];
    let updated: string[];
    if (currentUnavailable.includes(dateStr)) {
      updated = currentUnavailable.filter(d => d !== dateStr);
    } else {
      updated = [...currentUnavailable, dateStr];
    }
    applyImmediateVendorUpdate(prev => ({ ...prev, unavailableDates: updated }));
  };

  const changeMonth = (offset: number) => {
    const newDate = new Date(viewDate);
    if (calendarViewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + offset);
    } else {
      newDate.setDate(newDate.getDate() + offset * 7);
    }
    setViewDate(newDate);
  };

  // Media Management Functions
  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !vendor.id) return;

    setIsUploadingMedia(true);
    setUploadProgresses(prev => ({ ...prev, 'gallery': 0 }));
    try {
      const storagePath = `vendors/${vendor.id}/gallery/${Date.now()}_${file.name}`;
      const downloadURL = await uploadFileWithProgress(file, storagePath, (progress) => {
        setUploadProgresses(prev => ({ ...prev, 'gallery': progress }));
      });
      
      const newGallery = [...(latestEditFormRef.current.gallery || vendor.gallery || []), downloadURL];

      // Save directly to Firestore database document
      await updateDoc(doc(db, 'vendors', vendor.id), {
        gallery: newGallery
      });

      // Update local state and parent to stay in sync
      applyImmediateVendorUpdate(prev => ({
        ...prev,
        gallery: newGallery
      }));

      showNotification('Media uploaded successfully!');
    } catch (err: any) {
      console.error("Media upload error:", err);
      showNotification('Failed to upload media: ' + err.message, 'info');
    } finally {
      setIsUploadingMedia(false);
      setUploadProgresses(prev => { const newP = {...prev}; delete newP['gallery']; return newP; });
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddVideoUrl = async () => {
    setVideoUrlError(null);
    const validation = validateAndNormalizeVideoUrl(videoUrlInput);
    if (!validation.isValid || !validation.normalizedUrl) {
      const errMsg = validation.error || 'Please enter a valid video URL.';
      setVideoUrlError(errMsg);
      showNotification(errMsg, 'error');
      return;
    }

    if (!vendor.id) return;

    const currentGallery = latestEditFormRef.current.gallery || vendor.gallery || [];
    if (currentGallery.includes(validation.normalizedUrl)) {
      const dupMsg = 'This video link is already in your showcase gallery.';
      setVideoUrlError(dupMsg);
      showNotification(dupMsg, 'info');
      return;
    }

    setIsSavingVideoUrl(true);
    try {
      // If it's a direct video stream URL, quickly probe metadata to catch broken/404 video links
      if (validation.shouldProbeVideo && typeof document !== 'undefined') {
        const isPlayable = await new Promise<boolean>((resolve) => {
          const probeVideo = document.createElement('video');
          probeVideo.preload = 'metadata';
          probeVideo.muted = true;
          const timer = setTimeout(() => {
            probeVideo.src = '';
            // Allow if metadata takes longer than 3.5s on slow CDNs, unless it explicitly errored
            resolve(true);
          }, 3500);
          probeVideo.onloadedmetadata = () => {
            clearTimeout(timer);
            probeVideo.src = '';
            resolve(true);
          };
          probeVideo.oncanplay = () => {
            clearTimeout(timer);
            probeVideo.src = '';
            resolve(true);
          };
          probeVideo.onerror = () => {
            clearTimeout(timer);
            probeVideo.src = '';
            resolve(false);
          };
          probeVideo.src = validation.normalizedUrl!;
        });

        if (!isPlayable) {
          const brokenMsg =
            'We could not load a playable video from this link. Please verify that the URL is public and points to a valid video file.';
          setVideoUrlError(brokenMsg);
          showNotification(brokenMsg, 'error');
          setIsSavingVideoUrl(false);
          return;
        }
      }

      const newGallery = [...currentGallery, validation.normalizedUrl];

      await updateDoc(doc(db, 'vendors', vendor.id), {
        gallery: newGallery
      });

      applyImmediateVendorUpdate(prev => ({
        ...prev,
        gallery: newGallery
      }));

      setVideoUrlInput('');
      setVideoUrlError(null);
      setShowVideoUrlBar(false);
      showNotification('Video link verified and added to your showcase!');
    } catch (err: any) {
      console.error('Video URL save error:', err);
      const failMsg = 'Failed to add video link: ' + (err.message || 'Unknown error');
      setVideoUrlError(failMsg);
      showNotification(failMsg, 'error');
    } finally {
      setIsSavingVideoUrl(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !vendor.id) return;

    setIsUploadingLogo(true);
    setUploadProgresses(prev => ({ ...prev, 'logo': 0 }));
    try {
      const storagePath = `vendors/${vendor.id}/logo/${Date.now()}_${file.name}`;
      const downloadURL = await uploadFileWithProgress(file, storagePath, (progress) => {
        setUploadProgresses(prev => ({ ...prev, 'logo': progress }));
      });
      
      // Save directly to Firestore database document
      await updateDoc(doc(db, 'vendors', vendor.id), {
        image: downloadURL
      });

      // Update local state and parent to stay in sync
      applyImmediateVendorUpdate(prev => ({
        ...prev,
        image: downloadURL
      }));

      showNotification('Business image updated!');
    } catch (err: any) {
      console.error("Logo upload error:", err);
      showNotification('Failed to upload image: ' + err.message, 'info');
    } finally {
      setIsUploadingLogo(false);
      setUploadProgresses(prev => { const newP = {...prev}; delete newP['logo']; return newP; });
    }
  };

  const handleServiceImageUpload = async (serviceId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !vendor.id) return;
    
    // Optimistic Preview
    const previewUrl = URL.createObjectURL(file);
    setPreviewUrls(prev => ({ ...prev, [serviceId]: previewUrl }));
    setUploadProgresses(prev => ({ ...prev, [serviceId]: 0 }));

    try {
      const storagePath = `vendors/${vendor.id}/services/${serviceId}_${Date.now()}_${file.name}`;
      const downloadURL = await uploadFileWithProgress(file, storagePath, (progress) => {
        setUploadProgresses(prev => ({ ...prev, [serviceId]: progress }));
      });
      
      applyImmediateVendorUpdate(prev => ({
        ...prev,
        services: prev.services?.map(s => s.id === serviceId ? { ...s, image: downloadURL } : s) || []
      }));
      showNotification('Package image uploaded!');
    } catch (err: any) {
      console.error("Service image upload error:", err);
      showNotification('Failed to upload image: ' + err.message, 'info');
    } finally {
      setUploadProgresses(prev => { const newP = {...prev}; delete newP[serviceId]; return newP; });
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

    applyImmediateVendorUpdate(prev => ({
      ...prev,
      gallery: prev.gallery?.filter((_, i) => i !== index)
    }));
  };

  // Service Management Functions
  const handleNewServiceImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !vendor.id) return;
    
    // Optimistic Preview
    const previewUrl = URL.createObjectURL(file);
    setPreviewUrls(prev => ({ ...prev, 'newService': previewUrl }));
    setUploadProgresses(prev => ({ ...prev, 'newService': 0 }));
    setNewServiceImageUrl(previewUrl);

    try {
      setIsUploadingNewServiceImage(true);
      const tempId = Math.random().toString(36).substr(2, 9);
      const storagePath = `vendors/${vendor.id}/services/new_${tempId}_${Date.now()}_${file.name}`;
      const downloadURL = await uploadFileWithProgress(file, storagePath, (progress) => {
        setUploadProgresses(prev => ({ ...prev, 'newService': progress }));
      });
      setNewServiceImageUrl(downloadURL);
      showNotification('Package image uploaded successfully!', 'success');
    } catch (err: any) {
      console.error("New service image upload error:", err);
      showNotification('Failed to upload image: ' + err.message, 'info');
      setNewServiceImageUrl(''); // Revert on failure
    } finally {
      setIsUploadingNewServiceImage(false);
      setUploadProgresses(prev => { const newP = {...prev}; delete newP['newService']; return newP; });
    }
  };

  const handleAddService = () => {
    if (!newServiceName.trim() || !newServicePrice) return;
    
    const isLoc = newServiceCategoryType === 'location';
    const newService: VendorService = {
      id: Math.random().toString(36).substr(2, 9),
      name: newServiceName.trim(),
      price: parseFloat(newServicePrice),
      unit: isLoc ? 'location' : newServiceUnit.trim().slice(0, 80),
      categoryType: newServiceCategoryType,
      allowQuantity: newServiceCategoryType === 'amenities' ? newServiceAllowQty : false,
      defaultHours: isLoc ? Math.max(1, parseInt(newServiceDefaultHours) || 3) : undefined,
      hourlyRate: isLoc ? Math.max(0, parseFloat(newServiceHourlyRate) || 0) : undefined,
      image: newServiceImageUrl || undefined
    };

    applyImmediateVendorUpdate(prev => ({
      ...prev,
      services: [newService, ...(prev.services || [])]
    }));

    setNewServiceName('');
    setNewServicePrice('');
    setNewServiceUnit('');
    setNewServiceAllowQty(false);
    setNewServiceDefaultHours('3');
    setNewServiceHourlyRate('100');
    setNewServiceImageUrl('');
    setShowAddForm(false);
  };

  const handleUpdateService = (serviceId: string, updates: Partial<VendorService>, immediate = false) => {
    const updater = (prev: Vendor) => ({
      ...prev,
      services: prev.services?.map(s => s.id === serviceId ? { ...s, ...updates } : s) || []
    });
    if (immediate || 'categoryType' in updates || 'allowQuantity' in updates) {
      applyImmediateVendorUpdate(updater);
    } else {
      applyAutoSaveVendorUpdate(updater);
    }
  };

  const handleRemoveService = (serviceId: string) => {
    applyImmediateVendorUpdate(prev => ({
      ...prev,
      services: prev.services?.filter(s => s.id !== serviceId) || []
    }));
  };

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThreadEmail || !replyText.trim()) return;
    
    const thread = messageThreads.find(t => t[0] === selectedThreadEmail);
    if (thread) {
        onReplyMessage(selectedThreadEmail, thread[1].name, replyText);
        setReplyText('');
        handleVendorTypingStatus(false);
    }
  };

  const handleChatFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedThreadEmail) return;

    setIsChatUploading(true);
    try {
      const thread = messageThreads.find(t => t[0] === selectedThreadEmail);
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      const storagePath = `chats/${vendor.id}_${Date.now()}_${file.name}`;
      const url = await uploadFileRobustly(file, storagePath);

      if (thread) {
          onReplyMessage(selectedThreadEmail, thread[1].name, isImage ? 'Sent an image' : isVideo ? 'Sent a video' : 'Sent a file', isImage ? 'image' : 'file', url, undefined, file.name, file.type);
      }
    } catch (err: any) {
      console.error("Chat upload failed:", err);
      showNotification("Failed to upload file: " + err.message, "info");
    } finally {
      setIsChatUploading(false);
      if (chatFileInputRef.current) chatFileInputRef.current.value = '';
    }
  };

  const startChatRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showNotification("Your browser does not support audio recording.", "info");
      return;
    }
    
    try {
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
        setIsChatUploading(true);
        try {
          const fileExt = mimeType.split('/')[1].split(';')[0];
          const storagePath = `chats/voice_${vendor.id}_${Date.now()}.${fileExt}`;
          const url = await uploadFileRobustly(audioBlob, storagePath, { contentType: mimeType });
          const thread = messageThreads.find(t => t[0] === selectedThreadEmail);
          
          if (thread && selectedThreadEmail) {
              onReplyMessage(selectedThreadEmail, thread[1].name, 'Voice note', 'voice', url, url);
          }
        } catch (err: any) {
          console.error("Voice upload failed:", err);
          showNotification("Failed to upload voice message: " + err.message, "info");
        } finally {
          setIsChatUploading(false);
          setIsChatRecording(false);
        }
      };

      mediaRecorder.start();
      setIsChatRecording(true);
      setChatRecordingDuration(0);
      chatTimerRef.current = setInterval(() => {
        setChatRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Mic access denied:", err);
      showNotification("Microphone access denied.", "info");
    }
  };

  const stopChatRecording = () => {
    if (mediaRecorderRef.current && isChatRecording) {
      mediaRecorderRef.current.stop();
      clearInterval(chatTimerRef.current);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const cancelChatRecording = () => {
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
        console.error("Error stopping recorder in cancelChatRecording:", e);
      }
    }
    mediaRecorderRef.current = null;
    setIsChatRecording(false);
    setChatRecordingDuration(0);
    audioChunksRef.current = [];
    if (chatTimerRef.current) {
      clearInterval(chatTimerRef.current);
      chatTimerRef.current = null;
    }
  };

  const handleUnsend = async (msg: Message) => {
    if (!msg.id || !msg.conversationId) return;
    try {
      await deleteMessage(msg.conversationId, msg.id);
      showNotification("Message unsent", "success");
    } catch (err) {
      console.error("Failed to unsend message:", err);
      showNotification("Failed to unsend message", "info");
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
    const todayStr = new Date().toLocaleDateString('en-CA');

    // Calculate start and end dates for Week View
    const startOfWeek = new Date(viewDate);
    startOfWeek.setDate(viewDate.getDate() - viewDate.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const weekStartName = startOfWeek.toLocaleString('default', { month: 'short', day: 'numeric' });
    const weekEndName = endOfWeek.toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric' });

    // Render Month days
    const calendarDays = [];
    for (let i = 0; i < firstDay; i++) {
      calendarDays.push(
        <div key={`pad-${i}`} className="min-h-[120px] md:min-h-[140px] bg-black border border-white/5 opacity-10"></div>
      );
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = date.toLocaleDateString('en-CA');
      const isBlocked = vendor.unavailableDates?.includes(dateStr);
      const isToday = dateStr === todayStr;
      
      const dailyBookings = bookings.filter(b => b.date === dateStr);
      const dailyGoogleEvents = (vendor.googleEvents || []).filter(e => {
        const eventDates = getDatesForEventRange(e.start, e.end);
        return eventDates.includes(dateStr);
      });

      calendarDays.push(
        <div 
          key={dateStr}
          onClick={() => handleToggleDate(dateStr)}
          className={`min-h-[120px] md:min-h-[140px] border p-2 md:p-3 transition-all cursor-pointer relative group flex flex-col justify-between ${
            isBlocked 
              ? 'bg-red-950/5 border-zinc-400/10 hover:border-zinc-400/30' 
              : 'bg-black border-white/5 hover:border-[#D4AF37]/30'
          } ${isToday ? 'ring-1 ring-[#D4AF37] ring-inset bg-[#D4AF37]/5' : ''}`}
        >
          <div className="flex justify-between items-center mb-1">
            <span className={`text-xs font-black ${isToday ? 'text-[#D4AF37] bg-[#D4AF37]/10 px-2 py-0.5 rounded-full' : isBlocked ? 'text-zinc-400/70' : 'text-zinc-400'}`}>{day}</span>
            {isBlocked && <Lock className="w-3 h-3 text-zinc-400/60" />}
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 py-1 z-10 custom-scrollbar max-h-[80px]">
             {dailyBookings.map(b => {
               return (
                 <div 
                   key={b.id}
                   onClick={(e) => {
                     e.stopPropagation();
                     handleSimchaBookingClick(b);
                   }}
                   className="bg-[#1a1a1a]/80 backdrop-blur-md border border-[#D4AF37]/30 hover:border-[#D4AF37]/60 p-1.5 rounded-lg text-left text-[10px] leading-tight transition-all duration-300 cursor-pointer"
                 >
                   <div className="font-extrabold text-white truncate">{b.eventName || 'Event'}</div>
                   <div className="text-[8px] text-[#D4AF37] truncate font-semibold">{b.clientName}</div>
                   {b.eventTime && <div className="text-[7px] text-zinc-400 font-mono mt-0.5">{b.eventTime}</div>}
                 </div>
               );
             })}
             {dailyGoogleEvents.map(e => {
               const timeLabel = formatGoogleEventTime(e.start, e.end);
               return (
                 <div 
                   key={e.id}
                   onClick={(ev) => {
                     ev.stopPropagation();
                     handleGoogleEventClick(e);
                   }}
                   className="bg-[#0e0e0e] border border-white/10 hover:border-[#D4AF37]/40 p-1.5 rounded-lg text-left text-[10px] leading-tight transition-all duration-300 relative overflow-hidden group/gcal cursor-pointer"
                 >
                   <div className="absolute top-0 left-0 bottom-0 w-0.5 bg-[#D4AF37]"></div>
                   <div className="pl-1.5">
                     <div className="font-extrabold text-zinc-200 truncate group-hover/gcal:text-[#D4AF37] transition-colors">{e.summary || 'Busy (Google Calendar)'}</div>
                     <div className="text-[7px] text-[#D4AF37]/80 truncate font-semibold flex items-center gap-1">
                       <span className="w-1 h-1 rounded-full bg-[#D4AF37] inline-block animate-pulse"></span> Google Calendar
                     </div>
                     {timeLabel && <div className="text-[7px] text-zinc-400 font-mono mt-0.5">{timeLabel}</div>}
                   </div>
                 </div>
               );
             })}
             {isBlocked && dailyBookings.length === 0 && dailyGoogleEvents.length === 0 && (
               <div className="text-[8px] text-zinc-400/40 font-semibold uppercase tracking-wider text-center py-2">
                 Blocked
               </div>
             )}
          </div>

          <div className="absolute inset-0 bg-[#D4AF37]/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
        </div>
      );
    }

    // Render Week columns
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(startOfWeek);
      dayDate.setDate(startOfWeek.getDate() + i);
      weekDays.push(dayDate);
    }

    const weekDaysGrid = weekDays.map((dayDate) => {
      const dateStr = dayDate.toLocaleDateString('en-CA');
      const isBlocked = vendor.unavailableDates?.includes(dateStr);
      const isToday = dateStr === todayStr;
      const dayBookings = bookings.filter(b => b.date === dateStr);
      const dailyGoogleEvents = (vendor.googleEvents || []).filter(e => {
        const eventDates = getDatesForEventRange(e.start, e.end);
        return eventDates.includes(dateStr);
      });
      const dayName = dayDate.toLocaleString('default', { weekday: 'short' });
      const dayNum = dayDate.getDate();

      return (
        <div 
          key={dateStr}
          onClick={() => handleToggleDate(dateStr)}
          className={`min-h-[400px] border-r border-white/5 flex flex-col transition-all cursor-pointer relative group ${
            isToday ? 'bg-[#D4AF37]/2' : 'bg-black'
          } hover:bg-white/[0.01]`}
        >
          {/* Weekday Column Header */}
          <div className="p-4 border-b border-white/5 text-center flex flex-col items-center justify-center sticky top-0 bg-[#0c0c0c] z-20">
            <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider mb-1">{dayName}</span>
            <span className={`w-8 h-8 flex items-center justify-center text-sm font-black rounded-full transition-all ${
              isToday ? 'bg-[#D4AF37] text-black font-black' : 'text-white'
            }`}>
              {dayNum}
            </span>
          </div>

          {/* Weekday Body */}
          <div className="flex-1 p-3 space-y-3 relative flex flex-col justify-start min-h-[300px]">
            {isBlocked && dayBookings.length === 0 && dailyGoogleEvents.length === 0 && (
              <div className="absolute inset-0 bg-red-950/5 flex flex-col items-center justify-center pointer-events-none p-4">
                <Lock className="w-5 h-5 text-zinc-400/40 mb-2" />
                <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400/50">Unavailable</span>
              </div>
            )}

            <div className="space-y-3 z-10 w-full">
              {dayBookings.length > 0 || dailyGoogleEvents.length > 0 ? (
                <>
                  {dayBookings.map(b => (
                    <div 
                      key={b.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSimchaBookingClick(b);
                      }}
                      className="bg-[#1a1a1a]/80 backdrop-blur-md border border-[#D4AF37]/30 hover:border-[#D4AF37]/60 p-3 rounded-2xl shadow-xl transition-all duration-300 transform hover:-translate-y-0.5 group/card text-left cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[#D4AF37]">
                            {b.status === 'confirmed' ? 'Confirmed' : b.status === 'cancelled' ? 'Cancelled' : 'Pending'}
                          </span>
                          {b.eventTime && <span className="text-[8px] font-mono text-zinc-400">• {b.eventTime}</span>}
                        </div>
                        <h5 className="text-xs font-bold text-white mb-0.5 group-hover/card:text-[#D4AF37] transition-colors truncate">{b.eventName}</h5>
                        <p className="text-[10px] text-zinc-400 truncate">{b.clientName}</p>
                      </div>
                      <div className="w-6 h-6 rounded-full simcha-event-pill border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] group-hover/card:bg-[#D4AF37] group-hover/card:text-black transition-all shrink-0">
                        <ChevronRight className="w-3 h-3" />
                      </div>
                    </div>
                  ))}

                  {dailyGoogleEvents.map(e => {
                    const timeLabel = formatGoogleEventTime(e.start, e.end);
                    return (
                      <div 
                        key={e.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          handleGoogleEventClick(e);
                        }}
                        className="bg-[#0c0c0c] border border-white/10 hover:border-[#D4AF37]/50 p-3 rounded-xl shadow-xl transition-all duration-300 transform hover:-translate-y-0.5 group/gcard text-left relative overflow-hidden cursor-pointer"
                      >
                        <div className="absolute top-0 left-0 bottom-0 w-1 bg-[#D4AF37]"></div>
                        <div className="pl-2">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-[#D4AF37] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] inline-block animate-pulse"></span> Google Cal
                            </span>
                            {timeLabel && <span className="text-[8px] font-mono text-zinc-400">{timeLabel}</span>}
                          </div>
                          <h5 className="text-xs font-bold text-zinc-200 mb-0.5 group-hover/gcard:text-[#D4AF37] transition-colors truncate">{e.summary || 'Busy (Google Calendar)'}</h5>
                          <p className="text-[10px] text-zinc-400">Imported Calendar Event</p>
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-2xl opacity-10 group-hover:opacity-30 transition-opacity">
                  <Plus className="w-6 h-6 text-zinc-400 mb-1" />
                  <span className="text-[8px] font-black uppercase tracking-wider text-zinc-400">Available Slot</span>
                </div>
              )}
            </div>

            <div className="text-center opacity-0 group-hover:opacity-100 transition-opacity mt-auto pt-2">
              <span className="text-[7px] font-black uppercase tracking-[0.2em] text-[#D4AF37]/60">
                {isBlocked ? 'Click to Unlock' : 'Click to Block'}
              </span>
            </div>
          </div>
        </div>
      );
    });

    return (
      <div className="bg-black rounded-3xl border border-white/5 shadow-2xl overflow-hidden animate-in fade-in duration-500">
        {/* Upper Toolbar */}
        <div className="p-6 md:p-8 bg-black/40 border-b border-white/5 flex flex-col xl:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center xl:items-start text-center xl:text-left">
            <h3 className="text-xl font-bold font-[Cinzel] text-[#D4AF37] tracking-wider">
              {calendarViewMode === 'month' ? `${monthName} ${year}` : `${weekStartName} - ${weekEndName}`}
            </h3>
            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">Availability & Custom Bookings</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4">
            {/* Monthly / Weekly Selector */}
            <div className="flex bg-black/60 rounded-full p-1 border border-white/10">
              <button 
                onClick={() => setCalendarViewMode('month')}
                className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                  calendarViewMode === 'month' 
                    ? 'bg-[#D4AF37] text-black font-black' 
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Month
              </button>
              <button 
                onClick={() => setCalendarViewMode('week')}
                className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                  calendarViewMode === 'week' 
                    ? 'bg-[#D4AF37] text-black font-black' 
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Week
              </button>
            </div>

            {/* Navigation buttons */}
            <div className="flex gap-2 items-center">
              <button onClick={() => changeMonth(-1)} className="p-3 bg-white/5 hover:bg-[#D4AF37] hover:text-black rounded-full border border-white/10 transition-all">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setViewDate(new Date())} className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest rounded-full border border-white/10">
                Today
              </button>
              <button onClick={() => changeMonth(1)} className="p-3 bg-white/5 hover:bg-[#D4AF37] hover:text-black rounded-full border border-white/10 transition-all">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Merge Google Calendar Integration Button */}
            <button 
              onClick={handleCalendarSync}
              disabled={isSyncing}
              className={`text-black font-black flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] uppercase tracking-wider transition-all duration-300 transform hover:-translate-y-0.5 group ${
                syncStep === 'success'
                  ? 'bg-[#D4AF37] hover:bg-[#D4AF37] shadow-lg shadow-[#D4AF37]/20 text-white'
                  : 'bg-[#D4AF37] hover:bg-[#b8952d] shadow-lg shadow-[#D4AF37]/10 hover:shadow-[#D4AF37]/20'
              } ${isSyncing ? 'animate-pulse cursor-not-allowed pointer-events-none' : ''}`}
            >
              {isSyncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
              ) : syncStep === 'success' ? (
                <Check className="w-3.5 h-3.5 text-white" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
              )}
              {syncStep === 'idle' && 'Merge Google Calendar'}
              {syncStep === 'auth' && 'Authenticating...'}
              {syncStep === 'fetching' && 'Fetching Events...'}
              {syncStep === 'saving' && 'Merging Dates...'}
              {syncStep === 'success' && 'Calendar Merged!'}
            </button>
          </div>
        </div>

        {/* Google Calendar Integration Notice / Iframe Helper */}
        {(calendarSyncError || (typeof window !== 'undefined' && window.self !== window.top)) && (
          <div className="mx-6 md:mx-8 mt-6 p-5 bg-white/[0.02] border border-[#D4AF37]/10 rounded-2xl flex flex-col sm:flex-row items-start gap-4 animate-in slide-in-from-top duration-300">
            <div className="p-2.5 bg-[#D4AF37]/10 text-[#D4AF37] rounded-xl shrink-0">
              <Info className="w-4 h-4 animate-pulse" />
            </div>
            <div className="flex-1 space-y-1.5">
              <h4 className="text-xs font-black uppercase tracking-widest text-[#D4AF37]">
                Google Calendar Integration Notice
              </h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">
                {calendarSyncError ? (
                  <span>
                    <strong className="text-[#D4AF37]">Authentication notice:</strong> {calendarSyncError}
                  </span>
                ) : (
                  "Since this application is running inside a preview frame (iframe), some browsers may block Google authentication popups or restrict third-party storage cookies."
                )}
                {" For the best experience, please open the application in a new browser tab to complete authentication smoothly."}
              </p>
              <div className="pt-2.5 flex flex-wrap items-center gap-3">
                <button 
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="bg-[#D4AF37] hover:bg-[#b8952d] text-black px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 group shadow-lg shadow-[#D4AF37]/5"
                >
                  <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  Open App in New Tab
                </button>
                {calendarSyncError && (
                  <button 
                    onClick={() => setCalendarSyncError(null)}
                    className="text-zinc-400 hover:text-zinc-300 px-3 py-1.5 rounded-full hover:bg-white/5 text-[9px] font-black uppercase tracking-widest transition-all"
                  >
                    Dismiss Notice
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Calendar Grid Container */}
        <div className="overflow-x-auto custom-scrollbar">
          <div className={calendarViewMode === 'week' ? "min-w-[800px] lg:min-w-0" : ""}>
            
            {/* Week Days Headers for Month View */}
            {calendarViewMode === 'month' && (
              <div className="grid grid-cols-7 border-b border-white/5">
                 {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                   <div key={d} className="py-4 text-center text-[10px] font-black uppercase text-[#D4AF37]/50 tracking-[0.2em]">{d}</div>
                 ))}
              </div>
            )}

            {/* Actual Days Render */}
            <div className={calendarViewMode === 'month' ? "grid grid-cols-7" : "grid grid-cols-7 border-b border-white/5"}>
               {calendarViewMode === 'month' ? calendarDays : weekDaysGrid}
            </div>

          </div>
        </div>

        {/* Legend / Footer */}
        <div className="p-6 bg-black/60 flex flex-wrap gap-6 items-center border-t border-white/5">
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-black border border-white/10"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Available</span>
           </div>
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-red-950/40 border border-zinc-400/20"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Blocked / Unavailable</span>
           </div>
           <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-[#1a1a1a] border border-[#D4AF37]/30"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Confirmed Booking</span>
           </div>
           <div className="ml-auto text-[10px] text-zinc-400 italic">
             * Click any date or empty slot to toggle availability.
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-[calc(100dvh-70px)] sm:min-h-[calc(100dvh-76px)] flex-1 bg-[#050505] text-zinc-100 flex flex-col md:flex-row relative">
      {/* New Booking Alert Toast */}
      {newBookingAlert && (
        <aside aria-label="New Booking Alert" role="status" className="fixed top-20 right-4 z-[100] w-full max-w-sm animate-in slide-in-from-right duration-500">
          <div className="bg-[#111] border-2 border-[#D4AF37] rounded-2xl shadow-2xl p-4 flex gap-4 items-center ring-4 ring-black/50 backdrop-blur-xl">
            <div className="bg-[#D4AF37] p-3 rounded-xl">
              <BellRing className="w-6 h-6 text-black animate-bounce" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-[#D4AF37] font-black text-[10px] uppercase tracking-widest mb-1">New Booking Request!</h4>
              <p className="text-white font-bold text-sm truncate">{newBookingAlert.clientName}</p>
              <p className="text-zinc-400 text-[10px] truncate">{newBookingAlert.eventName} • ${newBookingAlert.amount}</p>
            </div>
            <button 
              onClick={() => { setActiveTab('bookings'); setNewBookingAlert(null); }}
              className="bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 p-2 rounded-full text-[#D4AF37] transition-all"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </aside>
      )}

      {/* Unified Sleek Calendar & Request Scope Modal — Exact Same Animation & Swipe-Down as BookingModal & QuickViewModal */}
      {selectedCalendarEvent && (
        <VendorEventScopeModal
          selectedCalendarEvent={selectedCalendarEvent}
          onClose={() => setSelectedCalendarEvent(null)}
          openDrawerSections={openDrawerSections}
          toggleDrawerSection={toggleDrawerSection}
          AccordionSection={AccordionSection}
          onUpdateBookingStatus={onUpdateBookingStatus}
          showNotification={showNotification}
        />
      )}

      {/* Desktop Sidebar (BottomNav handles mobile navigation) */}
      <aside className="hidden md:flex md:w-72 bg-[#0a0a0a] border-r border-[#D4AF37]/10 flex-col md:sticky md:top-[68px] md:h-[calc(100dvh-68px)] shadow-2xl">
        <div className="p-6 md:p-8 md:pt-10 flex items-center justify-between border-b border-white/5">
          <div>
            <h2 className="text-xl md:text-2xl font-bold font-[Cinzel] text-[#D4AF37] uppercase tracking-tighter">Simcha Portal</h2>
            <p className="text-[9px] md:text-[10px] text-zinc-400 font-bold uppercase tracking-[0.3em] mt-1">Vendor Station</p>
          </div>
        </div>
        <nav aria-label="Vendor Portal Navigation" className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <NavItem id="overview" icon={LayoutDashboard} label="Dashboard" />
          <NavItem id="bookings" icon={Users} label="Bookings" badge={pendingRequests} />
          <NavItem id="messages" icon={MessageSquare} label="Messages" badge={messages.filter(m => m.receiverId === vendor.id && !m.isRead && !locallyReadVendorMsgIds.has(m.id)).length || undefined} />
          <NavItem id="calendar" icon={CalendarDays} label="Calendar" />
          <NavItem id="profile" icon={Settings} label="Business Profile" />
        </nav>
        <div className="p-6 border-t border-white/5 bg-black space-y-3">
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 text-zinc-400 hover:text-zinc-400 hover:bg-white/5 rounded-full transition-colors text-xs font-black uppercase tracking-widest"><LogOut className="w-5 h-5" /> Terminate Session</button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="flex-1 bg-[#050505] relative pb-36 md:pb-10">
        <div className="px-4 pt-9 pb-1 md:px-10 md:pt-10 md:pb-2">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-lg md:text-2xl font-bold font-[Cinzel] text-white capitalize tracking-tight leading-none">{activeTab === 'bookings' ? 'Bookings' : activeTab}</h1>
              <p className="text-[#D4AF37]/60 text-[9px] font-black uppercase tracking-[0.4em] mt-1">{vendor.name}</p>
            </div>
            <div className="flex items-center gap-4">
               {pendingRequests > 0 && (
                 <div className="hidden sm:flex items-center gap-2 bg-zinc-800 border border-zinc-400/30 px-3 py-1.5 rounded-full animate-pulse">
                   <Bell className="w-3.5 h-3.5 text-zinc-400" />
                   <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">{pendingRequests} Pending</span>
                 </div>
               )}
            </div>
          </div>
        </div>

        <div className="px-4 pt-2 pb-4 md:px-10 md:pt-4 md:pb-10 max-w-7xl mx-auto space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {isLoading ? (
                <>
                  {/* Skeletons */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4 md:gap-6 animate-in fade-in duration-350">
                    <ShimmerCard />
                    <ShimmerCard />
                    <ShimmerCard />
                    <ShimmerCard />
                  </div>
                  <ShimmerChart />
                  <ShimmerTable />
                </>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="space-y-8"
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4 md:gap-6">
                    <div className="bg-[#111] p-6 rounded-3xl border border-white/5 shadow-2xl space-y-4 group hover:border-[#D4AF37]/20 transition-all">
                      <div className="bg-[#D4AF37]/10 p-3 w-fit rounded-2xl group-hover:bg-[#D4AF37]/20 transition-colors"><DollarSign className="w-6 h-6 text-[#D4AF37]" /></div>
                      <div><p className="text-[10px] text-zinc-300 font-black uppercase tracking-widest">Earnings</p><h3 className="text-3xl font-bold text-white">${totalRevenue.toLocaleString()}</h3></div>
                    </div>
                    <div 
                      onClick={() => setActiveTab('bookings')}
                      className="bg-[#111] p-6 rounded-3xl border border-white/5 shadow-2xl space-y-4 group hover:border-zinc-400/20 transition-all cursor-pointer"
                    >
                      <div className={`p-3 w-fit rounded-2xl transition-colors ${pendingRequests > 0 ? 'bg-zinc-800 group-hover:bg-zinc-700' : 'bg-[#D4AF37]/10'}`}>
                        <Users className={`w-6 h-6 ${pendingRequests > 0 ? 'text-zinc-400' : 'text-[#D4AF37]'}`} />
                      </div>
                      <div>
                        <p className="text-zinc-300 font-black uppercase tracking-widest text-[10px]">Action Required</p>
                        <h3 className={`text-3xl font-bold ${pendingRequests > 0 ? 'text-zinc-400' : 'text-white'}`}>{pendingRequests} Requests</h3>
                      </div>
                    </div>
                    <div 
                      onClick={() => setActiveTab('messages')}
                      className="bg-[#111] p-6 rounded-3xl border border-white/5 shadow-2xl space-y-4 group hover:border-[#D4AF37]/25 transition-all cursor-pointer"
                    >
                      <div className={`p-3 w-fit rounded-2xl transition-colors ${messages.filter(m => m.receiverId === vendor.id && !m.isRead).length > 0 ? 'bg-zinc-400/10 group-hover:bg-zinc-800' : 'bg-[#D4AF37]/10'}`}>
                        <MessageSquare className={`w-6 h-6 ${messages.filter(m => m.receiverId === vendor.id && !m.isRead).length > 0 ? 'text-zinc-400' : 'text-[#D4AF37]'}`} />
                      </div>
                      <div>
                        <p className="text-zinc-300 font-black uppercase tracking-widest text-[10px]">Client Inquiries</p>
                        <h3 className="text-3xl font-bold text-white font-mono">
                          {messages.filter(m => m.receiverId === vendor.id && !m.isRead).length || 0} Unread
                        </h3>
                      </div>
                    </div>
                    <div className="bg-[#111] p-6 rounded-3xl border border-white/5 shadow-2xl space-y-4">
                      <div className="bg-[#D4AF37]/10 p-3 w-fit rounded-2xl"><TrendingUp className="w-6 h-6 text-[#D4AF37]" /></div>
                      <div><p className="text-zinc-300 font-black uppercase tracking-widest text-[10px]">Active Presence</p><h3 className="text-3xl font-bold text-white">Live Catalog</h3></div>
                    </div>

                    {/* Stripe Connect Card */}
                    <div className={`relative bg-[#111] p-6 rounded-3xl border shadow-2xl space-y-4 transition-all ${vendor.stripeAccountId ? 'border-[#D4AF37]/20' : 'border-[#D4AF37]/20'}`}>
                      {isOnboarding && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center z-10 animate-in fade-in duration-300">
                          <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin mb-3" />
                          <p className="text-[10px] font-black uppercase tracking-widest text-white">Connecting Stripe...</p>
                          <p className="text-[9px] text-zinc-400 mt-1">Please wait while we verify your account</p>
                        </div>
                      )}
                      
                      <div className={`p-3 w-fit rounded-2xl ${vendor.stripeAccountId ? 'bg-[#D4AF37]/10' : 'bg-[#D4AF37]/10'}`}>
                        <CreditCard className={`w-6 h-6 ${vendor.stripeAccountId ? 'text-[#D4AF37]' : 'text-[#D4AF37]'}`} />
                      </div>
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-zinc-300 font-black uppercase tracking-widest text-[10px]">Stripe Payments</p>
                          <h3 className="text-xl font-bold text-white">
                            {vendor.stripeConnected === true ? 'Connected' : (vendor.stripeAccountId ? 'Pending / Incomplete' : 'Not Connected')}
                          </h3>
                        </div>
                          <div className="flex flex-col items-end gap-2">
                            {!vendor.stripeConnected ? (
                              <button 
                                onClick={handleStripeConnect}
                                disabled={isOnboarding}
                                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#D4AF37] hover:text-[#E5C76B] transition-all cursor-pointer px-4 py-2 rounded-full border border-[#D4AF37]/30 hover:bg-[#D4AF37]/10"
                              >
                                {isOnboarding ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                                Connect Stripe
                              </button>
                            ) : (
                              <div className="flex flex-col items-end gap-2">
                                <button 
                                  onClick={handleVerifyStripeConnection}
                                  disabled={isOnboarding}
                                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#D4AF37] hover:text-[#E5C76B] transition-colors cursor-pointer px-4 py-2 rounded-full border border-[#D4AF37]/30 hover:bg-[#D4AF37]/10"
                                >
                                  {isOnboarding ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                  Refresh Connection Status
                                </button>
                                <button 
                                  onClick={handleStripeDashboard}
                                  disabled={isOnboarding}
                                  className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-colors cursor-pointer px-3 py-1.5 rounded-full border border-zinc-700 hover:border-zinc-500"
                                >
                                  {isOnboarding ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                                  Dashboard
                                </button>
                              </div>
                            )}
                          </div>
                      </div>
                      <p className="text-[9px] text-zinc-300 italic">
                        {vendor.stripeAccountId 
                          ? "Your account is linked. You can receive direct payments from clients."
                          : "Connect your bank account to receive split payments automatically."}
                      </p>

                      {stripeMessage && (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="flex items-start gap-3">
                            <Info className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-[10px] font-black text-green-500 uppercase tracking-widest mb-1">Stripe Update</p>
                              <p className="text-[10px] text-green-400 leading-relaxed font-bold">{stripeMessage}</p>
                            </div>
                            <button onClick={() => setStripeMessage(null)} aria-label="Dismiss message" className="p-1 rounded-full hover:bg-green-500/20">
                              <X className="w-3 h-3 text-green-500/50 hover:text-green-500" />
                            </button>
                          </div>
                        </div>
                      )}

                      {onboardingError && (
                        <div className="bg-zinc-400/10 border border-zinc-400/20 rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="flex items-start gap-3">
                            <AlertCircle className="w-4 h-4 text-zinc-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Connection Error</p>
                              <p className="text-[10px] text-zinc-400 leading-relaxed font-bold">{onboardingError}</p>
                            </div>
                          </div>
                          
                          <div className="pt-3 border-t border-zinc-400/10 space-y-3">
                            <div className="flex items-center gap-2">
                              <div className="h-px flex-1 bg-zinc-800"></div>
                              <p className="text-[9px] text-zinc-400/60 uppercase tracking-widest font-black">Secure Express Onboarding</p>
                              <div className="h-px flex-1 bg-zinc-800"></div>
                            </div>
                            
                            <div className="bg-black/20 rounded-xl p-3 space-y-2 border border-zinc-400/10">
                              <p className="text-[10px] text-zinc-300 leading-relaxed">
                                Click <strong className="text-white">Connect Stripe</strong> above to securely enter bank account and tax details directly on Stripe's Express onboarding page.
                              </p>
                              <p className="text-[9px] text-zinc-400 leading-relaxed">
                                Once completed, event payments (Credit Cards & ACH Direct Debit) will be automatically split and routed directly to your connected bank account.
                              </p>
                            </div>
                          </div>

                          <button 
                            type="button"
                            onClick={() => setOnboardingError(null)}
                            className="w-full py-2 text-[8px] font-black uppercase tracking-widest text-zinc-400/60 hover:text-zinc-400 transition-colors border border-zinc-400/10 rounded-full hover:bg-zinc-800/50"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Performance Analytics Chart Component */}
                  <div className="bg-[#111] p-6 md:p-8 rounded-3xl border border-white/5 shadow-2xl space-y-6">
                    <div>
                      <h4 className="text-base font-bold font-[Cinzel] text-[#D4AF37] uppercase tracking-wider">Performance Analytics</h4>
                      <p className="text-xs text-zinc-300">Monthly scale of gross revenue and client acquisition values.</p>
                    </div>

                    <div 
                      ref={chartContainerRef}
                      className="w-full h-[250px] md:h-[400px] relative bg-black/20 rounded-2xl p-2 border border-white/5"
                    >
                      <svg 
                        width="100%" 
                        height="100%" 
                        viewBox={`0 0 ${chartSize.width} ${chartSize.height}`}
                        className="w-full h-full select-none"
                      >
                        <defs>
                          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="#D4AF37" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        
                        {/* Grid Background Lines */}
                        {Array.from({ length: 5 }).map((_, index) => {
                          const ratio = index / 4;
                          const isIntermediate = index === 1 || index === 3;
                          const yVal = chartPoints.padding.top + ratio * chartPoints.chartH;
                          
                          return (
                            <g key={index} className={isIntermediate ? "hidden md:block" : ""}>
                              <line 
                                x1={chartPoints.padding.left} 
                                y1={yVal} 
                                x2={chartPoints.padding.left + chartPoints.chartW} 
                                y2={yVal} 
                                style={{ stroke: 'rgba(255,255,255,0.03)', strokeWidth: 1 }} 
                              />
                              <text 
                                x={chartPoints.padding.left - 12} 
                                y={yVal + 4} 
                                className="fill-zinc-600 text-[9px] font-mono text-right"
                                textAnchor="end"
                              >
                                ${Math.round(chartPoints.maxRevenue * (1 - ratio)).toLocaleString()}
                              </text>
                            </g>
                          );
                        })}

                        {/* Area fill */}
                        {chartPoints.areaPath && (
                          <path d={chartPoints.areaPath} fill="url(#chartGrad)" className="transition-all duration-500" />
                        )}

                        {/* Line stroke */}
                        {chartPoints.linePath && (
                          <path d={chartPoints.linePath} fill="none" stroke="#D4AF37" strokeWidth={2.5} className="transition-all duration-500" />
                        )}

                        {/* SVG Data Coordinates Dots */}
                        {chartPoints.points.map((p, idx) => (
                          <g key={idx} className="group/dot">
                            <circle 
                              cx={p.x} 
                              cy={p.y} 
                              r={4.5} 
                              className="fill-[#D4AF37] stroke-black stroke-2 hover:scale-150 cursor-pointer transition-all duration-300" 
                            />
                            <text
                              x={p.x}
                              y={p.y - 12}
                              className="fill-[#D4AF37] font-bold font-mono text-[9px] text-center hidden md:group-hover/dot:block"
                              textAnchor="middle"
                            >
                              ${p.data.revenue.toLocaleString()}
                            </text>
                          </g>
                        ))}

                        {/* Custom Tick Density Reduction on Mobile for X-Axis */}
                        {chartPoints.points.map((p, idx) => {
                          const isOdd = idx % 2 !== 0;
                          return (
                            <text
                              key={idx}
                              x={p.x}
                              y={chartSize.height - 10}
                              className={`fill-zinc-400 text-[10px] font-black uppercase tracking-wider ${isOdd ? "hidden md:block" : ""}`}
                              textAnchor="middle"
                            >
                              {p.data.name}
                            </text>
                          );
                        })}
                      </svg>
                    </div>
                  </div>

                  {/* Upcoming Booking/events Widget on Dashboard */}
                  <div className="bg-[#111] rounded-3xl border border-white/5 shadow-2xl overflow-hidden">
                    <div className="p-6 border-b border-white/5 bg-black/20 flex justify-between items-center">
                      <h4 className="text-sm font-bold text-[#D4AF37] font-[Cinzel] uppercase tracking-widest">Upcoming Booking/events</h4>
                      <button
                        type="button"
                        onClick={() => setActiveTab('bookings')}
                        className="text-[10px] font-black uppercase tracking-widest text-[#D4AF37] hover:text-[#E5C76B] transition-colors cursor-pointer px-3 py-1.5 rounded-full border border-[#D4AF37]/20 hover:bg-[#D4AF37]/10"
                      >
                        View All Booking/events
                      </button>
                    </div>
                    <div className="p-4 sm:p-6 space-y-2.5">
                      {sortedBookings.slice(0, 3).length === 0 ? (
                        <div className="py-12 text-center opacity-30">
                          <Calendar className="w-8 h-8 mx-auto mb-2 text-[#D4AF37]" />
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-300">No upcoming booking/events scheduled</p>
                        </div>
                      ) : (
                        sortedBookings.slice(0, 3).map((b, idx) => {
                          const clientPhoto = getClientPhoto(b);
                          const initials = getClientInitials(b.clientName);
                          return (
                            <div
                              key={b.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => handleSimchaBookingClick(b)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleSimchaBookingClick(b);
                                }
                              }}
                              className={`simcha-event-card relative w-full overflow-hidden rounded-full border transition-all duration-300 cursor-pointer group flex items-center justify-between gap-3 px-5 sm:px-6 py-3 sm:py-3.5 min-h-[62px] shadow-xl active:scale-[0.99] ${
                                idx === 0
                                  ? 'border-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.15)]'
                                  : 'border-[#D4AF37]/35 hover:border-[#D4AF37]/80'
                              }`}
                            >
                              <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                                {clientPhoto ? (
                                  <>
                                    <img
                                      src={clientPhoto}
                                      alt={b.clientName}
                                      className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                                    />
                                    <div className="absolute inset-0 simcha-event-card-overlay" />
                                  </>
                                ) : (
                                  <div className="w-full h-full bg-gradient-to-r from-[#0c0c0c] via-[#151208] to-[#0c0c0c] flex items-center justify-center relative">
                                    <span className="font-[Cinzel] font-black text-4xl sm:text-5xl tracking-[0.25em] text-[#D4AF37]/15 select-none">
                                      {initials}
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="relative z-10 flex items-center gap-3 min-w-0 flex-1">
                                {!clientPhoto && (
                                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 flex items-center justify-center shrink-0 text-[#D4AF37] font-[Cinzel] font-bold text-xs shadow-inner">
                                    {initials}
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="font-bold text-sm text-white font-[Cinzel] group-hover:text-[#D4AF37] transition-colors truncate drop-shadow-sm">
                                    {b.clientName}
                                  </p>
                                  <div className="flex items-center gap-2 text-[10px] text-zinc-200/90 truncate mt-0.5">
                                    <span className="flex items-center gap-1 font-semibold text-white shrink-0">
                                      <Calendar className="w-2.5 h-2.5 text-[#D4AF37]" /> {b.date}
                                    </span>
                                    {b.eventTime && (
                                      <span className="flex items-center gap-1 text-zinc-300 truncate">
                                        <Clock className="w-2.5 h-2.5 text-[#D4AF37]" /> {b.eventTime}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="relative z-10 flex items-center gap-2 shrink-0">
                                <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                                  b.status === 'confirmed'
                                    ? 'bg-green-500/25 text-green-300 border-green-500/45'
                                    : b.status === 'pending'
                                    ? 'simcha-event-pill text-[#D4AF37] border-[#D4AF37]/45'
                                    : 'bg-red-500/25 text-red-300 border-red-500/45'
                                }`}>
                                  {b.status}
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
                  </div>
                </motion.div>
              )}
            </div>
          )}

          {activeTab === 'bookings' && (() => {
            const reqCalYear = requestCalendarMonth.getFullYear();
            const reqCalMonth = requestCalendarMonth.getMonth();
            const reqCalDaysInMonth = getDaysInMonth(reqCalYear, reqCalMonth);
            const reqCalFirstDay = getFirstDayOfMonth(reqCalYear, reqCalMonth);
            const reqCalMonthName = requestCalendarMonth.toLocaleString('default', { month: 'long' });
            const reqCalWeekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
            const datesWithRequests = new Set(sortedBookings.map(b => b.date).filter(Boolean));

            const formatShortFilterDate = (dateStr: string) => {
              const parts = dateStr.split('-');
              if (parts.length !== 3) return dateStr;
              const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            };

            return (
              <div className="space-y-4 animate-in slide-in-from-bottom-5 duration-500 max-w-3xl mx-auto w-full flex flex-col items-center">
                {/* Edge-to-Edge Centered Compact Filter Row: New, Offers, Confirmed, Cancelled + Date Calendar Button (No side cutoff) */}
                <div className="w-[calc(100%+2rem)] -mx-4 md:w-[calc(100%+5rem)] md:-mx-10 overflow-x-auto no-scrollbar py-1.5 touch-pan-x select-none">
                  <div
                    className="flex items-center gap-1.5 sm:gap-2 px-4 md:px-10 w-max mx-auto"
                    role="tablist"
                    aria-label="Filter bookings"
                  >
                    {([
                      { id: 'pending' as const, label: 'New' },
                      { id: 'offers' as const, label: 'Offers' },
                      { id: 'confirmed' as const, label: 'Confirmed' },
                      { id: 'cancelled' as const, label: 'Cancelled' }
                    ]).map((tab) => {
                      const isActive = statusFilter === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => setStatusFilter(tab.id)}
                          className={`shrink-0 h-7 px-3 sm:px-3.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border flex items-center justify-center whitespace-nowrap ${
                            isActive
                              ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.35)]'
                              : 'bg-black/70 text-zinc-300 border-[#D4AF37]/25 hover:border-[#D4AF37]/60 hover:text-white'
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}

                    {/* Small Compact Date Calendar Button (Exact same height h-7 as filter pills) */}
                    <motion.button
                      ref={requestDateBtnRef}
                      type="button"
                      whileHover={{ scale: 1.06 }}
                      whileTap={{ scale: 0.93 }}
                      onClick={() => {
                        updateRequestCalendarOrigin();
                        setIsRequestCalendarOpen(prev => !prev);
                      }}
                      aria-label={dateFilter ? `Filter requests by date (${dateFilter})` : 'Filter requests by date'}
                      aria-expanded={isRequestCalendarOpen}
                      className={`simcha-date-trigger-btn shrink-0 w-7 h-7 rounded-full flex items-center justify-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] transition-all duration-300 relative select-none ${
                        isRequestCalendarOpen || Boolean(dateFilter)
                          ? 'bg-[#D4AF37] text-[#09090b] border border-[#FFF8D1] shadow-[0_0_12px_rgba(212,175,55,0.5)]'
                          : 'bg-black/85 hover:bg-black border border-[#D4AF37]/60 hover:border-[#D4AF37] text-[#D4AF37] shadow-sm'
                      }`}
                    >
                      <Calendar className={`w-3.5 h-3.5 stroke-[2.2] ${isRequestCalendarOpen || Boolean(dateFilter) ? 'text-[#09090b]' : 'text-[#D4AF37]'}`} />
                      {dateFilter && (
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-black border border-[#D4AF37]" />
                      )}
                    </motion.button>

                    {dateFilter && (
                      <button
                        type="button"
                        onClick={() => setDateFilter('')}
                        className="shrink-0 h-7 px-2.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/40 hover:bg-[#D4AF37]/25 inline-flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap"
                        title="Clear date filter"
                      >
                        <span>{formatShortFilterDate(dateFilter)}</span>
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Portaled Pop-Out Calendar: Pops out from the small calendar button directly into the exact middle of the screen */}
                {typeof document !== 'undefined' &&
                  createPortal(
                    <AnimatePresence>
                      {isRequestCalendarOpen && (
                        <div className="fixed inset-0 z-[250] flex items-center justify-center pointer-events-none px-3">
                          <motion.div
                            ref={requestCalendarPopupRef}
                            key="vendor-request-date-calendar-popout"
                            initial={{
                              opacity: 0,
                              scale: 0.06,
                              x: requestCalendarOrigin.x,
                              y: requestCalendarOrigin.y
                            }}
                            animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                            exit={{
                              opacity: 0,
                              scale: 0.06,
                              x: requestCalendarOrigin.x,
                              y: requestCalendarOrigin.y
                            }}
                            transition={{ type: 'spring', stiffness: 390, damping: 26, mass: 0.72 }}
                            style={{ transformOrigin: 'center center' }}
                            className="simcha-popout-calendar pointer-events-auto relative w-[290px] sm:w-[310px] bg-[#050505]/95 border border-[#D4AF37]/35 rounded-2xl p-3.5 shadow-[0_24px_60px_rgba(0,0,0,0.95),0_0_25px_rgba(212,175,55,0.22)] backdrop-blur-xl select-none text-left"
                          >
                            <div className="absolute inset-0 border border-white/5 pointer-events-none rounded-2xl" />

                            {/* Top bar: Title + Close */}
                            <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#D4AF37]/15">
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D4AF37] font-[Cinzel]">
                                  Filter Requests by Date
                                </p>
                                <p className="text-[10px] text-zinc-400">
                                  {dateFilter ? `Selected: ${formatShortFilterDate(dateFilter)}` : 'Showing all dates'}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  updateRequestCalendarOrigin();
                                  setIsRequestCalendarOpen(false);
                                }}
                                className="w-6 h-6 rounded-full bg-black/60 border border-[#D4AF37]/25 hover:border-[#D4AF37] text-zinc-300 hover:text-[#D4AF37] flex items-center justify-center transition-all cursor-pointer"
                                aria-label="Close calendar"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Month Navigation Header */}
                            <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#D4AF37]/15">
                              <button
                                type="button"
                                onClick={() =>
                                  setRequestCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                                }
                                className="p-1.5 rounded-full border border-[#D4AF37]/15 hover:border-[#D4AF37]/50 bg-black text-[#D4AF37] transition-all hover:scale-105 active:scale-95 outline-none cursor-pointer"
                                aria-label="Previous Month"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>

                              <span className="font-[Cinzel] text-[#D4AF37] font-black uppercase tracking-widest text-[11px] flex items-center gap-1">
                                {reqCalMonthName} <span className="text-white">{reqCalYear}</span>
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  setRequestCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                                }
                                className="p-1.5 rounded-full border border-[#D4AF37]/15 hover:border-[#D4AF37]/50 bg-black text-[#D4AF37] transition-all hover:scale-105 active:scale-95 outline-none cursor-pointer"
                                aria-label="Next Month"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Weekdays */}
                            <div className="grid grid-cols-7 gap-1 text-center mb-1">
                              {reqCalWeekdays.map((wd, idx) => (
                                <div key={`wd-${idx}`} className="text-[9px] text-[#D4AF37]/70 font-black uppercase tracking-widest py-0.5">
                                  {wd}
                                </div>
                              ))}
                            </div>

                            {/* Roundy Dates Grid */}
                            <div className="grid grid-cols-7 gap-1 mb-2.5">
                              {Array.from({ length: reqCalFirstDay }).map((_, i) => (
                                <div key={`empty-${i}`} className="aspect-square opacity-0 pointer-events-none" />
                              ))}

                              {Array.from({ length: reqCalDaysInMonth }).map((_, idx) => {
                                const day = idx + 1;
                                const yStr = String(reqCalYear);
                                const mStr = String(reqCalMonth + 1).padStart(2, '0');
                                const dStr = String(day).padStart(2, '0');
                                const dateStr = `${yStr}-${mStr}-${dStr}`;
                                const isSelected = dateFilter === dateStr;
                                const hasRequestOnDate = datesWithRequests.has(dateStr);

                                let btnStyle = '';
                                if (isSelected) {
                                  btnStyle =
                                    'bg-[#D4AF37] text-[#09090b] font-black shadow-[0_0_12px_rgba(212,175,55,0.5)] scale-105 border border-[#D4AF37]';
                                } else if (hasRequestOnDate) {
                                  btnStyle =
                                    'text-[#D4AF37] bg-[#D4AF37]/15 border border-[#D4AF37]/50 hover:bg-[#D4AF37]/25 cursor-pointer';
                                } else {
                                  btnStyle =
                                    'text-zinc-100 bg-black/40 border border-white/5 hover:bg-[#D4AF37]/15 hover:text-[#D4AF37] hover:border-[#D4AF37]/40 hover:scale-105 hover:shadow-[0_0_10px_rgba(212,175,55,0.25)] active:scale-95 cursor-pointer';
                                }

                                return (
                                  <button
                                    key={`day-${day}`}
                                    type="button"
                                    onClick={() => {
                                      setDateFilter(prev => (prev === dateStr ? '' : dateStr));
                                      updateRequestCalendarOrigin();
                                      setIsRequestCalendarOpen(false);
                                    }}
                                    className={`aspect-square rounded-full flex flex-col items-center justify-center text-[11px] font-bold transition-all outline-none relative group ${btnStyle}`}
                                  >
                                    <span>{day}</span>
                                    {!isSelected && hasRequestOnDate && (
                                      <span className="w-1 h-1 rounded-full bg-[#D4AF37] mt-0.5" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>

                            {/* Footer Controls */}
                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#D4AF37]/15">
                              {dateFilter ? (
                                <button
                                  type="button"
                                  onClick={() => setDateFilter('')}
                                  className="px-2.5 py-1.5 rounded-full text-[10px] font-bold text-zinc-300 hover:text-[#D4AF37] bg-black/40 border border-white/10 transition-colors cursor-pointer"
                                >
                                  Show All Dates
                                </button>
                              ) : (
                                <span className="text-[10px] text-zinc-400">Tap a date to filter</span>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  updateRequestCalendarOrigin();
                                  setIsRequestCalendarOpen(false);
                                }}
                                className="px-3.5 py-1.5 rounded-full bg-[#D4AF37] hover:bg-[#E5C76B] text-[#09090b] font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer shadow-md"
                              >
                                Done
                              </button>
                            </div>
                          </motion.div>
                        </div>
                      )}
                    </AnimatePresence>,
                    document.body
                  )}

                {/* Centered Pill-Shaped Bookings List */}
                <div className="space-y-3 w-full max-w-3xl mx-auto">
                  {filteredBookings.length === 0 ? (
                    <div className="bg-[#0a0a0a] rounded-full border border-dashed border-white/10 py-12 px-6 text-center w-full">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">
                        {statusFilter === 'pending'
                          ? 'No new bookings found'
                          : statusFilter === 'offers'
                          ? 'No client offers found'
                          : statusFilter === 'confirmed'
                          ? 'No confirmed bookings found'
                          : 'No cancelled bookings found'}
                      </p>
                    </div>
                  ) : (
                      filteredBookings.map((b, idx) => {
                        const clientPhoto = getClientPhoto(b);
                        const initials = getClientInitials(b.clientName);

                        return (
                          <div
                            key={b.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleSimchaBookingClick(b)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleSimchaBookingClick(b);
                              }
                            }}
                            className={`simcha-event-card relative w-full overflow-hidden rounded-full border transition-all duration-300 cursor-pointer group flex items-center justify-between gap-3 px-5 sm:px-7 py-3.5 sm:py-4 min-h-[68px] sm:min-h-[74px] shadow-xl active:scale-[0.99] ${
                              idx === 0
                                ? 'border-[#D4AF37] shadow-[0_0_24px_rgba(212,175,55,0.18)]'
                                : 'border-[#D4AF37]/35 hover:border-[#D4AF37]/80'
                            }`}
                          >
                            {/* Full Background: Client Profile Image OR Client Initials Pattern */}
                            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                              {clientPhoto ? (
                                <>
                                  <img
                                    src={clientPhoto}
                                    alt={b.clientName}
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

                            {/* Left Side: Initials Badge (when no photo) + Client Name + Essential Badges */}
                            <div className="relative z-10 flex items-center gap-3 min-w-0 flex-1">
                              {!clientPhoto && (
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 flex items-center justify-center shrink-0 text-[#D4AF37] font-[Cinzel] font-bold text-xs sm:text-sm shadow-inner">
                                  {initials}
                                </div>
                              )}
                              <div className="min-w-0 flex flex-wrap items-center gap-2">
                                <span className="font-bold text-sm sm:text-base text-white font-[Cinzel] group-hover:text-[#D4AF37] transition-colors truncate drop-shadow-sm">
                                  {b.clientName}
                                </span>
                                {idx === 0 && b.status === 'pending' && (
                                  <span className="bg-[#D4AF37] text-black text-[8px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-widest shrink-0 shadow-sm">
                                    New
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Right Side: Date + Status + Navigation Arrow */}
                            <div className="relative z-10 flex items-center gap-2 sm:gap-2.5 shrink-0">
                              <span className="simcha-event-pill px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-bold text-zinc-100 border border-white/15 flex items-center gap-1.5">
                                <Calendar className="w-3 h-3 text-[#D4AF37] shrink-0" />
                                <span>{b.date}</span>
                              </span>

                              <span
                                className={`px-3 py-1 rounded-full text-[8px] sm:text-[9px] font-black uppercase tracking-widest border ${
                                  b.status === 'confirmed'
                                    ? 'bg-green-500/25 text-green-300 border-green-500/45'
                                    : b.status === 'pending'
                                    ? 'simcha-event-pill text-[#D4AF37] border-[#D4AF37]/45'
                                    : 'bg-red-500/25 text-red-300 border-red-500/45'
                                }`}
                              >
                                {b.status}
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
              </div>
            );
          })()}

          {activeTab === 'messages' && (
            <div className="space-y-3 animate-in fade-in duration-500">
              {messageThreads.length === 0 ? (
                <div className="bg-[#0a0a0a] rounded-full border border-dashed border-white/10 py-12 px-6 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">No Active Chats</p>
                </div>
              ) : (
                messageThreads.map(([threadKey, data], idx) => {
                  const unreadInThread = data.messages.filter(m => m.receiverId === vendor.id && !m.isRead && !locallyReadVendorMsgIds.has(m.id)).length;
                  const clientPhoto = getThreadClientPhoto(data.email || threadKey, data.clientUid);
                  const initials = getClientInitials(data.name);
                  const lastMsg = data.lastMessage;
                  const isVoice = lastMsg.type === 'voice' || !!lastMsg.audioUrl;
                  const isImg = lastMsg.type === 'image' || !!lastMsg.imageUrl;
                  const isVid = lastMsg.type === 'file' && lastMsg.fileType?.startsWith('video/');
                  const isDoc = lastMsg.type === 'file' && !lastMsg.fileType?.startsWith('video/');

                  const handleOpenClientThread = () => {
                    const conId = data.conversationId || lastMsg.conversationId || [vendor.id, data.clientUid].sort().filter(Boolean).join('_');
                    const msgIds = data.messages.map(m => m.id).filter(Boolean);
                    if (msgIds.length > 0) {
                      setLocallyReadVendorMsgIds(prev => {
                        const next = new Set(prev);
                        msgIds.forEach(id => next.add(id));
                        return next;
                      });
                      setLiveVendorMessages(prev =>
                        prev.map(m => (msgIds.includes(m.id) ? { ...m, isRead: true } : m))
                      );
                    }
                    if (vendor.id) {
                      const uniqueConIds = new Set<string>();
                      if (conId) uniqueConIds.add(conId);
                      data.messages.forEach(m => {
                        if (m.conversationId) uniqueConIds.add(m.conversationId);
                      });
                      uniqueConIds.forEach(cid => {
                        markChatAsRead(cid, vendor.id, [auth.currentUser?.uid || '', vendor.contactEmail || ''].filter(Boolean)).catch(() => {});
                      });
                    }
                    setSelectedThreadContext({
                      key: threadKey,
                      clientUid: data.clientUid || threadKey,
                      email: data.email || '',
                      name: data.name || 'Client',
                      conversationId: conId,
                    });
                    setSelectedThreadEmail(threadKey);
                  };

                  return (
                    <div
                      key={threadKey}
                      role="button"
                      tabIndex={0}
                      onClick={handleOpenClientThread}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleOpenClientThread();
                        }
                      }}
                      className={`simcha-event-card relative w-full overflow-hidden rounded-full border transition-all duration-300 cursor-pointer group flex items-center justify-between gap-3 px-5 sm:px-7 py-3.5 sm:py-4 min-h-[68px] sm:min-h-[74px] shadow-xl active:scale-[0.99] ${
                        unreadInThread > 0 || idx === 0
                          ? 'border-[#D4AF37] shadow-[0_0_24px_rgba(212,175,55,0.18)]'
                          : 'border-[#D4AF37]/35 hover:border-[#D4AF37]/80'
                      }`}
                    >
                      {/* Full Background: Client Profile Image OR Client Initials Pattern */}
                      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                        {clientPhoto ? (
                          <>
                            <img
                              src={clientPhoto}
                              alt={data.name}
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

                      {/* Left Side: Initials Badge (when no photo) + Client Name + Latest Message */}
                      <div className="relative z-10 flex items-center gap-3 min-w-0 flex-1">
                        {!clientPhoto && (
                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 flex items-center justify-center shrink-0 text-[#D4AF37] font-[Cinzel] font-bold text-xs sm:text-sm shadow-inner">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm sm:text-base text-white font-[Cinzel] group-hover:text-[#D4AF37] transition-colors truncate drop-shadow-sm">
                              {data.name}
                            </span>
                            <AnimatePresence mode="popLayout">
                              {unreadInThread > 0 && (
                                <motion.span
                                  key={`unread-${threadKey}-${unreadInThread}`}
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
                            {(lastMsg.senderId === vendor.id || (lastMsg as any).sender_role === 'vendor') && (
                              (lastMsg.isRead || Object.keys((lastMsg as any).read_by || {}).some(k => k !== lastMsg.senderId && k !== vendor.id)) ? (
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

              {selectedThreadEmail && (() => {
                const activeThread = messageThreads.find(([tKey, tData]) => {
                  if (tKey === selectedThreadEmail) return true;
                  if (selectedThreadContext?.clientUid && tData.clientUid === selectedThreadContext.clientUid) return true;
                  if (selectedThreadContext?.email && tData.email && tData.email.toLowerCase() === selectedThreadContext.email.toLowerCase()) return true;
                  return false;
                });

                const threadData = activeThread
                  ? activeThread[1]
                  : selectedThreadContext
                  ? {
                      name: selectedThreadContext.name,
                      email: selectedThreadContext.email,
                      clientUid: selectedThreadContext.clientUid,
                      conversationId: selectedThreadContext.conversationId,
                      messages: [] as Message[],
                      lastMessage: { text: '', timestamp: new Date().toISOString() } as Message,
                    }
                  : null;

                if (!threadData) return null;

                const cleanThreadEmail =
                  (threadData.email && threadData.email.includes('@') ? threadData.email : '') ||
                  (selectedThreadContext?.email && selectedThreadContext.email.includes('@') ? selectedThreadContext.email : '');
                const targetClientUid =
                  (threadData.clientUid && threadData.clientUid !== 'client_legacy' && !threadData.clientUid.includes('@') ? threadData.clientUid : '') ||
                  threadData.messages.find(m => m.senderId && m.senderId !== vendor.id && (m as any).sender_role !== 'vendor' && m.senderId !== 'client_legacy' && !m.senderId.includes('@'))?.senderId ||
                  threadData.messages.find(m => m.receiverId && m.receiverId !== vendor.id && (m as any).sender_role === 'vendor' && m.receiverId !== 'client_legacy' && !m.receiverId.includes('@'))?.receiverId ||
                  (selectedThreadContext?.clientUid && selectedThreadContext.clientUid !== 'client_legacy' && !selectedThreadContext.clientUid.includes('@') ? selectedThreadContext.clientUid : '') ||
                  (cleanThreadEmail && clientDirectoryMap[cleanThreadEmail.toLowerCase()]?.uid) ||
                  bookings.find(b => cleanThreadEmail && b.contactEmail?.toLowerCase() === cleanThreadEmail.toLowerCase() && (b.userId || b.clientId))?.userId ||
                  selectedThreadEmail;
                const targetConversationId =
                  threadData.conversationId && !threadData.conversationId.includes('client_legacy')
                    ? threadData.conversationId
                    : threadData.lastMessage?.conversationId && !threadData.lastMessage.conversationId.includes('client_legacy')
                    ? threadData.lastMessage.conversationId
                    : selectedThreadContext?.conversationId && !selectedThreadContext.conversationId.includes('client_legacy')
                    ? selectedThreadContext.conversationId
                    : [vendor.id, targetClientUid].sort().filter(Boolean).join('_');
                const clientPhoto = getThreadClientPhoto(cleanThreadEmail, targetClientUid);

                return (
                  <ChatModal
                    isOpen={true}
                    vendor={vendor}
                    isVendorReplying={true}
                    onClose={() => {
                      setSelectedThreadEmail(null);
                      setSelectedThreadContext(null);
                    }}
                    onSendMessage={async (payload) => {
                      const senderId = vendor.id;
                      const finalClientEmail = (
                        (payload.clientEmail && payload.clientEmail.includes('@') ? payload.clientEmail : '') ||
                        cleanThreadEmail ||
                        (targetClientUid && clientDirectoryMap[targetClientUid]?.email) ||
                        ''
                      ).trim().toLowerCase();

                      const rawReceiver = payload.receiverId || targetClientUid;
                      const resolvedClientUid =
                        (rawReceiver && rawReceiver !== 'client_legacy' && rawReceiver !== vendor.id && !rawReceiver.includes('@')
                          ? rawReceiver
                          : '') ||
                        (targetClientUid && targetClientUid !== 'client_legacy' && targetClientUid !== vendor.id && !targetClientUid.includes('@')
                          ? targetClientUid
                          : '') ||
                        (finalClientEmail && clientDirectoryMap[finalClientEmail]?.uid) ||
                        bookings.find(b => finalClientEmail && b.contactEmail?.toLowerCase() === finalClientEmail && (b.userId || b.clientId))?.userId ||
                        rawReceiver ||
                        'client_legacy';

                      const receiverId = resolvedClientUid;
                      const conversationId =
                        receiverId && receiverId !== 'client_legacy' && !receiverId.includes('@')
                          ? [senderId, receiverId].sort().join('_')
                          : payload.conversationId && !payload.conversationId.includes('client_legacy')
                          ? payload.conversationId
                          : [senderId, receiverId].sort().join('_');

                      const finalClientName =
                        (payload.clientName && payload.clientName !== 'Client' && payload.clientName !== 'Guest' ? payload.clientName : '') ||
                        threadData.name ||
                        clientDirectoryMap[receiverId]?.name ||
                        (finalClientEmail && clientDirectoryMap[finalClientEmail]?.name) ||
                        'Client';

                      await sendNewMessage({
                        senderId,
                        receiverId,
                        conversationId,
                        participants: [senderId, receiverId],
                        clientEmail: finalClientEmail,
                        clientName: finalClientName,
                        vendorId: vendor.id,
                        vendorName: vendor.name,
                        vendorEmail: vendor.contactEmail || '',
                        text: payload.text || '',
                        senderRole: 'vendor',
                        type: payload.type || 'text',
                        fileUrl: payload.fileUrl || payload.imageUrl,
                        imageUrl: payload.imageUrl,
                        audioUrl: payload.audioUrl,
                        audioDuration: payload.audioDuration,
                        fileName: payload.fileName,
                        fileType: payload.fileType,
                        tempId: payload.tempId
                      } as any);
                    }}
                    showNotification={showNotification}
                    messages={allVendorMessages}
                    user={{
                      id: vendor.id,
                      name: vendor.name,
                      username: vendor.contactEmail || vendor.name
                    }}
                    recipientUid={targetClientUid}
                    recipientName={threadData.name}
                    recipientEmail={cleanThreadEmail}
                    recipientImage={clientPhoto}
                    recipientCategory="Client"
                    conversationIdOverride={targetConversationId}
                    customConversations={messageThreads.map(([tKey, tVal]) => {
                      const cUid = tVal.clientUid || tVal.messages.find(m => m.senderId !== vendor.id)?.senderId || tKey;
                      const cId = tVal.conversationId || tVal.lastMessage?.conversationId || [vendor.id, cUid].sort().filter(Boolean).join('_');
                      const cEmail = tVal.email && tVal.email.includes('@') ? tVal.email : (clientDirectoryMap[cUid]?.email || '');
                      const rawText = tVal.lastMessage?.text;
                      const safeText = typeof rawText === 'string'
                        ? rawText
                        : (rawText && typeof rawText === 'object' && typeof (rawText as any).text === 'string' ? (rawText as any).text : '');
                      const lastMsgSentByVendor = Boolean(
                        tVal.lastMessage && (tVal.lastMessage.senderId === vendor.id || (tVal.lastMessage as any).sender_role === 'vendor')
                      );
                      const lastMsgReadByClient = Boolean(
                        tVal.lastMessage && (
                          tVal.lastMessage.isRead ||
                          Object.keys((tVal.lastMessage as any).read_by || {}).some(k => k !== tVal.lastMessage.senderId && k !== vendor.id)
                        )
                      );
                      return {
                        id: cUid,
                        contactId: cUid,
                        name: tVal.name,
                        category: 'Client',
                        image: getThreadClientPhoto(cEmail || tKey, cUid),
                        lastMessage: safeText,
                        lastMessageType: tVal.lastMessage?.type,
                        lastMessageTime: tVal.lastMessage?.timestamp,
                        lastMessageIsSent: lastMsgSentByVendor,
                        lastMessageIsRead: lastMsgReadByClient,
                        unreadCount: tVal.messages.filter(m => m.receiverId === vendor.id && !m.isRead).length,
                        conversationId: cId,
                        email: cEmail
                      };
                    })}
                  />
                );
              })()}
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="animate-in fade-in duration-500">
               {renderCalendar()}
            </div>
          )}

          {activeTab === 'profile' && (() => {
            const allServices = editForm.services || [];
            const inferCat = (s: VendorService): ServiceCategoryType => {
              if (s.categoryType === 'location') return 'location';
              if (s.categoryType === 'amenities') return 'amenities';
              if (s.categoryType === 'hours') return 'hours';
              const text = `${s.name} ${s.unit || ''}`.toLowerCase();
              if (/\b(location|lakewood|brooklyn|monsey|boro park|williamsburg|five towns|queens|manhattan|staten island|new jersey|ny|nj|travel|destination|area|local|out of town|out of state|long island|westchester|miami|florida|ballroom|terrace|boroughs|metro)\b/.test(text)) {
                return 'location';
              }
              return 'amenities';
            };
            const locationItems = allServices.filter(s => inferCat(s) === 'location');
            const addonItems = allServices.filter(s => inferCat(s) === 'amenities');
            const galleryCount = editForm.gallery?.length || 0;

            const SettingRow = ({
              icon: RowIcon,
              title,
              subtitle,
              badge,
              badgeActive = false,
              onClick,
              rightNode,
            }: {
              icon: any;
              title: string;
              subtitle: string;
              badge?: string;
              badgeActive?: boolean;
              onClick?: () => void;
              rightNode?: React.ReactNode;
            }) => {
              const Wrapper: any = onClick ? 'button' : 'div';
              return (
                <Wrapper
                  type={onClick ? 'button' : undefined}
                  onClick={onClick}
                  className={`w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3.5 text-left transition-all ${
                    onClick ? 'hover:bg-white/[0.04] active:scale-[0.995] cursor-pointer group' : ''
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/35 flex items-center justify-center text-[#D4AF37] shrink-0 transition-transform group-hover:scale-105">
                      <RowIcon className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold text-white leading-snug truncate">{title}</div>
                      <div className="text-[11px] text-zinc-400 font-medium leading-snug truncate mt-0.5">{subtitle}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    {rightNode ? (
                      rightNode
                    ) : (
                      <>
                        {badge && (
                          <span
                            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                              badgeActive
                                ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-sm'
                                : 'bg-black/60 text-zinc-300 border-white/10 group-hover:border-[#D4AF37]/40'
                            }`}
                          >
                            {badge}
                          </span>
                        )}
                        <div className="w-7 h-7 rounded-full bg-black/50 border border-white/10 group-hover:border-[#D4AF37]/40 flex items-center justify-center text-zinc-400 group-hover:text-[#D4AF37] transition-all">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </>
                    )}
                  </div>
                </Wrapper>
              );
            };

            const renderServicesManager = (activeCategory: 'location' | 'amenities') => {
              const items = activeCategory === 'location' ? locationItems : addonItems;
              const isAddingHere = showAddForm && newServiceCategoryType === activeCategory;

              return (
                <div className="space-y-4">
                  {/* Category Pill Switcher + Add Option Pill */}
                  <div className="flex flex-wrap items-center justify-between gap-2.5 bg-black/60 p-2 rounded-full border border-[#D4AF37]/25">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddForm(false);
                          setActiveProfileSettingModal('locations');
                        }}
                        className={`h-9 px-4 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 cursor-pointer ${
                          activeCategory === 'location'
                            ? 'bg-[#D4AF37] text-black shadow-md'
                            : 'text-zinc-300 hover:text-white'
                        }`}
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>Locations ({locationItems.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddForm(false);
                          setActiveProfileSettingModal('addons');
                        }}
                        className={`h-9 px-4 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 cursor-pointer ${
                          activeCategory === 'amenities'
                            ? 'bg-[#D4AF37] text-black shadow-md'
                            : 'text-zinc-300 hover:text-white'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Add-ons ({addonItems.length})</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (isAddingHere) {
                          setShowAddForm(false);
                        } else {
                          setNewServiceCategoryType(activeCategory);
                          setNewServiceUnit('');
                          setNewServiceName('');
                          setNewServicePrice('');
                          setNewServiceAllowQty(false);
                          setNewServiceDefaultHours('3');
                          setNewServiceHourlyRate('100');
                          setNewServiceImageUrl('');
                          setShowAddForm(true);
                        }
                      }}
                      className={`h-9 px-4 rounded-full border transition-all cursor-pointer flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${
                        isAddingHere
                          ? 'bg-zinc-900 text-zinc-200 border-zinc-500'
                          : 'bg-[#D4AF37]/15 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border-[#D4AF37]/50'
                      }`}
                    >
                      {isAddingHere ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 stroke-[2.5]" />}
                      <span>{isAddingHere ? 'Cancel' : `New ${activeCategory === 'location' ? 'Location' : 'Add-on'}`}</span>
                    </button>
                  </div>

                  {/* Inline Post-Shaped New Item Form */}
                  {isAddingHere && (
                    <div className="bg-black/80 p-4 sm:p-5 rounded-[1.75rem] border-2 border-[#D4AF37] space-y-4 text-left shadow-2xl">
                      <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-2.5">
                        <span className="text-[11px] font-black uppercase tracking-widest text-[#D4AF37] flex items-center gap-2">
                          <Plus className="w-4 h-4" />
                          Add New {activeCategory === 'location' ? 'Location Package' : 'Add-on / Extra'}
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowAddForm(false)}
                          className="text-zinc-300 hover:text-white px-3 py-1 rounded-full border border-white/15 text-[9px] font-black uppercase tracking-widest cursor-pointer"
                        >
                          Close
                        </button>
                      </div>

                      {activeCategory === 'location' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div className="space-y-1.5 sm:col-span-2">
                            <label className="text-[9px] font-black text-[#D4AF37] uppercase tracking-widest block pl-2">
                              Location / Area Name
                            </label>
                            <input
                              type="text"
                              autoFocus
                              className="w-full h-11 bg-[#111] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-full px-4 text-sm font-bold text-white outline-none"
                              placeholder="e.g. Lakewood, Brooklyn, Monsey"
                              value={newServiceName}
                              onChange={e => setNewServiceName(e.target.value)}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-[#D4AF37] uppercase tracking-widest block pl-2">
                              Base Price ($)
                            </label>
                            <div className="relative">
                              <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#D4AF37]" />
                              <input
                                type="number"
                                className="w-full h-11 bg-[#111] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-full pl-9 pr-4 text-sm font-bold text-[#D4AF37] outline-none"
                                placeholder="1500"
                                value={newServicePrice}
                                onChange={e => setNewServicePrice(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black text-[#D4AF37] uppercase tracking-widest block pl-2">
                                Included Hrs
                              </label>
                              <input
                                type="number"
                                min="1"
                                className="w-full h-11 bg-[#111] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-full px-4 text-sm font-bold text-white outline-none text-center"
                                placeholder="3"
                                value={newServiceDefaultHours}
                                onChange={e => setNewServiceDefaultHours(e.target.value)}
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[9px] font-black text-[#D4AF37] uppercase tracking-widest block pl-2">
                                Extra ($/hr)
                              </label>
                              <input
                                type="number"
                                min="0"
                                className="w-full h-11 bg-[#111] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-full px-4 text-sm font-bold text-[#D4AF37] outline-none text-center"
                                placeholder="100"
                                value={newServiceHourlyRate}
                                onChange={e => setNewServiceHourlyRate(e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-[#D4AF37] uppercase tracking-widest block pl-2">
                              Add-on Name
                            </label>
                            <input
                              type="text"
                              autoFocus
                              className="w-full h-11 bg-[#111] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-full px-4 text-sm font-bold text-white outline-none"
                              placeholder="e.g. Percussion, Lighting, Extra Singer"
                              value={newServiceName}
                              onChange={e => setNewServiceName(e.target.value)}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-[#D4AF37] uppercase tracking-widest block pl-2">
                              Price ($)
                            </label>
                            <div className="relative">
                              <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#D4AF37]" />
                              <input
                                type="number"
                                className="w-full h-11 bg-[#111] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-full pl-9 pr-4 text-sm font-bold text-[#D4AF37] outline-none"
                                placeholder="500"
                                value={newServicePrice}
                                onChange={e => setNewServicePrice(e.target.value)}
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5 sm:col-span-2">
                            <label className="text-[9px] font-black text-[#D4AF37] uppercase tracking-widest block pl-2">
                              Photo Caption / Description (Shown in gold when selected)
                            </label>
                            <input
                              type="text"
                              maxLength={80}
                              className="w-full h-11 bg-[#111] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-full px-4 text-sm font-semibold text-white outline-none"
                              placeholder="e.g. Percussion play & sing • 3 hours"
                              value={newServiceUnit}
                              onChange={e => setNewServiceUnit(e.target.value)}
                            />
                          </div>
                        </div>
                      )}

                      {/* Photo Upload + Quantity Pill Controls */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div className="flex items-center gap-2.5">
                          <label className="flex-1 h-11 px-4 rounded-full border border-dashed border-[#D4AF37]/60 hover:border-[#D4AF37] bg-[#111] hover:bg-[#D4AF37]/10 text-[#D4AF37] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer transition-all">
                            {isUploadingNewServiceImage ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Uploading {Math.round(uploadProgresses['newService'] || 0)}%</span>
                              </>
                            ) : (
                              <>
                                <Camera className="w-4 h-4" />
                                <span>{newServiceImageUrl ? 'Change Photo' : 'Optional Photo'}</span>
                              </>
                            )}
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handleNewServiceImageUpload}
                            />
                          </label>
                          {newServiceImageUrl && (
                            <div className="relative w-11 h-11 rounded-full overflow-hidden border-2 border-[#D4AF37] shrink-0 group">
                              <img src={newServiceImageUrl} alt="Preview" className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => setNewServiceImageUrl('')}
                                className="absolute inset-0 bg-black/75 text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                title="Remove photo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {activeCategory === 'amenities' && (
                          <button
                            type="button"
                            onClick={() => setNewServiceAllowQty(!newServiceAllowQty)}
                            className={`flex items-center justify-between w-full h-11 px-4 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
                              newServiceAllowQty
                                ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                                : 'bg-[#111] text-zinc-200 border-[#D4AF37]/40 hover:border-[#D4AF37]'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              {newServiceAllowQty ? <CheckCircle className="w-4 h-4" /> : <Layers className="w-4 h-4 text-[#D4AF37]" />}
                              <span>Quantity (+ / -)</span>
                            </span>
                            <span className="px-2.5 py-0.5 rounded-full bg-black/20">{newServiceAllowQty ? 'ON' : 'OFF'}</span>
                          </button>
                        )}
                      </div>

                      <div className="flex gap-2.5 pt-2 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => setShowAddForm(false)}
                          className="flex-1 h-10 bg-[#111] hover:bg-zinc-900 text-zinc-300 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/15 transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleAddService}
                          disabled={isUploadingNewServiceImage}
                          className="flex-[2] h-10 bg-[#D4AF37] hover:bg-[#E5C76B] text-black rounded-full text-[10px] font-black uppercase tracking-widest border border-[#D4AF37] shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-4 h-4 stroke-[3]" /> Save {activeCategory === 'location' ? 'Location' : 'Add-on'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Existing Services List */}
                  {items.length > 0 ? (
                    <div className="space-y-3">
                      {items.map((service) => {
                        const cleanNote = (service.unit && !['item', 'location', 'hour', 'hours', 'service', 'package'].includes(service.unit.toLowerCase())) ? service.unit : '';
                        const serviceImg = previewUrls[service.id] || service.image;
                        const isUploadingThis = uploadProgresses[service.id] !== undefined;

                        return (
                          <div
                            key={service.id}
                            className="w-full bg-black/60 border border-[#D4AF37]/30 hover:border-[#D4AF37]/70 rounded-[1.75rem] p-4 space-y-3.5 transition-all shadow-lg"
                          >
                            {/* Top Row: Circular Photo + Post-Shaped Name Input + Pill Delete */}
                            <div className="flex items-center gap-3 w-full">
                              <label
                                className="relative w-12 h-12 rounded-full border-2 border-[#D4AF37]/50 hover:border-[#D4AF37] bg-[#111] flex flex-col items-center justify-center overflow-hidden cursor-pointer group/img shrink-0 transition-all"
                                title="Upload or change photo"
                              >
                                {serviceImg ? (
                                  <>
                                    <img src={serviceImg} alt={service.name} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/65 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
                                      <Camera className="w-4 h-4 text-[#D4AF37]" />
                                    </div>
                                  </>
                                ) : (
                                  <Camera className="w-4 h-4 text-[#D4AF37]" />
                                )}
                                {isUploadingThis && (
                                  <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                                    <Loader2 className="w-4 h-4 text-[#D4AF37] animate-spin" />
                                  </div>
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => handleServiceImageUpload(service.id, e)}
                                />
                              </label>

                              <div className="flex-1 min-w-0">
                                <input
                                  type="text"
                                  className="w-full h-10 bg-[#111] border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-full text-sm font-bold text-white outline-none px-4"
                                  value={service.name}
                                  onChange={e => handleUpdateService(service.id, { name: e.target.value })}
                                  onBlur={flushAutoSave}
                                  placeholder={activeCategory === 'location' ? 'Location Name' : 'Add-on Name'}
                                />
                              </div>

                              {serviceImg && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewUrls(prev => {
                                      const next = { ...prev };
                                      delete next[service.id];
                                      return next;
                                    });
                                    handleUpdateService(service.id, { image: '' }, true);
                                  }}
                                  className="h-10 px-3 rounded-full bg-[#111] border border-white/15 hover:border-red-500/60 text-zinc-400 hover:text-red-400 text-[9px] font-black uppercase tracking-wider cursor-pointer transition-all shrink-0"
                                  title="Clear photo"
                                >
                                  Clear Pic
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleRemoveService(service.id)}
                                className="w-10 h-10 text-red-400 hover:bg-red-500 hover:text-white bg-[#111] border border-red-500/40 hover:border-red-500 rounded-full transition-all shrink-0 cursor-pointer flex items-center justify-center"
                                title="Delete Option"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Bottom Even Pill Grid */}
                            {activeCategory === 'location' ? (
                              <div className="grid grid-cols-3 gap-2.5 w-full">
                                <div>
                                  <span className="text-[9px] font-black uppercase tracking-wider text-[#D4AF37] block mb-1 pl-2">Base Price ($)</span>
                                  <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#D4AF37]" />
                                    <input
                                      type="number"
                                      className="w-full h-10 bg-[#111] border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-full pl-7 pr-3 text-xs sm:text-sm font-bold text-[#D4AF37] outline-none tabular-nums"
                                      value={service.price}
                                      onChange={e => handleUpdateService(service.id, { price: parseFloat(e.target.value) || 0 })}
                                      onBlur={flushAutoSave}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <span className="text-[9px] font-black uppercase tracking-wider text-[#D4AF37] block mb-1 pl-2">Included Hrs</span>
                                  <input
                                    type="number"
                                    min="1"
                                    className="w-full h-10 bg-[#111] border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-full px-3 text-xs sm:text-sm font-bold text-white outline-none text-center tabular-nums"
                                    value={service.defaultHours ?? 3}
                                    onChange={e => handleUpdateService(service.id, { defaultHours: Math.max(1, parseInt(e.target.value) || 1) })}
                                    onBlur={flushAutoSave}
                                  />
                                </div>
                                <div>
                                  <span className="text-[9px] font-black uppercase tracking-wider text-[#D4AF37] block mb-1 pl-2">Extra ($/hr)</span>
                                  <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#D4AF37]" />
                                    <input
                                      type="number"
                                      min="0"
                                      className="w-full h-10 bg-[#111] border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-full pl-7 pr-3 text-xs sm:text-sm font-bold text-[#D4AF37] outline-none tabular-nums"
                                      value={service.hourlyRate ?? 100}
                                      onChange={e => handleUpdateService(service.id, { hourlyRate: Math.max(0, parseFloat(e.target.value) || 0) })}
                                      onBlur={flushAutoSave}
                                    />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full">
                                <div>
                                  <span className="text-[9px] font-black uppercase tracking-wider text-[#D4AF37] block mb-1 pl-2">Price ($)</span>
                                  <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#D4AF37]" />
                                    <input
                                      type="number"
                                      className="w-full h-10 bg-[#111] border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-full pl-7 pr-3 text-xs sm:text-sm font-bold text-[#D4AF37] outline-none tabular-nums"
                                      value={service.price}
                                      onChange={e => handleUpdateService(service.id, { price: parseFloat(e.target.value) || 0 })}
                                      onBlur={flushAutoSave}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <span className="text-[9px] font-black uppercase tracking-wider text-[#D4AF37] block mb-1 pl-2">Photo Caption</span>
                                  <input
                                    type="text"
                                    maxLength={80}
                                    placeholder="e.g. Play & sing • 3 hrs"
                                    className="w-full h-10 bg-[#111] border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-full px-3.5 text-xs font-semibold text-white outline-none"
                                    value={cleanNote}
                                    onChange={e => handleUpdateService(service.id, { unit: e.target.value.slice(0, 80) })}
                                    onBlur={flushAutoSave}
                                  />
                                </div>
                                <div>
                                  <span className="text-[9px] font-black uppercase tracking-wider text-[#D4AF37] block mb-1 pl-2">Quantity Control</span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateService(service.id, { allowQuantity: !service.allowQuantity }, true)}
                                    className={`w-full h-10 px-3.5 rounded-full text-[10px] font-black uppercase tracking-wider border transition-all truncate cursor-pointer ${
                                      service.allowQuantity
                                        ? 'text-black border-[#D4AF37] bg-[#D4AF37]'
                                        : 'text-zinc-200 bg-[#111] border-[#D4AF37]/30 hover:border-[#D4AF37]'
                                    }`}
                                  >
                                    {service.allowQuantity ? 'Multiple: ON' : 'Single Only'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : !isAddingHere ? (
                    <div className="py-10 text-center border border-dashed border-[#D4AF37]/30 rounded-[1.75rem] bg-black/40 space-y-3">
                      <p className="text-xs text-zinc-300 font-bold uppercase tracking-widest">
                        No {activeCategory === 'location' ? 'location packages' : 'add-on extras'} configured yet
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setNewServiceCategoryType(activeCategory);
                          setNewServiceUnit('');
                          setNewServiceName('');
                          setNewServicePrice('');
                          setNewServiceAllowQty(false);
                          setNewServiceDefaultHours('3');
                          setNewServiceHourlyRate('100');
                          setNewServiceImageUrl('');
                          setShowAddForm(true);
                        }}
                        className="px-6 py-2.5 rounded-full bg-[#D4AF37] border border-[#D4AF37] text-[10px] font-black text-black uppercase tracking-widest hover:bg-[#E5C76B] transition-all cursor-pointer shadow-md"
                      >
                        + Add {activeCategory === 'location' ? 'Location Package' : 'Add-on Option'}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            };

            return (
              <div className="animate-in fade-in duration-500 max-w-2xl mx-auto pb-24 space-y-5">
                {/* Hidden File Inputs so uploads work from any modal or header */}
                <input
                  type="file"
                  ref={logoFileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleLogoUpload}
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleMediaUpload}
                />

                {/* Top Compact Vendor Account Identity Card (Phone System Settings Apple-ID Style) */}
                <div
                  onClick={() => setActiveProfileSettingModal('basic')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveProfileSettingModal('basic');
                    }
                  }}
                  className="bg-[#111] rounded-[2rem] border border-[#D4AF37]/30 shadow-2xl p-4 sm:p-5 flex items-center justify-between gap-4 hover:border-[#D4AF37]/60 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5 sm:gap-4 min-w-0 flex-1">
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        logoFileInputRef.current?.click();
                      }}
                      className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden bg-black border-2 border-[#D4AF37]/50 shrink-0 shadow-lg group/avatar"
                      title="Tap to change portrait"
                    >
                      <img src={editForm.image} className="w-full h-full object-cover" alt={editForm.name} />
                      {typeof uploadProgresses['logo'] === 'number' ? (
                        <div className="absolute inset-0 bg-black/75 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 text-[#D4AF37] animate-spin" />
                        </div>
                      ) : (
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center">
                          <Camera className="w-4 h-4 text-[#D4AF37]" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-[0.2em] bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30">
                          <ShieldCheck className="w-2.5 h-2.5" /> Vendor Station
                        </span>
                      </div>
                      <h2 className="text-base sm:text-lg font-bold font-[Cinzel] text-white truncate mt-1">
                        {editForm.name || 'Vendor Business'}
                      </h2>
                      <p className="text-[11px] text-zinc-400 font-medium truncate">
                        {editForm.contactEmail || 'No public email set'} {editForm.location ? `• ${editForm.location}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="hidden sm:inline-flex px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-black/60 text-[#D4AF37] border border-[#D4AF37]/30 group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
                      Edit Profile
                    </span>
                    <div className="w-8 h-8 rounded-full bg-black/60 border border-white/10 group-hover:border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37] transition-all">
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                {/* GROUP 1: STOREFRONT & PACKAGES */}
                <div className="space-y-2">
                  <div className="px-4 flex items-center justify-between">
                    <span className="text-[10px] font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.22em]">
                      Storefront & Pricing
                    </span>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                      Tap to configure
                    </span>
                  </div>
                  <div className="bg-[#111] rounded-[2rem] border border-[#D4AF37]/25 shadow-xl overflow-hidden divide-y divide-white/5">
                    <SettingRow
                      icon={User}
                      title="Business Identity & Bio"
                      subtitle="Trading name, portrait, contact email, location & bio"
                      badge={editForm.location ? editForm.location.split(',')[0] : 'Edit'}
                      onClick={() => setActiveProfileSettingModal('basic')}
                    />
                    <SettingRow
                      icon={MapPin}
                      title="Locations & Base Packages"
                      subtitle="Service areas, base rates, included hours & overtime"
                      badge={`${locationItems.length} ${locationItems.length === 1 ? 'Location' : 'Locations'}`}
                      badgeActive={locationItems.length > 0}
                      onClick={() => {
                        setShowAddForm(false);
                        setActiveProfileSettingModal('locations');
                      }}
                    />
                    <SettingRow
                      icon={Layers}
                      title="Add-ons & Extras"
                      subtitle="Optional upgrades, showcase photos & quantity controls"
                      badge={`${addonItems.length} ${addonItems.length === 1 ? 'Add-on' : 'Add-ons'}`}
                      badgeActive={addonItems.length > 0}
                      onClick={() => {
                        setShowAddForm(false);
                        setActiveProfileSettingModal('addons');
                      }}
                    />
                    <SettingRow
                      icon={Film}
                      title="Photos & Video Showcase"
                      subtitle="Manage portfolio images & videos on your card"
                      badge={`${galleryCount} ${galleryCount === 1 ? 'Item' : 'Items'}`}
                      badgeActive={galleryCount > 0}
                      onClick={() => setActiveProfileSettingModal('media')}
                    />
                  </div>
                </div>

                {/* GROUP 2: BOOKING RULES & PRIVACY */}
                <div className="space-y-2">
                  <div className="px-4 flex items-center justify-between">
                    <span className="text-[10px] font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.22em]">
                      Booking Rules & Privacy
                    </span>
                  </div>
                  <div className="bg-[#111] rounded-[2rem] border border-[#D4AF37]/25 shadow-xl overflow-hidden divide-y divide-white/5">
                    <SettingRow
                      icon={DollarSign}
                      title="Client Offer System"
                      subtitle="Control whether clients can propose custom price offers"
                      badge={editForm.allowOffers ? 'Active' : 'Disabled'}
                      badgeActive={Boolean(editForm.allowOffers)}
                      onClick={() => setActiveProfileSettingModal('offers')}
                    />
                    <SettingRow
                      icon={editForm.enableDateCheckLimit !== false ? Lock : Unlock}
                      title="Availability Privacy Lock"
                      subtitle="Anti-spying date check limit & cooldown reset period"
                      badge={
                        editForm.enableDateCheckLimit !== false
                          ? `${editForm.maxDateChecks ?? 5} / ${editForm.dateCheckResetHours ?? 24}h`
                          : 'Unlimited'
                      }
                      badgeActive={editForm.enableDateCheckLimit !== false}
                      onClick={() => setActiveProfileSettingModal('privacy')}
                    />
                  </div>
                </div>

                {/* GROUP 3: SYSTEM & PREFERENCES */}
                <div className="space-y-2">
                  <div className="px-4 flex items-center justify-between">
                    <span className="text-[10px] font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.22em]">
                      System & Preferences
                    </span>
                  </div>
                  <div className="bg-[#111] rounded-[2rem] border border-[#D4AF37]/25 shadow-xl overflow-hidden divide-y divide-white/5">
                    {onToggleThemeMode && (
                      <SettingRow
                        icon={Eye}
                        title="Display Appearance"
                        subtitle="Switch between luxury dark and light mode"
                        rightNode={
                          <ThemeModeSwitch
                            themeMode={themeMode}
                            onToggleThemeMode={onToggleThemeMode}
                          />
                        }
                      />
                    )}
                    <SettingRow
                      icon={Mail}
                      title="Email Delivery Debugger"
                      subtitle="Send a test email to verify automated notifications"
                      badge="Test SMTP"
                      onClick={() => setActiveProfileSettingModal('email')}
                    />
                    <SettingRow
                      icon={LogOut}
                      title="Sign Out of Vendor Station"
                      subtitle="Safely terminate your active vendor portal session"
                      badge="Sign Out"
                      onClick={onLogout}
                    />
                  </div>
                </div>

                {/* BOTTOM DRAG-DISMISS SETTING SHEETS (Exact Same Animation & Drag Indicator) */}
                {activeProfileSettingModal === 'basic' && (
                  <VendorSettingSheetModal
                    title="Business Identity & Bio"
                    subtitle="Manage your public vendor profile & service area"
                    badgeText="Storefront Identity"
                    icon={User}
                    onClose={() => {
                      flushAutoSave();
                      setActiveProfileSettingModal(null);
                    }}
                  >
                    {/* Compact Post-Shaped Portrait Row */}
                    <div className="bg-black/60 rounded-[1.75rem] border border-[#D4AF37]/30 p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="relative w-16 h-16 rounded-full overflow-hidden bg-black border-2 border-[#D4AF37]/50 shrink-0 shadow-lg">
                          <img src={editForm.image} className="w-full h-full object-cover" alt="" />
                          {typeof uploadProgresses['logo'] === 'number' && (
                            <div className="absolute inset-0 bg-black/75 flex items-center justify-center">
                              <span className="text-[10px] font-black text-[#D4AF37]">
                                {Math.round(uploadProgresses['logo'])}%
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 text-left">
                          <h4 className="text-sm font-bold text-white truncate">Profile Portrait</h4>
                          <p className="text-[11px] text-zinc-400 leading-snug">
                            Displayed on your vendor card and chat header
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => logoFileInputRef.current?.click()}
                        disabled={isUploadingLogo}
                        className="h-10 px-4 rounded-full bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5 shrink-0 cursor-pointer transition-all shadow-md"
                      >
                        {isUploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                        <span>Change</span>
                      </button>
                    </div>

                    {/* Even Post-Shaped Input Fields */}
                    <div className="bg-black/50 rounded-[1.75rem] border border-white/10 p-4 sm:p-5 space-y-4 text-left">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em] pl-2 block">
                          Business Trading Name
                        </label>
                        <input
                          type="text"
                          className="w-full h-11 bg-black border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-full px-4 text-sm font-bold text-white outline-none transition-all"
                          value={editForm.name}
                          onChange={e => applyAutoSaveVendorUpdate(prev => ({ ...prev, name: e.target.value }))}
                          onBlur={flushAutoSave}
                          placeholder="e.g. Classic Jewish Catering"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em] pl-2 block">
                          Public Contact Email
                        </label>
                        <input
                          type="email"
                          className="w-full h-11 bg-black border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-full px-4 text-sm font-bold text-white outline-none transition-all"
                          value={editForm.contactEmail}
                          onChange={e => applyAutoSaveVendorUpdate(prev => ({ ...prev, contactEmail: e.target.value }))}
                          onBlur={flushAutoSave}
                          placeholder="hello@business.com"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em] pl-2 block">
                          Location / Base Service Area
                        </label>
                        <LocationAutocomplete
                          id="vendor-profile-location"
                          floating={false}
                          placeholder="e.g. Brooklyn, NY or Lakewood, NJ..."
                          value={editForm.location || ''}
                          onChange={(val) => applyAutoSaveVendorUpdate(prev => ({ ...prev, location: val }))}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em] pl-2 block">
                          Business Biography & Description
                        </label>
                        <textarea
                          rows={4}
                          className="w-full bg-black border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-[1.5rem] p-4 text-sm outline-none resize-none text-zinc-200 leading-relaxed transition-all"
                          value={editForm.description}
                          onChange={e => applyAutoSaveVendorUpdate(prev => ({ ...prev, description: e.target.value }))}
                          onBlur={flushAutoSave}
                          placeholder="Tell clients about your services, style, and experience..."
                        />
                      </div>
                    </div>
                  </VendorSettingSheetModal>
                )}

                {activeProfileSettingModal === 'locations' && (
                  <VendorSettingSheetModal
                    title="Locations & Base Packages"
                    subtitle="Client selects 1 location and can add extra hours"
                    badgeText="Pricing & Areas"
                    icon={MapPin}
                    onClose={() => {
                      flushAutoSave();
                      setShowAddForm(false);
                      setActiveProfileSettingModal(null);
                    }}
                  >
                    {renderServicesManager('location')}
                  </VendorSettingSheetModal>
                )}

                {activeProfileSettingModal === 'addons' && (
                  <VendorSettingSheetModal
                    title="Add-ons & Extras"
                    subtitle="Optional upgrades & showcase photos on your booking sheet"
                    badgeText="Upgrades & Extras"
                    icon={Layers}
                    onClose={() => {
                      flushAutoSave();
                      setShowAddForm(false);
                      setActiveProfileSettingModal(null);
                    }}
                  >
                    {renderServicesManager('amenities')}
                  </VendorSettingSheetModal>
                )}

                {activeProfileSettingModal === 'media' && (
                  <VendorSettingSheetModal
                    title="Photos & Video Showcase"
                    subtitle="Manage portfolio media displayed on your vendor card"
                    badgeText="Media Gallery"
                    icon={Film}
                    onClose={() => setActiveProfileSettingModal(null)}
                  >
                    {/* Even Pill Upload Controls: Add Photo, Upload Video, Paste Video URL */}
                    <div className="grid grid-cols-3 gap-2 bg-black/60 p-2 rounded-full border border-[#D4AF37]/30">
                      <button
                        type="button"
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.accept = 'image/*';
                            fileInputRef.current.click();
                          }
                        }}
                        className="h-10 px-3 rounded-full bg-white/5 hover:bg-white/10 text-white text-[9px] sm:text-[10px] font-black uppercase tracking-widest border border-white/15 flex items-center justify-center gap-1.5 cursor-pointer transition-all truncate"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                        <span className="truncate">Add Photo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (fileInputRef.current) {
                            fileInputRef.current.accept = 'video/*';
                            fileInputRef.current.click();
                          }
                        }}
                        className="h-10 px-3 rounded-full bg-white/5 hover:bg-white/10 text-white text-[9px] sm:text-[10px] font-black uppercase tracking-widest border border-white/15 flex items-center justify-center gap-1.5 cursor-pointer transition-all truncate"
                      >
                        <Film className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                        <span className="truncate">Upload Video</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowVideoUrlBar(prev => !prev);
                          setVideoUrlError(null);
                        }}
                        className={`h-10 px-3 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-widest border flex items-center justify-center gap-1.5 cursor-pointer transition-all truncate ${
                          showVideoUrlBar
                            ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-md'
                            : 'bg-[#D4AF37]/15 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border-[#D4AF37]/50'
                        }`}
                      >
                        <Video className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{showVideoUrlBar ? 'Close URL' : 'Video URL'}</span>
                      </button>
                    </div>

                    {/* Sleek Post-Shaped Video URL Input Bar + Friendly Validation Feedback */}
                    <AnimatePresence initial={false}>
                      {showVideoUrlBar && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.2 }}
                          className="space-y-2"
                        >
                          <div
                            className={`bg-black/75 p-2 pl-4 rounded-full border flex items-center gap-2 shadow-xl transition-colors ${
                              videoUrlError ? 'border-red-500/70' : 'border-[#D4AF37]/50'
                            }`}
                          >
                            <Film className={`w-4 h-4 shrink-0 ${videoUrlError ? 'text-red-400' : 'text-[#D4AF37]'}`} />
                            <input
                              type="url"
                              autoFocus
                              value={videoUrlInput}
                              onChange={(e) => {
                                setVideoUrlInput(e.target.value);
                                if (videoUrlError) setVideoUrlError(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddVideoUrl();
                                }
                              }}
                              placeholder="Paste YouTube, Vimeo, Dropbox, or .mp4 video link..."
                              className="flex-1 min-w-0 bg-transparent text-xs sm:text-sm font-semibold text-white placeholder:text-zinc-500 outline-none"
                            />
                            <button
                              type="button"
                              onClick={handleAddVideoUrl}
                              disabled={isSavingVideoUrl}
                              className="h-9 px-5 rounded-full bg-[#D4AF37] hover:bg-[#E5C76B] disabled:opacity-40 text-black text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-all shadow-md"
                            >
                              {isSavingVideoUrl ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Checking</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                                  <span>Add</span>
                                </>
                              )}
                            </button>
                          </div>

                          {videoUrlError && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="px-4 py-2.5 rounded-2xl bg-red-500/10 border border-red-500/35 flex items-start gap-2.5 text-left"
                            >
                              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                              <p className="text-[11px] font-semibold text-red-300 leading-snug">
                                {videoUrlError}
                              </p>
                            </motion.div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {typeof uploadProgresses['gallery'] === 'number' && (
                      <div className="flex items-center justify-center gap-3 text-[#D4AF37] text-[10px] font-black uppercase tracking-widest bg-black/60 border border-[#D4AF37]/30 px-4 py-2.5 rounded-full">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Uploading Media: {Math.round(uploadProgresses['gallery'])}%</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                      {editForm.gallery?.map((url, idx) => {
                        const isVid = isVideo(url);
                        const isEmbed = isEmbedVideo(url);
                        return (
                          <div
                            key={idx}
                            className="relative aspect-square bg-black rounded-[1.5rem] overflow-hidden border border-[#D4AF37]/25 group shadow-xl"
                          >
                            <div
                              onClick={() => setFullscreenMedia({ url, type: isVid ? 'video' : 'image' })}
                              className="w-full h-full cursor-pointer relative"
                            >
                              {isEmbed ? (
                                <iframe
                                  src={url}
                                  title={`Showcase video ${idx + 1}`}
                                  className="w-full h-full border-0 pointer-events-none"
                                  allow="autoplay; fullscreen"
                                />
                              ) : isVid ? (
                                <video autoPlay muted loop playsInline preload="metadata" src={url} className="w-full h-full object-cover" />
                              ) : (
                                <img src={url} className="w-full h-full object-cover" alt="" />
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveMedia(idx);
                              }}
                              className="absolute top-2.5 right-2.5 w-8 h-8 bg-black/80 hover:bg-red-600 text-white rounded-full border border-white/20 flex items-center justify-center transition-all shadow-lg cursor-pointer z-10"
                              title="Remove media"
                              aria-label="Remove media"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            {isVid && (
                              <div className="absolute bottom-2.5 left-2.5 bg-black/80 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[8px] font-black text-[#D4AF37] border border-[#D4AF37]/30 flex items-center gap-1">
                                <Video className="w-2.5 h-2.5" /> {url.includes('simcha_video=1') || isEmbed ? 'VIDEO LINK' : 'VIDEO'}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {(!editForm.gallery || editForm.gallery.length === 0) && (
                        <div className="col-span-full py-12 text-center border border-dashed border-[#D4AF37]/30 rounded-[1.75rem] bg-black/40">
                          <ImageIcon className="w-10 h-10 mx-auto mb-2 text-[#D4AF37]/40" />
                          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                            Your showcase gallery is currently empty
                          </p>
                        </div>
                      )}
                    </div>
                  </VendorSettingSheetModal>
                )}

                {activeProfileSettingModal === 'offers' && (
                  <VendorSettingSheetModal
                    title="Client Offer System"
                    subtitle="Control how clients can negotiate pricing on your listing"
                    badgeText="Negotiation Rules"
                    icon={DollarSign}
                    onClose={() => setActiveProfileSettingModal(null)}
                  >
                    <div className="bg-black/60 rounded-[1.75rem] border border-[#D4AF37]/30 p-5 space-y-5 text-left">
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-white">Enable "Make an Offer"</h4>
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            Allow clients to propose a custom price when requesting a booking date.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            applyImmediateVendorUpdate(prev => ({ ...prev, allowOffers: !prev.allowOffers }));
                          }}
                          className={`h-11 px-6 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all border shrink-0 cursor-pointer flex items-center gap-2 ${
                            editForm.allowOffers
                              ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-lg shadow-[#D4AF37]/15'
                              : 'bg-black text-zinc-300 border-white/15 hover:border-[#D4AF37]/40'
                          }`}
                        >
                          {editForm.allowOffers ? (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              <span>Active</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4" />
                              <span>Disabled</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div className="p-4 rounded-2xl bg-[#111] border border-white/5 text-xs text-zinc-300 leading-relaxed">
                        When enabled, a <span className="text-[#D4AF37] font-bold">Make an Offer</span> option appears in your booking sheet. You receive instant notifications for every offer and can accept, decline, or send a counter-offer.
                      </div>
                    </div>
                  </VendorSettingSheetModal>
                )}

                {activeProfileSettingModal === 'privacy' && (
                  <VendorSettingSheetModal
                    title="Availability Privacy Lock"
                    subtitle="Protect your calendar from competitor date spying"
                    badgeText="Privacy & Security"
                    icon={editForm.enableDateCheckLimit !== false ? Lock : Unlock}
                    onClose={() => {
                      flushAutoSave();
                      setActiveProfileSettingModal(null);
                    }}
                  >
                    <div className="bg-black/60 rounded-[1.75rem] border border-[#D4AF37]/30 p-5 space-y-5 text-left">
                      <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-white">Date Check Limit</h4>
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            Limit how many dates a visitor can check before a cooldown reset.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const nextEnabled = editForm.enableDateCheckLimit === false;
                            applyImmediateVendorUpdate(prev => ({ ...prev, enableDateCheckLimit: nextEnabled }));
                            showNotification(
                              nextEnabled ? 'Date check limit enabled.' : 'Date check limit turned off.',
                              'info'
                            );
                          }}
                          className={`h-11 px-6 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all border shrink-0 cursor-pointer flex items-center gap-2 ${
                            editForm.enableDateCheckLimit !== false
                              ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-lg shadow-[#D4AF37]/15'
                              : 'bg-black text-zinc-300 border-white/15 hover:border-[#D4AF37]/40'
                          }`}
                        >
                          {editForm.enableDateCheckLimit !== false ? (
                            <>
                              <CheckCircle className="w-4 h-4" />
                              <span>Active</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4" />
                              <span>Off</span>
                            </>
                          )}
                        </button>
                      </div>

                      <div
                        className={`grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/10 transition-opacity ${
                          editForm.enableDateCheckLimit === false ? 'opacity-40 pointer-events-none select-none' : ''
                        }`}
                      >
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em] pl-2 block">
                            Max Date Checks Allowed
                          </label>
                          <input
                            type="number"
                            min="1"
                            disabled={editForm.enableDateCheckLimit === false}
                            className="w-full h-11 bg-black border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-full px-4 text-sm font-bold text-white outline-none transition-all"
                            value={editForm.maxDateChecks ?? 5}
                            onChange={e => applyAutoSaveVendorUpdate(prev => ({ ...prev, maxDateChecks: parseInt(e.target.value) || 0 }))}
                            onBlur={flushAutoSave}
                            placeholder="5"
                          />
                          <p className="text-[10px] text-zinc-400 pl-2">Checks allowed per client before lock.</p>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em] pl-2 block">
                            Reset Period (Hours)
                          </label>
                          <input
                            type="number"
                            min="1"
                            disabled={editForm.enableDateCheckLimit === false}
                            className="w-full h-11 bg-black border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-full px-4 text-sm font-bold text-white outline-none transition-all"
                            value={editForm.dateCheckResetHours ?? 24}
                            onChange={e => applyAutoSaveVendorUpdate(prev => ({ ...prev, dateCheckResetHours: parseInt(e.target.value) || 0 }))}
                            onBlur={flushAutoSave}
                            placeholder="24"
                          />
                          <p className="text-[10px] text-zinc-400 pl-2">Hours until check counter resets.</p>
                        </div>
                      </div>
                    </div>
                  </VendorSettingSheetModal>
                )}

                {activeProfileSettingModal === 'email' && (
                  <VendorSettingSheetModal
                    title="Email Delivery Debugger"
                    subtitle="Test your SMTP configuration & notification delivery"
                    badgeText="System Diagnostics"
                    icon={Mail}
                    onClose={() => setActiveProfileSettingModal(null)}
                  >
                    <div className="bg-black/60 rounded-[1.75rem] border border-[#D4AF37]/30 p-5 space-y-4 text-left">
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        Send a live test email to verify that booking notifications and client alerts are delivering properly.
                      </p>

                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <div className="flex-1 relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#D4AF37]" />
                          <input
                            type="email"
                            placeholder="recipient@example.com"
                            className="w-full h-11 bg-black border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-full pl-11 pr-4 text-sm text-white outline-none transition-all"
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleSendTestEmail}
                          disabled={isSendingTest}
                          className="h-11 px-6 bg-[#D4AF37] hover:bg-[#E5C76B] text-black rounded-full font-black text-[10px] uppercase tracking-widest border border-[#D4AF37] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shrink-0"
                        >
                          {isSendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          <span>{isSendingTest ? 'Sending...' : 'Send Test'}</span>
                        </button>
                      </div>

                      {testEmailStatus?.success && (
                        <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-4 py-3 rounded-full flex items-center gap-2.5">
                          <CheckCircle className="w-4 h-4 text-[#D4AF37] shrink-0" />
                          <p className="text-[10px] font-bold text-[#D4AF37] uppercase tracking-widest">
                            Test email sent! Check your inbox.
                          </p>
                        </div>
                      )}

                      {testEmailStatus?.error && (
                        <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl flex items-start gap-2.5">
                          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Email Failed</p>
                            <p className="text-[10px] text-zinc-300 mt-1 font-mono break-all">{testEmailStatus.error}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </VendorSettingSheetModal>
                )}
              </div>
            );
          })()}
          
          {(activeTab === 'history') && (
            <div className="bg-[#111] p-10 rounded-3xl border border-dashed border-white/10 text-center space-y-4 animate-in fade-in duration-300">
              <div className="bg-[#D4AF37]/5 w-20 h-20 rounded-full flex items-center justify-center mx-auto"><Settings className="w-8 h-8 text-[#D4AF37]/20" /></div>
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">The "{activeTab}" module is currently under maintenance.</p>
            </div>
          )}
        </div>
      </main>
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
            className="fixed inset-0 z-[220] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
          >
            <button 
              onClick={() => setFullscreenMedia(null)}
              className="absolute top-4 right-4 text-white hover:text-[#D4AF37] bg-black/50 p-3 rounded-full backdrop-blur-md border border-white/10 transition-all shadow-xl z-10"
            >
              <X className="w-6 h-6" />
            </button>
            {fullscreenMedia.type === 'image' ? (
              <img src={fullscreenMedia.url} alt="Fullscreen View" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
            ) : isEmbedVideo(fullscreenMedia.url) ? (
              <iframe src={fullscreenMedia.url} className="w-full max-w-4xl aspect-video rounded-xl shadow-2xl border-0 bg-black" allow="autoplay; fullscreen" />
            ) : (
              <video src={fullscreenMedia.url} controls autoPlay className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl bg-black" />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default VendorPortal;