import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Loader2 } from 'lucide-react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { useModalDragDismiss, ModalDragIndicator } from './useModalDragDismiss';

const MODAL_TRANSITION = { duration: 1, ease: [0.25, 1, 0.5, 1] as const };

// Get publishable key from environment, fallback to server fetch if needed
const envPublishableKey = 
  (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY || 
  process.env.VITE_STRIPE_PUBLISHABLE_KEY || 
  process.env.STRIPE_PUBLISHABLE_KEY || 
  '';

interface EmbeddedCheckoutModalProps {
  clientSecret: string;
  onClose: () => void;
  bookingId?: string;
  amount?: number;
  vendorName?: string;
}

export const EmbeddedCheckoutModal: React.FC<EmbeddedCheckoutModalProps> = ({
  clientSecret,
  onClose,
  amount,
  vendorName
}) => {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(() => {
    if (envPublishableKey) {
      return loadStripe(envPublishableKey);
    }
    return null;
  });

  const [isLoadingKey, setIsLoadingKey] = useState(!envPublishableKey);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    if (!envPublishableKey) {
      fetch('/api/stripe/config')
        .then(res => res.json())
        .then(data => {
          if (data.publishableKey) {
            setStripePromise(loadStripe(data.publishableKey));
          } else {
            setStripePromise(loadStripe('pk_test_51PxyzSamplePublishableKey'));
          }
        })
        .catch(err => {
          console.warn('Failed to load Stripe config:', err);
          setStripePromise(loadStripe('pk_test_51PxyzSamplePublishableKey'));
        })
        .finally(() => {
          setIsLoadingKey(false);
        });
    }
  }, []);

  const { backdropOpacity, isDismissing, dragModalProps, dragHandleProps, dismissWithSlideOut } = useModalDragDismiss(
    onClose,
    true
  );

  return (
    <motion.div 
      style={{ opacity: backdropOpacity }}
      transition={MODAL_TRANSITION}
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="embedded-checkout-title" 
      className={`fixed inset-0 z-[160] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 bg-black/80 backdrop-blur-md overflow-hidden ${isDismissing ? 'pointer-events-none' : ''}`}
    >
      <motion.div
        {...dragModalProps}
        transition={MODAL_TRANSITION}
        className={`bg-[#0a0a0a] w-full sm:w-full sm:max-w-xl h-[93dvh] sm:h-auto sm:max-h-[88vh] rounded-t-[2.5rem] rounded-b-none sm:rounded-2xl border-t-2 border-r border-l sm:border border-[#D4AF37]/30 shadow-[0_0_50px_rgba(212,175,55,0.18)] overflow-hidden relative flex flex-col mt-auto sm:mt-0 transform-gpu ${isDismissing ? 'pointer-events-none' : ''}`}
      >
        {/* Top bar drag indicator positioned across the top edge, leaving top-right corner clear for X button */}
        <div 
          {...dragHandleProps}
          data-drag-handle="true"
          className="absolute top-0 left-0 right-14 z-30 pt-1.5 pb-4 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
        >
          <div className="pl-14">
            <ModalDragIndicator />
          </div>
        </div>

        {/* Floating close button rendered at root z-[120] top-4 right-4 - identical to BookingModal */}
        <button 
          type="button"
          onClick={dismissWithSlideOut} 
          className="absolute top-4 right-4 z-[120] w-8 h-8 flex items-center justify-center bg-[#1a1a1a] hover:bg-[#262626] border border-[#D4AF37]/40 rounded-full text-[#D4AF37] transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] shadow-xl cursor-pointer" 
          aria-label="Close Checkout"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Brand-Themed Header */}
        <div 
          {...dragHandleProps}
          data-drag-handle="true"
          className="pt-7 pb-4 px-5 sm:px-6 border-b border-[#D4AF37]/20 bg-[#0a0a0a] shrink-0 text-center cursor-grab active:cursor-grabbing select-none"
        >
          <h3 id="embedded-checkout-title" className="text-base sm:text-lg font-bold font-[Cinzel] text-[#D4AF37] uppercase tracking-widest">
            {vendorName || 'Complete Booking Payment'}
          </h3>
          {typeof amount === 'number' && amount > 0 && (
            <p className="text-xs text-zinc-300 font-bold tracking-widest uppercase mt-1">
              Total Due: <span className="text-[#D4AF37] font-[Cinzel] text-sm">${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </p>
          )}
        </div>

        {/* Full-Width Stripe Checkout Body */}
        <div className="flex-1 overflow-y-auto w-full bg-[#0a0a0a] p-0 sm:p-3 custom-scrollbar">
          <div className="w-full min-h-[460px] bg-white sm:rounded-2xl overflow-hidden border border-[#D4AF37]/20">
            {isLoadingKey || !stripePromise ? (
              <div className="flex flex-col items-center justify-center h-96 gap-3 bg-[#0a0a0a] text-zinc-300">
                <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
                <p className="text-[11px] font-black uppercase tracking-widest text-[#D4AF37]">Preparing Checkout...</p>
              </div>
            ) : (
              <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
                <EmbeddedCheckout className="w-full" />
              </EmbeddedCheckoutProvider>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default EmbeddedCheckoutModal;
