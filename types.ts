
export enum VendorCategory {
  VENUE = 'Venue',
  CATERING = 'Catering',
  MUSIC = 'Music',
  PHOTOGRAPHY = 'Photography',
  VIDEOGRAPHY = 'Videography',
  FLORIST = 'Florist & Decor',
  PLANNER = 'Event Planning',
  ATTIRE = 'Attire',
  MAKEUP = 'Makeup & Hair',
  JUDAICA = 'Judaica & Gifts',
  OFFICIANT = 'Rabbi & Officiants',
  INVITATIONS = 'Invitations',
  ENTERTAINMENT = 'Entertainment',
  RENTALS = 'Rentals',
  TRANSPORTATION = 'Transportation'
}

export interface UserAccount {
  id: string;
  name: string;
  username: string;
  photoURL?: string;
  photoStoragePath?: string;
  password?: string;
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  date: string;
}

export interface VendorService {
  id: string;
  name: string;
  price: number;
  unit?: string; // e.g., "person", "violin", "hour", "event"
  allowQuantity?: boolean;
}

export interface SelectedService {
  id: string;
  name: string;
  price: number;
  quantity: number;
  unit?: string;
}

export interface Vendor {
  id: string;
  name: string;
  category: string; 
  subCategories?: string[]; 
  description: string;
  priceStart: number;
  rating: number;
  image: string;
  gallery?: string[];
  video?: string; 
  location: string;
  contactEmail?: string;
  isKosher?: boolean;
  isVerified?: boolean; 
  username?: string; 
  password?: string; 
  unavailableDates?: string[];
  reviews?: Review[];
  services?: VendorService[];
  paymentMethods?: string[];
  commissionRate: number;
  stripeAccountId?: string;
  stripeConnected?: boolean;
  allowOffers?: boolean;
}

export interface Post {
  id: string;
  type: 'image' | 'video';
  url: string;
  title: string;
  description: string;
  timestamp: string;
  vendorId?: string;
}

export interface Message {
  id: string;
  senderId: string; 
  receiverId: string; 
  clientEmail: string; 
  clientName: string;
  text: string;
  timestamp: string;
  isRead: boolean;
  type?: 'text' | 'image' | 'voice' | 'file';
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  isAdminInquiry?: boolean;
}

export interface CartItem {
  vendor: Vendor;
  date: string;
  notes: string;
  clientName: string;
  eventName: string;
  eventLocation: string;
  eventTime: string;
  contactEmail: string;
  selectedServices?: SelectedService[];
  amount: number; 
  isOffer?: boolean;
  offeredPrice?: number;
}

export interface UserFile {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  size: number;
  type: string;
  timestamp: string;
  notes?: string;
  aiSummary?: string;
}

export interface Booking {
  id: string;
  vendorId: string;
  clientName: string;
  eventName: string;
  eventLocation?: string;
  eventTime?: string;
  date: string;
  status: 'confirmed' | 'pending' | 'completed' | 'cancelled';
  paymentStatus: 'pending' | 'paid';
  amount: number;
  contactEmail: string;
  paymentMethod?: 'PayPal' | 'Credit Card (Stripe)' | 'Check' | 'Bank Transfer';
  notes?: string;
  selectedServices?: SelectedService[];
}