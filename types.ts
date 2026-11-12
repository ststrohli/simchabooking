
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
  themeMode?: 'dark' | 'light';
  password?: string;
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  date: string;
}

export type ServiceCategoryType = 'location' | 'hours' | 'amenities';

export interface VendorService {
  id: string;
  name: string;
  price: number;
  unit?: string; // e.g., "person", "violin", "hour", "event"
  allowQuantity?: boolean;
  image?: string;
  categoryType?: ServiceCategoryType;
  defaultHours?: number;
  hourlyRate?: number;
}

export interface SelectedService {
  id: string;
  name: string;
  price: number;
  quantity: number;
  unit?: string;
  categoryType?: ServiceCategoryType;
  selectedHours?: number;
  hours?: number;
  defaultHours?: number;
  hourlyRate?: number;
}

export interface Vendor {
  id: string;
  name: string;
  category: string; 
  subCategories?: string[]; 
  description: string;
  priceStart: number;
  downPayment?: number;
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
  googleEvents?: Array<{
    id: string;
    summary: string;
    start: string;
    end: string;
    location?: string;
    description?: string;
    isCustom?: boolean;
    iCalUID?: string;
    recurringEventId?: string;
    calendarId?: string;
    accountEmail?: string;
    origin?: 'google' | 'simcha_booking' | 'custom';
    sourceBookingId?: string;
    updated?: string;
  }>;
  googleCalendarSyncMap?: Record<string, {
    googleEventId: string;
    calendarId: string;
    lastSyncedHash?: string;
    updatedAt: string;
  }>;
  reviews?: Review[];
  services?: VendorService[];
  paymentMethods?: string[];
  commissionRate: number;
  stripeAccountId?: string;
  stripeConnected?: boolean;
  allowOffers?: boolean;
  onboardingComplete?: boolean;
  enableDateCheckLimit?: boolean;
  maxDateChecks?: number;
  dateCheckResetHours?: number;
  socialLinks?: VendorSocialLinks;
}

export type SocialPlatformId = 'instagram' | 'tiktok' | 'youtube' | 'twentyfoursix' | 'facebook' | 'website';

export interface VendorSocialLinks {
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  twentyfoursix?: string;
  facebook?: string;
  website?: string;
}

export interface VendorSocialItem {
  platform: SocialPlatformId;
  label: string;
  url: string;
  handleDisplay: string;
}

export const getVendorSocialItems = (links?: VendorSocialLinks): VendorSocialItem[] => {
  if (!links) return [];
  const items: VendorSocialItem[] = [];
  const add = (platform: SocialPlatformId, label: string, raw?: string, baseUrl?: string) => {
    const val = (raw || '').trim();
    if (!val) return;
    let url = val;
    let handleDisplay = val;
    if (/^https?:\/\//i.test(val)) {
      try {
        const u = new URL(val);
        const pathClean = u.pathname.replace(/^\/+|\/+$/g, '');
        handleDisplay = pathClean ? `@${pathClean.replace(/^@/, '')}` : u.hostname.replace(/^www\./, '');
      } catch {
        handleDisplay = val;
      }
    } else if (/^(www\.|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|24six\.app|24six\.com|facebook\.com|fb\.com)/i.test(val)) {
      url = `https://${val.replace(/^\/+/, '')}`;
      try {
        const u = new URL(url);
        const pathClean = u.pathname.replace(/^\/+|\/+$/g, '');
        handleDisplay = pathClean ? `@${pathClean.replace(/^@/, '')}` : u.hostname.replace(/^www\./, '');
      } catch {
        handleDisplay = val;
      }
    } else if (baseUrl) {
      const cleanHandle = val.replace(/^@/, '').replace(/^\/+/, '');
      url = `${baseUrl}${cleanHandle}`;
      handleDisplay = platform === 'twentyfoursix' ? cleanHandle : `@${cleanHandle}`;
    } else {
      url = `https://${val.replace(/^\/+/, '')}`;
      handleDisplay = val;
    }
    items.push({ platform, label, url, handleDisplay });
  };

  add('instagram', 'Instagram', links.instagram, 'https://instagram.com/');
  add('youtube', 'YouTube', links.youtube, 'https://youtube.com/@');
  add('tiktok', 'TikTok', links.tiktok, 'https://tiktok.com/@');
  add('twentyfoursix', '24/6', links.twentyfoursix, 'https://24six.app/');
  add('facebook', 'Facebook', links.facebook, 'https://facebook.com/');
  add('website', 'Website', links.website);
  return items;
};

export interface HeroImage {
  id: string;
  url: string;
  name?: string;
  uploadedAt?: string;
  isDefault?: boolean;
  fileSize?: number;
  width?: number;
  height?: number;
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
  imageUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  fileName?: string;
  fileType?: string;
  isAdminInquiry?: boolean;
  conversationId?: string;
  participants?: string[];
  vendorEmail?: string;
  tempId?: string;
  isOptimistic?: boolean;
  senderName?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'error';
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
  createdAt?: string;
  id: string;
  userId?: string;
  clientId?: string;
  vendorId: string;
  clientName: string;
  clientPhotoURL?: string;
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
  eventAddress?: string;
  isOffer?: boolean;
  offeredPrice?: number;
}