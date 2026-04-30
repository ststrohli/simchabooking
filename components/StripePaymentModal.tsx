
import React, { useState } from 'react';
import { CreditCard, Lock, Loader2, CheckCircle } from 'lucide-react';

interface StripePaymentModalProps {
  amount: number;
  bookingId: string;
  vendorId: string;
  onSuccess: (method: string) => void;
}

const StripePaymentModal: React.FC<StripePaymentModalProps> = ({ 
  amount, 
  bookingId, 
  vendorId, 
  onSuccess 
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/stripe/create-checkout-session?vendorId=${vendorId}&amount=${amount}&bookingId=${bookingId}`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create checkout session');
      }
      const data = await response.json();
      if (data.url) {
        // BREAKOUT: Try window.top.location.href first, fallback to window.open if blocked
        try {
          window.top!.location.href = data.url;
        } catch (e) {
          console.warn('window.top navigation blocked, falling back to window.open', e);
          window.open(data.url, '_blank');
        }
      }
    } catch (err: any) {
      console.error('Payment Error:', err);
      setError(err.message || 'Failed to start payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button 
        onClick={handlePayment}
        disabled={loading}
        className="bg-black hover:bg-slate-900 text-white font-bold px-4 py-2 rounded-full shadow-sm flex items-center justify-center gap-2 transition-colors text-sm border border-slate-700 w-full"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <CreditCard className="w-4 h-4" />
        )}
        Pay with Card
      </button>
      {error && <p className="text-[10px] text-red-500 font-bold text-center">{error}</p>}
    </div>
  );
};

export default StripePaymentModal;
