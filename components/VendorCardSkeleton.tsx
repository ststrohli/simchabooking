import React from 'react';

const VendorCardSkeleton: React.FC = () => {
  return (
    <div className="relative w-full aspect-[4/5] bg-zinc-900 rounded-2xl overflow-hidden border-2 border-[#D4AF37]/10 animate-pulse flex flex-col justify-end p-5 md:p-6">
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#D4AF37]/5 to-transparent"></div>
      
      <div className="w-24 h-3 bg-zinc-800 rounded-full mb-3 relative z-10"></div>
      <div className="w-3/4 h-6 bg-zinc-700 rounded-md relative z-10"></div>
    </div>
  );
};

export default VendorCardSkeleton;
