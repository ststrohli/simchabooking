import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Plus, Image as ImageIcon, MapPin, DollarSign, LayoutList, ArrowLeft, LogOut, Lock, Trash2, Search, Settings, User, Key, Upload, Tag, X, CheckSquare, Square, Film, Play, Loader2, BarChart3, Wallet, LogIn, Edit2, ChevronDown, ChevronRight, MessageSquare, Camera, FolderPlus, ListTree, Layers, CreditCard, Bot, Volume2, Send } from 'lucide-react';
import { auth, db, storage } from '../services/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Vendor, VendorCategory, Post, Booking, UserAccount, Message } from '../types';

interface AdminPanelProps {
  vendors: Vendor[];
  posts: Post[];
  bookings: Booking[];
  users: UserAccount[];
  messages: Message[];
  onAddVendor: (vendor: Vendor) => void;
  onUpdateVendor: (vendor: Vendor) => void;
  onRemoveVendor: (id: string) => void;
  onToggleVerify: (id: string) => void;
  onUpdateBookingStatus: (id: string, status: Booking['status']) => void;
  onLoginAsVendor: (id: string) => void;
  onAddPost: (post: Post) => void;
  onRemovePost: (id: string) => void;
  onBack: () => void;
  categoryImages: Record<string, string>;
  onUpdateCategoryImage: (category: string, url: string) => void;
  categories: string[];
  onAddCategory: (name: string, image: string, subCats: string[]) => void;
  categorySubCategories: Record<string, Record<string, string[]>>;
  onUpdateCategorySubCategories: (category: string, subCategories: Record<string, string[]>) => void;
  heroBackgroundUrl: string;
  onUpdateHeroBackground: (url: string) => void;
  onSendMessage: (payload: Partial<Message>) => void;
  showNotification: (message: string, type?: 'success' | 'info') => void;
}

const ADMIN_CODE = "ss-77859";
const COMMISSION_RATE = 0.10;

const AdminPanel: React.FC<AdminPanelProps> = ({ 
    vendors, posts, bookings, users, messages, onAddVendor, onUpdateVendor, onRemoveVendor, onToggleVerify, onUpdateBookingStatus, onLoginAsVendor, onAddPost, onRemovePost, onBack, categoryImages, onUpdateCategoryImage, categories, onAddCategory, categorySubCategories, onUpdateCategorySubCategories, heroBackgroundUrl, onUpdateHeroBackground, onSendMessage, showNotification
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'add' | 'manage' | 'posts' | 'categories' | 'bookings' | 'stripe' | 'users' | 'messages'>('manage');
  const [isUploading, setIsUploading] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [selectedPostFile, setSelectedPostFile] = useState<File | null>(null);
  const [selectedVendorFile, setSelectedVendorFile] = useState<File | null>(null);
  const [selectedCategoryFile, setSelectedCategoryFile] = useState<File | null>(null);
  const [selectedHeroFile, setSelectedHeroFile] = useState<File | null>(null);
  
  const postFileInputRef = useRef<HTMLInputElement>(null);
  const vendorFileInputRef = useRef<HTMLInputElement>(null);
  const categoryImageInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const newCatImageInputRef = useRef<HTMLInputElement>(null);
  const heroImageInputRef = useRef<HTMLInputElement>(null);

  const [postForm, setPostForm] = useState({
    title: '',
    description: '',
    type: 'image' as 'image' | 'video',
    url: '',
    vendorId: ''
  });

  const [newSubCategoryInputs, setNewSubCategoryInputs] = useState<Record<string, string>>({});
  const [newNestedSubCategoryInputs, setNewNestedSubCategoryInputs] = useState<Record<string, string>>({});

  const [newCategoryForm, setNewCategoryForm] = useState({
    name: '',
    image: '',
    subCatsString: '' // comma separated
  });

  const [formData, setFormData] = useState({
    name: '', 
    category: categories[0] || 'Catering', 
    subCategories: [] as string[], 
    description: '', 
    priceStart: '', 
    location: '', 
    image: '', 
    isKosher: false, 
    isVerified: false, 
    username: '', 
    password: '',
    commissionRate: '5',
    contactEmail: ''
  });

  const [onboardingVendorId, setOnboardingVendorId] = useState<string | null>(null);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [selectedInquiryEmail, setSelectedInquiryEmail] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedInquiryEmail) return;
    
    const lastMsg = messages.find(m => m.clientEmail === selectedInquiryEmail && m.isAdminInquiry);
    
    onSendMessage({
        text: replyText,
        receiverId: 'client', // In this context, receiver is the client
        clientEmail: selectedInquiryEmail,
        clientName: lastMsg?.clientName || 'Client',
        senderId: 'admin',
        isAdminInquiry: true,
        type: 'text'
    });
    
    setReplyText('');
  };

  useEffect(() => {
    // Reset sub-selections when primary category changes
    setFormData(prev => ({ ...prev, subCategories: [] }));
  }, [formData.category]);

  const totalPaidVolume = bookings
    .filter(b => b.paymentStatus === 'paid')
    .reduce((sum, b) => sum + b.amount, 0);
    
  const totalCommission = bookings
    .filter(b => b.paymentStatus === 'paid')
    .reduce((sum, b) => {
      const vendor = vendors.find(v => v.id === b.vendorId);
      const rate = vendor?.commissionRate || 5;
      return sum + (b.amount * (rate / 100));
    }, 0);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessCode === ADMIN_CODE) { setIsAuthenticated(true); setError(''); }
    else setError('Invalid Access Code');
  };

  const uploadFile = async (file: File, path: string): Promise<string> => {
    const storageRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  const handleVendorFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedVendorFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setFormData(prev => ({ ...prev, image: e.target?.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleVendorSubmit = async (e: React.FormEvent, triggerOnboarding = false) => {
    e.preventDefault();
    setIsUploading(true);
    try {
      let imageUrl = formData.image || 'https://picsum.photos/800/600';
      if (selectedVendorFile) {
        imageUrl = await uploadFile(selectedVendorFile, 'vendors');
      }

      const vendorId = editingVendor ? editingVendor.id : Math.random().toString(36).substr(2, 9);
      const newVendor: Vendor = {
        ...formData,
        id: vendorId, 
        image: imageUrl, 
        priceStart: Number(formData.priceStart),
        rating: editingVendor ? editingVendor.rating : 5.0, 
        password: formData.password || '123', 
        unavailableDates: editingVendor ? editingVendor.unavailableDates : [], 
        reviews: editingVendor ? editingVendor.reviews : [], 
        services: editingVendor ? editingVendor.services : [], 
        paymentMethods: editingVendor ? editingVendor.paymentMethods : ['Check', 'Cash'],
        commissionRate: Number(formData.commissionRate) || 5,
        stripeConnected: editingVendor ? editingVendor.stripeConnected : false,
        stripeAccountId: editingVendor ? editingVendor.stripeAccountId : undefined
      };

      if (editingVendor) {
        onUpdateVendor(newVendor);
        showNotification('Professional profile updated!');
        setEditingVendor(null);
      } else {
        onAddVendor(newVendor);
        showNotification('New professional added!');
      }

      if (triggerOnboarding) {
        await handleStripeOnboard(vendorId, formData.contactEmail);
      }

      setFormData({ 
        name: '', 
        category: categories[0] || 'Catering', 
        subCategories: [], 
        description: '', 
        priceStart: '', 
        location: '', 
        image: '', 
        isKosher: false, 
        isVerified: false, 
        username: '', 
        password: '',
        commissionRate: '5',
        contactEmail: ''
      });
      setSelectedVendorFile(null);
      setActiveTab('manage');
    } catch (err) {
      showNotification("Failed to save vendor.", 'info');
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditVendor = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setFormData({
      name: vendor.name,
      category: vendor.category,
      subCategories: vendor.subCategories || [],
      description: vendor.description,
      priceStart: vendor.priceStart.toString(),
      location: vendor.location,
      image: vendor.image,
      isKosher: vendor.isKosher || false,
      isVerified: vendor.isVerified || false,
      username: vendor.username || '',
      password: vendor.password || '',
      commissionRate: (vendor.commissionRate || 5).toString(),
      contactEmail: vendor.contactEmail || ''
    });
    setActiveTab('add');
  };

  const handleStripeOnboard = async (vendorId: string, email: string) => {
    setIsOnboarding(true);
    try {
      const response = await fetch('/api/stripe/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, email }),
      });
      const data = await response.json();
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error(data.error || "Failed to get onboarding URL");
      }
    } catch (err: any) {
      showNotification(err.message || "Stripe onboarding failed.", 'info');
    } finally {
      setIsOnboarding(false);
    }
  };

  const handleManualStripeId = async (vendorId: string) => {
    const stripeId = prompt("Enter the Stripe Account ID (e.g., acct_...) for this vendor:");
    if (!stripeId || !stripeId.startsWith('acct_')) {
        if (stripeId) showNotification("Invalid Stripe Account ID format.", 'info');
        return;
    }

    try {
        const response = await fetch('/api/stripe/force-connect-db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vendorId, stripeAccountId: stripeId }),
        });
        const data = await response.json();
        if (data.status === 'ok') {
            showNotification("Stripe ID updated successfully!", 'success');
            // Update local state if needed, though Firestore listener in App.tsx should handle it
        } else {
            throw new Error(data.error || "Failed to update Stripe ID");
        }
    } catch (err: any) {
        showNotification(err.message || "Failed to update Stripe ID.", 'info');
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) { 
      showNotification("Please upload an image or video file.", 'info'); 
      return; 
    }

    setSelectedPostFile(file);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setPostForm(prev => ({ 
        ...prev, 
        url: base64, 
        type: isVideo ? 'video' : 'image' 
      }));
    };

    reader.readAsDataURL(file);
  };

  const handleCategoryImageUpload = async (category: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadFile(file, 'categories');
      onUpdateCategoryImage(category, url);
    } catch (err) {
      showNotification("Failed to upload category image.", 'info');
    } finally {
      setIsUploading(false);
    }
  };

  const handleNewCategoryImgUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedCategoryFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setNewCategoryForm(prev => ({ ...prev, image: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const handleHeroBackgroundUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const url = await uploadFile(file, 'hero');
      onUpdateHeroBackground(url);
    } catch (err) {
      showNotification("Failed to upload hero background.", 'info');
    } finally {
      setIsUploading(false);
    }
  };

  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPostFile && !postForm.url) { 
      showNotification("Please select an image or video to upload.", 'info'); 
      return; 
    }
    
    setIsUploading(true);
    try {
      let finalUrl = postForm.url;
      if (selectedPostFile) {
        finalUrl = await uploadFile(selectedPostFile, 'posts');
      }

      const newPost: Post = {
        id: Math.random().toString(36).substr(2, 9),
        type: postForm.type,
        url: finalUrl,
        title: postForm.title || "Community Moment",
        description: postForm.description,
        timestamp: new Date().toISOString(),
        ...(postForm.vendorId ? { vendorId: postForm.vendorId } : {})
      };

      onAddPost(newPost);
      setPostForm({ title: '', description: '', type: 'image', url: '', vendorId: '' });
      setSelectedPostFile(null);
      if (postFileInputRef.current) postFileInputRef.current.value = "";
    } catch (err) {
      showNotification("Failed to publish post.", 'info');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryForm.name.trim()) return;
    
    setIsUploading(true);
    try {
      let imageUrl = newCategoryForm.image || 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&q=80&w=600';
      if (selectedCategoryFile) {
        imageUrl = await uploadFile(selectedCategoryFile, 'categories');
      }

      const subCats = newCategoryForm.subCatsString
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      const defaultSubs: Record<string, string[]> = {};
      subCats.forEach(sc => defaultSubs[sc] = []);

      onAddCategory(newCategoryForm.name.trim(), imageUrl, []);
      onUpdateCategorySubCategories(newCategoryForm.name.trim(), defaultSubs);
      
      setNewCategoryForm({ name: '', image: '', subCatsString: '' });
      setSelectedCategoryFile(null);
      if (newCatImageInputRef.current) newCatImageInputRef.current.value = "";
    } catch (err) {
      showNotification("Failed to add category.", 'info');
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddSubCategory = (category: string) => {
    const newSub = newSubCategoryInputs[category];
    if (!newSub?.trim()) return;
    const currentSubs = categorySubCategories[category] || {};
    if (currentSubs[newSub.trim()]) { showNotification("Classification group already exists!", 'info'); return; }
    
    onUpdateCategorySubCategories(category, { 
      ...currentSubs, 
      [newSub.trim()]: [] 
    });
    setNewSubCategoryInputs(prev => ({ ...prev, [category]: '' }));
  };

  const handleRemoveSubCategory = (category: string, sub: string) => {
    const currentSubs = { ...categorySubCategories[category] };
    delete currentSubs[sub];
    onUpdateCategorySubCategories(category, currentSubs);
  };

  const handleAddNestedSubCategory = (category: string, sub: string) => {
    const key = `${category}-${sub}`;
    const newNested = newNestedSubCategoryInputs[key];
    if (!newNested?.trim()) return;
    
    const currentSubs = { ...categorySubCategories[category] };
    const nestedList = currentSubs[sub] || [];
    
    if (nestedList.includes(newNested.trim())) { showNotification("Option already exists!", 'info'); return; }
    
    currentSubs[sub] = [...nestedList, newNested.trim()];
    onUpdateCategorySubCategories(category, currentSubs);
    setNewNestedSubCategoryInputs(prev => ({ ...prev, [key]: '' }));
  };

  const handleRemoveNestedSubCategory = (category: string, sub: string, nested: string) => {
    const currentSubs = { ...categorySubCategories[category] };
    currentSubs[sub] = (currentSubs[sub] || []).filter(n => n !== nested);
    onUpdateCategorySubCategories(category, currentSubs);
  };

  const toggleSubCategorySelection = (sub: string) => {
    setFormData(prev => ({
      ...prev,
      subCategories: prev.subCategories.includes(sub)
        ? prev.subCategories.filter(s => s !== sub)
        : [...prev.subCategories, sub]
    }));
  };

  const handleDeleteVendor = (id: string, name: string) => {
    onRemoveVendor(id);
  };

  const inputClass = "w-full bg-black border border-[#D4AF37]/20 rounded-lg px-4 py-2.5 text-white focus:ring-2 focus:ring-[#D4AF37] outline-none transition-all placeholder:text-slate-600";
  const labelClass = "block text-[10px] font-bold text-[#D4AF37]/70 uppercase tracking-widest mb-1.5";

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-[#111] rounded-2xl p-8 max-w-md w-full shadow-2xl border border-[#D4AF37]/20">
          <div className="text-center mb-8">
            <div className="bg-black w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[#D4AF37]/30">
              <ShieldCheck className="w-8 h-8 text-[#D4AF37]" />
            </div>
            <h2 className="text-2xl font-bold font-[Cinzel] text-[#D4AF37]">Admin Access</h2>
            <p className="text-slate-500 text-sm">System Restricted Area</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className={labelClass}>Access Code</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
                <input type="password" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} placeholder="Enter code" className={inputClass + " pl-10"} />
              </div>
              {error && <p className="text-red-500 text-xs mt-2 font-bold">{error}</p>}
            </div>
            <button type="submit" className="w-full bg-[#D4AF37] text-black font-bold py-3 rounded-lg hover:bg-[#E5C76B] transition-all shadow-lg mt-2">Unlock Panel</button>
            <button type="button" onClick={onBack} className="w-full text-slate-500 text-xs font-bold py-2 hover:text-[#D4AF37] transition-colors uppercase tracking-widest">Back to Marketplace</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-slate-100">
      <header className="bg-black border-b border-[#D4AF37]/20 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
             <div className="bg-[#111] p-2 rounded-lg border border-[#D4AF37]/20"><ShieldCheck className="w-6 h-6 text-[#D4AF37]" /></div>
             <div><h1 className="text-xl font-bold font-[Cinzel] text-[#D4AF37]">Simcha Admin</h1><p className="text-[10px] text-slate-500 uppercase tracking-widest">Platform Management</p></div>
          </div>
          <div className="flex gap-6">
            <button onClick={onBack} className="text-slate-400 hover:text-[#D4AF37] font-bold text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"><ArrowLeft className="w-4 h-4" /> Marketplace</button>
            <button onClick={() => setIsAuthenticated(false)} className="text-red-500 hover:text-red-400 font-bold text-xs uppercase tracking-widest flex items-center gap-2 transition-colors"><LogOut className="w-4 h-4" /> Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12">
        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            <div className="bg-[#111] p-6 rounded-2xl border border-[#D4AF37]/10 shadow-xl">
                <p className="text-[10px] font-black text-[#D4AF37]/60 uppercase tracking-widest mb-2">Total Volume</p>
                <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-bold text-white">${totalPaidVolume.toLocaleString()}</h3>
                    <BarChart3 className="w-8 h-8 text-[#D4AF37]/20" />
                </div>
            </div>
            <div className="bg-[#111] p-6 rounded-2xl border border-[#D4AF37]/10 shadow-xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-[#D4AF37]/5 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110"></div>
                <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest mb-2">Platform Revenue (Dynamic)</p>
                <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-bold text-[#D4AF37]">${totalCommission.toLocaleString()}</h3>
                    <Wallet className="w-8 h-8 text-[#D4AF37]/40" />
                </div>
            </div>
            <div className="bg-[#111] p-6 rounded-2xl border border-[#D4AF37]/10 shadow-xl">
                <p className="text-[10px] font-black text-[#D4AF37]/60 uppercase tracking-widest mb-2">Active Professionals</p>
                <div className="flex items-center justify-between">
                    <h3 className="text-3xl font-bold text-white">{vendors.length}</h3>
                    <User className="w-8 h-8 text-[#D4AF37]/20" />
                </div>
            </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-10 overflow-x-auto pb-2">
            <div className="bg-[#111] p-1 rounded-xl border border-[#D4AF37]/20 flex shrink-0">
                {['add', 'manage', 'bookings', 'messages', 'stripe', 'users', 'posts', 'categories'].map(tab => (
                    <button 
                        key={tab} 
                        onClick={() => {
                            setActiveTab(tab as any);
                            if (tab !== 'add') setEditingVendor(null);
                        }} 
                        className={`px-8 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-[#D4AF37] text-black shadow-lg' : 'text-slate-500 hover:text-white'}`}
                    >
                        {tab === 'add' ? (editingVendor ? 'Edit Professional' : 'Add Professional') : tab === 'manage' ? 'Professionals' : tab}
                    </button>
                ))}
            </div>
        </div>

        {activeTab === 'add' && (
            <div className="bg-[#111] rounded-2xl border border-[#D4AF37]/10 shadow-2xl max-w-4xl mx-auto animate-in fade-in duration-300">
                <div className="bg-black p-6 border-b border-[#D4AF37]/20 flex items-center justify-between">
                    <div><h2 className="text-xl font-bold text-[#D4AF37] font-[Cinzel]">New Professional</h2><p className="text-slate-500 text-xs">Invite a new service provider to the platform.</p></div>
                    <Plus className="w-8 h-8 text-[#D4AF37]/20" />
                </div>
                <form onSubmit={handleVendorSubmit} className="p-8 space-y-10">
                    <div className="space-y-6">
                        <h3 className="text-xs font-black text-[#D4AF37] uppercase tracking-[0.2em] border-b border-[#D4AF37]/10 pb-2 flex items-center gap-2"><User className="w-4 h-4" /> Business Identity</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div><label className={labelClass}>Business Name</label><input required type="text" className={inputClass} value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} /></div>
                                <div><label className={labelClass}>Contact Email</label><input required type="email" className={inputClass} value={formData.contactEmail} onChange={(e) => setFormData({...formData, contactEmail: e.target.value})} placeholder="professional@example.com" /></div>
                                <div><label className={labelClass}>Primary Category</label><select className={inputClass + " bg-black"} value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})}>{categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select></div>
                            </div>
                            <div className="space-y-4">
                                <label className={labelClass}>Business Profile Image</label>
                                <div onClick={() => vendorFileInputRef.current?.click()} className="h-44 bg-black border-2 border-dashed border-[#D4AF37]/20 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-[#D4AF37]/50 transition-all overflow-hidden relative">
                                    {formData.image ? <img src={formData.image} className="w-full h-full object-cover" /> : <div className="text-center p-4"><ImageIcon className="w-8 h-8 text-[#D4AF37]/30 mx-auto mb-2" /><p className="text-slate-600 font-bold uppercase tracking-widest text-[9px]">Select Image</p></div>}
                                </div>
                                <input type="file" accept="image/*" className="hidden" ref={vendorFileInputRef} onChange={handleVendorFileUpload} />
                            </div>
                        </div>
                        <div><label className={labelClass}>Elevator Pitch / Description</label><textarea required rows={4} className={inputClass + " resize-none"} value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} /></div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-xs font-black text-[#D4AF37] uppercase tracking-[0.2em] border-b border-[#D4AF37]/10 pb-2 flex items-center gap-2"><Tag className="w-4 h-4" /> Detailed Classification</h3>
                        <div className="grid grid-cols-1 gap-8">
                            {Object.entries(categorySubCategories[formData.category] || {}).map(([classification, options]) => (
                                <div key={classification} className="space-y-3 bg-black/30 p-5 rounded-xl border border-white/5">
                                    <h4 className="text-[10px] font-black text-[#D4AF37]/60 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <ChevronRight className="w-3 h-3" /> {classification}
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {(options as string[]).map(option => (
                                            <button
                                                key={option}
                                                type="button"
                                                onClick={() => toggleSubCategorySelection(option)}
                                                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border ${
                                                    formData.subCategories.includes(option)
                                                        ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                                                        : 'bg-black text-slate-400 border-white/10 hover:border-[#D4AF37]/50'
                                                }`}
                                            >
                                                {option}
                                            </button>
                                        ))}
                                        {(options as string[]).length === 0 && <p className="text-[9px] text-slate-700 italic">No specific options defined yet.</p>}
                                    </div>
                                </div>
                            ))}
                            {Object.keys(categorySubCategories[formData.category] || {}).length === 0 && (
                                <div className="py-6 bg-black/40 rounded-xl border border-dashed border-[#D4AF37]/10 text-center">
                                    <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">No detailed classifications defined for {formData.category}</p>
                                    <button type="button" onClick={() => setActiveTab('categories')} className="text-[9px] text-[#D4AF37] hover:underline mt-2 uppercase tracking-widest">Configure Taxonomy</button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-xs font-black text-[#D4AF37] uppercase tracking-[0.2em] border-b border-[#D4AF37]/10 pb-2 flex items-center gap-2"><DollarSign className="w-4 h-4" /> Financial Terms</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className={labelClass}>Commission Percentage (%)</label>
                                <div className="relative">
                                    <Tag className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" />
                                    <input required type="number" min="0" max="100" className={inputClass + " pl-10"} value={formData.commissionRate} onChange={(e) => setFormData({...formData, commissionRate: e.target.value})} />
                                </div>
                                <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mt-2">The percentage of each sale that goes to the platform.</p>
                            </div>
                            <div>
                                <label className={labelClass}>Starting Fee ($)</label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" />
                                    <input required type="number" className={inputClass + " pl-10"} value={formData.priceStart} onChange={(e) => setFormData({...formData, priceStart: e.target.value})} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-xs font-black text-[#D4AF37] uppercase tracking-[0.2em] border-b border-[#D4AF37]/10 pb-2 flex items-center gap-2"><MapPin className="w-4 h-4" /> Logistics</h3>
                        <div className="grid grid-cols-1 gap-6">
                            <div><label className={labelClass}>Location (City, State)</label><input required type="text" className={inputClass} value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} /></div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h3 className="text-xs font-black text-[#D4AF37] uppercase tracking-[0.2em] border-b border-[#D4AF37]/10 pb-2 flex items-center gap-2"><Key className="w-4 h-4" /> Credential Configuration</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="relative">
                                <label className={labelClass}>Portal Username</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" />
                                    <input required type="text" className={inputClass + " pl-10"} placeholder="e.g. janes_catering" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} />
                                </div>
                            </div>
                            <div className="relative">
                                <label className={labelClass}>Portal Password</label>
                                <div className="relative">
                                    <Key className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]/50" />
                                    <input required type="text" className={inputClass + " pl-10"} placeholder="Temporary password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <button type="submit" disabled={isUploading || isOnboarding} className="w-full bg-black text-[#D4AF37] border border-[#D4AF37] font-bold py-4 rounded-xl hover:bg-[#D4AF37]/10 transition-all shadow-xl font-[Cinzel] text-lg uppercase tracking-widest disabled:opacity-50">
                            {editingVendor ? 'Update Professional' : 'Save Professional'}
                        </button>
                        {!editingVendor && (
                            <button type="button" onClick={(e) => handleVendorSubmit(e as any, true)} disabled={isUploading || isOnboarding} className="w-full bg-[#D4AF37] text-black font-bold py-4 rounded-xl hover:bg-[#E5C76B] transition-all shadow-xl font-[Cinzel] text-lg uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50">
                                {isOnboarding ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                                Save & Start Stripe Onboarding
                            </button>
                        )}
                    </div>
                </form>
            </div>
        )}

        {activeTab === 'manage' && (
            <div className="space-y-4 animate-in fade-in duration-300">
                <div className="bg-[#111] p-4 rounded-xl border border-white/5 flex items-center gap-4 mb-6">
                    <Search className="w-5 h-5 text-slate-500" />
                    <input type="text" placeholder="Filter active professionals..." className="bg-transparent border-none outline-none text-sm w-full" />
                </div>
                {vendors.map(v => (
                    <div key={v.id} className="bg-[#111] p-5 rounded-xl border border-[#D4AF37]/10 flex flex-col md:flex-row items-center justify-between group hover:border-[#D4AF37]/40 transition-all gap-4">
                        <div className="flex items-center gap-4 w-full md:w-1/3">
                            <img src={v.image} className="w-14 h-14 rounded-lg object-cover bg-black border border-[#D4AF37]/10" />
                            <div className="min-w-0">
                                <h3 className="font-bold text-slate-100 truncate">{v.name}</h3>
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest">{v.category}</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                            {v.subCategories?.slice(0, 3).map(s => (
                                <span key={s} className="bg-white/5 px-2 py-0.5 rounded text-[8px] font-black uppercase text-slate-500 tracking-widest">{s}</span>
                            ))}
                            {(v.subCategories?.length || 0) > 3 && <span className="text-[8px] text-slate-600 font-bold">+{v.subCategories!.length - 3} more</span>}
                        </div>
                        <div className="flex items-center gap-2">
                            {v.stripeAccountId ? (
                                <div className="flex items-center gap-1 bg-green-500/10 px-2 py-1 rounded border border-green-500/20" title="Stripe Connected">
                                    <CheckSquare className="w-3 h-3 text-green-500" />
                                    <span className="text-[8px] font-black text-green-500 uppercase tracking-widest">Stripe</span>
                                </div>
                            ) : (
                                <button onClick={() => handleStripeOnboard(v.id, v.contactEmail || '')} className="flex items-center gap-1 bg-red-500/10 px-2 py-1 rounded border border-red-500/20 hover:bg-red-500/20 transition-all" title="Connect Stripe">
                                    <CreditCard className="w-3 h-3 text-red-500" />
                                    <span className="text-[8px] font-black text-red-500 uppercase tracking-widest">Connect</span>
                                </button>
                            )}
                            <button onClick={() => onLoginAsVendor(v.id)} title="Login to Portal" className="p-2 text-slate-600 hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-all"><LogIn className="w-5 h-5" /></button>
                            <button onClick={() => handleEditVendor(v)} title="Edit Professional" className="p-2 text-slate-600 hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-all"><Edit2 className="w-5 h-5" /></button>
                            <button onClick={() => onToggleVerify(v.id)} title="Toggle Verification" className={`p-2 rounded-lg transition-all ${v.isVerified ? 'text-green-500 hover:bg-green-500/10' : 'text-slate-600 hover:text-[#D4AF37]'}`}><ShieldCheck className="w-5 h-5" /></button>
                            <button onClick={() => handleDeleteVendor(v.id, v.name)} title="Remove Professional" className="p-2 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"><Trash2 className="w-5 h-5" /></button>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {activeTab === 'posts' && (
            <div className="space-y-12 max-w-5xl mx-auto animate-in fade-in duration-300">
                <div className="bg-[#111] rounded-2xl border border-[#D4AF37]/10 shadow-2xl overflow-hidden">
                    <div className="bg-black p-6 border-b border-[#D4AF37]/20 flex items-center justify-between">
                        <div><h2 className="text-xl font-bold text-[#D4AF37] font-[Cinzel]">Moment Publisher</h2><p className="text-slate-500 text-xs">Establish new visual highlights.</p></div>
                        <Camera className="w-8 h-8 text-[#D4AF37]/20" />
                    </div>
                    <form onSubmit={handlePostSubmit} className="p-8 space-y-8">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <div><label className={labelClass}>Visual Title</label><input required type="text" className={inputClass} value={postForm.title} onChange={(e) => setPostForm({...postForm, title: e.target.value})} placeholder="e.g. Brooklyn Gala" /></div>
                                <div><label className={labelClass}>Brief Context</label><textarea required rows={4} className={inputClass + " resize-none"} value={postForm.description} onChange={(e) => setPostForm({...postForm, description: e.target.value})} placeholder="Contextual description..." /></div>
                                <div>
                                    <label className={labelClass}>Associate Professional</label>
                                    <select className={inputClass + " bg-black"} value={postForm.vendorId} onChange={(e) => setPostForm({...postForm, vendorId: e.target.value})}>
                                        <option value="">Independent Highlight</option>
                                        {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-6">
                                <label className={labelClass}>Source File</label>
                                <div onClick={() => postFileInputRef.current?.click()} className="aspect-square bg-black border-2 border-dashed border-[#D4AF37]/20 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-[#D4AF37]/50 transition-all overflow-hidden relative group">
                                    {isUploading ? (
                                        <Loader2 className="w-10 h-10 text-[#D4AF37] animate-spin" />
                                    ) : postForm.url ? (
                                        <>{postForm.type === 'video' ? <video src={postForm.url} className="w-full h-full object-cover" /> : <img src={postForm.url} className="w-full h-full object-cover" />}</>
                                    ) : (
                                        <div className="text-center p-8">
                                            <Upload className="w-12 h-12 text-[#D4AF37]/30 mx-auto mb-4" />
                                            <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Upload Visual Asset</p>
                                        </div>
                                    )}
                                </div>
                                <input type="file" ref={postFileInputRef} className="hidden" accept="image/*,video/*" onChange={handleFileUpload} />
                            </div>
                        </div>
                        <button type="submit" disabled={isUploading || !postForm.url} className="w-full bg-[#D4AF37] text-black font-bold py-4 rounded-xl hover:bg-[#E5C76B] transition-all shadow-xl text-lg disabled:opacity-30">Publish Highlight</button>
                    </form>
                </div>
            </div>
        )}

        {activeTab === 'categories' && (
          <div className="space-y-12 max-w-5xl mx-auto pb-20 animate-in fade-in duration-300">
              {/* Hero Visual System */}
              <div className="bg-[#111] rounded-2xl border border-[#D4AF37]/10 shadow-2xl overflow-hidden">
                  <div className="bg-black p-6 border-b border-[#D4AF37]/20 flex items-center justify-between">
                      <div><h2 className="text-xl font-bold text-[#D4AF37] font-[Cinzel]">Global Aesthetic</h2><p className="text-slate-500 text-xs">Manage the landing page visual identity.</p></div>
                      <Camera className="w-8 h-8 text-[#D4AF37]/20" />
                  </div>
                  <div className="p-8">
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                        <div className="md:col-span-1 space-y-4">
                           <h3 className={labelClass}>Hero Background</h3>
                           <p className="text-[10px] text-slate-500 leading-relaxed">This image appears behind the "Celebrate Your Simcha" title. High-resolution horizontal assets work best.</p>
                           <button 
                             onClick={() => heroImageInputRef.current?.click()} 
                             disabled={isUploading}
                             className="w-full bg-[#D4AF37] text-black font-black py-3 rounded-lg hover:bg-[#E5C76B] transition-all uppercase tracking-widest text-[10px] flex items-center justify-center gap-2"
                           >
                             {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                             Change Hero Image
                           </button>
                           <input type="file" accept="image/*" className="hidden" ref={heroImageInputRef} onChange={handleHeroBackgroundUpload} />
                        </div>
                        <div className="md:col-span-2">
                           <div className="aspect-[21/9] bg-black rounded-xl border border-[#D4AF37]/20 overflow-hidden relative group">
                              <img src={heroBackgroundUrl} className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-1000" />
                              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
                              <div className="absolute bottom-4 left-6">
                                 <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.3em]">Live Preview</p>
                              </div>
                           </div>
                        </div>
                     </div>
                  </div>
              </div>

              {/* Add New Category */}
              <div className="bg-[#111] rounded-2xl border border-[#D4AF37]/10 shadow-2xl overflow-hidden">
                  <div className="bg-black p-6 border-b border-[#D4AF37]/20 flex items-center justify-between">
                      <div><h2 className="text-xl font-bold text-[#D4AF37] font-[Cinzel]">Taxonomy Expansion</h2><p className="text-slate-500 text-xs">Establish a new service category for the platform.</p></div>
                      <FolderPlus className="w-8 h-8 text-[#D4AF37]/20" />
                  </div>
                  <form onSubmit={handleAddCategorySubmit} className="p-8 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-6">
                              <div><label className={labelClass}>Vertical Title</label><input required type="text" className={inputClass} placeholder="e.g. Sound & Lighting" value={newCategoryForm.name} onChange={e => setNewCategoryForm({...newCategoryForm, name: e.target.value})} /></div>
                              <div>
                                <label className={labelClass}>Initial Classification Groups</label>
                                <input type="text" className={inputClass} placeholder="Style, Tier, Gear (comma separated)" value={newCategoryForm.subCatsString} onChange={e => setNewCategoryForm({...newCategoryForm, subCatsString: e.target.value})} />
                                <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest mt-2">These serve as headers for granular sub-categories.</p>
                              </div>
                          </div>
                          <div className="space-y-4">
                              <label className={labelClass}>Vertical Hero Asset</label>
                              <div onClick={() => newCatImageInputRef.current?.click()} className="h-44 bg-black border-2 border-dashed border-[#D4AF37]/20 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-[#D4AF37]/50 transition-all overflow-hidden relative">
                                {newCategoryForm.image ? <img src={newCategoryForm.image} className="w-full h-full object-cover" /> : <div className="text-center p-4"><ImageIcon className="w-8 h-8 text-[#D4AF37]/30 mx-auto mb-2" /><p className="text-slate-600 font-bold uppercase tracking-widest text-[9px]">Select Banner</p></div>}
                              </div>
                              <input type="file" accept="image/*" className="hidden" ref={el => { newCatImageInputRef.current = el; }} onChange={handleNewCategoryImgUpload} />
                          </div>
                      </div>
                      <button type="submit" className="w-full bg-[#D4AF37] text-black font-bold py-4 rounded-xl hover:bg-[#E5C76B] transition-all text-xs uppercase tracking-[0.2em]">Commit New Vertical</button>
                  </form>
              </div>

              {/* Advanced Taxonomy Management */}
              <div className="space-y-8">
                <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                    <ListTree className="w-6 h-6 text-[#D4AF37]" />
                    <h3 className="text-xl font-bold font-[Cinzel] text-white">Active Taxonomy Control</h3>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {categories.map(cat => (
                        <div key={cat} className="bg-[#111] rounded-2xl border border-[#D4AF37]/10 overflow-hidden flex flex-col shadow-2xl group">
                            <div className="relative h-44 bg-black">
                                <img src={categoryImages[cat]} className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700" />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#111] via-transparent to-black/30"></div>
                                <button onClick={() => categoryImageInputRefs.current[cat]?.click()} className="absolute top-4 right-4 bg-black/60 hover:bg-[#D4AF37] hover:text-black p-2 rounded-lg text-slate-300 transition-all border border-white/10" title="Modify Banner"><Camera className="w-4 h-4" /></button>
                                <input type="file" accept="image/*" className="hidden" ref={el => { categoryImageInputRefs.current[cat] = el; }} onChange={(e) => handleCategoryImageUpload(cat, e)} />
                                <h3 className="absolute bottom-4 left-6 text-2xl font-bold font-[Cinzel] text-[#D4AF37]">{cat}</h3>
                            </div>
                            
                            <div className="p-6 space-y-6">
                                <div className="space-y-2">
                                    <label className={labelClass}>Establish New Classification Group</label>
                                    <div className="flex gap-2">
                                        <input type="text" className={inputClass + " py-2 text-xs"} placeholder="e.g. Menu Grade, Room Type..." value={newSubCategoryInputs[cat] || ''} onChange={(e) => setNewSubCategoryInputs({...newSubCategoryInputs, [cat]: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && handleAddSubCategory(cat)} />
                                        <button onClick={() => handleAddSubCategory(cat)} className="bg-[#D4AF37] text-black p-2 rounded-lg hover:bg-[#E5C76B] transition-colors"><Plus className="w-5 h-5" /></button>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                   {Object.entries(categorySubCategories[cat] || {}).map(([sub, nestedItems]) => {
                                      const nestedKey = `${cat}-${sub}`;
                                      const items = nestedItems as string[];
                                      return (
                                          <div key={sub} className="bg-black/30 rounded-xl border border-white/5 overflow-hidden">
                                              <div className="p-3 flex items-center justify-between border-b border-white/5 bg-black/20">
                                                  <div className="flex items-center gap-2">
                                                      <Layers className="w-3.5 h-3.5 text-[#D4AF37]/50" />
                                                      <span className="text-[10px] font-black uppercase text-slate-300 tracking-widest">{sub}</span>
                                                  </div>
                                                  <button onClick={() => handleRemoveSubCategory(cat, sub)} className="text-red-500/30 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                                              </div>
                                              <div className="p-4 space-y-4">
                                                  <div className="flex flex-wrap gap-1.5">
                                                      {items.map(item => (
                                                          <div key={item} className="flex items-center gap-2 bg-[#D4AF37]/5 px-2.5 py-1.5 rounded-lg border border-[#D4AF37]/20 text-[9px] font-bold text-slate-400">
                                                              {item}
                                                              <button onClick={() => handleRemoveNestedSubCategory(cat, sub, item)} className="hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                                                          </div>
                                                      ))}
                                                      {items.length === 0 && <span className="text-[9px] text-slate-700 italic">No specific sub-category options added.</span>}
                                                  </div>
                                                  <div className="flex gap-2 pt-1">
                                                      <input type="text" className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-slate-400 outline-none focus:border-[#D4AF37]/40" placeholder={`Add ${sub} option...`} value={newNestedSubCategoryInputs[nestedKey] || ''} onChange={(e) => setNewNestedSubCategoryInputs({...newNestedSubCategoryInputs, [nestedKey]: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && handleAddNestedSubCategory(cat, sub)} />
                                                      <button onClick={() => handleAddNestedSubCategory(cat, sub)} className="bg-[#D4AF37]/10 text-[#D4AF37] px-2 rounded-lg hover:bg-[#D4AF37] hover:text-black transition-all"><Plus className="w-4 h-4" /></button>
                                                  </div>
                                              </div>
                                          </div>
                                      );
                                   })}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
              </div>
          </div>
        )}

        {activeTab === 'bookings' && (
            <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold font-[Cinzel] text-white">Platform Bookings</h2>
                    <div className="bg-[#111] px-4 py-2 rounded-xl border border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        Total: {bookings.length}
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                    {bookings.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map(b => {
                        const vendor = vendors.find(v => v.id === b.vendorId);
                        return (
                            <div key={b.id} className="bg-[#111] p-6 rounded-2xl border border-white/5 hover:border-[#D4AF37]/30 transition-all flex flex-col md:flex-row justify-between items-center gap-6">
                                <div className="flex items-center gap-4 flex-1">
                                    <div className="bg-black p-3 rounded-xl border border-white/5">
                                        <LayoutList className="w-6 h-6 text-[#D4AF37]" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-white">{b.clientName}</h4>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">{b.eventName} • {b.date}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 flex-1">
                                    <div className="text-right md:text-left">
                                        <p className="text-[9px] text-slate-600 uppercase font-black tracking-widest">Professional</p>
                                        <p className="text-sm font-bold text-[#D4AF37]">{vendor?.name || 'Unknown'}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <p className="text-xl font-bold text-white">${b.amount.toLocaleString()}</p>
                                        <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${b.paymentStatus === 'paid' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                            {b.paymentStatus}
                                        </span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => onUpdateBookingStatus(b.id, b.status === 'confirmed' ? 'pending' : 'confirmed')}
                                            className={`p-2 rounded-lg transition-all ${b.status === 'confirmed' ? 'bg-green-500/10 text-green-500' : 'bg-white/5 text-slate-500 hover:text-[#D4AF37]'}`}
                                            title="Toggle Confirmation"
                                        >
                                            <ShieldCheck className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        )}

        {activeTab === 'stripe' && (
            <div className="space-y-8 animate-in fade-in duration-300">
                <div className="bg-[#111] p-8 rounded-3xl border border-[#D4AF37]/10 shadow-2xl">
                    <h3 className="text-xl font-bold font-[Cinzel] text-[#D4AF37] mb-6">Stripe Connection Hub</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-black/40 p-6 rounded-2xl border border-white/5">
                            <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mb-1">Connected Vendors</p>
                            <h4 className="text-3xl font-bold text-white">{vendors.filter(v => !!v.stripeAccountId).length}</h4>
                        </div>
                        <div className="bg-black/40 p-6 rounded-2xl border border-white/5">
                            <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mb-1">Pending Connections</p>
                            <h4 className="text-3xl font-bold text-white">{vendors.filter(v => !v.stripeAccountId).length}</h4>
                        </div>
                        <div className="bg-black/40 p-6 rounded-2xl border border-white/5">
                            <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mb-1">Platform Revenue</p>
                            <h4 className="text-3xl font-bold text-[#D4AF37]">${totalCommission.toLocaleString()}</h4>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-white/5 pb-2">Vendor Stripe Status</h4>
                        {vendors.map(v => (
                            <div key={v.id} className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-white/5">
                                <div className="flex items-center gap-4">
                                    <img src={v.image} className="w-10 h-10 rounded-lg object-cover" />
                                    <div>
                                        <p className="text-sm font-bold text-white">{v.name}</p>
                                        <p className="text-[9px] text-slate-500 uppercase tracking-widest">{v.contactEmail}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    {v.stripeAccountId ? (
                                        <div className="flex flex-col items-end">
                                            <span className="text-[9px] font-black text-green-500 uppercase tracking-widest flex items-center gap-1">
                                                <ShieldCheck className="w-3 h-3" /> Connected
                                            </span>
                                            <span className="text-[8px] text-slate-600 font-mono">{v.stripeAccountId}</span>
                                            <button 
                                                onClick={() => handleManualStripeId(v.id)}
                                                className="text-[8px] text-[#D4AF37] hover:underline mt-1 uppercase tracking-widest font-bold"
                                            >
                                                Change ID
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => handleStripeOnboard(v.id, v.contactEmail || '')}
                                                className="px-4 py-2 bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-[#D4AF37] hover:text-black transition-all"
                                            >
                                                Initiate Onboarding
                                            </button>
                                            <button 
                                                onClick={() => handleManualStripeId(v.id)}
                                                className="p-2 bg-white/5 text-slate-400 border border-white/10 rounded-lg hover:text-white transition-all"
                                                title="Manually Set ID"
                                            >
                                                <Settings className="w-3 h-3" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'users' && (
            <div className="space-y-6 animate-in fade-in duration-300">
                {/* User list remains as is */}
            </div>
        )}

        {activeTab === 'messages' && (
            <div className="space-y-6 animate-in slide-in-from-right-10 duration-500">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 min-h-[600px]">
                    {/* Inbox Sidebar */}
                    <div className="bg-[#111] rounded-2xl border border-white/5 overflow-hidden flex flex-col">
                        <div className="p-6 border-b border-white/5 bg-black/40">
                             <h3 className="font-bold text-[#D4AF37] font-[Cinzel] flex items-center gap-2">
                                <MessageSquare className="w-4 h-4" /> System Inquiries
                             </h3>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            {(() => {
                                const inquiries: Message[] = messages.filter(m => m.isAdminInquiry);
                                const lastMessages: Record<string, Message> = {};
                                inquiries.forEach(m => {
                                    if (!lastMessages[m.clientEmail] || new Date(m.timestamp) > new Date(lastMessages[m.clientEmail].timestamp)) {
                                        lastMessages[m.clientEmail] = m;
                                    }
                                });

                                const conversationList = Object.values(lastMessages).sort((a, b) => 
                                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                                );

                                if (conversationList.length === 0) {
                                    return <div className="p-12 text-center opacity-30"><Bot className="w-12 h-12 mx-auto mb-2" /><p className="text-xs font-[Cinzel]">No direct inquiries yet.</p></div>;
                                }

                                return conversationList.map(msg => (
                                    <button 
                                        key={msg.clientEmail}
                                        onClick={() => setSelectedInquiryEmail(msg.clientEmail)}
                                        className={`w-full p-6 text-left border-b border-white/5 transition-all hover:bg-white/5 ${selectedInquiryEmail === msg.clientEmail ? 'bg-[#D4AF37]/5 border-r-2 border-r-[#D4AF37]' : ''}`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <h4 className="font-bold text-white text-sm truncate">{msg.clientName}</h4>
                                            <span className="text-[8px] text-slate-500">{new Date(msg.timestamp).toLocaleDateString()}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-500 truncate mb-1">{msg.clientEmail}</p>
                                        <p className="text-xs text-slate-400 line-clamp-1">{msg.text}</p>
                                    </button>
                                ));
                            })()}
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div className="lg:col-span-2 bg-[#111] rounded-2xl border border-white/5 overflow-hidden flex flex-col">
                        {selectedInquiryEmail ? (
                            <>
                                <div className="p-6 border-b border-white/5 bg-black/40 flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37] border border-[#D4AF37]/20 font-bold">
                                            {messages.find(m => m.clientEmail === selectedInquiryEmail)?.clientName[0]}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-white text-sm">
                                                {messages.find(m => m.clientEmail === selectedInquiryEmail)?.clientName}
                                            </h3>
                                            <p className="text-[10px] text-slate-500">{selectedInquiryEmail}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => setSelectedInquiryEmail(null)} className="p-2 text-slate-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                                    </div>
                                </div>
                                
                                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                    {messages
                                        .filter(m => m.clientEmail === selectedInquiryEmail && m.isAdminInquiry)
                                        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                                        .map((msg, idx) => (
                                            <div key={idx} className={`flex ${msg.senderId === 'admin' ? 'justify-end' : 'justify-start'}`}>
                                                <div className={`max-w-[80%] rounded-2xl px-5 py-3 text-sm shadow-xl ${
                                                    msg.senderId === 'admin' 
                                                        ? 'bg-[#D4AF37] text-black rounded-tr-none' 
                                                        : 'bg-black/50 text-slate-200 border border-white/5 rounded-tl-none'
                                                }`}>
                                                    {msg.type === 'image' ? (
                                                        <div className="space-y-2">
                                                            <img src={msg.fileUrl} className="rounded-lg w-full max-h-80 object-cover border border-black/10 shadow-lg" alt="" />
                                                            {msg.text && msg.text !== 'Sent an image' && <p className="mt-2">{msg.text}</p>}
                                                        </div>
                                                    ) : msg.type === 'voice' ? (
                                                        <div className="flex items-center gap-3 min-w-[200px]">
                                                            <div className="w-10 h-10 bg-black/20 rounded-full flex items-center justify-center cursor-pointer hover:bg-black/40 transition-all">
                                                                <Play className="w-4 h-4" />
                                                            </div>
                                                            <div className="flex-1 h-1 bg-black/10 rounded-full"><div className="w-1/3 h-full bg-current opacity-30 rounded-full"></div></div>
                                                            <Volume2 className="w-4 h-4 opacity-50" />
                                                        </div>
                                                    ) : (
                                                        <p className="leading-relaxed">{msg.text}</p>
                                                    )}
                                                    <span className={`text-[8px] block mt-2 opacity-50 font-bold uppercase tracking-widest ${msg.senderId === 'admin' ? 'text-black' : 'text-slate-500 text-right'}`}>
                                                        {new Date(msg.timestamp).toLocaleString()}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                </div>

                                <div className="p-6 border-t border-white/5 bg-black/20">
                                    <div className="flex gap-4">
                                        <div className="flex-1 relative">
                                            <textarea 
                                                rows={1}
                                                value={replyText}
                                                onChange={(e) => setReplyText(e.target.value)}
                                                onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                                                placeholder="Type your response..."
                                                className="w-full bg-black border border-[#D4AF37]/20 rounded-xl px-4 py-3 text-sm text-white resize-none outline-none focus:border-[#D4AF37] transition-all"
                                            />
                                        </div>
                                        <button 
                                            onClick={handleSendReply}
                                            disabled={!replyText.trim()}
                                            className="bg-[#D4AF37] text-black w-14 h-12 flex items-center justify-center rounded-xl hover:bg-[#E5C76B] transition-all disabled:opacity-30 shadow-lg shadow-[#D4AF37]/10"
                                        >
                                            <Send className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-20">
                                <Bot className="w-20 h-20 mb-4" />
                                <h3 className="text-xl font-bold font-[Cinzel]">No Conversation Selected</h3>
                                <p className="text-sm max-w-xs">Select an inquiry from the sidebar to view details and respond.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default AdminPanel;