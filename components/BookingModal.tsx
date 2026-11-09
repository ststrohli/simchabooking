import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Star, Calendar, User, Mail, MessageSquare, PartyPopper, MapPin, Clock, Tag, Check, CheckCircle, AlertTriangle, Hash, ChevronLeft, ChevronRight, Image as ImageIcon, Sparkles, ExternalLink, Globe } from 'lucide-react';
import { Vendor, SelectedService, VendorCategory, VendorService, ServiceCategoryType, getVendorSocialItems, SocialPlatformId } from '../types';
import LocationAutocomplete from './LocationAutocomplete';
import { useModalDragDismiss, ModalDragIndicator } from './useModalDragDismiss';

const BookingSocialIcon: React.FC<{ platform: SocialPlatformId; className?: string }> = ({ platform, className = 'w-3 h-3' }) => {
  switch (platform) {
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
          <path d="m10 15 5-3-5-3z" />
        </svg>
      );
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
      );
    case 'website':
    default:
      return <Globe className={className} />;
  }
};

const inferServiceCategory = (service: VendorService): ServiceCategoryType => {
  if (service.categoryType) return service.categoryType;
  const text = `${service.name} ${service.unit || ''}`.toLowerCase();
  if (/\b(location|lakewood|brooklyn|monsey|boro park|williamsburg|five towns|queens|manhattan|staten island|new jersey|ny|nj|travel|destination|area|local|out of town|out of state|long island|westchester|miami|florida|ballroom|terrace|boroughs|metro)\b/.test(text)) {
    return 'location';
  }
  const hasExplicitDuration = /\b(\d+\s*(hour|hours|hr|hrs)|half\s*day|full\s*day)\b/.test(text);
  const hasAmenityKeyword = /\b(add-on|addon|extra|lighting|uplighting|speaker|speakers|mic|mics|microphone|subwoofer|album|valet|dessert|counseling|kippah|kippahs|bencher|benchers|booth|fog|sparkler|sparklers)\b/.test(text);
  if (!hasExplicitDuration && hasAmenityKeyword) {
    return 'amenities';
  }
  if (/\b(hour|hours|hr|hrs|time|day|half day|full day|overtime|minute|minutes|package|packages|tier|coverage|performance|ceremony|access)\b/.test(text)) {
    return 'hours';
  }
  return 'amenities';
};

const MODAL_TRANSITION = { duration: 1.15, ease: [0.25, 0.85, 0.35, 1] as const };

const parseTimeParts12h = (raw: string): { hour: number; minute: number; period: 'AM' | 'PM' } => {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { hour: 6, minute: 0, period: 'PM' };

  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = Math.min(59, Math.max(0, parseInt(ampmMatch[2], 10) || 0));
    const period = ampmMatch[3].toUpperCase() as 'AM' | 'PM';
    if (h < 1 || h > 12) h = 12;
    return { hour: h, minute: m, period };
  }

  const match24 = trimmed.match(/^(\d{1,2}):(\d{2})/);
  if (match24) {
    const h24 = parseInt(match24[1], 10);
    const m = Math.min(59, Math.max(0, parseInt(match24[2], 10) || 0));
    const period: 'AM' | 'PM' = h24 >= 12 ? 'PM' : 'AM';
    const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return { hour: hour12, minute: m, period };
  }

  return { hour: 6, minute: 0, period: 'PM' };
};

const formatTime12h = (raw: string): string => {
  if (!raw || !raw.trim()) return '';
  const { hour, minute, period } = parseTimeParts12h(raw);
  return `${hour}:${String(minute).padStart(2, '0')} ${period}`;
};

const FloatingInput: React.FC<{
  id: string;
  label: string;
  icon: any;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  type?: string;
  className?: string;
  highlighted?: boolean;
}> = React.memo(({ id, label, icon: Icon, value, onChange, required = false, type = "text", className = "", highlighted = false }) => {
  const [focused, setFocused] = useState(false);
  const isFilled = value !== '';
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        {Icon && (
          <Icon className={`absolute left-4 w-4 h-4 transition-all duration-300 z-10 ${focused ? 'text-[#D4AF37] scale-110' : highlighted ? 'text-red-500 scale-110' : 'text-[#D4AF37]/40'}`} />
        )}
        <input
          id={id}
          type={type}
          required={required}
          value={value}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={`w-full bg-black/60 border rounded-full text-zinc-100 placeholder-transparent focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none transition-all duration-300 pt-5 pb-2 pr-5 ${Icon ? 'pl-11' : 'pl-5'} ${highlighted ? 'border-red-500 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-[#D4AF37]/20'} ${className}`}
          placeholder={label}
        />
        <label
          htmlFor={id}
          className={`absolute pointer-events-none transition-all duration-300 leading-none ${Icon ? 'left-11' : 'left-5'} 
            ${(focused || isFilled) 
              ? 'top-2 text-[9px] text-[#D4AF37] font-black uppercase tracking-widest' 
              : 'top-3.5 text-xs text-zinc-300 font-medium'
            }`}
        >
          {label}
        </label>
      </div>
    </div>
  );
});

const FloatingTextarea: React.FC<{
  id: string;
  label: string;
  icon: any;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  required?: boolean;
  rows?: number;
  className?: string;
}> = React.memo(({ id, label, icon: Icon, value, onChange, required = false, rows = 3, className = "" }) => {
  const [focused, setFocused] = useState(false);
  const isFilled = value !== '';
  const handleFocus = useCallback(() => setFocused(true), []);
  const handleBlur = useCallback(() => setFocused(false), []);

  return (
    <div className="relative w-full">
      <div className="relative flex items-start">
        {Icon && (
          <Icon className={`absolute left-3.5 top-4.5 w-4 h-4 transition-all duration-300 z-10 ${focused ? 'text-[#D4AF37] scale-110' : 'text-[#D4AF37]/40'}`} />
        )}
        <textarea
          id={id}
          required={required}
          value={value}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          rows={rows}
          className={`w-full bg-black/60 border border-[#D4AF37]/20 rounded-xl text-zinc-100 placeholder-transparent focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none transition-all duration-300 pt-6 pb-2 pr-4 resize-none ${Icon ? 'pl-10' : 'pl-4'} ${className}`}
          placeholder={label}
        />
        <label
          htmlFor={id}
          className={`absolute pointer-events-none transition-all duration-300 leading-none ${Icon ? 'left-10' : 'left-4'} 
            ${(focused || isFilled) 
              ? 'top-2 text-[9px] text-[#D4AF37] font-black uppercase tracking-widest' 
              : 'top-4 text-xs text-zinc-300 font-medium'
            }`}
        >
          {label}
        </label>
      </div>
    </div>
  );
});

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: Vendor | null;
  selectedDate: string;
  isNested?: boolean;
  onConfirm: (details: { 
    eventName: string; 
    clientName: string; 
    contactEmail: string; 
    notes: string; 
    eventLocation: string; 
    eventTime: string;
    selectedServices: SelectedService[];
    totalAmount: number;
    date: string;
  }) => void;
  initialDetails?: { 
    eventName: string; 
    clientName: string; 
    contactEmail: string; 
    eventLocation?: string; 
    eventTime?: string; 
    notes?: string;
    selectedServiceIds?: string[];
    selectedServiceQuantities?: Record<string, number>;
  };
  isPriorityFromSuggestions?: boolean;
  onDone?: (isPriority: boolean) => void;
  onSuccessStateChange?: (isSuccess: boolean) => void;
  onGoToPlan?: () => void;
  onGoToEvents?: () => void;
  onDismissStart?: () => void;
}

const BookingModal: React.FC<BookingModalProps> = React.memo(({ 
  isOpen, onClose, vendor, selectedDate, onConfirm, initialDetails, isPriorityFromSuggestions, onDone, onSuccessStateChange, onGoToPlan, onGoToEvents, onDismissStart, isNested = false 
}) => {
  const [formData, setFormData] = useState({ eventName: '', clientName: '', contactEmail: '', eventLocation: '', eventTime: '', notes: '' });
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [locationHours, setLocationHours] = useState<Record<string, number>>({});
  const [hourPopups, setHourPopups] = useState<Record<string, { id: number; text: string }>>({});
  const popupTimersRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [isOfferMode, setIsOfferMode] = useState(false);
  const [submitType, setSubmitType] = useState<'book' | 'add'>('book');
  const [offeredPrice, setOfferedPrice] = useState<string>('');
  const [highlightedField, setHighlightedField] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = React.useRef(false);

  const [localDate, setLocalDate] = useState('');
  const [isPriorityDate, setIsPriorityDate] = useState(false);
  const [showPriorityInfo, setShowPriorityInfo] = useState(false);
  const priorityInfoWrapRef = React.useRef<HTMLDivElement>(null);
  const [privacyBlocked, setPrivacyBlocked] = useState(false);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(() => new Date());

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);
  const [watchDialMode, setWatchDialMode] = useState<'hour' | 'minute'>('hour');
  const [timePopKey, setTimePopKey] = useState(0);
  const [datePopKey, setDatePopKey] = useState(0);
  const watchDialRef = React.useRef<HTMLDivElement>(null);
  const isDraggingWatchRef = React.useRef(false);
  const watchCloseTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [userInteracted, setUserInteracted] = useState(false);
  const [clickedUnavailableDate, setClickedUnavailableDate] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const formScrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && formScrollRef.current) {
      formScrollRef.current.scrollTop = 0;
    }
  }, [isOpen]);

  useEffect(() => {
    if (onSuccessStateChange) {
      onSuccessStateChange(isSuccess);
    }
  }, [isSuccess, onSuccessStateChange]);
  const [checkedDates, setCheckedDates] = useState<Record<string, { status: 'Available' | 'Unavailable'; checkedAt: number }>>(() => {
    if (!vendor?.id) return {};
    const sessionKey = `checked_dates_${vendor.id}`;
    try {
      const stored = localStorage.getItem(sessionKey) || sessionStorage.getItem(sessionKey);
      if (!stored) return {};
      const parsed = JSON.parse(stored);
      const now = Date.now();
      const resetPeriodMs = (vendor.dateCheckResetHours ?? 24) * 60 * 60 * 1000;
      const result: Record<string, { status: 'Available' | 'Unavailable'; checkedAt: number }> = {};
      for (const [dateStr, val] of Object.entries(parsed)) {
        if (typeof val === 'string' && (val === 'Available' || val === 'Unavailable')) {
          result[dateStr] = { status: val, checkedAt: now };
        } else if (val && typeof val === 'object' && val !== null && 'status' in val && 'checkedAt' in val) {
          if (now - (val as any).checkedAt < resetPeriodMs) {
            result[dateStr] = val as any;
          }
        }
      }
      return result;
    } catch {
      return {};
    }
  });

  const isVenue = vendor?.category === VendorCategory.VENUE || vendor?.category === 'Venue';
  const effectiveDate = localDate;
  const isDateBlocked = vendor?.unavailableDates?.includes(effectiveDate);
  const hasSelectedPackage = selectedServiceIds.length > 0;

  const getResetPeriodMs = () => (vendor?.dateCheckResetHours ?? 24) * 60 * 60 * 1000;
  const getMaxChecks = () => vendor?.maxDateChecks ?? 5;

  const getActiveCheckedDates = (dates: Record<string, { status: 'Available' | 'Unavailable'; checkedAt: number }>) => {
    const now = Date.now();
    const resetPeriodMs = getResetPeriodMs();
    const active: Record<string, { status: 'Available' | 'Unavailable'; checkedAt: number }> = {};
    for (const [k, v] of Object.entries(dates)) {
      if (v && typeof v === 'object' && typeof v.checkedAt === 'number' && (now - v.checkedAt < resetPeriodMs)) {
        active[k] = v;
      }
    }
    return active;
  };

  // Check if blocked by privacy limit
  const checkPrivacyStatus = (): boolean => {
    if (!vendor || vendor.enableDateCheckLimit === false) return false;
    const now = Date.now();
    const resetPeriodMs = getResetPeriodMs();
    const maxChecks = getMaxChecks();
    
    let activeCount = 0;
    for (const val of Object.values(checkedDates)) {
      if (val && typeof val === 'object' && typeof val.checkedAt === 'number' && (now - val.checkedAt < resetPeriodMs)) {
        activeCount++;
      }
    }
    return activeCount >= maxChecks;
  };

  const getRemainingAttempts = (): number => {
    if (!vendor) return 0;
    const now = Date.now();
    const resetPeriodMs = getResetPeriodMs();
    const maxChecks = getMaxChecks();
    
    let activeCount = 0;
    for (const val of Object.values(checkedDates)) {
      if (val && typeof val === 'object' && typeof val.checkedAt === 'number' && (now - val.checkedAt < resetPeriodMs)) {
        activeCount++;
      }
    }
    return Math.max(0, maxChecks - activeCount);
  };

  const handleDateClick = (dateStr: string, isPastDay: boolean) => {
    if (isPastDay) return;
    setUserInteracted(true);

    if (dateStr === localDate) {
      setLocalDate('');
      setClickedUnavailableDate(null);
      return;
    }

    const now = Date.now();
    const resetPeriodMs = getResetPeriodMs();
    const cached = checkedDates[dateStr];
    const isValidCached = cached && (now - cached.checkedAt < resetPeriodMs);

    if (isValidCached) {
      if (cached.status === 'Unavailable') {
        setClickedUnavailableDate(dateStr);
      } else {
        setClickedUnavailableDate(null);
        setLocalDate(dateStr);
        setIsCalendarOpen(false);
        setDatePopKey(k => k + 1);
      }
      return;
    }

    if (checkPrivacyStatus()) {
      setPrivacyBlocked(true);
      return;
    }

    const isBlocked = vendor?.unavailableDates?.includes(dateStr);
    const newStatus: 'Available' | 'Unavailable' = isBlocked ? 'Unavailable' : 'Available';

    const updated = {
      ...checkedDates,
      [dateStr]: { status: newStatus, checkedAt: now }
    };
    const activeUpdated = getActiveCheckedDates(updated);
    setCheckedDates(activeUpdated);

    if (vendor?.id) {
      const storageKey = `checked_dates_${vendor.id}`;
      localStorage.setItem(storageKey, JSON.stringify(activeUpdated));
      sessionStorage.setItem(storageKey, JSON.stringify(activeUpdated));
    }

    if (isBlocked) {
      setClickedUnavailableDate(dateStr);
    } else {
      setClickedUnavailableDate(null);
      setLocalDate(dateStr);
      setIsCalendarOpen(false);
      setDatePopKey(k => k + 1);
    }
    setPrivacyBlocked(checkPrivacyStatus());
  };



  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const isPastDate = (date: Date | string): boolean => {
    if (!date) return false;
    let compareDate: Date;
    if (typeof date === 'string') {
      const parts = date.split('-');
      if (parts.length === 3) {
        compareDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      } else {
        compareDate = new Date(date);
      }
    } else {
      compareDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    compareDate.setHours(0, 0, 0, 0);
    return compareDate < today;
  };

  const formatDateString = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const prevMonth = useCallback(() => {
    setUserInteracted(true);
    setClickedUnavailableDate(null);
    setCurrentCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }, []);

  const nextMonth = useCallback(() => {
    setUserInteracted(true);
    setClickedUnavailableDate(null);
    setCurrentCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }, []);

  const getReadableLocalDate = () => {
    if (!localDate) return 'No Date Selected';
    try {
      const parts = localDate.split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        const dObj = new Date(year, month, day);
        if (!isNaN(dObj.getTime())) {
          return dObj.toLocaleDateString('default', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        }
      }
    } catch {}
    return localDate;
  };

  const wasOpenRef = React.useRef(false);

  // Sync state when opening or closing
  useEffect(() => {
    if (isOpen && vendor) {
      if (!wasOpenRef.current) {
        setIsSuccess(false);
        setUserInteracted(false);
        setLocalDate('');
        setIsPriorityDate(false);
        setShowPriorityInfo(false);
        setCurrentCalendarMonth(new Date());
        setClickedUnavailableDate(null);
      }
      
      const storageKey = `checked_dates_${vendor.id}`;
      const storedStr = localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey);
      let loadedDates: Record<string, { status: 'Available' | 'Unavailable'; checkedAt: number }> = {};
      if (storedStr) {
        try {
          const parsed = JSON.parse(storedStr);
          const now = Date.now();
          const resetPeriodMs = getResetPeriodMs();
          for (const [dateStr, val] of Object.entries(parsed)) {
            if (typeof val === 'string' && (val === 'Available' || val === 'Unavailable')) {
              loadedDates[dateStr] = { status: val, checkedAt: now };
            } else if (val && typeof val === 'object' && val !== null && 'status' in val && 'checkedAt' in val) {
              if (now - (val as any).checkedAt < resetPeriodMs) {
                loadedDates[dateStr] = val as any;
              }
            }
          }
        } catch {}
      }
      setCheckedDates(loadedDates);

      const isBlocked = checkPrivacyStatus();
      setPrivacyBlocked(isBlocked);

      wasOpenRef.current = true;
    } else {
      wasOpenRef.current = false;
    }
  }, [isOpen, vendor]);

  const [activeShowcaseServiceId, setActiveShowcaseServiceId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
        setIsOfferMode(false);
        setOfferedPrice('');
        setLocationHours({});
        setHourPopups({});
        setActiveShowcaseServiceId(null);
        setIsTimePickerOpen(false);
        setWatchDialMode('hour');
        let savedDefaults: Record<string, string> = {};
        try {
          const raw = localStorage.getItem('simcha_client_booking_defaults');
          if (raw) savedDefaults = JSON.parse(raw);
        } catch {}

        if (initialDetails) {
            setFormData({ 
              eventName: initialDetails.eventName || savedDefaults.defaultEventName || '', 
              clientName: initialDetails.clientName || savedDefaults.clientName || '', 
              contactEmail: initialDetails.contactEmail || savedDefaults.contactEmail || '', 
              eventLocation: initialDetails.eventLocation || (isVenue && vendor ? vendor.location : (savedDefaults.defaultLocation || '')), 
              eventTime: initialDetails.eventTime
                ? formatTime12h(initialDetails.eventTime)
                : (savedDefaults.defaultEventTime ? formatTime12h(savedDefaults.defaultEventTime) : ''), 
              notes: initialDetails.notes || savedDefaults.defaultNotes || '' 
            });
            const rawSelectedIds = initialDetails.selectedServiceIds || [];
            const allVendorServices = vendor?.services || [];
            let hasLocation = false;
            const sanitizedIds = rawSelectedIds.filter(id => {
              const svc = allVendorServices.find(s => s.id === id);
              if (!svc) return true;
              const cat = inferServiceCategory(svc);
              if (cat === 'hours') return false;
              if (cat === 'location') {
                if (hasLocation) return false;
                hasLocation = true;
                return true;
              }
              return true;
            });
            setSelectedServiceIds(sanitizedIds);
            setQuantities(initialDetails.selectedServiceQuantities || {});
        } else {
            setFormData({ 
              eventName: savedDefaults.defaultEventName || '', 
              clientName: savedDefaults.clientName || '', 
              contactEmail: savedDefaults.contactEmail || '', 
              eventLocation: isVenue && vendor ? vendor.location : (savedDefaults.defaultLocation || ''), 
              eventTime: savedDefaults.defaultEventTime ? formatTime12h(savedDefaults.defaultEventTime) : '', 
              notes: savedDefaults.defaultNotes || '' 
            });
            setSelectedServiceIds([]);
            setQuantities({});
        }
    }
  }, [isOpen, initialDetails, vendor, isVenue]);

  const onCloseRef = React.useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSubmitting(false);
        setIsSuccess(false);
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isNested) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
    };
  }, [isOpen, isNested]);

  const triggerHourPopup = useCallback((serviceId: string, text: string) => {
    if (popupTimersRef.current[serviceId]) {
      clearTimeout(popupTimersRef.current[serviceId]);
    }
    const id = Date.now() + Math.random();
    setHourPopups(prev => ({ ...prev, [serviceId]: { id, text } }));
    popupTimersRef.current[serviceId] = setTimeout(() => {
      setHourPopups(prev => {
        const next = { ...prev };
        delete next[serviceId];
        return next;
      });
      delete popupTimersRef.current[serviceId];
    }, 1100);
  }, []);

  const totalAmount = useMemo(() => {
    if (!vendor) return 0;
    
    let servicesTotal = 0;
    if (selectedServiceIds.length > 0) {
      servicesTotal = vendor.services?.filter(s => selectedServiceIds.includes(s.id)).reduce((sum, s) => {
        const cat = inferServiceCategory(s);
        if (cat === 'location') {
          const baseHours = s.defaultHours ?? 3;
          const rate = s.hourlyRate ?? 100;
          const currentHours = locationHours[s.id] ?? baseHours;
          const extraHours = Math.max(0, currentHours - baseHours);
          return sum + s.price + (extraHours * rate);
        }
        const qty = quantities[s.id] || 1;
        return sum + (s.price * qty);
      }, 0) || 0;
    }
    
    return servicesTotal || vendor.downPayment || vendor.priceStart || 0;
  }, [selectedServiceIds, quantities, locationHours, vendor]);

  const toggleService = useCallback((serviceId: string) => {
    const allServices = vendor?.services || [];
    const targetService = allServices.find(s => s.id === serviceId);
    const targetCategory = targetService ? inferServiceCategory(targetService) : 'amenities';
    const isSingleSelectCategory = targetCategory === 'location';

    setSelectedServiceIds(prev => {
      if (prev.includes(serviceId)) {
        setQuantities(qPrev => {
          const next = { ...qPrev };
          delete next[serviceId];
          return next;
        });
        return prev.filter(id => id !== serviceId);
      } else {
        const conflictingIds = isSingleSelectCategory
          ? allServices
              .filter(s => s.id !== serviceId && inferServiceCategory(s) === targetCategory)
              .map(s => s.id)
          : [];

        setQuantities(qPrev => {
          const next = { ...qPrev };
          conflictingIds.forEach(id => {
            delete next[id];
          });
          next[serviceId] = 1;
          return next;
        });

        const filteredPrev = isSingleSelectCategory
          ? prev.filter(id => !conflictingIds.includes(id))
          : prev;

        const nextIds = [...filteredPrev, serviceId];
        if (targetService?.image) {
          setActiveShowcaseServiceId(serviceId);
        }
        return nextIds;
      }
    });
  }, [vendor?.services]);

  const selectedServicesWithPhotos = useMemo(() => {
    if (!vendor?.services) return [];
    return vendor.services.filter(s => selectedServiceIds.includes(s.id) && Boolean(s.image));
  }, [vendor?.services, selectedServiceIds]);

  const activePhotoService = useMemo(() => {
    if (selectedServicesWithPhotos.length === 0) return null;
    if (activeShowcaseServiceId) {
      const found = selectedServicesWithPhotos.find(s => s.id === activeShowcaseServiceId);
      if (found) return found;
    }
    return selectedServicesWithPhotos[selectedServicesWithPhotos.length - 1];
  }, [selectedServicesWithPhotos, activeShowcaseServiceId]);

  const handleQuantityChange = useCallback((serviceId: string, val: string) => {
    const num = parseInt(val) || 0;
    setQuantities(prev => ({ ...prev, [serviceId]: Math.max(0, num) }));
  }, []);

  const handleEventNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData(prev => ({ ...prev, eventName: val }));
  }, []);

  const handleSelectWatchTime = useCallback((hour: number, minute: number, period: 'AM' | 'PM') => {
    const formatted = `${hour}:${String(minute).padStart(2, '0')} ${period}`;
    setFormData(prev => ({ ...prev, eventTime: formatted }));
  }, []);

  const triggerWatchZoomClose = useCallback(() => {
    if (watchCloseTimerRef.current) clearTimeout(watchCloseTimerRef.current);
    watchCloseTimerRef.current = setTimeout(() => {
      setIsTimePickerOpen(false);
      setTimePopKey(k => k + 1);
    }, 180);
  }, []);

  const updateWatchFromPointer = useCallback((clientX: number, clientY: number, mode: 'hour' | 'minute', currentHour: number, currentMinute: number, currentPeriod: 'AM' | 'PM') => {
    const el = watchDialRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    if (Math.hypot(dx, dy) < 10) return;

    let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (deg < 0) deg += 360;

    if (mode === 'hour') {
      const idx = Math.round(deg / 30) % 12;
      const pickedHour = idx === 0 ? 12 : idx;
      handleSelectWatchTime(pickedHour, currentMinute, currentPeriod);
    } else {
      const idx = Math.round(deg / 30) % 12;
      const pickedMinute = idx * 5;
      handleSelectWatchTime(currentHour, pickedMinute, currentPeriod);
    }
  }, [handleSelectWatchTime]);

  const handleToggleTimePicker = useCallback(() => {
    if (watchCloseTimerRef.current) clearTimeout(watchCloseTimerRef.current);
    setIsCalendarOpen(false);
    setIsTimePickerOpen(prev => {
      const next = !prev;
      if (next) {
        setWatchDialMode('hour');
        if (!formData.eventTime) {
          setFormData(f => ({ ...f, eventTime: '6:00 PM' }));
        }
      } else {
        setTimePopKey(k => k + 1);
      }
      return next;
    });
  }, [formData.eventTime]);

  const handleClientNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData(prev => ({ ...prev, clientName: val }));
  }, []);

  const handleLocationChange = useCallback((val: string) => {
    setFormData(prev => ({ ...prev, eventLocation: val }));
  }, []);

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData(prev => ({ ...prev, contactEmail: val }));
  }, []);

  const handleNotesChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setFormData(prev => ({ ...prev, notes: val }));
  }, []);

  const handleOfferedPriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setOfferedPrice(e.target.value);
  }, []);

  const handleToggleCalendar = useCallback(() => {
    setIsTimePickerOpen(false);
    setIsCalendarOpen(prev => !prev);
  }, []);

  const handleEnableOfferMode = useCallback(() => {
    setIsOfferMode(true);
    setOfferedPrice(totalAmount.toString());
  }, [totalAmount]);

  const handleDisableOfferMode = useCallback(() => {
    setIsOfferMode(false);
  }, []);

  const handleTogglePriority = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsPriorityDate(prev => !prev);
  }, []);

  const handleTogglePriorityInfo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPriorityInfo(prev => !prev);
  }, []);

  useEffect(() => {
    if (!showPriorityInfo) return;
    const handlePointerDownOutside = (e: MouseEvent | TouchEvent) => {
      if (priorityInfoWrapRef.current && !priorityInfoWrapRef.current.contains(e.target as Node)) {
        setShowPriorityInfo(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDownOutside);
    document.addEventListener('touchstart', handlePointerDownOutside);
    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
      document.removeEventListener('touchstart', handlePointerDownOutside);
    };
  }, [showPriorityInfo]);

  const handleSubmit = useCallback(async (e: React.FormEvent | React.MouseEvent, explicitSubmitType?: 'add' | 'book') => {
    e.preventDefault();
    e.stopPropagation();
    if (!vendor || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    let failedFieldId: string | null = null;
    
    if (!localDate || isPastDate(localDate)) {
      failedFieldId = 'date-section';
    } else if (!hasSelectedPackage) {
      failedFieldId = 'packages-section';
    } else if (!formData.eventName.trim()) {
      failedFieldId = 'event-name';
    } else if (!formData.eventTime.trim()) {
      failedFieldId = 'event-time';
    } else if (!formData.clientName.trim()) {
      failedFieldId = 'client-name';
    } else if (!isVenue && !formData.eventLocation.trim()) {
      failedFieldId = 'event-location';
    } else if (!formData.contactEmail.trim()) {
      failedFieldId = 'client-email';
    } else if (isOfferMode && (!offeredPrice || parseInt(offeredPrice) <= 0)) {
      failedFieldId = 'offered-price';
    }

    if (failedFieldId) {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      setHighlightedField(failedFieldId);
      setTimeout(() => {
        setHighlightedField(null);
      }, 2000);

      const element = document.getElementById(failedFieldId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (failedFieldId === 'date-section') {
          setIsCalendarOpen(true);
        } else if (failedFieldId === 'event-time') {
          setIsTimePickerOpen(true);
        }
      }
      return;
    }
    
    const selectedServices = vendor.services
        ?.filter(s => selectedServiceIds.includes(s.id))
        .map(s => {
            const cat = inferServiceCategory(s);
            if (cat === 'location') {
              const baseHours = s.defaultHours ?? 3;
              const rate = s.hourlyRate ?? 100;
              const currentHours = locationHours[s.id] ?? baseHours;
              const extraHours = Math.max(0, currentHours - baseHours);
              const computedPrice = s.price + (extraHours * rate);
              return {
                id: s.id,
                name: `${s.name} (${currentHours} hrs)`,
                price: computedPrice,
                quantity: 1,
                unit: 'location',
                categoryType: 'location' as ServiceCategoryType,
                selectedHours: currentHours,
                defaultHours: baseHours,
                hourlyRate: rate
              };
            }
            return { 
                id: s.id, 
                name: s.name, 
                price: s.price, 
                quantity: quantities[s.id] || 1,
                unit: s.unit || undefined,
                categoryType: cat
            };
        }) || [];
        
    const finalLocation = isVenue ? vendor.location : formData.eventLocation;
    const currentSubmitType = explicitSubmitType || submitType;
    const isDirectBook = currentSubmitType === 'book';
    
    try {
      await onConfirm({ 
          ...formData, 
          eventLocation: finalLocation, 
          selectedServices, 
          totalAmount: isOfferMode ? (parseInt(offeredPrice) || 0) : totalAmount,
          date: localDate,
          isPriorityDate,
          isDirectBook,
          // @ts-ignore - added to internal callback but type checked manually
          isOffer: isOfferMode,
          offeredPrice: isOfferMode ? (parseInt(offeredPrice) || 0) : undefined
      } as any);
      
      setIsSuccess(true);
    } catch (err) {
      console.error("Booking error:", err);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [vendor, localDate, hasSelectedPackage, formData, isVenue, isOfferMode, offeredPrice, selectedServiceIds, quantities, locationHours, submitType, onConfirm, totalAmount, isPriorityDate]);

  const handleAddClick = useCallback((e: React.MouseEvent) => {
    setSubmitType('add');
    handleSubmit(e, 'add');
  }, [handleSubmit]);

  const handleBookClick = useCallback((e: React.MouseEvent) => {
    setSubmitType('book');
    handleSubmit(e, 'book');
  }, [handleSubmit]);

  if (!isOpen || !vendor) return null;

  const renderInteractiveCalendar = () => {
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const monthName = currentCalendarMonth.toLocaleString('default', { month: 'long' });

    const days = [];

    // Padding empty cells
    for (let i = 0; i < firstDay; i++) {
      days.push(
        <div key={`empty-${i}`} className="aspect-square opacity-0 pointer-events-none" />
      );
    }

    // Days list
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month, day);
      const dateStr = formatDateString(dateObj);
      const isSelected = dateStr === localDate;
      const isPast = isPastDate(dateObj);
      
      const isVendorExplicitlyBlocked = vendor?.unavailableDates?.includes(dateStr);

      const cachedItem = checkedDates[dateStr];
      const now = Date.now();
      const resetPeriodMs = getResetPeriodMs();
      const isValidCached = cachedItem && (now - cachedItem.checkedAt < resetPeriodMs);

      const hasBeenChecked = !!isValidCached;
      const isAvailable = isValidCached && cachedItem.status === 'Available';
      const isUnavailable = isValidCached && cachedItem.status === 'Unavailable';
      
      const isBlockedOrUnavailable = Boolean(isVendorExplicitlyBlocked || isUnavailable);
      const isThisDateTappedUnavailable = dateStr === clickedUnavailableDate && isBlockedOrUnavailable;
      const limitReached = checkPrivacyStatus();
      const isDisabled = isPast || (limitReached && !isValidCached);

      let buttonStyle = "";
      if (isSelected) {
        if (isThisDateTappedUnavailable) {
          buttonStyle = "bg-red-600 text-white font-black shadow-[0_0_15px_rgba(239,68,68,0.45)] scale-105 border-2 border-red-500";
        } else if (isAvailable) {
          buttonStyle = "bg-green-600 text-white font-black shadow-[0_0_15px_rgba(34,197,94,0.45)] scale-105 border-2 border-green-500";
        } else {
          buttonStyle = "bg-[#D4AF37] text-black font-black shadow-[0_0_15px_rgba(212,175,55,0.45)] scale-105 border border-[#D4AF37]";
        }
      } else if (isPast) {
        buttonStyle = "text-zinc-400 bg-[#111]/20 opacity-30 cursor-not-allowed scale-95 border border-transparent";
      } else if (limitReached && !isValidCached) {
        buttonStyle = "text-zinc-500 bg-black/40 border border-white/5 opacity-50 cursor-not-allowed";
      } else if (isThisDateTappedUnavailable) {
        buttonStyle = "text-red-400 bg-red-950/20 opacity-75 cursor-pointer scale-95 border border-red-900/30 line-through hover:border-red-500/60";
      } else if (isAvailable) {
        buttonStyle = "text-green-500 bg-green-500/10 border-2 border-green-500/30 hover:bg-green-500/20";
      } else if (isUnavailable) {
        buttonStyle = "text-red-400/80 bg-red-950/20 opacity-90 cursor-pointer border border-red-900/20 hover:border-red-500/40";
      } else {
        // All other dates (including un-tapped vendor-blocked dates) remain ordinary unselected dates.
        buttonStyle = "text-zinc-100 bg-black/40 border border-white/5 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] hover:border-[#D4AF37]/40 hover:scale-105 hover:shadow-[0_0_12px_rgba(212,175,55,0.25)] active:scale-95";
      }

      days.push(
        <button
          key={`day-${day}`}
          type="button"
          disabled={isDisabled}
          onClick={() => handleDateClick(dateStr, isPast)}
          className={`aspect-square rounded-full flex flex-col items-center justify-center text-[11px] font-bold transition-all outline-none relative group ${buttonStyle}`}
        >
          <span>{day}</span>
          {!isSelected && !isDisabled && !isBlockedOrUnavailable && (
            <span className="w-1 h-1 rounded-full bg-[#D4AF37] opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 animate-pulse" />
          )}
        </button>
      );
    }

    const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="simcha-popout-calendar bg-[#050505]/95 border border-[#D4AF37]/45 rounded-3xl p-3.5 shadow-[0_22px_55px_rgba(0,0,0,0.9),0_0_28px_rgba(212,175,55,0.22)] select-none relative overflow-hidden w-[274px] sm:w-[290px] backdrop-blur-xl"
      >
        <div className="absolute inset-0 border border-white/5 pointer-events-none rounded-3xl" />
        
        {/* Compact Header with Navigation */}
        <div className="flex items-center justify-between mb-2.5 border-b border-[#D4AF37]/15 pb-2">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 rounded-full border border-[#D4AF37]/15 hover:border-[#D4AF37]/50 bg-black text-[#D4AF37] transition-all hover:scale-105 active:scale-95 outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] cursor-pointer"
            aria-label="Previous Month"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          
          <span className="font-[Cinzel] text-[#D4AF37] font-black uppercase tracking-widest text-[11px] flex items-center gap-1">
            {monthName} <span className="text-white">{year}</span>
          </span>

          <button
            type="button"
            onClick={nextMonth}
            className="p-1.5 rounded-full border border-[#D4AF37]/15 hover:border-[#D4AF37]/50 bg-black text-[#D4AF37] transition-all hover:scale-105 active:scale-95 outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] cursor-pointer"
            aria-label="Next Month"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Weekdays */}
        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {weekdays.map((wd, idx) => (
            <div key={`wd-${idx}`} className="text-[9px] text-[#D4AF37]/75 font-black uppercase tracking-widest py-0.5">
              {wd}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {days}
        </div>

        {/* Concise inline message for tapped unavailable date */}
        {clickedUnavailableDate && (
          <div className="mt-2 p-2 bg-red-950/40 border border-red-500/30 rounded-xl text-center text-[11px] text-red-300 animate-in fade-in duration-200">
            <span className="font-bold">This date is unavailable.</span> Please choose another date.
          </div>
        )}

      </div>
    );
  };

  const inputClass = "w-full pl-10 pr-4 py-2.5 bg-black border border-[#D4AF37]/30 rounded-lg text-zinc-100 placeholder:text-zinc-400 focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] outline-none transition-all";
  const labelClass = "block text-xs font-bold text-[#D4AF37]/70 uppercase tracking-widest mb-1.5";

  const isPriority = isPriorityDate || !!isPriorityFromSuggestions;

  const handleDismissModal = useCallback(() => {
    setIsSubmitting(false);
    setIsSuccess(false);
    onCloseRef.current();
  }, []);

  const { backdropOpacity, isDismissing, dragModalProps, dragHandleProps, triggerSlideUpEntry, dismissWithSlideOut } = useModalDragDismiss(
    handleDismissModal,
    !isSubmitting,
    onDismissStart
  );

  const handleGoToPlanAction = useCallback(() => {
    dismissWithSlideOut(() => {
      setIsSuccess(false);
      if (onGoToPlan) {
        onGoToPlan();
      } else if (onDone) {
        onDone(isPriority);
      } else {
        onClose();
      }
    });
  }, [dismissWithSlideOut, onGoToPlan, onDone, isPriority, onClose]);

  const handleGoToEventsAction = useCallback(() => {
    dismissWithSlideOut(() => {
      setIsSuccess(false);
      if (onGoToEvents) {
        onGoToEvents();
      } else if (onDone) {
        onDone(isPriority);
      } else {
        onClose();
      }
    });
  }, [dismissWithSlideOut, onGoToEvents, onDone, isPriority, onClose]);

  const handleDoneAction = useCallback(() => {
    dismissWithSlideOut(() => {
      setIsSuccess(false);
      if (submitType === 'book' && !isPriority && onGoToEvents) {
        onGoToEvents();
      } else if (onDone) {
        onDone(isPriority);
      } else {
        onClose();
      }
    });
  }, [dismissWithSlideOut, submitType, isPriority, onGoToEvents, onDone, onClose]);

  useEffect(() => {
    if (isDismissing && !isNested) {
      document.body.style.overflow = '';
    }
  }, [isDismissing, isNested]);

  useEffect(() => {
    if (!isSuccess) return;
    return triggerSlideUpEntry();
  }, [isSuccess, triggerSlideUpEntry]);

  return (
    <motion.div 
      style={{ opacity: backdropOpacity }}
      transition={MODAL_TRANSITION}
      className={`simcha-modal-gpu-wrapper will-change-transform transform-gpu ${isNested ? "absolute inset-x-0 bottom-0 top-7 z-30 bg-transparent flex flex-col justify-end items-center p-0 overflow-hidden rounded-t-[2.5rem]" : "simcha-booking-modal-backdrop fixed inset-0 z-[160] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 bg-black/80 backdrop-blur-md overflow-hidden"} ${isDismissing ? 'pointer-events-none' : ''}`} 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="modal-title"
    >
      {isSubmitting && (
        <div className="simcha-booking-modal-backdrop fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center pointer-events-auto">
          <div className="flex flex-col items-center space-y-4">
            <div className="w-12 h-12 border-4 border-[#D4AF37]/20 border-t-[#D4AF37] rounded-full animate-spin" />
            <p className="text-[#D4AF37] font-[Cinzel] text-xs font-black uppercase tracking-widest animate-pulse">
              Processing Request...
            </p>
          </div>
        </div>
      )}

      {isSuccess ? (
        <motion.div 
          key="booking-success"
          {...dragModalProps}
          transition={MODAL_TRANSITION}
          className={`simcha-booking-modal-sheet simcha-modal-gpu-wrapper will-change-transform transform-gpu bg-[#111] w-full ${isNested ? 'h-full sm:max-w-full rounded-t-[2.5rem] rounded-b-none' : 'sm:max-w-md h-[93dvh] sm:h-auto sm:max-h-[88vh] rounded-t-[2.5rem] rounded-b-none sm:rounded-2xl'} border-t-2 border-r border-l sm:border border-[#D4AF37]/30 relative overflow-hidden shadow-2xl flex flex-col mt-auto sm:mt-0 p-6 md:p-10 text-center ${isDismissing ? 'pointer-events-none' : ''}`}
        >
          {/* Top bar drag handle on success view, leaving top-right corner clear for X button */}
          <div 
            {...dragHandleProps}
            data-drag-handle="true"
            className="absolute top-0 left-0 right-14 z-30 pt-1.5 pb-4 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
          >
            <div className="pl-14">
              <ModalDragIndicator />
            </div>
          </div>

          <button 
            type="button"
            onClick={dismissWithSlideOut} 
            className="absolute top-4 right-4 z-[120] w-8 h-8 flex items-center justify-center bg-[#1a1a1a] hover:bg-[#262626] border border-[#D4AF37]/40 rounded-full text-[#D4AF37] transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] shadow-xl cursor-pointer" 
            aria-label="Close booking modal"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="simcha-success-ambient-glow absolute -top-40 -left-40 w-80 h-80 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="simcha-success-ambient-glow absolute -bottom-40 -right-40 w-80 h-80 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col items-center justify-center text-center w-full my-auto px-2 relative z-10">
            <div className="w-16 h-16 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center mb-5 shadow-lg">
              <Check className="w-9 h-9 text-[#D4AF37] stroke-[3]" />
            </div>
            
            <h2 className="text-2xl md:text-3xl font-bold font-[Cinzel] text-[#D4AF37] tracking-wider text-center w-full mx-auto break-words mb-4 uppercase">
              {submitType === 'add' ? 'Added to Plan' : 'Booking Request Received'}
            </h2>
            
            <p className="text-center w-full max-w-sm mx-auto text-sm md:text-base whitespace-normal text-zinc-200 leading-relaxed mb-8 font-light">
              {submitType === 'add'
                ? 'Your booking has been added to your plan. Go to plan to finalize.'
                : 'Your booking request has been sent to the vendor! We will notify you once they confirm. You can check the status anytime in your Events.'
              }
            </p>
              
            {submitType === 'add' ? (
              <div className="w-full max-w-xs mx-auto flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleGoToPlanAction}
                  className="flex-1 bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black py-3.5 rounded-full text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-xl shadow-[#D4AF37]/20 hover:shadow-[#D4AF37]/30 outline-none hover:scale-[1.02] active:scale-[0.98] cursor-pointer text-center"
                >
                  Go to Plan
                </button>
                <button
                  type="button"
                  onClick={handleDoneAction}
                  className="px-5 py-3.5 rounded-full border border-white/20 text-zinc-300 hover:text-white hover:border-white/40 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer text-center"
                >
                  Dismiss
                </button>
              </div>
            ) : (
              <div className="w-full max-w-xs mx-auto flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleGoToEventsAction}
                  className="flex-1 bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black py-3.5 rounded-full text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-xl shadow-[#D4AF37]/20 hover:shadow-[#D4AF37]/30 outline-none hover:scale-[1.02] active:scale-[0.98] cursor-pointer text-center"
                >
                  View in Events
                </button>
                <button
                  type="button"
                  onClick={handleDoneAction}
                  className="px-5 py-3.5 rounded-full border border-white/20 text-zinc-300 hover:text-white hover:border-white/40 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer text-center"
                >
                  I'm Done
                </button>
              </div>
            )}
          </div>
        </motion.div>
      ) : (
      <motion.div 
        key="booking-form"
        {...dragModalProps}
        transition={MODAL_TRANSITION}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`simcha-booking-modal-sheet simcha-modal-gpu-wrapper will-change-transform transform-gpu bg-[#111] w-full ${isNested ? 'h-full sm:max-w-full rounded-t-[2.5rem] rounded-b-none' : 'sm:w-full sm:max-w-xl h-[93dvh] sm:h-auto sm:max-h-[88vh] rounded-t-[2.5rem] rounded-b-none sm:rounded-2xl'} border-t-2 border-r border-l sm:border border-[#D4AF37]/30 shadow-2xl overflow-hidden relative flex flex-col mt-auto sm:mt-0 ${isDismissing ? 'pointer-events-none' : ''}`}
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

        {/* Floating close button rendered at root z-[120] top-4 right-4 - identical to QuickViewModal */}
        <button 
          type="button"
          onClick={dismissWithSlideOut} 
          disabled={isSubmitting}
          className={`absolute top-4 right-4 z-[120] w-8 h-8 flex items-center justify-center bg-[#1a1a1a] hover:bg-[#262626] border border-[#D4AF37]/40 rounded-full text-[#D4AF37] transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] shadow-xl cursor-pointer ${isSubmitting ? 'pointer-events-none opacity-30' : ''}`} 
          aria-label="Close booking modal"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Top Add-on Photo Showcase Banner (fades in smoothly when a selected add-on has a picture) */}
        <AnimatePresence initial={false}>
          {activePhotoService && activePhotoService.image && (() => {
            const rawBannerNote = (activePhotoService.unit || '').trim();
            const bannerNote = rawBannerNote && !['item', 'location', 'hour', 'hours', 'service', 'package'].includes(rawBannerNote.toLowerCase())
              ? rawBannerNote
              : '';
            return (
              <motion.div
                key="booking-addon-photo-banner"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="simcha-addon-banner-wrap relative w-full shrink-0 overflow-hidden bg-black border-b border-[#D4AF37]/25"
              >
                <div className="relative w-full h-44 sm:h-52 overflow-hidden">
                  <motion.img
                    key={activePhotoService.image}
                    src={activePhotoService.image}
                    alt={activePhotoService.name}
                    initial={{ opacity: 0, scale: 1.03 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    className="w-full h-full object-cover object-center select-none"
                  />
                  {/* Mode-aware light bottom fade so gold description stands out while keeping add-on photo crisp */}
                  <div className="pointer-events-none absolute inset-0 simcha-addon-banner-fader" />

                  {/* Selected Add-on Name & Description on the Photo Fade in Gold */}
                  <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-3.5 pt-8 flex flex-col items-start justify-end">
                    <div className="flex flex-wrap items-center justify-between gap-2 w-full">
                      <div className="min-w-0">
                        <span className="simcha-addon-banner-title text-[10px] font-black uppercase tracking-[0.25em] text-[#D4AF37] block">
                          {activePhotoService.name}
                        </span>
                        {bannerNote ? (
                          <p className="simcha-addon-banner-sub text-xs sm:text-sm font-extrabold text-[#D4AF37] tracking-wide mt-0.5 leading-snug">
                            {bannerNote}
                          </p>
                        ) : (
                          <p className="simcha-addon-banner-sub text-xs font-bold text-[#D4AF37] tracking-wide mt-0.5">
                            ${activePhotoService.price.toLocaleString()} Selected Option
                          </p>
                        )}
                      </div>

                      {selectedServicesWithPhotos.length > 1 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {selectedServicesWithPhotos.map((svc) => {
                            const isCurrent = svc.id === activePhotoService.id;
                            return (
                              <button
                                key={svc.id}
                                type="button"
                                onClick={() => setActiveShowcaseServiceId(svc.id)}
                                className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border transition-all cursor-pointer ${
                                  isCurrent
                                    ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                                    : 'simcha-addon-pill-btn bg-black/70 text-[#D4AF37] border-[#D4AF37]/40 hover:border-[#D4AF37]'
                                }`}
                              >
                                {svc.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })()}
        </AnimatePresence>

        <div 
          ref={formScrollRef}
          className={`flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y px-6 pt-7 pb-6 space-y-5 ${isSubmitting ? 'pointer-events-none' : ''}`}
        >
          <div className="text-center pb-0.5 space-y-2">
            <h2 id="modal-title" className="text-xl sm:text-2xl font-bold font-[Cinzel] text-[#D4AF37] tracking-wider leading-tight">
              {vendor.name}
            </h2>
            {(() => {
              const socialItems = getVendorSocialItems(vendor.socialLinks);
              if (socialItems.length === 0) return null;
              return (
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-0.5">
                  {socialItems.map((item) => (
                    <a
                      key={item.platform}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`${item.label}: ${item.handleDisplay}`}
                      className="h-7 px-2.5 rounded-full bg-black/60 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border border-[#D4AF37]/35 hover:border-[#D4AF37] text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    >
                      <BookingSocialIcon platform={item.platform} className="w-3 h-3 shrink-0" />
                      <span className="truncate max-w-[120px]">{item.handleDisplay}</span>
                      <ExternalLink className="w-2.5 h-2.5 opacity-70 shrink-0" />
                    </a>
                  ))}
                </div>
              );
            })()}
          </div>

          {vendor.enableDateCheckLimit !== false && (
            <div className="simcha-date-limit-box relative overflow-hidden bg-black/90 rounded-3xl p-5 sm:p-6 text-center mb-5 space-y-2.5 transition-all">
              <div className="simcha-date-limit-glare pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-gradient-to-b from-[#FFE885]/25 to-transparent blur-xl" />
              <div className="relative z-10 flex flex-col items-center justify-center gap-2">
                <span className="text-[11px] sm:text-xs font-black uppercase tracking-[0.22em] text-[#D4AF37]">
                  Date Check Limit
                </span>
                <div className="flex flex-wrap items-center justify-center gap-2 text-sm sm:text-base font-bold text-zinc-100">
                  <span className="simcha-gold-attempts-pill inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs sm:text-sm font-black uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 shrink-0 text-black" />
                    {getRemainingAttempts()} of {vendor.maxDateChecks ?? 5} attempts remaining
                  </span>
                </div>
                <p className="text-zinc-300 text-xs sm:text-sm font-semibold">
                  Resets every <span className="text-[#D4AF37] font-black">{vendor.dateCheckResetHours ?? 24} hours</span> — please select only the dates you need
                </p>
              </div>
              {privacyBlocked && (
                <p className="relative z-10 text-red-400 text-xs sm:text-sm font-bold leading-relaxed pt-1">
                  Date check limit reached for this vendor. Previously checked dates can still be selected, but other dates are locked until reset.
                </p>
              )}
            </div>
          )}

          <div className="space-y-3">
            <label className={labelClass}>Event Date</label>
            
            {/* Elegant luxury display of Selected Date as pill-shaped action picker */}
            <motion.button
              key={`date-trigger-${datePopKey}`}
              initial={datePopKey > 0 ? { scale: 0.95 } : false}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 20 }}
              type="button"
              id="date-section"
              onClick={handleToggleCalendar}
              aria-expanded={isCalendarOpen}
              className={`w-full flex items-center gap-3.5 px-5 py-3 bg-black hover:bg-neutral-900 border rounded-full transition-colors outline-none focus:ring-1 focus:ring-[#D4AF37] text-left cursor-pointer ${
                highlightedField === 'date-section'
                  ? 'border-red-500 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                  : isCalendarOpen
                  ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/40 shadow-[0_0_18px_rgba(212,175,55,0.22)]'
                  : datePopKey > 0
                  ? 'border-[#D4AF37]/60 shadow-[0_0_14px_rgba(212,175,55,0.18)]'
                  : 'border-[#D4AF37]/30 hover:border-[#D4AF37]/60'
              }`}
            >
              <Calendar className="w-5 h-5 text-[#D4AF37] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#D4AF37]/60 block" style={{ textShadow: "0 0 4px rgba(212,175,55,0.1)" }}>Selected Celebration Date</span>
                <motion.span
                  key={`date-val-${localDate}-${datePopKey}`}
                  initial={datePopKey > 0 ? { scale: 1.15 } : false}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                  className="text-sm font-black text-zinc-100 font-[Cinzel] tracking-wide block truncate origin-left"
                >
                  {getReadableLocalDate()}
                </motion.span>
              </div>
            </motion.button>
          </div>

          {vendor.services && vendor.services.length > 0 && (() => {
            const groupedServices: {
              type: ServiceCategoryType;
              title: string;
              subtitle: string;
              icon: any;
              singleSelect: boolean;
              items: VendorService[];
            }[] = [
              {
                type: 'location' as ServiceCategoryType,
                title: 'Locations',
                subtitle: 'Select one location & adjust hours',
                icon: MapPin,
                singleSelect: true,
                items: vendor.services.filter(s => inferServiceCategory(s) === 'location')
              },
              {
                type: 'amenities' as ServiceCategoryType,
                title: 'Add-ons & Extras',
                subtitle: 'Select add-ons & extras',
                icon: Sparkles,
                singleSelect: false,
                items: vendor.services.filter(s => inferServiceCategory(s) === 'amenities')
              }
            ].filter(group => group.items.length > 0);

            return (
              <div id="packages-section" role="group" aria-labelledby="packages-section-label" className={`w-full min-w-0 space-y-3 rounded-2xl transition-all duration-300 ${highlightedField === 'packages-section' ? 'ring-2 ring-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : ''}`}>
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <span id="packages-section-label" className={labelClass}>Select Your Options</span>
                  {(vendor.downPayment ?? 0) > 0 && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-2.5 py-1 rounded-full">
                      Optional Down Payment: ${vendor.downPayment?.toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 w-full">
                  {groupedServices.map((group) => {
                    const GroupIcon = group.icon;
                    const bgImage = group.items.find(i => i.image)?.image || vendor.image;
                    const selectedInGroupCount = group.items.filter(i => selectedServiceIds.includes(i.id)).length;
                    const hasSelectedInGroup = selectedInGroupCount > 0;

                    return (
                      <div
                        key={group.type}
                        className={`simcha-package-card w-full relative overflow-hidden rounded-2xl border transition-all p-3.5 ${
                          hasSelectedInGroup
                            ? 'border-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.16)] bg-black'
                            : 'border-[#D4AF37]/25 hover:border-[#D4AF37]/50 bg-black'
                        }`}
                      >
                        {/* Crisp background image with very light mode-aware fader */}
                        {bgImage && (
                          <div className="pointer-events-none absolute inset-0 overflow-hidden">
                            <img
                              src={bgImage}
                              alt=""
                              className="simcha-package-bg-img w-full h-full object-cover object-center opacity-35 scale-105"
                            />
                            <div className="absolute inset-0 simcha-package-fader" />
                          </div>
                        )}

                        <div className="relative z-10 space-y-2">
                          <div className="flex items-center justify-between border-b border-[#D4AF37]/15 pb-1.5">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
                                <GroupIcon className="w-3.5 h-3.5" />
                              </div>
                              <div>
                                <h4 className="text-xs font-black uppercase tracking-widest text-[#D4AF37] font-[Cinzel] leading-none">
                                  {group.title}
                                </h4>
                                <p className="text-[9px] text-zinc-400 font-semibold mt-0.5">{group.subtitle}</p>
                              </div>
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
                              {group.singleSelect
                                ? (hasSelectedInGroup ? '1 Selected' : 'Choose 1')
                                : `${selectedInGroupCount}/${group.items.length} Selected`}
                            </span>
                          </div>

                          {/* Wide Pill-Shaped Checkpoints Stack inside the single box */}
                          <div className="grid grid-cols-1 gap-2.5 max-h-56 overflow-y-auto pt-3.5 -mt-2 pr-0.5">
                            {group.items.map((service) => {
                              const isSelected = selectedServiceIds.includes(service.id);
                              const isLocationGroup = group.type === 'location';
                              const canMultiple = !group.singleSelect && !!service.allowQuantity;
                              const qty = quantities[service.id] || 1;
                              const baseHours = service.defaultHours ?? 3;
                              const hourlyRate = service.hourlyRate ?? 100;
                              const currentHours = locationHours[service.id] ?? baseHours;
                              const extraHours = Math.max(0, currentHours - baseHours);
                              const displayPrice = isLocationGroup
                                ? service.price + (extraHours * hourlyRate)
                                : service.price * (isSelected ? qty : 1);
                              const activePopup = hourPopups[service.id];
                              const rawNote = (service.unit || '').trim();
                              const shortNote = !isLocationGroup && rawNote && !['item', 'location', 'hour', 'hours', 'service', 'package'].includes(rawNote.toLowerCase())
                                ? rawNote
                                : '';

                              return (
                                <div
                                  key={service.id}
                                  onClick={() => toggleService(service.id)}
                                  role="checkbox"
                                  aria-checked={isSelected}
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === ' ' || e.key === 'Enter') {
                                      e.preventDefault();
                                      toggleService(service.id);
                                    }
                                  }}
                                  className={`simcha-package-option-row w-full relative h-11 rounded-full border transition-all px-4 flex items-center justify-between gap-3 cursor-pointer select-none ${
                                    isSelected
                                      ? 'simcha-package-option-selected bg-[#D4AF37]/12 border-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.12)]'
                                      : 'bg-black/60 border-[#D4AF37]/15 hover:border-[#D4AF37]/45'
                                  }`}
                                >
                                  {/* Left: Checkbox + Name + Photo Icon Indicator */}
                                  <div className={`flex items-center gap-2 min-w-0 ${(isLocationGroup || canMultiple) ? 'max-w-[42%] sm:max-w-[44%]' : 'flex-1 pr-2'}`}>
                                    <div
                                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                        isSelected
                                          ? 'bg-[#D4AF37] border-[#D4AF37]'
                                          : 'bg-black/50 border-zinc-500'
                                      }`}
                                    >
                                      {isSelected && <Check className="w-2.5 h-2.5 text-black stroke-[3]" />}
                                    </div>
                                    <span className="text-xs sm:text-[13px] font-bold text-white truncate">
                                      {service.name}
                                    </span>
                                    {!service.image && shortNote && (
                                      <span className="text-[9px] sm:text-[10px] font-bold text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-2 py-0.5 rounded-full shrink-0 truncate max-w-[90px] sm:max-w-[130px]">
                                        {shortNote}
                                      </span>
                                    )}
                                  </div>

                                  {/* Center: Exact Middle Plus/Minus Control */}
                                  {isLocationGroup && (
                                    <div
                                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center justify-center shrink-0 leading-none"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {activePopup && (
                                        <span
                                          key={activePopup.id}
                                          className="simcha-price-popup-fade pointer-events-none absolute -top-4 left-1/2 z-30 bg-[#D4AF37] text-black text-[9px] font-black px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(212,175,55,0.65)] whitespace-nowrap"
                                        >
                                          {activePopup.text}
                                        </span>
                                      )}
                                      <span className="text-[7px] font-black uppercase tracking-widest text-[#D4AF37] leading-none mb-0.5">
                                        Hours
                                      </span>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (currentHours > baseHours) {
                                              const nextHours = currentHours - 1;
                                              setLocationHours(prev => ({ ...prev, [service.id]: nextHours }));
                                              if (hourlyRate > 0) {
                                                triggerHourPopup(service.id, `-$${hourlyRate.toLocaleString()}`);
                                              }
                                            }
                                          }}
                                          disabled={currentHours <= baseHours}
                                          className="w-5 h-5 rounded-full bg-black/80 border border-[#D4AF37]/40 hover:border-[#D4AF37] disabled:opacity-35 text-[#D4AF37] flex items-center justify-center text-xs font-black leading-none transition-colors cursor-pointer disabled:cursor-default"
                                          aria-label={`Decrease ${service.name} hours`}
                                        >
                                          <span aria-hidden="true">-</span>
                                        </button>
                                        <span className="text-[10px] font-black text-zinc-100 min-w-[14px] text-center tabular-nums">
                                          {currentHours}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (!isSelected) {
                                              const allServices = vendor.services || [];
                                              const otherLocIds = allServices
                                                .filter(s => s.id !== service.id && inferServiceCategory(s) === 'location')
                                                .map(s => s.id);
                                              setSelectedServiceIds(prev => [
                                                ...prev.filter(id => !otherLocIds.includes(id)),
                                                service.id
                                              ]);
                                              setQuantities(qPrev => {
                                                const next = { ...qPrev };
                                                otherLocIds.forEach(id => delete next[id]);
                                                next[service.id] = 1;
                                                return next;
                                              });
                                            }
                                            const nextHours = currentHours + 1;
                                            setLocationHours(prev => ({ ...prev, [service.id]: nextHours }));
                                            triggerHourPopup(service.id, `+$${hourlyRate.toLocaleString()}`);
                                          }}
                                          className="w-5 h-5 rounded-full bg-black/80 border border-[#D4AF37]/40 hover:border-[#D4AF37] text-[#D4AF37] flex items-center justify-center text-xs font-black leading-none transition-colors cursor-pointer"
                                          aria-label={`Increase ${service.name} hours`}
                                        >
                                          <span aria-hidden="true">+</span>
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {canMultiple && (
                                    <div
                                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex items-center gap-1 shrink-0"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {activePopup && (
                                        <span
                                          key={activePopup.id}
                                          className="simcha-price-popup-fade pointer-events-none absolute -top-4 left-1/2 z-30 bg-[#D4AF37] text-black text-[9px] font-black px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(212,175,55,0.65)] whitespace-nowrap"
                                        >
                                          {activePopup.text}
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!isSelected) return;
                                          if (qty > 1) {
                                            handleQuantityChange(service.id, String(qty - 1));
                                            triggerHourPopup(service.id, `-$${service.price.toLocaleString()}`);
                                          } else {
                                            toggleService(service.id);
                                          }
                                        }}
                                        className="w-5 h-5 rounded-full bg-black/80 border border-[#D4AF37]/40 hover:border-[#D4AF37] text-[#D4AF37] flex items-center justify-center text-xs font-black leading-none transition-colors cursor-pointer"
                                        aria-label={`Decrease ${service.name} quantity`}
                                      >
                                        <span aria-hidden="true">-</span>
                                      </button>
                                      <span className="text-[10px] font-black text-zinc-200 min-w-[14px] text-center tabular-nums">
                                        {qty}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!isSelected) {
                                            setSelectedServiceIds(prev => (prev.includes(service.id) ? prev : [...prev, service.id]));
                                            setQuantities(prev => ({ ...prev, [service.id]: 2 }));
                                          } else {
                                            handleQuantityChange(service.id, String(qty + 1));
                                          }
                                          triggerHourPopup(service.id, `+$${service.price.toLocaleString()}`);
                                        }}
                                        className="w-5 h-5 rounded-full bg-black/80 border border-[#D4AF37]/40 hover:border-[#D4AF37] text-[#D4AF37] flex items-center justify-center text-xs font-black leading-none transition-colors cursor-pointer"
                                        aria-label={`Increase ${service.name} quantity`}
                                      >
                                        <span aria-hidden="true">+</span>
                                      </button>
                                    </div>
                                  )}

                                  {/* Right: Price */}
                                  <span className="ml-auto text-[11px] font-black text-[#D4AF37] shrink-0 tracking-wide whitespace-nowrap tabular-nums">
                                    ${displayPrice.toLocaleString()}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <div className="space-y-5">
            <FloatingInput 
              id="event-name" 
              required 
              label="Event Name" 
              icon={PartyPopper} 
              value={formData.eventName} 
              onChange={handleEventNameChange} 
              highlighted={highlightedField === 'event-name'}
            />
            
            <div className="grid grid-cols-2 gap-4">
              {/* Compact Luxury Time Trigger Button with Pop-Out Animation */}
              <motion.button
                key={`time-trigger-${timePopKey}`}
                initial={timePopKey > 0 ? { scale: 0.94 } : false}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 20 }}
                type="button"
                id="event-time"
                onClick={handleToggleTimePicker}
                aria-expanded={isTimePickerOpen}
                className={`relative w-full bg-black/60 border rounded-full text-left outline-none transition-colors duration-300 pt-5 pb-2 pl-11 pr-4 cursor-pointer flex items-center justify-between gap-1.5 group ${
                  highlightedField === 'event-time'
                    ? 'border-red-500 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                    : isTimePickerOpen
                    ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/40 shadow-[0_0_18px_rgba(212,175,55,0.25)]'
                    : timePopKey > 0
                    ? 'border-[#D4AF37]/60 shadow-[0_0_14px_rgba(212,175,55,0.18)]'
                    : 'border-[#D4AF37]/20 hover:border-[#D4AF37]/55'
                }`}
              >
                <Clock
                  className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-all duration-300 ${
                    isTimePickerOpen
                      ? 'text-[#D4AF37] scale-110'
                      : highlightedField === 'event-time'
                      ? 'text-red-500 scale-110'
                      : 'text-[#D4AF37]/60 group-hover:text-[#D4AF37]'
                  }`}
                />
                <span
                  className={`absolute pointer-events-none transition-all duration-300 leading-none left-11 ${
                    isTimePickerOpen || formData.eventTime
                      ? 'top-2 text-[9px] text-[#D4AF37] font-black uppercase tracking-widest'
                      : 'top-3.5 text-xs text-zinc-300 font-medium'
                  }`}
                >
                  Time
                </span>
                <motion.span
                  key={`time-val-${formData.eventTime}-${timePopKey}`}
                  initial={timePopKey > 0 ? { scale: 1.22 } : false}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                  className="text-xs sm:text-sm font-black font-[Cinzel] tracking-wide text-zinc-100 truncate block min-h-[1.25rem] origin-left"
                >
                  {formData.eventTime ? formatTime12h(formData.eventTime) : ''}
                </motion.span>
              </motion.button>

              <FloatingInput 
                id="client-name" 
                required 
                label="Your Name" 
                icon={User} 
                value={formData.clientName} 
                onChange={handleClientNameChange} 
                highlighted={highlightedField === 'client-name'}
              />
            </div>

            {!isVenue && (
              <LocationAutocomplete 
                id="event-location" 
                required 
                label="Location" 
                icon={MapPin} 
                value={formData.eventLocation} 
                onChange={handleLocationChange} 
                highlighted={highlightedField === 'event-location'}
                floating
              />
            )}

            <FloatingInput 
              id="client-email" 
              required 
              label="Email Address" 
              type="email" 
              icon={Mail} 
              value={formData.contactEmail} 
              onChange={handleEmailChange} 
              highlighted={highlightedField === 'client-email'}
            />

            <FloatingTextarea 
              id="booking-notes" 
              label="Special Requests / Custom Notes" 
              icon={MessageSquare} 
              value={formData.notes} 
              onChange={handleNotesChange} 
            />
          </div>

          <div className="flex flex-col gap-3 pt-4 border-t border-[#D4AF37]/20">
             <div className="flex justify-between items-end">
                <div className="flex flex-col">
                    <span className="text-zinc-300 text-[10px] uppercase tracking-widest font-black">{isOfferMode ? 'My Proposed Price' : 'Estimated Total'}</span>
                    <div className="flex items-center gap-2">
                        {isOfferMode ? (
                            <div className="flex items-center text-3xl font-bold text-white">
                                <span className="text-[#D4AF37] mr-1">$</span>
                                <input 
                                    type="number" 
                                    value={offeredPrice} 
                                    onChange={handleOfferedPriceChange} 
                                    className="bg-transparent border-b-2 border-[#D4AF37] w-32 focus:outline-none" 
                                    placeholder="Price"
                                    autoFocus
                                />
                            </div>
                        ) : (
                            <span className="text-3xl font-bold text-[#D4AF37]" aria-live="polite">${totalAmount.toLocaleString()}</span>
                        )}
                    </div>
                </div>
                {vendor.allowOffers && !isOfferMode && (
                    <button 
                        type="button" 
                        onClick={handleEnableOfferMode}
                        className="text-[10px] font-black text-[#D4AF37] border border-[#D4AF37]/30 px-3 py-1.5 rounded-full hover:bg-[#D4AF37]/10 transition-all uppercase tracking-widest cursor-pointer"
                    >
                        Make an Offer
                    </button>
                )}
                {isOfferMode && (
                    <button 
                        type="button" 
                        onClick={handleDisableOfferMode}
                        className="text-[10px] font-black text-zinc-300 hover:text-white transition-all uppercase tracking-widest cursor-pointer"
                    >
                        Standard Price
                    </button>
                )}
             </div>
             {isOfferMode && <p className="text-[10px] text-zinc-300 leading-relaxed italic">Propose your desired price to the vendor. They will review and respond to your inquiry.</p>}
          </div>

          {/* Compact Priority Button + Info Popover */}
          <div className="flex items-center justify-center pt-1">
            <div ref={priorityInfoWrapRef} className="relative inline-flex items-center gap-2">
              <button
                type="button"
                onClick={handleTogglePriority}
                role="switch"
                aria-checked={isPriorityDate}
                className={`h-8 px-4 rounded-full text-[11px] font-black uppercase tracking-[0.16em] transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] hover:scale-105 active:scale-95 ${
                  isPriorityDate
                    ? 'bg-[#D4AF37] text-black border border-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.35)] hover:bg-[#E5C76B]'
                    : 'bg-black/80 text-[#D4AF37] border border-[#D4AF37]/45 hover:border-[#D4AF37] hover:bg-[#D4AF37]/10'
                }`}
              >
                {isPriorityDate && <Check className="w-3.5 h-3.5 text-black stroke-[3] shrink-0" />}
                <span>Priority</span>
              </button>

              <button
                type="button"
                onClick={handleTogglePriorityInfo}
                aria-label="What does Priority do?"
                aria-expanded={showPriorityInfo}
                className={`w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-black transition-all duration-200 cursor-pointer select-none shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] hover:scale-105 active:scale-95 ${
                  showPriorityInfo
                    ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.4)]'
                    : 'bg-[#0a0a0a] text-[#D4AF37] border-[#D4AF37]/50 hover:border-[#D4AF37] hover:bg-[#D4AF37]/10'
                }`}
              >
                ?
              </button>

              {showPriorityInfo && (
                <div
                  role="tooltip"
                  onClick={(e) => e.stopPropagation()}
                  className="simcha-priority-popover absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 w-64 sm:w-72 z-40 bg-[#0a0a0a] border border-[#D4AF37]/50 rounded-xl p-3 shadow-[0_12px_30px_rgba(0,0,0,0.85),0_0_18px_rgba(212,175,55,0.14)] text-center animate-in fade-in zoom-in-95 duration-150"
                >
                  <p className="text-[11px] sm:text-xs text-zinc-200 font-medium leading-relaxed">
                    Setting this priority after submitting will instantly recommend vendors available on this date.
                  </p>
                  <div className="simcha-priority-popover-arrow w-2.5 h-2.5 bg-[#0a0a0a] border-r border-b border-[#D4AF37]/50 rotate-45 absolute -bottom-[6px] left-[calc(50%+2.25rem)] -translate-x-1/2" />
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-row gap-4 w-full mt-4">
            <button 
                type="button" 
                onClick={handleAddClick}
                className="flex-1 py-3.5 border border-[#D4AF37] text-[#D4AF37] font-semibold rounded-full hover:bg-[#D4AF37] hover:text-black transition-all text-xs uppercase tracking-widest outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] duration-200 cursor-pointer hover:scale-105 active:scale-95"
            >
                Add to Plan
            </button>
            <button 
                type="button" 
                onClick={handleBookClick}
                className="flex-1 py-3.5 rounded-full text-xs font-black uppercase tracking-widest transition-all shadow-lg border bg-[#D4AF37] text-black hover:bg-[#E5C76B] border-[#D4AF37]/20 hover:scale-105 active:scale-95 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] duration-200"
            >
                {isOfferMode ? 'Send Offer' : 'Book Now'}
            </button>
          </div>
        </div>

        {/* Floating Centered Pop-Out Overlays Above the Modal Screen (Calendar & Simcha Booking Watch) */}
        <AnimatePresence>
          {isCalendarOpen && (
            <motion.div
              key="floating-calendar-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setIsCalendarOpen(false)}
              className="simcha-booking-inner-overlay absolute inset-0 z-[130] bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.76, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.74, y: 10 }}
                transition={{ type: 'spring', stiffness: 420, damping: 26 }}
              >
                {renderInteractiveCalendar()}
              </motion.div>
            </motion.div>
          )}

          {isTimePickerOpen && (() => {
            const { hour: activeHour, minute: activeMinute, period: activePeriod } = parseTimeParts12h(formData.eventTime);
            const clockHours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
            const clockMinutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
            const handAngleDeg = watchDialMode === 'hour'
              ? ((activeHour % 12) * 30)
              : (activeMinute * 6);

            return (
              <motion.div
                key="floating-watch-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={() => {
                  setIsTimePickerOpen(false);
                  setTimePopKey(k => k + 1);
                }}
                className="simcha-booking-inner-overlay absolute inset-0 z-[130] bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.76, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.74, y: 10 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                  onClick={(e) => e.stopPropagation()}
                  className="simcha-luxury-watch-card relative w-[256px] sm:w-[268px] bg-[#060606] border border-[#D4AF37]/50 rounded-[2.25rem] p-4 shadow-[0_22px_55px_rgba(0,0,0,0.9),0_0_28px_rgba(212,175,55,0.22)] select-none flex flex-col items-center overflow-hidden"
                >
                  {/* Ambient radial gold glow behind the watch dial */}
                  <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-24 bg-[#D4AF37]/15 rounded-full blur-2xl" />

                  {/* Top Pop-Out Time Badge + AM/PM Switch */}
                  <div className="relative z-10 flex items-center justify-between w-full gap-2 mb-3 pb-2.5 border-b border-[#D4AF37]/20">
                    <motion.div
                      key={`${activeHour}-${activeMinute}`}
                      initial={{ scale: 1.08 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                      className="simcha-watch-digital-box flex items-center bg-black border border-[#D4AF37]/45 rounded-full px-2.5 py-1 shadow-[0_0_14px_rgba(212,175,55,0.18)]"
                    >
                      <button
                        type="button"
                        onClick={() => setWatchDialMode('hour')}
                        className={`px-2 py-0.5 rounded-full font-[Cinzel] text-sm font-black tracking-wider transition-all cursor-pointer ${
                          watchDialMode === 'hour'
                            ? 'bg-[#D4AF37] text-black shadow-[0_0_10px_rgba(212,175,55,0.45)]'
                            : 'text-[#D4AF37] hover:text-[#FFE885]'
                        }`}
                      >
                        {String(activeHour).padStart(2, '0')}
                      </button>
                      <span className="text-[#D4AF37] font-black px-0.5 text-sm animate-pulse">:</span>
                      <button
                        type="button"
                        onClick={() => setWatchDialMode('minute')}
                        className={`px-2 py-0.5 rounded-full font-[Cinzel] text-sm font-black tracking-wider transition-all cursor-pointer ${
                          watchDialMode === 'minute'
                            ? 'bg-[#D4AF37] text-black shadow-[0_0_10px_rgba(212,175,55,0.45)]'
                            : 'text-[#D4AF37] hover:text-[#FFE885]'
                        }`}
                      >
                        {String(activeMinute).padStart(2, '0')}
                      </button>
                    </motion.div>

                    {/* 12-Hour AM / PM Gold Switch */}
                    <div className="simcha-watch-ampm-box flex items-center bg-black border border-[#D4AF37]/45 rounded-full p-0.5">
                      {(['AM', 'PM'] as const).map((periodOpt) => {
                        const isCurrentPeriod = activePeriod === periodOpt;
                        return (
                          <button
                            key={periodOpt}
                            type="button"
                            onClick={() => handleSelectWatchTime(activeHour, activeMinute, periodOpt)}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                              isCurrentPeriod
                                ? 'bg-[#D4AF37] text-black shadow-[0_0_10px_rgba(212,175,55,0.45)]'
                                : 'text-zinc-400 hover:text-[#D4AF37]'
                            }`}
                          >
                            {periodOpt}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Restored Luxury Horology Watch Dial with "SIMCHA • BOOKING WATCH" Inscription */}
                  <div
                    ref={watchDialRef}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      isDraggingWatchRef.current = true;
                      updateWatchFromPointer(e.clientX, e.clientY, watchDialMode, activeHour, activeMinute, activePeriod);
                    }}
                    onPointerMove={(e) => {
                      if (!isDraggingWatchRef.current) return;
                      updateWatchFromPointer(e.clientX, e.clientY, watchDialMode, activeHour, activeMinute, activePeriod);
                    }}
                    onPointerUp={() => {
                      if (!isDraggingWatchRef.current) return;
                      isDraggingWatchRef.current = false;
                      if (watchDialMode === 'hour') {
                        setWatchDialMode('minute');
                      } else {
                        triggerWatchZoomClose();
                      }
                    }}
                    className="simcha-luxury-watch-dial relative w-52 h-52 rounded-full bg-gradient-to-b from-[#111111] via-[#070707] to-[#030303] border-2 border-[#D4AF37]/60 shadow-[0_0_30px_rgba(212,175,55,0.22),inset_0_0_28px_rgba(212,175,55,0.14)] flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
                  >
                    {/* Outer Horology Bezel Ring & 60 Precision Tick Marks */}
                    <svg className="pointer-events-none absolute inset-0 w-full h-full" viewBox="0 0 240 240">
                      <circle cx="120" cy="120" r="114" fill="none" stroke="rgba(212,175,55,0.28)" strokeWidth="1" />
                      <circle cx="120" cy="120" r="76" fill="none" stroke="rgba(212,175,55,0.14)" strokeWidth="1" strokeDasharray="2 4" />
                      {Array.from({ length: 60 }).map((_, idx) => {
                        const isMajor = idx % 5 === 0;
                        const angle = idx * 6;
                        return (
                          <line
                            key={idx}
                            x1="120"
                            y1={isMajor ? '7' : '9'}
                            x2="120"
                            y2={isMajor ? '14' : '12'}
                            stroke={isMajor ? '#D4AF37' : 'rgba(212,175,55,0.3)'}
                            strokeWidth={isMajor ? '1.8' : '0.9'}
                            strokeLinecap="round"
                            transform={`rotate(${angle} 120 120)`}
                          />
                        );
                      })}
                    </svg>

                    {/* Center Watch Face Inscription */}
                    <div className="pointer-events-none absolute top-[27%] left-1/2 -translate-x-1/2 text-center">
                      <span className="font-[Cinzel] text-[8px] font-black uppercase tracking-[0.28em] text-[#D4AF37]/70 block leading-none">
                        SIMCHA
                      </span>
                      <span className="text-[6.5px] font-bold uppercase tracking-[0.18em] text-zinc-400 block mt-0.5">
                        BOOKING WATCH
                      </span>
                    </div>

                    {/* Sweeping Gold Watch Hand */}
                    <div
                      className="pointer-events-none absolute inset-0 transition-transform duration-150 ease-out"
                      style={{ transform: `rotate(${handAngleDeg}deg)` }}
                    >
                      <div className="absolute left-1/2 top-[22%] -translate-x-1/2 w-[2.5px] h-[30%] bg-gradient-to-t from-[#D4AF37] via-[#FFE885] to-[#D4AF37] rounded-full shadow-[0_0_10px_rgba(212,175,55,0.85)]" />
                      <div className="absolute left-1/2 top-[50%] -translate-x-1/2 w-[2px] h-[7%] bg-[#D4AF37]/70 rounded-full" />
                    </div>

                    {/* Center Metallic Gold Jewel Pivot */}
                    <div className="pointer-events-none relative z-20 w-4 h-4 rounded-full bg-gradient-to-br from-[#FFF3B0] via-[#D4AF37] to-[#99731C] border border-[#7B5800] shadow-[0_0_12px_rgba(212,175,55,0.9)] flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#18181b]" />
                    </div>

                    {/* 12 Radial Interactive Hour / Minute Numerals */}
                    {(watchDialMode === 'hour' ? clockHours : clockMinutes).map((val, idx) => {
                      const angleRad = ((idx * 30) - 90) * (Math.PI / 180);
                      const radiusPct = 38.5;
                      const leftPct = 50 + radiusPct * Math.cos(angleRad);
                      const topPct = 50 + radiusPct * Math.sin(angleRad);
                      const isSelectedVal = watchDialMode === 'hour'
                        ? activeHour === val
                        : activeMinute === val;

                      return (
                        <button
                          key={`${watchDialMode}-${val}`}
                          type="button"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => {
                            if (watchDialMode === 'hour') {
                              handleSelectWatchTime(val, activeMinute, activePeriod);
                              setWatchDialMode('minute');
                            } else {
                              handleSelectWatchTime(activeHour, val, activePeriod);
                              triggerWatchZoomClose();
                            }
                          }}
                          style={{ left: `${leftPct}%`, top: `${topPct}%` }}
                          className={`simcha-watch-numeral absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full font-[Cinzel] text-xs font-black transition-all duration-150 flex items-center justify-center cursor-pointer z-20 ${
                            isSelectedVal
                              ? 'bg-[#D4AF37] text-black border-2 border-[#FFE885] shadow-[0_0_16px_rgba(212,175,55,0.85)] scale-110'
                              : 'text-zinc-200 hover:text-[#D4AF37] hover:bg-[#D4AF37]/15 border border-transparent hover:border-[#D4AF37]/40'
                          }`}
                        >
                          {watchDialMode === 'hour' ? val : String(val).padStart(2, '0')}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              </motion.div>
            );
          })()}
        </AnimatePresence>
      </motion.div>
      )}
    </motion.div>
  );
});

export default BookingModal;