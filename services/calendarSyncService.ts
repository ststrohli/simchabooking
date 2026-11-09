import { Booking, Vendor } from '../types';

export type GoogleCalendarSyncEntry = {
  googleEventId: string;
  calendarId: string;
  lastSyncedHash?: string;
  updatedAt: string;
};

export type GoogleCalendarSyncMap = Record<string, GoogleCalendarSyncEntry>;

export type VendorGoogleEvent = NonNullable<Vendor['googleEvents']>[number];

const escapeRegExp = (str: string): string => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Parses a date or dateTime string into a local Date object without UTC day-shift bugs
 * for YYYY-MM-DD all-day strings.
 */
export const parseCalendarDateLocal = (val?: string): Date | null => {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const year = Number(ymdMatch[1]);
    const month = Number(ymdMatch[2]);
    const day = Number(ymdMatch[3]);
    const d = new Date(year, month - 1, day, 0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(trimmed);
  return isNaN(parsed.getTime()) ? null : parsed;
};

export const formatLocalYMD = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Extracts all local YYYY-MM-DD date strings covered by an event's start and end values.
 * Handles both Google Calendar exclusive all-day end dates (end > start) and inclusive single-day dates.
 */
export const extractDatesFromEventRange = (startVal?: string, endVal?: string): string[] => {
  if (!startVal) return [];
  const start = parseCalendarDateLocal(startVal);
  if (!start) return [];

  let end = endVal ? parseCalendarDateLocal(endVal) : new Date(start.getTime());
  if (!end || end.getTime() < start.getTime()) {
    end = new Date(start.getTime());
  }

  const isStartAllDay = /^\d{4}-\d{2}-\d{2}$/.test(startVal.trim());
  const isEndAllDay = !endVal || /^\d{4}-\d{2}-\d{2}$/.test(endVal.trim());

  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  let endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  // Google Calendar all-day events use an exclusive end date (e.g. 2026-11-10 to 2026-11-11 for a 1-day event).
  // Subtract 1 day only when endDay is strictly after startDay so single-day custom events (start === end) stay valid.
  if (isStartAllDay && isEndAllDay && endVal && endDay.getTime() > startDay.getTime()) {
    endDay = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() - 1);
  }

  const dates: string[] = [];
  const cur = new Date(startDay.getTime());
  let safetyCounter = 0;
  while (cur.getTime() <= endDay.getTime() && safetyCounter < 366) {
    dates.push(formatLocalYMD(cur));
    cur.setDate(cur.getDate() + 1);
    safetyCounter++;
  }
  return dates;
};

/**
 * Computes a deterministic fingerprint of a Simcha Booking's calendar fields
 * to detect whether an already-synced Google Calendar event needs a PATCH update.
 */
export const buildBookingSyncHash = (gig: Booking): string => {
  return [
    gig.id,
    gig.eventName || '',
    gig.date || '',
    gig.eventTime || '',
    gig.eventLocation || gig.eventAddress || '',
    gig.clientName || '',
    gig.notes || '',
    gig.status || '',
  ].join('|');
};

/**
 * Builds a Google Calendar API event resource for a confirmed Simcha Booking,
 * including private extendedProperties for deterministic provenance tracking.
 */
export const buildGoogleCalendarPayloadForBooking = (gig: Booking, vendorId: string) => {
  let startVal: { date?: string; dateTime?: string } = { date: gig.date };
  let endVal: { date?: string; dateTime?: string } = { date: gig.date };

  // For all-day Google Calendar events, end.date should be the next calendar day (exclusive)
  const localDay = parseCalendarDateLocal(gig.date);
  if (localDay) {
    const nextDay = new Date(localDay.getFullYear(), localDay.getMonth(), localDay.getDate() + 1);
    endVal = { date: formatLocalYMD(nextDay) };
  }

  if (gig.eventTime) {
    try {
      const trimmed = gig.eventTime.trim();
      let h24 = -1;
      let mins = '00';
      const ampm = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
      if (ampm) {
        let h = parseInt(ampm[1], 10) % 12;
        if (ampm[3].toUpperCase() === 'PM') h += 12;
        h24 = h;
        mins = ampm[2];
      } else {
        const m24 = trimmed.match(/^(\d{1,2}):(\d{2})/);
        if (m24) {
          h24 = parseInt(m24[1], 10);
          mins = m24[2];
        }
      }
      if (h24 >= 0 && h24 <= 23 && localDay) {
        const startD = new Date(
          localDay.getFullYear(),
          localDay.getMonth(),
          localDay.getDate(),
          h24,
          parseInt(mins, 10) || 0,
          0,
          0
        );
        if (!isNaN(startD.getTime())) {
          startVal = { dateTime: startD.toISOString() };
          const endD = new Date(startD.getTime() + 4 * 60 * 60 * 1000);
          endVal = { dateTime: endD.toISOString() };
        }
      }
    } catch {
      // Keep all-day fallback
    }
  }

  const locationStr = gig.eventLocation || gig.eventAddress || 'Not specified';

  return {
    summary: `Simcha Booking: ${gig.eventName || 'Celebration'}`,
    location: locationStr !== 'Not specified' ? locationStr : undefined,
    description: `Simcha Booking Detail\nClient: ${gig.clientName}\nBooking ID: ${gig.id}\nLocation: ${locationStr}\nNotes: ${gig.notes || ''}`,
    start: startVal,
    end: endVal,
    extendedProperties: {
      private: {
        simchaBookingId: gig.id,
        simchaVendorId: vendorId,
        simchaOrigin: 'simcha_booking',
      },
    },
  };
};

/**
 * Extracts the originating Simcha Booking ID from a Google Calendar event or stored vendor Google event
 * when provenance is certain.
 */
export const extractSimchaBookingIdFromEvent = (
  ev: any,
  knownBookings: Booking[] = [],
  syncMap?: GoogleCalendarSyncMap
): string | null => {
  if (!ev) return null;

  // 1. Explicit provenance fields
  const extBookingId = ev?.extendedProperties?.private?.simchaBookingId;
  if (typeof extBookingId === 'string' && extBookingId.trim()) {
    return extBookingId.trim();
  }
  if (typeof ev?.sourceBookingId === 'string' && ev.sourceBookingId.trim()) {
    return ev.sourceBookingId.trim();
  }

  // 2. Reverse lookup in syncMap by Google Event ID
  if (syncMap && typeof ev.id === 'string') {
    for (const [bookingId, entry] of Object.entries(syncMap)) {
      if (entry?.googleEventId === ev.id) {
        return bookingId;
      }
    }
  }

  // 3. Explicit "Booking ID: <id>" line in description written by Simcha Booking export
  const desc = typeof ev.description === 'string' ? ev.description : '';
  const idMatch = desc.match(/Booking ID:\s*([^\s\r\n]+)/i);
  if (idMatch && idMatch[1]) {
    return idMatch[1].trim();
  }

  // 4. Legacy Simcha Booking export match where description contains a known booking ID
  const summary = typeof ev.summary === 'string' ? ev.summary : '';
  if (summary.startsWith('Simcha Booking:') && knownBookings.length > 0) {
    for (const b of knownBookings) {
      if (b.id && desc.includes(b.id)) {
        return b.id;
      }
    }
    // Check if summary is "Simcha Booking: <eventName>" on the exact booking date with "Simcha Booking Detail" marker
    if (desc.includes('Simcha Booking Detail')) {
      const rawStart = ev.start?.dateTime || ev.start?.date || (typeof ev.start === 'string' ? ev.start : '');
      const evDates = extractDatesFromEventRange(rawStart, rawStart);
      for (const b of knownBookings) {
        if (
          b.eventName &&
          summary === `Simcha Booking: ${b.eventName}` &&
          (evDates.includes(b.date) || rawStart.startsWith(b.date))
        ) {
          return b.id;
        }
      }
    }
  }

  return null;
};

/**
 * Determines whether a Google Calendar event (raw API or stored vendor.googleEvents entry)
 * originated from Simcha Booking export so it is not re-imported as a duplicate on top of the native booking.
 */
export const isSimchaOriginGoogleEvent = (
  ev: any,
  knownBookings: Booking[] = [],
  syncMap?: GoogleCalendarSyncMap
): boolean => {
  if (!ev) return false;
  if (ev.origin === 'simcha_booking') return true;
  if (ev?.extendedProperties?.private?.simchaOrigin === 'simcha_booking') return true;

  const matchedBookingId = extractSimchaBookingIdFromEvent(ev, knownBookings, syncMap);
  if (matchedBookingId) return true;

  const summary = typeof ev.summary === 'string' ? ev.summary.trim() : '';
  const desc = typeof ev.description === 'string' ? ev.description : '';

  // Legacy exported Simcha Booking copy with explicit Simcha export signature
  if (summary.startsWith('Simcha Booking:') && desc.includes('Simcha Booking Detail')) {
    return true;
  }

  // Legacy exported copy matching a known booking's exact "Simcha Booking: <eventName>" on the same date
  if (summary.startsWith('Simcha Booking:') && knownBookings.length > 0) {
    const rawStart = ev.start?.dateTime || ev.start?.date || (typeof ev.start === 'string' ? ev.start : '');
    const evDates = extractDatesFromEventRange(rawStart, rawStart);
    return knownBookings.some(
      (b) =>
        b.eventName &&
        summary.toLowerCase() === `simcha booking: ${b.eventName.trim().toLowerCase()}` &&
        (evDates.includes(b.date) || (typeof rawStart === 'string' && rawStart.startsWith(b.date)))
    );
  }

  return false;
};

/**
 * Finds all Google Calendar API events that match a specific Simcha Booking via deterministic provenance.
 */
export const findMatchingGoogleEventsForBooking = (
  gig: Booking,
  googleApiEvents: any[],
  syncMap?: GoogleCalendarSyncMap
): any[] => {
  if (!gig || !Array.isArray(googleApiEvents)) return [];
  const mappedGoogleId = syncMap?.[gig.id]?.googleEventId;
  const bookingIdRegex = new RegExp(`Booking ID:\\s*${escapeRegExp(gig.id)}(?:\\b|\\s|$)`, 'i');

  return googleApiEvents.filter((ge) => {
    if (!ge || ge.status === 'cancelled') return false;
    if (mappedGoogleId && ge.id === mappedGoogleId) return true;
    if (ge?.extendedProperties?.private?.simchaBookingId === gig.id) return true;
    const desc = typeof ge.description === 'string' ? ge.description : '';
    if (bookingIdRegex.test(desc)) return true;
    if (
      typeof ge.summary === 'string' &&
      ge.summary.startsWith('Simcha Booking:') &&
      desc.includes(gig.id)
    ) {
      return true;
    }
    return false;
  });
};

/**
 * Reconciles and deduplicates vendor.googleEvents:
 * 1. Preserves custom vendor events (isCustom / custom_*) deduplicated by id.
 * 2. Excludes Simcha-origin exported booking copies so they never duplicate native bookings.
 * 3. Upserts genuine external Google Calendar events by stable (calendarId, id) identity.
 */
export const reconcileVendorGoogleEvents = (params: {
  existingVendorEvents?: Vendor['googleEvents'];
  fetchedGoogleEvents?: any[];
  bookings: Booking[];
  syncMap?: GoogleCalendarSyncMap;
  calendarId?: string;
  accountEmail?: string;
}): VendorGoogleEvent[] => {
  const {
    existingVendorEvents = [],
    fetchedGoogleEvents,
    bookings,
    syncMap,
    calendarId = 'primary',
    accountEmail,
  } = params;

  // 1. Preserve custom vendor events (deduplicated by id)
  const customMap = new Map<string, VendorGoogleEvent>();
  for (const ce of existingVendorEvents) {
    if (!ce) continue;
    const isCustom = Boolean(ce.isCustom || ce.origin === 'custom' || String(ce.id).startsWith('custom_'));
    if (isCustom) {
      customMap.set(String(ce.id), {
        ...ce,
        isCustom: true,
        origin: 'custom',
      });
    }
  }

  // 2. Determine source of Google events (if fetchedGoogleEvents is provided, use fresh snapshot; otherwise clean existing)
  const rawGoogleList = Array.isArray(fetchedGoogleEvents)
    ? fetchedGoogleEvents
    : existingVendorEvents.filter(
        (ce) => ce && !ce.isCustom && ce.origin !== 'custom' && !String(ce.id).startsWith('custom_')
      );

  const googleMap = new Map<string, VendorGoogleEvent>();

  for (const raw of rawGoogleList) {
    if (!raw || raw.status === 'cancelled') continue;

    // Filter out events that originated from Simcha Booking export
    if (isSimchaOriginGoogleEvent(raw, bookings, syncMap)) {
      continue;
    }

    const eventId = String(raw.id || '').trim();
    if (!eventId) continue;

    const evCalendarId = raw.calendarId || calendarId || 'primary';
    const startStr =
      typeof raw.start === 'string'
        ? raw.start
        : raw.start?.dateTime || raw.start?.date || '';
    const endStr =
      typeof raw.end === 'string'
        ? raw.end
        : raw.end?.dateTime || raw.end?.date || startStr;

    if (!startStr) continue;

    const compositeKey = `${evCalendarId}:${eventId}`;
    const normalized: VendorGoogleEvent = {
      id: eventId,
      summary: raw.summary || 'Busy (Google Calendar)',
      start: startStr,
      end: endStr,
      location: raw.location || '',
      description: raw.description || '',
      isCustom: false,
      iCalUID: raw.iCalUID || undefined,
      recurringEventId: raw.recurringEventId || undefined,
      calendarId: evCalendarId,
      accountEmail: raw.accountEmail || accountEmail || undefined,
      origin: 'google',
      updated: raw.updated || undefined,
    };

    googleMap.set(compositeKey, normalized);
  }

  return [...Array.from(customMap.values()), ...Array.from(googleMap.values())];
};
