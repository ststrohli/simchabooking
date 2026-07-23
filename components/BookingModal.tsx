import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { X, Star, Calendar, User, Mail, MessageSquare, PartyPopper, MapPin, Clock, Tag, Check, CheckCircle, AlertTriangle, Hash, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
import { Vendor, SelectedService, VendorCategory } from '../types';

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
}> = ({ id, label, icon: Icon, value, onChange, required = false, type = "text", className = "", highlighted = false }) => {
  const [focused, setFocused] = useState(false);
  const isFilled = value !== '';

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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={`w-full bg-black/60 border rounded-xl text-zinc-100 placeholder-transparent focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none transition-all duration-300 pt-6 pb-2 pr-4 ${Icon ? 'pl-10' : 'pl-4'} ${highlighted ? 'border-red-500 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-[#D4AF37]/20'} ${className}`}
          placeholder={label}
        />
        <label
          htmlFor={id}
          className={`absolute pointer-events-none transition-all duration-300 leading-none ${Icon ? 'left-10' : 'left-4'} 
            ${(focused || isFilled) 
              ? 'top-2 text-[9px] text-[#D4AF37] font-black uppercase tracking-widest' 
              : 'top-4 text-xs text-zinc-500 font-medium'
            }`}
        >
          {label}
        </label>
      </div>
    </div>
  );
};

const FloatingTextarea: React.FC<{
  id: string;
  label: string;
  icon: any;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  required?: boolean;
  rows?: number;
  className?: string;
}> = ({ id, label, icon: Icon, value, onChange, required = false, rows = 3, className = "" }) => {
  const [focused, setFocused] = useState(false);
  const isFilled = value !== '';

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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={rows}
          className={`w-full bg-black/60 border border-[#D4AF37]/20 rounded-xl text-zinc-100 placeholder-transparent focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none transition-all duration-300 pt-6 pb-2 pr-4 resize-none ${Icon ? 'pl-10' : 'pl-4'} ${className}`}
          placeholder={label}
        />
        <label
          htmlFor={id}
          className={`absolute pointer-events-none transition-all duration-300 leading-none ${Icon ? 'left-10' : 'left-4'} 
            ${(focused || isFilled) 
              ? 'top-2 text-[9px] text-[#D4AF37] font-black uppercase tracking-widest' 
              : 'top-4 text-xs text-zinc-500 font-medium'
            }`}
        >
          {label}
        </label>
      </div>
    </div>
  );
};

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: Vendor | null;
  selectedDate: string;
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
}

const BookingModal: React.FC<BookingModalProps> = ({ 
  isOpen, onClose, vendor, selectedDate, onConfirm, initialDetails, isPriorityFromSuggestions, onDone 
}) => {
  const [formData, setFormData] = useState({ eventName: '', clientName: '', contactEmail: '', eventLocation: '', eventTime: '', notes: '' });
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isOfferMode, setIsOfferMode] = useState(false);
  const [submitType, setSubmitType] = useState<'book' | 'add'>('book');
  const [offeredPrice, setOfferedPrice] = useState<string>('');
  const [highlightedField, setHighlightedField] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [localDate, setLocalDate] = useState(selectedDate || new Date().toLocaleDateString('en-CA'));
  const [isPriorityDate, setIsPriorityDate] = useState(false);
  const [privacyBlocked, setPrivacyBlocked] = useState(false);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(() => {
    const d = selectedDate ? new Date(selectedDate) : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  });

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [userInteracted, setUserInteracted] = useState(!!selectedDate);
  const [isSuccess, setIsSuccess] = useState(false);
  const [checkedDates, setCheckedDates] = useState<Record<string, 'Available' | 'Unavailable'>>(() => {
    if (!vendor?.id) return {};
    const sessionKey = `checked_dates_${vendor.id}`;
    try {
      const stored = sessionStorage.getItem(sessionKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const isVenue = vendor?.category === VendorCategory.VENUE || vendor?.category === 'Venue';
  const effectiveDate = localDate;
  const isDateBlocked = vendor?.unavailableDates?.includes(effectiveDate);
  const hasSelectedPackage = selectedServiceIds.length > 0;

  // Check if blocked by privacy limit
  const checkPrivacyStatus = (): boolean => {
    if (!vendor) return false;
    const now = Date.now();
    const maxChecks = vendor.maxDateChecks ?? 5;
    const resetPeriodMs = (vendor.dateCheckResetHours ?? 24) * 60 * 60 * 1000;
    
    const attemptsStr = sessionStorage.getItem(`date_checks_${vendor.id}`);
    if (!attemptsStr) return false;
    
    try {
      const attempts: number[] = JSON.parse(attemptsStr);
      const validAttempts = attempts.filter(t => now - t < resetPeriodMs);
      return validAttempts.length >= maxChecks;
    } catch {
      return false;
    }
  };

  const getRemainingAttempts = (): number => {
    if (!vendor) return 0;
    const now = Date.now();
    const maxChecks = vendor.maxDateChecks ?? 5;
    const resetPeriodMs = (vendor.dateCheckResetHours ?? 24) * 60 * 60 * 1000;
    
    const attemptsStr = sessionStorage.getItem(`date_checks_${vendor.id}`);
    if (!attemptsStr) return maxChecks;
    
    try {
      const attempts: number[] = JSON.parse(attemptsStr);
      const validAttempts = attempts.filter(t => now - t < resetPeriodMs);
      return Math.max(0, maxChecks - validAttempts.length);
    } catch {
      return maxChecks;
    }
  };

  const registerCheckAttempt = (dateValue: string) => {
    if (!vendor) return;
    const now = Date.now();
    const resetPeriodMs = (vendor.dateCheckResetHours ?? 24) * 60 * 60 * 1000;
    
    const attemptsStr = sessionStorage.getItem(`date_checks_${vendor.id}`);
    let attempts: number[] = [];
    if (attemptsStr) {
      try {
        attempts = JSON.parse(attemptsStr);
      } catch {}
    }
    
    attempts = attempts.filter(t => now - t < resetPeriodMs);
    attempts.push(now);
    
    sessionStorage.setItem(`date_checks_${vendor.id}`, JSON.stringify(attempts));
    
    const maxChecks = vendor.maxDateChecks ?? 5;
    if (attempts.length >= maxChecks) {
      setPrivacyBlocked(true);
    }
  };

  const handleDateChange = (newDate: string) => {
    if (!vendor) return;
    setUserInteracted(true);

    // Toggle: if clicked date is already selected, deselect it
    if (newDate === localDate) {
      setLocalDate('');
      setIsCalendarOpen(false); // Close calendar when deselected
      return;
    }

    // 1. If it's already in checkedDates, we can just switch back directly!
    if (checkedDates[newDate]) {
      setLocalDate(newDate);
      setIsCalendarOpen(false); // Close calendar on selection
      return;
    }

    // 2. If limit reached, block checking new dates
    if (checkPrivacyStatus()) {
      setPrivacyBlocked(true);
      return;
    }

    // 3. Register attempt and perform the verification
    registerCheckAttempt(newDate);
    const isBlocked = vendor.unavailableDates?.includes(newDate);
    const updated = {
      ...checkedDates,
      [newDate]: (isBlocked ? 'Unavailable' : 'Available') as 'Available' | 'Unavailable'
    };
    setCheckedDates(updated);
    
    const sessionKey = `checked_dates_${vendor.id}`;
    sessionStorage.setItem(sessionKey, JSON.stringify(updated));

    setLocalDate(newDate);
    setIsCalendarOpen(false); // Close calendar on selection
  };

  const handleSelectCheckedDate = (date: string) => {
    setLocalDate(date);
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

  const prevMonth = () => {
    setUserInteracted(true);
    setCurrentCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setUserInteracted(true);
    setCurrentCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

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
        setUserInteracted(!!selectedDate);
        const initialDate = selectedDate || new Date().toLocaleDateString('en-CA');
        setLocalDate(initialDate);
        
        const parsedDate = new Date(initialDate);
        if (!isNaN(parsedDate.getTime())) {
          setCurrentCalendarMonth(parsedDate);
        }
      }
      
      const initialDateToUse = !wasOpenRef.current ? (selectedDate || new Date().toLocaleDateString('en-CA')) : localDate;
      
      // Load checked dates from sessionStorage
      const sessionKey = `checked_dates_${vendor.id}`;
      const storedStr = sessionStorage.getItem(sessionKey);
      let loadedDates: Record<string, 'Available' | 'Unavailable'> = {};
      if (storedStr) {
        try {
          loadedDates = JSON.parse(storedStr);
        } catch {}
      }

      // Check if limit is reached
      const isBlocked = checkPrivacyStatus();
      setPrivacyBlocked(isBlocked);

      const initialBlockedStatus = vendor.unavailableDates?.includes(initialDateToUse);

      if (loadedDates[initialDateToUse]) {
        // Already checked, use the existing state loaded from sessionStorage
        setCheckedDates(loadedDates);
      } else {
        // Not checked yet, check if we are already blocked
        if (isBlocked) {
          loadedDates[initialDateToUse] = initialBlockedStatus ? 'Unavailable' : 'Available';
          setCheckedDates(loadedDates);
          sessionStorage.setItem(sessionKey, JSON.stringify(loadedDates));
        } else {
          registerCheckAttempt(initialDateToUse);
          loadedDates[initialDateToUse] = initialBlockedStatus ? 'Unavailable' : 'Available';
          setCheckedDates(loadedDates);
          sessionStorage.setItem(sessionKey, JSON.stringify(loadedDates));
          // Re-evaluate privacy block status
          setPrivacyBlocked(checkPrivacyStatus());
        }
      }
      
      wasOpenRef.current = true;
    } else {
      wasOpenRef.current = false;
    }
  }, [isOpen, vendor, selectedDate, localDate]);

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

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const totalAmount = useMemo(() => {
    if (!vendor) return 0;
    
    let servicesTotal = 0;
    if (selectedServiceIds.length > 0) {
      servicesTotal = vendor.services?.filter(s => selectedServiceIds.includes(s.id)).reduce((sum, s) => {
        const qty = quantities[s.id] || 1;
        return sum + (s.price * qty);
      }, 0) || 0;
    }
    
    // If no services are selected, we show the priceStart as the base. 
    // Otherwise, we calculate based on the selected options.
    return servicesTotal || vendor.priceStart;
  }, [selectedServiceIds, quantities, vendor]);

  if (!isOpen || !vendor) return null;

  const toggleService = (serviceId: string) => {
    if (selectedServiceIds.includes(serviceId)) {
        setSelectedServiceIds(prev => prev.filter(id => id !== serviceId));
        setQuantities(prev => {
            const next = { ...prev };
            delete next[serviceId];
            return next;
        });
    } else {
        setSelectedServiceIds(prev => [...prev, serviceId]);
        setQuantities(prev => ({ ...prev, [serviceId]: 1 }));
    }
  };

  const handleQuantityChange = (serviceId: string, val: string) => {
    const num = parseInt(val) || 0;
    setQuantities(prev => ({ ...prev, [serviceId]: Math.max(0, num) }));
  };

  const handleSubmit = async (e: React.FormEvent | React.MouseEvent, explicitSubmitType?: 'add' | 'book') => {
    e.preventDefault();
    e.stopPropagation();
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
  };

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

      const hasBeenChecked = !!checkedDates[dateStr];
      const isAvailable = checkedDates[dateStr] === 'Available';
      const isUnavailable = checkedDates[dateStr] === 'Unavailable';
      
      const showBlockedColors = userInteracted;
      const isBlockedStyle = showBlockedColors && (isVendorExplicitlyBlocked || isUnavailable);
      const isDisabled = (isPast || (!hasBeenChecked && privacyBlocked && showBlockedColors) || (showBlockedColors && (isUnavailable || isVendorExplicitlyBlocked))) && !isSelected;

      let buttonStyle = "";
      if (isSelected) {
        if (showBlockedColors && (isUnavailable || isVendorExplicitlyBlocked)) {
          buttonStyle = "bg-red-600 text-white font-black shadow-[0_0_15px_rgba(239,68,68,0.45)] scale-105 border-2 border-red-500";
        } else if (isAvailable) {
          buttonStyle = "bg-green-600 text-white font-black shadow-[0_0_15px_rgba(34,197,94,0.45)] scale-105 border-2 border-green-500";
        } else {
          buttonStyle = "bg-[#D4AF37] text-black font-black shadow-[0_0_15px_rgba(212,175,55,0.45)] scale-105 border border-[#D4AF37]";
        }
      } else if (isPast) {
        buttonStyle = "text-zinc-600 bg-[#111]/20 opacity-30 cursor-not-allowed scale-95 border border-transparent";
      } else if (isBlockedStyle) {
        if (isVendorExplicitlyBlocked) {
          buttonStyle = "text-red-400 bg-red-950/20 opacity-50 cursor-not-allowed scale-95 border border-red-900/30 line-through";
        } else {
          buttonStyle = "text-red-500 bg-red-500/10 opacity-75 border-2 border-red-500/30";
        }
      } else if (isAvailable) {
        buttonStyle = "text-green-500 bg-green-500/10 border-2 border-green-500/30 hover:bg-green-500/20";
      } else if (privacyBlocked && showBlockedColors) {
        buttonStyle = "text-zinc-600 bg-[#111]/20 opacity-30 cursor-not-allowed scale-95 border border-transparent";
      } else {
        // Standard selectable future date has crisp white text, with elegant soft-gold hover/active states.
        buttonStyle = "text-zinc-100 bg-black/40 border border-white/5 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] hover:border-[#D4AF37]/40 hover:scale-105 hover:shadow-[0_0_12px_rgba(212,175,55,0.25)] active:scale-95";
      }

      days.push(
        <button
          key={`day-${day}`}
          type="button"
          disabled={isDisabled}
          onClick={() => handleDateChange(dateStr)}
          className={`aspect-square rounded-xl flex flex-col items-center justify-center text-xs font-bold transition-all outline-none relative group ${buttonStyle}`}
        >
          <span>{day}</span>
          {!isSelected && !isDisabled && (
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
            className="p-1.5 rounded-lg border border-[#D4AF37]/10 hover:border-[#D4AF37]/40 bg-black text-[#D4AF37] transition-all hover:scale-105 active:scale-95 outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] cursor-pointer"
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
            className="p-1.5 rounded-lg border border-[#D4AF37]/10 hover:border-[#D4AF37]/40 bg-black text-[#D4AF37] transition-all hover:scale-105 active:scale-95 outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] cursor-pointer"
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
        <div className="grid grid-cols-7 gap-1.5">
          {days}
        </div>

      </div>
    );
  };

  const inputClass = "w-full pl-10 pr-4 py-2.5 bg-black border border-[#D4AF37]/30 rounded-lg text-zinc-100 placeholder:text-zinc-600 focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] outline-none transition-all";
  const labelClass = "block text-xs font-bold text-[#D4AF37]/70 uppercase tracking-widest mb-1.5";

  const isPriority = isPriorityDate || !!isPriorityFromSuggestions;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" 
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
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-[#0a0a0a] min-h-[400px] flex flex-col items-center justify-center w-full max-w-[90vw] md:max-w-md mx-auto p-8 md:p-12 text-center rounded-2xl border border-[#D4AF37]/30 relative overflow-hidden shadow-2xl"
        >
          <div className="absolute -top-40 -left-40 w-80 h-80 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-40 -right-40 w-80 h-80 bg-[#D4AF37]/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col items-center justify-center text-center w-full my-auto px-4 relative z-10">
            <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
            
            <h2 className="text-2xl md:text-3xl font-bold font-[Cinzel] text-[#D4AF37] tracking-wider text-center w-full mx-auto break-words mb-4">
              BOOKING REQUEST RECEIVED
            </h2>
            
            <p className="text-center w-full max-w-xs mx-auto text-sm md:text-base whitespace-normal text-zinc-300 leading-relaxed mb-8 font-light">
              Your request has been forwarded to the vendor. We will notify you once they have reviewed it. You can check the status in your portal.
            </p>
              
            <div className="w-full max-w-[200px] mx-auto block">
              <button
                type="button"
                onClick={() => {
                  setIsSuccess(false);
                  if (onDone) {
                    onDone(isPriority);
                  } else {
                    onClose();
                  }
                }}
                className="w-full bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black py-3.5 rounded-xl text-xs uppercase tracking-[0.2em] transition-all duration-300 shadow-xl shadow-[#D4AF37]/10 hover:shadow-[#D4AF37]/20 outline-none hover:scale-[1.02] active:scale-[0.98] cursor-pointer text-center mx-auto block"
              >
                Done
              </button>
            </div>
          </div>
        </motion.div>
      ) : (
      <motion.div 
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="bg-[#0a0a0a] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto border border-[#D4AF37]/20 relative"
      >
        <div className="bg-black p-6 text-white flex justify-between items-start sticky top-0 z-10 border-b border-[#D4AF37]/20">
          <div>
            <h2 id="modal-title" className="text-xl font-bold font-[Cinzel] text-[#D4AF37]">{initialDetails ? 'Update Your Selection' : 'Book Service'}</h2>
            <p className="text-zinc-500 text-xs mt-1">Vendor: <span className="text-zinc-100 font-bold">{vendor.name}</span></p>
          </div>
          <button 
            onClick={onClose} 
            disabled={isSubmitting}
            className={`text-zinc-400 hover:text-[#D4AF37] p-2 outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-full transition-colors cursor-pointer ${isSubmitting ? 'pointer-events-none opacity-30' : ''}`} 
            aria-label="Close booking modal"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className={`p-6 space-y-6 ${isSubmitting ? 'pointer-events-none' : ''}`}>
          <div className="text-white text-center text-sm md:text-base font-bold tracking-wide mb-4 animate-pulse">
            {vendor.name} only allows to select {vendor.maxDateChecks ?? 3} dates per {vendor.dateCheckResetHours ?? 72} hours
          </div>

          <div className="space-y-3">
            <label className={labelClass}>Event Date</label>
            
            {/* Elegant luxury display of Selected Date as action picker */}
            <button
              type="button"
              id="date-section"
              onClick={() => setIsCalendarOpen(!isCalendarOpen)}
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

          {vendor.services && vendor.services.length > 0 && (
            <fieldset id="packages-section" className={`space-y-3 p-3 rounded-xl transition-all duration-300 ${highlightedField === 'packages-section' ? 'border-2 border-red-500 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border border-transparent'}`}>
              <div className="flex justify-between items-center flex-wrap gap-2">
                <legend className={labelClass}>Select Packages</legend>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {vendor.services.map((service) => (
                  <div key={service.id} className={`flex flex-col overflow-hidden rounded-xl border transition-all ${selectedServiceIds.includes(service.id) ? 'bg-[#D4AF37]/5 border-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.15)]' : 'bg-black border-[#D4AF37]/20 hover:border-[#D4AF37]/50'}`}>
                    <label className="cursor-pointer flex-1 flex flex-col group relative">
                        {service.image ? (
                          <div className="h-32 w-full relative overflow-hidden bg-[#111]">
                            <img src={service.image} alt={service.name} className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all group-hover:scale-105" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                          </div>
                        ) : (
                          <div className="h-32 w-full bg-[#111] border-b border-white/5 flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-zinc-700" />
                          </div>
                        )}
                        <div className={`absolute top-3 left-3 w-5 h-5 rounded-full border-2 flex items-center justify-center backdrop-blur-md ${selectedServiceIds.includes(service.id) ? 'bg-[#D4AF37] border-[#D4AF37]' : 'bg-black/50 border-white/40 group-hover:border-[#D4AF37]'}`}>
                           {selectedServiceIds.includes(service.id) && <Check className="w-3 h-3 text-black" />}
                        </div>
                        <div className="p-4 flex flex-col flex-1 relative z-10 -mt-8">
                            <span className="text-sm font-bold text-white drop-shadow-md leading-tight">{service.name}</span>
                            <span className="text-[10px] text-[#D4AF37] font-black uppercase tracking-widest mt-1">
                                ${service.price.toLocaleString()} {service.unit ? `per ${service.unit}` : ''}
                            </span>
                        </div>
                        <input type="checkbox" className="sr-only" checked={selectedServiceIds.includes(service.id)} onChange={() => toggleService(service.id)} />
                    </label>
                    
                    {selectedServiceIds.includes(service.id) && service.allowQuantity && (
                        <div className="px-4 pb-4 pt-1 flex flex-col gap-2 animate-in slide-in-from-top-2 duration-300 border-t border-white/5">
                            <div className="relative">
                                <Hash className="absolute left-3 top-2.5 w-3.5 h-3.5 text-[#D4AF37]/50" />
                                <input 
                                    type="number" 
                                    min="1"
                                    className="w-full bg-black/50 border border-[#D4AF37]/20 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:border-[#D4AF37] outline-none" 
                                    placeholder={`Enter number of ${service.unit || 'units'}...`}
                                    value={quantities[service.id] || 1}
                                    onChange={(e) => handleQuantityChange(service.id, e.target.value)}
                                />
                            </div>
                            <span className="text-[9px] font-black text-[#D4AF37] uppercase tracking-widest text-right">
                                Total: ${(service.price * (quantities[service.id] || 1)).toLocaleString()}
                            </span>
                        </div>
                    )}
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          <div className="space-y-4">
            <FloatingInput 
              id="event-name" 
              required 
              label="Event Name" 
              icon={PartyPopper} 
              value={formData.eventName} 
              onChange={(e) => setFormData({...formData, eventName: e.target.value})} 
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
                onChange={(e) => setFormData({...formData, eventTime: e.target.value})} 
                highlighted={highlightedField === 'event-time'}
              />
              <FloatingInput 
                id="client-name" 
                required 
                label="Your Name" 
                icon={User} 
                value={formData.clientName} 
                onChange={(e) => setFormData({...formData, clientName: e.target.value})} 
                highlighted={highlightedField === 'client-name'}
              />
            </div>

            {!isVenue && (
              <FloatingInput 
                id="event-location" 
                required 
                label="Location" 
                icon={MapPin} 
                value={formData.eventLocation} 
                onChange={(e) => setFormData({...formData, eventLocation: e.target.value})} 
                highlighted={highlightedField === 'event-location'}
              />
            )}

            <FloatingInput 
              id="client-email" 
              required 
              label="Email Address" 
              type="email" 
              icon={Mail} 
              value={formData.contactEmail} 
              onChange={(e) => setFormData({...formData, contactEmail: e.target.value})} 
              highlighted={highlightedField === 'client-email'}
            />

            <FloatingTextarea 
              id="booking-notes" 
              label="Special Requests / Custom Notes" 
              icon={MessageSquare} 
              value={formData.notes} 
              onChange={(e) => setFormData({...formData, notes: e.target.value})} 
            />
          </div>

          <div className="flex flex-col gap-3 pt-4 border-t border-[#D4AF37]/20">
             <div className="flex justify-between items-end">
                <div className="flex flex-col">
                    <span className="text-zinc-500 text-[10px] uppercase tracking-widest font-black">{isOfferMode ? 'My Proposed Price' : 'Estimated Total'}</span>
                    <div className="flex items-center gap-2">
                        {isOfferMode ? (
                            <div className="flex items-center text-3xl font-bold text-white">
                                <span className="text-[#D4AF37] mr-1">$</span>
                                <input 
                                    type="number" 
                                    value={offeredPrice} 
                                    onChange={(e) => setOfferedPrice(e.target.value)} 
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
                        onClick={() => { setIsOfferMode(true); setOfferedPrice(totalAmount.toString()); }}
                        className="text-[10px] font-black text-[#D4AF37] border border-[#D4AF37]/30 px-3 py-1.5 rounded-full hover:bg-[#D4AF37]/10 transition-all uppercase tracking-widest cursor-pointer"
                    >
                        Make an Offer
                    </button>
                )}
                {isOfferMode && (
                    <button 
                        type="button" 
                        onClick={() => setIsOfferMode(false)}
                        className="text-[10px] font-black text-zinc-500 hover:text-white transition-all uppercase tracking-widest cursor-pointer"
                    >
                        Standard Price
                    </button>
                )}
             </div>
             {isOfferMode && <p className="text-[10px] text-zinc-500 leading-relaxed italic">Propose your desired price to the vendor. They will review and respond to your inquiry.</p>}
          </div>

          {/* Priority Event Toggle */}
          {localDate && !isPastDate(localDate) && (
            <div 
              onClick={() => setIsPriorityDate(!isPriorityDate)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsPriorityDate(!isPriorityDate);
                }
              }}
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
                onClick={(e) => {
                  e.stopPropagation(); // Avoid double toggle from container click
                  setIsPriorityDate(!isPriorityDate);
                }}
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
                onClick={(e) => {
                  setSubmitType('add');
                  handleSubmit(e, 'add');
                }}
                className="flex-1 py-3 border border-[#D4AF37] text-[#D4AF37] font-semibold rounded-xl hover:bg-[#D4AF37] hover:text-black transition-all text-xs uppercase tracking-widest outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
            >
                Add to Plan
            </button>
            <button 
                type="button" 
                onClick={(e) => {
                  setSubmitType('book');
                  handleSubmit(e, 'book');
                }}
                className="flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg border bg-[#D4AF37] text-black hover:bg-[#E5C76B] border-[#D4AF37]/20 hover:scale-105 active:scale-95 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] transition-all duration-200"
            >
                {isOfferMode ? 'Send Offer' : 'Book Now'}
            </button>
          </div>
        </div>
      </motion.div>
      )}
    </motion.div>
  );
};

export default BookingModal;