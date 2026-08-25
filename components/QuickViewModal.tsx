import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Star, MapPin, ShieldCheck, PlayCircle, ChevronLeft, ChevronRight, MessageCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Vendor, Review } from '../types';
import { MOCK_BOOKINGS } from '../services/mockData';

interface QuickViewModalProps {
  vendor: Vendor;
  onClose: () => void;
  onBook: (vendor: Vendor) => void;
  onMessage: (vendor: Vendor) => void;
  onAddReview: (vendorId: string, review: Omit<Review, 'id' | 'date'>) => void;
}

const QuickViewModal: React.FC<QuickViewModalProps> = ({ vendor, onClose, onBook, onMessage, onAddReview }) => {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [showReviews, setShowReviews] = useState(false);
  const [newReview, setNewReview] = useState({ author: '', rating: 5, text: '' });

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

  const estimatedResponseTime = useMemo(() => {
    const vendorBookings = MOCK_BOOKINGS.filter(b => b.vendorId === vendor.id);
    const bookingsCount = vendorBookings.length;
    const completedCount = vendorBookings.filter(b => b.status === 'completed' || b.status === 'confirmed').length;
    const completionRate = bookingsCount > 0 ? (completedCount / bookingsCount) : 0.8;
    const score = (vendor.rating * 10) + (completionRate * 20) + (bookingsCount * 5);
    if (score >= 65) return 'Usually responds in 1 hr';
    if (score >= 50) return 'Usually responds in 2 hrs';
    if (score >= 35) return 'Usually responds in 4 hrs';
    return 'Usually responds within 24 hrs';
  }, [vendor]);

  const currentMedia = mediaItems[currentMediaIndex];
  const nextMedia = () => { setIsPlaying(false); setCurrentMediaIndex((prev) => (prev + 1) % mediaItems.length); };
  const prevMedia = () => { setIsPlaying(false); setCurrentMediaIndex((prev) => (prev - 1 + mediaItems.length) % mediaItems.length); };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (newReview.author.trim() && newReview.text.trim()) {
      onAddReview(vendor.id, newReview);
      setNewReview({ author: '', rating: 5, text: '' });
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
    >
      <motion.div 
        initial={{ opacity: 0, y: 40, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.92 }}
        transition={{ type: 'spring', damping: 28, stiffness: 220 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-view-title"
        className="bg-[#111] w-full max-w-4xl rounded-3xl border border-[#D4AF37]/30 shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]"
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-[110] p-2 bg-black/60 hover:bg-black rounded-full text-[#D4AF37] transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
          aria-label="Close modal"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="flex flex-col md:flex-row flex-1 overflow-y-auto md:overflow-hidden">
          {/* Media Section */}
          <div className="w-full md:w-3/5 aspect-video md:aspect-auto relative bg-black flex items-center justify-center flex-shrink-0 md:flex-shrink">
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
                <button onClick={prevMedia} aria-label="Previous image" className="p-3 bg-black/60 rounded-full text-[#D4AF37] hover:bg-black transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"><ChevronLeft className="w-6 h-6" /></button>
                <button onClick={nextMedia} aria-label="Next image" className="p-3 bg-black/60 rounded-full text-[#D4AF37] hover:bg-black transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"><ChevronRight className="w-6 h-6" /></button>
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
          <div className="w-full md:w-2/5 p-6 md:p-8 flex flex-col bg-[#111] overflow-y-auto custom-scrollbar">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.25em] bg-[#D4AF37]/10 px-3 py-1 rounded-full">
                {vendor.category}
              </span>
              {vendor.isVerified && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-500/10 px-3 py-1 rounded-full">
                  <ShieldCheck className="w-3 h-3" /> Verified
                </span>
              )}
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full whitespace-nowrap">
                <Clock className="w-3 h-3" /> {estimatedResponseTime}
              </span>
            </div>
            <h2 id="quick-view-title" className="text-3xl font-bold text-white font-[Cinzel] mb-2">{vendor.name}</h2>
            
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center gap-1.5 text-[#D4AF37]">
                <Star className="w-4 h-4 fill-current" />
                <span className="text-sm font-black">{vendor.rating.toFixed(1)}</span>
                <span className="text-[10px] text-zinc-300 font-bold uppercase tracking-wider ml-1">
                  ({vendor.reviews?.length || 0} Reviews)
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-zinc-300">
                <MapPin className="w-4 h-4 text-[#D4AF37]" />
                <span className="text-sm font-medium">{vendor.location}</span>
              </div>
            </div>

            <div className="space-y-6 flex-1 mb-8">
              <div>
                <h3 className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.3em] mb-3">About the Professional</h3>
                <p className="text-zinc-300 text-sm leading-relaxed font-light">
                  {vendor.description}
                </p>
              </div>

              {vendor.isKosher && (
                <div className="bg-[#D4AF37]/5 border border-[#D4AF37]/20 p-4 rounded-2xl flex items-center gap-4">
                  <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center text-black font-black text-xs">K</div>
                  <div>
                    <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest">Kosher Certified</p>
                    <p className="text-[11px] text-zinc-400">Strict adherence to dietary standards</p>
                  </div>
                </div>
              )}

              {/* Reviews Section */}
              <div className="border-t border-[#D4AF37]/10 pt-6">
                <button 
                  onClick={() => setShowReviews(!showReviews)} 
                  className="w-full flex items-center justify-between text-zinc-300 hover:text-[#D4AF37] text-[10px] font-black uppercase tracking-[0.2em] transition-colors outline-none cursor-pointer"
                  aria-expanded={showReviews}
                >
                  <span className="flex items-center gap-3">
                    Client Voices 
                    <span className="bg-[#D4AF37]/20 px-2 py-0.5 rounded-full text-[#D4AF37]">
                      {vendor.reviews?.length || 0}
                    </span>
                  </span>
                  {showReviews ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                
                <AnimatePresence>
                  {showReviews && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-5 space-y-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                        {vendor.reviews?.map(review => (
                          <div key={review.id} className="bg-black/30 p-3.5 rounded-xl border border-[#D4AF37]/10">
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-black text-[10px] text-zinc-200 uppercase tracking-wider">{review.author}</span>
                              <div className="flex text-[#D4AF37] items-center">
                                <Star className="w-2.5 h-2.5 fill-current" />
                                <span className="text-[10px] ml-1 font-bold">{review.rating}</span>
                              </div>
                            </div>
                            <p className="text-[11px] text-zinc-400 italic leading-snug">"{review.text}"</p>
                          </div>
                        ))}
                      </div>
                      
                      <form onSubmit={handleSubmitReview} className="mt-4 pt-4 border-t border-[#D4AF37]/10 flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-2">
                          <input 
                            type="text" 
                            placeholder="YOUR NAME" 
                            required 
                            className="w-full bg-black/50 border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-[10px] text-white focus:border-[#D4AF37] outline-none" 
                            value={newReview.author} 
                            onChange={e => setNewReview({...newReview, author: e.target.value})} 
                          />
                          <select 
                            className="w-full bg-black/50 border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-[10px] text-[#D4AF37] focus:border-[#D4AF37] outline-none" 
                            value={newReview.rating} 
                            onChange={e => setNewReview({...newReview, rating: Number(e.target.value)})}
                          >
                            {[5,4,3,2,1].map(num => <option key={num} value={num}>{num} STARS</option>)}
                          </select>
                        </div>
                        <textarea 
                          placeholder="SHARE YOUR EXPERIENCE..." 
                          required 
                          className="bg-black/50 border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-[10px] text-white focus:border-[#D4AF37] outline-none resize-none h-16" 
                          value={newReview.text} 
                          onChange={e => setNewReview({...newReview, text: e.target.value})} 
                        />
                        <button 
                          type="submit" 
                          className="bg-[#D4AF37] text-black text-[9px] font-black py-2.5 px-4 rounded-lg hover:bg-[#E5C76B] outline-none uppercase tracking-[0.25em] transition-colors"
                        >
                          Submit Review
                        </button>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="mt-auto pt-4 grid grid-cols-2 gap-3 border-t border-[#D4AF37]/10 sticky bottom-0 bg-[#111]">
              <motion.button 
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onMessage(vendor)}
                className="flex items-center justify-center gap-2 border border-[#D4AF37]/30 text-[#D4AF37] font-black py-3.5 rounded-full hover:bg-[#D4AF37]/10 transition-all uppercase tracking-widest text-[10px] cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" /> Message
              </motion.button>
              <motion.button 
                initial={{ boxShadow: "0 10px 15px -3px rgba(212, 175, 55, 0.2)" }}
                whileHover={{ scale: 1.03, boxShadow: "0 10px 20px rgba(212,175,55,0.25)" }}
                whileTap={{ scale: 0.97 }}
                onClick={() => onBook(vendor)}
                className="bg-[#D4AF37] text-black font-black py-3.5 rounded-full hover:bg-[#E5C76B] transition-all uppercase tracking-widest text-[10px] shadow-lg shadow-[#D4AF37]/20 cursor-pointer flex items-center justify-center"
              >
                Book Now
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default QuickViewModal;
