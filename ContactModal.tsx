
import React, { useState } from 'react';
import { X, Send, Mail, User, MessageSquare } from 'lucide-react';

interface ContactModalProps {
  isOpen: boolean;
  vendorName: string;
  onClose: () => void;
  onSend: (data: { name: string; email: string; message: string }) => void;
}

const ContactModal: React.FC<ContactModalProps> = ({ isOpen, vendorName, onClose, onSend }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend(formData);
    setFormData({ name: '', email: '', message: '' }); // Reset
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-amber-500/20">
        
        <div className="bg-black p-6 text-white flex justify-between items-start border-b border-amber-500/20">
          <div>
            <h2 className="text-xl font-bold font-[Cinzel] text-amber-500">Contact Vendor</h2>
            <p className="text-slate-400 text-sm mt-1">Send a message to <span className="text-white font-semibold">{vendorName}</span></p>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white hover:bg-white/10 p-1 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Your Name</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
              <input 
                required
                type="text" 
                placeholder="Full Name"
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Your Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
              <input 
                required
                type="email" 
                placeholder="name@example.com"
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Message</label>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
              <textarea 
                required
                rows={4}
                placeholder="Hi, I'm interested in your services for my event..."
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                value={formData.message}
                onChange={(e) => setFormData({...formData, message: e.target.value})}
              />
            </div>
          </div>

          <div className="pt-2">
            <button 
              type="submit"
              className="w-full bg-black text-amber-500 font-bold py-3 rounded-xl hover:bg-slate-900 transition-colors shadow-lg flex items-center justify-center gap-2 border border-amber-500/20"
            >
              <Send className="w-4 h-4" /> Send Message
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ContactModal;
