import React from 'react';

const VendorCardSkeleton: React.FC = () => {
  return (
    <article className="bg-[#050505] rounded-3xl overflow-hidden border border-[#D4AF37]/20 shadow-[0_8px_30px_rgba(0,0,0,0.8)] flex flex-col h-full animate-pulse">
      {/* Image Skeleton */}
      <div className="relative h-64 bg-zinc-900 overflow-hidden">
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#D4AF37]/10 to-transparent"></div>
        {/* Top Badges Skeleton */}
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <div className="w-16 h-5 rounded-md bg-zinc-800"></div>
          <div className="w-20 h-5 rounded-md bg-zinc-800"></div>
        </div>
      </div>
      
      {/* Content Skeleton */}
      <div className="p-6 flex-1 flex flex-col bg-[#111] relative">
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-[#D4AF37]/5 to-transparent"></div>
        
        {/* Category */}
        <div className="w-24 h-3 bg-zinc-800 rounded-full mb-3"></div>
        
        {/* Title */}
        <div className="w-3/4 h-6 bg-zinc-700 rounded-md mb-2"></div>
        
        {/* Location */}
        <div className="w-1/2 h-4 bg-zinc-800 rounded-md mb-5"></div>
        
        {/* Description lines */}
        <div className="space-y-2 mb-6">
          <div className="w-full h-3 bg-zinc-800 rounded-full"></div>
          <div className="w-5/6 h-3 bg-zinc-800 rounded-full"></div>
        </div>
        
        {/* Response time */}
        <div className="w-full h-9 bg-zinc-900 rounded-lg mb-5 border border-zinc-800"></div>
        
        {/* Buttons */}
        <div className="mt-auto flex flex-row gap-3 pt-5 border-t border-zinc-800">
          <div className="flex-1 h-11 bg-zinc-900 rounded-xl border border-zinc-800"></div>
          <div className="flex-1 h-11 bg-zinc-800 rounded-xl"></div>
        </div>
      </div>
    </article>
  );
};

export default VendorCardSkeleton;
