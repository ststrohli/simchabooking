import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { X, Star, Calendar, User, Mail, MessageSquare, PartyPopper, MapPin, Clock, Tag, Check, AlertTriangle, Hash, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';
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
}> = ({ id, label, icon: Icon, value, onChange, required = false, type = "text", className = "" }) => {
  const [focused, setFocused] = useState(false);
  const isFilled = value !== '';

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        {Icon && (
          <Icon className={`absolute left-3.5 w-4 h-4 transition-all duration-300 z-10 ${focused ? 'text-[#D4AF37] scale-110' : 'text-[#D4AF37]/40'}`} />
        )}
        <input
          id={id}
          type={type}
          required={required}
          value={value}
          onChange={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={`w-full bg-black/60 border border-[#D4AF37]/20 rounded-xl text-zinc-100 placeholder-transparent focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none transition-all duration-300 pt-6 pb-2 pr-4 ${Icon ? 'pl-10' : 'pl-4'} ${className}`}
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
}

const BookingModal: React.FC<BookingModalProps> = ({ 
  isOpen, onClose, vendor, selectedDate, onConfirm, initialDetails 
}) => {
  const [formData, setFormData] = useState({ eventName: '', clientName: '', contactEmail: '', eventLocation: '', eventTime: '', notes: '' });
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isOfferMode, setIsOfferMode] = useState(false);
  const [offeredPrice, setOfferedPrice] = useState<string>('');

  const [localDate, setLocalDate] = useState(selectedDate || new Date().toISOString().split('T')[0]);
  const [isPriorityDate, setIsPriorityDate] = useState(false);
  const [privacyBlocked, setPrivacyBlocked] = useState(false);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(() => {
    const d = selectedDate ? new Date(selectedDate) : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  });

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
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

  const isPastDate = (date: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const compareDate = new Date(date);
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
    setCurrentCalendarMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
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

  // Sync state when opening or closing
  useEffect(() => {
    if (isOpen && vendor) {
      const initialDate = selectedDate || new Date().toISOString().split('T')[0];
      setLocalDate(initialDate);
      
      const parsedDate = new Date(initialDate);
      if (!isNaN(parsedDate.getTime())) {
        setCurrentCalendarMonth(parsedDate);
      }
      
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

      const initialBlockedStatus = vendor.unavailableDates?.includes(initialDate);

      if (loadedDates[initialDate]) {
        // Already checked, use the existing state loaded from sessionStorage
        setCheckedDates(loadedDates);
      } else {
        // Not checked yet, check if we are already blocked
        if (isBlocked) {
          loadedDates[initialDate] = initialBlockedStatus ? 'Unavailable' : 'Available';
          setCheckedDates(loadedDates);
          sessionStorage.setItem(sessionKey, JSON.stringify(loadedDates));
        } else {
          registerCheckAttempt(initialDate);
          loadedDates[initialDate] = initialBlockedStatus ? 'Unavailable' : 'Available';
          setCheckedDates(loadedDates);
          sessionStorage.setItem(sessionKey, JSON.stringify(loadedDates));
          // Re-evaluate privacy block status
          setPrivacyBlocked(checkPrivacyStatus());
        }
      }
    }
  }, [isOpen, vendor, selectedDate]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localDate) return;
    if (isPastDate(new Date(localDate))) return;
    
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
    onConfirm({ 
        ...formData, 
        eventLocation: finalLocation, 
        selectedServices, 
        totalAmount: isOfferMode ? (parseInt(offeredPrice) || 0) : totalAmount,
        date: localDate,
        isPriorityDate,
        // @ts-ignore - added to internal callback but type checked manually
        isOffer: isOfferMode,
        offeredPrice: isOfferMode ? (parseInt(offeredPrice) || 0) : undefined
    } as any);
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
      
      const isDisabled = (isPast || (!hasBeenChecked && privacyBlocked) || isUnavailable || isVendorExplicitlyBlocked) && !isSelected;

      let buttonStyle = "";
      if (isSelected) {
        if (isUnavailable || isVendorExplicitlyBlocked) {
          buttonStyle = "bg-red-600 text-white font-black shadow-[0_0_15px_rgba(239,68,68,0.45)] scale-105 border-2 border-red-500";
        } else if (isAvailable) {
          buttonStyle = "bg-green-600 text-white font-black shadow-[0_0_15px_rgba(34,197,94,0.45)] scale-105 border-2 border-green-500";
        } else {
          buttonStyle = "bg-[#D4AF37] text-black font-black shadow-[0_0_15px_rgba(212,175,55,0.45)] scale-105 border border-[#D4AF37]";
        }
      } else if (isPast) {
        buttonStyle = "text-zinc-600 bg-[#111]/20 opacity-30 cursor-not-allowed scale-95 border border-transparent";
      } else if (isVendorExplicitlyBlocked) {
        buttonStyle = "text-red-400 bg-red-950/20 opacity-50 cursor-not-allowed scale-95 border border-red-900/30 line-through";
      } else if (isAvailable) {
        buttonStyle = "text-green-500 bg-green-500/10 border-2 border-green-500/30 hover:bg-green-500/20";
      } else if (isUnavailable) {
        buttonStyle = "text-red-500 bg-red-500/10 opacity-75 border-2 border-red-500/30";
      } else if (privacyBlocked) {
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

        {/* Search Limits & Warning */}
        <div className="mt-4 p-3.5 bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-xl text-center">
          <p className="text-[#D4AF37] text-[10px] font-black uppercase tracking-wider mb-1 flex items-center justify-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Calendar Privacy Search Limits
          </p>
          <p className="text-zinc-400 text-[10px] leading-relaxed font-medium">
            You are allowed {vendor.maxDateChecks ?? 5} checks per vendor. You have <span className="font-black text-[#D4AF37] underline">{getRemainingAttempts()}</span> searches remaining before remaining unselected dates go gray.
          </p>
        </div>
      </div>
    );
  };

  const inputClass = "w-full pl-10 pr-4 py-2.5 bg-black border border-[#D4AF37]/30 rounded-lg text-zinc-100 placeholder:text-zinc-600 focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] outline-none transition-all";
  const labelClass = "block text-xs font-bold text-[#D4AF37]/70 uppercase tracking-widest mb-1.5";

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
      <motion.div 
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="bg-[#0a0a0a] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto border border-[#D4AF37]/20"
      >
        <div className="bg-black p-6 text-white flex justify-between items-start sticky top-0 z-10 border-b border-[#D4AF37]/20">
          <div>
            <h2 id="modal-title" className="text-xl font-bold font-[Cinzel] text-[#D4AF37]">{initialDetails ? 'Update Your Selection' : 'Book Service'}</h2>
            <p className="text-zinc-500 text-xs mt-1">Vendor: <span className="text-zinc-100 font-bold">{vendor.name}</span></p>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-[#D4AF37] p-2 outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-full transition-colors cursor-pointer" aria-label="Close booking modal"><X className="w-6 h-6" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-3">
            <label className={labelClass}>Event Date</label>
            
            {/* Elegant luxury display of Selected Date as action picker */}
            <button
              type="button"
              onClick={() => setIsCalendarOpen(!isCalendarOpen)}
              className="w-full flex items-center gap-3 p-3 bg-black hover:bg-neutral-900 border border-[#D4AF37]/30 hover:border-[#D4AF37]/60 rounded-xl transition-all outline-none focus:ring-1 focus:ring-[#D4AF37] text-left cursor-pointer"
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
            <fieldset className="space-y-3">
              <legend className={labelClass}>Select Package & Units</legend>
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
              />
              <FloatingInput 
                id="client-name" 
                required 
                label="Your Name" 
                icon={User} 
                value={formData.clientName} 
                onChange={(e) => setFormData({...formData, clientName: e.target.value})} 
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
          {localDate && !isPastDate(new Date(localDate)) && (
            <div className="p-5 bg-[#0a0a0a] border border-[#D4AF37]/20 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#D4AF37] flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5" /> Event Status
                </span>
                <button 
                  onClick={() => setIsPriorityDate(!isPriorityDate)}
                  role="switch"
                  aria-checked={isPriorityDate}
                  className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${
                    isPriorityDate 
                      ? 'bg-[#D4AF37] text-black' 
                      : 'bg-zinc-900 text-zinc-400 border border-zinc-700'
                  }`}
                >
                  {isPriorityDate ? 'Priority' : 'Standard'}
                </button>
              </div>
              <p className="text-zinc-400 text-[10px] leading-relaxed">
                Locks in <span className="text-white font-bold">{getReadableLocalDate()}</span> and instantly recommends matching professional vendors who are also available on this date.
              </p>
            </div>
          )}

          <div className="flex gap-4 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-[#D4AF37] outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] rounded-xl transition-all cursor-pointer">Cancel</button>
            <button 
                type="submit" 
                disabled={!localDate || isPastDate(new Date(localDate)) || (isOfferMode && (!offeredPrice || parseInt(offeredPrice) <= 0))} 
                className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg border outline-none focus-visible:ring-2 focus-visible:ring-white ${!localDate || isPastDate(new Date(localDate)) || (isOfferMode && !offeredPrice) ? 'bg-zinc-800 text-zinc-500 border-zinc-700 cursor-not-allowed' : 'bg-[#D4AF37] text-black hover:bg-[#E5C76B] border-[#D4AF37]/20 hover:scale-105 active:scale-95 cursor-pointer'}`}
            >
                {isOfferMode ? 'Send Offer' : 'Add to Plan'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default BookingModal;