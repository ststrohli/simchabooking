import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Lock, Globe } from 'lucide-react';
import { Vendor, Review, getVendorSocialItems, SocialPlatformId } from '../types';

export const VendorSocialLogoIcon: React.FC<{ platform: SocialPlatformId; className?: string }> = ({ platform, className = 'w-3.5 h-3.5' }) => {
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
    case 'twentyfoursix':
      return (
        <span className="font-sans font-black text-[8.5px] leading-none tracking-tighter select-none">
          24/6
        </span>
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

interface VendorCardProps {
  vendor: Vendor;
  isPriorityAccess?: boolean;
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
      whileHover={{ y: -8, scale: 1.035 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 320, damping: 20 }}
      className={`simcha-vendor-card relative w-full aspect-[4/5] bg-[#111] rounded-2xl shadow-2xl border-2 border-[#D4AF37]/25 overflow-hidden hover:border-[#D4AF37] hover:shadow-[0_20px_44px_rgba(184,134,11,0.38),0_0_22px_rgba(212,175,55,0.32)] transition-[border-color,box-shadow] duration-300 group flex flex-col justify-end text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] transform-gpu will-change-transform ${isCurrentlySelectedDateBlocked ? 'opacity-70' : ''}`}
      aria-labelledby={`vendor-name-${vendor.id}`}
    >
      {isCurrentlySelectedDateBlocked && (
        <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-4" aria-hidden="true">
          <Lock className="w-8 h-8 text-[#D4AF37]/50 mb-2" />
          <p className="font-bold text-[#D4AF37] text-lg font-[Cinzel]">Fully Booked</p>
          <p className="text-xs text-zinc-300">on {formatDate(selectedDate)}</p>
        </div>
      )}

      <img src={coverImage} alt={vendor.name} decoding="async" className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 ease-out transform-gpu" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent simcha-image-fader-vendor"></div>
      <div className="simcha-vendor-radial-glow pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_85%,rgba(184,134,11,0.22)_0%,transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="relative z-10 p-5 md:p-6 w-full transform transition-transform duration-300 group-hover:-translate-y-1">
        <p className="simcha-vendor-card-category text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.25em] mb-1.5 drop-shadow-md transition-colors duration-300">
          {vendor.category}
        </p>
        <h3
          id={`vendor-name-${vendor.id}`}
          className="simcha-vendor-card-title font-black text-xl md:text-2xl text-white group-hover:text-[#D4AF37] font-[Cinzel] leading-tight drop-shadow-lg transition-colors duration-300"
        >
          {vendor.name}
        </h3>
      </div>
    </motion.div>
  );
});

export default VendorCard;
