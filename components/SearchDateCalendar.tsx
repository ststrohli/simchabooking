import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Calendar, ChevronLeft, ChevronRight, X, RotateCcw, Clock, Check } from 'lucide-react';

interface SearchDateCalendarProps {
  searchTerm: string;
  onSearchTermChange: (val: string) => void;
  onSearchSubmit: () => void;
  selectedDates: string[];
  onSelectedDatesChange: (dates: string[]) => void;
  maxSearchDates: number;
  searchDateResetHours: number;
  searchDateResetNonce: number;
  userId?: string;
  availableVendorCountForDate?: (dateStr: string) => number;
}

interface StoredQuotaState {
  quotaDates: string[];
  lockedAt: number | null;
  lastResetAt: number | null;
  resetNonce: number;
}

export const SearchDateCalendar: React.FC<SearchDateCalendarProps> = ({
  searchTerm,
  onSearchTermChange,
  onSearchSubmit,
  selectedDates,
  onSelectedDatesChange,
  maxSearchDates = 4,
  searchDateResetHours = 24,
  searchDateResetNonce = 0,
  userId,
  availableVendorCountForDate
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  const calendarWrapperRef = useRef<HTMLDivElement>(null);

  const storageKey = `simcha_search_date_quota_${userId || 'guest'}`;
  const resetPeriodMs = Math.max(0, searchDateResetHours) * 60 * 60 * 1000;

  const loadQuotaState = useCallback((): StoredQuotaState => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        return { quotaDates: [], lockedAt: null, lastResetAt: null, resetNonce: searchDateResetNonce };
      }
      const parsed: StoredQuotaState = JSON.parse(raw);
      const now = Date.now();

      if (searchDateResetNonce && (!parsed.resetNonce || parsed.resetNonce < searchDateResetNonce)) {
        const fresh: StoredQuotaState = {
          quotaDates: [],
          lockedAt: null,
          lastResetAt: null,
          resetNonce: searchDateResetNonce
        };
        localStorage.setItem(storageKey, JSON.stringify(fresh));
        return fresh;
      }

      if (parsed.lockedAt && resetPeriodMs > 0 && now - parsed.lockedAt >= resetPeriodMs) {
        const unlocked: StoredQuotaState = {
          quotaDates: [],
          lockedAt: null,
          lastResetAt: null,
          resetNonce: searchDateResetNonce
        };
        localStorage.setItem(storageKey, JSON.stringify(unlocked));
        return unlocked;
      }

      return {
        quotaDates: Array.isArray(parsed.quotaDates) ? parsed.quotaDates.slice(0, Math.max(1, maxSearchDates)) : [],
        lockedAt: parsed.lockedAt || null,
        lastResetAt: parsed.lastResetAt || null,
        resetNonce: parsed.resetNonce || searchDateResetNonce
      };
    } catch {
      return { quotaDates: [], lockedAt: null, lastResetAt: null, resetNonce: searchDateResetNonce };
    }
  }, [storageKey, searchDateResetNonce, resetPeriodMs, maxSearchDates]);

  const [quotaState, setQuotaState] = useState<StoredQuotaState>(() => loadQuotaState());

  useEffect(() => {
    const updated = loadQuotaState();
    setQuotaState(updated);
    if (selectedDates.length > maxSearchDates) {
      onSelectedDatesChange(selectedDates.slice(0, maxSearchDates));
    }
  }, [loadQuotaState, maxSearchDates, searchDateResetHours, searchDateResetNonce]);

  useEffect(() => {
    if (!isOpen) return;
    setNowTick(Date.now());
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (calendarWrapperRef.current && !calendarWrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const saveQuotaState = (next: StoredQuotaState) => {
    setQuotaState(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  };

  const activeCooldownTimestamp = quotaState.lastResetAt || quotaState.lockedAt;
  const remainingCooldownMs =
    activeCooldownTimestamp && resetPeriodMs > 0
      ? Math.max(0, resetPeriodMs - (nowTick - activeCooldownTimestamp))
      : 0;
  const isResetOnCooldown = remainingCooldownMs > 0;
  const isQuotaFull = quotaState.quotaDates.length >= maxSearchDates;

  const formatRemainingTime = (ms: number): string => {
    const totalMinutes = Math.ceil(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDateString = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatShortReadableDate = (dateStr: string): string => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const isPastDate = (dateObj: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cmp = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
    return cmp < today;
  };

  const handleDateClick = (dateStr: string, isPast: boolean) => {
    if (isPast) return;
    setStatusMessage(null);

    if (selectedDates.includes(dateStr)) {
      const nextSelected = selectedDates.filter(d => d !== dateStr);
      onSelectedDatesChange(nextSelected);
      return;
    }

    if (quotaState.quotaDates.includes(dateStr)) {
      if (selectedDates.length >= maxSearchDates) {
        setStatusMessage(`Maximum of ${maxSearchDates} dates can be active at once.`);
        return;
      }
      onSelectedDatesChange([...selectedDates, dateStr].sort());
      return;
    }

    if (quotaState.quotaDates.length >= maxSearchDates) {
      if (isResetOnCooldown) {
        setStatusMessage(
          `Maximum of ${maxSearchDates} search dates reached. Reset available in ${formatRemainingTime(remainingCooldownMs)}.`
        );
      } else {
        setStatusMessage(
          `Maximum of ${maxSearchDates} dates reached. Click Reset below to choose new dates.`
        );
      }
      return;
    }

    const nextQuotaDates = [...quotaState.quotaDates, dateStr];
    const reachedMax = nextQuotaDates.length >= maxSearchDates;
    const now = Date.now();

    saveQuotaState({
      quotaDates: nextQuotaDates,
      lockedAt: reachedMax ? (quotaState.lockedAt || now) : quotaState.lockedAt,
      lastResetAt: quotaState.lastResetAt,
      resetNonce: searchDateResetNonce
    });

    onSelectedDatesChange([...selectedDates, dateStr].sort());
  };

  const handleResetQuota = () => {
    const now = Date.now();
    if (isResetOnCooldown) {
      setStatusMessage(`You can reset your search dates every ${searchDateResetHours}h (${formatRemainingTime(remainingCooldownMs)} left).`);
      return;
    }
    saveQuotaState({
      quotaDates: [],
      lockedAt: null,
      lastResetAt: resetPeriodMs > 0 ? now : null,
      resetNonce: searchDateResetNonce
    });
    onSelectedDatesChange([]);
    setStatusMessage(`Search dates reset. You may now select up to ${maxSearchDates} new dates.`);
  };

  const prevMonth = () => {
    setStatusMessage(null);
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setStatusMessage(null);
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const monthName = currentMonth.toLocaleString('default', { month: 'long' });
  const weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // SVG path for the gold Search button:
  // Left side: full semicircular pill cap (radius 19).
  // Right side: straight top/bottom lines to (115, 1) and (115, 39), then a pushed-in concave arc (radius 21.5)
  // that curves inward by ~10px so the circular date button nests 1-2px away from the curve without touching.
  const searchBtnSvgPath = 'M 20,1 L 115,1 A 21.5,21.5 0 0,0 115,39 L 20,39 A 19,19 0 0,1 20,1 Z';

  return (
    <div className="max-w-3xl mx-auto w-full relative z-30">
      {/* Original Pill-Shaped Search Bar */}
      <div className="simcha-search-bar max-w-3xl mx-auto bg-zinc-950/90 rounded-full p-1.5 pl-4 sm:pl-6 flex items-center shadow-[0_10px_30px_rgba(0,0,0,0.8),0_0_15px_rgba(212,175,55,0.15)] border border-[#D4AF37]/30 backdrop-blur-md">
        <div className="flex-1 flex items-center min-w-0 pr-2">
          <label htmlFor="search-input" className="sr-only">Search vendors</label>
          <Search className="simcha-search-icon w-4 h-4 sm:w-5 sm:h-5 text-[#D4AF37] mr-2.5 sm:mr-3 shrink-0" aria-hidden="true" />
          <input
            id="search-input"
            type="text"
            placeholder={
              selectedDates.length > 0
                ? `Search available vendors (${selectedDates.length} ${selectedDates.length === 1 ? 'date' : 'dates'})...`
                : 'Search elite vendors...'
            }
            className="w-full focus:outline-none text-zinc-100 placeholder:text-zinc-300 bg-transparent h-9 sm:h-11 text-xs sm:text-base font-medium truncate"
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearchSubmit();
            }}
          />
        </div>

        {/* Right Controls Inside Search Bar: Pill-left/Concave-right Gold Search Button + Same-Height Roundy Date Button 1-2px apart */}
        <div className="flex items-center shrink-0">
          {/* Gold Search Button: Pill-shaped on the left, pushed-in concave right edge with two sharp tips wrapping around the date button */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={onSearchSubmit}
            className="relative h-9 sm:h-10 w-[88px] sm:w-[108px] pr-3 sm:pr-3.5 flex items-center justify-center font-black uppercase tracking-wider text-xs sm:text-sm text-black shrink-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-white select-none z-10"
          >
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none overflow-visible drop-shadow-[0_4px_12px_rgba(212,175,55,0.45)]"
              viewBox="0 0 116 40"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="simchaSearchBtnGoldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FFE885" />
                  <stop offset="50%" stopColor="#D4AF37" />
                  <stop offset="100%" stopColor="#A37B0D" />
                </linearGradient>
              </defs>
              <path
                d={searchBtnSvgPath}
                fill="url(#simchaSearchBtnGoldGrad)"
                stroke="#FFF8D1"
                strokeWidth="1.25"
                strokeLinejoin="miter"
                strokeMiterlimit="12"
              />
            </svg>
            <span className="relative z-10 text-[#09090b] font-black">Search</span>
          </motion.button>

          {/* Roundy Date Calendar Button: Exact same height (h-9 sm:h-10) nestled 1-2px from the Search button's concave curve without touching */}
          <div ref={calendarWrapperRef} className="relative -ml-[6px] sm:-ml-[7px] shrink-0 flex items-center justify-center z-20">
            <motion.button
              type="button"
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.93 }}
              onClick={() => {
                setStatusMessage(null);
                setIsOpen(prev => !prev);
              }}
              aria-label="Filter vendors by available dates"
              aria-expanded={isOpen}
              className={`simcha-date-trigger-btn w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] transition-all duration-300 relative select-none ${
                isOpen || selectedDates.length > 0
                  ? 'bg-[#D4AF37] text-black border border-[#FFF8D1] shadow-[0_0_14px_rgba(212,175,55,0.55)]'
                  : 'bg-black/85 hover:bg-black border border-[#D4AF37]/60 hover:border-[#D4AF37] text-[#D4AF37] shadow-[0_4px_12px_rgba(0,0,0,0.5)]'
              }`}
            >
              <Calendar className={`w-4 h-4 sm:w-[18px] sm:h-[18px] stroke-[2.2] ${isOpen || selectedDates.length > 0 ? 'text-[#09090b]' : 'text-[#D4AF37]'}`} />

              {selectedDates.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black text-[#D4AF37] text-[9px] font-black flex items-center justify-center shadow-md border border-[#D4AF37]">
                  {selectedDates.length}
                </span>
              )}
            </motion.button>

            {/* Pop-Out / Zoom-Out Scaled-Down Booking Modal Calendar */}
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  key="search-date-calendar-popout"
                  initial={{ opacity: 0, scale: 0.08, y: -22, x: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                  exit={{ opacity: 0, scale: 0.08, y: -22, x: 6 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 26, mass: 0.72 }}
                  style={{ transformOrigin: 'top right' }}
                  className="simcha-popout-calendar absolute right-0 top-[48px] sm:top-[52px] w-[284px] sm:w-[304px] z-[90] bg-[#050505]/95 border border-[#D4AF37]/35 rounded-2xl p-3.5 shadow-[0_24px_60px_rgba(0,0,0,0.95),0_0_25px_rgba(212,175,55,0.22)] backdrop-blur-xl select-none text-left"
                >
                  <div className="absolute inset-0 border border-white/5 pointer-events-none rounded-2xl" />

                  {/* Top bar: Title + Quota + Close */}
                  <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#D4AF37]/15">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#D4AF37] font-[Cinzel]">
                        Availability Filter
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        Max {maxSearchDates} dates · {quotaState.quotaDates.length}/{maxSearchDates} used
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="w-6 h-6 rounded-full bg-black/60 border border-[#D4AF37]/25 hover:border-[#D4AF37] text-zinc-300 hover:text-[#D4AF37] flex items-center justify-center transition-all cursor-pointer"
                      aria-label="Close calendar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Month Navigation Header (Scaled-Down BookingModal Style) */}
                  <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#D4AF37]/15">
                    <button
                      type="button"
                      onClick={prevMonth}
                      className="p-1.5 rounded-full border border-[#D4AF37]/15 hover:border-[#D4AF37]/50 bg-black text-[#D4AF37] transition-all hover:scale-105 active:scale-95 outline-none cursor-pointer"
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
                      className="p-1.5 rounded-full border border-[#D4AF37]/15 hover:border-[#D4AF37]/50 bg-black text-[#D4AF37] transition-all hover:scale-105 active:scale-95 outline-none cursor-pointer"
                      aria-label="Next Month"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Weekdays */}
                  <div className="grid grid-cols-7 gap-1 text-center mb-1">
                    {weekdays.map((wd, idx) => (
                      <div key={`wd-${idx}`} className="text-[9px] text-[#D4AF37]/70 font-black uppercase tracking-widest py-0.5">
                        {wd}
                      </div>
                    ))}
                  </div>

                  {/* Roundy Dates Grid */}
                  <div className="grid grid-cols-7 gap-1 mb-2.5">
                    {Array.from({ length: firstDay }).map((_, i) => (
                      <div key={`empty-${i}`} className="aspect-square opacity-0 pointer-events-none" />
                    ))}

                    {Array.from({ length: daysInMonth }).map((_, idx) => {
                      const day = idx + 1;
                      const dateObj = new Date(year, month, day);
                      const dateStr = formatDateString(dateObj);
                      const isPast = isPastDate(dateObj);
                      const isSelected = selectedDates.includes(dateStr);
                      const isInQuota = quotaState.quotaDates.includes(dateStr);
                      const isLockedOut = !isInQuota && isQuotaFull;
                      const availCount = availableVendorCountForDate ? availableVendorCountForDate(dateStr) : null;
                      const hasZeroAvailable = availCount !== null && availCount === 0;

                      let btnStyle = '';
                      if (isSelected) {
                        btnStyle =
                          'bg-[#D4AF37] text-[#09090b] font-black shadow-[0_0_12px_rgba(212,175,55,0.5)] scale-105 border border-[#D4AF37]';
                      } else if (isPast) {
                        btnStyle =
                          'text-zinc-400 bg-[#111]/20 opacity-30 cursor-not-allowed scale-95 border border-transparent';
                      } else if (isInQuota) {
                        btnStyle =
                          'text-[#D4AF37] bg-[#D4AF37]/15 border border-[#D4AF37]/50 hover:bg-[#D4AF37]/25 cursor-pointer';
                      } else if (isLockedOut) {
                        btnStyle =
                          'text-zinc-500 bg-black/40 border border-white/5 opacity-45 cursor-not-allowed';
                      } else if (hasZeroAvailable) {
                        btnStyle =
                          'text-red-400/80 bg-red-950/20 border border-red-900/20 hover:border-red-500/40 cursor-pointer';
                      } else {
                        btnStyle =
                          'text-zinc-100 bg-black/40 border border-white/5 hover:bg-[#D4AF37]/15 hover:text-[#D4AF37] hover:border-[#D4AF37]/40 hover:scale-105 hover:shadow-[0_0_10px_rgba(212,175,55,0.25)] active:scale-95 cursor-pointer';
                      }

                      return (
                        <button
                          key={`day-${day}`}
                          type="button"
                          disabled={isPast}
                          onClick={() => handleDateClick(dateStr, isPast)}
                          className={`aspect-square rounded-full flex flex-col items-center justify-center text-[11px] font-bold transition-all outline-none relative group ${btnStyle}`}
                        >
                          <span>{day}</span>
                          {!isSelected && !isPast && !isLockedOut && !hasZeroAvailable && (
                            <span className="w-1 h-1 rounded-full bg-[#D4AF37] opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected Date Tags */}
                  {quotaState.quotaDates.length > 0 && (
                    <div className="mb-2.5 pt-2 border-t border-white/5">
                      <div className="flex flex-wrap gap-1.5">
                        {quotaState.quotaDates.map(d => {
                          const active = selectedDates.includes(d);
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => handleDateClick(d, false)}
                              className={`px-2 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                active
                                  ? 'bg-[#D4AF37] text-[#09090b] shadow-sm'
                                  : 'bg-black/40 text-zinc-400 border border-white/10 hover:text-white'
                              }`}
                              title={active ? 'Click to pause filtering on this date' : 'Click to re-enable this date'}
                            >
                              <span>{formatShortReadableDate(d)}</span>
                              {active ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Status / Cooldown Notice */}
                  {statusMessage && (
                    <div className="mb-2.5 p-2 bg-black/60 border border-[#D4AF37]/30 rounded-xl text-[10px] text-zinc-200 text-center leading-snug">
                      {statusMessage}
                    </div>
                  )}

                  {/* Footer Controls: 24h Reset & Done */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#D4AF37]/15">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleResetQuota}
                        disabled={isResetOnCooldown || (quotaState.quotaDates.length === 0 && selectedDates.length === 0)}
                        className={`px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 transition-all ${
                          isResetOnCooldown || (quotaState.quotaDates.length === 0 && selectedDates.length === 0)
                            ? 'bg-black/40 text-zinc-500 border border-white/5 cursor-not-allowed'
                            : 'bg-black/60 hover:bg-red-950/60 text-zinc-200 hover:text-red-300 border border-white/10 hover:border-red-500/30 cursor-pointer'
                        }`}
                      >
                        {isResetOnCooldown ? (
                          <>
                            <Clock className="w-3 h-3 text-[#D4AF37]" />
                            <span>Reset in {formatRemainingTime(remainingCooldownMs)}</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-3 h-3" />
                            <span>Reset ({searchDateResetHours}h)</span>
                          </>
                        )}
                      </button>

                      {selectedDates.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onSelectedDatesChange([])}
                          className="px-2 py-1.5 rounded-full text-[10px] font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer"
                        >
                          Show All
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="px-3.5 py-1.5 rounded-full bg-[#D4AF37] hover:bg-[#E5C76B] text-[#09090b] font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer shadow-md"
                    >
                      Done
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Active Date Filter Summary Bar below Search Bar */}
      {selectedDates.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-300">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#D4AF37]">
            Showing Available Vendors For:
          </span>
          {selectedDates.map((d, idx) => (
            <React.Fragment key={d}>
              {idx > 0 && <span className="text-zinc-500">·</span>}
              <button
                type="button"
                onClick={() => onSelectedDatesChange(selectedDates.filter(item => item !== d))}
                className="text-zinc-100 hover:text-[#D4AF37] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                title="Remove date from active filter"
              >
                <span>{formatShortReadableDate(d)}</span>
                <X className="w-3 h-3 text-zinc-400 hover:text-[#D4AF37]" />
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

export default SearchDateCalendar;
