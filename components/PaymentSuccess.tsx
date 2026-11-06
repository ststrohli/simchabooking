import React, { useEffect, useState } from 'react';
import { Check, ShieldCheck, AlertCircle, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { db } from '../services/firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface PaymentSuccessProps {
  bookingId: string;
  vendorId: string;
  amount?: number;
  vendorName?: string;
  eventDate?: string;
  eventName?: string;
  onReturn: () => void;
}

const PaymentSuccess: React.FC<PaymentSuccessProps> = ({
  bookingId,
  vendorId,
  amount: propAmount,
  vendorName: propVendorName,
  eventDate: propEventDate,
  eventName: propEventName,
  onReturn,
}) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [resolvedAmount, setResolvedAmount] = useState<number | undefined>(propAmount);
  const [resolvedVendorName, setResolvedVendorName] = useState<string | undefined>(propVendorName);
  const [resolvedDate, setResolvedDate] = useState<string | undefined>(propEventDate);
  const [resolvedEventName, setResolvedEventName] = useState<string | undefined>(propEventName);

  useEffect(() => {
    if (typeof propAmount === 'number' && propAmount > 0) setResolvedAmount(propAmount);
    if (propVendorName) setResolvedVendorName(propVendorName);
    if (propEventDate) setResolvedDate(propEventDate);
    if (propEventName) setResolvedEventName(propEventName);
  }, [propAmount, propVendorName, propEventDate, propEventName]);

  useEffect(() => {
    let isCancelled = false;

    const verifyPayment = async () => {
      const minLoadingDelay = new Promise<void>((resolve) => window.setTimeout(resolve, 1850));

      try {
        // Fetch booking & vendor details in parallel so we always display "$Amount Confirmed" and vendor name cleanly
        const fetchDetailsPromise = (async () => {
          try {
            if (bookingId) {
              const bSnap = await getDoc(doc(db, 'bookings', bookingId));
              if (bSnap.exists()) {
                const bData = bSnap.data() as any;
                if (!isCancelled) {
                  if (typeof bData.amount === 'number') setResolvedAmount(bData.amount);
                  if (bData.date) setResolvedDate(bData.date);
                  if (bData.eventName) setResolvedEventName(bData.eventName);
                }
                const targetVendorId = vendorId || bData.vendorId;
                if (targetVendorId) {
                  const vSnap = await getDoc(doc(db, 'vendors', targetVendorId));
                  if (vSnap.exists() && !isCancelled) {
                    const vData = vSnap.data() as any;
                    if (vData.name) setResolvedVendorName(vData.name);
                  }
                }
              }
            }
          } catch (e) {
            console.warn('[PaymentSuccess] Optional detail lookup warning:', e);
          }
        })();

        const response = await fetch('/api/stripe/verify-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ bookingId }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to verify payment');
        }

        const data = await response.json();

        // If server-side update failed due to permissions, handle it on the client
        if (data.needsClientUpdate && data.updateData) {
          try {
            const bookingRef = doc(db, 'bookings', bookingId);
            await updateDoc(bookingRef, {
              ...data.updateData,
              updatedAt: serverTimestamp(),
            });
          } catch (clientUpdateError) {
            console.error('[PaymentSuccess] Client-side update failed:', clientUpdateError);
          }
        }

        await Promise.all([minLoadingDelay, fetchDetailsPromise]);
        if (!isCancelled) {
          setStatus('success');
        }
      } catch (err: any) {
        console.error('Error verifying payment:', err);
        await minLoadingDelay;
        if (!isCancelled) {
          setError(err.message);
          setStatus('error');
        }
      }
    };

    if (bookingId) {
      verifyPayment();
    } else {
      const timer = window.setTimeout(() => {
        if (!isCancelled) {
          setStatus('success');
        }
      }, 1850);
      return () => window.clearTimeout(timer);
    }

    return () => {
      isCancelled = true;
    };
  }, [bookingId, vendorId]);

  return (
    <main className="fixed inset-0 z-[250] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 select-none overflow-hidden">
      {status === 'loading' && (
        <motion.div
          key="payment-verifying-loader"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="w-full max-w-md space-y-5 flex flex-col items-center text-center mx-auto"
        >
          {/* Identical Triple-Ring Luxury Gold Loading Indicator as Pre-Pay */}
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
              Confirming Your Payment
            </p>
            <p className="text-[11px] text-zinc-400">
              {resolvedVendorName && typeof resolvedAmount === 'number'
                ? `Finalizing $${resolvedAmount.toLocaleString()} payment for ${resolvedVendorName}...`
                : typeof resolvedAmount === 'number'
                ? `Finalizing $${resolvedAmount.toLocaleString()} reservation payment...`
                : 'Finalizing your confirmed reservation...'}
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
        </motion.div>
      )}

      {status === 'success' && (
        <motion.div
          key="payment-confirmed-summary"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full max-w-md space-y-5 flex flex-col items-center text-center mx-auto"
        >
          {/* Glowing Gold Confirmation Badge matching the loader's exact footprint */}
          <div className="relative w-20 h-20 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 shadow-[0_0_35px_rgba(212,175,55,0.3)]" />
            <div className="absolute inset-2 rounded-full border border-[#D4AF37]/40" />
            <div className="w-12 h-12 rounded-full bg-[#D4AF37] text-black flex items-center justify-center shadow-[0_0_25px_rgba(212,175,55,0.6)]">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
          </div>

          <div className="text-center space-y-1">
            <p className="text-[11px] sm:text-xs font-black font-[Cinzel] text-[#D4AF37] uppercase tracking-[0.3em]">
              Payment Received
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold font-[Cinzel] text-white tracking-wide">
              {typeof resolvedAmount === 'number' && resolvedAmount > 0
                ? `$${resolvedAmount.toLocaleString()} Confirmed`
                : 'Payment Confirmed'}
            </h2>
            <p className="text-[11px] text-zinc-400">
              {resolvedVendorName
                ? `Your reservation with ${resolvedVendorName} is officially paid & locked in.`
                : 'Your reservation is officially paid and locked in.'}
            </p>
          </div>

          {/* Sleek Compact Pill Details matching the 3-row loader structure */}
          <div className="w-full space-y-2.5 pt-2">
            <div className="h-11 w-full rounded-2xl bg-white/[0.04] border border-[#D4AF37]/30 px-4 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                {resolvedVendorName || resolvedEventName || 'Reservation'}
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-green-500/20 text-green-300 border border-green-500/40">
                Paid in Full
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="h-11 rounded-2xl bg-white/[0.04] border border-white/10 px-3.5 flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Amount</span>
                <span className="text-xs font-bold font-[Cinzel] text-[#D4AF37]">
                  {typeof resolvedAmount === 'number' && resolvedAmount > 0
                    ? `$${resolvedAmount.toLocaleString()}`
                    : 'Confirmed'}
                </span>
              </div>
              <div className="h-11 rounded-2xl bg-white/[0.04] border border-white/10 px-3.5 flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  {resolvedDate ? 'Date' : 'Status'}
                </span>
                <span className="text-[11px] font-bold text-white truncate">
                  {resolvedDate || 'Confirmed'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onReturn}
              className="h-12 w-full rounded-full bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black text-[10px] sm:text-[11px] uppercase tracking-[0.22em] transition-all shadow-[0_10px_25px_rgba(212,175,55,0.28)] flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Continue to My Events</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}

      {status === 'error' && (
        <motion.div
          key="payment-verify-error"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-5 flex flex-col items-center text-center mx-auto"
        >
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold font-[Cinzel] text-white uppercase tracking-widest">
              Payment Status Check
            </h2>
            <p className="text-xs text-zinc-400">
              {error || 'We could not automatically confirm the status yet. Please check your Events tab.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onReturn}
            className="h-12 w-full rounded-full bg-[#D4AF37] hover:bg-[#E5C76B] text-black font-black text-[10px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Return to My Events</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </main>
  );
};

export default PaymentSuccess;
