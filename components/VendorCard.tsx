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

const VendorCard: React.FC<VendorCardProps> = ({ vendor, onQuickView, selectedDate }) => {
  const isCurrentlySelectedDateBlocked = selectedDate && vendor.unavailableDates?.includes(selectedDate);
  
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  
  const coverImage = vendor.image || 'https://picsum.photos/800/600';

  return (
    <motion.button 
      onClick={() => onQuickView(vendor)}
      initial={{ 
         borderColor: "rgba(212, 175, 55, 0.1)",
         boxShadow: "0 0px 0px rgba(212, 175, 55, 0)"
       }}
      whileHover={{ 
         y: -6,
         scale: 1.02,
         boxShadow: "0 20px 40px rgba(212, 175, 55, 0.12)",
        borderColor: "rgba(212, 175, 55, 0.4)"
       }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className={`relative w-full aspect-[4/5] bg-[#111] rounded-2xl shadow-2xl border-2 border-[#D4AF37]/10 overflow-hidden hover:border-[#D4AF37]/40 transition-all group flex flex-col justify-end text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${isCurrentlySelectedDateBlocked ? 'opacity-70' : ''}`} 
      aria-labelledby={`vendor-name-${vendor.id}`}
    >
      {isCurrentlySelectedDateBlocked && (
        <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-4" aria-hidden="true">
          <Lock className="w-8 h-8 text-[#D4AF37]/50 mb-2" />
          <p className="font-bold text-[#D4AF37] text-lg font-[Cinzel]">Fully Booked</p>
          <p className="text-xs text-zinc-300">on {formatDate(selectedDate)}</p>
        </div>
      )}
      
      <img src={coverImage} alt={vendor.name} className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent"></div>
      
      <div className="relative z-10 p-5 md:p-6 w-full">
         <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.25em] mb-1.5 drop-shadow-md">{vendor.category}</p>
         <h3 id={`vendor-name-${vendor.id}`} className="font-black text-xl md:text-2xl text-white font-[Cinzel] leading-tight drop-shadow-lg">{vendor.name}</h3>
      </div>
    </motion.button>
  );
};

export default VendorCard;
