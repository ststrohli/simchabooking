import React, { useState, useEffect } from 'react';
import { X, Check, Star, MapPin, Users, Crown } from 'lucide-react';
import { Vendor } from '../types';

interface SuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceVendor: Vendor | null;
  recommendations: Vendor[];
  onBook: (vendor: Vendor) => void;
  cartItems: string[]; // IDs of items in cart to show "Added" state
  isPriorityLock?: boolean;
  eventDate?: string;
  allVendors?: Vendor[];
}

const SuggestionModal: React.FC<SuggestionModalProps> = ({ 
  isOpen, 
  onClose, 
  sourceVendor, 
  recommendations, 
  onBook,
  cartItems,
  isPriorityLock,
  eventDate,
  allVendors = []
}) => {
  const [activeTab, setActiveTab] = useState<string>('Venue');

  // Lock background scroll when the modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !sourceVendor) return null;

  const categories = ['Venue', 'Music', 'Photography', 'Videography', 'Catering'];

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const dObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return dObj.toLocaleDateString('default', { month: 'long', day: 'numeric', year: 'numeric' });
      }
    } catch {}
    return dateStr;
  };

  // Availability filter logic:
  // 1. Category matches active tab
  // 2. Exclude the current source vendor we just booked
  // 3. Filter by availability (the selected date should not be inside unavailableDates)
  const vendorsToUse = allVendors && allVendors.length > 0 ? allVendors : recommendations;
  
  const filteredCategoryVendors = vendorsToUse.filter((vendor) => {
    const isCategoryMatch = vendor.category.toLowerCase() === activeTab.toLowerCase();
    if (!isCategoryMatch) return false;

    const isSourceVendor = vendor.id === sourceVendor.id;
    if (isSourceVendor) return false;

    const isUnavailable = eventDate && vendor.unavailableDates?.includes(eventDate);
    if (isUnavailable) return false;

    return true;
  });

  // Limit display to a maximum of 4 vendors per category, sorted by highest rating
  const displayedVendors = filteredCategoryVendors
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 4);

  return (
    <div className="fixed inset-0 z-[100] w-full h-screen bg-black overflow-y-auto flex flex-col items-center justify-start p-0 md:p-6 animate-in fade-in duration-200 min-h-screen">
      {/* Background overlay click handler */}
      <div className="fixed inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} aria-hidden="true" />
      
      {/* Main modal container */}
      <div className="bg-[#0a0a0a] w-full max-w-4xl min-h-screen md:min-h-0 md:max-h-[92vh] md:rounded-3xl shadow-2xl overflow-hidden border border-[#D4AF37]/30 flex flex-col relative z-10 my-auto">
        
        {/* Fixed/Absolute Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-[#D4AF37] bg-black/80 border border-[#D4AF37]/30 hover:border-[#D4AF37] p-3 rounded-full transition-all cursor-pointer z-[9999] hover:scale-110 active:scale-95 shadow-2xl"
          aria-label="Close priority page and return home"
          title="Return to Home Screen"
        >
          <X className="w-6 h-6 text-[#D4AF37]" />
        </button>

        {/* Scrollable container for the modal contents */}
        <div className="overflow-y-auto flex-1 no-scrollbar">
          
          {/* Header */}
          <div className="bg-black p-6 md:p-8 text-white relative overflow-hidden border-b border-[#D4AF37]/20 flex flex-col items-center justify-center text-center w-full px-4 break-words whitespace-normal">
            
            <div className="flex items-center gap-3 mb-2 relative z-10 justify-center">
              <div className="bg-[#D4AF37] p-1 rounded-full">
                <Check className="w-4 h-4 text-black" />
              </div>
              <span className="font-bold text-[#D4AF37] uppercase text-xs tracking-wider">
                {isPriorityLock ? 'Priority Date Lock Active' : 'Added to plan'}
              </span>
            </div>
            
            <h2 className="text-2xl font-bold font-[Cinzel] relative z-10 text-[#D4AF37] flex items-center justify-center text-center flex-wrap leading-tight">
              {isPriorityLock ? <><Crown className="w-6 h-6 mr-2 animate-bounce text-[#D4AF37]" /> Priority Date Lock Active!</> : 'Excellent Choice!'}
            </h2>
            
            <p className="text-zinc-300 mt-2 relative z-10 max-w-lg leading-relaxed text-sm text-center break-words whitespace-normal">
              {isPriorityLock ? (
                <>
                  You have secured your priority celebration date for <span className="text-white font-bold">{formatDate(eventDate)}</span> with <span className="font-bold text-white">{sourceVendor.name}</span>. Below are the other elite vendors who are verified <span className="text-green-400 font-bold">AVAILABLE</span> on this exact same date:
                </>
              ) : (
                <>
                  You've booked <span className="font-bold text-white">{sourceVendor.name}</span>. Others who booked this vendor also considered these professionals.
                </>
              )}
            </p>
          </div>

          {/* Recommendations Content Area */}
          <div className="p-4 md:p-6 bg-[#111] flex flex-col items-center justify-center text-center w-full break-words whitespace-normal">
            
            {/* Centered Premium Header */}
            <div className="text-center font-bold font-[Cinzel] text-sm md:text-base text-[#D4AF37] px-4 py-1 tracking-wide leading-snug break-words whitespace-normal w-full max-w-lg mx-auto">
              Top vendors verified available on this exact date
            </div>
            
            {/* Distinct Gold Divider Line */}
            <hr className="border-[#D4AF37] my-4 w-full opacity-80" />

            {/* Horizontally Scrolling Interactive Category Tabs */}
            <div className="w-full mb-6">
              <div className="flex overflow-x-auto whitespace-nowrap gap-3 pb-2 no-scrollbar scroll-smooth w-full">
                {categories.map((cat) => {
                  const isActive = activeTab === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveTab(cat)}
                      className={`px-5 py-2.5 rounded-full text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer flex-shrink-0 ${
                        isActive
                          ? 'bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20 font-black'
                          : 'border border-[#D4AF37]/40 text-white hover:border-[#D4AF37] hover:bg-[#D4AF37]/10'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Column Layout on Mobile & 2x2 Grid on Desktop */}
            {displayedVendors.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                {displayedVendors.map((vendor) => {
                  const isAdded = cartItems.includes(vendor.id);
                  return (
                    <div 
                      key={vendor.id} 
                      className="bg-black border border-[#D4AF37]/10 rounded-xl p-4 shadow-sm hover:border-[#D4AF37]/40 transition-all flex flex-col items-center text-center justify-between w-full break-words whitespace-normal"
                    >
                      <div className="flex flex-col sm:flex-row gap-3 mb-3 items-center text-center w-full">
                        <img 
                          src={vendor.image} 
                          alt={vendor.name} 
                          className="w-16 h-16 rounded-lg object-cover bg-zinc-900 border border-[#D4AF37]/10 flex-shrink-0"
                          referrerPolicy="no-referrer"
                        />
                        <div className="flex-1 min-w-0 flex flex-col items-center text-center w-full">
                          <div className="flex flex-col items-center gap-1.5 justify-center w-full">
                            <h4 className="font-bold text-zinc-100 text-sm truncate max-w-[180px] font-[Cinzel] text-center break-words whitespace-normal">{vendor.name}</h4>
                            <div className="flex items-center text-[10px] font-bold text-[#D4AF37] bg-[#D4AF37]/10 px-1.5 py-0.5 rounded border border-[#D4AF37]/20 flex-shrink-0">
                              <Star className="w-2.5 h-2.5 fill-[#D4AF37] mr-0.5" />
                              {vendor.rating}
                            </div>
                          </div>
                          <p className="text-[10px] text-[#D4AF37]/60 font-bold uppercase tracking-widest mt-0.5 text-center">{vendor.category}</p>
                          <div className="flex items-center text-[10px] text-zinc-500 mt-1 justify-center w-full">
                            <MapPin className="w-2.5 h-2.5 mr-1 flex-shrink-0" />
                            <span className="truncate max-w-[150px]">{vendor.location}</span>
                          </div>
                        </div>
                      </div>
                      
                      <p className="text-xs text-zinc-400 line-clamp-2 mb-4 flex-1 font-light text-center break-words whitespace-normal">
                        {vendor.description}
                      </p>

                      <button
                        onClick={() => !isAdded && onBook(vendor)}
                        disabled={isAdded}
                        className={`w-full py-2.5 rounded-lg text-[10px] font-black transition-all flex items-center justify-center gap-2 uppercase tracking-widest cursor-pointer ${
                          isAdded
                            ? 'bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20'
                            : 'bg-[#D4AF37] text-black hover:bg-[#E5C76B] shadow-lg shadow-[#D4AF37]/5'
                        }`}
                      >
                        {isAdded ? (
                          <>
                            <Check className="w-3 h-3" /> Added to Plan
                          </>
                        ) : (
                          <>
                            Select & see price
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-zinc-500 py-10 text-center text-xs tracking-wider uppercase font-[Cinzel]">
                No top {activeTab} vendors found available on {formatDate(eventDate)}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default SuggestionModal;
