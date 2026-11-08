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
      whileHover={{ y: -10, scale: 1.045 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 340, damping: 18 }}
      className={`simcha-vendor-card relative w-full aspect-[4/5] bg-[#111] rounded-2xl shadow-2xl border-2 border-[#D4AF37]/15 overflow-hidden hover:border-[#FFE885] hover:shadow-[0_22px_48px_rgba(212,175,55,0.34),0_0_24px_rgba(255,232,133,0.22)] transition-[border-color,box-shadow] duration-300 group flex flex-col justify-end text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] transform-gpu will-change-transform ${isCurrentlySelectedDateBlocked ? 'opacity-70' : ''}`} 
      aria-labelledby={`vendor-name-${vendor.id}`}
    >
      {isCurrentlySelectedDateBlocked && (
        <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-4" aria-hidden="true">
          <Lock className="w-8 h-8 text-[#D4AF37]/50 mb-2" />
          <p className="font-bold text-[#D4AF37] text-lg font-[Cinzel]">Fully Booked</p>
          <p className="text-xs text-zinc-300">on {formatDate(selectedDate)}</p>
        </div>
      )}
      
      <img src={coverImage} alt={vendor.name} decoding="async" className="absolute inset-0 w-full h-full object-cover group-hover:scale-115 transition-transform duration-500 ease-out transform-gpu" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent simcha-image-fader-vendor"></div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_85%,rgba(212,175,55,0.22)_0%,transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative z-10 p-5 md:p-6 w-full transform transition-transform duration-300 group-hover:-translate-y-1">
         <p className="text-[10px] font-black text-[#D4AF37] group-hover:text-[#FFE885] uppercase tracking-[0.25em] mb-1.5 drop-shadow-md transition-colors duration-300">{vendor.category}</p>
         <h3 id={`vendor-name-${vendor.id}`} className="font-black text-xl md:text-2xl text-white group-hover:text-[#FFE885] font-[Cinzel] leading-tight drop-shadow-lg transition-colors duration-300">{vendor.name}</h3>
      </div>
    </motion.div>
  );
});

export default VendorCard;


