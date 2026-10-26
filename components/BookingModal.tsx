import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { X, Star, Calendar, User, Mail, MessageSquare, PartyPopper, MapPin, Clock, Tag, Check, CheckCircle, AlertTriangle, Hash, ChevronLeft, ChevronRight, Image as ImageIcon, Sparkles } from 'lucide-react';
import { Vendor, SelectedService, VendorCategory, VendorService, ServiceCategoryType } from '../types';
import LocationAutocomplete from './LocationAutocomplete';
import { useModalDragDismiss, ModalDragIndicator } from './useModalDragDismiss';

const inferServiceCategory = (service: VendorService): ServiceCategoryType => {
  if (service.categoryType) return service.categoryType;
  const text = `${service.name} ${service.unit || ''}`.toLowerCase();
  if (/\b(location|lakewood|brooklyn|monsey|boro park|williamsburg|five towns|queens|manhattan|staten island|new jersey|ny|nj|travel|destination|area|local|out of town)\b/.test(text)) {
    return 'location';
  }
  if (/\b(hour|hours|hr|hrs|time|day|half day|full day|overtime|minute|minutes)\b/.test(text)) {
    return 'hours';
  }
  return 'amenities';
};

const MODAL_TRANSITION = { duration: 1, ease: [0.25, 1, 0.5, 1] as const };

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
          <Icon className={`absolute left-3.5 w-4 h-4 transition-all duration-300 z-10 ${focused ? 'text-[#D4AF37] scale-110' : highlighted ? 'text-red-500 scale-110' : 'text-[#D4AF37]/40'}`} />
        )}
        <input
          id={id}
          type={type}
          required={required}
          value={value}
          onChange={onChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={`w-full bg-black/60 border rounded-xl text-zinc-100 placeholder-transparent focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none transition-all duration-300 pt-6 pb-2 pr-4 ${Icon ? 'pl-10' : 'pl-4'} ${highlighted ? 'border-red-500 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-[#D4AF37]/20'} ${className}`}
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
  onDismissStart?: () => void;
}

const BookingModal: React.FC<BookingModalProps> = React.memo(({ 
  isOpen, onClose, vendor, selectedDate, onConfirm, initialDetails, isPriorityFromSuggestions, onDone, onSuccessStateChange, onGoToPlan, onDismissStart, isNested = false 
}) => {
  const [formData, setFormData] = useState({ eventName: '', clientName: '', contactEmail: '', eventLocation: '', eventTime: '', notes: '' });
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isOfferMode, setIsOfferMode] = useState(false);
  const [submitType, setSubmitType] = useState<'book' | 'add'>('book');
  const [offeredPrice, setOfferedPrice] = useState<string>('');
  const [highlightedField, setHighlightedField] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [localDate, setLocalDate] = useState('');
  const [isPriorityDate, setIsPriorityDate] = useState(false);
  const [privacyBlocked, setPrivacyBlocked] = useState(false);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(() => new Date());

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
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
    if (!vendor) return false;
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

  useEffect(() => {
    if (isOpen) {
        setIsOfferMode(false);
        setOfferedPrice('');
        if (initialDetails) {
            setFormData({ 
              eventName: initialDetails.eventName || '', 
              clientName: initialDetails.clientName || '', 
              contactEmail: initialDetails.contactEmail || '', 
              eventLocation: initialDetails.eventLocation || '', 
              eventTime: initialDetails.eventTime || '', 
              notes: initialDetails.notes || '' 
            });
            setSelectedServiceIds(initialDetails.selectedServiceIds || []);
            setQuantities(initialDetails.selectedServiceQuantities || {});
        } else {
            setFormData({ 
              eventName: '', 
              clientName: '', 
              contactEmail: '', 
              eventLocation: isVenue && vendor ? vendor.location : '', 
              eventTime: '', 
              notes: '' 
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

  const totalAmount = useMemo(() => {
    if (!vendor) return 0;
    
    let servicesTotal = 0;
    if (selectedServiceIds.length > 0) {
      servicesTotal = vendor.services?.filter(s => selectedServiceIds.includes(s.id)).reduce((sum, s) => {
        const qty = quantities[s.id] || 1;
        return sum + (s.price * qty);
      }, 0) || 0;
    }
    
    return servicesTotal || vendor.downPayment || vendor.priceStart || 0;
  }, [selectedServiceIds, quantities, vendor]);

  const toggleService = useCallback((serviceId: string) => {
    setSelectedServiceIds(prev => {
      if (prev.includes(serviceId)) {
        setQuantities(qPrev => {
          const next = { ...qPrev };
          delete next[serviceId];
          return next;
        });
        return prev.filter(id => id !== serviceId);
      } else {
        setQuantities(qPrev => ({ ...qPrev, [serviceId]: 1 }));
        return [...prev, serviceId];
      }
    });
  }, []);

  const handleQuantityChange = useCallback((serviceId: string, val: string) => {
    const num = parseInt(val) || 0;
    setQuantities(prev => ({ ...prev, [serviceId]: Math.max(0, num) }));
  }, []);

  const handleEventNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData(prev => ({ ...prev, eventName: val }));
  }, []);

  const handleEventTimeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData(prev => ({ ...prev, eventTime: val }));
  }, []);

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

  const handlePriorityKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsPriorityDate(prev => !prev);
    }
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent | React.MouseEvent, explicitSubmitType?: 'add' | 'book') => {
    e.preventDefault();
    e.stopPropagation();
    if (!vendor) return;
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
        }
      }
      return;
    }
    
    const selectedServices = vendor.services
        ?.filter(s => selectedServiceIds.includes(s.id))
        .map(s => ({ 
            id: s.id, 
            name: s.name, 
            price: s.price, 
            quantity: quantities[s.id] || 1,
            unit: s.unit || null
        })) || [];
        
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
      setIsSubmitting(false);
    }
  }, [vendor, localDate, hasSelectedPackage, formData, isVenue, isOfferMode, offeredPrice, selectedServiceIds, quantities, submitType, onConfirm, totalAmount, isPriorityDate]);

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
          className={`aspect-square rounded-full flex flex-col items-center justify-center text-xs font-bold transition-all outline-none relative group ${buttonStyle}`}
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
      <div className="bg-[#050505]/95 border border-[#D4AF37]/25 rounded-2xl p-4 shadow-2xl select-none relative overflow-hidden w-full backdrop-blur-xl">
        <div className="absolute inset-0 border border-white/5 pointer-events-none rounded-2xl" />
        
        {/* Header with Navigation */}
        <div className="flex items-center justify-between mb-4 border-b border-[#D4AF37]/15 pb-3">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 rounded-full border border-[#D4AF37]/10 hover:border-[#D4AF37]/40 bg-black text-[#D4AF37] transition-all hover:scale-105 active:scale-95 outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] cursor-pointer"
            aria-label="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <span className="font-[Cinzel] text-[#D4AF37] font-black uppercase tracking-widest text-xs flex items-center gap-1">
            {monthName} <span className="text-white">{year}</span>
          </span>

          <button
            type="button"
            onClick={nextMonth}
            className="p-1.5 rounded-full border border-[#D4AF37]/10 hover:border-[#D4AF37]/40 bg-black text-[#D4AF37] transition-all hover:scale-105 active:scale-95 outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] cursor-pointer"
            aria-label="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Weekdays */}
        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {weekdays.map((wd, idx) => (
            <div key={`wd-${idx}`} className="text-[10px] text-[#D4AF37]/70 font-black uppercase tracking-widest py-1">
              {wd}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7 gap-1.5 mb-2">
          {days}
        </div>

        {/* Concise inline message for tapped unavailable date */}
        {clickedUnavailableDate && (
          <div className="mt-2 p-2.5 bg-red-950/40 border border-red-500/30 rounded-xl text-center text-xs text-red-300 animate-in fade-in duration-200">
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

  const handleDoneAction = useCallback(() => {
    dismissWithSlideOut(() => {
      setIsSuccess(false);
      if (onDone) {
        onDone(isPriority);
      } else {
        onClose();
      }
    });
  }, [dismissWithSlideOut, onDone, isPriority, onClose]);

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
      className={`${isNested ? "absolute inset-0 z-30 bg-black/75 backdrop-blur-sm flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 overflow-hidden" : "fixed inset-0 z-[160] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 bg-black/80 backdrop-blur-md overflow-hidden"} ${isDismissing ? 'pointer-events-none' : ''}`} 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="modal-title"
    >
      {isSubmitting && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center pointer-events-auto">
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
          className={`bg-[#0a0a0a] w-full sm:max-w-md h-[93dvh] sm:h-auto sm:max-h-[88vh] rounded-t-[2.5rem] rounded-b-none sm:rounded-2xl border-t-2 border-r border-l sm:border border-[#D4AF37]/30 relative overflow-hidden shadow-2xl flex flex-col mt-auto sm:mt-0 p-6 md:p-10 text-center transform-gpu ${isDismissing ? 'pointer-events-none' : ''}`}
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

          <div className="absolute -top-40 -left-40 w-80 h-80 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />
          
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
                  className="flex-1 bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black py-3.5 rounded-xl text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-xl shadow-[#D4AF37]/20 hover:shadow-[#D4AF37]/30 outline-none hover:scale-[1.02] active:scale-[0.98] cursor-pointer text-center"
                >
                  Go to Plan
                </button>
                <button
                  type="button"
                  onClick={handleDoneAction}
                  className="px-5 py-3.5 rounded-xl border border-white/20 text-zinc-300 hover:text-white hover:border-white/40 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer text-center"
                >
                  Dismiss
                </button>
              </div>
            ) : (
              <div className="w-full max-w-[220px] mx-auto block">
                <button
                  type="button"
                  onClick={handleDoneAction}
                  className="w-full bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black py-3.5 rounded-xl text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-xl shadow-[#D4AF37]/20 hover:shadow-[#D4AF37]/30 outline-none hover:scale-[1.02] active:scale-[0.98] cursor-pointer text-center mx-auto block"
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
        className={`bg-[#0a0a0a] w-full sm:w-full sm:max-w-xl h-[93dvh] sm:h-auto sm:max-h-[88vh] rounded-t-[2.5rem] rounded-b-none sm:rounded-2xl border-t-2 border-r border-l sm:border border-[#D4AF37]/30 shadow-2xl overflow-hidden relative flex flex-col mt-auto sm:mt-0 transform-gpu ${isDismissing ? 'pointer-events-none' : ''}`}
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

        <div 
          {...dragHandleProps}
          data-drag-handle="true"
          className="bg-black p-6 pr-14 text-white flex justify-between items-start sticky top-0 z-10 border-b border-[#D4AF37]/20 cursor-grab active:cursor-grabbing select-none"
        >
          <div>
            <h2 id="modal-title" className="text-xl font-bold font-[Cinzel] text-[#D4AF37]">{initialDetails ? 'Update Your Selection' : 'Book Service'}</h2>
            <p className="text-zinc-300 text-xs mt-1">Vendor: <span className="text-zinc-100 font-bold">{vendor.name}</span></p>
          </div>
        </div>

        <div 
          ref={formScrollRef}
          className={`flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y p-6 space-y-6 ${isSubmitting ? 'pointer-events-none' : ''}`}
        >
          <div className="simcha-date-limit-box relative overflow-hidden bg-black/90 rounded-3xl p-5 sm:p-6 text-center mb-5 space-y-2.5 transition-all">
            <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-gradient-to-b from-[#FFE885]/25 to-transparent blur-xl" />
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

          <div className="space-y-3">
            <label className={labelClass}>Event Date</label>
            
            {/* Elegant luxury display of Selected Date as action picker */}
            <button
              type="button"
              id="date-section"
              onClick={handleToggleCalendar}
              className={`w-full flex items-center gap-3 p-3 bg-black hover:bg-neutral-900 border rounded-xl transition-all outline-none focus:ring-1 focus:ring-[#D4AF37] text-left cursor-pointer ${highlightedField === 'date-section' ? 'border-red-500 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-[#D4AF37]/30 hover:border-[#D4AF37]/60'}`}
            >
              <Calendar className="w-5 h-5 text-[#D4AF37] flex-shrink-0" />
              <div className="flex-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[#D4AF37]/60 block" style={{ textShadow: "0 0 4px rgba(212,175,55,0.1)" }}>Selected Celebration Date</span>
                <span className="text-sm font-black text-zinc-100 font-[Cinzel] tracking-wide">{getReadableLocalDate()}</span>
              </div>
            </button>
            
            {/* Interactive premium calendar picker inside an animated container */}
            {isCalendarOpen && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200 mt-2 relative z-20">
                {renderInteractiveCalendar()}
              </div>
            )}
          </div>

          {vendor.services && vendor.services.length > 0 && (() => {
            const groupedServices: {
              type: ServiceCategoryType;
              title: string;
              subtitle: string;
              icon: any;
              items: VendorService[];
            }[] = [
              {
                type: 'location',
                title: 'Locations',
                subtitle: 'Select location rate',
                icon: MapPin,
                items: vendor.services.filter(s => inferServiceCategory(s) === 'location')
              },
              {
                type: 'hours',
                title: 'Hours',
                subtitle: 'Select duration & time',
                icon: Clock,
                items: vendor.services.filter(s => inferServiceCategory(s) === 'hours')
              },
              {
                type: 'amenities',
                title: 'Amenities & Options',
                subtitle: 'Select add-ons & extras',
                icon: Sparkles,
                items: vendor.services.filter(s => inferServiceCategory(s) === 'amenities')
              }
            ].filter(group => group.items.length > 0);

            return (
              <fieldset id="packages-section" className={`space-y-3 p-3 rounded-2xl transition-all duration-300 ${highlightedField === 'packages-section' ? 'border-2 border-red-500 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border border-transparent'}`}>
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <legend className={labelClass}>Select Your Options</legend>
                  {(vendor.downPayment ?? 0) > 0 && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#D4AF37] bg-[#D4AF37]/10 border border-[#D4AF37]/30 px-2.5 py-1 rounded-full">
                      Optional Down Payment: ${vendor.downPayment?.toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3.5">
                  {groupedServices.map((group) => {
                    const GroupIcon = group.icon;
                    const bgImage = group.items.find(i => i.image)?.image || vendor.image;
                    const hasSelectedInGroup = group.items.some(i => selectedServiceIds.includes(i.id));

                    return (
                      <div
                        key={group.type}
                        className={`relative overflow-hidden rounded-2xl border transition-all p-4 ${
                          hasSelectedInGroup
                            ? 'border-[#D4AF37] shadow-[0_0_18px_rgba(212,175,55,0.16)] bg-black'
                            : 'border-[#D4AF37]/25 hover:border-[#D4AF37]/50 bg-black'
                        }`}
                      >
                        {/* Very light, non-cut-off subtle background image with mode-aware fader */}
                        {bgImage && (
                          <div className="pointer-events-none absolute inset-0 overflow-hidden">
                            <img
                              src={bgImage}
                              alt=""
                              className="w-full h-full object-cover object-center opacity-15 scale-105"
                            />
                            <div className="absolute inset-0 simcha-package-fader" />
                          </div>
                        )}

                        <div className="relative z-10 space-y-2.5">
                          <div className="flex items-center justify-between border-b border-[#D4AF37]/15 pb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
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
                              {group.items.filter(i => selectedServiceIds.includes(i.id)).length}/{group.items.length} Selected
                            </span>
                          </div>

                          {/* Compact Checkpoints Grid inside the single box */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-0.5">
                            {group.items.map((service) => {
                              const isSelected = selectedServiceIds.includes(service.id);
                              return (
                                <div
                                  key={service.id}
                                  className={`rounded-xl border transition-all ${
                                    isSelected
                                      ? 'bg-[#D4AF37]/12 border-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.12)]'
                                      : 'bg-black/60 border-[#D4AF37]/15 hover:border-[#D4AF37]/45'
                                  }`}
                                >
                                  <label className="cursor-pointer flex items-center justify-between gap-2.5 px-3 py-2.5 select-none">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div
                                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                                          isSelected
                                            ? 'bg-[#D4AF37] border-[#D4AF37]'
                                            : 'bg-black/50 border-zinc-500'
                                        }`}
                                      >
                                        {isSelected && <Check className="w-2.5 h-2.5 text-black stroke-[3]" />}
                                      </div>
                                      <span className="text-xs font-bold text-white truncate">
                                        {service.name}
                                      </span>
                                    </div>
                                    <span className="text-[11px] font-black text-[#D4AF37] shrink-0 tracking-wide">
                                      ${service.price.toLocaleString()}
                                      {service.unit && service.unit !== 'event' ? `/${service.unit}` : ''}
                                    </span>
                                    <input
                                      type="checkbox"
                                      className="sr-only"
                                      checked={isSelected}
                                      onChange={() => toggleService(service.id)}
                                    />
                                  </label>

                                  {isSelected && service.allowQuantity && (
                                    <div className="px-3 pb-2.5 pt-1 flex items-center justify-between gap-2 border-t border-[#D4AF37]/15">
                                      <div className="relative flex-1">
                                        <Hash className="absolute left-2.5 top-2 w-3 h-3 text-[#D4AF37]/60" />
                                        <input
                                          type="number"
                                          min="1"
                                          className="w-full bg-black/60 border border-[#D4AF37]/25 rounded-lg pl-7 pr-2 py-1 text-[11px] text-white focus:border-[#D4AF37] outline-none"
                                          placeholder={`Qty (${service.unit || 'units'})`}
                                          value={quantities[service.id] || 1}
                                          onChange={(e) => handleQuantityChange(service.id, e.target.value)}
                                        />
                                      </div>
                                      <span className="text-[9px] font-black text-[#D4AF37] uppercase tracking-wider shrink-0">
                                        =${(service.price * (quantities[service.id] || 1)).toLocaleString()}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            );
          })()}

          <div className="space-y-4">
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
              <FloatingInput 
                id="event-time" 
                required 
                label="Time" 
                type="time" 
                icon={Clock} 
                className="[color-scheme:dark]" 
                value={formData.eventTime} 
                onChange={handleEventTimeChange} 
                highlighted={highlightedField === 'event-time'}
              />
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

          {(!localDate || isPastDate(localDate)) && (
            <div className="mx-6 mt-3 flex items-center justify-between rounded-2xl border border-[#D4AF37]/20 bg-[#0a0a0a] px-4 py-3 opacity-75" aria-disabled="true">
              <div>
                <span className="block text-sm font-bold text-[#D4AF37]">Set date to priority</span>
                <span className="block text-xs text-zinc-500">Select a future event date to enable priority</span>
              </div>
              <span className="relative h-6 w-11 rounded-full bg-zinc-700">
                <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-zinc-400" />
              </span>
            </div>
          )}
          {/* Priority Event Toggle */}
          {localDate && !isPastDate(localDate) && (
            <div 
              onClick={handleTogglePriority}
              onKeyDown={handlePriorityKeyDown}
              role="button"
              tabIndex={0}
              className={`p-5 bg-[#0a0a0a] border rounded-xl space-y-3 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center text-center outline-none select-none ${
                isPriorityDate 
                  ? 'border-[#D4AF37] bg-[#D4AF37]/5 shadow-[0_0_15px_rgba(212,175,55,0.15)]' 
                  : 'border-[#D4AF37]/20 hover:border-[#D4AF37]'
              }`}
            >
              <span className="text-sm font-semibold text-zinc-100 text-center">
                Set date to priority
              </span>
              
               <button 
                type="button"
                onClick={handleTogglePriority}
                role="switch"
                aria-checked={isPriorityDate}
                className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer hover:scale-105 active:scale-95 ${
                  isPriorityDate 
                    ? 'bg-[#D4AF37] text-black border-2 border-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.3)] hover:bg-[#E5C76B]' 
                    : 'border-2 border-[#D4AF37] text-[#D4AF37] bg-transparent hover:scale-105 active:scale-95'
                }`}
              >
                Priority
              </button>

              <p className="text-zinc-400 text-xs mt-2 leading-relaxed text-center max-w-sm">
                Tap to select. After submitting, we will instantly recommend other top vendors that are available on your selected date.
              </p>
            </div>
          )}

          <div className="flex flex-row gap-4 w-full mt-6">
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
      </motion.div>
      )}
    </motion.div>
  );
});

export default BookingModal;