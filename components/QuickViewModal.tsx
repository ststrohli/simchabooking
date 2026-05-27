import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Star, MapPin, ShieldCheck, PlayCircle, ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react';
import { Vendor } from '../types';

interface QuickViewModalProps {
  vendor: Vendor;
  onClose: () => void;
  onBook: (vendor: Vendor) => void;
  onMessage: (vendor: Vendor) => void;
}

const QuickViewModal: React.FC<QuickViewModalProps> = ({ vendor, onClose, onBook, onMessage }) => {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const mediaItems = React.useMemo(() => {
    const items: Array<{ type: 'image' | 'video', url: string, isNative?: boolean }> = [];
    if (vendor.video) {
      const isNativeVideo = vendor.video.startsWith('data:video/') || vendor.video.match(/\.(mp4|webm|ogg)$/i);
      items.push({ type: 'video', url: vendor.video, isNative: !!isNativeVideo });
    }
    if (vendor.gallery && vendor.gallery.length > 0) {
      items.push(...vendor.gallery.map(url => {
        if (!url) return null;
        const isNativeVideo = url.startsWith('data:video/') || url.match(/\.(mp4|webm|ogg)$/i);
        return isNativeVideo ? { type: 'video' as const, url, isNative: true } : { type: 'image' as const, url };
      }).filter(Boolean) as any);
    }
    if (items.length === 0) items.push({ type: 'image', url: vendor.image || 'https://picsum.photos/800/600' });
    return items;
  }, [vendor]);

  const currentMedia = mediaItems[currentMediaIndex];

  const nextMedia = () => { setIsPlaying(false); setCurrentMediaIndex((prev) => (prev + 1) % mediaItems.length); };
  const prevMedia = () => { setIsPlaying(false); setCurrentMediaIndex((prev) => (prev - 1 + mediaItems.length) % mediaItems.length); };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.95 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
        className="bg-[#111] w-full max-w-4xl rounded-3xl border border-[#D4AF37]/30 shadow-2xl overflow-hidden relative"
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-[110] p-2 bg-black/60 hover:bg-black rounded-full text-[#D4AF37] transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
          aria-label="Close modal"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex flex-col md:flex-row h-full max-h-[90vh] overflow-y-auto md:overflow-hidden">
          {/* Media Section */}
          <div className="w-full md:w-3/5 aspect-video md:aspect-auto relative bg-black flex items-center justify-center">
            {currentMedia.type === 'video' ? (
              <div className="w-full h-full relative group/video">
                {currentMedia.isNative ? (
                  <video 
                    key={currentMedia.url} 
                    src={currentMedia.url} 
                    className="w-full h-full object-contain" 
                    controls={isPlaying} 
                    autoPlay={isPlaying} 
                    muted={!isPlaying} 
                    playsInline 
                  />
                ) : (
                  <iframe 
                    key={currentMedia.url + isPlaying} 
                    src={`${currentMedia.url}${currentMedia.url.includes('?') ? '&' : '?'}autoplay=${isPlaying ? 1 : 0}&controls=1&rel=0&modestbranding=1`} 
                    className="w-full h-full border-0 absolute inset-0" 
                    allow="autoplay; fullscreen" 
                  />
                )}
                {!isPlaying && (
                  <button 
                    onClick={() => setIsPlaying(true)} 
                    className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/50 hover:bg-black/30 transition-all group/play"
                  >
                    <PlayCircle className="w-20 h-20 text-[#D4AF37] opacity-90 group-hover/play:scale-110 transition-transform" />
                    <span className="mt-4 text-xs font-black text-[#D4AF37] tracking-[0.3em] uppercase">Play Showcase</span>
                  </button>
                )}
              </div>
            ) : (
              <img 
                src={currentMedia.url} 
                alt={vendor.name} 
                className="w-full h-full object-cover" 
              />
            )}

            {mediaItems.length > 1 && !isPlaying && (
              <div className="absolute inset-0 flex items-center justify-between p-4">
                <button onClick={prevMedia} className="p-3 bg-black/60 rounded-full text-[#D4AF37] hover:bg-black transition-all"><ChevronLeft className="w-6 h-6" /></button>
                <button onClick={nextMedia} className="p-3 bg-black/60 rounded-full text-[#D4AF37] hover:bg-black transition-all"><ChevronRight className="w-6 h-6" /></button>
              </div>
            )}
            
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
              {mediaItems.map((_, i) => (
                <div 
                  key={i} 
                  className={`h-1 rounded-full transition-all ${i === currentMediaIndex ? 'w-6 bg-[#D4AF37]' : 'w-2 bg-white/30'}`} 
                />
              ))}
            </div>
          </div>

          {/* Info Section */}
          <div className="w-full md:w-2/5 p-8 flex flex-col bg-[#111] overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.25em] bg-[#D4AF37]/10 px-3 py-1 rounded-full">
                {vendor.category}
              </span>
              {vendor.isVerified && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full">
                  <ShieldCheck className="w-3 h-3" /> Verified
                </span>
              )}
            </div>

            <h2 className="text-3xl font-bold text-white font-[Cinzel] mb-2">{vendor.name}</h2>
            
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center gap-1.5 text-[#D4AF37]">
                <Star className="w-4 h-4 fill-current" />
                <span className="text-sm font-black">{vendor.rating.toFixed(1)}</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider ml-1">
                  ({vendor.reviews?.length || 0} Reviews)
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-400">
                <MapPin className="w-4 h-4" />
                <span className="text-sm font-medium">{vendor.location}</span>
              </div>
            </div>

            <div className="space-y-6 flex-1">
              <div>
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-3">About the Professional</h3>
                <p className="text-slate-300 text-sm leading-relaxed font-light">
                  {vendor.description}
                </p>
              </div>

              {vendor.isKosher && (
                <div className="bg-[#D4AF37]/5 border border-[#D4AF37]/20 p-4 rounded-2xl flex items-center gap-4">
                  <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center text-black font-black text-xs">K</div>
                  <div>
                    <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest">Kosher Certified</p>
                    <p className="text-[11px] text-slate-400">Strict adherence to dietary standards</p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-10 grid grid-cols-2 gap-4">
              <button 
                onClick={() => onMessage(vendor)}
                className="flex items-center justify-center gap-2 border border-[#D4AF37]/30 text-[#D4AF37] font-black py-4 rounded-2xl hover:bg-[#D4AF37]/10 transition-all uppercase tracking-widest text-[10px]"
              >
                <MessageCircle className="w-4 h-4" /> Message
              </button>
              <button 
                onClick={() => onBook(vendor)}
                className="bg-[#D4AF37] text-black font-black py-4 rounded-2xl hover:bg-[#E5C76B] transition-all uppercase tracking-widest text-[10px] shadow-lg shadow-[#D4AF37]/20"
              >
                Reserve Now
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default QuickViewModal;
