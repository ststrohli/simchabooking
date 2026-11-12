import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, CalendarDays, Settings, LogOut, DollarSign, Users, User, TrendingUp, CheckCircle, XCircle, Clock, Save, Trash2, 
  ImageIcon, Menu, X, Plus, Tag, CreditCard, ArrowRight, Video, Film, ShieldCheck, MapPin, Eye, Upload, Mail, AlertTriangle, 
  ChevronLeft, ChevronRight, ChevronDown, RefreshCw, History, Loader2, Play, Calendar, Lock, Unlock, MessageSquare, Send, AlertCircle, Bell, BellRing, Info, ClipboardList, Edit3, Hash, Layers, Package, HelpCircle, ExternalLink, Check, CheckCheck, Volume2, Camera, FileText, Download, Search, ArrowLeft, Paperclip, Mic, StopCircle, Globe
} from 'lucide-react';
import { Vendor, Booking, Message, SelectedService, VendorService, ServiceCategoryType, getVendorSocialItems, SocialPlatformId } from '../types';
import { VendorSocialLogoIcon } from './VendorCard';
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
import {
  extractDatesFromEventRange,
  buildBookingSyncHash,
  buildGoogleCalendarPayloadForBooking,
  extractSimchaBookingIdFromEvent,
  findMatchingGoogleEventsForBooking,
  reconcileVendorGoogleEvents,
  GoogleCalendarSyncMap,
} from '../services/calendarSyncService';

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

const is24SixMedia = (url?: string | null) => {
  if (!url) return false;
  return /24six\.(app|com)/i.test(url) || url.includes('simcha_24six=1');
};

const isAudioMedia = (url?: string | null) => {
  if (!url || is24SixMedia(url)) return false;
  return !!(
    url.startsWith('data:audio/') ||
    url.match(/\.(mp3|wav|m4a|aac|flac|oga)(?:\?|$|#|%)/i) ||
    url.includes('audio%2F') ||
    url.includes('audio/') ||
    url.includes('simcha_audio=1')
  );
};

const isEmbedVideo = (url?: string | null) => {
  if (!url) return false;
  return /youtube\.com\/embed\/|player\.vimeo\.com\/video\//i.test(url);
};

const isVideo = (url?: string | null) => {
  if (!url || is24SixMedia(url) || isAudioMedia(url)) return false;
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
      error: 'Please paste a 24/6, YouTube, Vimeo, or video/music link before adding it to your showcase.',
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
      error: 'That does not look like a valid web address. Please paste a full https:// link.',
    };
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) {
    return {
      isValid: false,
      error: 'Please enter a valid https:// URL (e.g., 24six.app, YouTube, Vimeo, Dropbox, or direct .mp4 / .mp3 link).',
    };
  }

  const host = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname;

  // 0. Validate & Normalize 24/6 (24Six) Links for Music, Videos & Content
  if (host === '24six.app' || host.endsWith('.24six.app') || host === '24six.com' || host.endsWith('.24six.com')) {
    const clean24Six = parsed.toString();
    const tagged24Six = clean24Six.includes('#')
      ? `${clean24Six}&simcha_24six=1`
      : `${clean24Six}#simcha_24six=1`;
    return {
      isValid: true,
      normalizedUrl: tagged24Six,
      shouldProbeVideo: false,
    };
  }

  // Reject obvious non-media file extensions (images, documents, webpages)
  if (/\.(jpe?g|png|gif|webp|svg|bmp|ico|pdf|docx?|xlsx?|zip|rar|html?|php|asp)(?:\?|$|#)/i.test(pathname)) {
    return {
      isValid: false,
      error: 'This link points to an image or document rather than media. Please paste a 24/6, YouTube, Vimeo, video (.mp4, .mov), or music (.mp3, .wav, .m4a) link.',
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
        error: 'Invalid Dropbox link. Please paste a shared link to a specific video or music file.',
      };
    }
    let directDropbox = withProtocol
      .replace(/^https?:\/\/(www\.)?dropbox\.com\//i, 'https://dl.dropboxusercontent.com/')
      .replace(/[?&]dl=0/i, '')
      .replace(/[?&]dl=1/i, '');
    const isAudioExt = /\.(mp3|wav|m4a|aac|flac|oga)(?:\?|$|#)/i.test(pathname);
    directDropbox = directDropbox.includes('#')
      ? `${directDropbox}&${isAudioExt ? 'simcha_audio=1' : 'simcha_video=1'}`
      : `${directDropbox}#t=0.001&${isAudioExt ? 'simcha_audio=1' : 'simcha_video=1'}`;
    return {
      isValid: true,
      normalizedUrl: directDropbox,
      shouldProbeVideo: !isAudioExt,
    };
  }

  // 4. Validate & Normalize Google Drive Video / Audio Links
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

  // 5. Direct Audio File Extensions (.mp3, .wav, .m4a, .aac, .flac, .oga)
  const hasAudioExtension = /\.(mp3|wav|m4a|aac|flac|oga)(?:\?|$|#)/i.test(withProtocol);
  if (hasAudioExtension) {
    const taggedAudio = withProtocol.includes('#')
      ? `${withProtocol}&simcha_audio=1`
      : `${withProtocol}#simcha_audio=1`;
    return {
      isValid: true,
      normalizedUrl: taggedAudio,
      shouldProbeVideo: false,
    };
  }

  // 6. Direct Video File Extensions (.mp4, .mov, .webm, .m4v, .ogg, .ogv) or Known Video Storage / CDN Hosts
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
      'Unsupported link. Please paste a valid 24/6 (24six.app), YouTube, Vimeo, Dropbox, Google Drive, or direct video/music (.mp4, .mov, .mp3) URL.',
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

  const eventModalNode = (
    <motion.div
      style={{ opacity: backdropOpacity }}
      transition={EVENT_MODAL_TRANSITION}
      role="dialog"
      aria-modal="true"
      aria-labelledby="calendar-event-modal-title"
      className={`fixed inset-0 z-[260] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 bg-black/80 backdrop-blur-md overflow-hidden ${isDismissing ? 'pointer-events-none' : ''}`}
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

  return typeof document !== 'undefined' ? createPortal(eventModalNode, document.body) : eventModalNode;
};

type ProfileSettingModalType = 'basic' | 'social' | 'locations' | 'addons' | 'media' | 'offers' | 'privacy' | 'email' | null;

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
  const [showStripePayoutsModal, setShowStripePayoutsModal] = useState(false);
  const [confirmResetStripe, setConfirmResetStripe] = useState(false);
  
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
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [showAddCalendarEventForm, setShowAddCalendarEventForm] = useState(false);
  const [newCalEventTitle, setNewCalEventTitle] = useState('');
  const [newCalEventStart, setNewCalEventStart] = useState('6:00 PM');
  const [newCalEventEnd, setNewCalEventEnd] = useState('10:00 PM');
  const [newCalEventLocation, setNewCalEventLocation] = useState('');
  const [newCalEventNotes, setNewCalEventNotes] = useState('');
  const [newCalEventLockDate, setNewCalEventLockDate] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const [syncStep, setSyncStep] = useState<'idle' | 'auth' | 'fetching' | 'saving' | 'success'>('idle');
  const [calendarSyncError, setCalendarSyncError] = useState<string | null>(null);
  const inFlightBookingPushIdsRef = useRef<Set<string>>(new Set());

  const handleCalendarSync = async () => {
    if (isSyncingRef.current || isSyncing) {
      showNotification("Calendar sync is already in progress.", "info");
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

      const result = await signInWithPopup(firebaseAuth, provider);

      setSyncStep('fetching');
      showNotification('Authenticated! Connecting to Google Calendar API...', 'info');

      const credential = GoogleAuthProvider.credentialFromResult(result);
      const token = credential?.accessToken;

      if (!token) {
        throw new Error("Could not retrieve Google Access Token from login credential.");
      }

      const sessionVendorId = vendor.id || firebaseAuth.currentUser?.uid;
      if (!sessionVendorId) {
        throw new Error("No active session or vendor ID found.");
      }

      // Query from 1 year in the past so bookings earlier today or in recent months are always matched
      // and never re-pushed as duplicates due to a narrow timeMin window.
      const timeMin = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=startTime&maxResults=2500`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        let errReason = `HTTP ${response.status}`;
        try {
          const errJson = await response.json();
          errReason = errJson?.error?.message || errReason;
        } catch {
          // Ignore JSON parse error
        }
        throw new Error(`Google Calendar API error (${response.status}): ${errReason}`);
      }

      const data = await response.json();
      const events = Array.isArray(data.items) ? data.items : [];
      let activeEvents = events.filter((e: any) => e && e.status !== 'cancelled');

      setSyncStep('saving');
      showNotification(`Found ${activeEvents.length} events on Google. Reconciling Simcha Bookings...`, 'info');

      const updatedSyncMap: GoogleCalendarSyncMap = {
        ...(latestEditFormRef.current.googleCalendarSyncMap || vendor.googleCalendarSyncMap || {}),
      };

      const confirmedGigs = bookings.filter((b) => b.status === 'confirmed');
      let pushedCount = 0;
      let updatedCount = 0;
      const removedDuplicateGoogleIds = new Set<string>();

      for (const gig of confirmedGigs) {
        if (!gig.id) continue;
        const payload = buildGoogleCalendarPayloadForBooking(gig, sessionVendorId);
        const currentHash = buildBookingSyncHash(gig);
        const matches = findMatchingGoogleEventsForBooking(gig, activeEvents, updatedSyncMap);
        const storedEntry = updatedSyncMap[gig.id];

        if (matches.length > 0 || storedEntry?.googleEventId) {
          const primaryMatch = matches[0];
          const targetGoogleId = primaryMatch?.id || storedEntry.googleEventId;

          // Clean up any extra duplicate "Simcha Booking: ..." copies on Google Calendar
          // ONLY when provenance for this exact booking ID is 100% certain.
          if (matches.length > 1) {
            for (const dup of matches.slice(1)) {
              const provenBookingId = extractSimchaBookingIdFromEvent(dup, confirmedGigs, updatedSyncMap);
              const isProvenSimchaCopy =
                provenBookingId === gig.id &&
                typeof dup.summary === 'string' &&
                dup.summary.startsWith('Simcha Booking:') &&
                typeof dup.description === 'string' &&
                dup.description.includes('Simcha Booking Detail');

              if (isProvenSimchaCopy && dup.id && dup.id !== targetGoogleId) {
                removedDuplicateGoogleIds.add(dup.id);
                try {
                  await fetch(
                    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(dup.id)}`,
                    {
                      method: 'DELETE',
                      headers: { Authorization: `Bearer ${token}` },
                    }
                  );
                } catch (delErr) {
                  console.warn(`Could not remove duplicate Google event ${dup.id}:`, delErr);
                }
              }
            }
          }

          const needsUpdate =
            !storedEntry ||
            storedEntry.lastSyncedHash !== currentHash ||
            (primaryMatch &&
              (primaryMatch.summary !== payload.summary ||
                (primaryMatch.location || '') !== (payload.location || '') ||
                (primaryMatch.description || '') !== payload.description));

          if (needsUpdate && targetGoogleId) {
            const patchRes = await fetch(
              `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(targetGoogleId)}`,
              {
                method: 'PATCH',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
              }
            );

            if (patchRes.ok) {
              updatedCount++;
              updatedSyncMap[gig.id] = {
                googleEventId: targetGoogleId,
                calendarId: 'primary',
                lastSyncedHash: currentHash,
                updatedAt: new Date().toISOString(),
              };
              continue;
            } else if (patchRes.status !== 404) {
              // Keep existing mapping on transient error rather than creating a duplicate
              updatedSyncMap[gig.id] = {
                googleEventId: targetGoogleId,
                calendarId: 'primary',
                lastSyncedHash: storedEntry?.lastSyncedHash || currentHash,
                updatedAt: new Date().toISOString(),
              };
              continue;
            }
            // If 404 (deleted on Google Calendar), fall through to POST a fresh event
          } else if (targetGoogleId) {
            updatedSyncMap[gig.id] = {
              googleEventId: targetGoogleId,
              calendarId: 'primary',
              lastSyncedHash: currentHash,
              updatedAt: storedEntry?.updatedAt || new Date().toISOString(),
            };
            continue;
          }
        }

        // Guard against concurrent/retry duplicate POSTs in the same session
        if (inFlightBookingPushIdsRef.current.has(gig.id)) {
          continue;
        }
        inFlightBookingPushIdsRef.current.add(gig.id);

        try {
          const postRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          if (postRes.ok) {
            const createdEv = await postRes.json();
            pushedCount++;
            if (createdEv?.id) {
              updatedSyncMap[gig.id] = {
                googleEventId: createdEv.id,
                calendarId: 'primary',
                lastSyncedHash: currentHash,
                updatedAt: new Date().toISOString(),
              };
            }
          } else {
            console.warn(`Could not push gig ${gig.id} to Google Calendar (HTTP ${postRes.status})`);
          }
        } finally {
          inFlightBookingPushIdsRef.current.delete(gig.id);
        }
      }

      if (removedDuplicateGoogleIds.size > 0) {
        activeEvents = activeEvents.filter((e: any) => !removedDuplicateGoogleIds.has(e.id));
      }

      // Reconcile vendor.googleEvents:
      // - Preserve custom vendor events
      // - Exclude Simcha-origin exported bookings so they are never duplicated on top of native bookings
      // - Deduplicate and upsert external Google Calendar events by (calendarId, id)
      const parsedGoogleEvents = reconcileVendorGoogleEvents({
        existingVendorEvents: latestEditFormRef.current.googleEvents || vendor.googleEvents || [],
        fetchedGoogleEvents: activeEvents,
        bookings,
        syncMap: updatedSyncMap,
        calendarId: 'primary',
        accountEmail: result.user?.email || undefined,
      });

      const currentUnavailable = latestEditFormRef.current.unavailableDates || vendor.unavailableDates || [];
      const googleDates: string[] = [];

      // Lock dates only from genuine external Google events (only today or future dates)
      const todayYMD = new Date().toLocaleDateString('en-CA');
      parsedGoogleEvents.forEach((event) => {
        if (event.isCustom) return;
        const eventDates = extractDatesFromEventRange(event.start, event.end);
        eventDates.forEach((d) => {
          if (d >= todayYMD) {
            googleDates.push(d);
          }
        });
      });

      const mergedDates = Array.from(new Set([...currentUnavailable, ...googleDates])).sort();
      const newDatesCount = Math.max(0, mergedDates.length - currentUnavailable.length);

      const updatedVendorPayload: Vendor = {
        ...vendor,
        ...latestEditFormRef.current,
        id: sessionVendorId,
        unavailableDates: mergedDates,
        googleEvents: parsedGoogleEvents,
        googleCalendarSyncMap: updatedSyncMap,
      };

      setEditForm(updatedVendorPayload);
      latestEditFormRef.current = updatedVendorPayload;
      onUpdateVendor(updatedVendorPayload);

      setSyncStep('success');

      const importedExternalCount = parsedGoogleEvents.filter((e) => !e.isCustom).length;
      let successMsg = `Calendar synced! ${importedExternalCount} Google events up to date.`;
      if (pushedCount > 0) {
        successMsg += ` Exported ${pushedCount} new booking${pushedCount === 1 ? '' : 's'}.`;
      }
      if (updatedCount > 0) {
        successMsg += ` Updated ${updatedCount} existing booking${updatedCount === 1 ? '' : 's'}.`;
      }
      if (newDatesCount > 0) {
        successMsg += ` Locked ${newDatesCount} new date${newDatesCount === 1 ? '' : 's'}.`;
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
        !!selectedThreadEmail ||
        !!selectedCalendarEvent ||
        !!selectedCalendarDate ||
        !!showStripePayoutsModal ||
        (!!activeProfileSettingModal && activeTab === 'profile')
      );
    }
  }, [selectedThreadEmail, activeTab, selectedCalendarEvent, selectedCalendarDate, showStripePayoutsModal, activeProfileSettingModal]);

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
    return extractDatesFromEventRange(startVal, endVal);
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

  const parseEventTime24Parts = (timeStr?: string): { hours: string; minutes: string } | null => {
    if (!timeStr) return null;
    const trimmed = timeStr.trim();
    const ampm = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (ampm) {
      let h = parseInt(ampm[1], 10) % 12;
      if (ampm[3].toUpperCase() === 'PM') h += 12;
      return { hours: String(h).padStart(2, '0'), minutes: ampm[2] };
    }
    const m24 = trimmed.match(/^(\d{1,2}):(\d{2})/);
    if (m24) {
      return { hours: String(parseInt(m24[1], 10)).padStart(2, '0'), minutes: m24[2] };
    }
    return null;
  };

  const formatBookingTime12h = (timeStr?: string): string => {
    if (!timeStr) return '';
    const trimmed = timeStr.trim();
    if (/AM|PM/i.test(trimmed)) return trimmed.toUpperCase();
    const parts = parseEventTime24Parts(trimmed);
    if (!parts) return trimmed;
    const h24 = parseInt(parts.hours, 10);
    const period = h24 >= 12 ? 'PM' : 'AM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${parts.minutes} ${period}`;
  };

  const parseDateTimeFriendly = (dateStr: string, timeStr?: string) => {
    if (!dateStr) return 'N/A';
    
    const timeParts = parseEventTime24Parts(timeStr);
    if (timeParts) {
      try {
        const d = new Date(`${dateStr}T${timeParts.hours}:${timeParts.minutes}:00`);
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
    const timeParts = parseEventTime24Parts(b.eventTime);
    if (timeParts) {
      try {
        const startD = new Date(`${b.date}T${timeParts.hours}:${timeParts.minutes}:00`);
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

  const handleResetStripeConnection = async () => {
    try {
      setIsOnboarding(true);
      setOnboardingError(null);
      setStripeMessage(null);
      if (vendor.id) {
        await updateDoc(doc(db, 'vendors', vendor.id), {
          stripeConnected: false,
          stripeAccountId: '',
          onboardingComplete: false
        }).catch(() => {});
      }
      applyImmediateVendorUpdate((prev) => ({
        ...prev,
        stripeConnected: false,
        stripeAccountId: '',
        onboardingComplete: false
      }));
      setConfirmResetStripe(false);
      setShowStripePayoutsModal(false);
      showNotification('Stripe connection reset. You can connect a new Stripe account anytime.', 'info');
    } catch (error: any) {
      console.error('Error resetting Stripe connection:', error);
      setOnboardingError(error.message || 'Failed to reset Stripe connection.');
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

  const openCalendarDateSheet = (dateStr: string, openAddEvent = false) => {
    setSelectedCalendarDate(dateStr);
    setShowAddCalendarEventForm(openAddEvent);
    if (openAddEvent) {
      setNewCalEventTitle('');
      setNewCalEventStart('6:00 PM');
      setNewCalEventEnd('10:00 PM');
      setNewCalEventLocation(editForm.location || vendor.location || '');
      setNewCalEventNotes('');
      setNewCalEventLockDate(true);
    }
  };

  const handleAddCustomCalendarEvent = (targetDateStr: string) => {
    const title = newCalEventTitle.trim() || 'Custom Event';
    const startParts = parseEventTime24Parts(newCalEventStart);
    const endParts = parseEventTime24Parts(newCalEventEnd);

    const startVal = startParts
      ? `${targetDateStr}T${startParts.hours}:${startParts.minutes}:00`
      : targetDateStr;
    const endVal = endParts
      ? `${targetDateStr}T${endParts.hours}:${endParts.minutes}:00`
      : targetDateStr;

    const newEvent = {
      id: `custom_${Date.now()}`,
      summary: title,
      start: startVal,
      end: endVal,
      location: newCalEventLocation.trim(),
      description: newCalEventNotes.trim(),
      isCustom: true,
    };

    const existingEvents = latestEditFormRef.current.googleEvents || vendor.googleEvents || [];
    const currentUnavailable = latestEditFormRef.current.unavailableDates || vendor.unavailableDates || [];
    const updatedUnavailable =
      newCalEventLockDate && !currentUnavailable.includes(targetDateStr)
        ? [...currentUnavailable, targetDateStr]
        : currentUnavailable;

    applyImmediateVendorUpdate((prev) => ({
      ...prev,
      googleEvents: [...existingEvents, newEvent],
      unavailableDates: updatedUnavailable,
    }));

    setShowAddCalendarEventForm(false);
    setNewCalEventTitle('');
    setNewCalEventNotes('');
    showNotification('Event added to calendar!', 'success');
  };

  const handleDeleteCustomCalendarEvent = (eventId: string) => {
    const existingEvents = latestEditFormRef.current.googleEvents || vendor.googleEvents || [];
    const updatedEvents = existingEvents.filter((e) => e.id !== eventId);
    applyImmediateVendorUpdate((prev) => ({
      ...prev,
      googleEvents: updatedEvents,
    }));
    showNotification('Calendar event removed.', 'info');
  };

  const openClientChatFromCalendar = (clientEmail?: string, clientName?: string, clientUid?: string) => {
    setSelectedCalendarDate(null);
    setSelectedCalendarEvent(null);
    setShowAddCalendarEventForm(false);

    const emailClean = (clientEmail || '').trim();
    const emailLower = emailClean.toLowerCase();
    const matchedThread = messageThreads.find(([tKey, tData]) => {
      if (clientUid && tData.clientUid === clientUid) return true;
      if (emailLower && tData.email && tData.email.toLowerCase() === emailLower) return true;
      if (emailLower && tKey.toLowerCase() === emailLower) return true;
      return false;
    });

    if (matchedThread) {
      const [tKey, tData] = matchedThread;
      const conId =
        tData.conversationId ||
        tData.lastMessage?.conversationId ||
        [vendor.id, tData.clientUid || tKey].sort().filter(Boolean).join('_');
      setSelectedThreadContext({
        key: tKey,
        clientUid: tData.clientUid || tKey,
        email: tData.email || emailClean,
        name: tData.name || clientName || 'Client',
        conversationId: conId,
      });
      setSelectedThreadEmail(tKey);
    } else {
      const dirEntry = emailLower ? clientDirectoryMap[emailLower] : undefined;
      const targetUid = clientUid || dirEntry?.uid || emailClean || 'client_legacy';
      const conId = [vendor.id, targetUid].sort().filter(Boolean).join('_');
      setSelectedThreadContext({
        key: targetUid,
        clientUid: targetUid,
        email: emailClean,
        name: clientName || dirEntry?.name || 'Client',
        conversationId: conId,
      });
      setSelectedThreadEmail(targetUid);
    }
  };

  // Memoized clean Google events (excludes any legacy imported "Simcha Booking: ..." duplicates)
  const reconciledCalendarGoogleEvents = useMemo(() => {
    const rawEvents = editForm.googleEvents || vendor.googleEvents || [];
    const syncMap = editForm.googleCalendarSyncMap || vendor.googleCalendarSyncMap;
    return reconcileVendorGoogleEvents({
      existingVendorEvents: rawEvents,
      bookings,
      syncMap,
    });
  }, [editForm.googleEvents, vendor.googleEvents, editForm.googleCalendarSyncMap, vendor.googleCalendarSyncMap, bookings]);

  // Automatically persist cleaned googleEvents if legacy Simcha Booking duplicate entries exist in state
  useEffect(() => {
    const rawEvents = editForm.googleEvents || vendor.googleEvents || [];
    if (rawEvents.length > 0 && reconciledCalendarGoogleEvents.length < rawEvents.length) {
      applyImmediateVendorUpdate((prev) => ({
        ...prev,
        googleEvents: reconciledCalendarGoogleEvents,
      }));
    }
  }, [reconciledCalendarGoogleEvents.length]);

  const renderCalendar = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const monthName = viewDate.toLocaleString('default', { month: 'long' });
    const todayStr = new Date().toLocaleDateString('en-CA');

    const startOfWeek = new Date(viewDate);
    startOfWeek.setDate(viewDate.getDate() - viewDate.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const weekStartName = startOfWeek.toLocaleString('default', { month: 'short', day: 'numeric' });
    const weekEndName = endOfWeek.toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric' });

    const currentUnavailableDates = editForm.unavailableDates || vendor.unavailableDates || [];
    const allCalendarGoogleEvents = reconciledCalendarGoogleEvents;

    // Calculate trailing pad cells so the month grid always forms complete 7-column weeks
    const totalCells = firstDay + daysInMonth;
    const trailingPadCount = (7 - (totalCells % 7)) % 7;

    const calendarDays: React.ReactNode[] = [];

    for (let i = 0; i < firstDay; i++) {
      calendarDays.push(
        <div
          key={`pad-start-${i}`}
          aria-hidden="true"
          className="simcha-cal-pad min-h-[76px] sm:min-h-[96px] md:min-h-[112px] bg-[#080808] border-b border-r border-white/[0.06]"
        />
      );
    }

    const MAX_MONTH_VISIBLE_EVENTS = 3;

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = date.toLocaleDateString('en-CA');
      const isBlocked = currentUnavailableDates.includes(dateStr);
      const isToday = dateStr === todayStr;
      const isSelectedDay = selectedCalendarDate === dateStr;

      const dailyBookings = bookings.filter((b) => b.date === dateStr && b.status !== 'cancelled');
      const dailyGoogleEvents = allCalendarGoogleEvents.filter((e) => {
        const eventDates = getDatesForEventRange(e.start, e.end);
        return eventDates.includes(dateStr);
      });

      type UnifiedDayItem =
        | { kind: 'booking'; id: string; booking: Booking }
        | { kind: 'google'; id: string; event: (typeof allCalendarGoogleEvents)[number] };

      const combinedItems: UnifiedDayItem[] = [
        ...dailyBookings.map((b) => ({ kind: 'booking' as const, id: `b-${b.id}`, booking: b })),
        ...dailyGoogleEvents.map((e) => ({ kind: 'google' as const, id: `g-${e.id}`, event: e })),
      ];

      const visibleItems = combinedItems.slice(0, MAX_MONTH_VISIBLE_EVENTS);
      const overflowCount = Math.max(0, combinedItems.length - MAX_MONTH_VISIBLE_EVENTS);

      calendarDays.push(
        <div
          key={dateStr}
          onClick={() => openCalendarDateSheet(dateStr, false)}
          role="button"
          tabIndex={0}
          aria-label={`${monthName} ${day}, ${year}${isBlocked ? ', Date locked' : ''}${
            combinedItems.length > 0 ? `, ${combinedItems.length} event${combinedItems.length === 1 ? '' : 's'}` : ''
          }`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openCalendarDateSheet(dateStr, false);
            }
          }}
          className={`simcha-cal-day min-h-[76px] sm:min-h-[96px] md:min-h-[112px] border-b border-r border-white/[0.07] p-1 sm:p-1.5 transition-colors cursor-pointer relative group flex flex-col justify-start select-none outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-inset ${
            isToday
              ? 'simcha-cal-day-today bg-[#141109] hover:bg-[#19150b]'
              : 'bg-[#0b0b0b] hover:bg-[#121212]'
          } ${isSelectedDay ? 'simcha-cal-day-selected ring-1 ring-[#D4AF37] ring-inset' : ''}`}
        >
          {/* Day Header: Number + Unframed Understated Lock Indicator */}
          <div className="flex items-center justify-between gap-1 px-0.5 mb-1">
            <span
              className={`inline-flex items-center justify-center text-[11px] sm:text-xs font-semibold leading-none transition-colors ${
                isToday
                  ? 'simcha-cal-today-num w-5 h-5 sm:w-5.5 sm:h-5.5 rounded-full bg-[#D4AF37] text-black font-bold'
                  : 'simcha-cal-day-num text-zinc-200 group-hover:text-[#D4AF37]'
              }`}
            >
              {day}
            </span>

            {isBlocked && (
              <span
                className="simcha-cal-lock-icon inline-flex items-center gap-0.5 text-zinc-400"
                title="Date locked"
                aria-label="Date locked"
              >
                <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
              </span>
            )}
          </div>

          {/* Flat Event Rows */}
          <div className="flex-1 flex flex-col gap-0.5 min-w-0">
            {visibleItems.map((item) => {
              if (item.kind === 'booking') {
                const b = item.booking;
                const isConfirmed = b.status === 'confirmed';
                const statusTag = isConfirmed ? 'Conf' : 'Pend';
                const timeStr = b.eventTime ? formatBookingTime12h(b.eventTime) : '';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      handleSimchaBookingClick(b);
                    }}
                    className={`simcha-cal-event w-full text-left px-1 sm:px-1.5 py-0.5 rounded-[3px] border-l-2 text-[9px] sm:text-[10px] leading-tight truncate transition-colors cursor-pointer ${
                      isConfirmed
                        ? 'simcha-cal-event-confirmed bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-500 text-zinc-100'
                        : 'simcha-cal-event-pending bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border-[#D4AF37] text-zinc-100'
                    }`}
                    title={`${statusTag}: ${b.eventName || b.clientName}${timeStr ? ` (${timeStr})` : ''}`}
                  >
                    <span className="font-bold uppercase tracking-tight mr-1 opacity-85">{statusTag}</span>
                    {timeStr && <span className="hidden md:inline font-mono text-[8px] opacity-80 mr-1">{timeStr}</span>}
                    <span className="font-medium">{b.eventName || b.clientName}</span>
                  </button>
                );
              }

              const e = item.event;
              const isCustom = Boolean(e.isCustom || String(e.id).startsWith('custom_'));
              const timeLabel = formatGoogleEventTime(e.start, e.end);
              const shortTime = timeLabel && timeLabel !== 'All Day' ? timeLabel.split(' - ')[0] : '';

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    handleGoogleEventClick(e);
                  }}
                  className="simcha-cal-event simcha-cal-event-ext w-full text-left px-1 sm:px-1.5 py-0.5 rounded-[3px] border-l-2 border-[#D4AF37]/70 bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 text-[9px] sm:text-[10px] leading-tight truncate transition-colors cursor-pointer"
                  title={`${isCustom ? 'Event' : 'Google'}: ${e.summary || 'Busy'}${timeLabel ? ` (${timeLabel})` : ''}`}
                >
                  {shortTime ? (
                    <span className="hidden sm:inline font-mono text-[8px] opacity-75 mr-1">{shortTime}</span>
                  ) : (
                    <span className="font-semibold uppercase tracking-tight mr-1 opacity-75">
                      {isCustom ? 'Evt' : 'Cal'}
                    </span>
                  )}
                  <span className="font-medium">{e.summary || 'Busy'}</span>
                </button>
              );
            })}

            {overflowCount > 0 && (
              <span className="simcha-cal-more px-1 text-[9px] font-bold text-[#D4AF37] leading-tight truncate">
                +{overflowCount} more
              </span>
            )}
          </div>
        </div>
      );
    }

    for (let i = 0; i < trailingPadCount; i++) {
      calendarDays.push(
        <div
          key={`pad-end-${i}`}
          aria-hidden="true"
          className="simcha-cal-pad min-h-[76px] sm:min-h-[96px] md:min-h-[112px] bg-[#080808] border-b border-r border-white/[0.06]"
        />
      );
    }

    // Week View Columns
    const weekDays: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(startOfWeek);
      dayDate.setDate(startOfWeek.getDate() + i);
      weekDays.push(dayDate);
    }

    const weekDaysGrid = weekDays.map((dayDate) => {
      const dateStr = dayDate.toLocaleDateString('en-CA');
      const isBlocked = currentUnavailableDates.includes(dateStr);
      const isToday = dateStr === todayStr;
      const isSelectedDay = selectedCalendarDate === dateStr;
      const dayBookings = bookings.filter((b) => b.date === dateStr && b.status !== 'cancelled');
      const dailyGoogleEvents = allCalendarGoogleEvents.filter((e) => {
        const eventDates = getDatesForEventRange(e.start, e.end);
        return eventDates.includes(dateStr);
      });
      const dayName = dayDate.toLocaleString('default', { weekday: 'short' });
      const dayNum = dayDate.getDate();

      return (
        <div
          key={dateStr}
          onClick={() => openCalendarDateSheet(dateStr, false)}
          role="button"
          tabIndex={0}
          aria-label={`${dayName} ${dayNum}${isBlocked ? ', Date locked' : ''}`}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openCalendarDateSheet(dateStr, false);
            }
          }}
          className={`simcha-cal-day min-h-[260px] sm:min-h-[320px] border-r border-b border-white/[0.07] flex flex-col transition-colors cursor-pointer relative group select-none outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-inset ${
            isToday
              ? 'simcha-cal-day-today bg-[#141109] hover:bg-[#19150b]'
              : 'bg-[#0b0b0b] hover:bg-[#121212]'
          } ${isSelectedDay ? 'simcha-cal-day-selected ring-1 ring-[#D4AF37] ring-inset' : ''}`}
        >
          {/* Weekday Column Header */}
          <div className="simcha-cal-week-col-header px-1.5 py-2 border-b border-white/[0.07] flex items-center justify-between bg-[#0f0f0f]">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[9px] font-bold uppercase text-zinc-400 tracking-wider">{dayName}</span>
              <span
                className={`inline-flex items-center justify-center text-[11px] font-bold ${
                  isToday
                    ? 'simcha-cal-today-num w-5 h-5 rounded-full bg-[#D4AF37] text-black'
                    : 'simcha-cal-day-num text-zinc-200'
                }`}
              >
                {dayNum}
              </span>
            </div>
            {isBlocked && (
              <span
                className="simcha-cal-lock-icon text-zinc-400"
                title="Date locked"
                aria-label="Date locked"
              >
                <Lock className="w-3 h-3 shrink-0" />
              </span>
            )}
          </div>

          {/* Weekday Events List */}
          <div className="flex-1 p-1 sm:p-1.5 space-y-1 flex flex-col justify-start">
            {dayBookings.map((b) => {
              const isConfirmed = b.status === 'confirmed';
              const statusTag = isConfirmed ? 'Conf' : 'Pend';
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSimchaBookingClick(b);
                  }}
                  className={`simcha-cal-event w-full text-left p-1.5 rounded-[4px] border-l-2 transition-colors cursor-pointer space-y-0.5 ${
                    isConfirmed
                      ? 'simcha-cal-event-confirmed bg-emerald-950/40 hover:bg-emerald-900/50 border-emerald-500 text-zinc-100'
                      : 'simcha-cal-event-pending bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border-[#D4AF37] text-zinc-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 text-[8px] font-bold uppercase tracking-wider opacity-85">
                    <span>{statusTag}</span>
                    {b.eventTime && <span className="font-mono">{formatBookingTime12h(b.eventTime)}</span>}
                  </div>
                  <div className="text-[10px] sm:text-[11px] font-semibold truncate">{b.eventName || 'Celebration'}</div>
                  <div className="text-[9px] opacity-75 truncate">{b.clientName}</div>
                </button>
              );
            })}

            {dailyGoogleEvents.map((e) => {
              const timeLabel = formatGoogleEventTime(e.start, e.end);
              const isCustom = Boolean(e.isCustom || String(e.id).startsWith('custom_'));
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    handleGoogleEventClick(e);
                  }}
                  className="simcha-cal-event simcha-cal-event-ext w-full text-left p-1.5 rounded-[4px] border-l-2 border-[#D4AF37]/70 bg-white/[0.05] hover:bg-white/[0.1] text-zinc-200 transition-colors cursor-pointer space-y-0.5"
                >
                  <div className="flex items-center justify-between gap-1 text-[8px] font-bold uppercase tracking-wider opacity-75">
                    <span>{isCustom ? 'Event' : 'Google'}</span>
                    {timeLabel && <span className="font-mono truncate">{timeLabel}</span>}
                  </div>
                  <div className="text-[10px] sm:text-[11px] font-semibold truncate">{e.summary || 'Busy'}</div>
                </button>
              );
            })}
          </div>
        </div>
      );
    });

    return (
      <div className="simcha-cal-shell bg-[#0b0b0b] rounded-xl border border-white/10 shadow-xl overflow-hidden w-full">
        {/* Top Calendar Toolbar: Aligned Rows on Mobile, Single Cohesive Toolbar on Desktop */}
        <div className="simcha-cal-toolbar px-2.5 py-2 sm:px-4 sm:py-2.5 bg-[#111] border-b border-white/10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
          {/* Row 1 on Mobile / Left Group on Desktop: Title + Prev/Today/Next + Month/Week */}
          <div className="flex items-center justify-between lg:justify-start gap-2 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="simcha-cal-title text-sm sm:text-base md:text-lg font-bold font-[Cinzel] text-white tracking-tight truncate">
                {calendarViewMode === 'month' ? `${monthName} ${year}` : `${weekStartName} – ${weekEndName}`}
              </h2>
              <div className="simcha-cal-control-group h-7 sm:h-8 bg-black/70 rounded-full p-0.5 border border-white/10 flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => changeMonth(-1)}
                  className="simcha-cal-nav-btn w-6 h-6 sm:w-7 sm:h-7 rounded-full hover:bg-[#D4AF37] text-zinc-300 hover:text-black flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Previous period"
                  title="Previous"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewDate(new Date())}
                  className="simcha-cal-today-btn px-2.5 h-6 sm:h-7 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#D4AF37] hover:bg-[#D4AF37]/15 transition-colors cursor-pointer"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => changeMonth(1)}
                  className="simcha-cal-nav-btn w-6 h-6 sm:w-7 sm:h-7 rounded-full hover:bg-[#D4AF37] text-zinc-300 hover:text-black flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Next period"
                  title="Next"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Month / Week Segmented Switch */}
            <div className="simcha-cal-control-group h-7 sm:h-8 bg-black/70 rounded-full p-0.5 border border-white/10 flex items-center shrink-0">
              <button
                type="button"
                onClick={() => setCalendarViewMode('month')}
                className={`px-3 h-6 sm:h-7 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  calendarViewMode === 'month'
                    ? 'bg-[#D4AF37] text-black font-black'
                    : 'simcha-cal-seg-inactive text-zinc-400 hover:text-white'
                }`}
              >
                Month
              </button>
              <button
                type="button"
                onClick={() => setCalendarViewMode('week')}
                className={`px-3 h-6 sm:h-7 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  calendarViewMode === 'week'
                    ? 'bg-[#D4AF37] text-black font-black'
                    : 'simcha-cal-seg-inactive text-zinc-400 hover:text-white'
                }`}
              >
                Week
              </button>
            </div>
          </div>

          {/* Row 2 on Mobile / Right Group on Desktop: Add Event + Google Sync */}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => openCalendarDateSheet(selectedCalendarDate || todayStr, true)}
              className="simcha-cal-action-btn flex-1 sm:flex-initial h-7 sm:h-8 px-3.5 rounded-full bg-black/70 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border border-[#D4AF37]/40 font-bold text-[9px] sm:text-[10px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.25] shrink-0" />
              <span>Add Event</span>
            </button>

            <button
              type="button"
              onClick={handleCalendarSync}
              disabled={isSyncing}
              className={`flex-1 sm:flex-initial h-7 sm:h-8 px-3.5 rounded-full font-bold flex items-center justify-center gap-1.5 text-[9px] sm:text-[10px] uppercase tracking-wider transition-colors cursor-pointer border ${
                syncStep === 'success'
                  ? 'bg-emerald-500 text-black border-emerald-400'
                  : 'bg-[#D4AF37] hover:bg-[#E5C76B] text-black border-[#D4AF37]'
              } ${isSyncing ? 'opacity-70 pointer-events-none' : ''}`}
            >
              {isSyncing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-black shrink-0" />
              ) : syncStep === 'success' ? (
                <Check className="w-3.5 h-3.5 text-black shrink-0" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>
                {syncStep === 'idle' && 'Google Sync'}
                {syncStep === 'auth' && 'Authenticating...'}
                {syncStep === 'fetching' && 'Syncing...'}
                {syncStep === 'saving' && 'Saving...'}
                {syncStep === 'success' && 'Synced'}
              </span>
            </button>
          </div>
        </div>

        {/* Dismissible Sync Error Banner */}
        {calendarSyncError && (
          <div className="mx-3 my-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="text-[11px] text-red-200 font-medium truncate">{calendarSyncError}</span>
            </div>
            <button
              type="button"
              onClick={() => setCalendarSyncError(null)}
              className="text-[9px] font-bold uppercase tracking-wider text-zinc-300 hover:text-white px-2 py-1 rounded bg-white/5 shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 7-Column Calendar Grid */}
        <div className="w-full overflow-x-auto custom-scrollbar">
          <div className="w-full min-w-[300px]">
            {calendarViewMode === 'month' && (
              <div className="simcha-cal-weekdays grid grid-cols-7 bg-[#111] border-b border-white/10 divide-x divide-white/[0.06]">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div
                    key={d}
                    className="simcha-cal-weekday py-1.5 text-center text-[10px] font-bold uppercase text-[#D4AF37] tracking-wider"
                  >
                    {d}
                  </div>
                ))}
              </div>
            )}

            <div className="simcha-cal-grid grid grid-cols-7 border-l border-white/[0.07]">
              {calendarViewMode === 'month' ? calendarDays : weekDaysGrid}
            </div>
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

      {/* Unified Drag-Dismiss Day Inspector & Event Manager Sheet (Opens when tapping any date on the calendar) */}
      {selectedCalendarDate && (() => {
        const currentUnavailable = editForm.unavailableDates || vendor.unavailableDates || [];
        const isDateLocked = currentUnavailable.includes(selectedCalendarDate);
        const dayBookings = bookings.filter((b) => b.date === selectedCalendarDate);
        const allGoogleEvents = reconciledCalendarGoogleEvents;
        const dayGoogleEvents = allGoogleEvents.filter((e) => {
          const eventDates = getDatesForEventRange(e.start, e.end);
          return eventDates.includes(selectedCalendarDate);
        });

        const formattedDateTitle = parseDateTimeFriendly(selectedCalendarDate);
        const bookedClientEmails = new Set(
          dayBookings.map((b) => (b.contactEmail || '').trim().toLowerCase()).filter(Boolean)
        );
        const bookedClientUids = new Set(
          dayBookings.map((b) => b.userId || b.clientId || '').filter(Boolean)
        );

        const dayMatchedThreads = messageThreads.filter(([tKey, tData]) => {
          if (tData.clientUid && bookedClientUids.has(tData.clientUid)) return true;
          if (tData.email && bookedClientEmails.has(tData.email.toLowerCase())) return true;
          if (bookedClientEmails.has(tKey.toLowerCase())) return true;
          return tData.messages.some((m) => m.text && m.text.includes(selectedCalendarDate));
        });

        const threadsToShow = dayMatchedThreads.length > 0 ? dayMatchedThreads : messageThreads.slice(0, 3);

        return (
          <VendorSettingSheetModal
            title={formattedDateTitle}
            subtitle={isDateLocked ? 'Locked for bookings' : 'Available for bookings'}
            badgeText={isDateLocked ? 'Locked' : 'Available'}
            icon={CalendarDays}
            onClose={() => {
              setSelectedCalendarDate(null);
              setShowAddCalendarEventForm(false);
            }}
          >
            {/* 1. COMPACT LOCK/UNLOCK + ADD EVENT PILL BAR */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  handleToggleDate(selectedCalendarDate);
                  showNotification(
                    isDateLocked ? 'Date unlocked & open for bookings!' : 'Date locked & marked unavailable.',
                    'info'
                  );
                }}
                className={`h-8 px-3 rounded-full font-black text-[8px] uppercase tracking-widest border transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm ${
                  isDateLocked
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-200 border-red-500/45'
                    : 'bg-[#151515] hover:bg-white/10 text-white border-[#D4AF37]/40'
                }`}
              >
                {isDateLocked ? (
                  <>
                    <Unlock className="w-3 h-3 text-red-300 shrink-0" />
                    <span className="truncate">Unlock Date</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3 h-3 text-[#D4AF37] shrink-0" />
                    <span className="truncate">Lock Date</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowAddCalendarEventForm((prev) => !prev)}
                className={`h-8 px-3 rounded-full font-black text-[8px] uppercase tracking-widest border transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm ${
                  showAddCalendarEventForm
                    ? 'bg-zinc-900 text-zinc-200 border-white/20'
                    : 'bg-[#D4AF37] hover:bg-[#E5C76B] text-black border-[#D4AF37]'
                }`}
              >
                {showAddCalendarEventForm ? (
                  <>
                    <X className="w-3 h-3 shrink-0" />
                    <span className="truncate">Cancel</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3 h-3 stroke-[2.5] shrink-0" />
                    <span className="truncate">Add Event</span>
                  </>
                )}
              </button>
            </div>

            {/* 2. INLINE ADD CUSTOM EVENT FORM */}
            <AnimatePresence initial={false}>
              {showAddCalendarEventForm && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="bg-black/75 rounded-[1.5rem] border border-[#D4AF37]/60 p-3.5 space-y-2.5 text-left shadow-2xl"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-widest">
                      New Event
                    </span>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                      {selectedCalendarDate}
                    </span>
                  </div>

                  <input
                    type="text"
                    autoFocus
                    value={newCalEventTitle}
                    onChange={(e) => setNewCalEventTitle(e.target.value)}
                    placeholder="Event title (e.g. Friedman Wedding)..."
                    className="w-full h-9 bg-[#111] border border-[#D4AF37]/35 focus:border-[#D4AF37] rounded-full px-3.5 text-xs font-bold text-white outline-none"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newCalEventStart}
                      onChange={(e) => setNewCalEventStart(e.target.value)}
                      placeholder="Start (6:00 PM)"
                      className="w-full h-9 bg-[#111] border border-white/15 focus:border-[#D4AF37] rounded-full px-3.5 text-xs font-bold text-white outline-none"
                    />
                    <input
                      type="text"
                      value={newCalEventEnd}
                      onChange={(e) => setNewCalEventEnd(e.target.value)}
                      placeholder="End (10:00 PM)"
                      className="w-full h-9 bg-[#111] border border-white/15 focus:border-[#D4AF37] rounded-full px-3.5 text-xs font-bold text-white outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newCalEventLocation}
                      onChange={(e) => setNewCalEventLocation(e.target.value)}
                      placeholder="Location (optional)..."
                      className="w-full h-9 bg-[#111] border border-white/15 focus:border-[#D4AF37] rounded-full px-3.5 text-xs font-semibold text-white outline-none"
                    />
                    <input
                      type="text"
                      value={newCalEventNotes}
                      onChange={(e) => setNewCalEventNotes(e.target.value)}
                      placeholder="Notes (optional)..."
                      className="w-full h-9 bg-[#111] border border-white/15 focus:border-[#D4AF37] rounded-full px-3.5 text-xs font-semibold text-white outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1 gap-3">
                    <button
                      type="button"
                      onClick={() => setNewCalEventLockDate((prev) => !prev)}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-300 cursor-pointer"
                    >
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                          newCalEventLockDate ? 'bg-[#D4AF37] border-[#D4AF37] text-black' : 'border-white/25'
                        }`}
                      >
                        {newCalEventLockDate && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </span>
                      <span>Lock date</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAddCustomCalendarEvent(selectedCalendarDate)}
                      className="h-8 px-4 rounded-full bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black text-[9px] uppercase tracking-widest transition-all cursor-pointer shadow-md flex items-center gap-1"
                    >
                      <Check className="w-3 h-3 stroke-[2.5]" />
                      <span>Save Event</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 3. COMPACT SCHEDULED EVENTS (Tapping any event pops it up immediately) */}
            <div className="space-y-1.5 text-left">
              <div className="px-2 flex items-center justify-between">
                <span className="text-[10px] font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.2em]">
                  Scheduled Events
                </span>
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                  Tap to view
                </span>
              </div>

              {dayBookings.length === 0 && dayGoogleEvents.length === 0 ? (
                <div className="bg-black/40 rounded-full border border-dashed border-white/10 py-4 px-4 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    No events on this date
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {dayBookings.map((b) => {
                    const clientPhoto = getClientPhoto(b);
                    const initials = getClientInitials(b.clientName);
                    return (
                      <div
                        key={b.id}
                        onClick={() => handleSimchaBookingClick(b)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSimchaBookingClick(b);
                          }
                        }}
                        className="bg-black/70 hover:bg-[#161616] rounded-full border border-[#D4AF37]/35 hover:border-[#D4AF37] px-3.5 py-2.5 flex items-center justify-between gap-2.5 cursor-pointer transition-all group shadow-md"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {clientPhoto ? (
                            <img
                              src={clientPhoto}
                              alt={b.clientName}
                              className="w-8 h-8 rounded-full object-cover border border-[#D4AF37]/50 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] font-[Cinzel] font-bold text-[10px] shrink-0">
                              {initials}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white group-hover:text-[#D4AF37] truncate">
                                {b.eventName || b.clientName}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest border shrink-0 ${
                                  b.status === 'confirmed'
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : b.status === 'pending'
                                    ? 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/40'
                                    : 'bg-red-500/20 text-red-300 border-red-500/40'
                                }`}
                              >
                                {b.status}
                              </span>
                            </div>
                            <p className="text-[10px] text-zinc-400 truncate">
                              {b.clientName}
                              {b.eventTime ? ` • ${formatBookingTime12h(b.eventTime)}` : ''}
                              {` • $${b.amount.toLocaleString()}`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openClientChatFromCalendar(b.contactEmail, b.clientName, b.userId || b.clientId);
                            }}
                            className="h-7 px-2.5 rounded-full bg-[#D4AF37]/15 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border border-[#D4AF37]/40 text-[8px] font-black uppercase tracking-widest flex items-center gap-1 cursor-pointer transition-all"
                          >
                            <MessageSquare className="w-2.5 h-2.5" />
                            <span>Chat</span>
                          </button>
                          <ChevronRight className="w-3.5 h-3.5 text-[#D4AF37]" />
                        </div>
                      </div>
                    );
                  })}

                  {dayGoogleEvents.map((e) => {
                    const timeLabel = formatGoogleEventTime(e.start, e.end);
                    const isCustom = Boolean(e.isCustom || String(e.id).startsWith('custom_'));
                    return (
                      <div
                        key={e.id}
                        onClick={() => handleGoogleEventClick(e)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter' || ev.key === ' ') {
                            ev.preventDefault();
                            handleGoogleEventClick(e);
                          }
                        }}
                        className="bg-black/65 hover:bg-[#161616] rounded-full border border-white/15 hover:border-[#D4AF37]/50 px-3.5 py-2.5 flex items-center justify-between gap-2.5 cursor-pointer transition-all group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[7px] font-black uppercase tracking-widest text-[#D4AF37]">
                              {isCustom ? 'Custom' : 'Google'}
                            </span>
                            <span className="text-xs font-bold text-white group-hover:text-[#D4AF37] truncate">
                              {e.summary || 'Busy'}
                            </span>
                          </div>
                          {(timeLabel || e.location) && (
                            <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                              {timeLabel}
                              {timeLabel && e.location ? ' • ' : ''}
                              {e.location || ''}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {isCustom && (
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                handleDeleteCustomCalendarEvent(e.id);
                              }}
                              className="h-7 w-7 rounded-full bg-red-500/15 hover:bg-red-500 text-red-300 hover:text-white border border-red-500/30 flex items-center justify-center cursor-pointer transition-all"
                              title="Delete Event"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                          <ChevronRight className="w-3.5 h-3.5 text-[#D4AF37]" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. COMPACT CLIENT MESSAGES */}
            <div className="space-y-1.5 text-left">
              <div className="px-2 flex items-center justify-between">
                <span className="text-[10px] font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.2em]">
                  {dayMatchedThreads.length > 0 ? 'Date Messages' : 'Recent Chats'}
                </span>
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                  Tap to view
                </span>
              </div>

              {threadsToShow.length === 0 ? (
                <div className="bg-black/40 rounded-full border border-dashed border-white/10 py-4 px-4 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    No client messages yet
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {threadsToShow.map(([tKey, tData]) => {
                    const clientPhoto = getThreadClientPhoto(tData.email || tKey, tData.clientUid);
                    const initials = getClientInitials(tData.name);
                    const unreadCount = tData.messages.filter(
                      (m) => m.receiverId === vendor.id && !m.isRead && !locallyReadVendorMsgIds.has(m.id)
                    ).length;

                    return (
                      <div
                        key={tKey}
                        onClick={() => openClientChatFromCalendar(tData.email || tKey, tData.name, tData.clientUid)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openClientChatFromCalendar(tData.email || tKey, tData.name, tData.clientUid);
                          }
                        }}
                        className="bg-black/70 hover:bg-[#161616] rounded-full border border-[#D4AF37]/30 hover:border-[#D4AF37] px-3.5 py-2 flex items-center justify-between gap-2.5 cursor-pointer transition-all group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {clientPhoto ? (
                            <img
                              src={clientPhoto}
                              alt={tData.name}
                              className="w-7 h-7 rounded-full object-cover border border-[#D4AF37]/40 shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] font-[Cinzel] font-bold text-[10px] shrink-0">
                              {initials}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-white group-hover:text-[#D4AF37] truncate">
                                {tData.name}
                              </span>
                              {unreadCount > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full bg-[#D4AF37] text-black text-[8px] font-black">
                                  {unreadCount}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-zinc-400 truncate">
                              {tData.lastMessage?.text || 'Tap to open conversation'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black text-[8px] font-black uppercase tracking-widest transition-all">
                            Chat
                          </span>
                          <ChevronRight className="w-3.5 h-3.5 text-[#D4AF37]" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </VendorSettingSheetModal>
        );
      })()}

      {/* In-App Stripe Payouts & Connection Management Sheet */}
      {showStripePayoutsModal && (() => {
        const paidBookings = sortedBookings.filter((b) => b.paymentStatus === 'paid');
        const grossPaid = paidBookings.reduce((sum, b) => sum + (b.amount || 0), 0);
        const commRate = vendor.commissionRate || 5;
        const netPaid = Math.round(grossPaid * (1 - commRate / 100));
        const pendingTotal = sortedBookings
          .filter((b) => b.status === 'pending')
          .reduce((sum, b) => sum + (b.amount || 0), 0);

        return (
          <VendorSettingSheetModal
            title="Stripe Payouts"
            subtitle="In-app payout overview & Stripe Express management"
            badgeText={vendor.stripeConnected ? 'Stripe Active' : 'Payout Setup'}
            icon={CreditCard}
            onClose={() => {
              setShowStripePayoutsModal(false);
              setConfirmResetStripe(false);
            }}
          >
            {/* 1. Connection Status & Express Portal Pill Bar */}
            <div className="bg-black/70 rounded-[1.5rem] border border-[#D4AF37]/35 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-bold text-white truncate">
                      Stripe Express Connected
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[8px] font-black uppercase tracking-widest text-emerald-300">
                      Active
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 font-mono truncate mt-0.5">
                    {vendor.stripeAccountId ? `Account: ${vendor.stripeAccountId}` : 'Direct payouts enabled'} • {100 - commRate}% Vendor Share
                  </p>
                </div>
              </div>

              {vendor.stripeAccountId && (
                <button
                  type="button"
                  onClick={handleStripeDashboard}
                  disabled={isOnboarding}
                  className="h-9 px-3.5 rounded-full bg-[#D4AF37] hover:bg-[#E5C76B] text-black text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-all shadow-md"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Stripe Portal</span>
                </button>
              )}
            </div>

            {/* 2. Even 3-Card Payout Summary Grid */}
            <div className="grid grid-cols-3 gap-2.5 text-left">
              <div className="bg-black/60 rounded-[1.35rem] border border-[#D4AF37]/25 p-3">
                <p className="text-[8px] font-black uppercase tracking-widest text-zinc-400 truncate">Gross Paid</p>
                <p className="text-base sm:text-lg font-bold font-[Cinzel] text-white tabular-nums mt-0.5">
                  ${grossPaid.toLocaleString()}
                </p>
              </div>
              <div className="bg-black/60 rounded-[1.35rem] border border-[#D4AF37]/40 p-3">
                <p className="text-[8px] font-black uppercase tracking-widest text-[#D4AF37] truncate">Net Payout</p>
                <p className="text-base sm:text-lg font-bold font-[Cinzel] text-[#D4AF37] tabular-nums mt-0.5">
                  ${netPaid.toLocaleString()}
                </p>
              </div>
              <div className="bg-black/60 rounded-[1.35rem] border border-white/10 p-3">
                <p className="text-[8px] font-black uppercase tracking-widest text-zinc-400 truncate">Pipeline</p>
                <p className="text-base sm:text-lg font-bold font-[Cinzel] text-zinc-200 tabular-nums mt-0.5">
                  ${pendingTotal.toLocaleString()}
                </p>
              </div>
            </div>

            {/* 3. Recent Paid Bookings List */}
            <div className="space-y-2 text-left">
              <div className="px-2 flex items-center justify-between">
                <span className="text-[10px] font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.2em]">
                  Recent Payout Transactions
                </span>
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                  Tap to view
                </span>
              </div>

              {paidBookings.length === 0 ? (
                <div className="bg-black/40 rounded-[1.5rem] border border-dashed border-white/10 py-6 px-4 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    No completed card payouts yet
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                  {paidBookings.slice(0, 8).map((b) => {
                    const netAmt = Math.round((b.amount || 0) * (1 - commRate / 100));
                    return (
                      <div
                        key={b.id}
                        onClick={() => handleSimchaBookingClick(b)}
                        className="bg-black/65 hover:bg-[#161616] rounded-full border border-white/10 hover:border-[#D4AF37]/45 px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-all"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-white truncate">
                            {b.clientName} • {b.eventName || 'Celebration'}
                          </p>
                          <p className="text-[10px] text-zinc-400 truncate">{b.date}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-bold font-[Cinzel] text-emerald-400 tabular-nums">
                            +${netAmt.toLocaleString()}
                          </span>
                          <p className="text-[8px] text-zinc-500 uppercase tracking-widest">Paid</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Protected Reset Stripe Connection Section (Requires Explicit Confirmation) */}
            <div className="pt-2 border-t border-white/10 text-left">
              {!confirmResetStripe ? (
                <div className="flex items-center justify-between gap-3 px-2">
                  <span className="text-[10px] text-zinc-400">
                    Need to switch or reconnect your Stripe account?
                  </span>
                  <button
                    type="button"
                    onClick={() => setConfirmResetStripe(true)}
                    className="h-8 px-3.5 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all shrink-0"
                  >
                    Reset Stripe
                  </button>
                </div>
              ) : (
                <div className="bg-red-950/30 border border-red-500/45 rounded-[1.5rem] p-4 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-red-200">
                        Are you sure you want to reset your Stripe connection?
                      </h4>
                      <p className="text-[10px] text-red-300/80 mt-0.5 leading-relaxed">
                        Disconnecting Stripe will require completing the Stripe onboarding process again before you can receive payouts.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmResetStripe(false)}
                      className="h-8 px-4 rounded-full bg-white/10 hover:bg-white/15 text-zinc-200 text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleResetStripeConnection}
                      disabled={isOnboarding}
                      className="h-8 px-4 rounded-full bg-red-600 hover:bg-red-500 text-white text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all shadow-md"
                    >
                      Yes, Reset Stripe
                    </button>
                  </div>
                </div>
              )}
            </div>
          </VendorSettingSheetModal>
        );
      })()}

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
      <main className="flex-1 bg-[#050505] relative pb-36 md:pb-10 min-w-0">
        {activeTab !== 'calendar' && (
          <div className="px-4 pt-9 pb-1 md:px-10 md:pt-10 md:pb-2 max-w-3xl mx-auto w-full">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-lg md:text-2xl font-bold font-[Cinzel] text-white capitalize tracking-tight leading-none">{activeTab === 'bookings' ? 'Bookings' : activeTab}</h1>
                <p className="text-[#D4AF37]/60 text-[9px] font-black uppercase tracking-[0.4em] mt-1">{vendor.name}</p>
              </div>
              {activeTab === 'messages' && (
                <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                  Tap to view
                </span>
              )}
            </div>
          </div>
        )}

        <div
          className={
            activeTab === 'calendar'
              ? 'px-1 sm:px-2.5 md:px-4 pt-9 sm:pt-10 md:pt-6 pb-28 md:pb-10 w-full max-w-none'
              : 'px-4 pt-2 pb-4 md:px-10 md:pt-4 md:pb-10 max-w-7xl mx-auto space-y-6'
          }
        >
          {activeTab === 'overview' && (() => {
            const confirmedBookingsList = sortedBookings.filter(b => b.status === 'confirmed' || b.status === 'completed');
            const paidBookingsList = sortedBookings.filter(b => b.paymentStatus === 'paid');
            const paidRevenue = paidBookingsList.reduce((sum, b) => sum + (b.amount || 0), 0);
            const pendingRevenue = sortedBookings
              .filter(b => b.status === 'pending')
              .reduce((sum, b) => sum + (b.amount || 0), 0);
            const offerCount = sortedBookings.filter(
              b => b.status === 'pending' && (b.isOffer || (typeof b.offeredPrice === 'number' && b.offeredPrice > 0))
            ).length;
            const unreadChatsCount = messages.filter(
              m => m.receiverId === vendor.id && !m.isRead && !locallyReadVendorMsgIds.has(m.id)
            ).length;
            const downPaymentValue = editForm.downPayment ?? vendor.downPayment ?? 0;
            const avgBookingValue =
              confirmedBookingsList.length > 0
                ? Math.round(totalRevenue / confirmedBookingsList.length)
                : downPaymentValue;
            const packagesCount = (editForm.services || vendor.services || []).length;
            const showcaseCount = (editForm.gallery || vendor.gallery || []).length;

            return (
              <div className="max-w-3xl mx-auto w-full pb-20 space-y-5">
                {isLoading ? (
                  <div className="space-y-4 animate-in fade-in duration-350">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <ShimmerCard />
                      <ShimmerCard />
                      <ShimmerCard />
                      <ShimmerCard />
                    </div>
                    <ShimmerChart />
                    <ShimmerTable />
                  </div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="space-y-5"
                  >
                    {/* 1. EXECUTIVE STOREFRONT & STRIPE PAYOUT BAR */}
                    <div className="bg-[#111] rounded-[2rem] border border-[#D4AF37]/30 shadow-2xl p-4 sm:p-5 space-y-3 relative overflow-hidden">
                      {isOnboarding && (
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-md rounded-[2rem] flex flex-col items-center justify-center z-20 animate-in fade-in duration-200">
                          <Loader2 className="w-7 h-7 text-[#D4AF37] animate-spin mb-2" />
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#D4AF37]">
                            Connecting Stripe Express...
                          </p>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                        <div
                          onClick={() => setActiveTab('profile')}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setActiveTab('profile');
                            }
                          }}
                          className="flex items-center gap-3.5 min-w-0 flex-1 cursor-pointer group"
                        >
                          <div className="relative w-12 h-12 sm:w-13 sm:h-13 rounded-full overflow-hidden bg-black border-2 border-[#D4AF37]/50 shrink-0 shadow-lg">
                            <img src={editForm.image || vendor.image} alt={vendor.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          </div>
                          <div className="min-w-0 flex-1 text-left">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-[0.18em] bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/35">
                                <ShieldCheck className="w-2.5 h-2.5" /> Live Storefront
                              </span>
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-white/5 text-zinc-300 border border-white/10">
                                {vendor.category}
                              </span>
                            </div>
                            <h2 className="text-base sm:text-lg font-bold font-[Cinzel] text-white truncate mt-1 group-hover:text-[#D4AF37] transition-colors">
                              {editForm.name || vendor.name}
                            </h2>
                            <p className="text-[11px] text-zinc-400 font-medium truncate">
                              {downPaymentValue > 0
                                ? `Down Payment $${downPaymentValue.toLocaleString()}`
                                : editForm.location || vendor.location || 'Verified Simcha Vendor'}
                            </p>
                          </div>
                        </div>

                        {/* Even Symmetrical 2-Button Pill Bar (Stripe Payouts In-App Popup + Settings) */}
                        <div className="flex items-center gap-2 shrink-0">
                          {!vendor.stripeConnected ? (
                            <button
                              type="button"
                              onClick={handleStripeConnect}
                              disabled={isOnboarding}
                              className="h-8 px-3.5 rounded-full bg-[#D4AF37] hover:bg-[#E5C76B] text-black text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md"
                            >
                              <CreditCard className="w-3 h-3 shrink-0" />
                              <span className="truncate">Connect Stripe</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmResetStripe(false);
                                setShowStripePayoutsModal(true);
                              }}
                              disabled={isOnboarding}
                              className="h-8 px-3.5 rounded-full bg-[#D4AF37]/15 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border border-[#D4AF37]/40 text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                              <span className="truncate">Stripe Payouts</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setActiveTab('profile')}
                            className="h-8 px-3.5 rounded-full bg-black/70 hover:bg-[#D4AF37] text-zinc-200 hover:text-black border border-white/15 hover:border-[#D4AF37] text-[8px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                          >
                            <Settings className="w-3 h-3 shrink-0" />
                            <span className="truncate">Settings</span>
                          </button>
                        </div>
                      </div>

                      {stripeMessage && (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-full px-4 py-2 flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold text-emerald-300 truncate">{stripeMessage}</span>
                          <button type="button" onClick={() => setStripeMessage(null)} className="text-emerald-300/70 hover:text-emerald-200">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      {onboardingError && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 flex items-start justify-between gap-2">
                          <p className="text-[10px] font-bold text-red-300 leading-snug">{onboardingError}</p>
                          <button type="button" onClick={() => setOnboardingError(null)} className="text-red-300/70 hover:text-red-200 shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 2. EVEN 4-CARD LUXURY QUICK ACCESS GRID (No Cluttered Counts) */}
                    <div className="space-y-2">
                      <div className="px-4 flex items-center justify-between">
                        <span className="text-[10px] font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.22em]">
                          Executive Overview
                        </span>
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                          Tap to view
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                        {/* Card 1: Revenue */}
                        <button
                          type="button"
                          onClick={() => {
                            setStatusFilter('confirmed');
                            setActiveTab('bookings');
                          }}
                          className="bg-[#111] rounded-[1.75rem] border border-[#D4AF37]/25 hover:border-[#D4AF37] p-3.5 text-left transition-all cursor-pointer group shadow-xl flex flex-col justify-between min-h-[96px]"
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="w-8 h-8 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/35 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
                              <DollarSign className="w-3.5 h-3.5" />
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-[#D4AF37] transition-colors" />
                          </div>
                          <div className="mt-2.5">
                            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest truncate">Revenue</p>
                            <h3 className="text-lg sm:text-xl font-bold text-white font-[Cinzel] tabular-nums truncate mt-0.5">
                              ${totalRevenue.toLocaleString()}
                            </h3>
                          </div>
                        </button>

                        {/* Card 2: Bookings & Pipeline */}
                        <button
                          type="button"
                          onClick={() => {
                            setStatusFilter('pending');
                            setActiveTab('bookings');
                          }}
                          className="bg-[#111] rounded-[1.75rem] border border-[#D4AF37]/25 hover:border-[#D4AF37] p-3.5 text-left transition-all cursor-pointer group shadow-xl flex flex-col justify-between min-h-[96px]"
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="w-8 h-8 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/35 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
                              <Users className="w-3.5 h-3.5" />
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-[#D4AF37] transition-colors" />
                          </div>
                          <div className="mt-2.5">
                            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest truncate">Bookings</p>
                            <h3 className="text-base sm:text-lg font-bold text-white font-[Cinzel] truncate mt-0.5">
                              Requests
                            </h3>
                          </div>
                        </button>

                        {/* Card 3: Messages */}
                        <button
                          type="button"
                          onClick={() => setActiveTab('messages')}
                          className="bg-[#111] rounded-[1.75rem] border border-[#D4AF37]/25 hover:border-[#D4AF37] p-3.5 text-left transition-all cursor-pointer group shadow-xl flex flex-col justify-between min-h-[96px]"
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="w-8 h-8 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/35 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
                              <MessageSquare className="w-3.5 h-3.5" />
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-[#D4AF37] transition-colors" />
                          </div>
                          <div className="mt-2.5">
                            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest truncate">Messages</p>
                            <h3 className="text-base sm:text-lg font-bold text-white font-[Cinzel] truncate mt-0.5">
                              Client Inbox
                            </h3>
                          </div>
                        </button>

                        {/* Card 4: Calendar & Schedule */}
                        <button
                          type="button"
                          onClick={() => setActiveTab('calendar')}
                          className="bg-[#111] rounded-[1.75rem] border border-[#D4AF37]/25 hover:border-[#D4AF37] p-3.5 text-left transition-all cursor-pointer group shadow-xl flex flex-col justify-between min-h-[96px]"
                        >
                          <div className="flex items-center justify-between w-full">
                            <div className="w-8 h-8 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/35 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
                              <CalendarDays className="w-3.5 h-3.5" />
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-[#D4AF37] transition-colors" />
                          </div>
                          <div className="mt-2.5">
                            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest truncate">Schedule</p>
                            <h3 className="text-base sm:text-lg font-bold text-white font-[Cinzel] truncate mt-0.5">
                              Calendar
                            </h3>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* 3. COMPACT REVENUE & PIPELINE PULSE */}
                    <div className="bg-[#111] p-4 sm:p-5 rounded-[2rem] border border-[#D4AF37]/25 shadow-2xl space-y-3.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.22em]">
                            Revenue & Booking Pulse
                          </span>
                          <p className="text-[11px] text-zinc-400">
                            Monthly gross earnings & confirmed celebration velocity
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-3 py-1 rounded-full bg-black/60 border border-[#D4AF37]/30 text-[9px] font-black uppercase tracking-widest text-[#D4AF37] tabular-nums">
                            Avg ${avgBookingValue.toLocaleString()}
                          </span>
                          <span className="px-3 py-1 rounded-full bg-black/60 border border-white/10 text-[9px] font-black uppercase tracking-widest text-zinc-300 tabular-nums">
                            Pipeline ${pendingRevenue.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <div
                        ref={chartContainerRef}
                        className="w-full h-[145px] sm:h-[175px] relative bg-black/40 rounded-[1.5rem] p-2 border border-white/5"
                      >
                        <svg
                          width="100%"
                          height="100%"
                          viewBox={`0 0 ${chartSize.width} ${chartSize.height}`}
                          className="w-full h-full select-none"
                        >
                          <defs>
                            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.38" />
                              <stop offset="100%" stopColor="#D4AF37" stopOpacity="0.0" />
                            </linearGradient>
                          </defs>

                          {Array.from({ length: 3 }).map((_, index) => {
                            const ratio = index / 2;
                            const yVal = chartPoints.padding.top + ratio * chartPoints.chartH;
                            return (
                              <g key={index}>
                                <line
                                  x1={chartPoints.padding.left}
                                  y1={yVal}
                                  x2={chartPoints.padding.left + chartPoints.chartW}
                                  y2={yVal}
                                  style={{ stroke: 'rgba(255,255,255,0.04)', strokeWidth: 1 }}
                                />
                                <text
                                  x={chartPoints.padding.left - 10}
                                  y={yVal + 4}
                                  className="fill-zinc-500 text-[9px] font-mono text-right"
                                  textAnchor="end"
                                >
                                  ${Math.round(chartPoints.maxRevenue * (1 - ratio)).toLocaleString()}
                                </text>
                              </g>
                            );
                          })}

                          {chartPoints.areaPath && (
                            <path d={chartPoints.areaPath} fill="url(#chartGrad)" className="transition-all duration-500" />
                          )}
                          {chartPoints.linePath && (
                            <path d={chartPoints.linePath} fill="none" stroke="#D4AF37" strokeWidth={2.5} className="transition-all duration-500" />
                          )}

                          {chartPoints.points.map((p, idx) => (
                            <g key={idx} className="group/dot">
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r={4}
                                className="fill-[#D4AF37] stroke-black stroke-2 hover:scale-150 cursor-pointer transition-all duration-300"
                              />
                              <text
                                x={p.x}
                                y={p.y - 10}
                                className="fill-[#D4AF37] font-bold font-mono text-[9px] text-center hidden md:group-hover/dot:block"
                                textAnchor="middle"
                              >
                                ${p.data.revenue.toLocaleString()}
                              </text>
                            </g>
                          ))}

                          {chartPoints.points.map((p, idx) => {
                            const isOdd = idx % 2 !== 0;
                            return (
                              <text
                                key={idx}
                                x={p.x}
                                y={chartSize.height - 8}
                                className={`fill-zinc-400 text-[9px] font-black uppercase tracking-wider ${isOdd ? 'hidden sm:block' : ''}`}
                                textAnchor="middle"
                              >
                                {p.data.name}
                              </text>
                            );
                          })}
                        </svg>
                      </div>
                    </div>

                    {/* 4. UPCOMING BOOKINGS & REQUESTS (PILL-SHAPED CARDS WITH 'TAP TO VIEW') */}
                    <div className="space-y-2.5">
                      <div className="px-4 flex items-center justify-between">
                        <span className="text-[10px] font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.22em]">
                          Upcoming Bookings & Requests
                        </span>
                        <div className="flex items-center gap-2.5">
                          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                            Tap to view
                          </span>
                          <button
                            type="button"
                            onClick={() => setActiveTab('bookings')}
                            className="text-[9px] font-black uppercase tracking-widest text-[#D4AF37] hover:text-[#FFE885] transition-colors cursor-pointer"
                          >
                            View All →
                          </button>
                        </div>
                      </div>

                      {sortedBookings.slice(0, 3).length === 0 ? (
                        <div className="bg-[#111] rounded-full border border-dashed border-white/10 py-8 px-6 text-center">
                          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400">
                            No upcoming bookings yet
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {sortedBookings.slice(0, 3).map((b, idx) => {
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
                                  <div className="min-w-0 flex-1 text-left">
                                    <p className="font-bold text-sm text-white font-[Cinzel] group-hover:text-[#D4AF37] transition-colors truncate drop-shadow-sm">
                                      {b.clientName}
                                    </p>
                                    <div className="flex items-center gap-2 text-[10px] text-zinc-200/90 truncate mt-0.5">
                                      <span className="flex items-center gap-1 font-semibold text-white shrink-0">
                                        <Calendar className="w-2.5 h-2.5 text-[#D4AF37]" /> {b.date}
                                      </span>
                                      {b.eventTime && (
                                        <span className="flex items-center gap-1 text-zinc-300 truncate">
                                          <Clock className="w-2.5 h-2.5 text-[#D4AF37]" /> {formatBookingTime12h(b.eventTime)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="relative z-10 flex items-center gap-2 shrink-0">
                                  <span className="simcha-event-pill px-2.5 py-0.5 rounded-full text-[10px] font-bold text-[#D4AF37] font-[Cinzel] border border-[#D4AF37]/40 tabular-nums hidden xs:inline-block">
                                    ${(b.amount || 0).toLocaleString()}
                                  </span>
                                  <span
                                    className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
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
                          })}
                        </div>
                      )}
                    </div>

                    {/* 5. RECENT CLIENT INQUIRIES (PILL-SHAPED CARDS WITH 'TAP TO VIEW') */}
                    <div className="space-y-2.5">
                      <div className="px-4 flex items-center justify-between">
                        <span className="text-[10px] font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.22em]">
                          Recent Client Chats
                        </span>
                        <div className="flex items-center gap-2.5">
                          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                            Tap to view
                          </span>
                          <button
                            type="button"
                            onClick={() => setActiveTab('messages')}
                            className="text-[9px] font-black uppercase tracking-widest text-[#D4AF37] hover:text-[#FFE885] transition-colors cursor-pointer"
                          >
                            View All →
                          </button>
                        </div>
                      </div>

                      {messageThreads.slice(0, 3).length === 0 ? (
                        <div className="bg-[#111] rounded-full border border-dashed border-white/10 py-8 px-6 text-center">
                          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400">
                            No active client conversations
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {messageThreads.slice(0, 3).map(([threadKey, data], idx) => {
                            const unreadInThread = data.messages.filter(
                              m => m.receiverId === vendor.id && !m.isRead && !locallyReadVendorMsgIds.has(m.id)
                            ).length;
                            const clientPhoto = getThreadClientPhoto(data.email || threadKey, data.clientUid);
                            const initials = getClientInitials(data.name);
                            const lastMsg = data.lastMessage;

                            const handleOpenFromOverview = () => {
                              const conId =
                                data.conversationId ||
                                lastMsg.conversationId ||
                                [vendor.id, data.clientUid].sort().filter(Boolean).join('_');
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
                                key={`overview-chat-${threadKey}`}
                                role="button"
                                tabIndex={0}
                                onClick={handleOpenFromOverview}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleOpenFromOverview();
                                  }
                                }}
                                className={`simcha-event-card relative w-full overflow-hidden rounded-full border transition-all duration-300 cursor-pointer group flex items-center justify-between gap-3 px-5 sm:px-6 py-3 sm:py-3.5 min-h-[62px] shadow-xl active:scale-[0.99] ${
                                  unreadInThread > 0 || idx === 0
                                    ? 'border-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.15)]'
                                    : 'border-[#D4AF37]/35 hover:border-[#D4AF37]/80'
                                }`}
                              >
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
                                  <div className="min-w-0 flex-1 text-left">
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-sm text-white font-[Cinzel] group-hover:text-[#D4AF37] transition-colors truncate drop-shadow-sm">
                                        {data.name}
                                      </span>
                                      {unreadInThread > 0 && (
                                        <span className="bg-[#D4AF37] text-black text-[8px] font-black px-2 py-0.5 rounded-full shrink-0">
                                          {unreadInThread} New
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-zinc-200/90 truncate mt-0.5">
                                      {lastMsg.text || 'Media / Voice attachment'}
                                    </p>
                                  </div>
                                </div>

                                <div className="relative z-10 flex items-center gap-2 shrink-0">
                                  <span className="simcha-event-pill px-2.5 py-1 rounded-full text-[9px] font-bold text-zinc-100 border border-white/15">
                                    {new Date(lastMsg.timestamp).toLocaleDateString()}
                                  </span>
                                  <div className="w-7 h-7 rounded-full simcha-event-pill border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* 6. QUICK STOREFRONT & CALENDAR SHORTCUTS */}
                    <div className="space-y-2">
                      <div className="px-4 flex items-center justify-between">
                        <span className="text-[10px] font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.22em]">
                          Storefront & Availability Controls
                        </span>
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                          Tap to view
                        </span>
                      </div>

                      <div className="bg-[#111] rounded-[2rem] border border-[#D4AF37]/25 shadow-xl overflow-hidden divide-y divide-white/5">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('profile');
                            setActiveProfileSettingModal('locations');
                          }}
                          className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3.5 text-left hover:bg-white/[0.04] transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/35 flex items-center justify-center text-[#D4AF37] shrink-0">
                              <Layers className="w-4.5 h-4.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-white truncate">Locations, Base Packages & Add-ons</div>
                              <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                                Manage service areas, hourly rates & optional upgrades
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="w-7 h-7 rounded-full bg-black/50 border border-white/10 group-hover:border-[#D4AF37]/40 flex items-center justify-center text-zinc-400 group-hover:text-[#D4AF37] transition-all">
                              <ChevronRight className="w-4 h-4" />
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('profile');
                            setActiveProfileSettingModal('media');
                          }}
                          className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3.5 text-left hover:bg-white/[0.04] transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/35 flex items-center justify-center text-[#D4AF37] shrink-0">
                              <Film className="w-4.5 h-4.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-white truncate">Photos & Video Showcase</div>
                              <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                                Upload high-impact gallery photos & video links
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="w-7 h-7 rounded-full bg-black/50 border border-white/10 group-hover:border-[#D4AF37]/40 flex items-center justify-center text-zinc-400 group-hover:text-[#D4AF37] transition-all">
                              <ChevronRight className="w-4 h-4" />
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveTab('calendar')}
                          className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-3.5 text-left hover:bg-white/[0.04] transition-all cursor-pointer group"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/35 flex items-center justify-center text-[#D4AF37] shrink-0">
                              <CalendarDays className="w-4.5 h-4.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-white truncate">Availability Calendar & Google Sync</div>
                              <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                                Block unavailable dates & sync Google Calendar events
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="w-7 h-7 rounded-full bg-black/50 border border-white/10 group-hover:border-[#D4AF37]/40 flex items-center justify-center text-zinc-400 group-hover:text-[#D4AF37] transition-all">
                              <ChevronRight className="w-4 h-4" />
                            </div>
                          </div>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            );
          })()}

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

                {/* Centered Pill-Shaped Bookings List with 'Tap to view' Header */}
                <div className="space-y-2.5 w-full max-w-3xl mx-auto">
                  <div className="px-4 flex items-center justify-between">
                    <span className="text-[10px] font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.22em]">
                      {statusFilter === 'pending'
                        ? 'New Booking Requests'
                        : statusFilter === 'offers'
                        ? 'Client Price Offers'
                        : statusFilter === 'confirmed'
                        ? 'Confirmed Celebrations'
                        : 'Cancelled Requests'}
                    </span>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                      Tap to view
                    </span>
                  </div>
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
            <div className="space-y-2.5 animate-in fade-in duration-500 max-w-3xl mx-auto w-full">
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
            </div>
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
                  className={`w-full px-4 py-3 flex items-center justify-between gap-3 text-left transition-all ${
                    onClick ? 'hover:bg-white/[0.04] active:scale-[0.995] cursor-pointer group' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/35 flex items-center justify-center text-[#D4AF37] shrink-0 transition-transform group-hover:scale-105">
                      <RowIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs sm:text-sm font-bold text-white leading-tight truncate">{title}</div>
                      <div className="text-[10px] sm:text-[11px] text-zinc-400 font-medium leading-tight truncate mt-0.5">{subtitle}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 shrink-0">
                    {rightNode ? (
                      rightNode
                    ) : (
                      <>
                        {badge && (
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
                              badgeActive
                                ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-sm'
                                : 'bg-black/60 text-zinc-300 border-white/10 group-hover:border-[#D4AF37]/40'
                            }`}
                          >
                            {badge}
                          </span>
                        )}
                        <div className="w-6 h-6 rounded-full bg-black/50 border border-white/10 group-hover:border-[#D4AF37]/40 flex items-center justify-center text-zinc-400 group-hover:text-[#D4AF37] transition-all">
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </>
                    )}
                  </div>
                </Wrapper>
              );
            };

            const VendorToggleSwitch = ({
              checked,
              onChange,
              label,
            }: {
              checked: boolean;
              onChange: () => void;
              label: string;
            }) => (
              <button
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label}
                onClick={onChange}
                className={`relative inline-flex items-center h-5 w-9 shrink-0 cursor-pointer rounded-full border transition-all duration-200 ease-in-out outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${
                  checked
                    ? 'bg-[#D4AF37] border-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.3)]'
                    : 'bg-zinc-900 border-white/15'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow-sm transition-transform duration-200 ease-in-out ${
                    checked ? 'translate-x-4 bg-black' : 'translate-x-0.5 bg-zinc-400'
                  }`}
                />
              </button>
            );

            const renderServicesManager = (activeCategory: 'location' | 'amenities') => {
              const items = activeCategory === 'location' ? locationItems : addonItems;
              const isAddingHere = showAddForm && newServiceCategoryType === activeCategory;

              return (
                <div className="space-y-4">
                  {/* Category Pill Switcher + Add Option Pill (Single-Row Contained Pill Box) */}
                  <div className="grid grid-cols-3 items-center gap-1.5 sm:gap-2 bg-black/60 p-1.5 rounded-full border border-[#D4AF37]/30 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false);
                        setActiveProfileSettingModal('locations');
                      }}
                      className={`h-8 sm:h-9 px-2.5 sm:px-3 rounded-full text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer min-w-0 truncate ${
                        activeCategory === 'location'
                          ? 'bg-[#D4AF37] text-black shadow-md'
                          : 'text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">Locations</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false);
                        setActiveProfileSettingModal('addons');
                      }}
                      className={`h-8 sm:h-9 px-2.5 sm:px-3 rounded-full text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer min-w-0 truncate ${
                        activeCategory === 'amenities'
                          ? 'bg-[#D4AF37] text-black shadow-md'
                          : 'text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10'
                      }`}
                    >
                      <Layers className="w-3 h-3 shrink-0" />
                      <span className="truncate">Add-ons</span>
                    </button>

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
                      className={`h-8 sm:h-9 px-2.5 sm:px-3 rounded-full border transition-all cursor-pointer flex items-center justify-center gap-1 sm:gap-1.5 text-[9px] font-black uppercase tracking-wider min-w-0 truncate ${
                        isAddingHere
                          ? 'bg-zinc-900 text-zinc-200 border-zinc-500'
                          : 'bg-[#D4AF37]/15 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border-[#D4AF37]/50'
                      }`}
                    >
                      {isAddingHere ? <X className="w-3 h-3 shrink-0" /> : <Plus className="w-3 h-3 stroke-[2.5] shrink-0" />}
                      <span className="truncate">{isAddingHere ? 'Cancel' : `New ${activeCategory === 'location' ? 'Location' : 'Add-on'}`}</span>
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
              <div className="animate-in fade-in duration-500 max-w-2xl mx-auto pb-24 space-y-4">
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
                  className="bg-[#111] rounded-[2rem] border border-[#D4AF37]/30 shadow-2xl p-4 flex items-center justify-between gap-3.5 hover:border-[#D4AF37]/60 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        logoFileInputRef.current?.click();
                      }}
                      className="relative w-13 h-13 sm:w-14 sm:h-14 rounded-full overflow-hidden bg-black border-2 border-[#D4AF37]/50 shrink-0 shadow-lg group/avatar"
                      title="Tap to change portrait"
                    >
                      <img src={editForm.image} className="w-full h-full object-cover" alt={editForm.name} />
                      {typeof uploadProgresses['logo'] === 'number' ? (
                        <div className="absolute inset-0 bg-black/75 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 text-[#D4AF37] animate-spin" />
                        </div>
                      ) : (
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex items-center justify-center">
                          <Camera className="w-3.5 h-3.5 text-[#D4AF37]" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-[0.18em] bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30">
                          <ShieldCheck className="w-2.5 h-2.5" /> Vendor Profile
                        </span>
                      </div>
                      <h2 className="text-sm sm:text-base font-bold font-[Cinzel] text-white truncate mt-1">
                        {editForm.name || 'Vendor Business'}
                      </h2>
                      <p className="text-[11px] text-zinc-400 font-medium truncate">
                        {editForm.contactEmail || 'No email set'} {editForm.location ? `• ${editForm.location}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="hidden sm:inline-flex px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-black/60 text-[#D4AF37] border border-[#D4AF37]/30 group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
                      Edit
                    </span>
                    <div className="w-7 h-7 rounded-full bg-black/60 border border-white/10 group-hover:border-[#D4AF37]/50 flex items-center justify-center text-[#D4AF37] transition-all">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>

                {/* GROUP 1: STOREFRONT & PRICING */}
                <div className="space-y-1.5">
                  <div className="px-4 flex items-center justify-between">
                    <span className="text-[10px] font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.22em]">
                      Storefront & Pricing
                    </span>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                      Tap to view
                    </span>
                  </div>
                  <div className="bg-[#111] rounded-[1.75rem] border border-[#D4AF37]/25 shadow-xl overflow-hidden divide-y divide-white/5">
                    <SettingRow
                      icon={User}
                      title="Business Info & Bio"
                      subtitle="Name, photo, email, city & bio"
                      onClick={() => setActiveProfileSettingModal('basic')}
                    />
                    <SettingRow
                      icon={Globe}
                      title="Social Media Links"
                      subtitle="Instagram, TikTok, YouTube & website"
                      badge={
                        getVendorSocialItems(editForm.socialLinks).length > 0
                          ? `${getVendorSocialItems(editForm.socialLinks).length} Linked`
                          : 'Add'
                      }
                      badgeActive={getVendorSocialItems(editForm.socialLinks).length > 0}
                      onClick={() => setActiveProfileSettingModal('social')}
                    />
                    <SettingRow
                      icon={MapPin}
                      title="Locations & Packages"
                      subtitle="Service areas, base rates & hours"
                      onClick={() => {
                        setShowAddForm(false);
                        setActiveProfileSettingModal('locations');
                      }}
                    />
                    <SettingRow
                      icon={Layers}
                      title="Add-ons & Extras"
                      subtitle="Upgrades, photos & quantities"
                      onClick={() => {
                        setShowAddForm(false);
                        setActiveProfileSettingModal('addons');
                      }}
                    />
                    <SettingRow
                      icon={Film}
                      title="Media & Showcase"
                      subtitle="Photos, videos & showcase gallery"
                      onClick={() => setActiveProfileSettingModal('media')}
                    />
                  </div>
                </div>

                {/* GROUP 2: BOOKING RULES & PRIVACY */}
                <div className="space-y-1.5">
                  <div className="px-4 flex items-center justify-between">
                    <span className="text-[10px] font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.22em]">
                      Rules & Privacy
                    </span>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                      Tap to view
                    </span>
                  </div>
                  <div className="bg-[#111] rounded-[1.75rem] border border-[#D4AF37]/25 shadow-xl overflow-hidden divide-y divide-white/5">
                    <SettingRow
                      icon={DollarSign}
                      title="Custom Price Offers"
                      subtitle="Allow clients to propose offers"
                      badge={editForm.allowOffers ? 'On' : 'Off'}
                      badgeActive={Boolean(editForm.allowOffers)}
                      onClick={() => setActiveProfileSettingModal('offers')}
                    />
                    <SettingRow
                      icon={editForm.enableDateCheckLimit !== false ? Lock : Unlock}
                      title="Date Check Limit"
                      subtitle="Anti-spying date check cap"
                      badge={
                        editForm.enableDateCheckLimit !== false
                          ? `${editForm.maxDateChecks ?? 5} / ${editForm.dateCheckResetHours ?? 24}h`
                          : 'Off'
                      }
                      badgeActive={editForm.enableDateCheckLimit !== false}
                      onClick={() => setActiveProfileSettingModal('privacy')}
                    />
                  </div>
                </div>

                {/* GROUP 3: SYSTEM & PREFERENCES */}
                <div className="space-y-1.5">
                  <div className="px-4 flex items-center justify-between">
                    <span className="text-[10px] font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.22em]">
                      System & Preferences
                    </span>
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">
                      Tap to view
                    </span>
                  </div>
                  <div className="bg-[#111] rounded-[1.75rem] border border-[#D4AF37]/25 shadow-xl overflow-hidden divide-y divide-white/5">
                    {onToggleThemeMode && (
                      <SettingRow
                        icon={Eye}
                        title="Appearance"
                        subtitle="Dark or light luxury theme"
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
                      title="Test Email"
                      subtitle="Verify notification delivery"
                      badge="Test"
                      onClick={() => setActiveProfileSettingModal('email')}
                    />
                    <SettingRow
                      icon={LogOut}
                      title="Sign Out"
                      subtitle="End current vendor session"
                      badge="Exit"
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

                {activeProfileSettingModal === 'social' && (
                  <VendorSettingSheetModal
                    title="Social Media Links"
                    subtitle="Add your social media profiles & website"
                    badgeText="Social Links"
                    icon={Globe}
                    onClose={() => {
                      flushAutoSave();
                      setActiveProfileSettingModal(null);
                    }}
                  >
                    {(() => {
                      const platforms: Array<{
                        key: SocialPlatformId;
                        label: string;
                        placeholder: string;
                      }> = [
                        {
                          key: 'youtube',
                          label: 'YouTube',
                          placeholder: 'https://youtube.com/@yourchannel',
                        },
                        {
                          key: 'instagram',
                          label: 'Instagram',
                          placeholder: 'https://instagram.com/yourhandle',
                        },
                        {
                          key: 'tiktok',
                          label: 'TikTok',
                          placeholder: 'https://tiktok.com/@yourhandle',
                        },
                        {
                          key: 'twentyfoursix',
                          label: '24/6',
                          placeholder: 'https://24six.app/...',
                        },
                        {
                          key: 'facebook',
                          label: 'Facebook',
                          placeholder: 'https://facebook.com/yourpage',
                        },
                        {
                          key: 'website',
                          label: 'Website',
                          placeholder: 'https://yourwebsite.com',
                        },
                      ];

                      return (
                        <div className="bg-black/50 rounded-[1.75rem] border border-white/10 p-4 sm:p-5 space-y-4 text-left">
                          {platforms.map(({ key, label, placeholder }) => {
                            const currentVal = editForm.socialLinks?.[key] || '';
                            return (
                              <div key={key} className="space-y-1.5">
                                <div className="flex items-center justify-between pl-1">
                                  <label className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.2em] flex items-center gap-2">
                                    <span className="w-6 h-6 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 inline-flex items-center justify-center text-[#D4AF37]">
                                      <VendorSocialLogoIcon platform={key} className="w-3 h-3" />
                                    </span>
                                    <span>{label}</span>
                                  </label>
                                  {currentVal.trim() && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        applyImmediateVendorUpdate((prev) => ({
                                          ...prev,
                                          socialLinks: {
                                            ...(prev.socialLinks || {}),
                                            [key]: '',
                                          },
                                        }));
                                      }}
                                      className="text-[9px] font-bold text-zinc-400 hover:text-red-400 uppercase tracking-wider cursor-pointer transition-colors"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                                <input
                                  type="text"
                                  value={currentVal}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    applyAutoSaveVendorUpdate((prev) => ({
                                      ...prev,
                                      socialLinks: {
                                        ...(prev.socialLinks || {}),
                                        [key]: val,
                                      },
                                    }));
                                  }}
                                  onBlur={flushAutoSave}
                                  placeholder={placeholder}
                                  className="w-full h-11 bg-black border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-full px-4 text-xs sm:text-sm font-bold text-white outline-none transition-all placeholder:text-zinc-600"
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
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
                    title="Media & Showcase"
                    subtitle="Upload photos, videos, or add video links"
                    badgeText="Media Showcase"
                    icon={Film}
                    onClose={() => setActiveProfileSettingModal(null)}
                  >
                    {/* Even Pill Upload Controls: Add Photo, Add Video, Add Video URL */}
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
                            fileInputRef.current.accept = 'video/*,audio/*';
                            fileInputRef.current.click();
                          }
                        }}
                        className="h-10 px-3 rounded-full bg-white/5 hover:bg-white/10 text-white text-[9px] sm:text-[10px] font-black uppercase tracking-widest border border-white/15 flex items-center justify-center gap-1.5 cursor-pointer transition-all truncate"
                      >
                        <Film className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                        <span className="truncate">Add Video</span>
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
                        <span className="truncate">{showVideoUrlBar ? 'Close URL' : 'Add URL'}</span>
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
                              placeholder="Paste video or media URL..."
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
                        const is24Six = is24SixMedia(url);
                        const isAud = isAudioMedia(url);
                        const isVid = isVideo(url);
                        const isEmbed = isEmbedVideo(url);
                        const clean24SixUrl = url.replace(/[#?&]simcha_24six=1/g, '');
                        return (
                          <div
                            key={idx}
                            className="relative aspect-square bg-black rounded-[1.5rem] overflow-hidden border border-[#D4AF37]/25 group shadow-xl"
                          >
                            {is24Six ? (
                              <div
                                onClick={() => setFullscreenMedia({ url: clean24SixUrl, type: 'video' })}
                                className="w-full h-full cursor-pointer relative bg-zinc-950"
                              >
                                <iframe
                                  src={clean24SixUrl}
                                  title={`Showcase media ${idx + 1}`}
                                  className="w-full h-full border-0"
                                  allow="autoplay; encrypted-media; fullscreen"
                                />
                              </div>
                            ) : isAud ? (
                              <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-b from-zinc-900 to-black">
                                <div className="w-10 h-10 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37] flex items-center justify-center text-[#D4AF37] mb-2">
                                  <Volume2 className="w-4 h-4" />
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-widest text-[#D4AF37] mb-2">
                                  Music Track
                                </span>
                                <audio src={url} controls className="w-full h-7" />
                              </div>
                            ) : (
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
                            )}
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
                            {(isVid || is24Six || isAud) && (
                              <div className="absolute bottom-2.5 left-2.5 bg-black/80 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[8px] font-black text-[#D4AF37] border border-[#D4AF37]/30 flex items-center gap-1">
                                <Video className="w-2.5 h-2.5" />{' '}
                                {is24Six ? '24/6' : isAud ? 'MUSIC' : url.includes('simcha_video=1') || isEmbed ? 'VIDEO LINK' : 'VIDEO'}
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
                    title="Offers & Down Payment"
                    subtitle="Configure custom offers & optional booking deposit"
                    badgeText="Offers & Deposit"
                    icon={DollarSign}
                    onClose={() => {
                      flushAutoSave();
                      setActiveProfileSettingModal(null);
                    }}
                  >
                    <div className="bg-black/60 rounded-[1.5rem] border border-[#D4AF37]/30 divide-y divide-white/10 overflow-hidden text-left">
                      <div className="px-4 py-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs sm:text-sm font-bold text-white truncate">Enable "Make an Offer"</h4>
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                            Clients can propose a custom price when booking
                          </p>
                        </div>
                        <VendorToggleSwitch
                          label="Enable Make an Offer"
                          checked={Boolean(editForm.allowOffers)}
                          onChange={() => {
                            applyImmediateVendorUpdate(prev => ({ ...prev, allowOffers: !prev.allowOffers }));
                          }}
                        />
                      </div>

                      <div className="px-4 py-3.5 space-y-1.5">
                        <label className="text-[9px] font-black text-[#D4AF37] uppercase tracking-[0.18em] block">
                          Down Payment Amount ($) — Optional
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={editForm.downPayment ?? ''}
                          onChange={(e) =>
                            applyAutoSaveVendorUpdate((prev) => ({
                              ...prev,
                              downPayment: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)),
                            }))
                          }
                          onBlur={flushAutoSave}
                          placeholder="0 (No down payment required)"
                          className="w-full h-10 bg-black border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-full px-4 text-xs sm:text-sm font-bold text-white outline-none transition-all"
                        />
                      </div>
                    </div>
                  </VendorSettingSheetModal>
                )}

                {activeProfileSettingModal === 'privacy' && (
                  <VendorSettingSheetModal
                    title="Date Check Limit"
                    subtitle="Protect your calendar from competitor date spying"
                    badgeText="Privacy"
                    icon={editForm.enableDateCheckLimit !== false ? Lock : Unlock}
                    onClose={() => {
                      flushAutoSave();
                      setActiveProfileSettingModal(null);
                    }}
                  >
                    <div className="bg-black/60 rounded-[1.5rem] border border-[#D4AF37]/30 p-4 space-y-4 text-left">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs sm:text-sm font-bold text-white truncate">Date Check Limit</h4>
                          <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                            Cap how many dates a visitor can check before cooldown
                          </p>
                        </div>
                        <VendorToggleSwitch
                          label="Date Check Limit"
                          checked={editForm.enableDateCheckLimit !== false}
                          onChange={() => {
                            const nextEnabled = editForm.enableDateCheckLimit === false;
                            applyImmediateVendorUpdate(prev => ({ ...prev, enableDateCheckLimit: nextEnabled }));
                            showNotification(
                              nextEnabled ? 'Date check limit enabled.' : 'Date check limit turned off.',
                              'info'
                            );
                          }}
                        />
                      </div>

                      <div
                        className={`grid grid-cols-2 gap-3 pt-3 border-t border-white/10 transition-opacity ${
                          editForm.enableDateCheckLimit === false ? 'opacity-40 pointer-events-none select-none' : ''
                        }`}
                      >
                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-[#D4AF37] uppercase tracking-[0.18em] pl-2 block">
                            Max Checks
                          </label>
                          <input
                            type="number"
                            min="1"
                            disabled={editForm.enableDateCheckLimit === false}
                            className="w-full h-10 bg-black border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-full px-4 text-xs sm:text-sm font-bold text-white outline-none transition-all"
                            value={editForm.maxDateChecks ?? 5}
                            onChange={e => applyAutoSaveVendorUpdate(prev => ({ ...prev, maxDateChecks: parseInt(e.target.value) || 0 }))}
                            onBlur={flushAutoSave}
                            placeholder="5"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] font-black text-[#D4AF37] uppercase tracking-[0.18em] pl-2 block">
                            Reset (Hours)
                          </label>
                          <input
                            type="number"
                            min="1"
                            disabled={editForm.enableDateCheckLimit === false}
                            className="w-full h-10 bg-black border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-full px-4 text-xs sm:text-sm font-bold text-white outline-none transition-all"
                            value={editForm.dateCheckResetHours ?? 24}
                            onChange={e => applyAutoSaveVendorUpdate(prev => ({ ...prev, dateCheckResetHours: parseInt(e.target.value) || 0 }))}
                            onBlur={flushAutoSave}
                            placeholder="24"
                          />
                        </div>
                      </div>
                    </div>
                  </VendorSettingSheetModal>
                )}

                {activeProfileSettingModal === 'email' && (
                  <VendorSettingSheetModal
                    title="Test Email Delivery"
                    subtitle="Verify automated email notifications"
                    badgeText="Email"
                    icon={Mail}
                    onClose={() => setActiveProfileSettingModal(null)}
                  >
                    <div className="bg-black/60 rounded-[1.5rem] border border-[#D4AF37]/30 p-4 space-y-3 text-left">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#D4AF37]">
                          Send Test Email
                        </span>
                        <span className="text-[10px] text-zinc-400">SMTP check</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex-1 relative min-w-0">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#D4AF37]" />
                          <input
                            type="email"
                            placeholder="recipient@example.com"
                            className="w-full h-9 bg-black border border-[#D4AF37]/30 focus:border-[#D4AF37] rounded-full pl-9 pr-3 text-xs text-white outline-none transition-all"
                            value={testEmail}
                            onChange={(e) => setTestEmail(e.target.value)}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleSendTestEmail}
                          disabled={isSendingTest}
                          className="h-9 px-4 bg-[#D4AF37] hover:bg-[#E5C76B] text-black rounded-full font-black text-[9px] uppercase tracking-widest border border-[#D4AF37] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shrink-0"
                        >
                          {isSendingTest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3" />}
                          <span>{isSendingTest ? 'Sending' : 'Send'}</span>
                        </button>
                      </div>

                      {testEmailStatus?.success && (
                        <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-3.5 py-2 rounded-full flex items-center gap-2">
                          <CheckCircle className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                          <p className="text-[9px] font-bold text-[#D4AF37] uppercase tracking-widest">
                            Test email sent!
                          </p>
                        </div>
                      )}

                      {testEmailStatus?.error && (
                        <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-xl flex items-start gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                          <p className="text-[10px] text-red-300 font-mono break-all">{testEmailStatus.error}</p>
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
            ) : isEmbedVideo(fullscreenMedia.url) || is24SixMedia(fullscreenMedia.url) ? (
              <iframe src={fullscreenMedia.url} className="w-full max-w-4xl aspect-video rounded-xl shadow-2xl border-0 bg-black" allow="autoplay; encrypted-media; fullscreen" />
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