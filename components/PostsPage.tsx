
import React from 'react';
import { ChevronLeft, Play, Calendar, Share2, Bookmark, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Post, Vendor } from '../types';

interface PostsPageProps {
  posts: Post[];
  vendors: Vendor[];
  onBack: () => void;
  onViewVendor: (vendor: Vendor) => void;
}

const PostsPage: React.FC<PostsPageProps> = ({ posts, vendors, onBack, onViewVendor }) => {
  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col animate-in fade-in duration-500">
      <header className="sticky top-0 z-50 bg-black/90 backdrop-blur-xl border-b border-[#D4AF37]/20 p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-[#D4AF37] font-black uppercase text-[10px] tracking-widest hover:text-[#E5C76B] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Marketplace</span>
          </button>
          <div className="flex flex-col items-center">
             <h2 className="text-xl font-bold font-[Cinzel] text-[#D4AF37] tracking-tight">Simcha Moments</h2>
             <p className="text-[8px] font-black text-[#D4AF37]/60 uppercase tracking-[0.3em]">Community Highlights</p>
          </div>
          <div className="w-24 hidden md:block"></div> 
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-12 space-y-16">
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-bold font-[Cinzel] text-[#D4AF37]">The Gallery</h1>
          <div className="h-px w-24 bg-[#D4AF37]/40 mx-auto"></div>
          <p className="text-zinc-400 text-lg font-light leading-relaxed">Visual inspiration for your upcoming celebration. From sacred ceremonies to high-energy celebrations, see what's possible with our elite community of professionals.</p>
        </div>

        {posts.length === 0 ? (
          <div className="py-32 text-center text-zinc-700 bg-[#111] rounded-3xl border border-dashed border-[#D4AF37]/10">
            <Film className="w-16 h-16 mx-auto mb-6 text-[#D4AF37]/10" />
            <p className="text-2xl font-[Cinzel] text-[#D4AF37]/40">Capturing the first moments...</p>
            <p className="text-sm mt-2 tracking-widest uppercase font-bold opacity-30">Check back soon for event highlights</p>
          </div>
        ) : (
          <motion.div 
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: {
                opacity: 1,
                transition: {
                  staggerChildren: 0.08
                }
              }
            }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10"
          >
            {posts.map((post) => {
              const linkedVendor = post.vendorId ? vendors.find(v => v.id === post.vendorId) : null;
              
              return (
                <motion.div 
                  key={post.id} 
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100, damping: 15 } }
                  }}
                  whileHover={{ 
                    y: -6, 
                    boxShadow: "0 20px 40px rgba(212, 175, 55, 0.08)",
                    borderColor: "rgba(212, 175, 55, 0.3)"
                  }}
                  className="bg-[#111] rounded-3xl border border-[#D4AF37]/10 overflow-hidden group hover:border-[#D4AF37]/40 transition-all duration-500 shadow-2xl flex flex-col"
                >
                  <div className="relative aspect-[4/5] bg-black overflow-hidden cursor-zoom-in">
                    {post.type === 'video' ? (
                      <video 
                        src={post.url} 
                        className="w-full h-full object-cover"
                        controls
                        muted
                      />
                    ) : (
                      <img 
                        src={post.url} 
                        alt={post.title} 
                        className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110 opacity-90 group-hover:opacity-100"
                      />
                    )}
                    
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-60"></div>
                    
                    <div className="absolute bottom-6 left-6 right-6">
                        <h3 className="text-2xl font-bold text-white font-[Cinzel] drop-shadow-lg">{post.title}</h3>
                        <div className="flex items-center gap-2 mt-2 text-[10px] font-black text-[#D4AF37] uppercase tracking-widest">
                            <Calendar className="w-3 h-3" />
                            {new Date(post.timestamp).toLocaleDateString()}
                        </div>
                    </div>

                    {post.type === 'video' && (
                      <div className="absolute top-6 right-6 bg-[#D4AF37] text-black p-2 rounded-full shadow-xl">
                        <Play className="w-4 h-4 fill-current" />
                      </div>
                    )}
                  </div>
                  
                  <div className="p-8 space-y-6 flex-1 flex flex-col">
                    <p className="text-zinc-400 text-sm leading-relaxed font-light">{post.description}</p>
                    
                    <div className="mt-auto pt-6 border-t border-[#D4AF37]/10 flex flex-col gap-6">
                        {linkedVendor && (
                            <motion.button 
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => onViewVendor(linkedVendor)}
                                className="flex items-center gap-4 bg-black/40 p-3 rounded-2xl border border-[#D4AF37]/20 hover:border-[#D4AF37]/60 transition-all text-left w-full cursor-pointer"
                            >
                                <img src={linkedVendor.image} className="w-12 h-12 rounded-xl object-cover" alt="" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-[8px] font-black text-[#D4AF37] uppercase tracking-widest">By Professional</p>
                                    <p className="text-sm font-bold text-white truncate">{linkedVendor.name}</p>
                                </div>
                                <ExternalLink className="w-4 h-4 text-[#D4AF37]/40" />
                            </motion.button>
                        )}
                        
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <motion.button 
                                    whileTap={{ scale: 0.92 }}
                                    className="flex items-center gap-1.5 text-zinc-500 hover:text-[#D4AF37] transition-colors group/bookmark cursor-pointer"
                                >
                                    <Bookmark className="w-5 h-5 group-hover/bookmark:fill-current" />
                                    <span className="text-[10px] font-black">2.4K</span>
                                </motion.button>
                                <motion.button 
                                    whileTap={{ scale: 0.92 }}
                                    className="flex items-center gap-1.5 text-zinc-500 hover:text-[#D4AF37] transition-colors cursor-pointer"
                                >
                                    <Share2 className="w-5 h-5" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Share</span>
                                </motion.button>
                            </div>
                            {!linkedVendor && <div className="w-4"></div>}
                        </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </main>
      
      <footer className="py-12 text-center border-t border-[#D4AF37]/10">
          <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.5em]">Mazel Tov Moments • Community Feed</p>
      </footer>
    </div>
  );
};

// Helper Icon since Film wasn't imported
const Film = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M7 3v18" /><path d="M17 3v18" /><path d="M3 7h4" /><path d="M3 12h4" /><path d="M3 17h4" /><path d="M17 7h4" /><path d="M17 12h4" /><path d="M17 17h4" /></svg>
);

export default PostsPage;
