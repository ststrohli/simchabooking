import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, Lock, Loader2 } from 'lucide-react';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';

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
  bookingId,
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
    if (!envPublishableKey) {
      fetch('/api/stripe/config')
        .then(res => res.json())
        .then(data => {
          if (data.publishableKey) {
            setStripePromise(loadStripe(data.publishableKey));
          } else {
            // Fallback key
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0f0f0f] w-full max-w-3xl max-h-[92vh] rounded-3xl border border-[#D4AF37]/30 shadow-[0_0_50px_rgba(212,175,55,0.15)] flex flex-col overflow-hidden relative">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-zinc-800/80 bg-zinc-950/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#D4AF37]/10 rounded-2xl border border-[#D4AF37]/30 text-[#D4AF37]">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-bold font-[Cinzel] text-[#D4AF37] uppercase tracking-wider">
                  Secure Embedded Paywall
                </h3>
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
                  <Lock className="w-3 h-3" /> PCI Compliant
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {vendorName ? `${vendorName} • ` : ''}
                {bookingId ? `Booking #${bookingId.slice(0, 8)}` : 'Simcha Service Payment'}
                {amount ? ` • $${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer outline-none"
            aria-label="Close Checkout"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-4 bg-white rounded-b-3xl text-black min-h-[450px]">
          {isLoadingKey || !stripePromise ? (
            <div className="flex flex-col items-center justify-center h-80 gap-3 text-zinc-600">
              <Loader2 className="w-8 h-8 animate-spin text-[#D4AF37]" />
              <p className="text-xs font-semibold uppercase tracking-wider">Loading Secure Checkout...</p>
            </div>
          ) : (
            <EmbeddedCheckoutProvider stripe={stripePromise} options={{ clientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
        </div>

        {/* Modal Footer Banner */}
        <div className="p-3 bg-zinc-950 border-t border-zinc-800/80 text-center text-[10px] text-zinc-400 flex items-center justify-between px-6 shrink-0">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37]" /> Powered by Stripe Connect Split Payments
          </span>
          <span className="text-zinc-400 font-mono">
            Cards & ACH Direct Debit Enabled
          </span>
        </div>

      </div>
    </div>
  );
};

export default EmbeddedCheckoutModal;
