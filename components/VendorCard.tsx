import React, { useState, useMemo } from 'react';
import { Star, MapPin, Lock, ChevronLeft, ChevronRight, PlayCircle, ShieldCheck, Video, MessageCircle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Vendor, Review } from '../types';

interface VendorCardProps {
  vendor: Vendor;
  onBook: (vendor: Vendor) => void;
  onMessage: (vendor: Vendor) => void;
  onQuickView: (vendor: Vendor) => void;
  selectedDate: string;
  onAddReview: (vendorId: string, review: Omit<Review, 'id' | 'date'>) => void;
}

const VendorCard: React.FC<VendorCardProps> = ({ vendor, onBook, onMessage, onQuickView, selectedDate, onAddReview }) => {
  const [showReviews, setShowReviews] = useState(false);
  const [newReview, setNewReview] = useState({ author: '', rating: 5, text: '' });
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const mediaItems = useMemo(() => {
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

  const isCurrentlySelectedDateBlocked = selectedDate && vendor.unavailableDates?.includes(selectedDate);
  const effectiveBookingDate = selectedDate || new Date().toISOString().split('T')[0];
  const isEffectiveBookingDateBlocked = vendor.unavailableDates?.includes(effectiveBookingDate);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const nextMedia = (e: React.MouseEvent) => { e.stopPropagation(); setIsPlaying(false); setCurrentMediaIndex((prev) => (prev + 1) % mediaItems.length); };
  const prevMedia = (e: React.MouseEvent) => { e.stopPropagation(); setIsPlaying(false); setCurrentMediaIndex((prev) => (prev - 1 + mediaItems.length) % mediaItems.length); };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (newReview.author.trim() && newReview.text.trim()) {
      onAddReview(vendor.id, newReview);
      setNewReview({ author: '', rating: 5, text: '' });
    }
  };

  const currentMedia = mediaItems[currentMediaIndex];

  return (
    <motion.article 
      whileHover={{ 
        y: -6, 
        boxShadow: "0 20px 40px rgba(212, 175, 55, 0.12)",
        borderColor: "rgba(212, 175, 55, 0.4)" 
      }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
      className={`bg-[#111] rounded-xl shadow-2xl border border-[#D4AF37]/10 overflow-hidden hover:border-[#D4AF37]/40 transition-all group relative flex flex-col h-full ${isCurrentlySelectedDateBlocked ? 'opacity-70' : ''}`} 
      aria-labelledby={`vendor-name-${vendor.id}`}
    >
      {isCurrentlySelectedDateBlocked && (
        <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-4" aria-hidden="true">
          <Lock className="w-8 h-8 text-[#D4AF37]/50 mb-2" />
          <p className="font-bold text-[#D4AF37] text-lg font-[Cinzel]">Fully Booked</p>
          <p className="text-xs text-slate-300">on {formatDate(selectedDate)}</p>
        </div>
      )}

      <div className="relative aspect-video w-full overflow-hidden flex-shrink-0 bg-black">
        <div role="region" aria-label={`${vendor.name} media showcase`}>
          {currentMedia.type === 'video' ? (
              <div className="w-full h-full relative group/video">
                  {currentMedia.isNative ? (
                    <video key={currentMedia.url} src={currentMedia.url} className="w-full h-full object-contain bg-black" controls={isPlaying} autoPlay={isPlaying} muted={!isPlaying} playsInline aria-label={`${vendor.name} promotional video`} />
                  ) : (
                    <iframe key={currentMedia.url + isPlaying} src={`${currentMedia.url}${currentMedia.url.includes('?') ? '&' : '?'}autoplay=${isPlaying ? 1 : 0}&controls=1&rel=0&modestbranding=1`} className="w-full h-full border-0 absolute inset-0" allow="autoplay; fullscreen" title={`${vendor.name} video`} />
                  )}
                  {isPlaying && (
                    <motion.button 
                      whileTap={{ scale: 0.9 }}
                      onClick={(e) => { e.stopPropagation(); setIsPlaying(false); }} 
                      className="absolute top-2 right-2 z-20 p-2 bg-black/60 hover:bg-black rounded-full text-white outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]" 
                      aria-label="Stop video"
                    >
                      <X className="w-4 h-4" />
                    </motion.button>
                  )}
                  {!isPlaying && (
                    <button onClick={() => setIsPlaying(true)} className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/50 hover:bg-black/30 transition-all group/play outline-none focus-visible:bg-black/40">
                      <PlayCircle className="w-16 h-16 text-[#D4AF37] opacity-90 group-hover/play:scale-110 transition-transform" aria-hidden="true" />
                      <span className="mt-3 text-[10px] font-extrabold text-[#D4AF37] tracking-[0.3em] uppercase">Watch Showcase</span>
                    </button>
                  )}
              </div>
          ) : (
              <img src={currentMedia.url} alt={`Showcase image ${currentMediaIndex + 1} for ${vendor.name}`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
          )}

          {mediaItems.length > 1 && !isPlaying && (
            <div className="absolute inset-0 flex items-center justify-between p-2">
              <motion.button 
                whileTap={{ scale: 0.9 }}
                onClick={prevMedia} 
                className="z-10 p-2 bg-black/60 rounded-full text-[#D4AF37] hover:bg-black/90 transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]" 
                aria-label="Previous image"
              >
                <ChevronLeft className="w-5 h-5" />
              </motion.button>
              <motion.button 
                whileTap={{ scale: 0.9 }}
                onClick={nextMedia} 
                className="z-10 p-2 bg-black/60 rounded-full text-[#D4AF37] hover:bg-black/90 transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]" 
                aria-label="Next image"
              >
                <ChevronRight className="w-5 h-5" />
              </motion.button>
            </div>
          )}
        </div>

        <div className="absolute top-4 right-4 z-10 bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-[11px] font-black text-[#D4AF37] flex items-center gap-1.5 border border-[#D4AF37]/30 shadow-xl" aria-label={`Rating: ${vendor.rating.toFixed(1)} out of 5 stars`}>
          <Star className="w-3.5 h-3.5 fill-[#D4AF37]" aria-hidden="true" />{vendor.rating.toFixed(1)}
        </div>

        <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
            {vendor.isKosher && <div className="bg-[#D4AF37] text-black px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest">Kosher</div>}
            {vendor.isVerified && <div className="bg-black/80 backdrop-blur-md text-[#D4AF37] px-2.5 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 border border-[#D4AF37]/40"><ShieldCheck className="w-3.5 h-3.5" />Verified</div>}
        </div>

        {/* Quick View Overlay Button */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 pointer-events-none">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={(e) => { e.stopPropagation(); onQuickView(vendor); }}
            className="pointer-events-auto bg-white text-black text-[10px] font-black px-6 py-3 rounded-full uppercase tracking-[0.2em] shadow-2xl transition-all cursor-pointer"
          >
            Quick View
          </motion.button>
        </div>
      </div>
      
      <div className="p-6 flex-1 flex flex-col bg-[#111]">
        <div className="flex justify-between items-start">
          <span className="text-[10px] font-black text-[#D4AF37]/70 uppercase tracking-[0.25em]">{vendor.category}</span>
          <motion.button 
            whileHover={{ scale: 1.1, backgroundColor: "rgba(212, 175, 55, 0.1)" }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onMessage(vendor)} 
            className="p-2 text-[#D4AF37]/60 hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-full transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] cursor-pointer" 
            aria-label={`Send message to ${vendor.name}`}
          >
            <MessageCircle className="w-5 h-5" />
          </motion.button>
        </div>
        <h3 id={`vendor-name-${vendor.id}`} className="font-bold text-xl text-slate-100 font-[Cinzel] mt-2 truncate group-hover:text-[#D4AF37] transition-colors">{vendor.name}</h3>
        <div className="flex items-center text-slate-500 text-xs mb-4 mt-1.5 font-medium"><MapPin className="w-3.5 h-3.5 mr-1.5 text-[#D4AF37]/50" aria-hidden="true" />{vendor.location}</div>
        <p className="text-slate-400 text-sm line-clamp-2 mb-6 h-10 leading-relaxed font-light">{vendor.description}</p>
        
        <div className="mt-auto flex items-center justify-between pt-5 border-t border-[#D4AF37]/10">
          <div className="flex-1">
             <p className="text-[9px] text-[#D4AF37]/60 uppercase font-black tracking-widest">Confidential Quote</p>
             <p className="text-[10px] font-bold text-slate-500 italic">Revealed in booking form</p>
          </div>
          <motion.button 
            whileHover={!isEffectiveBookingDateBlocked ? { scale: 1.03 } : {}}
            whileTap={!isEffectiveBookingDateBlocked ? { scale: 0.96 } : {}}
            onClick={() => onBook(vendor)} 
            disabled={isEffectiveBookingDateBlocked} 
            className={`px-8 py-2.5 text-xs font-black rounded-xl transition-all uppercase tracking-widest outline-none focus-visible:ring-2 focus-visible:ring-white cursor-pointer ${!isEffectiveBookingDateBlocked ? 'bg-[#D4AF37] text-black hover:bg-[#E5C76B]' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`} 
            aria-label={isEffectiveBookingDateBlocked ? 'Already booked' : `Reserve ${vendor.name}`}
          >
            {isEffectiveBookingDateBlocked ? 'Booked' : 'Reserve'}
          </motion.button>
        </div>
      </div>

      <section className="border-t border-[#D4AF37]/10 p-4 bg-black" aria-label="Vendor Reviews">
         <motion.button 
            whileTap={{ scale: 0.99 }}
            onClick={() => setShowReviews(!showReviews)} 
            className="w-full flex items-center justify-between text-slate-500 hover:text-[#D4AF37] text-[10px] font-black uppercase tracking-[0.2em] transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] rounded cursor-pointer" 
            aria-expanded={showReviews}
         >
            <span className="flex items-center gap-3">CLIENT VOICES <span className="bg-[#D4AF37]/10 px-2 py-0.5 rounded-full text-[#D4AF37]">{vendor.reviews?.length || 0}</span></span>
            {showReviews ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
         </motion.button>
         
         {showReviews && (
            <div className="mt-5 space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="space-y-3 max-h-40 overflow-y-auto pr-2 custom-scrollbar" role="list">
                    {vendor.reviews?.map(review => (
                         <div key={review.id} role="listitem" className="bg-[#111] p-3.5 rounded-xl border border-[#D4AF37]/10">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-black text-[10px] text-slate-200 uppercase tracking-wider">{review.author}</span>
                                <div className="flex text-[#D4AF37] items-center" aria-label={`${review.rating} star rating`}>
                                  <Star className="w-2.5 h-2.5 fill-current" aria-hidden="true" /><span className="text-[10px] ml-1 font-bold">{review.rating}</span>
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-400 italic leading-snug">"{review.text}"</p>
                         </div>
                    ))}
                </div>
                
                <form onSubmit={handleSubmitReview} className="pt-3 border-t border-[#D4AF37]/10 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label htmlFor={`rev-author-${vendor.id}`} className="sr-only">Your Name</label>
                        <input id={`rev-author-${vendor.id}`} type="text" placeholder="NAME" required className="w-full bg-black border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-[10px] text-white focus:border-[#D4AF37] outline-none" value={newReview.author} onChange={e => setNewReview({...newReview, author: e.target.value})} />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor={`rev-rating-${vendor.id}`} className="sr-only">Rating</label>
                        <select id={`rev-rating-${vendor.id}`} className="w-full bg-black border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-[10px] text-[#D4AF37] focus:border-[#D4AF37] outline-none" value={newReview.rating} onChange={e => setNewReview({...newReview, rating: Number(e.target.value)})}>
                          {[5,4,3,2,1].map(num => <option key={num} value={num}>{num} STARS</option>)}
                        </select>
                      </div>
                    </div>
                    <label htmlFor={`rev-text-${vendor.id}`} className="sr-only">Review details</label>
                    <textarea id={`rev-text-${vendor.id}`} placeholder="SHARE YOUR EXPERIENCE..." required className="bg-black border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-[10px] text-white focus:border-[#D4AF37] outline-none resize-none h-16" value={newReview.text} onChange={e => setNewReview({...newReview, text: e.target.value})} />
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.96 }}
                      type="submit" 
                      className="bg-[#D4AF37] text-black text-[9px] font-black py-2.5 rounded-lg hover:bg-[#E5C76B] outline-none focus-visible:ring-2 focus-visible:ring-white uppercase tracking-[0.25em]"
                    >
                      Submit appraisal
                    </motion.button>
                </form>
            </div>
         )}
      </section>
    </motion.article>
  );
};

export default VendorCard;