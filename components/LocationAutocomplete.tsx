import React, { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

declare global {
  interface Window {
    google?: any;
  }
}

interface LocationAutocompleteProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  floating?: boolean;
  highlighted?: boolean;
  icon?: any;
}

let googleMapsScriptLoadingPromise: Promise<void> | null = null;

const loadGoogleMapsPlacesScript = (): Promise<void> => {
  if (window.google?.maps?.places) {
    return Promise.resolve();
  }
  if (googleMapsScriptLoadingPromise) {
    return googleMapsScriptLoadingPromise;
  }

  const apiKey =
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
    '';

  googleMapsScriptLoadingPromise = new Promise((resolve) => {
    // Inject custom styling for Google Places dropdown to ensure it overlays modals and matches theme
    if (!document.getElementById('pac-custom-styles')) {
      const style = document.createElement('style');
      style.id = 'pac-custom-styles';
      style.innerHTML = `
        .pac-container {
          background-color: #111111 !important;
          border: 1px solid rgba(212, 175, 55, 0.4) !important;
          border-radius: 12px !important;
          box-shadow: 0 10px 25px rgba(0,0,0,0.8), 0 0 15px rgba(212, 175, 55, 0.2) !important;
          font-family: inherit !important;
          z-index: 999999 !important;
          margin-top: 4px !important;
          overflow: hidden !important;
        }
        .pac-item {
          padding: 10px 14px !important;
          color: #e4e4e7 !important;
          border-top: 1px solid rgba(255, 255, 255, 0.05) !important;
          cursor: pointer !important;
          font-size: 13px !important;
        }
        .pac-item:hover, .pac-item-selected {
          background-color: rgba(212, 175, 55, 0.15) !important;
        }
        .pac-item-query {
          color: #D4AF37 !important;
          font-weight: 700 !important;
          font-size: 13px !important;
        }
        .pac-matched {
          color: #FFDF73 !important;
          font-weight: 900 !important;
        }
        .pac-icon {
          filter: invert(80%) sepia(50%) saturate(1000%) hue-rotate(5deg);
        }
      `;
      document.head.appendChild(style);
    }

    if (!apiKey) {
      console.warn('Google Maps API key not found for Places Autocomplete. Falling back to standard text input.');
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      console.warn('Failed to load Google Maps script. Falling back to standard text input.');
      resolve();
    };
    document.head.appendChild(script);
  });

  return googleMapsScriptLoadingPromise;
};

export const LocationAutocomplete: React.FC<LocationAutocompleteProps> = ({
  id = 'location-input',
  label = 'Location',
  value,
  onChange,
  placeholder = 'Type address (e.g. 75 N Main St)...',
  required = false,
  className = '',
  floating = true,
  highlighted = false,
  icon: Icon = MapPin,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<any>(null);
  const [focused, setFocused] = useState(false);
  const isFilled = value !== '';

  useEffect(() => {
    let isMounted = true;

    loadGoogleMapsPlacesScript().then(() => {
      if (!isMounted || !inputRef.current || !window.google?.maps?.places) return;

      try {
        if (!autocompleteRef.current) {
          const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
            types: ['address', 'establishment', 'geocode'],
            fields: ['formatted_address', 'geometry', 'name'],
          });

          autocomplete.addListener('place_changed', () => {
            const place = autocomplete.getPlace();
            const selectedAddress = place.formatted_address || place.name || inputRef.current?.value || '';
            if (selectedAddress) {
              onChange(selectedAddress);
            }
          });

          autocompleteRef.current = autocomplete;
        }
      } catch (err) {
        console.warn('Error initializing Google Places Autocomplete:', err);
      }
    });

    return () => {
      isMounted = false;
      if (autocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [onChange]);

  if (floating) {
    return (
      <div className="relative w-full">
        <div className="relative flex items-center">
          {Icon && (
            <Icon className={`absolute left-3.5 w-4 h-4 transition-all duration-300 z-10 ${focused ? 'text-[#D4AF37] scale-110' : highlighted ? 'text-red-500 scale-110' : 'text-[#D4AF37]/40'}`} />
          )}
          <input
            ref={inputRef}
            id={id}
            type="text"
            required={required}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={`w-full bg-black/60 border rounded-xl text-zinc-100 placeholder-transparent focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent outline-none transition-all duration-300 pt-6 pb-2 pr-4 ${Icon ? 'pl-10' : 'pl-4'} ${highlighted ? 'border-red-500 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border-[#D4AF37]/20'} ${className}`}
            placeholder={placeholder || label}
            autoComplete="off"
          />
          <label
            htmlFor={id}
            className={`absolute pointer-events-none transition-all duration-300 leading-none ${Icon ? 'left-10' : 'left-4'} 
              ${(focused || isFilled) 
                ? 'top-2 text-[9px] text-[#D4AF37] font-black uppercase tracking-widest' 
                : 'top-4 text-xs text-zinc-500 font-medium'
              }`}
          >
            {label}
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        {Icon && (
          <Icon className="absolute left-3.5 w-4 h-4 text-[#D4AF37]/50 pointer-events-none" />
        )}
        <input
          ref={inputRef}
          id={id}
          type="text"
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full bg-black border border-[#D4AF37]/30 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:ring-2 focus:ring-[#D4AF37] focus:border-[#D4AF37] outline-none transition-all ${Icon ? 'pl-10' : 'pl-4'} pr-4 py-2.5 text-sm ${className}`}
        />
      </div>
    </div>
  );
};

export default LocationAutocomplete;
