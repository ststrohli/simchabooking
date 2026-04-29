import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, ShoppingBag, Calendar, MessageSquare, LogOut, Trash2, 
  ChevronRight, MapPin, Clock, CreditCard, CheckCircle, Bell, X, Menu, Send,
  FileText, Upload, Download, History, Loader2, Plus, Search, PartyPopper
} from 'lucide-react';
import { CartItem, Booking, Message, Vendor, UserAccount, UserFile } from '../types';
import PayPalButton from './PayPalButton';
import { storage, db } from './firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy, onSnapshot } from 'firebase/firestore';
import { summarizeFile } from './geminiService';

interface ClientPortalProps {
  user: UserAccount;
  cart: CartItem[];
  bookings: Booking[];
  messages: Message[];
  vendors: Vendor[];
  onRemoveFromCart: (index: number) => void;
  onProcessCart: () => void;
  onPaymentSuccess: (bookingId: string, method: string) => void;
  onLogout: () => void;
  onClose: () => void;
  onUpdateProfile: (data: { name: string, photoURL: string, photoStoragePath?: string }) => void;
  onDeleteAccount: () => void;
}

const ClientPortal: React.FC<ClientPortalProps> = ({ 
  user, cart, bookings, messages, vendors, onRemoveFromCart, onProcessCart, onPaymentSuccess, onLogout, onClose, onUpdateProfile, onDeleteAccount
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'plan' | 'events' | 'chats' | 'profile' | 'documents'>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedThreadVendorId, setSelectedThreadVendorId] = useState<string | null>(null);

  const [editName, setEditName] = useState(user.name);
  const [editPhotoURL, setEditPhotoURL] = useState(user.photoURL || ''); 
  const [editPhotoStoragePath, setEditPhotoStoragePath] = useState(user.photoStoragePath || '');

  // File Management State
  const [userFiles, setUserFiles] = useState<UserFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [fileNotes, setFileNotes] = useState('');
  const [fileSearch, setFileSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user.id) return;
    
    const filesRef = collection(db, 'users', user.id, 'files');
    const q = query(filesRef, orderBy('timestamp', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const files: UserFile[] = [];
      snapshot.forEach((doc) => {
        files.push({ id: doc.id, ...doc.data() } as UserFile);
      });
      setUserFiles(files);
    });

    return () => unsubscribe();
  }, [user.id]);

  const handleProfilePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user.id) return;

    setIsUploadingPhoto(true);
    try {
      const storagePath = `user_uploads/${user.id}/profile_photo_${Date.now()}`;
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', storagePath);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(await response.text());
      const { url: downloadURL } = await response.json();
      
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

  const handlePay = async (bookingId: string, vendorId: string, amount: number) => {
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
    } catch (error: any) {
      console.error('Payment Error:', error);
      alert(`Payment Error: ${error.message || 'Failed to start payment. Please try again.'}`);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user.id) return;

    setIsUploading(true);
    try {
      const fileId = Math.random().toString(36).substr(2, 9);
      const storagePath = `user_uploads/${user.id}/${fileId}_${file.name}`;
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', storagePath);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error(await response.text());
      const { url: downloadURL } = await response.json();
      
      // Generate AI Summary
      const aiSummary = await summarizeFile(file.name, file.type, fileNotes);
      
      const fileData: UserFile = {
        id: fileId,
        name: file.name,
        url: downloadURL,
        storagePath: storagePath,
        size: file.size,
        type: file.type,
        timestamp: new Date().toISOString(),
        notes: fileNotes,
        aiSummary: aiSummary
      };

      // Sync to Firestore
      await setDoc(doc(db, 'users', user.id, 'files', fileId), fileData);
      
      setFileNotes('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error: any) {
      console.error("File upload error:", error);
      alert("Failed to upload file: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileDownload = async (file: UserFile) => {
    try {
      // The user wants us to find the storage path in Firestore first.
      // Since we already have the file object from Firestore (via onSnapshot), 
      // we can just use file.storagePath.
      // If for some reason storagePath is missing (old records), we'll use the stored URL.
      if (!file.storagePath) {
        window.open(file.url, '_blank');
        return;
      }
      
      const storageRef = ref(storage, file.storagePath);
      const downloadURL = await getDownloadURL(storageRef);
      window.open(downloadURL, '_blank');
    } catch (error) {
      console.error("File download error:", error);
      // Fallback to the stored URL if getting a fresh one fails
      window.open(file.url, '_blank');
    }
  };

  const handleFileDelete = async (file: UserFile) => {
    if (!user.id || !window.confirm(`Are you sure you want to delete ${file.name}?`)) return;

    try {
      // Delete from Storage
      if (file.storagePath) {
        const storageRef = ref(storage, file.storagePath);
        await deleteObject(storageRef);
      } else {
        // Fallback for old records without storagePath
        const decodedUrl = decodeURIComponent(file.url);
        const pathStart = decodedUrl.indexOf('/o/') + 3;
        const pathEnd = decodedUrl.indexOf('?alt=media');
        if (pathStart > 2 && pathEnd > pathStart) {
          const fullPath = decodedUrl.substring(pathStart, pathEnd);
          const storageRef = ref(storage, fullPath);
          await deleteObject(storageRef);
        }
      }
      
      await deleteDoc(doc(db, 'users', user.id, 'files', file.id));
    } catch (error) {
      console.error("File delete error:", error);
      // If storage delete fails (e.g. file not found), still delete Firestore record
      await deleteDoc(doc(db, 'users', user.id, 'files', file.id));
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const filteredFiles = useMemo(() => {
    return userFiles.filter(f => 
      f.name.toLowerCase().includes(fileSearch.toLowerCase()) || 
      (f.notes && f.notes.toLowerCase().includes(fileSearch.toLowerCase())) ||
      (f.aiSummary && f.aiSummary.toLowerCase().includes(fileSearch.toLowerCase()))
    );
  }, [userFiles, fileSearch]);

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
    return { text: `⏳ ${diffDays} Day${diffDays === 1 ? '' : 's'} to go!`, isToday: false };
  };

  const clientBookings = bookings.filter(b => b.contactEmail === user.username || b.clientName === user.name);
  
  // Group messages by vendor for the chat hub
  const chatThreads = useMemo(() => {
    const groups: Record<string, { vendor: Vendor, messages: Message[], lastMessage: Message }> = {};
    messages.forEach(m => {
      const vendorId = m.senderId === 'client' ? m.receiverId : m.senderId;
      const vendor = vendors.find(v => v.id === vendorId);
      if (vendor) {
        if (!groups[vendorId]) {
          groups[vendorId] = { vendor, messages: [], lastMessage: m };
        }
        groups[vendorId].messages.push(m);
        if (new Date(m.timestamp) > new Date(groups[vendorId].lastMessage.timestamp)) {
          groups[vendorId].lastMessage = m;
        }
      }
    });
    return Object.entries(groups).sort((a, b) => 
      new Date(b[1].lastMessage.timestamp).getTime() - new Date(a[1].lastMessage.timestamp).getTime()
    );
  }, [messages, vendors]);

  const subtotal = cart.reduce((sum, item) => sum + item.amount, 0);

  const NavItem = ({ id, icon: Icon, label, badge }: { id: typeof activeTab, icon: any, label: string, badge?: number }) => (
    <button 
      onClick={() => { setActiveTab(id); setIsSidebarOpen(false); }} 
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === id ? 'bg-[#D4AF37] text-black font-bold shadow-lg' : 'text-slate-500 hover:text-[#D4AF37] hover:bg-white/5'}`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-xs font-black uppercase tracking-widest">{label}</span>
      {!!badge && <span className="ml-auto bg-[#D4AF37] text-black text-[9px] font-black px-2 py-0.5 rounded-full">{badge}</span>}
    </button>
  );

  return (
    <div className="min-h-screen bg-black text-slate-100 flex flex-col md:flex-row overflow-hidden relative">
      {/* Mobile Header Toggle */}
      <div className="md:hidden bg-[#0a0a0a] border-b border-[#D4AF37]/10 p-4 flex justify-between items-center z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#D4AF37] rounded-lg flex items-center justify-center text-black font-bold font-[Cinzel]">P</div>
          <h2 className="text-[#D4AF37] font-bold font-[Cinzel] tracking-widest uppercase text-sm">Planner</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-[#D4AF37] p-2 bg-white/5 rounded-lg"><Menu className="w-5 h-5" /></button>
          <button onClick={onClose} className="text-slate-500 p-2"><X className="w-5 h-5" /></button>
        </div>
      </div>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-300"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#0a0a0a] border-r border-[#D4AF37]/10 flex flex-col transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 md:h-screen md:sticky md:top-0 shadow-2xl`}>
        <div className="p-8 border-b border-white/5 hidden md:block">
          <div>
            <h2 className="text-2xl font-bold font-[Cinzel] text-[#D4AF37] uppercase tracking-tighter">Planner</h2>
            <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.3em] mt-1">Client Station</p>
          </div>
        </div>
        
        <div className="p-6 flex items-center gap-4 bg-black/40 border-b border-white/5">
          <div className="w-10 h-10 rounded-full bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37] font-bold overflow-hidden border border-[#D4AF37]/20">
            {user.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" /> : user.name[0]}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">{user.name}</p>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest leading-none">Simcha Organizer</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <NavItem id="overview" icon={LayoutDashboard} label="Dashboard" />
          <NavItem id="plan" icon={ShoppingBag} label="My Plan" badge={cart.length > 0 ? cart.length : undefined} />
          <NavItem id="events" icon={Calendar} label="My Events" badge={clientBookings.filter(b => b.status === 'pending').length || undefined} />
          <NavItem id="chats" icon={MessageSquare} label="Chats" badge={messages.filter(m => m.receiverId === 'client' && !m.isRead).length || undefined} />
          <NavItem id="documents" icon={FileText} label="Documents" />
          <NavItem id="profile" icon={CheckCircle} label="Profile" />
        </nav>

        <div className="p-6 border-t border-white/5 bg-black">
          <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:text-red-500 transition-colors text-xs font-black uppercase tracking-widest">
            <LogOut className="w-5 h-5" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-[#050505] p-6 md:p-10">
        <header className="mb-10 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold font-[Cinzel] text-white capitalize tracking-tight">{activeTab}</h1>
            <p className="text-[#D4AF37]/60 text-[10px] font-black uppercase tracking-[0.4em] mt-1.5">Managing your celebrations</p>
          </div>
          <button onClick={onClose} className="text-[#D4AF37] hover:underline font-bold text-xs uppercase tracking-widest">Back to Marketplace</button>
        </header>

        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#111] p-6 rounded-3xl border border-white/5 shadow-2xl space-y-4">
                <div className="bg-[#D4AF37]/10 p-3 w-fit rounded-2xl"><ShoppingBag className="w-6 h-6 text-[#D4AF37]" /></div>
                <div><p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Items in Plan</p><h3 className="text-3xl font-bold text-white">{cart.length}</h3></div>
              </div>
              <div className="bg-[#111] p-6 rounded-3xl border border-white/5 shadow-2xl space-y-4">
                <div className="bg-green-500/10 p-3 w-fit rounded-2xl"><CheckCircle className="w-6 h-6 text-green-500" /></div>
                <div><p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Confirmed Events</p><h3 className="text-3xl font-bold text-white">{clientBookings.filter(b => b.status === 'confirmed').length}</h3></div>
              </div>
              <div className="bg-[#111] p-6 rounded-3xl border border-white/5 shadow-2xl space-y-4">
                <div className="bg-purple-500/10 p-3 w-fit rounded-2xl"><FileText className="w-6 h-6 text-purple-500" /></div>
                <div><p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Documents</p><h3 className="text-3xl font-bold text-white">{userFiles.length}</h3></div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-8 animate-in slide-in-from-bottom-5 duration-500">
            {/* Upload Section */}
            <div className="bg-[#111] rounded-3xl border border-[#D4AF37]/10 p-8 shadow-2xl">
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="flex-1 w-full space-y-4">
                  <h3 className="text-xl font-bold font-[Cinzel] text-white">Upload Document</h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">Contracts, Menus, Invoices, or Inspiration</p>
                  
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Notes (Optional)</label>
                    <textarea 
                      value={fileNotes}
                      onChange={(e) => setFileNotes(e.target.value)}
                      className="w-full bg-black border border-[#D4AF37]/30 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-[#D4AF37] h-24 resize-none"
                      placeholder="Add a note about this file..."
                    />
                  </div>
                </div>
                
                <div className="w-full md:w-64 flex flex-col gap-4">
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-xl hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl flex items-center justify-center gap-2"
                  >
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {isUploading ? 'Uploading...' : 'Select File'}
                  </button>
                  <p className="text-[8px] text-center text-slate-600 uppercase tracking-widest">Max size: 10MB</p>
                </div>
              </div>
            </div>

            {/* History / File List */}
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                  <History className="w-5 h-5 text-[#D4AF37]" />
                  <h3 className="text-xl font-bold font-[Cinzel] text-white">Document History</h3>
                </div>
                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input 
                    type="text"
                    value={fileSearch}
                    onChange={(e) => setFileSearch(e.target.value)}
                    placeholder="Search documents..."
                    className="w-full bg-[#111] border border-white/5 rounded-full pl-10 pr-4 py-2 text-xs text-white outline-none focus:border-[#D4AF37]/50"
                  />
                </div>
              </div>

              {filteredFiles.length === 0 ? (
                <div className="py-20 text-center bg-[#111] rounded-3xl border border-dashed border-white/10 opacity-30">
                  <FileText className="w-16 h-16 mx-auto mb-6 text-[#D4AF37]" />
                  <p className="text-xl font-[Cinzel]">No documents found.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {filteredFiles.map((file) => (
                    <div key={file.id} className="bg-[#111] border border-white/5 rounded-3xl p-6 hover:border-[#D4AF37]/30 transition-all group">
                      <div className="flex flex-col md:flex-row gap-6 items-start">
                        <div className="bg-black/40 p-4 rounded-2xl border border-white/5">
                          <FileText className="w-8 h-8 text-[#D4AF37]" />
                        </div>
                        
                        <div className="flex-1 space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="text-lg font-bold text-white font-[Cinzel]">{file.name}</h4>
                              <div className="flex items-center gap-4 text-[9px] text-slate-500 font-black uppercase tracking-widest mt-1">
                                <span>{formatFileSize(file.size)}</span>
                                <span>•</span>
                                <span>{new Date(file.timestamp).toLocaleDateString()}</span>
                                <span>•</span>
                                <span className="text-[#D4AF37]/60">{file.type}</span>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => handleFileDownload(file)}
                                className="p-2 bg-white/5 hover:bg-[#D4AF37] hover:text-black rounded-lg transition-all text-slate-400"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleFileDelete(file)}
                                className="p-2 bg-white/5 hover:bg-red-600 hover:text-white rounded-lg transition-all text-slate-400"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {file.notes && (
                            <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">User Note</p>
                              <p className="text-xs text-slate-300 italic">"{file.notes}"</p>
                            </div>
                          )}

                          {file.aiSummary && (
                            <div className="bg-[#D4AF37]/5 p-4 rounded-2xl border border-[#D4AF37]/10">
                              <div className="flex items-center gap-2 mb-2">
                                <PartyPopper className="w-3 h-3 text-[#D4AF37]" />
                                <p className="text-[9px] text-[#D4AF37] font-black uppercase tracking-widest">Simcha AI Summary</p>
                              </div>
                              <p className="text-xs text-slate-200 leading-relaxed">{file.aiSummary}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'plan' && (
          <div className="max-w-4xl animate-in slide-in-from-bottom-5 duration-500">
            {cart.length === 0 ? (
              <div className="text-center py-20 bg-[#111] rounded-3xl border border-dashed border-white/10 opacity-30">
                <ShoppingBag className="w-16 h-16 mx-auto mb-6 text-[#D4AF37]" />
                <p className="text-xl font-[Cinzel]">Your plan is empty.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {cart.map((item, index) => (
                  <div key={index} className="flex flex-col sm:flex-row gap-5 p-6 bg-[#111] rounded-3xl border border-[#D4AF37]/10 group transition-all items-center">
                    <img src={item.vendor.image} alt="" className="w-24 h-24 rounded-2xl object-cover border border-white/5" />
                    <div className="flex-1 min-w-0 text-center sm:text-left">
                      <h4 className="font-bold text-xl text-slate-100 font-[Cinzel]">{item.vendor.name}</h4>
                      <p className="text-[10px] text-[#D4AF37] font-black uppercase tracking-widest mt-1">{item.vendor.category}</p>
                      <div className="mt-3 flex flex-wrap justify-center sm:justify-start gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5" />{item.date}</div>
                        <div className="flex items-center gap-2 text-[#D4AF37]"><CreditCard className="w-3.5 h-3.5" />${item.amount.toLocaleString()}</div>
                      </div>
                    </div>
                    <button onClick={() => onRemoveFromCart(index)} className="p-3 bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white rounded-xl transition-all border border-red-500/20">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
                <div className="pt-8 border-t border-[#D4AF37]/20 mt-10">
                  <div className="flex justify-between items-center mb-8">
                    <span className="text-slate-400 font-black uppercase tracking-[0.2em] text-xs">Plan Subtotal</span>
                    <span className="text-4xl font-bold text-[#D4AF37] font-[Cinzel]">${subtotal.toLocaleString()}</span>
                  </div>
                  <button onClick={onProcessCart} className="w-full bg-[#D4AF37] text-black py-5 rounded-2xl font-black text-sm uppercase tracking-[0.3em] hover:bg-[#E5C76B] transition-all shadow-xl shadow-[#D4AF37]/10">
                    Send All Booking Requests
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'events' && (
          <div className="space-y-6 animate-in slide-in-from-bottom-5 duration-500">
            {clientBookings.length === 0 ? (
              <div className="py-20 text-center bg-[#111] rounded-3xl border border-dashed border-white/10 opacity-30">
                <Calendar className="w-16 h-16 mx-auto mb-6 text-[#D4AF37]" />
                <p className="text-xl font-[Cinzel]">No active reservations.</p>
              </div>
            ) : clientBookings.map((booking) => {
              const vendor = vendors.find(v => v.id === booking.vendorId);
              if (!vendor) return null;
              const countdown = getCountdown(booking.date);
              return (
                <div key={booking.id} className="bg-[#111] border border-[#D4AF37]/10 rounded-3xl p-8 flex flex-col md:flex-row gap-8 items-center group">
                  <img src={vendor.image} className="w-28 h-28 rounded-2xl object-cover border border-white/5" alt="" />
                  <div className="flex-1 text-center md:text-left">
                    <div className="flex flex-wrap justify-center md:justify-start gap-2 mb-4">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${booking.status === 'confirmed' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/20'}`}>{booking.status}</span>
                      {booking.paymentStatus === 'paid' && <span className="bg-blue-500/10 text-blue-500 border border-blue-500/20 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">Paid</span>}
                      {countdown && (
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${countdown.isToday ? 'bg-[#D4AF37] text-white border-[#D4AF37]' : 'text-[#D4AF37] border-[#D4AF37]/20'}`}>
                          {countdown.text}
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-2xl text-slate-100 font-[Cinzel] group-hover:text-[#D4AF37] transition-colors">{vendor.name}</h3>
                    <p className="text-slate-400 text-sm font-medium mt-2 flex items-center justify-center md:justify-start gap-2">
                      <Calendar className="w-4 h-4 text-[#D4AF37]/40" /> {booking.date} • {booking.eventName}
                    </p>
                  </div>
                  <div className="text-center md:text-right min-w-[200px]">
                    <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Service Fee</p>
                    <p className="text-3xl font-bold text-[#D4AF37]">${booking.amount.toLocaleString()}</p>
                    {booking.status === 'confirmed' && booking.paymentStatus === 'pending' && (
                      <div className="flex flex-col gap-3 mt-6">
                        <PayPalButton amount={booking.amount} onSuccess={() => onPaymentSuccess(booking.id, 'PayPal')} />
                        {(vendor.stripeConnected || vendor.stripeAccountId) && (
                          <button 
                            onClick={() => handlePay(
                              booking.id, 
                              booking.vendorId, 
                              booking.amount
                            )}
                            disabled={isProcessingPayment}
                            className="bg-black hover:bg-slate-900 text-white font-bold px-4 py-3 rounded-full shadow-sm flex items-center justify-center gap-2 transition-colors text-sm border border-slate-700 w-full"
                          >
                            {isProcessingPayment ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CreditCard className="w-4 h-4" />
                            )}
                            Pay with Card
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'chats' && (
          <div className="flex flex-col lg:flex-row bg-[#111] rounded-3xl border border-white/5 shadow-2xl overflow-hidden min-h-[500px] animate-in fade-in duration-500">
             {/* Thread List */}
             <div className="w-full lg:w-80 border-r border-white/5 bg-black/20 overflow-y-auto">
                <div className="p-6 border-b border-white/5 bg-black/40">
                  <h3 className="text-xs font-black text-[#D4AF37] uppercase tracking-widest">Conversations</h3>
                </div>
                {chatThreads.length === 0 ? (
                  <div className="p-10 text-center opacity-20">
                    <MessageSquare className="w-10 h-10 mx-auto mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No Active Chats</p>
                  </div>
                ) : chatThreads.map(([vendorId, data]) => (
                  <button 
                    key={vendorId}
                    onClick={() => setSelectedThreadVendorId(vendorId)}
                    className={`w-full p-6 text-left border-b border-white/5 transition-all hover:bg-white/5 ${selectedThreadVendorId === vendorId ? 'bg-[#D4AF37]/5 border-l-4 border-l-[#D4AF37]' : ''}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-white text-sm truncate">{data.vendor.name}</span>
                      <span className="text-[8px] text-slate-500">{new Date(data.lastMessage.timestamp).toLocaleDateString()}</span>
                    </div>
                    <p className="text-[10px] text-[#D4AF37] uppercase tracking-widest truncate mb-2">{data.vendor.category}</p>
                    <p className="text-xs text-slate-400 line-clamp-1 italic">"{data.lastMessage.text}"</p>
                  </button>
                ))}
             </div>

             {/* Chat Pane */}
             <div className="flex-1 flex flex-col bg-black/40">
                {selectedThreadVendorId ? (
                  <>
                    <div className="p-6 border-b border-white/5 bg-black/40 flex items-center justify-between">
                       <div className="flex items-center gap-3">
                          <img src={vendors.find(v => v.id === selectedThreadVendorId)?.image} className="w-10 h-10 rounded-full object-cover border border-[#D4AF37]/30" alt="" />
                          <div>
                              <h4 className="font-bold text-white">{vendors.find(v => v.id === selectedThreadVendorId)?.name}</h4>
                              <p className="text-[10px] text-[#D4AF37] uppercase tracking-widest">{vendors.find(v => v.id === selectedThreadVendorId)?.category}</p>
                          </div>
                       </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 space-y-6">
                      {chatThreads.find(t => t[0] === selectedThreadVendorId)?.[1].messages.sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).map(m => (
                        <div key={m.id} className={`flex ${m.senderId === 'client' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[75%] p-4 rounded-2xl ${m.senderId === 'client' ? 'bg-[#D4AF37] text-black rounded-tr-none' : 'bg-[#1a1a1a] text-slate-200 border border-white/5 rounded-tl-none'}`}>
                             <p className="text-sm">{m.text}</p>
                             <span className={`text-[8px] block mt-2 opacity-50 ${m.senderId === 'client' ? 'text-black' : 'text-slate-500'}`}>
                               {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                             </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="p-6 bg-black/40 border-t border-white/5 italic text-[10px] text-slate-500 text-center">
                       Replying to vendors is currently available via the Vendor cards in the Marketplace.
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-10 opacity-20">
                    <MessageSquare className="w-16 h-16 mb-4" />
                    <p className="text-sm font-[Cinzel] uppercase tracking-widest">Select a professional to view history</p>
                  </div>
                )}
             </div>
          </div>
        )}
        {activeTab === 'profile' && (
          <div className="max-w-2xl animate-in fade-in duration-500">
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
                        className="p-3 bg-red-600 text-white rounded-full shadow-xl hover:scale-110 transition-transform"
                        title="Remove Photo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-2xl font-bold text-white font-[Cinzel]">{user.name}</h3>
                  <p className="text-slate-500 text-xs uppercase tracking-widest">{user.username}</p>
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
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
                    className="w-full bg-[#D4AF37] text-black font-black py-4 rounded-xl hover:bg-[#E5C76B] transition-all uppercase tracking-[0.2em] text-xs shadow-xl"
                  >
                    Save Profile Info
                  </button>
                  
                  <div className="pt-8 border-t border-white/5">
                    <button 
                      onClick={onDeleteAccount}
                      className="w-full bg-red-600/10 text-red-500 border border-red-500/20 font-black py-4 rounded-xl hover:bg-red-600 hover:text-white transition-all uppercase tracking-[0.2em] text-xs"
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
    </div>
  );
};

export default ClientPortal;