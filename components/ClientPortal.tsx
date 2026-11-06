import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, ShoppingBag, Calendar, MessageSquare, LogOut, Trash2, 
  ChevronRight, ChevronDown, MapPin, Clock, CreditCard, Check, CheckCircle, CheckCheck, Bell, X, Menu, Send,
  FileText, Upload, Download, Loader2, Plus, Search, Edit3, ArrowLeft, ShieldCheck,
  Mic, Image as ImageIcon, Play, DollarSign, User, AlertCircle, Layers
} from 'lucide-react';
import { CartItem, Booking, Message, Vendor, UserAccount } from '../types';
import { storage, db } from '../services/firebase';
import { markChatAsRead } from '../services/messagingService';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { uploadFileRobustly } from '../services/uploadService';
import { CustomAudioPlayer } from './CustomAudioPlayer';
import { trackFunnelStep } from '../services/analyticsService';
import { EmbeddedCheckoutModal } from './EmbeddedCheckoutModal';
import { ThemeModeSwitch } from './ThemeModeSwitch';
import { useModalDragDismiss, ModalDragIndicator } from './useModalDragDismiss';
import { collection, doc, setDoc, updateDoc, deleteDoc, getDocs, query, where, orderBy, onSnapshot, writeBatch } from 'firebase/firestore';

const CLIENT_MODAL_TRANSITION = { duration: 1.15, ease: [0.25, 0.85, 0.35, 1] as const };

const AccordionSection: React.FC<{
  title: string;
  icon: any;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: string | number;
}> = ({ title, icon: Icon, isOpen, onToggle, children, badge }) => (
  <div className="bg-zinc-900/50 rounded-2xl border border-white/5 overflow-hidden transition-all duration-300">
    <button
      type="button"
      onClick={onToggle}
      className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors text-left cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-[#D4AF37]/10 text-[#D4AF37]">
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-[11px] font-black text-white uppercase tracking-widest">{title}</span>
        {badge !== undefined && (
          <span className="px-2 py-0.5 rounded-full bg-[#D4AF37]/20 text-[#D4AF37] text-[9px] font-black">
            {badge}
          </span>
        )}
      </div>
      <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-[#D4AF37]' : ''}`} />
    </button>
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.04, 0.62, 0.23, 0.98] }}
        >
          <div className="p-4 pt-0 border-t border-white/5 space-y-4">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

interface ClientEventScopeModalProps {
  mode: 'booking' | 'plan';
  booking?: Booking;
  planItem?: CartItem;
  planIndex?: number;
  vendor: Vendor;
  user: UserAccount;
  countdown: { text: string; isToday: boolean } | null;
  openSections: { logistics: boolean; services: boolean; vendorInfo: boolean; notes: boolean };
  toggleSection: (section: 'logistics' | 'services' | 'vendorInfo' | 'notes') => void;
  onClose: () => void;
  onMessage: () => void;
  onPay?: () => void;
  onPrefetchPay?: () => void;
  isProcessingPayment?: boolean;
  onMakeOrUpdateOffer?: (offerPrice: number, noteAddition?: string) => Promise<void>;
  onCancelBooking?: () => Promise<void>;
  onEditPlanItem?: () => void;
  onRemovePlanItem?: () => void;
  onSendPlanRequests?: () => void;
}

const ClientEventScopeModal: React.FC<ClientEventScopeModalProps> = ({
  mode,
  booking,
  planItem,
  vendor,
  user,
  countdown,
  openSections,
  toggleSection,
  onClose,
  onMessage,
  onPay,
  onPrefetchPay,
  isProcessingPayment,
  onMakeOrUpdateOffer,
  onCancelBooking,
  onEditPlanItem,
  onRemovePlanItem,
  onSendPlanRequests,
}) => {
  const {
    backdropOpacity,
    isDismissing,
    dismissWithSlideOut,
    dragModalProps,
    dragHandleProps,
  } = useModalDragDismiss(onClose);

  const isBooking = mode === 'booking' && !!booking;
  const currentAmount = isBooking ? booking!.amount : (planItem?.amount || 0);
  const currentOfferedPrice = isBooking ? booking!.offeredPrice : planItem?.offeredPrice;
  const currentIsOffer = isBooking
    ? Boolean(
        booking!.isOffer ||
        booking!.offeredPrice ||
        booking!.notes?.includes('OFFERED PRICE:') ||
        booking!.notes?.includes('[Client Offer')
      )
    : Boolean(planItem?.isOffer || planItem?.offeredPrice);

  const [showOfferEditor, setShowOfferEditor] = useState(false);
  const [offerAmountInput, setOfferAmountInput] = useState<string>(
    currentOfferedPrice ? String(currentOfferedPrice) : String(currentAmount || '')
  );
  const [offerMessageInput, setOfferMessageInput] = useState('');
  const [isSavingOffer, setIsSavingOffer] = useState(false);
  const [offerFeedback, setOfferFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const eventDate = isBooking ? booking!.date : (planItem?.date || '');
  const eventTime = isBooking ? booking!.eventTime : planItem?.eventTime;
  const eventName = isBooking ? booking!.eventName : planItem?.eventName;
  const eventLocation = isBooking
    ? (booking!.eventLocation || booking!.eventAddress || vendor.location || '')
    : (planItem?.eventLocation || (planItem as any)?.eventAddress || vendor.location || '');
  const selectedServices = isBooking ? (booking!.selectedServices || []) : (planItem?.selectedServices || []);
  const notesText = isBooking ? booking!.notes : planItem?.notes;
  const clientName = isBooking ? (booking!.clientName || user.name) : (planItem?.clientName || user.name);
  const contactEmail = isBooking ? (booking!.contactEmail || user.username) : (planItem?.contactEmail || user.username);
  const createdAt = isBooking && booking!.createdAt ? new Date(booking!.createdAt).toLocaleDateString() : undefined;

  const locationItems = selectedServices.filter((s: any) => s.type === 'location');
  const serviceAddOnItems = selectedServices.filter((s: any) => s.type !== 'location');

  const handleSubmitOffer = async () => {
    const parsed = Number(offerAmountInput.replace(/[^0-9.]/g, ''));
    if (!parsed || parsed <= 0) {
      setOfferFeedback({ type: 'error', text: 'Please enter a valid offer amount greater than $0.' });
      return;
    }
    if (mode === 'plan' && onEditPlanItem) {
      dismissWithSlideOut(() => {
        onClose();
        onEditPlanItem();
      });
      return;
    }
    if (!onMakeOrUpdateOffer) return;
    setIsSavingOffer(true);
    setOfferFeedback(null);
    try {
      await onMakeOrUpdateOffer(parsed, offerMessageInput.trim() || undefined);
      setOfferFeedback({ type: 'success', text: `Offer of $${parsed.toLocaleString()} sent to ${vendor.name}!` });
      setOfferMessageInput('');
      setTimeout(() => {
        setShowOfferEditor(false);
      }, 900);
    } catch (err: any) {
      setOfferFeedback({ type: 'error', text: err?.message || 'Could not update offer. Please try again.' });
    } finally {
      setIsSavingOffer(false);
    }
  };

  const handleConfirmCancelBooking = async () => {
    if (!onCancelBooking) return;
    setIsCancelling(true);
    try {
      await onCancelBooking();
      dismissWithSlideOut();
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Event Details & Scope"
      style={{ opacity: backdropOpacity }}
      transition={CLIENT_MODAL_TRANSITION}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismissWithSlideOut();
      }}
      className={`fixed inset-0 z-[260] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-xl overflow-hidden ${
        isDismissing ? 'pointer-events-none' : ''
      }`}
    >
      <motion.div
        {...dragModalProps}
        transition={CLIENT_MODAL_TRANSITION}
        onClick={(e) => e.stopPropagation()}
        className={`simcha-scope-sheet relative w-full sm:w-full sm:max-w-xl bg-[#0d0d0d] h-[91dvh] sm:h-[90vh] sm:max-h-[90vh] rounded-t-[2.5rem] rounded-b-none sm:rounded-[2.5rem] border-t-2 border-r border-l sm:border border-[#D4AF37]/30 overflow-hidden shadow-[0_-20px_50px_rgba(0,0,0,0.8)] flex flex-col mt-auto sm:mt-0 transform-gpu pb-[env(safe-area-inset-bottom)] ${
          isDismissing ? 'pointer-events-none' : ''
        }`}
      >
        {/* Top Interactive Drag Zone */}
        <div
          {...dragHandleProps}
          className="pt-3 pb-1 cursor-grab active:cursor-grabbing select-none shrink-0 touch-none"
        >
          <ModalDragIndicator />
        </div>

        {/* Floating Close Button */}
        <button
          type="button"
          onClick={() => dismissWithSlideOut()}
          aria-label="Close Event Details"
          className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 z-30 p-2 bg-black/70 backdrop-blur-md hover:bg-[#D4AF37] text-white hover:text-black rounded-full transition-all border border-white/15 cursor-pointer shadow-lg"
        >
          <X className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Modal Header (Draggable) */}
        <div
          {...dragHandleProps}
          className="px-4 sm:px-6 pt-1 pb-3 border-b border-white/5 flex items-center justify-between bg-gradient-to-b from-[#151515] to-[#0d0d0d] shrink-0 cursor-grab active:cursor-grabbing select-none touch-none"
        >
          <div className="flex items-center gap-3 min-w-0 pr-10">
            <div className="w-11 h-11 rounded-full overflow-hidden border border-[#D4AF37]/40 bg-[#D4AF37]/15 shrink-0 flex items-center justify-center text-[#D4AF37] font-[Cinzel] font-bold">
              {vendor.image ? (
                <img src={vendor.image} alt={vendor.name} className="w-full h-full object-cover" />
              ) : (
                vendor.name.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[8px] font-black text-[#D4AF37] uppercase tracking-[0.2em] px-2 py-0.5 rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/10">
                  {vendor.category}
                </span>
                {isBooking ? (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                      booking!.status === 'confirmed'
                        ? 'bg-green-500/20 text-green-300 border-green-500/40'
                        : booking!.status === 'cancelled'
                        ? 'bg-red-500/20 text-red-300 border-red-500/40'
                        : 'bg-[#D4AF37]/15 text-[#D4AF37] border-[#D4AF37]/40'
                    }`}
                  >
                    {booking!.status}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/40">
                    In Plan
                  </span>
                )}
                {isBooking && booking!.paymentStatus === 'paid' && (
                  <span className="bg-green-500/20 text-green-300 border border-green-500/40 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">
                    Paid
                  </span>
                )}
                {currentIsOffer && (
                  <span className="bg-[#D4AF37] text-black px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">
                    Offer: ${(currentOfferedPrice || currentAmount).toLocaleString()}
                  </span>
                )}
                {countdown && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                      countdown.isToday
                        ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                        : 'bg-white/5 text-[#D4AF37] border-[#D4AF37]/30'
                    }`}
                  >
                    {countdown.text}
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white font-[Cinzel] tracking-tight truncate">
                {vendor.name}
              </h2>
              <p className="text-[11px] text-zinc-400 font-medium truncate">
                {eventName || 'Simcha Celebration'} • {eventDate}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Body - Accordion Sections */}
        <div
          className="p-4 sm:p-6 overflow-y-auto space-y-3 custom-scrollbar flex-1 overscroll-contain"
        >
          {/* Quick Summary Strip */}
          <div className="grid grid-cols-3 gap-2 bg-black/50 p-3 rounded-2xl border border-white/5">
            <div className="text-center px-2 py-1 border-r border-white/5">
              <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">Total Value</p>
              <p className="text-sm sm:text-base font-bold text-[#D4AF37] font-[Cinzel] mt-0.5">
                ${currentAmount.toLocaleString()}
              </p>
            </div>
            <div className="text-center px-2 py-1 border-r border-white/5">
              <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">Event Date</p>
              <p className="text-xs font-bold text-white mt-0.5 truncate">{eventDate || 'TBD'}</p>
            </div>
            <div className="text-center px-2 py-1">
              <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">
                {isBooking ? 'Payment' : 'Stage'}
              </p>
              <p className="text-xs font-bold text-white uppercase mt-0.5 truncate">
                {isBooking ? (booking!.paymentStatus || 'Pending') : 'Saved in Plan'}
              </p>
            </div>
          </div>

          {/* Inline Offer Editor Box (when toggled open) */}
          <AnimatePresence initial={false}>
            {showOfferEditor && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 rounded-2xl bg-[#14120a] border border-[#D4AF37]/45 space-y-3 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-[#D4AF37]" />
                      <span className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest">
                        {currentIsOffer ? 'Update Your Offer' : 'Make an Offer to Vendor'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowOfferEditor(false);
                        setOfferFeedback(null);
                      }}
                      className="text-zinc-400 hover:text-white p-1 rounded-full"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 ml-2">
                        Offer Amount ($)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#D4AF37] font-bold text-sm">$</span>
                        <input
                          type="number"
                          min="1"
                          value={offerAmountInput}
                          onChange={(e) => setOfferAmountInput(e.target.value)}
                          placeholder={String(currentAmount)}
                          className="w-full bg-black border border-[#D4AF37]/35 focus:border-[#D4AF37] rounded-full pl-8 pr-4 py-2.5 text-xs font-bold text-white outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1 ml-2">
                        Note for Vendor (Optional)
                      </label>
                      <input
                        type="text"
                        value={offerMessageInput}
                        onChange={(e) => setOfferMessageInput(e.target.value)}
                        placeholder="e.g., Flexible on hours or setup..."
                        className="w-full bg-black border border-white/15 focus:border-[#D4AF37] rounded-full px-4 py-2.5 text-xs text-white outline-none"
                      />
                    </div>
                  </div>

                  {offerFeedback && (
                    <div
                      className={`px-3.5 py-2 rounded-full text-[10px] font-bold flex items-center gap-2 ${
                        offerFeedback.type === 'success'
                          ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                          : 'bg-red-500/20 text-red-300 border border-red-500/40'
                      }`}
                    >
                      {offerFeedback.type === 'success' ? (
                        <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span>{offerFeedback.text}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowOfferEditor(false)}
                      className="px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white border border-white/10 cursor-pointer"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      disabled={isSavingOffer}
                      onClick={handleSubmitOffer}
                      className="px-5 py-2 rounded-full bg-[#D4AF37] hover:bg-[#E5C76B] text-black text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 cursor-pointer shadow-lg"
                    >
                      {isSavingOffer ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      <span>{currentIsOffer ? 'Update Offer' : 'Submit Offer'}</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 1. Event Logistics & Schedule */}
          <AccordionSection
            title="Event Logistics & Schedule"
            icon={Calendar}
            isOpen={openSections.logistics}
            onToggle={() => toggleSection('logistics')}
          >
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">Event Date</p>
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span>{eventDate || 'Not specified'}</span>
                </p>
              </div>
              <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">Event Time</p>
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                  <span>
                    {(() => {
                      if (!eventTime) return 'Standard Hours';
                      const trimmed = eventTime.trim();
                      if (/AM|PM/i.test(trimmed)) return trimmed.toUpperCase();
                      const m24 = trimmed.match(/^(\d{1,2}):(\d{2})/);
                      if (m24) {
                        const h24 = parseInt(m24[1], 10);
                        const mins = m24[2];
                        const period = h24 >= 12 ? 'PM' : 'AM';
                        const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
                        return `${h12}:${mins} ${period}`;
                      }
                      return trimmed;
                    })()}
                  </span>
                </p>
              </div>
            </div>

            <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">Celebration / Simcha Name</p>
                <p className="text-xs font-bold text-white break-words">{eventName || 'Private Simcha Event'}</p>
              </div>
              {countdown && (
                <span className="px-3 py-1 rounded-full bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/35 text-[9px] font-black uppercase tracking-widest shrink-0">
                  {countdown.text}
                </span>
              )}
            </div>

            <div className="p-3 bg-black/40 rounded-xl border border-white/5 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">Venue / Location</p>
                <p className="text-xs font-bold text-white break-words">
                  {eventLocation || 'Location to be confirmed with vendor'}
                </p>
              </div>
              {eventLocation && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(eventLocation)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 bg-[#D4AF37]/10 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black rounded-full border border-[#D4AF37]/30 transition-all text-[9px] font-black uppercase tracking-widest shrink-0"
                >
                  <MapPin className="w-3 h-3" />
                  <span>Navigate</span>
                </a>
              )}
            </div>
          </AccordionSection>

          {/* 2. Selected Packages, Locations, Add-ons & Pricing */}
          <AccordionSection
            title="Packages, Add-ons & Pricing"
            icon={Layers}
            isOpen={openSections.services}
            onToggle={() => toggleSection('services')}
            badge={selectedServices.length || 1}
          >
            <div className="space-y-2.5 pt-2">
              {selectedServices.length > 0 ? (
                <>
                  {locationItems.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black text-[#D4AF37] uppercase tracking-widest px-1">
                        Selected Location Tier
                      </p>
                      {locationItems.map((s: any, idx: number) => (
                        <div
                          key={`loc-${idx}`}
                          className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-[#D4AF37]/25"
                        >
                          <div className="space-y-0.5 min-w-0 pr-3">
                            <p className="text-xs font-bold text-white flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                              <span>{s.name}</span>
                            </p>
                            <div className="flex flex-wrap gap-2 text-[9px] text-zinc-400 font-bold uppercase tracking-widest">
                              {s.hours ? <span>{s.hours} Total Hrs</span> : null}
                              {s.baseHours ? <span>• {s.baseHours} Base Hrs Included</span> : null}
                              {s.hourRate ? <span>• +${s.hourRate}/Extra Hr</span> : null}
                            </div>
                          </div>
                          <span className="text-xs font-black text-[#D4AF37] font-[Cinzel] shrink-0">
                            ${(s.calculatedPrice ?? s.price ?? 0).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {serviceAddOnItems.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black text-[#D4AF37] uppercase tracking-widest px-1">
                        Selected Services & Add-ons ({serviceAddOnItems.length})
                      </p>
                      {serviceAddOnItems.map((s: any, idx: number) => (
                        <div
                          key={`srv-${idx}`}
                          className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5"
                        >
                          <div className="space-y-0.5 min-w-0 pr-3">
                            <p className="text-xs font-bold text-white">{s.name}</p>
                            <div className="flex flex-wrap gap-2 text-[9px] text-zinc-400 font-bold uppercase tracking-widest">
                              {s.quantity && s.quantity > 1 && <span className="text-[#D4AF37]">Qty: {s.quantity}</span>}
                              {s.hours && <span>{s.hours} Hrs</span>}
                              {s.unit && <span>({s.unit})</span>}
                              {s.description && <span className="normal-case text-zinc-400">{s.description}</span>}
                            </div>
                          </div>
                          <span className="text-xs font-black text-[#D4AF37] font-[Cinzel] shrink-0">
                            ${(s.calculatedPrice ?? ((s.price || 0) * (s.quantity || 1))).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5">
                  <div>
                    <p className="text-xs font-bold text-white">Standard {vendor.category} Package</p>
                    <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest">Base Reservation</p>
                  </div>
                  <span className="text-xs font-black text-[#D4AF37] font-[Cinzel]">
                    ${currentAmount.toLocaleString()}
                  </span>
                </div>
              )}

              {/* Financial & Offer Breakdown Box */}
              <div className="p-3.5 bg-gradient-to-br from-[#D4AF37]/15 to-black rounded-xl border border-[#D4AF37]/30 space-y-2 mt-2">
                {currentIsOffer && (
                  <div className="flex items-center justify-between text-xs border-b border-white/10 pb-2">
                    <span className="text-[9px] font-black text-[#D4AF37] uppercase tracking-widest">
                      Submitted Offer Price
                    </span>
                    <span className="font-bold text-[#D4AF37]">
                      ${(currentOfferedPrice || currentAmount).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[8px] font-black text-[#D4AF37] uppercase tracking-widest">
                      {isBooking ? 'Total Booking Amount' : 'Estimated Plan Total'}
                    </p>
                    <p className="text-[9px] text-zinc-400 font-bold uppercase tracking-widest mt-0.5">
                      {isBooking
                        ? `Status: ${booking!.status.toUpperCase()} • Payment: ${(booking!.paymentStatus || 'pending').toUpperCase()}`
                        : 'Ready to send booking request'}
                    </p>
                  </div>
                  <p className="text-lg sm:text-xl font-black text-white font-[Cinzel]">
                    ${currentAmount.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </AccordionSection>

          {/* 3. Vendor & Reservation Info */}
          <AccordionSection
            title="Vendor & Reservation Details"
            icon={User}
            isOpen={openSections.vendorInfo}
            onToggle={() => toggleSection('vendorInfo')}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
              <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">Vendor</p>
                <p className="text-xs font-bold text-white">{vendor.name}</p>
                <p className="text-[10px] text-[#D4AF37] uppercase tracking-wider mt-0.5">{vendor.category}</p>
              </div>
              <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">Vendor Base Area</p>
                <p className="text-xs font-bold text-white">{vendor.location || 'Tri-State / Worldwide'}</p>
                {vendor.contactEmail && (
                  <p className="text-[10px] text-zinc-400 truncate mt-0.5">{vendor.contactEmail}</p>
                )}
              </div>
              <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">Reserved By</p>
                <p className="text-xs font-bold text-white">{clientName}</p>
                <p className="text-[10px] text-zinc-400 truncate mt-0.5">{contactEmail}</p>
              </div>
              <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                <p className="text-[8px] font-black text-zinc-400 uppercase tracking-widest mb-1">Reference</p>
                <p className="text-xs font-bold text-white font-mono">
                  {isBooking ? `#${booking!.id.slice(-8).toUpperCase()}` : 'DRAFT-PLAN'}
                </p>
                {createdAt && <p className="text-[10px] text-zinc-400 mt-0.5">Booked {createdAt}</p>}
              </div>
            </div>
          </AccordionSection>

          {/* 4. Special Requests & Notes */}
          <AccordionSection
            title="Notes & Special Requests"
            icon={FileText}
            isOpen={openSections.notes}
            onToggle={() => toggleSection('notes')}
          >
            <div className="pt-2 space-y-2">
              <div className="p-3.5 bg-black/40 rounded-xl border border-white/5">
                <p className="text-xs text-zinc-300 leading-relaxed italic whitespace-pre-line">
                  {notesText ? `"${notesText}"` : 'No additional notes or special requests were included.'}
                </p>
              </div>
            </div>
          </AccordionSection>

          {/* Optional Cancel Request option for pending bookings inside scrollable body */}
          {isBooking && booking!.status === 'pending' && onCancelBooking && (
            <div className="pt-1 flex justify-center">
              {!confirmCancel ? (
                <button
                  type="button"
                  onClick={() => setConfirmCancel(true)}
                  className="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white font-black rounded-full border border-red-500/25 transition-all text-[9px] uppercase tracking-widest cursor-pointer"
                >
                  Cancel Booking Request
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-red-500/10 px-4 py-2 rounded-full border border-red-500/30">
                  <span className="text-[9px] font-black text-red-300 uppercase tracking-widest">Cancel request?</span>
                  <button
                    type="button"
                    disabled={isCancelling}
                    onClick={handleConfirmCancelBooking}
                    className="px-3 py-1 bg-red-500 text-white font-black rounded-full text-[9px] uppercase tracking-widest cursor-pointer"
                  >
                    {isCancelling ? 'Cancelling...' : 'Yes, Cancel'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(false)}
                    className="px-3 py-1 bg-white/10 text-zinc-200 rounded-full text-[9px] font-black uppercase tracking-widest cursor-pointer"
                  >
                    Keep
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer - Compact Single-Row Centered Pill Action Buttons */}
        <div className="px-3 sm:px-5 py-2.5 bg-[#121212] border-t border-white/5 shrink-0">
          {isBooking ? (
            <div className="flex items-center justify-center gap-1.5 sm:gap-2.5 w-full max-w-md mx-auto">
              {/* Only show Offer button if the booking was actually booked as an offer */}
              {currentIsOffer && booking!.status !== 'cancelled' && booking!.paymentStatus !== 'paid' && (
                <button
                  type="button"
                  onClick={() => {
                    setShowOfferEditor((prev) => !prev);
                    setOfferFeedback(null);
                  }}
                  className={`min-w-0 flex-1 max-w-[165px] px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-full font-black text-[9px] sm:text-[10px] uppercase tracking-wider sm:tracking-widest transition-all flex items-center justify-center gap-1 sm:gap-1.5 border cursor-pointer whitespace-nowrap ${
                    showOfferEditor
                      ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                      : 'bg-[#D4AF37]/10 hover:bg-[#D4AF37]/25 text-[#D4AF37] border-[#D4AF37]/40'
                  }`}
                >
                  <DollarSign className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span className="truncate">Offer</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onMessage();
                  dismissWithSlideOut(() => {
                    onClose();
                  });
                }}
                className="min-w-0 flex-1 max-w-[190px] px-3 sm:px-4 py-2 sm:py-2.5 bg-white/5 hover:bg-[#D4AF37] text-white hover:text-black font-black rounded-full border border-[#D4AF37]/40 transition-all text-[9px] sm:text-[10px] uppercase tracking-wider sm:tracking-widest flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer whitespace-nowrap group"
              >
                <MessageSquare className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#D4AF37] group-hover:text-black shrink-0" />
                <span className="truncate">Message</span>
              </button>

              {booking!.status === 'confirmed' && booking!.paymentStatus === 'pending' && onPay && (
                <button
                  type="button"
                  disabled={isProcessingPayment}
                  onClick={() => {
                    if (onPrefetchPay) onPrefetchPay();
                    onPay();
                    dismissWithSlideOut(() => {
                      onClose();
                    });
                  }}
                  className="min-w-0 flex-1 max-w-[195px] px-3 sm:px-4 py-2 sm:py-2.5 bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black rounded-full shadow-lg shadow-[#D4AF37]/20 transition-all text-[9px] sm:text-[10px] uppercase tracking-wider sm:tracking-widest flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {isProcessingPayment ? <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin shrink-0" /> : <ShieldCheck className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />}
                  <span className="truncate">Pay ${currentAmount.toLocaleString()}</span>
                </button>
              )}
            </div>
          ) : (
            /* Plan Item Footer Actions - Single Centered Row */
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 w-full max-w-md mx-auto">
              {onRemovePlanItem && (
                <button
                  type="button"
                  onClick={() =>
                    dismissWithSlideOut(() => {
                      onClose();
                      onRemovePlanItem();
                    })
                  }
                  className="px-2.5 sm:px-3.5 py-2 sm:py-2.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white font-black rounded-full border border-red-500/25 transition-all text-[9px] sm:text-[10px] uppercase tracking-wider sm:tracking-widest flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span>Remove</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onMessage();
                  dismissWithSlideOut(() => {
                    onClose();
                  });
                }}
                className="min-w-0 flex-1 max-w-[170px] px-2.5 sm:px-4 py-2 sm:py-2.5 bg-white/5 hover:bg-white/10 text-white font-black rounded-full border border-white/15 transition-all text-[9px] sm:text-[10px] uppercase tracking-wider sm:tracking-widest flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <MessageSquare className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#D4AF37] shrink-0" />
                <span className="truncate">Message</span>
              </button>

              {onEditPlanItem && (
                <button
                  type="button"
                  onClick={() =>
                    dismissWithSlideOut(() => {
                      onClose();
                      onEditPlanItem();
                    })
                  }
                  className="min-w-0 flex-1 max-w-[165px] px-2.5 sm:px-4 py-2 sm:py-2.5 bg-[#D4AF37]/15 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black font-black rounded-full border border-[#D4AF37]/40 transition-all text-[9px] sm:text-[10px] uppercase tracking-wider sm:tracking-widest flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Edit3 className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span className="truncate">{currentIsOffer ? 'Offer' : 'Edit'}</span>
                </button>
              )}

              {onSendPlanRequests && (
                <button
                  type="button"
                  onClick={() =>
                    dismissWithSlideOut(() => {
                      onClose();
                      onSendPlanRequests();
                    })
                  }
                  className="min-w-0 flex-1 max-w-[185px] px-2.5 sm:px-4 py-2 sm:py-2.5 bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black rounded-full shadow-lg shadow-[#D4AF37]/20 transition-all text-[9px] sm:text-[10px] uppercase tracking-wider sm:tracking-widest flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Send className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                  <span className="truncate">Send</span>
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

interface ClientPortalProps {
  user: UserAccount;
  cart: CartItem[];
  bookings: Booking[];
  messages: Message[];
  vendors: Vendor[];
  onRemoveFromCart: (index: number) => void;
  onEditCartItem: (index: number) => void;
  onProcessCart: () => void;
  onPaymentSuccess: (bookingId: string, method: string) => void;
  onLogout: () => void;
  onClose: () => void;
  onUpdateProfile: (data: { name: string, photoURL: string, photoStoragePath?: string }) => void;
  onDeleteAccount: () => void;
  onMessageVendor: (vendor: Vendor, conversationId?: string, threadMessages?: Message[]) => void;
  onOpenAdminChat?: (conversationId?: string, threadMessages?: Message[]) => void;
  onActiveChatChange?: (isActive: boolean) => void;
  onTabChange?: (tab: string) => void;
  initialTab?: string;
  themeMode?: 'dark' | 'light';
  onToggleThemeMode?: (mode: 'dark' | 'light') => void;
}

const ClientPortal: React.FC<ClientPortalProps> = ({ 
  user, cart, bookings, messages, vendors, onRemoveFromCart, onEditCartItem, onProcessCart, onPaymentSuccess, onLogout, onClose, onUpdateProfile, onDeleteAccount, onMessageVendor, onOpenAdminChat, onActiveChatChange, onTabChange, initialTab, themeMode = 'dark', onToggleThemeMode
}) => {
  const normalizeClientTab = (tab?: string): 'overview' | 'plan' | 'events' | 'chats' | 'profile' => {
    if (tab === 'plan' || tab === 'events' || tab === 'chats' || tab === 'profile' || tab === 'overview') return tab;
    if (tab === 'messages') return 'chats';
    if (tab === 'bookings' || tab === 'calendar') return 'events';
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<'overview' | 'plan' | 'events' | 'chats' | 'profile'>(normalizeClientTab(initialTab));
  
  const onTabChangeRef = useRef(onTabChange);
  useEffect(() => {
    onTabChangeRef.current = onTabChange;
  }, [onTabChange]);

  useEffect(() => {
    if (initialTab) setActiveTab(normalizeClientTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    if (onTabChangeRef.current) onTabChangeRef.current(activeTab);
  }, [activeTab]);

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    if (tab === 'plan') {
      const totalAmt = cart.reduce((acc, curr) => acc + curr.amount, 0);
      trackFunnelStep.beginCheckout(cart.length, totalAmt);
    }
  };
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedThreadVendorId, setSelectedThreadVendorId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [fullscreenMedia, setFullscreenMedia] = useState<{url: string, type: 'image' | 'video'} | null>(null);
  const [chatTransitionTarget, setChatTransitionTarget] = useState<{
    vendor: Vendor;
    conId: string;
    messages?: Message[];
  } | null>(null);

  const triggerMessageWithSkeleton = (vendor: Vendor, conId: string, threadMsgs?: Message[]) => {
    setChatTransitionTarget({ vendor, conId, messages: threadMsgs });
    window.setTimeout(() => {
      setChatTransitionTarget(null);
      onMessageVendor(vendor, conId, threadMsgs);
    }, 1850);
  };

  // Automatically scroll to the bottom of the chat pane when thread changes or new message is received
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedThreadVendorId, messages]);



  const [editName, setEditName] = useState(user.name);
  const [editPhotoURL, setEditPhotoURL] = useState(user.photoURL || ''); 
  const [editPhotoStoragePath, setEditPhotoStoragePath] = useState(user.photoStoragePath || '');

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [payTransitionInfo, setPayTransitionInfo] = useState<{ vendorName?: string; amount: number } | null>(null);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutBookingInfo, setCheckoutBookingInfo] = useState<{ id: string; vendorId: string; amount: number; vendorName?: string } | null>(null);
  const prefetchedCheckoutRef = useRef<{
    key: string;
    promise: Promise<{ clientSecret?: string; url?: string }>;
  } | null>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user.id) return;

    setIsUploadingPhoto(true);
    try {
      const storagePath = `user_uploads/${user.id}/profile_photo_${Date.now()}`;
      const downloadURL = await uploadFileRobustly(file, storagePath);
      
      // Update local state and call parent update
      setEditPhotoURL(downloadURL);
      setEditPhotoStoragePath(storagePath);
      onUpdateProfile({ name: editName, photoURL: downloadURL, photoStoragePath: storagePath });
    } catch (error: any) {
      console.error("Profile photo upload error:", error);
      alert("Failed to upload profile photo: " + error.message);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleProfilePhotoDelete = async () => {
    if (!user.id || !editPhotoURL) return;
    if (!window.confirm("Are you sure you want to remove your profile photo?")) return;

    try {
      // Try to delete from storage if it's a storage URL
      if (editPhotoURL.includes('firebasestorage.googleapis.com')) {
        const decodedUrl = decodeURIComponent(editPhotoURL);
        const pathStart = decodedUrl.indexOf('/o/') + 3;
        const pathEnd = decodedUrl.indexOf('?alt=media');
        if (pathStart > 2 && pathEnd > pathStart) {
          const fullPath = decodedUrl.substring(pathStart, pathEnd);
          const storageRef = ref(storage, fullPath);
          await deleteObject(storageRef);
        }
      }
      
      setEditPhotoURL('');
      setEditPhotoStoragePath('');
      onUpdateProfile({ name: editName, photoURL: '', photoStoragePath: '' });
    } catch (error) {
      console.error("Profile photo delete error:", error);
      // Still update UI/Auth if storage delete fails
      setEditPhotoURL('');
      setEditPhotoStoragePath('');
      onUpdateProfile({ name: editName, photoURL: '', photoStoragePath: '' });
    }
  };

  const createCheckoutSessionRequest = async (bookingId: string, vendorId: string, amount: number) => {
    const vendor = vendors.find(v => v.id === vendorId);
    const queryParams = new URLSearchParams({
      vendorId,
      amount: String(amount),
      bookingId,
    });
    if (vendor?.stripeAccountId) {
      queryParams.set('stripeAccountId', vendor.stripeAccountId);
    }
    if (typeof vendor?.commissionRate === 'number') {
      queryParams.set('commissionRate', String(vendor.commissionRate));
    }

    const response = await fetch(`/api/stripe/create-checkout-session?${queryParams.toString()}`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to create checkout session');
    }
    const data = await response.json();
    return {
      clientSecret: data.clientSecret || data.client_secret,
      url: data.url,
    };
  };

  // Start fetching the Stripe checkout session at 0ms while the Event Scope Modal is sliding down
  const prefetchPay = (bookingId: string, vendorId: string, amount: number) => {
    const key = `${bookingId}_${vendorId}_${amount}`;
    if (prefetchedCheckoutRef.current?.key === key) return;
    trackFunnelStep.initiatePayment(bookingId, vendorId, amount, 'Stripe');
    const promise = createCheckoutSessionRequest(bookingId, vendorId, amount);
    // Prevent unhandled rejection if it errors before handlePay awaits it
    promise.catch(() => {});
    prefetchedCheckoutRef.current = { key, promise };
  };

  const handlePay = async (bookingId: string, vendorId: string, amount: number) => {
    const vendor = vendors.find(v => v.id === vendorId);
    setCheckoutError(null);
    setCheckoutClientSecret(null);
    setIsProcessingPayment(true);
    // Show full-screen loading indicator immediately at 0ms while the event modal drops down
    setPayTransitionInfo({ vendorName: vendor?.name, amount });

    const transitionDelay = new Promise<void>(resolve => window.setTimeout(resolve, 1850));

    try {
      const key = `${bookingId}_${vendorId}_${amount}`;
      let sessionPromise: Promise<{ clientSecret?: string; url?: string }>;
      if (prefetchedCheckoutRef.current?.key === key) {
        sessionPromise = prefetchedCheckoutRef.current.promise;
        prefetchedCheckoutRef.current = null;
      } else {
        trackFunnelStep.initiatePayment(bookingId, vendorId, amount, 'Stripe');
        sessionPromise = createCheckoutSessionRequest(bookingId, vendorId, amount);
      }

      // Wait for the 0.5s full-screen loader before popping up the payment modal
      await transitionDelay;
      setPayTransitionInfo(null);
      setCheckoutBookingInfo({
        id: bookingId,
        vendorId,
        amount,
        vendorName: vendor?.name,
      });

      const data = await sessionPromise;
      if (data.clientSecret) {
        setCheckoutClientSecret(data.clientSecret);
      } else if (data.url) {
        setCheckoutBookingInfo(null);
        try {
          window.top!.location.href = data.url;
        } catch (e) {
          console.warn('window.top navigation blocked, falling back to window.open', e);
          window.open(data.url, '_blank');
        }
      } else {
        throw new Error('No client secret returned from payment server.');
      }
    } catch (error: any) {
      console.error('Payment Error:', error);
      await transitionDelay;
      setPayTransitionInfo(null);
      setCheckoutBookingInfo({
        id: bookingId,
        vendorId,
        amount,
        vendorName: vendor?.name,
      });
      setCheckoutError(error.message || 'Failed to start payment. Please try again.');
    } finally {
      setIsProcessingPayment(false);
    }
  };


  const getCountdown = (dateString: string) => {
    const eventDate = new Date(dateString);
    const today = new Date();
    
    // Normalize dates to midnight for accurate day calculation
    const eventDateMidnight = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const diffTime = eventDateMidnight.getTime() - todayMidnight.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return null; // Past event
    if (diffDays === 0) return { text: 'Today is the day! Mazel Tov!', isToday: true };
    return { text: `${diffDays} Day${diffDays === 1 ? '' : 's'} to go!`, isToday: false };
  };

  const [selectedEventCategory, setSelectedEventCategory] = useState<string>('All');
  const [locallyReadMsgIds, setLocallyReadMsgIds] = useState<Set<string>>(new Set());

  const clientBookings = useMemo(() => {
    const sorted = bookings
      .filter(
        b =>
          (user.id && (b.userId === user.id || b.clientId === user.id)) ||
          (b.contactEmail && user.username && b.contactEmail.toLowerCase() === user.username.toLowerCase()) ||
          (b.clientName && user.name && b.clientName.toLowerCase() === user.name.toLowerCase())
      )
      .map((booking, idx) => ({ booking, idx }))
      .sort((a, b) => {
        const timeA = a.booking.createdAt ? new Date(a.booking.createdAt).getTime() : 0;
        const timeB = b.booking.createdAt ? new Date(b.booking.createdAt).getTime() : 0;
        if (timeA !== timeB) {
          return timeB - timeA; // Latest booked event always on top
        }
        return b.idx - a.idx;
      })
      .map(item => item.booking);

    // Strictly deduplicate so the same vendor + date never appears multiple times
    const seen = new Set<string>();
    const deduped: Booking[] = [];
    for (const b of sorted) {
      const key = `${b.vendorId}_${b.date}`;
      if (!seen.has(b.id) && !seen.has(key)) {
        seen.add(b.id);
        seen.add(key);
        deduped.push(b);
      }
    }
    return deduped;
  }, [bookings, user.id, user.username, user.name]);

  const eventCategories = useMemo(() => {
    const bookedCats = new Set<string>();
    clientBookings.forEach(b => {
      const v = vendors.find(vendor => vendor.id === b.vendorId);
      if (v?.category) bookedCats.add(v.category);
    });
    const allVendorCats = new Set<string>();
    vendors.forEach(v => {
      if (v.category) allVendorCats.add(v.category);
    });
    const defaultCats = ['Music', 'Photography', 'Videography', 'Catering', 'Venue', 'Decor', 'Entertainment'];
    const ordered = [
      'All',
      ...Array.from(bookedCats),
      ...defaultCats.filter(c => !bookedCats.has(c)),
      ...Array.from(allVendorCats).filter(c => !bookedCats.has(c) && !defaultCats.includes(c))
    ];
    return Array.from(new Set(ordered));
  }, [clientBookings, vendors]);

  const filteredClientBookings = useMemo(() => {
    if (selectedEventCategory === 'All') return clientBookings;
    return clientBookings.filter(b => {
      const v = vendors.find(vendor => vendor.id === b.vendorId);
      return v?.category?.toLowerCase() === selectedEventCategory.toLowerCase();
    });
  }, [clientBookings, vendors, selectedEventCategory]);
  
  // Direct real-time listener on conversations + messages subcollections for this client
  const [liveClientMessages, setLiveClientMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!user?.id) {
      setLiveClientMessages([]);
      return;
    }
    const myEmailLower = (user.username || '').trim().toLowerCase();
    const subUnsubs = new Map<string, () => void>();
    const convMessagesMap = new Map<string, Message[]>();

    const rebuildLiveMessages = () => {
      const merged: Message[] = [];
      const seen = new Set<string>();
      convMessagesMap.forEach((list) => {
        list.forEach((m) => {
          if (m.id && !seen.has(m.id)) {
            seen.add(m.id);
            merged.push(m);
          }
        });
      });
      setLiveClientMessages(merged);
    };

    const attachConversationListener = (convDoc: any) => {
      const cid = convDoc.id;
      const convData = convDoc.data() || {};
      if (subUnsubs.has(cid)) return;

      const msgsRef = collection(db, 'conversations', cid, 'messages');
      const unsubMsgs = onSnapshot(
        msgsRef,
        (msgSnap) => {
          const list: Message[] = msgSnap.docs.map((mDoc) => {
            const d = mDoc.data() || {};
            let ts = new Date().toISOString();
            if (d.timestamp) {
              ts = typeof d.timestamp === 'string' ? d.timestamp : (typeof d.timestamp?.toDate === 'function' ? d.timestamp.toDate().toISOString() : ts);
            } else if (d.sent_at) {
              ts = typeof d.sent_at?.toDate === 'function' ? d.sent_at.toDate().toISOString() : new Date(d.sent_at).toISOString();
            }
            const senderId = d.senderId || d.sender_id || '';
            const receiverId = d.receiverId || d.receiver_id || (senderId === user.id ? (convData.vendor_id || 'admin') : user.id);
            return {
              id: mDoc.id,
              ...d,
              conversationId: cid,
              senderId,
              receiverId,
              vendorId: d.vendorId || d.vendor_id || convData.vendor_id || undefined,
              vendorName: d.vendorName || d.vendor_name || convData.vendor_name || undefined,
              clientEmail: d.clientEmail || d.client_email || convData.client_email || user.username,
              participants: Array.isArray(d.participants) ? d.participants : (Array.isArray(convData.participant_ids) ? convData.participant_ids : [senderId, receiverId]),
              isAdminInquiry: Boolean(d.isAdminInquiry || convData.type === 'admin_support' || senderId === 'admin' || receiverId === 'admin'),
              timestamp: ts,
            } as unknown as Message;
          });
          convMessagesMap.set(cid, list);
          rebuildLiveMessages();
        },
        () => {}
      );
      subUnsubs.set(cid, unsubMsgs);
    };

    const qByParticipant = query(collection(db, 'conversations'), where('participant_ids', 'array-contains', user.id));
    const unsub1 = onSnapshot(qByParticipant, (snap) => {
      snap.docs.forEach(attachConversationListener);
    }, () => {});

    const qByClientId = query(collection(db, 'conversations'), where('client_id', '==', user.id));
    const unsub2 = onSnapshot(qByClientId, (snap) => {
      snap.docs.forEach(attachConversationListener);
    }, () => {});

    let unsub3 = () => {};
    if (myEmailLower) {
      const qByClientEmail = query(collection(db, 'conversations'), where('client_email', '==', myEmailLower));
      unsub3 = onSnapshot(qByClientEmail, (snap) => {
        snap.docs.forEach(attachConversationListener);
      }, () => {});
    }

    return () => {
      unsub1();
      unsub2();
      unsub3();
      subUnsubs.forEach((u) => u());
      subUnsubs.clear();
    };
  }, [user?.id, user?.username]);

  // Group messages by vendor/contact for the chat hub (includes both Admin Support and Vendor conversations for this client)
  const chatThreads = useMemo(() => {
    const groups: Record<string, { vendor: Vendor; messages: Message[]; lastMessage: Message }> = {};
    const seenMessageIds = new Set<string>();
    const myEmailLower = (user.username || '').trim().toLowerCase();
    const isNonVendorAccount = ['bookingsimcha@gmail.com', 'adminbookingsimcha@gmail.com', 'ststrohli@gmail.com'].includes(myEmailLower);

    const myOwnVendorIds = new Set(
      isNonVendorAccount
        ? []
        : vendors
            .filter(
              (v) =>
                v.id === user.id ||
                (myEmailLower &&
                  (v.contactEmail?.toLowerCase() === myEmailLower ||
                    v.username?.toLowerCase() === myEmailLower))
            )
            .map((v) => v.id)
    );

    const combinedMessages = [...messages, ...liveClientMessages];

    combinedMessages.forEach((m) => {
      if (!m) return;
      if (m.id && seenMessageIds.has(m.id)) return;
      if (m.id) seenMessageIds.add(m.id);

      let vendor: Vendor | undefined;

      // 1. Admin Support messages for this client
      if (
        m.isAdminInquiry ||
        m.senderId === 'admin' ||
        m.receiverId === 'admin' ||
        (m.participants && m.participants.includes('admin')) ||
        (m.conversationId && m.conversationId.split('_').includes('admin'))
      ) {
        const isMyAdminChat =
          m.senderId === user.id ||
          m.receiverId === user.id ||
          (m as any).client_id === user.id ||
          (myEmailLower && m.clientEmail?.toLowerCase() === myEmailLower) ||
          (myEmailLower && (m as any).client_email?.toLowerCase() === myEmailLower) ||
          (m.participants && m.participants.includes(user.id)) ||
          (m.conversationId && m.conversationId.split('_').includes(user.id));

        if (!isMyAdminChat) return;

        vendor = {
          id: 'admin',
          name: 'Simcha Concierge',
          category: 'Support & Concierge' as any,
          price: 0,
          rating: 5,
          image: '',
          description: 'Official Simcha Booking Concierge & Admin Support',
          EventTypes: []
        } as unknown as Vendor;
      } else {
        // 2. Vendor conversations for this client (including messages sent by the vendor to this client)
        const role = (m as any).sender_role;
        const explicitVendorId = (m as any).vendorId || (m as any).vendor_id;
        const candidateOtherId = m.senderId === user.id ? m.receiverId : m.senderId;
        const msgVendorId =
          explicitVendorId ||
          (role === 'vendor' ? m.senderId : role === 'client' ? m.receiverId : candidateOtherId);

        // If this user owns a vendor profile, exclude messages where another client is messaging this user's own vendor
        if (myOwnVendorIds.size > 0) {
          if (msgVendorId && myOwnVendorIds.has(msgVendorId)) return;
          if (myOwnVendorIds.has(m.receiverId) && m.senderId !== user.id) return;
          if (myOwnVendorIds.has(m.senderId) && role === 'vendor') return;
        }

        // Verify this message involves this client
        const isMyVendorMessage =
          m.senderId === user.id ||
          m.receiverId === user.id ||
          (m as any).client_id === user.id ||
          (myEmailLower && m.clientEmail?.toLowerCase() === myEmailLower) ||
          (myEmailLower && (m as any).client_email?.toLowerCase() === myEmailLower) ||
          (m.participants && m.participants.includes(user.id)) ||
          (myEmailLower && m.participants && m.participants.some((p: string) => p.toLowerCase() === myEmailLower)) ||
          (m.conversationId && m.conversationId.split('_').includes(user.id));

        if (!isMyVendorMessage) return;

        vendor =
          (explicitVendorId ? vendors.find((v) => v.id === explicitVendorId && !myOwnVendorIds.has(v.id)) : undefined) ||
          vendors.find((v) => v.id === candidateOtherId && !myOwnVendorIds.has(v.id)) ||
          vendors.find((v) => v.id === msgVendorId && !myOwnVendorIds.has(v.id)) ||
          vendors.find(
            (v) =>
              !myOwnVendorIds.has(v.id) &&
              (v.id === m.senderId ||
                v.id === m.receiverId ||
                (m.participants && m.participants.includes(v.id)) ||
                (m.conversationId && m.conversationId.split('_').includes(v.id)) ||
                (m.vendorEmail && v.contactEmail && v.contactEmail.toLowerCase() === m.vendorEmail.toLowerCase()))
          );

        if (!vendor && msgVendorId && msgVendorId !== user.id && !myOwnVendorIds.has(msgVendorId)) {
          vendor = {
            id: msgVendorId,
            name: (m as any).vendorName || (m as any).vendor_name || (role === 'vendor' ? m.senderName : '') || 'Vendor',
            category: 'Vendor' as any,
            price: 0,
            rating: 5,
            image: '',
            description: '',
            EventTypes: []
          } as unknown as Vendor;
        }
      }

      if (vendor) {
        const actualVendorId = vendor.id || 'admin';
        if (!groups[actualVendorId]) {
          groups[actualVendorId] = { vendor, messages: [], lastMessage: m };
        }
        groups[actualVendorId].messages.push(m);
      }
    });

    Object.values(groups).forEach((g) => {
      g.messages.sort((a, b) => {
        const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tA - tB;
      });
      if (g.messages.length > 0) {
        g.lastMessage = g.messages[g.messages.length - 1];
      }
    });

    return Object.entries(groups).sort((a, b) => {
      const timeA = a[1].lastMessage?.timestamp ? new Date(a[1].lastMessage.timestamp).getTime() : 0;
      const timeB = b[1].lastMessage?.timestamp ? new Date(b[1].lastMessage.timestamp).getTime() : 0;
      return timeB - timeA;
    });
  }, [messages, liveClientMessages, vendors, user.id, user.username]);

  const [selectedScopeTarget, setSelectedScopeTarget] = useState<
    { mode: 'booking'; bookingId: string } | { mode: 'plan'; index: number } | null
  >(null);
  const [openScopeSections, setOpenScopeSections] = useState<{
    logistics: boolean;
    services: boolean;
    vendorInfo: boolean;
    notes: boolean;
  }>({
    logistics: true,
    services: true,
    vendorInfo: false,
    notes: true,
  });

  const toggleScopeSection = (section: 'logistics' | 'services' | 'vendorInfo' | 'notes') => {
    setOpenScopeSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleUpdateBookingOffer = async (booking: Booking, offerPrice: number, noteAddition?: string) => {
    const bookingRef = doc(db, 'bookings', booking.id);
    const updatedNotes = noteAddition
      ? `${booking.notes ? booking.notes + '\n' : ''}[Client Offer $${offerPrice.toLocaleString()}]: ${noteAddition}`
      : booking.notes || '';
    await updateDoc(bookingRef, {
      amount: offerPrice,
      offeredPrice: offerPrice,
      isOffer: true,
      notes: updatedNotes,
    });
  };

  const handleCancelClientBooking = async (bookingId: string) => {
    const bookingRef = doc(db, 'bookings', bookingId);
    await updateDoc(bookingRef, {
      status: 'cancelled',
    });
  };

  const onActiveChatChangeRef = useRef(onActiveChatChange);
  useEffect(() => {
    onActiveChatChangeRef.current = onActiveChatChange;
  }, [onActiveChatChange]);

  useEffect(() => {
    if (onActiveChatChangeRef.current) {
      onActiveChatChangeRef.current(
        !!checkoutBookingInfo ||
        !!checkoutClientSecret ||
        !!selectedScopeTarget ||
        !!payTransitionInfo ||
        !!chatTransitionTarget
      );
    }
  }, [checkoutBookingInfo, checkoutClientSecret, selectedScopeTarget, payTransitionInfo, chatTransitionTarget]);

  useEffect(() => {
    return () => {
      onActiveChatChangeRef.current?.(false);
    };
  }, []);

  const getVendorInitials = (name?: string): string => {
    if (!name || !name.trim()) return 'V';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const subtotal = cart.reduce((sum, item) => sum + item.amount, 0);

  const NavItem = ({ id, icon: Icon, label, badge }: { id: typeof activeTab, icon: any, label: string, badge?: number }) => (
    <button 
      onClick={() => { handleTabChange(id); setIsSidebarOpen(false); }} 
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-full transition-all ${activeTab === id ? 'bg-[#D4AF37] text-black font-bold shadow-lg' : 'text-zinc-400 hover:text-[#D4AF37] hover:bg-white/5'}`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-xs font-black uppercase tracking-widest">{label}</span>
      <AnimatePresence mode="popLayout">
        {!!badge && (
          <motion.span
            key={`badge-${id}-${badge}`}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 25 }}
            className="ml-auto bg-[#D4AF37] text-black text-[9px] font-black px-2 py-0.5 rounded-full"
          >
            {badge}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );

  return (
    <div className="min-h-[calc(100dvh-62px)] sm:min-h-[calc(100dvh-68px)] flex-1 bg-[#050505] text-zinc-100 flex flex-col md:flex-row relative">
      {/* Desktop Sidebar (BottomNav handles mobile navigation) */}
      <aside className="hidden md:flex md:w-72 bg-[#0a0a0a] border-r border-[#D4AF37]/10 flex-col md:h-[calc(100dvh-68px)] md:sticky md:top-[68px] shadow-2xl">
        <div className="p-6 md:p-8 md:pt-10 flex items-center justify-between border-b border-white/5">
          <div>
            <h2 className="text-xl md:text-2xl font-bold font-[Cinzel] text-[#D4AF37] uppercase tracking-tighter">Planner</h2>
            <p className="text-[9px] md:text-[10px] text-zinc-400 font-bold uppercase tracking-[0.3em] mt-1">Client Station</p>
          </div>
        </div>
        
        <div className="p-6 flex items-center gap-4 bg-black/40 border-b border-white/5">
          <div className="w-10 h-10 rounded-full bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] font-bold overflow-hidden border border-[#D4AF37]/20">
            {user.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" /> : user.name[0]}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{user.name}</p>
            <p className="text-[9px] text-zinc-400 uppercase tracking-widest leading-none">Simcha Organizer</p>
          </div>
        </div>

        <nav aria-label="Client Portal Navigation" className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <NavItem id="overview" icon={LayoutDashboard} label="Dashboard" />
          <NavItem id="plan" icon={ShoppingBag} label="My Plan" badge={cart.length > 0 ? cart.length : undefined} />
          <NavItem id="events" icon={Calendar} label="My Events" badge={clientBookings.filter(b => b.status === 'pending').length || undefined} />
          <NavItem id="chats" icon={MessageSquare} label="Chats" badge={messages.filter(m => m.receiverId === user.id && !m.isRead).length || undefined} />
          <NavItem id="profile" icon={CheckCircle} label="Profile" />
        </nav>

        <div className="p-6 border-t border-white/5 bg-black">
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 text-zinc-400 hover:text-white rounded-full hover:bg-white/5 transition-colors text-xs font-black uppercase tracking-widest">
            <LogOut className="w-5 h-5" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 bg-[#050505] px-4 pt-9 pb-36 md:px-8 md:pt-10 md:pb-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-bold font-[Cinzel] text-white capitalize tracking-tight">{activeTab}</h1>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#111] p-5 rounded-3xl border border-white/5 shadow-2xl space-y-3">
                <div className="bg-[#D4AF37]/10 p-2.5 w-fit rounded-2xl"><ShoppingBag className="w-5 h-5 text-[#D4AF37]" /></div>
                <div><p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Items in Plan</p><h3 className="text-2xl font-bold text-white">{cart.length}</h3></div>
              </div>
              <div className="bg-[#111] p-5 rounded-3xl border border-white/5 shadow-2xl space-y-3">
                <div className="bg-[#D4AF37]/10 p-2.5 w-fit rounded-2xl"><CheckCircle className="w-5 h-5 text-[#D4AF37]" /></div>
                <div><p className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">Confirmed</p><h3 className="text-2xl font-bold text-white">{clientBookings.filter(b => b.status === 'confirmed').length}</h3></div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'plan' && (
          <div className="max-w-4xl mx-auto w-full space-y-2.5 animate-in slide-in-from-bottom-5 duration-500">
            {cart.length === 0 ? (
              <div className="text-center py-14 bg-[#0a0a0a] rounded-full border border-dashed border-white/10 px-6">
                <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-[#D4AF37]" />
                <p className="text-sm font-[Cinzel] text-zinc-300">Your plan is empty.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {cart.map((item, index) => {
                  const vendorPhoto = item.vendor.image;
                  const initials = getVendorInitials(item.vendor.name);
                  const openPlanModal = () => {
                    setOpenScopeSections({ logistics: true, services: true, vendorInfo: false, notes: true });
                    setSelectedScopeTarget({ mode: 'plan', index });
                  };

                  return (
                    <div
                      key={`${item.vendor.id}-${index}`}
                      role="button"
                      tabIndex={0}
                      onClick={openPlanModal}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openPlanModal();
                        }
                      }}
                      className="simcha-event-card relative w-full overflow-hidden rounded-full border border-[#D4AF37]/35 hover:border-[#D4AF37]/80 transition-all duration-300 cursor-pointer group flex items-center justify-between gap-3 px-5 sm:px-7 py-3 sm:py-3.5 min-h-[64px] sm:min-h-[70px] shadow-xl active:scale-[0.99]"
                    >
                      {/* Full Background: Vendor Photo OR Initials Pattern */}
                      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                        {vendorPhoto ? (
                          <>
                            <img
                              src={vendorPhoto}
                              alt={item.vendor.name}
                              className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                            />
                            <div className="absolute inset-0 simcha-event-card-overlay" />
                          </>
                        ) : (
                          <div className="w-full h-full bg-gradient-to-r from-[#0c0c0c] via-[#151208] to-[#0c0c0c] flex items-center justify-center relative">
                            <span className="font-[Cinzel] font-black text-5xl sm:text-6xl tracking-[0.25em] text-[#D4AF37]/15 select-none">
                              {initials}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Left Side: Compact Vendor Name + Category & Event Name */}
                      <div className="relative z-10 flex items-center gap-3 min-w-0 flex-1">
                        {!vendorPhoto && (
                          <div className="w-9 h-9 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 flex items-center justify-center shrink-0 text-[#D4AF37] font-[Cinzel] font-bold text-xs shadow-inner">
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <h4 className="font-bold text-sm sm:text-base text-white font-[Cinzel] group-hover:text-[#D4AF37] transition-colors truncate drop-shadow-sm">
                              {item.vendor.name}
                            </h4>
                            <span className="simcha-event-pill px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest text-[#D4AF37] border border-[#D4AF37]/40 shrink-0">
                              {item.vendor.category}
                            </span>
                            {(item.isOffer || item.offeredPrice) && (
                              <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-[#D4AF37] text-black shrink-0">
                                Offer
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-zinc-200/90 truncate mt-0.5 drop-shadow-sm">
                            <Calendar className="w-3 h-3 text-[#D4AF37] shrink-0" />
                            <span className="font-semibold text-white shrink-0">{item.date}</span>
                            {item.eventName && (
                              <>
                                <span className="text-[#D4AF37]">•</span>
                                <span className="truncate text-zinc-200">{item.eventName}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Price Pill + Chevron */}
                      <div className="relative z-10 flex items-center gap-2 shrink-0">
                        <span className="simcha-event-pill px-3 py-1 rounded-full text-xs sm:text-sm font-bold text-[#D4AF37] font-[Cinzel] border border-[#D4AF37]/40 shadow-sm">
                          ${item.amount.toLocaleString()}
                        </span>
                        <div className="w-7 h-7 rounded-full simcha-event-pill border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="pt-3 mt-3 bg-[#0a0a0a] px-5 py-3.5 sm:px-7 sm:py-4 rounded-full border border-[#D4AF37]/30 flex flex-row items-center justify-between gap-3 shadow-xl">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-zinc-400 font-black uppercase tracking-[0.2em] text-[9px] sm:text-[10px]">Subtotal</span>
                    <span className="text-lg sm:text-xl font-bold text-[#D4AF37] font-[Cinzel] truncate">${subtotal.toLocaleString()}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onProcessCart}
                    className="px-5 sm:px-7 bg-[#D4AF37] text-black py-2.5 sm:py-3 rounded-full font-black text-[10px] sm:text-[11px] uppercase tracking-[0.2em] hover:bg-[#E5C76B] transition-all shadow-xl shadow-[#D4AF37]/20 cursor-pointer shrink-0"
                  >
                    Send All Requests
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-2.5 animate-in slide-in-from-bottom-5 duration-500 max-w-4xl mx-auto w-full">
            {/* Compact Horizontally Slidable Centered Pill Category Filter */}
            <div className="w-[calc(100%+2rem)] -mx-4 md:w-[calc(100%+5rem)] md:-mx-10 overflow-x-auto no-scrollbar py-1.5 touch-pan-x select-none">
              <div
                className="flex items-center gap-2 px-4 md:px-10 w-max mx-auto"
                role="tablist"
                aria-label="Filter booked events by category"
              >
                {eventCategories.map((cat) => {
                  const isActive = selectedEventCategory.toLowerCase() === cat.toLowerCase();
                  return (
                    <button
                      key={cat}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setSelectedEventCategory(cat)}
                      className={`shrink-0 px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border ${
                        isActive
                          ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,0.35)]'
                          : 'bg-black/70 text-zinc-300 border-[#D4AF37]/25 hover:border-[#D4AF37]/60 hover:text-white'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredClientBookings.length === 0 ? (
              <div className="py-14 text-center bg-[#0a0a0a] rounded-full border border-dashed border-white/10 px-6">
                <Calendar className="w-10 h-10 mx-auto mb-2 text-[#D4AF37]" />
                <p className="text-sm font-[Cinzel] text-zinc-300">
                  {selectedEventCategory === 'All' ? 'No active reservations.' : `No ${selectedEventCategory} events found.`}
                </p>
              </div>
            ) : filteredClientBookings.map((booking, index) => {
              const vendor = vendors.find(v => v.id === booking.vendorId);
              if (!vendor) return null;
              const isLatestBooking = index === 0 && selectedEventCategory === 'All';
              const vendorPhoto = vendor.image;
              const initials = getVendorInitials(vendor.name);

              const openBookingModal = () => {
                setOpenScopeSections({ logistics: true, services: true, vendorInfo: false, notes: true });
                setSelectedScopeTarget({ mode: 'booking', bookingId: booking.id });
              };

              return (
                <div
                  key={booking.id}
                  role="button"
                  tabIndex={0}
                  onClick={openBookingModal}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openBookingModal();
                    }
                  }}
                  className={`simcha-event-card relative w-full overflow-hidden rounded-full border transition-all duration-300 cursor-pointer group flex items-center justify-between gap-3 px-5 sm:px-7 py-3 sm:py-3.5 min-h-[64px] sm:min-h-[70px] shadow-xl active:scale-[0.99] ${
                    isLatestBooking
                      ? 'border-[#D4AF37] shadow-[0_0_24px_rgba(212,175,55,0.16)]'
                      : 'border-[#D4AF37]/35 hover:border-[#D4AF37]/80'
                  }`}
                >
                  {/* Full Background: Vendor Photo OR Initials Pattern */}
                  <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                    {vendorPhoto ? (
                      <>
                        <img
                          src={vendorPhoto}
                          alt={vendor.name}
                          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                        />
                        <div className="absolute inset-0 simcha-event-card-overlay" />
                      </>
                    ) : (
                      <div className="w-full h-full bg-gradient-to-r from-[#0c0c0c] via-[#151208] to-[#0c0c0c] flex items-center justify-center relative">
                        <span className="font-[Cinzel] font-black text-5xl sm:text-6xl tracking-[0.25em] text-[#D4AF37]/15 select-none">
                          {initials}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Left Side: Compact Vendor Name + Essential Pill Badges */}
                  <div className="relative z-10 flex items-center gap-3 min-w-0 flex-1">
                    {!vendorPhoto && (
                      <div className="w-9 h-9 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 flex items-center justify-center shrink-0 text-[#D4AF37] font-[Cinzel] font-bold text-xs shadow-inner">
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="font-bold text-sm sm:text-base text-white font-[Cinzel] group-hover:text-[#D4AF37] transition-colors truncate drop-shadow-sm">
                          {vendor.name}
                        </h3>
                        {isLatestBooking && (
                          <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-[#D4AF37] text-black shrink-0">
                            Latest
                          </span>
                        )}
                        <span className="simcha-event-pill px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest text-[#D4AF37] border border-[#D4AF37]/40 shrink-0 hidden xs:inline-block">
                          {vendor.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-200/90 truncate mt-0.5 drop-shadow-sm">
                        <Calendar className="w-3 h-3 text-[#D4AF37] shrink-0" />
                        <span className="font-semibold text-white shrink-0">{booking.date}</span>
                        {booking.eventName && (
                          <>
                            <span className="text-[#D4AF37]">•</span>
                            <span className="truncate text-zinc-200">{booking.eventName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Status + Price Pill + Chevron */}
                  <div className="relative z-10 flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${
                        booking.paymentStatus === 'paid'
                          ? 'bg-green-500/25 text-green-300 border-green-500/45'
                          : booking.status === 'confirmed'
                          ? 'bg-green-500/25 text-green-300 border-green-500/45'
                          : booking.status === 'cancelled'
                          ? 'bg-red-500/25 text-red-300 border-red-500/45'
                          : 'simcha-event-pill text-[#D4AF37] border-[#D4AF37]/40'
                      }`}
                    >
                      {booking.paymentStatus === 'paid' ? 'Paid' : booking.status}
                    </span>
                    <span className="simcha-event-pill px-2.5 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-bold text-[#D4AF37] font-[Cinzel] border border-[#D4AF37]/40 shadow-sm">
                      ${booking.amount.toLocaleString()}
                    </span>
                    <div className="w-7 h-7 rounded-full simcha-event-pill border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'chats' && (
          <div className="space-y-3 animate-in fade-in duration-500">
            {chatThreads.length === 0 ? (
              <div className="bg-[#0a0a0a] rounded-full border border-dashed border-white/10 py-12 px-6 text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-400">No Active Chats</p>
              </div>
            ) : (
              chatThreads.map(([vendorId, data], idx) => {
                const unreadInThread = data.messages.filter(m => m.receiverId === user.id && !m.isRead && !locallyReadMsgIds.has(m.id)).length;
                const vendorPhoto = data.vendor.image;
                const initials = getVendorInitials(data.vendor.name);
                const lastMsg = data.lastMessage;
                const isLastSentByMe =
                  vendorId === 'admin'
                    ? (lastMsg.senderId !== 'admin' && (lastMsg as any).sender_role !== 'admin')
                    : (lastMsg.senderId !== vendorId && (lastMsg as any).sender_role !== 'vendor');
                const lastReadByMap = (lastMsg as any).read_by || {};
                const isLastReadByOther = Boolean(
                  lastMsg.isRead ||
                  Object.keys(lastReadByMap).some(k => k !== lastMsg.senderId && k !== user.id)
                );
                const isVoice = lastMsg.type === 'voice' || !!lastMsg.audioUrl;
                const isImg = lastMsg.type === 'image' || !!lastMsg.imageUrl;
                const isVid = lastMsg.type === 'file' && lastMsg.fileType?.startsWith('video/');
                const isDoc = lastMsg.type === 'file' && !lastMsg.fileType?.startsWith('video/');

                const handleOpenThread = () => {
                  const conId = lastMsg.conversationId || [user.id, vendorId].sort().filter(Boolean).join('_');
                  const msgIds = data.messages.map(m => m.id).filter(Boolean);
                  if (msgIds.length > 0) {
                    setLocallyReadMsgIds(prev => {
                      const next = new Set(prev);
                      msgIds.forEach(id => next.add(id));
                      return next;
                    });
                  }
                  if (user.id) {
                    const uniqueConIds = new Set<string>();
                    if (conId) uniqueConIds.add(conId);
                    data.messages.forEach(m => {
                      if (m.conversationId) uniqueConIds.add(m.conversationId);
                    });
                    uniqueConIds.forEach(cid => {
                      markChatAsRead(cid, user.id, [user.username].filter(Boolean)).catch(() => {});
                    });
                  }
                  if (vendorId === 'admin' && onOpenAdminChat) {
                    onOpenAdminChat(conId, data.messages);
                  } else {
                    onMessageVendor(data.vendor, conId, data.messages);
                  }
                };

                return (
                  <div
                    key={vendorId}
                    role="button"
                    tabIndex={0}
                    onClick={handleOpenThread}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenThread();
                      }
                    }}
                    className={`simcha-event-card relative w-full overflow-hidden rounded-full border transition-all duration-300 cursor-pointer group flex items-center justify-between gap-3 px-5 sm:px-7 py-3.5 sm:py-4 min-h-[68px] sm:min-h-[74px] shadow-xl active:scale-[0.99] ${
                      unreadInThread > 0 || idx === 0
                        ? 'border-[#D4AF37] shadow-[0_0_24px_rgba(212,175,55,0.18)]'
                        : 'border-[#D4AF37]/35 hover:border-[#D4AF37]/80'
                    }`}
                  >
                    {/* Full Background: Vendor Photo OR Initials Pattern */}
                    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                      {vendorPhoto ? (
                        <>
                          <img
                            src={vendorPhoto}
                            alt={data.vendor.name}
                            className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                          />
                          <div className="absolute inset-0 simcha-event-card-overlay" />
                        </>
                      ) : (
                        <div className="w-full h-full bg-gradient-to-r from-[#0c0c0c] via-[#151208] to-[#0c0c0c] flex items-center justify-center relative">
                          <span className="font-[Cinzel] font-black text-5xl sm:text-6xl tracking-[0.25em] text-[#D4AF37]/15 select-none">
                            {initials}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Left Side: Initials Badge (when no photo) + Vendor Name + Latest Message */}
                    <div className="relative z-10 flex items-center gap-3 min-w-0 flex-1">
                      {!vendorPhoto && (
                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 flex items-center justify-center shrink-0 text-[#D4AF37] font-[Cinzel] font-bold text-xs sm:text-sm shadow-inner">
                          {initials}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm sm:text-base text-white font-[Cinzel] group-hover:text-[#D4AF37] transition-colors truncate drop-shadow-sm">
                            {data.vendor.name}
                          </span>
                          <AnimatePresence mode="popLayout">
                            {unreadInThread > 0 && (
                              <motion.span
                                key={`unread-client-${vendorId}-${unreadInThread}`}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ type: "spring", stiffness: 500, damping: 25 }}
                                className="bg-[#D4AF37] text-black text-[9px] font-black px-2 py-0.5 rounded-full flex-shrink-0 shadow-sm"
                              >
                                {unreadInThread}
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-zinc-200/90 truncate mt-0.5 drop-shadow-sm">
                          {isLastSentByMe && (
                            isLastReadByOther ? (
                              <span title="Seen" className="inline-flex items-center shrink-0">
                                <CheckCheck className="w-3.5 h-3.5 text-[#34B7F1] shrink-0" />
                              </span>
                            ) : (
                              <span title="Sent" className="inline-flex items-center shrink-0">
                                <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              </span>
                            )
                          )}
                          {isVoice ? (
                            <>
                              <Mic className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                              <span className="truncate">Voice note</span>
                            </>
                          ) : isImg ? (
                            <>
                              <ImageIcon className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                              <span className="truncate">{lastMsg.text && lastMsg.text !== 'Sent an image' ? lastMsg.text : 'Photo'}</span>
                            </>
                          ) : isVid ? (
                            <>
                              <Play className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                              <span className="truncate">{lastMsg.text && lastMsg.text !== 'Sent a video' ? lastMsg.text : 'Video'}</span>
                            </>
                          ) : isDoc ? (
                            <>
                              <FileText className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                              <span className="truncate">{lastMsg.fileName || 'Document'}</span>
                            </>
                          ) : (
                            <span className="truncate">{lastMsg.text || 'Tap to open chat'}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Side: Date/Time + Chevron */}
                    <div className="relative z-10 flex items-center gap-2 shrink-0">
                      <span className="simcha-event-pill px-3 py-1 rounded-full text-[9px] sm:text-[10px] font-bold text-zinc-100 border border-white/15">
                        {new Date(lastMsg.timestamp).toLocaleDateString()}
                      </span>
                      <div className="w-7 h-7 rounded-full simcha-event-pill border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] group-hover:bg-[#D4AF37] group-hover:text-black transition-all">
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
        {activeTab === 'profile' && (
          <div className="max-w-2xl mx-auto animate-in fade-in duration-500">
            <div className="bg-[#111] rounded-3xl border border-white/5 p-8 shadow-2xl space-y-8">
              <div className="flex flex-col items-center text-center space-y-6">
                <div className="relative group">
                  <div className="w-32 h-32 rounded-full bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] text-5xl font-bold border-2 border-[#D4AF37]/30 overflow-hidden shadow-2xl">
                    {editPhotoURL ? (
                      <img src={editPhotoURL} className="w-full h-full object-cover" />
                    ) : (
                      user.name[0]
                    )}
                    {isUploadingPhoto && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
                      </div>
                    )}
                  </div>
                  
                  <div className="absolute -bottom-2 -right-2 flex gap-2">
                    <input 
                      type="file" 
                      ref={profilePhotoInputRef}
                      onChange={handleProfilePhotoUpload}
                      className="hidden"
                      accept="image/*"
                    />
                    <button 
                      onClick={() => profilePhotoInputRef.current?.click()}
                      className="p-3 bg-[#D4AF37] text-black rounded-full shadow-xl hover:scale-110 transition-transform"
                      title="Upload Photo"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                    {editPhotoURL && (
                      <button 
                        onClick={handleProfilePhotoDelete}
                        className="p-3 bg-zinc-800 text-white rounded-full shadow-xl hover:scale-110 transition-transform"
                        title="Remove Photo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-2xl font-bold text-white font-[Cinzel]">{user.name}</h3>
                  <p className="text-zinc-400 text-xs uppercase tracking-widest">{user.username}</p>
                </div>
              </div>

              <div className="space-y-6">
                {onToggleThemeMode && (
                  <div className="flex flex-col items-center justify-center gap-2.5 py-1 text-center w-full">
                    <span className="text-xs font-bold font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.2em] text-center">App Preference</span>
                    <div className="flex items-center justify-center w-full">
                      <ThemeModeSwitch
                        themeMode={themeMode}
                        onToggleThemeMode={onToggleThemeMode}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest ml-1">Full Name</label>
                  <input 
                    type="text" 
                    value={editName} 
                    onChange={e => setEditName(e.target.value)} 
                    className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-4 text-sm text-white outline-none focus:border-[#D4AF37]" 
                    placeholder="Your Name" 
                  />
                </div>

                <div className="pt-4 flex flex-col gap-4">
                  <button 
                    onClick={() => onUpdateProfile({ name: editName, photoURL: editPhotoURL, photoStoragePath: editPhotoStoragePath })}
                    className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-full hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl"
                  >
                    Save Profile Info
                  </button>
                  
                  <div className="pt-8 border-t border-white/5">
                    <button 
                      onClick={onDeleteAccount}
                      className="w-full bg-zinc-800 text-zinc-400 border border-zinc-400/20 font-black py-4 rounded-full hover:bg-zinc-800 hover:text-white transition-all uppercase tracking-[0.2em] text-xs"
                    >
                      Delete Account
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      {/* Embedded Stripe Paywall Modal — Opens immediately on Pay and shows luxury loader if session is still resolving */}
      {checkoutBookingInfo && (
        <EmbeddedCheckoutModal
          clientSecret={checkoutClientSecret}
          bookingId={checkoutBookingInfo.id}
          amount={checkoutBookingInfo.amount}
          vendorName={checkoutBookingInfo.vendorName}
          error={checkoutError}
          onRetry={() => handlePay(checkoutBookingInfo.id, checkoutBookingInfo.vendorId, checkoutBookingInfo.amount)}
          onClose={() => {
            setCheckoutClientSecret(null);
            setCheckoutError(null);
            setCheckoutBookingInfo(null);
          }}
        />
      )}

      {/* Fullscreen Media Viewer */}
      <AnimatePresence>
        {fullscreenMedia && (
          <motion.div 
            role="dialog"
            aria-modal="true"
            aria-label="Media Preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-sm"
          >
            <button 
              onClick={() => setFullscreenMedia(null)}
              className="absolute top-4 right-4 text-white hover:text-[#D4AF37] bg-black/50 p-3 rounded-full backdrop-blur-md border border-white/10 transition-all shadow-xl z-10"
            >
              <X className="w-6 h-6" />
            </button>
            {fullscreenMedia.type === 'image' ? (
              <img src={fullscreenMedia.url} alt="Fullscreen View" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
            ) : (
              <video src={fullscreenMedia.url} controls autoPlay className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl bg-black" />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Client Event / Plan Scope Bottom Drag-Dismiss Modal (No outer AnimatePresence so useModalDragDismiss unmounts cleanly) */}
      {typeof document !== 'undefined' &&
        selectedScopeTarget &&
        createPortal(
          (() => {
            if (selectedScopeTarget.mode === 'booking') {
              const activeBooking = clientBookings.find(b => b.id === selectedScopeTarget.bookingId) || bookings.find(b => b.id === selectedScopeTarget.bookingId);
              if (!activeBooking) return null;
              const activeVendor = vendors.find(v => v.id === activeBooking.vendorId);
              if (!activeVendor) return null;
              const countdown = getCountdown(activeBooking.date);
              return (
                <ClientEventScopeModal
                  key={`booking-scope-${activeBooking.id}`}
                  mode="booking"
                  booking={activeBooking}
                  vendor={activeVendor}
                  user={user}
                  countdown={countdown}
                  openSections={openScopeSections}
                  toggleSection={toggleScopeSection}
                  onClose={() => setSelectedScopeTarget(null)}
                  onMessage={() => {
                    const existingThread = chatThreads.find(([vid]) => vid === activeVendor.id);
                    const conId = existingThread?.[1]?.lastMessage?.conversationId || [user.id, activeVendor.id].sort().filter(Boolean).join('_');
                    triggerMessageWithSkeleton(activeVendor, conId, existingThread?.[1]?.messages);
                  }}
                  onPrefetchPay={() => prefetchPay(activeBooking.id, activeBooking.vendorId, activeBooking.amount)}
                  onPay={() => handlePay(activeBooking.id, activeBooking.vendorId, activeBooking.amount)}
                  isProcessingPayment={isProcessingPayment}
                  onMakeOrUpdateOffer={(offerPrice, noteAddition) =>
                    handleUpdateBookingOffer(activeBooking, offerPrice, noteAddition)
                  }
                  onCancelBooking={() => handleCancelClientBooking(activeBooking.id)}
                />
              );
            } else {
              const planItem = cart[selectedScopeTarget.index];
              if (!planItem) return null;
              const countdown = getCountdown(planItem.date);
              return (
                <ClientEventScopeModal
                  key={`plan-scope-${selectedScopeTarget.index}`}
                  mode="plan"
                  planItem={planItem}
                  planIndex={selectedScopeTarget.index}
                  vendor={planItem.vendor}
                  user={user}
                  countdown={countdown}
                  openSections={openScopeSections}
                  toggleSection={toggleScopeSection}
                  onClose={() => setSelectedScopeTarget(null)}
                  onMessage={() => {
                    const existingThread = chatThreads.find(([vid]) => vid === planItem.vendor.id);
                    const conId = existingThread?.[1]?.lastMessage?.conversationId || [user.id, planItem.vendor.id].sort().filter(Boolean).join('_');
                    triggerMessageWithSkeleton(planItem.vendor, conId, existingThread?.[1]?.messages);
                  }}
                  onEditPlanItem={() => onEditCartItem(selectedScopeTarget.index)}
                  onRemovePlanItem={() => onRemoveFromCart(selectedScopeTarget.index)}
                  onSendPlanRequests={onProcessCart}
                />
              );
            }
          })(),
          document.body
        )}

      {/* Full-Screen Loading Indicator in between Event Modal Pop-Down and Payment Modal Pop-Up */}
      {typeof document !== 'undefined' &&
        payTransitionInfo &&
        createPortal(
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[250] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 select-none"
          >
            {/* Full-screen subtle skeleton frame */}
            <div className="w-full max-w-md space-y-5 flex flex-col items-center">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-[#D4AF37]/20 animate-ping" />
                <div className="absolute inset-1 rounded-full border-2 border-[#D4AF37]/25" />
                <div className="absolute inset-1 rounded-full border-2 border-transparent border-t-[#D4AF37] border-r-[#D4AF37]/60 animate-spin" />
                <div className="w-11 h-11 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center shadow-[0_0_30px_rgba(212,175,55,0.35)]">
                  <ShieldCheck className="w-5 h-5 text-[#D4AF37] animate-pulse" />
                </div>
              </div>

              <div className="text-center space-y-1.5">
                <p className="text-xs sm:text-sm font-bold font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.25em]">
                  Preparing Secure Checkout
                </p>
                <p className="text-[11px] text-zinc-400">
                  {payTransitionInfo.vendorName
                    ? `Connecting encrypted Stripe gateway for ${payTransitionInfo.vendorName} ($${payTransitionInfo.amount.toLocaleString()})...`
                    : `Initializing encrypted Stripe payment ($${payTransitionInfo.amount.toLocaleString()})...`}
                </p>
              </div>

              <div className="w-full space-y-2.5 pt-2 opacity-60">
                <div className="h-11 w-full rounded-2xl bg-white/[0.04] border border-[#D4AF37]/20 animate-pulse" />
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="h-11 rounded-2xl bg-white/[0.04] border border-white/10 animate-pulse" />
                  <div className="h-11 rounded-2xl bg-white/[0.04] border border-white/10 animate-pulse" />
                </div>
                <div className="h-12 w-full rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/35 animate-pulse" />
              </div>
            </div>
          </motion.div>,
          document.body
        )}

      {/* Full-Screen Luxury Chat Skeleton Loader (Dead-Centered to match Payment Loader) */}
      {typeof document !== 'undefined' &&
        chatTransitionTarget &&
        createPortal(
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[250] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 select-none"
          >
            <div className="w-full max-w-md space-y-5 flex flex-col items-center text-center mx-auto">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-2 border-[#D4AF37]/20 animate-ping" />
                <div className="absolute inset-1 rounded-full border-2 border-[#D4AF37]/25" />
                <div className="absolute inset-1 rounded-full border-2 border-transparent border-t-[#D4AF37] border-r-[#D4AF37]/60 animate-spin" />
                <div className="w-11 h-11 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center shadow-[0_0_30px_rgba(212,175,55,0.35)]">
                  <MessageSquare className="w-5 h-5 text-[#D4AF37] animate-pulse" />
                </div>
              </div>

              <div className="text-center space-y-1.5">
                <p className="text-xs sm:text-sm font-bold font-[Cinzel] uppercase tracking-[0.25em] text-[#D4AF37]">
                  Opening Direct Chat
                </p>
                <p className="text-[11px] text-zinc-400">
                  Connecting conversation with {chatTransitionTarget.vendor.name}...
                </p>
              </div>

              {/* Symmetrical Centered Skeleton Preview */}
              <div className="w-full space-y-2.5 pt-2 opacity-60">
                <div className="h-11 w-full rounded-2xl bg-white/[0.04] border border-[#D4AF37]/20 animate-pulse flex items-center px-3.5 gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#D4AF37]/25 shrink-0" />
                  <div className="h-2.5 flex-1 rounded-full bg-white/15" />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="h-11 rounded-2xl bg-white/[0.04] border border-white/10 animate-pulse" />
                  <div className="h-11 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/25 animate-pulse" />
                </div>
                <div className="h-12 w-full rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/35 animate-pulse" />
              </div>
            </div>
          </motion.div>,
          document.body
        )}
    </div>
  );
};

export default ClientPortal;