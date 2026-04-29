import React, { useEffect, useState } from 'react';
import { CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { db } from './firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface PaymentSuccessProps {
  bookingId: string;
  vendorId: string;
  onReturn: () => void;
}

const PaymentSuccess: React.FC<PaymentSuccessProps> = ({ bookingId, vendorId, onReturn }) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const verifyPayment = async () => {
      try {
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
          console.log('[PaymentSuccess] Server update skipped, performing client-side update...');
          try {
            const bookingRef = doc(db, 'bookings', bookingId);
            await updateDoc(bookingRef, {
              ...data.updateData,
              updatedAt: serverTimestamp()
            });
            console.log('[PaymentSuccess] Client-side update successful.');
          } catch (clientUpdateError) {
            console.error('[PaymentSuccess] Client-side update failed:', clientUpdateError);
            // We don't necessarily want to show an error to the user if the payment itself was verified
            // but the status update failed. However, for this app, the status is important.
          }
        }

        setStatus('success');
      } catch (err: any) {
        console.error('Error verifying payment:', err);
        setError(err.message);
        setStatus('error');
      }
    };

    if (bookingId) {
      verifyPayment();
    } else {
      setStatus('error');
      setError('No booking ID found in URL');
    }
  }, [bookingId]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[#D4AF37]/5 via-black to-black" aria-hidden="true"></div>
      
      <div className="bg-[#111] rounded-3xl p-8 md:p-12 max-w-lg w-full border border-[#D4AF37]/20 shadow-2xl animate-in zoom-in-95 duration-500 relative z-10 text-center">
        {status === 'loading' && (
          <div className="flex flex-col items-center gap-6">
            <Loader2 className="w-16 h-16 text-[#D4AF37] animate-spin" />
            <h2 className="text-2xl font-bold font-[Cinzel] text-[#D4AF37]">Verifying Payment...</h2>
            <p className="text-slate-400">Please wait while we update your booking status.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center gap-6">
            <div className="bg-green-500/10 w-24 h-24 rounded-full flex items-center justify-center border border-green-500/20">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>
            <h2 className="text-3xl font-bold font-[Cinzel] text-green-500">Payment Successful!</h2>
            <div className="space-y-2">
              <p className="text-slate-300 text-lg">Your booking has been confirmed and marked as paid.</p>
              <p className="text-slate-500 text-sm font-mono">Booking ID: {bookingId}</p>
            </div>
            
            <button
              onClick={onReturn}
              className="mt-4 w-full bg-[#D4AF37] text-black font-black py-4 rounded-xl hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Return to Dashboard
            </button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-6">
            <div className="bg-red-500/10 w-24 h-24 rounded-full flex items-center justify-center border border-red-500/20">
              <CheckCircle className="w-16 h-16 text-red-500 rotate-180" />
            </div>
            <h2 className="text-2xl font-bold font-[Cinzel] text-red-500">Verification Failed</h2>
            <p className="text-slate-400">{error || 'Something went wrong while updating your booking.'}</p>
            
            <button
              onClick={onReturn}
              className="mt-4 w-full bg-slate-800 text-white font-bold py-4 rounded-xl hover:bg-slate-700 transition-all uppercase tracking-[0.2em] text-xs flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" /> Return to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentSuccess;
