import React from 'react';
import { motion } from 'motion/react';
import { Lock } from 'lucide-react';
import { Vendor, Review } from '../types';

interface VendorCardProps {
  vendor: Vendor;
  onBook: (vendor: Vendor) => void;
  onMessage: (vendor: Vendor) => void;
  onQuickView: (vendor: Vendor) => void;
  selectedDate: string;
  onAddReview: (vendorId: string, review: Omit<Review, 'id' | 'date'>) => void;
}

const VendorCard: React.FC<VendorCardProps> = React.memo(({ vendor, onQuickView, selectedDate }) => {
  const isCurrentlySelectedDateBlocked = selectedDate && vendor.unavailableDates?.includes(selectedDate);
  
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  
  const coverImage = vendor.image || 'https://picsum.photos/800/600';

  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={() => onQuickView(vendor)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onQuickView(vendor);
        }
      }}
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className={`relative w-full aspect-[4/5] bg-[#111] rounded-2xl shadow-2xl border-2 border-[#D4AF37]/10 overflow-hidden hover:border-[#D4AF37]/40 hover:shadow-[0_20px_40px_rgba(212,175,55,0.12)] transition-[border-color,box-shadow] duration-300 group flex flex-col justify-end text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] transform-gpu will-change-transform ${isCurrentlySelectedDateBlocked ? 'opacity-70' : ''}`} 
      aria-labelledby={`vendor-name-${vendor.id}`}
    >
      {isCurrentlySelectedDateBlocked && (
        <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-4" aria-hidden="true">
          <Lock className="w-8 h-8 text-[#D4AF37]/50 mb-2" />
          <p className="font-bold text-[#D4AF37] text-lg font-[Cinzel]">Fully Booked</p>
          <p className="text-xs text-zinc-300">on {formatDate(selectedDate)}</p>
        </div>
      )}
      
      <img src={coverImage} alt={vendor.name} decoding="async" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 transform-gpu" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent simcha-image-fader-vendor"></div>
      
      <div className="relative z-10 p-5 md:p-6 w-full">
         <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.25em] mb-1.5 drop-shadow-md">{vendor.category}</p>
         <h3 id={`vendor-name-${vendor.id}`} className="font-black text-xl md:text-2xl text-white font-[Cinzel] leading-tight drop-shadow-lg">{vendor.name}</h3>
      </div>
    </motion.div>
  );
});

export default VendorCard;


