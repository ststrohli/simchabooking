import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { X, Calendar, User, Mail, MessageSquare, PartyPopper, MapPin, Clock, Tag, Check, AlertTriangle, Hash, ChevronLeft, ChevronRight } from 'lucide-react';
import { Vendor, SelectedService, VendorCategory } from '../types';

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
  const [privacyBlocked, setPrivacyBlocked] = useState(false);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(() => {
    const d = selectedDate ? new Date(selectedDate) : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  });

  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [checkedDates, setCheckedDates] = useState<Record<string, 'Available' | 'Unavailable'>>({});

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

    // 1. If it's already in checkedDates, we can just switch back directly!
    if (checkedDates[newDate]) {
      setLocalDate(newDate);
      setIsCalendarOpen(false);
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
    setCheckedDates(prev => ({
      ...prev,
      [newDate]: isBlocked ? 'Unavailable' : 'Available'
    }));

    setLocalDate(newDate);
    setIsCalendarOpen(false);
  };

  const handleSelectCheckedDate = (date: string) => {
    setLocalDate(date);
    setIsCalendarOpen(false);
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
      
      const initialBlockedStatus = vendor.unavailableDates?.includes(initialDate);
      
      if (checkPrivacyStatus()) {
        setPrivacyBlocked(true);
        // If already blocked, add initial selection to checked state based on vendor details so they can still proceed with it
        setCheckedDates({ [initialDate]: initialBlockedStatus ? 'Unavailable' : 'Available' });
      } else {
        setPrivacyBlocked(false);
        registerCheckAttempt(initialDate);
        setCheckedDates({ [initialDate]: initialBlockedStatus ? 'Unavailable' : 'Available' });
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
    if (checkedDates[localDate] !== 'Available') return;
    
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
      
      // Stop pre-loading vendor's schedule:
      // Real isBlocked (unavailable date status) is only shown IF they have already checked it this session!
      // Otherwise, we do not show any red indicator or grayed-out layout for standard un-checked future dates.
      const isKnownUnavailable = checkedDates[dateStr] === 'Unavailable';

      // If the client has hit their max limit, we block them from checking NEW (unchecked) dates on the calendar.
      const isUncheckedAndLimitReached = !checkedDates[dateStr] && privacyBlocked;

      // Disable state is determined by past date, known unavailable date, or if it's unchecked when limit is reached.
      const isDisabled = isPast || isKnownUnavailable || isUncheckedAndLimitReached;

      let buttonStyle = "";
      if (isSelected) {
        buttonStyle = "bg-[#D4AF37] text-black font-black shadow-[0_0_15px_rgba(212,175,55,0.45)] scale-105 border border-[#D4AF37]";
      } else if (isPast || isKnownUnavailable) {
        buttonStyle = "text-slate-600 bg-[#111]/20 opacity-30 cursor-not-allowed scale-95";
      } else if (isUncheckedAndLimitReached) {
        buttonStyle = "text-slate-600 bg-transparent opacity-20 cursor-not-allowed";
      } else {
        // Standard selectable future date has crisp white text, with elegant soft-gold hover/active states.
        buttonStyle = "text-slate-100 bg-black/40 border border-white/5 hover:bg-[#D4AF37]/10 hover:text-[#D4AF37] hover:border-[#D4AF37]/40 hover:scale-105 hover:shadow-[0_0_12px_rgba(212,175,55,0.25)] active:scale-95";
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
          {isKnownUnavailable && (
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-0.5" title="Previously Verified Unavailable" />
          )}
          {checkedDates[dateStr] === 'Available' && !isSelected && (
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-0.5" title="Verified Available" />
          )}
        </button>
      );
    }

    const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    return (
      <div className="bg-[#050505] border border-[#D4AF37]/20 rounded-2xl p-4 shadow-xl select-none relative overflow-hidden w-full">
        <div className="absolute inset-0 border border-white/5 pointer-events-none rounded-2xl" />
        
        {/* Header with Navigation */}
        <div className="flex items-center justify-between mb-4 border-b border-[#D4AF37]/10 pb-3">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 rounded-lg border border-[#D4AF37]/10 hover:border-[#D4AF37]/40 bg-black text-[#D4AF37] transition-all hover:scale-105 active:scale-95 outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37]"
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
            className="p-1.5 rounded-lg border border-[#D4AF37]/10 hover:border-[#D4AF37]/40 bg-black text-[#D4AF37] transition-all hover:scale-105 active:scale-95 outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37]"
            aria-label="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Weekdays */}
        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {weekdays.map((wd, idx) => (
            <div key={`wd-${idx}`} className="text-[10px] text-slate-500 font-bold uppercase tracking-widest py-1">
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

  const inputClass = "w-full pl-10 pr-4 py-2.5 bg-black border border-[#D4AF37]/30 rounded-lg text-slate-100 placeholder:text-slate-600 focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] outline-none transition-all";
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
            <h2 id="modal-title" className="text-xl font-bold font-[Cinzel] text-[#D4AF37]">{initialDetails ? 'Update Your Selection' : 'Reserve Service'}</h2>
            <p className="text-slate-500 text-xs mt-1">Vendor: <span className="text-slate-100 font-bold">{vendor.name}</span></p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-[#D4AF37] p-2 outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-full" aria-label="Close booking modal"><X className="w-6 h-6" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-3">
            {/* Blinking/pulsing gold warning */}
            <p className="text-[11px] font-bold text-[#D4AF37] animate-pulse leading-relaxed tracking-wide mb-2 text-center" style={{ textShadow: "0 0 10px rgba(212,175,55,0.4)" }}>
              Note: For vendor privacy, you may only check availability for {vendor.maxDateChecks ?? 5} dates every {vendor.dateCheckResetHours ?? 24} hours.
            </p>

            <label className={labelClass}>Event Date</label>
            
            {/* Elegant luxury display of Selected Date as action picker */}
            <button
              type="button"
              onClick={() => setIsCalendarOpen(!isCalendarOpen)}
              className="w-full flex items-center justify-between gap-3 p-3 bg-black hover:bg-neutral-900 border border-[#D4AF37]/30 hover:border-[#D4AF37]/60 rounded-xl transition-all outline-none focus:ring-1 focus:ring-[#D4AF37] text-left"
            >
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-[#D4AF37] flex-shrink-0" />
                <div className="flex-1">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[#D4AF37]/60 block" style={{ textShadow: "0 0 4px rgba(212,175,55,0.1)" }}>Selected Celebration Date</span>
                  <span className="text-sm font-black text-slate-100 font-[Cinzel] tracking-wide">{getReadableLocalDate()}</span>
                </div>
              </div>
              <span className="text-[10px] font-bold text-[#D4AF37] bg-black/40 border border-[#D4AF37]/25 px-2 py-1 rounded-md">
                {isCalendarOpen ? 'Hide' : 'Change'}
              </span>
            </button>
            
            {/* Interactive premium calendar picker inside an animated container */}
            {isCalendarOpen && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200 mt-2 relative z-20">
                {renderInteractiveCalendar()}
              </div>
            )}

            {/* List of checked dates this session */}
            {Object.keys(checkedDates).length > 0 && (
              <div className="bg-black/50 border border-[#D4AF37]/15 rounded-xl p-3 space-y-2 mt-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] uppercase font-black tracking-widest text-[#D4AF37]/60">session checked dates</span>
                  <span className="text-[9px] text-[#D4AF37] font-mono px-1.5 py-0.5 rounded bg-[#D4AF37]/10 border border-[#D4AF37]/15">
                    Checks used: {vendor.maxDateChecks ?? 5 - getRemainingAttempts()} / {vendor.maxDateChecks ?? 5}
                  </span>
                </div>
                <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                  {Object.entries(checkedDates).map(([date, status]) => {
                    const isSelected = date === localDate;
                    return (
                      <div 
                        key={date}
                        onClick={() => handleSelectCheckedDate(date)}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all border text-xs 
                          ${isSelected 
                            ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-white font-bold' 
                            : 'bg-[#050505] border-white/5 hover:border-[#D4AF37]/40 text-slate-300'
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className={`w-3.5 h-3.5 ${isSelected ? 'text-[#D4AF37]' : 'text-slate-500'}`} />
                          <span className="font-mono">{date}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] uppercase font-black tracking-wider
                            ${status === 'Available' 
                              ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}
                          >
                            {status}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#D4AF37]" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className={`border rounded-lg p-4 flex items-center gap-4 transition-colors 
            ${checkedDates[localDate] === 'Unavailable' 
              ? 'bg-red-500/10 border-red-500/30 text-red-500' 
              : checkedDates[localDate] === 'Available'
                ? 'bg-[#D4AF37]/10 border-[#D4AF37]/20 text-[#D4AF37]'
                : 'bg-slate-955 border-white/5 text-slate-400'
            }`} 
            role="alert"
          >
            {checkedDates[localDate] === 'Unavailable' ? <AlertTriangle className="w-6 h-6 flex-shrink-0" aria-hidden="true" /> : <Calendar className="w-6 h-6 flex-shrink-0" aria-hidden="true" />}
            <div>
              <p className="text-xs font-black uppercase tracking-widest">Availability Status</p>
              <p className="text-sm font-bold">
                {checkedDates[localDate] === 'Unavailable' 
                  ? 'Selected date is Booked/Unavailable.' 
                  : checkedDates[localDate] === 'Available'
                    ? 'Selected date is AVAILABLE — Add to Plan'
                    : 'Please select and verify availability.'}
              </p>
            </div>
          </div>

          {vendor.services && vendor.services.length > 0 && (
            <fieldset className="space-y-3">
              <legend className={labelClass}>Select Package & Units</legend>
              <div className="grid grid-cols-1 gap-3">
                {vendor.services.map((service) => (
                  <div key={service.id} className="flex flex-col gap-2">
                    <label className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all focus-within:ring-2 focus-within:ring-[#D4AF37] ${selectedServiceIds.includes(service.id) ? 'bg-[#D4AF37]/10 border-[#D4AF37]' : 'bg-black border-[#D4AF37]/20 hover:border-[#D4AF37]/50'}`}>
                        <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedServiceIds.includes(service.id) ? 'bg-[#D4AF37] border-[#D4AF37]' : 'border-[#D4AF37]/30'}`} aria-hidden="true">{selectedServiceIds.includes(service.id) && <Check className="w-2.5 h-2.5 text-black" />}</div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-100">{service.name}</span>
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                                ${service.price.toLocaleString()} {service.unit ? `per ${service.unit}` : ''}
                            </span>
                        </div>
                        </div>
                        <input type="checkbox" className="sr-only" checked={selectedServiceIds.includes(service.id)} onChange={() => toggleService(service.id)} />
                    </label>
                    
                    {selectedServiceIds.includes(service.id) && service.allowQuantity && (
                        <div className="flex items-center gap-3 pl-8 animate-in slide-in-from-left-2 duration-300">
                            <div className="relative flex-1">
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
                            <span className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest">
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
            <div>
              <label htmlFor="event-name" className={labelClass}>Event Name</label>
              <div className="relative">
                <PartyPopper className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" aria-hidden="true" />
                <input id="event-name" required type="text" placeholder="Sarah's Wedding" className={inputClass} value={formData.eventName} onChange={(e) => setFormData({...formData, eventName: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="event-time" className={labelClass}>Time</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" aria-hidden="true" />
                  <input id="event-time" required type="time" className={inputClass + " [color-scheme:dark]"} value={formData.eventTime} onChange={(e) => setFormData({...formData, eventTime: e.target.value})} />
                </div>
              </div>
              <div>
                <label htmlFor="client-name" className={labelClass}>Your Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" aria-hidden="true" />
                  <input id="client-name" required type="text" placeholder="Full Name" className={inputClass} value={formData.clientName} onChange={(e) => setFormData({...formData, clientName: e.target.value})} />
                </div>
              </div>
            </div>
            {!isVenue && (
              <div>
                <label htmlFor="event-location" className={labelClass}>Location</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" aria-hidden="true" />
                  <input id="event-location" required type="text" placeholder="Address or Venue" className={inputClass} value={formData.eventLocation} onChange={(e) => setFormData({...formData, eventLocation: e.target.value})} />
                </div>
              </div>
            )}
            <div>
              <label htmlFor="client-email" className={labelClass}>Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" aria-hidden="true" />
                <input id="client-email" required type="email" placeholder="email@example.com" className={inputClass} value={formData.contactEmail} onChange={(e) => setFormData({...formData, contactEmail: e.target.value})} />
              </div>
            </div>
            <div>
              <label htmlFor="booking-notes" className={labelClass}>Special Requests</label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" aria-hidden="true" />
                <textarea id="booking-notes" rows={3} placeholder="Special requests..." className={inputClass + " resize-none"} value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4 border-t border-[#D4AF37]/20">
             <div className="flex justify-between items-end">
                <div className="flex flex-col">
                    <span className="text-slate-500 text-[10px] uppercase tracking-widest font-black">{isOfferMode ? 'My Proposed Price' : 'Estimated Total'}</span>
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
                        className="text-[10px] font-black text-[#D4AF37] border border-[#D4AF37]/30 px-3 py-1.5 rounded-full hover:bg-[#D4AF37]/10 transition-all uppercase tracking-widest"
                    >
                        Make an Offer
                    </button>
                )}
                {isOfferMode && (
                    <button 
                        type="button" 
                        onClick={() => setIsOfferMode(false)}
                        className="text-[10px] font-black text-slate-500 hover:text-white transition-all uppercase tracking-widest"
                    >
                        Standard Price
                    </button>
                )}
             </div>
             {isOfferMode && <p className="text-[10px] text-slate-500 leading-relaxed italic">Propose your desired price to the vendor. They will review and respond to your inquiry.</p>}
          </div>

          <div className="flex gap-4">
            <button type="button" onClick={onClose} className="flex-1 py-3 font-bold text-slate-500 hover:text-[#D4AF37] outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] rounded-lg">Cancel</button>
            <button 
                type="submit" 
                disabled={checkedDates[localDate] !== 'Available' || (isOfferMode && (!offeredPrice || parseInt(offeredPrice) <= 0))} 
                className={`flex-1 py-3 rounded-xl font-bold transition-all shadow-lg border outline-none focus-visible:ring-2 focus-visible:ring-white ${checkedDates[localDate] !== 'Available' || (isOfferMode && !offeredPrice) ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed' : 'bg-[#D4AF37] text-black hover:bg-[#E5C76B] border-[#D4AF37]/20'}`}
            >
                {checkedDates[localDate] !== 'Available' ? 'Verify Availability' : (isOfferMode ? 'Send Offer' : 'Add to Plan')}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default BookingModal;