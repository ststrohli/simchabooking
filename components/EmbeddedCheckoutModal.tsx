import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { X, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { useModalDragDismiss, ModalDragIndicator } from './useModalDragDismiss';

const MODAL_TRANSITION = { duration: 1.15, ease: [0.25, 0.85, 0.35, 1] as const };

// Get publishable key from environment, fallback to server fetch if needed
const envPublishableKey =
  (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY ||
  process.env.VITE_STRIPE_PUBLISHABLE_KEY ||
  process.env.STRIPE_PUBLISHABLE_KEY ||
  '';

// Module-level cached Stripe promise so it only loads once per session
let cachedStripePromise: Promise<Stripe | null> | null = envPublishableKey
  ? loadStripe(envPublishableKey)
  : null;

function getOrLoadStripePromise(): Promise<Stripe | null> {
  if (!cachedStripePromise) {
    cachedStripePromise = fetch('/api/stripe/config')
      .then((res) => res.json())
      .then((data) => {
        if (data?.publishableKey) {
          return loadStripe(data.publishableKey);
        }
        return null;
      })
      .catch((err) => {
        console.warn('Failed to load Stripe config:', err);
        cachedStripePromise = null;
        return null;
      });
  }
  return cachedStripePromise;
}

// Pre-warm Stripe config in the background
if (typeof window !== 'undefined' && !cachedStripePromise) {
  getOrLoadStripePromise();
}

interface EmbeddedCheckoutModalProps {
  clientSecret: string | null;
  onClose: () => void;
  bookingId?: string;
  amount?: number;
  vendorName?: string;
  error?: string | null;
  onRetry?: () => void;
}

export const EmbeddedCheckoutModal: React.FC<EmbeddedCheckoutModalProps> = ({
  clientSecret,
  onClose,
  amount,
  vendorName,
  error,
  onRetry,
}) => {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(() => getOrLoadStripePromise());
  const [isLoadingKey, setIsLoadingKey] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    if (!stripePromise) {
      setStripePromise(getOrLoadStripePromise());
    }
    setIsLoadingKey(false);
  }, [stripePromise]);

  const handleDismissStart = useCallback(() => {
    document.body.style.overflow = '';
  }, []);

  const { backdropOpacity, isDismissing, dragModalProps, dragHandleProps, dismissWithSlideOut } = useModalDragDismiss(
    onClose,
    true,
    handleDismissStart
  );

  const isPreparing = isLoadingKey || !stripePromise || !clientSecret;

  const modalContent = (
    <motion.div
      style={{ opacity: backdropOpacity }}
      transition={MODAL_TRANSITION}
      role="dialog"
      aria-modal="true"
      aria-labelledby="embedded-checkout-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) dismissWithSlideOut();
      }}
      className={`fixed inset-0 z-[160] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 bg-black/85 backdrop-blur-xl overflow-hidden ${
        isDismissing ? 'pointer-events-none' : ''
      }`}
    >
      <motion.div
        {...dragModalProps}
        transition={MODAL_TRANSITION}
        onClick={(e) => e.stopPropagation()}
        className={`bg-[#0a0a0a] w-full sm:w-full sm:max-w-xl h-[91dvh] sm:h-[90vh] sm:max-h-[90vh] rounded-t-[2.5rem] rounded-b-none sm:rounded-[2.5rem] border-t-2 border-r border-l sm:border border-[#D4AF37]/30 shadow-[0_0_50px_rgba(212,175,55,0.18)] overflow-hidden relative flex flex-col mt-auto sm:mt-0 transform-gpu ${
          isDismissing ? 'pointer-events-none' : ''
        }`}
      >
        {/* Top bar drag indicator positioned across the top edge, leaving top-right corner clear for X button */}
        <div
          {...dragHandleProps}
          data-drag-handle="true"
          className="absolute top-0 left-0 right-14 z-30 pt-2 pb-3 flex items-center justify-center cursor-grab active:cursor-grabbing select-none touch-none"
        >
          <div className="pl-14">
            <ModalDragIndicator />
          </div>
        </div>

        {/* Floating close button rendered at root z-[120] top-4 right-4 */}
        <button
          type="button"
          onClick={() => dismissWithSlideOut()}
          className="absolute top-4 right-4 z-[120] w-8 h-8 flex items-center justify-center bg-[#1a1a1a] hover:bg-[#D4AF37] border border-[#D4AF37]/40 rounded-full text-[#D4AF37] hover:text-black transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] shadow-xl cursor-pointer"
          aria-label="Close Checkout"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Brand-Themed Header */}
        <div
          {...dragHandleProps}
          data-drag-handle="true"
          className="pt-7 pb-3.5 px-5 sm:px-6 border-b border-[#D4AF37]/20 bg-[#0a0a0a] shrink-0 text-center cursor-grab active:cursor-grabbing select-none touch-none"
        >
          <h3
            id="embedded-checkout-title"
            className="text-base sm:text-lg font-bold font-[Cinzel] text-[#D4AF37] uppercase tracking-widest truncate px-8"
          >
            {vendorName || 'Complete Booking Payment'}
          </h3>
          {typeof amount === 'number' && amount > 0 && (
            <p className="text-xs text-zinc-300 font-bold tracking-widest uppercase mt-1">
              Total Due:{' '}
              <span className="text-[#D4AF37] font-[Cinzel] text-sm">
                ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </p>
          )}
        </div>

        {/* Full-Width Scrollable Stripe Checkout Body */}
        <div
          data-modal-scroll="true"
          style={{ WebkitOverflowScrolling: 'touch' }}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y w-full bg-[#0a0a0a] p-0 sm:p-3 custom-scrollbar"
        >
          {error ? (
            <div className="min-h-full flex flex-col items-center justify-center p-8 text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 shadow-xl">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div className="space-y-1.5 max-w-sm">
                <h4 className="text-sm font-bold font-[Cinzel] text-white uppercase tracking-widest">
                  Payment Session Unavailable
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">{error}</p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="px-6 py-2.5 rounded-full bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all cursor-pointer shadow-lg"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Try Again</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => dismissWithSlideOut()}
                  className="px-6 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-zinc-300 font-black text-[10px] uppercase tracking-widest border border-white/15 transition-all cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          ) : isPreparing ? (
            <div className="min-h-full flex flex-col items-center justify-center p-6 sm:p-8 text-center gap-5 bg-[#0a0a0a]">
              {/* Luxury Dual-Ring Gold Animated Loader */}
              <div className="relative w-20 h-20 flex items-center justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#D4AF37] border-r-[#D4AF37]/40 shadow-[0_0_30px_rgba(212,175,55,0.25)]"
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 3.4, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-2 rounded-full border border-dashed border-[#D4AF37]/45"
                />
                <motion.div
                  animate={{ scale: [0.92, 1.06, 0.92], opacity: [0.8, 1, 0.8] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-[#D4AF37]/25 to-[#D4AF37]/5 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shadow-inner"
                >
                  <ShieldCheck className="w-5 h-5" />
                </motion.div>
              </div>

              <div className="space-y-1.5 max-w-xs">
                <p className="text-xs font-bold font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.25em]">
                  Securing Encrypted Checkout
                </p>
                <p className="text-[11px] text-zinc-400 font-medium">
                  Connecting directly to {vendorName || 'Vendor'}’s verified payment terminal...
                </p>
              </div>

              {/* Luxury Form Skeleton Preview */}
              <div className="w-full max-w-sm space-y-2.5 pt-2">
                <div className="h-10 w-full rounded-full bg-white/[0.04] border border-white/5 overflow-hidden relative">
                  <motion.div
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-1/2 h-full bg-gradient-to-r from-transparent via-[#D4AF37]/15 to-transparent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="h-10 rounded-full bg-white/[0.04] border border-white/5 overflow-hidden relative" />
                  <div className="h-10 rounded-full bg-white/[0.04] border border-white/5 overflow-hidden relative" />
                </div>
                <div className="h-11 w-full rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/30 overflow-hidden relative">
                  <motion.div
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-1/2 h-full bg-gradient-to-r from-transparent via-[#D4AF37]/35 to-transparent"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full shrink-0 bg-white sm:rounded-2xl border border-[#D4AF37]/20 pb-8">
              <EmbeddedCheckoutProvider stripe={stripePromise!} options={{ clientSecret: clientSecret! }}>
                <EmbeddedCheckout className="w-full" />
              </EmbeddedCheckoutProvider>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};

export default EmbeddedCheckoutModal;
