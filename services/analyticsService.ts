import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "./firebase";

export interface TrackingEvent {
  eventName: string;
  timestamp: string;
  userId: string | null;
  userEmail: string | null;
  path: string;
  params?: Record<string, any>;
}

/**
 * Tracks an analytics event.
 * Persists to custom Firestore database logging for sandbox robustness
 * and prints a clean debug log in development.
 */
export const trackEvent = async (eventName: string, params?: Record<string, any>) => {
  const user = auth.currentUser;
  const currentPath = window.location.pathname;

  const eventData: TrackingEvent = {
    eventName,
    timestamp: new Date().toISOString(),
    userId: user ? user.uid : null,
    userEmail: user ? user.email : null,
    path: currentPath,
    params,
  };

  // 1. Log in console with pristine visual presentation
  console.log(
    `%c[Simcha Analytics] 📊 Event tracked: ${eventName}`,
    "color: #D4AF37; font-weight: bold; background-color: #111; padding: 4px 8px; border-radius: 4px;",
    eventData
  );

  // 2. Persist event in Firestore for server-side analytics, bypassing any browser cookie blockers
  try {
    const analyticsRef = collection(db, "analytics_logs");
    await addDoc(analyticsRef, {
      ...eventData,
      firestoreTimestamp: serverTimestamp(),
    });
  } catch (err) {
    console.warn(`[Analytics] Firestore persistence skipped for ${eventName}:`, err);
  }
};

/**
 * Helper to track distinct booking funnel stages
 */
export const trackFunnelStep = {
  // 1. VIEW_VENDOR: User discovers a vendor card or views details
  viewVendor: (vendorId: string, vendorName: string, category: string) => {
    trackEvent("view_vendor", { vendorId, vendorName, category });
  },

  // 2. ADD_TO_PLAN: User configures details and adds a vendor to their personal plan
  addToPlan: (vendorId: string, vendorName: string, category: string, estimatedAmount: number) => {
    trackEvent("add_to_plan", { vendorId, vendorName, category, estimatedAmount });
  },

  // 3. REMOVE_FROM_PLAN: User removes a vendor from their plan
  removeFromPlan: (vendorId: string, vendorName: string, category: string) => {
    trackEvent("remove_from_plan", { vendorId, vendorName, category });
  },

  // 4. INITIATE_CHECKOUT: User proceeds to submit their plan requests
  beginCheckout: (totalItems: number, totalEstimatedAmount: number) => {
    trackEvent("begin_checkout", { totalItems, totalEstimatedAmount });
  },

  // 5. SUBMIT_BOOKING_REQUESTS: Booking requests successfully generated of the plan items
  submitBookingRequest: (bookingCount: number, totalAmount: number) => {
    trackEvent("submit_booking_request", { bookingCount, totalAmount });
  },

  // 6. INITIATE_PAYMENT: Client initiates Stripe or PayPal checkout on a confirmed booking
  initiatePayment: (bookingId: string, vendorId: string, amount: number, method: "Stripe" | "PayPal") => {
    trackEvent("initiate_payment", { bookingId, vendorId, amount, method });
  },

  // 7. COMPLETED_PURCHASE: Specific checkout succeeded
  completedPurchase: (bookingId: string, vendorId: string, amount: number, method: string) => {
    trackEvent("payment_completed", { bookingId, vendorId, amount, method });
  },

  // SPECIAL: Chat messages sent (negotiation / communication)
  sendMessage: (senderId: string, receiverId: string, textLength: number) => {
    trackEvent("send_message", { senderId, receiverId, textLength });
  }
};
