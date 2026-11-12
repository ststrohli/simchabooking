import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { X, Check, Calendar } from 'lucide-react';
import { Vendor, Review } from '../types';
import VendorCard from './VendorCard';
import { useModalDragDismiss, ModalDragIndicator } from './useModalDragDismiss';

const MODAL_TRANSITION = { duration: 1.15, ease: [0.25, 0.85, 0.35, 1] as const };

interface SuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDismissStart?: () => void;
  sourceVendor: Vendor | null;
  recommendations: Vendor[];
  onBook: (vendor: Vendor) => void;
  cartItems: string[]; // IDs of items in cart to show "Added" state
  isPriorityLock?: boolean;
  eventDate?: string;
  allVendors?: Vendor[];
  onAddReview?: (vendorId: string, review: Omit<Review, 'id' | 'date'>) => void;
}

const SuggestionModalInner: React.FC<SuggestionModalProps> = ({
  onClose,
  onDismissStart,
  sourceVendor,
  recommendations,
  onBook,
  cartItems,
  eventDate,
  allVendors = [],
  onAddReview,
}) => {
  const [activeTab, setActiveTab] = useState<string>('Venue');

  const handleDismissStartInternal = useCallback(() => {
    document.body.style.overflow = '';
    if (onDismissStart) {
      onDismissStart();
    }
  }, [onDismissStart]);

  const { backdropOpacity, isDismissing, dragModalProps, dragHandleProps, dismissWithSlideOut } = useModalDragDismiss(
    onClose,
    true,
    handleDismissStartInternal
  );

  // Lock background scroll when the modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!sourceVendor) return null;

  const categories = ['Venue', 'Music', 'Photography', 'Videography', 'Catering'];

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const dObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return dObj.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' });
      }
    } catch {}
    return dateStr;
  };

  // Availability filter logic:
  // 1. Category matches active tab
  // 2. Exclude the current source vendor we just booked
  // 3. Filter by availability (the selected date should not be inside unavailableDates)
  const vendorsToUse = allVendors && allVendors.length > 0 ? allVendors : recommendations;

  const filteredCategoryVendors = vendorsToUse.filter((vendor) => {
    const isCategoryMatch = vendor.category.toLowerCase() === activeTab.toLowerCase();
    if (!isCategoryMatch) return false;

    const isSourceVendor = vendor.id === sourceVendor.id;
    if (isSourceVendor) return false;

    const isUnavailable = eventDate && vendor.unavailableDates?.includes(eventDate);
    if (isUnavailable) return false;

    return true;
  });

  // Limit display to a maximum of 4 vendors per category, sorted by highest rating
  const displayedVendors = filteredCategoryVendors
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 4);

  const formattedDate = formatDate(eventDate);

  return (
    <motion.div
      style={{ opacity: backdropOpacity }}
      transition={MODAL_TRANSITION}
      role="dialog"
      aria-modal="true"
      aria-labelledby="suggestion-modal-title"
      className={`simcha-modal-gpu-wrapper will-change-transform transform-gpu fixed inset-0 z-[145] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 bg-black/85 backdrop-blur-md overflow-hidden ${
        isDismissing ? 'pointer-events-none' : ''
      }`}
    >
      <motion.div
        {...dragModalProps}
        transition={MODAL_TRANSITION}
        className={`simcha-modal-gpu-wrapper will-change-transform transform-gpu bg-[#0c0c0c] w-full sm:max-w-4xl h-[95dvh] sm:h-[90vh] sm:max-h-[90vh] rounded-t-[2.5rem] rounded-b-none sm:rounded-[2.5rem] border-t-2 border-r border-l sm:border border-[#D4AF37]/35 shadow-[0_24px_64px_rgba(0,0,0,0.95)] overflow-hidden relative flex flex-col mt-auto sm:mt-0 ${
          isDismissing ? 'pointer-events-none' : ''
        }`}
      >
        {/* Top bar drag handle with centered gold drag indicator pill */}
        <div
          {...dragHandleProps}
          data-drag-handle="true"
          title="Drag down to close"
          className="absolute top-0 left-0 right-14 z-[70] pt-1.5 pb-3 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
        >
          <div className="pl-14">
            <ModalDragIndicator />
          </div>
        </div>

        {/* Standard luxury circular close button matching BookingModal & QuickViewModal */}
        <button
          type="button"
          onClick={dismissWithSlideOut}
          className="absolute top-4 right-4 z-[120] w-8 h-8 flex items-center justify-center bg-[#1a1a1a] hover:bg-[#262626] border border-[#D4AF37]/40 rounded-full text-[#D4AF37] transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] shadow-xl cursor-pointer"
          aria-label="Close priority page and return home"
          title="Return to Home Screen"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Scrollable content area */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y custom-scrollbar px-4 sm:px-8 pt-9 pb-8">
          {/* Single concise luxury header — no repetitive phrases */}
          <div className="flex flex-col items-center text-center max-w-xl mx-auto mb-6">
            {formattedDate && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] text-[10px] font-black uppercase tracking-[0.2em] mb-2.5">
                <Calendar className="w-3 h-3" />
                <span>{formattedDate}</span>
              </div>
            )}

            <h2
              id="suggestion-modal-title"
              className="text-xl sm:text-2xl md:text-3xl font-bold font-[Cinzel] text-[#D4AF37] tracking-wider leading-tight"
            >
              Available on Your Date
            </h2>

            <p className="text-zinc-300 mt-2 text-xs sm:text-sm font-light leading-relaxed">
              Showing professionals verified open on{' '}
              <span className="text-white font-semibold">{formattedDate || 'your selected date'}</span> alongside{' '}
              <span className="text-white font-semibold">{sourceVendor.name}</span> so you can book the rest of your celebration in one place.
            </p>
          </div>

          {/* Compact Luxury Category Capsules */}
          <div className="w-full mb-6 border-y border-[#D4AF37]/15 py-3">
            <div className="flex items-center justify-start sm:justify-center overflow-x-auto whitespace-nowrap gap-2 no-scrollbar scroll-smooth px-1">
              {categories.map((cat) => {
                const isActive = activeTab === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveTab(cat)}
                    aria-pressed={isActive}
                    className={`px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.18em] transition-all duration-200 cursor-pointer flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${
                      isActive
                        ? 'bg-[#D4AF37] text-black border border-[#D4AF37] shadow-[0_0_14px_rgba(212,175,55,0.3)] scale-[1.02]'
                        : 'bg-black/70 border border-[#D4AF37]/35 text-zinc-300 hover:border-[#D4AF37] hover:text-[#D4AF37]'
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Standard Marketplace VendorCard Grid */}
          {displayedVendors.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 w-full">
              {displayedVendors.map((vendor) => {
                const isAdded = cartItems.includes(vendor.id);
                return (
                  <div key={vendor.id} className="relative">
                    {isAdded && (
                      <div className="absolute top-3 right-3 z-20 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/85 border border-[#D4AF37] text-[#D4AF37] text-[9px] font-black uppercase tracking-widest shadow-lg pointer-events-none">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                        <span>In Plan</span>
                      </div>
                    )}
                    <VendorCard
                      vendor={vendor}
                      isPriorityAccess={true}
                      onBook={(v) => {
                        if (!isAdded) onBook(v);
                      }}
                      onMessage={() => {}}
                      onQuickView={(v) => {
                        if (!isAdded) onBook(v);
                      }}
                      selectedDate={eventDate || ''}
                      onAddReview={onAddReview || (() => {})}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-zinc-400 py-14 text-center text-xs tracking-widest uppercase font-[Cinzel]">
              No {activeTab} vendors available on {formattedDate || 'this date'}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

const SuggestionModal: React.FC<SuggestionModalProps> = (props) => {
  if (!props.isOpen || !props.sourceVendor) return null;
  return <SuggestionModalInner {...props} />;
};

export default SuggestionModal;
