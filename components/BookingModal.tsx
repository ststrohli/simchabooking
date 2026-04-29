import React, { useState, useEffect, useMemo } from 'react';
import { X, Calendar, User, Mail, MessageSquare, PartyPopper, MapPin, Clock, Tag, Check, AlertTriangle, Hash } from 'lucide-react';
import { Vendor, SelectedService, VendorCategory } from '../types';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendor: Vendor | null;
  selectedDate: string;
  onConfirm: (details: { 
    eventName: string; 
    clientName: string; 
    contactEmail: string; 
    notes: string; 
    eventLocation: string; 
    eventTime: string;
    selectedServices: SelectedService[];
    totalAmount: number;
  }) => void;
  initialDetails?: { 
    eventName: string; 
    clientName: string; 
    contactEmail: string; 
    eventLocation?: string; 
    eventTime?: string; 
    notes?: string;
    selectedServiceIds?: string[];
    selectedServiceQuantities?: Record<string, number>;
  };
}

const BookingModal: React.FC<BookingModalProps> = ({ 
  isOpen, onClose, vendor, selectedDate, onConfirm, initialDetails 
}) => {
  const [formData, setFormData] = useState({ eventName: '', clientName: '', contactEmail: '', eventLocation: '', eventTime: '', notes: '' });
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isOfferMode, setIsOfferMode] = useState(false);
  const [offeredPrice, setOfferedPrice] = useState<string>('');

  const isVenue = vendor?.category === VendorCategory.VENUE || vendor?.category === 'Venue';
  const effectiveDate = selectedDate || new Date().toISOString().split('T')[0];
  const isDateBlocked = vendor?.unavailableDates?.includes(effectiveDate);

  useEffect(() => {
    if (isOpen) {
        setIsOfferMode(false);
        setOfferedPrice('');
        if (initialDetails) {
            setFormData({ 
              eventName: initialDetails.eventName || '', 
              clientName: initialDetails.clientName || '', 
              contactEmail: initialDetails.contactEmail || '', 
              eventLocation: initialDetails.eventLocation || '', 
              eventTime: initialDetails.eventTime || '', 
              notes: initialDetails.notes || '' 
            });
            setSelectedServiceIds(initialDetails.selectedServiceIds || []);
            setQuantities(initialDetails.selectedServiceQuantities || {});
        } else {
            setFormData({ 
              eventName: '', 
              clientName: '', 
              contactEmail: '', 
              eventLocation: isVenue && vendor ? vendor.location : '', 
              eventTime: '', 
              notes: '' 
            });
            setSelectedServiceIds([]);
            setQuantities({});
        }
    }
  }, [isOpen, initialDetails, vendor, isVenue]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const totalAmount = useMemo(() => {
    if (!vendor) return 0;
    
    let servicesTotal = 0;
    if (selectedServiceIds.length > 0) {
      servicesTotal = vendor.services?.filter(s => selectedServiceIds.includes(s.id)).reduce((sum, s) => {
        const qty = quantities[s.id] || 1;
        return sum + (s.price * qty);
      }, 0) || 0;
    }
    
    // If no services are selected, we show the priceStart as the base. 
    // Otherwise, we calculate based on the selected options.
    return servicesTotal || vendor.priceStart;
  }, [selectedServiceIds, quantities, vendor]);

  if (!isOpen || !vendor) return null;

  const toggleService = (serviceId: string) => {
    if (selectedServiceIds.includes(serviceId)) {
        setSelectedServiceIds(prev => prev.filter(id => id !== serviceId));
        setQuantities(prev => {
            const next = { ...prev };
            delete next[serviceId];
            return next;
        });
    } else {
        setSelectedServiceIds(prev => [...prev, serviceId]);
        setQuantities(prev => ({ ...prev, [serviceId]: 1 }));
    }
  };

  const handleQuantityChange = (serviceId: string, val: string) => {
    const num = parseInt(val) || 0;
    setQuantities(prev => ({ ...prev, [serviceId]: Math.max(0, num) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDateBlocked) return;
    
    const selectedServices = vendor.services
        ?.filter(s => selectedServiceIds.includes(s.id))
        .map(s => ({ 
            id: s.id, 
            name: s.name, 
            price: s.price, 
            quantity: quantities[s.id] || 1,
            unit: s.unit || null
        })) || [];
        
    const finalLocation = isVenue ? vendor.location : formData.eventLocation;
    onConfirm({ 
        ...formData, 
        eventLocation: finalLocation, 
        selectedServices, 
        totalAmount: isOfferMode ? (parseInt(offeredPrice) || 0) : totalAmount,
        // @ts-ignore - added to internal callback but type checked manually
        isOffer: isOfferMode,
        offeredPrice: isOfferMode ? (parseInt(offeredPrice) || 0) : undefined
    } as any);
  };

  const inputClass = "w-full pl-10 pr-4 py-2.5 bg-black border border-[#D4AF37]/30 rounded-lg text-slate-100 placeholder:text-slate-600 focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] outline-none transition-all";
  const labelClass = "block text-xs font-bold text-[#D4AF37]/70 uppercase tracking-widest mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="bg-[#0a0a0a] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto border border-[#D4AF37]/20">
        <div className="bg-black p-6 text-white flex justify-between items-start sticky top-0 z-10 border-b border-[#D4AF37]/20">
          <div>
            <h2 id="modal-title" className="text-xl font-bold font-[Cinzel] text-[#D4AF37]">{initialDetails ? 'Update Your Selection' : 'Reserve Service'}</h2>
            <p className="text-slate-500 text-xs mt-1">Vendor: <span className="text-slate-100 font-bold">{vendor.name}</span></p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-[#D4AF37] p-2 outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-full" aria-label="Close booking modal"><X className="w-6 h-6" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className={`border rounded-lg p-4 flex items-center gap-4 transition-colors ${isDateBlocked ? 'bg-red-500/10 border-red-500/30 text-red-500' : 'bg-[#D4AF37]/10 border-[#D4AF37]/20 text-[#D4AF37]'}`} role="alert">
            {isDateBlocked ? <AlertTriangle className="w-6 h-6 flex-shrink-0" aria-hidden="true" /> : <Calendar className="w-6 h-6 flex-shrink-0" aria-hidden="true" />}
            <div>
              <p className="text-xs font-black uppercase tracking-widest">Requested Date</p>
              <p className="text-sm font-bold">{effectiveDate} {isDateBlocked ? '— FULLY BOOKED' : '— AVAILABLE'}</p>
            </div>
          </div>

          {vendor.services && vendor.services.length > 0 && (
            <fieldset className="space-y-3">
              <legend className={labelClass}>Select Package & Units</legend>
              <div className="grid grid-cols-1 gap-3">
                {vendor.services.map((service) => (
                  <div key={service.id} className="flex flex-col gap-2">
                    <label className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all focus-within:ring-2 focus-within:ring-[#D4AF37] ${selectedServiceIds.includes(service.id) ? 'bg-[#D4AF37]/10 border-[#D4AF37]' : 'bg-black border-[#D4AF37]/20 hover:border-[#D4AF37]/50'}`}>
                        <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${selectedServiceIds.includes(service.id) ? 'bg-[#D4AF37] border-[#D4AF37]' : 'border-[#D4AF37]/30'}`} aria-hidden="true">{selectedServiceIds.includes(service.id) && <Check className="w-2.5 h-2.5 text-black" />}</div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-100">{service.name}</span>
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                                ${service.price.toLocaleString()} {service.unit ? `per ${service.unit}` : ''}
                            </span>
                        </div>
                        </div>
                        <input type="checkbox" className="sr-only" checked={selectedServiceIds.includes(service.id)} onChange={() => toggleService(service.id)} />
                    </label>
                    
                    {selectedServiceIds.includes(service.id) && service.allowQuantity && (
                        <div className="flex items-center gap-3 pl-8 animate-in slide-in-from-left-2 duration-300">
                            <div className="relative flex-1">
                                <Hash className="absolute left-3 top-2.5 w-3.5 h-3.5 text-[#D4AF37]/50" />
                                <input 
                                    type="number" 
                                    min="1"
                                    className="w-full bg-black/50 border border-[#D4AF37]/20 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white focus:border-[#D4AF37] outline-none" 
                                    placeholder={`Enter number of ${service.unit || 'units'}...`}
                                    value={quantities[service.id] || 1}
                                    onChange={(e) => handleQuantityChange(service.id, e.target.value)}
                                />
                            </div>
                            <span className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest">
                                Total: ${(service.price * (quantities[service.id] || 1)).toLocaleString()}
                            </span>
                        </div>
                    )}
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="event-name" className={labelClass}>Event Name</label>
              <div className="relative">
                <PartyPopper className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" aria-hidden="true" />
                <input id="event-name" required type="text" placeholder="Sarah's Wedding" className={inputClass} value={formData.eventName} onChange={(e) => setFormData({...formData, eventName: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="event-time" className={labelClass}>Time</label>
                <div className="relative">
                  <Clock className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" aria-hidden="true" />
                  <input id="event-time" required type="time" className={inputClass + " [color-scheme:dark]"} value={formData.eventTime} onChange={(e) => setFormData({...formData, eventTime: e.target.value})} />
                </div>
              </div>
              <div>
                <label htmlFor="client-name" className={labelClass}>Your Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" aria-hidden="true" />
                  <input id="client-name" required type="text" placeholder="Full Name" className={inputClass} value={formData.clientName} onChange={(e) => setFormData({...formData, clientName: e.target.value})} />
                </div>
              </div>
            </div>
            {!isVenue && (
              <div>
                <label htmlFor="event-location" className={labelClass}>Location</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" aria-hidden="true" />
                  <input id="event-location" required type="text" placeholder="Address or Venue" className={inputClass} value={formData.eventLocation} onChange={(e) => setFormData({...formData, eventLocation: e.target.value})} />
                </div>
              </div>
            )}
            <div>
              <label htmlFor="client-email" className={labelClass}>Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" aria-hidden="true" />
                <input id="client-email" required type="email" placeholder="email@example.com" className={inputClass} value={formData.contactEmail} onChange={(e) => setFormData({...formData, contactEmail: e.target.value})} />
              </div>
            </div>
            <div>
              <label htmlFor="booking-notes" className={labelClass}>Special Requests</label>
              <div className="relative">
                <MessageSquare className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" aria-hidden="true" />
                <textarea id="booking-notes" rows={3} placeholder="Special requests..." className={inputClass + " resize-none"} value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4 border-t border-[#D4AF37]/20">
             <div className="flex justify-between items-end">
                <div className="flex flex-col">
                    <span className="text-slate-500 text-[10px] uppercase tracking-widest font-black">{isOfferMode ? 'My Proposed Price' : 'Estimated Total'}</span>
                    <div className="flex items-center gap-2">
                        {isOfferMode ? (
                            <div className="flex items-center text-3xl font-bold text-white">
                                <span className="text-[#D4AF37] mr-1">$</span>
                                <input 
                                    type="number" 
                                    value={offeredPrice} 
                                    onChange={(e) => setOfferedPrice(e.target.value)} 
                                    className="bg-transparent border-b-2 border-[#D4AF37] w-32 focus:outline-none" 
                                    placeholder="Price"
                                    autoFocus
                                />
                            </div>
                        ) : (
                            <span className="text-3xl font-bold text-[#D4AF37]" aria-live="polite">${totalAmount.toLocaleString()}</span>
                        )}
                    </div>
                </div>
                {vendor.allowOffers && !isOfferMode && (
                    <button 
                        type="button" 
                        onClick={() => { setIsOfferMode(true); setOfferedPrice(totalAmount.toString()); }}
                        className="text-[10px] font-black text-[#D4AF37] border border-[#D4AF37]/30 px-3 py-1.5 rounded-full hover:bg-[#D4AF37]/10 transition-all uppercase tracking-widest"
                    >
                        Make an Offer
                    </button>
                )}
                {isOfferMode && (
                    <button 
                        type="button" 
                        onClick={() => setIsOfferMode(false)}
                        className="text-[10px] font-black text-slate-500 hover:text-white transition-all uppercase tracking-widest"
                    >
                        Standard Price
                    </button>
                )}
             </div>
             {isOfferMode && <p className="text-[10px] text-slate-500 leading-relaxed italic">Propose your desired price to the vendor. They will review and respond to your inquiry.</p>}
          </div>

          <div className="flex gap-4">
            <button type="button" onClick={onClose} className="flex-1 py-3 font-bold text-slate-500 hover:text-[#D4AF37] outline-none focus-visible:ring-1 focus-visible:ring-[#D4AF37] rounded-lg">Cancel</button>
            <button 
                type="submit" 
                disabled={isDateBlocked || (isOfferMode && (!offeredPrice || parseInt(offeredPrice) <= 0))} 
                className={`flex-1 py-3 rounded-xl font-bold transition-all shadow-lg border outline-none focus-visible:ring-2 focus-visible:ring-white ${isDateBlocked || (isOfferMode && !offeredPrice) ? 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed' : 'bg-[#D4AF37] text-black hover:bg-[#E5C76B] border-[#D4AF37]/20'}`}
            >
                {isDateBlocked ? 'Unavailable' : (isOfferMode ? 'Send Offer' : 'Add to Plan')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BookingModal;
