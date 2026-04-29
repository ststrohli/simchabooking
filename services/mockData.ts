
import { Vendor, VendorCategory, Booking } from '../types';

// Helper to generate date strings relative to today
const getFutureDate = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
};

export const VENDORS: Vendor[] = [
  {
    id: '1',
    name: 'Goldstein’s Grand Ballroom',
    category: VendorCategory.VENUE,
    subCategories: ['Wedding', 'Bar Mitzvah', 'Engagement', 'Sheva Brachot'],
    description: 'A luxurious ballroom capable of seating 500 guests. Features a separate chuppah area and kosher kitchen.',
    priceStart: 5000,
    rating: 4.9,
    image: 'https://picsum.photos/800/600?random=1',
    gallery: [
      'https://picsum.photos/800/600?random=1',
      'https://picsum.photos/800/600?random=101',
      'https://picsum.photos/800/600?random=102'
    ],
    video: 'https://www.youtube.com/embed/ScMzIvxBSi4', // Sample wedding venue video
    location: 'Brooklyn, NY',
    contactEmail: 'bookings@goldsteinballroom.com',
    isKosher: true,
    isVerified: true,
    username: 'goldstein',
    password: '123',
    unavailableDates: [getFutureDate(1), getFutureDate(7), getFutureDate(14)],
    reviews: [
      { id: 'r1', author: 'Rachel M.', rating: 5, text: 'Absolutely stunning venue! The chuppah area was magical.', date: '2023-10-15' },
      { id: 'r2', author: 'David K.', rating: 4, text: 'Great service, though parking was a bit tight.', date: '2023-11-02' }
    ],
    services: [
      { id: 's1', name: 'Standard Hall Rental (6 Hours)', price: 5000 },
      { id: 's2', name: 'Premium Full-Day Rental', price: 8500 },
      { id: 's3', name: 'Chuppah Setup & Ceremony', price: 1200 }
    ],
    paymentMethods: ['Credit Card', 'Stripe', 'PayPal', 'Check', 'Bank Transfer', 'Zelle'],
    commissionRate: 10,
    stripeAccountId: 'acct_1TFG4u1F9HWZ6UFS'
  },
  {
    id: 'ea54cmd95',
    name: 'Test Vendor ea54cmd95',
    category: VendorCategory.VENUE,
    subCategories: ['Wedding'],
    description: 'A test vendor for debugging Stripe issues.',
    priceStart: 1000,
    rating: 5.0,
    image: 'https://picsum.photos/800/600?random=9',
    location: 'Brooklyn, NY',
    contactEmail: 'test@ea54cmd95.com',
    username: 'ea54cmd95',
    password: '123',
    paymentMethods: ['Stripe'],
    commissionRate: 5,
    stripeAccountId: 'acct_1TFG4u1F9HWZ6UFS'
  },
  {
    id: '2',
    name: 'Levine’s Kosher Catering',
    category: VendorCategory.CATERING,
    subCategories: ['Meat', 'Dairy', 'Pareve'],
    description: 'Glatt Kosher catering specializing in traditional Ashkenazi and Sephardic cuisine. Famous for our brisket.',
    priceStart: 120,
    rating: 4.8,
    image: 'https://picsum.photos/800/600?random=2',
    gallery: [
      'https://picsum.photos/800/600?random=2',
      'https://picsum.photos/800/600?random=202',
      'https://picsum.photos/800/600?random=203'
    ],
    location: 'Queens, NY',
    contactEmail: 'info@levinecatering.com',
    isKosher: true,
    isVerified: true,
    username: 'levine',
    password: '123',
    unavailableDates: [getFutureDate(2), getFutureDate(3)],
    reviews: [
      { id: 'r3', author: 'Sarah L.', rating: 5, text: 'The brisket lived up to the hype! Everyone raved about the food.', date: '2023-09-20' }
    ],
    services: [
      { id: 's4', name: 'Standard Buffet Package (Per Guest)', price: 120 },
      { id: 's5', name: 'Premium Plated Dinner (Per Guest)', price: 180 },
      { id: 's6', name: 'Viennese Table Add-on', price: 25 }
    ],
    paymentMethods: ['Credit Card', 'Check', 'Cash'],
    commissionRate: 10
  },
  {
    id: '3',
    name: 'Simcha Soul Band',
    category: VendorCategory.MUSIC,
    subCategories: ['Band', 'Singer', 'One Man Band'],
    description: 'High-energy Klezmer, Motown, and Top 40 hits. We keep the hora going all night long.',
    priceStart: 2500,
    rating: 4.7,
    image: 'https://picsum.photos/800/600?random=3',
    gallery: [
      'https://picsum.photos/800/600?random=3',
      'https://picsum.photos/800/600?random=303'
    ],
    location: 'Los Angeles, CA',
    contactEmail: 'music@simchasoul.com',
    unavailableDates: [getFutureDate(5), getFutureDate(6)],
    reviews: [],
    username: 'simcha',
    password: '123',
    services: [
      { id: 's7', name: '3-Piece Band (4 Hours)', price: 2500 },
      { id: 's8', name: 'Full 8-Piece Orchestra', price: 6000 },
      { id: 's9', name: 'Ceremony String Quartet', price: 1200 }
    ],
    paymentMethods: ['Venmo', 'PayPal', 'Cash'],
    commissionRate: 10
  },
  {
    id: '4',
    name: 'Captured Moments Photography',
    category: VendorCategory.PHOTOGRAPHY,
    subCategories: ['Wedding', 'Bar Mitzvah', 'Event'],
    description: 'Specializing in Jewish weddings and Bar/Bat Mitzvahs. We capture the emotion of the Bedeken and the joy of the dance floor.',
    priceStart: 3000,
    rating: 4.9,
    image: 'https://picsum.photos/800/600?random=4',
    gallery: [
        'https://picsum.photos/800/600?random=4',
        'https://picsum.photos/800/600?random=404',
        'https://picsum.photos/800/600?random=405',
        'https://picsum.photos/800/600?random=406'
    ],
    location: 'Chicago, IL',
    isVerified: true,
    unavailableDates: [getFutureDate(0), getFutureDate(1)],
    reviews: [
       { id: 'r4', author: 'Benji S.', rating: 5, text: 'Captured every moment perfectly. Highly recommend!', date: '2023-12-05' },
       { id: 'r5', author: 'Leah T.', rating: 5, text: 'So professional and unobtrusive.', date: '2023-12-10' }
    ],
    username: 'photo',
    password: '123',
    services: [
      { id: 's10', name: 'Essential Package (6 Hours)', price: 3000 },
      { id: 's11', name: 'Full Day Coverage + 2nd Shooter', price: 4500 },
      { id: 's12', name: 'Engagement Session', price: 500 }
    ],
    paymentMethods: ['Credit Card', 'PayPal'],
    commissionRate: 10
  },
  {
    id: '5',
    name: 'Elegant Kippahs & Judaica',
    category: VendorCategory.JUDAICA,
    subCategories: ['Kippahs', 'Gifts', 'Benchers'],
    description: 'Custom suede and satin kippahs with your event details. Bulk orders available.',
    priceStart: 500,
    rating: 4.6,
    image: 'https://picsum.photos/800/600?random=5',
    location: 'Online',
    reviews: [],
    username: 'kippah',
    password: '123',
    services: [
      { id: 's13', name: '100 Custom Suede Kippahs', price: 500 },
      { id: 's14', name: '100 Custom Satin Kippahs', price: 400 },
      { id: 's15', name: 'Benchers with Gold Stamping (100 qty)', price: 350 }
    ],
    paymentMethods: ['Credit Card', 'PayPal'],
    commissionRate: 10
  },
  {
    id: '6',
    name: 'Rabbi Michael Cohen',
    category: VendorCategory.OFFICIANT,
    subCategories: ['Rabbi', 'Cantor'],
    description: 'Modern orthodox rabbi available for weddings and life cycle events. Warm, inclusive, and engaging.',
    priceStart: 800,
    rating: 5.0,
    image: 'https://picsum.photos/800/600?random=6',
    location: 'Miami, FL',
    isVerified: true,
    unavailableDates: [getFutureDate(7)],
    reviews: [
      { id: 'r6', author: 'Josh & Maya', rating: 5, text: 'Rabbi Cohen made our ceremony so meaningful and personal.', date: '2024-01-15' }
    ],
    username: 'rabbi',
    password: '123',
    services: [
      { id: 's16', name: 'Wedding Ceremony', price: 1200 },
      { id: 's17', name: 'Bar Mitzvah Service', price: 800 },
      { id: 's18', name: 'Counseling Session', price: 150 }
    ],
    paymentMethods: ['Check', 'Zelle', 'Cash'],
    commissionRate: 10
  },
  {
    id: '7',
    name: 'Garden of Eden Venue',
    category: VendorCategory.VENUE,
    subCategories: ['Wedding', 'Bar Mitzvah', 'Engagement'],
    description: 'Outdoor garden venue perfect for spring and summer weddings. Tent options available.',
    priceStart: 4500,
    rating: 4.5,
    image: 'https://picsum.photos/800/600?random=7',
    gallery: [
        'https://picsum.photos/800/600?random=7',
        'https://picsum.photos/800/600?random=707',
        'https://picsum.photos/800/600?random=708'
    ],
    location: 'New Jersey',
    isKosher: false,
    unavailableDates: [getFutureDate(1), getFutureDate(2), getFutureDate(10)],
    reviews: [
      { id: 'r7', author: 'Rebecca W.', rating: 4, text: 'Beautiful gardens, but make sure to rent the tent just in case.', date: '2023-06-12' }
    ],
    username: 'garden',
    password: '123',
    paymentMethods: ['Check', 'Bank Transfer'],
    commissionRate: 10
  },
  {
    id: '8',
    name: 'Taste of Tel Aviv',
    category: VendorCategory.CATERING,
    subCategories: ['Dairy', 'Meat', 'Pareve'],
    description: 'Modern Israeli fusion cuisine. Falafel stations, shawarma carving, and artisanal hummus.',
    priceStart: 100,
    rating: 4.8,
    image: 'https://picsum.photos/800/600?random=8',
    location: 'New York, NY',
    isKosher: true,
    reviews: [
       { id: 'r8', author: 'Dan G.', rating: 5, text: 'The hummus bar was a hit!', date: '2023-08-22' }
    ],
    username: 'telaviv',
    password: '123',
    paymentMethods: ['Credit Card', 'Cash'],
    commissionRate: 10
  }
];

export const MOCK_BOOKINGS: Booking[] = [
  {
    id: 'b1',
    vendorId: '1',
    clientName: 'Sarah & David Levy',
    eventName: 'Wedding Reception',
    date: getFutureDate(7),
    status: 'confirmed',
    paymentStatus: 'paid',
    amount: 15000,
    contactEmail: 'sarah.levy@example.com',
    paymentMethod: 'Credit Card (Stripe)'
  },
  {
    id: 'b2',
    vendorId: '1',
    clientName: 'Temple Beth El',
    eventName: 'Annual Gala',
    date: getFutureDate(14),
    status: 'confirmed',
    paymentStatus: 'pending',
    amount: 8500,
    contactEmail: 'admin@bethel.org'
  },
  {
    id: 'b3',
    vendorId: '1',
    clientName: 'Markowitz Family',
    eventName: 'Bar Mitzvah',
    date: getFutureDate(25),
    status: 'pending',
    paymentStatus: 'pending',
    amount: 12000,
    contactEmail: 'ben.markowitz@example.com'
  },
  {
    id: 'b4',
    vendorId: '1',
    clientName: 'Rachel Green',
    eventName: 'Engagement Party',
    date: getFutureDate(3),
    status: 'completed',
    paymentStatus: 'paid',
    amount: 5000,
    contactEmail: 'rachel.g@example.com',
    paymentMethod: 'PayPal'
  }
];
