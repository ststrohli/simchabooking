
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

export type SocialPlatformId = 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'website';

export interface VendorSocialLinks {
  instagram?: string;
  tiktok?: string;
  youtube?: string;
  facebook?: string;
  website?: string;
}

export interface NormalizedSocialItem {
  platform: SocialPlatformId;
  label: string;
  handleDisplay: string;
  url: string;
  raw: string;
}

export const normalizeVendorSocialLink = (
  platform: SocialPlatformId,
  rawInput?: string | null
): NormalizedSocialItem | null => {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const platformLabels: Record<SocialPlatformId, string> = {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    facebook: 'Facebook',
    website: 'Website',
  };

  const isUrlLike =
    /^https?:\/\//i.test(trimmed) ||
    /^(www\.)?(instagram\.com|instagr\.am|tiktok\.com|youtube\.com|youtu\.be|facebook\.com|fb\.com)\//i.test(trimmed) ||
    (platform === 'website' && trimmed.includes('.'));

  if (isUrlLike) {
    const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    let handleDisplay = platformLabels[platform];
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (platform === 'website') {
        handleDisplay = parsed.hostname.replace(/^www\./i, '');
      } else if (parts.length > 0) {
        const lastPart = decodeURIComponent(parts[parts.length - 1]);
        if (lastPart && !['watch', 'channel', 'profile.php'].includes(lastPart.toLowerCase())) {
          handleDisplay = lastPart.startsWith('@') ? lastPart : `@${lastPart}`;
        }
      }
    } catch {
      handleDisplay = platformLabels[platform];
    }
    return {
      platform,
      label: platformLabels[platform],
      handleDisplay,
      url,
      raw: trimmed,
    };
  }

  // Otherwise treat as a username / handle or page name
  const cleanHandle = trimmed.replace(/^@+/, '').trim();
  if (!cleanHandle) return null;
  const compactHandle = cleanHandle.replace(/\s+/g, '');

  switch (platform) {
    case 'instagram':
      return {
        platform,
        label: 'Instagram',
        handleDisplay: `@${compactHandle}`,
        url: `https://www.instagram.com/${encodeURIComponent(compactHandle)}`,
        raw: trimmed,
      };
    case 'tiktok':
      return {
        platform,
        label: 'TikTok',
        handleDisplay: `@${compactHandle}`,
        url: `https://www.tiktok.com/@${encodeURIComponent(compactHandle)}`,
        raw: trimmed,
      };
    case 'youtube':
      return {
        platform,
        label: 'YouTube',
        handleDisplay: `@${compactHandle}`,
        url: `https://www.youtube.com/@${encodeURIComponent(compactHandle)}`,
        raw: trimmed,
      };
    case 'facebook':
      return {
        platform,
        label: 'Facebook',
        handleDisplay: cleanHandle.startsWith('@') ? cleanHandle : `@${compactHandle}`,
        url: `https://www.facebook.com/${encodeURIComponent(compactHandle)}`,
        raw: trimmed,
      };
    case 'website': {
      const domain = compactHandle.includes('.') ? compactHandle : `${compactHandle.toLowerCase()}.com`;
      return {
        platform,
        label: 'Website',
        handleDisplay: domain.replace(/^https?:\/\/(www\.)?/i, ''),
        url: /^https?:\/\//i.test(domain) ? domain : `https://${domain}`,
        raw: trimmed,
      };
    }
  }
};

export const getVendorSocialItems = (socialLinks?: VendorSocialLinks | null): NormalizedSocialItem[] => {
  if (!socialLinks) return [];
  const order: SocialPlatformId[] = ['instagram', 'tiktok', 'youtube', 'facebook', 'website'];
  const items: NormalizedSocialItem[] = [];
  for (const platform of order) {
    const normalized = normalizeVendorSocialLink(platform, socialLinks[platform]);
    if (normalized) items.push(normalized);
  }
  return items;
};

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
  socialLinks?: VendorSocialLinks;
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
}

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