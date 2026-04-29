import React from 'react';
import { X, Check, Star, MapPin, Users } from 'lucide-react';
import { Vendor } from '../types';

interface SuggestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceVendor: Vendor | null;
  recommendations: Vendor[];
  onBook: (vendor: Vendor) => void;
  cartItems: string[]; // IDs of items in cart to show "Added" state
}

const SuggestionModal: React.FC<SuggestionModalProps> = ({ 
  isOpen, 
  onClose, 
  sourceVendor, 
  recommendations, 
  onBook,
  cartItems 
}) => {
  if (!isOpen || !sourceVendor) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0a0a0a] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-[#D4AF37]/20">
        {/* Header */}
        <div className="bg-black p-6 text-white relative overflow-hidden border-b border-[#D4AF37]/20">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-[#D4AF37] hover:bg-white/5 p-1 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-3 mb-2 relative z-10">
            <div className="bg-[#D4AF37] p-1 rounded-full">
              <Check className="w-4 h-4 text-black" />
            </div>
            <span className="font-bold text-[#D4AF37] uppercase text-xs tracking-wider">Added to plan</span>
          </div>
          
          <h2 className="text-2xl font-bold font-[Cinzel] relative z-10 text-[#D4AF37]">Excellent Choice!</h2>
          <p className="text-slate-300 mt-2 relative z-10 max-w-md">
            You've booked <span className="font-bold text-white">{sourceVendor.name}</span>. 
            Others who booked this vendor also considered these professionals.
          </p>
        </div>

        {/* Recommendations Grid */}
        <div className="p-6 bg-[#111]">
          <h3 className="text-sm font-bold text-[#D4AF37]/50 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-[#D4AF37]" />
            Frequently Booked Together
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {recommendations.map((vendor) => {
              const isAdded = cartItems.includes(vendor.id);
              
              return (
                <div key={vendor.id} className="bg-black border border-[#D4AF37]/10 rounded-xl p-4 shadow-sm hover:border-[#D4AF37]/40 transition-all flex flex-col">
                  <div className="flex gap-3 mb-3">
                    <img 
                      src={vendor.image} 
                      alt={vendor.name} 
                      className="w-16 h-16 rounded-lg object-cover bg-slate-900 border border-[#D4AF37]/10"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h4 className="font-bold text-slate-100 text-sm truncate pr-2 font-[Cinzel]">{vendor.name}</h4>
                        <div className="flex items-center text-[10px] font-bold text-[#D4AF37] bg-[#D4AF37]/10 px-1.5 py-0.5 rounded border border-[#D4AF37]/20">
                          <Star className="w-2.5 h-2.5 fill-[#D4AF37] mr-0.5" />
                          {vendor.rating}
                        </div>
                      </div>
                      <p className="text-[10px] text-[#D4AF37]/60 font-bold uppercase tracking-widest mt-0.5">{vendor.category}</p>
                      <div className="flex items-center text-[10px] text-slate-500 mt-1 truncate">
                        <MapPin className="w-2.5 h-2.5 mr-1" />
                        {vendor.location}
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-xs text-slate-400 line-clamp-2 mb-4 flex-1 font-light">
                    {vendor.description}
                  </p>

                  <button
                    onClick={() => !isAdded && onBook(vendor)}
                    disabled={isAdded}
                    className={`w-full py-2.5 rounded-lg text-[10px] font-black transition-all flex items-center justify-center gap-2 uppercase tracking-widest ${
                      isAdded
                        ? 'bg-green-500/10 text-green-500 border border-green-500/20'
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
        
        <div className="p-6 bg-black border-t border-[#D4AF37]/10 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="text-slate-500 hover:text-[#D4AF37] font-bold text-xs uppercase tracking-widest px-4 py-2 transition-colors"
          >
            Maybe Later
          </button>
          <button 
            onClick={onClose}
            className="bg-black text-[#D4AF37] px-6 py-2 rounded-lg font-black text-xs uppercase tracking-widest hover:bg-[#D4AF37]/10 transition-colors border border-[#D4AF37]/30"
          >
            Continue Planning
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuggestionModal;