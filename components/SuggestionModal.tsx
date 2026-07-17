import React from 'react';
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
}

const SuggestionModal: React.FC<SuggestionModalProps> = ({ 
  isOpen, 
  onClose, 
  sourceVendor, 
  recommendations, 
  onBook,
  cartItems,
  isPriorityLock,
  eventDate
}) => {
  if (!isOpen || !sourceVendor) return null;

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0a0a0a] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-[#D4AF37]/20">
        {/* Header */}
        <div className="bg-black p-6 text-white relative overflow-hidden border-b border-[#D4AF37]/20 flex flex-col items-center justify-center text-center w-full px-4">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-zinc-400 hover:text-[#D4AF37] hover:bg-white/5 p-1 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-3 mb-2 relative z-10 justify-center">
            <div className="bg-[#D4AF37] p-1 rounded-full">
              <Check className="w-4 h-4 text-black" />
            </div>
            <span className="font-bold text-[#D4AF37] uppercase text-xs tracking-wider">
              {isPriorityLock ? 'Priority Date Lock Active' : 'Added to plan'}
            </span>
          </div>
          
          <h2 className="text-2xl font-bold font-[Cinzel] relative z-10 text-[#D4AF37] flex items-center justify-center text-center flex-wrap">
            {isPriorityLock ? <><Crown className="w-6 h-6 mr-2" /> Priority Date Lock Active!</> : 'Excellent Choice!'}
          </h2>
          <p className="text-zinc-300 mt-2 relative z-10 max-w-lg leading-relaxed text-sm text-center">
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

        {/* Recommendations Grid */}
        <div className="p-6 bg-[#111] flex flex-col items-center justify-center text-center w-full px-4">
          <h3 className="text-sm font-bold text-[#D4AF37]/50 uppercase tracking-wider mb-4 flex items-center justify-center gap-2 text-center w-full">
            <Users className="w-4 h-4 text-[#D4AF37]" />
            {isPriorityLock ? 'Coordinating Vendors Available on This Date' : 'Frequently Booked Together'}
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
            {recommendations.map((vendor) => {
              const isAdded = cartItems.includes(vendor.id);
              
              return (
                <div key={vendor.id} className="bg-black border border-[#D4AF37]/10 rounded-xl p-4 shadow-sm hover:border-[#D4AF37]/40 transition-all flex flex-col items-center text-center justify-between w-full">
                  <div className="flex flex-col sm:flex-row gap-3 mb-3 items-center text-center w-full">
                    <img 
                      src={vendor.image} 
                      alt={vendor.name} 
                      className="w-16 h-16 rounded-lg object-cover bg-zinc-900 border border-[#D4AF37]/10 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0 flex flex-col items-center text-center w-full">
                      <div className="flex flex-col items-center gap-1.5 justify-center w-full">
                        <h4 className="font-bold text-zinc-100 text-sm truncate max-w-[180px] font-[Cinzel] text-center">{vendor.name}</h4>
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
                  
                  <p className="text-xs text-zinc-400 line-clamp-2 mb-4 flex-1 font-light text-center">
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
                        Configure & See Price
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="p-6 bg-black border-t border-[#D4AF37]/10 flex flex-col sm:flex-row justify-center items-center gap-3 w-full">
          <button 
            onClick={onClose}
            className="text-zinc-500 hover:text-[#D4AF37] font-bold text-xs uppercase tracking-widest px-4 py-2 transition-colors cursor-pointer text-center"
          >
            Maybe Later
          </button>
          <button 
            onClick={onClose}
            className="bg-black text-[#D4AF37] px-6 py-2 rounded-lg font-black text-xs uppercase tracking-widest hover:bg-[#D4AF37]/10 transition-colors border border-[#D4AF37]/30 cursor-pointer text-center w-full sm:w-auto"
          >
            Continue Planning
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuggestionModal;