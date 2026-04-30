
import React, { useState } from 'react';
import { CreditCard, CheckCircle, Loader2 } from 'lucide-react';

interface PayPalButtonProps {
  amount: number;
  onSuccess: () => void;
}

const PayPalButton: React.FC<PayPalButtonProps> = ({ amount, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const handlePayment = () => {
    setLoading(true);
    // Simulate API call to PayPal
    setTimeout(() => {
      setLoading(false);
      setShowModal(false);
      onSuccess();
    }, 2000);
  };

  if (showModal) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
        <div className="bg-white w-full max-w-sm rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95">
          <div className="bg-[#003087] p-4 flex justify-center items-center">
            <span className="text-white font-bold italic text-2xl">PayPal</span>
          </div>
          
          <div className="p-6 text-center space-y-6">
            <div>
               <p className="text-slate-500 text-sm mb-1">Total Amount</p>
               <h3 className="text-3xl font-bold text-slate-800">${amount.toLocaleString()}</h3>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-left">
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Pay with</p>
                <div className="flex items-center gap-3">
                    <div className="bg-white p-1 border border-slate-200 rounded">
                        <CreditCard className="w-6 h-6 text-slate-700" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-800">Visa ending in 4242</p>
                        <p className="text-xs text-slate-500">Wallet balance: $5,450.00</p>
                    </div>
                </div>
            </div>

            <button 
              onClick={handlePayment}
              disabled={loading}
              className="w-full bg-[#0070ba] hover:bg-[#003087] text-white font-bold py-3 rounded-full transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                'Pay Now'
              )}
            </button>
            
            <button 
                onClick={() => setShowModal(false)}
                className="text-slate-400 text-sm hover:text-slate-600"
            >
                Cancel and return to merchant
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button 
      onClick={() => setShowModal(true)}
      className="bg-[#FFC439] hover:bg-[#F2BA36] text-blue-900 font-bold px-4 py-2 rounded-full shadow-sm flex items-center gap-2 transition-colors text-sm"
    >
      <span className="italic font-extrabold">Pay</span>Pal
    </button>
  );
};

export default PayPalButton;
