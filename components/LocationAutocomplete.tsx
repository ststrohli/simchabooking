import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

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

let placesModulePromise: Promise<any> | null = null;

const getPlacesModule = async () => {
  if (placesModulePromise) return placesModulePromise;
  placesModulePromise = (async () => {
    const res = await fetch('/api/maps-key');
    if (!res.ok) throw new Error('endpoint_error');
    const data = await res.json();
    if (!data || typeof data.key !== 'string' || !data.key.trim()) {
      throw new Error('missing_secret');
    }

    setOptions({
      key: data.key.trim(),
      v: 'weekly',
      libraries: ['places'],
    });

    return await importLibrary('places');
  })();
  return placesModulePromise;
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
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const sessionTokenRef = useRef<any>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef<number>(0);

  const isFilled = value !== '';

  // Handle outside click to close suggestion list
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = async (query: string, reqId: number) => {
    if (!query || query.trim().length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setStatusMessage(null);

    try {
      const places = await getPlacesModule();
      if (!places?.AutocompleteSuggestion) {
        throw new Error('library_error');
      }

      if (!sessionTokenRef.current && places.AutocompleteSessionToken) {
        sessionTokenRef.current = new places.AutocompleteSessionToken();
      }

      const requestOptions: any = {
        input: query.trim(),
      };
      if (sessionTokenRef.current) {
        requestOptions.sessionToken = sessionTokenRef.current;
      }

      const response = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(requestOptions);

      if (requestIdRef.current !== reqId) {
        return; // Stale response ignored
      }

      const list = response?.suggestions || [];
      const capped = list.slice(0, 5);

      setSuggestions(capped);
      setIsOpen(capped.length > 0);
      setLoading(false);
    } catch (err: any) {
      if (requestIdRef.current !== reqId) return;
      setLoading(false);
      setSuggestions([]);
      setIsOpen(false);

      const msg = String(err?.message || err || '');
      if (msg.includes('Quota') || msg.includes('quota') || msg.includes('rate limit')) {
        setStatusMessage('⚠️ Maps quota reached. Standard input active.');
      } else if (msg.includes('ApiNotActivated') || msg.includes('RefererNotAllowed') || msg.includes('KeyInvalid')) {
        setStatusMessage('⚠️ Maps configuration error. Standard input active.');
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    onChange(newVal);
    setActiveIndex(-1);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!newVal || newVal.trim().length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      setLoading(false);
      setStatusMessage(null);
      return;
    }

    const currentReqId = ++requestIdRef.current;
    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(newVal, currentReqId);
    }, 300);
  };

  const handleSelectSuggestion = (suggestion: any) => {
    const addressText =
      suggestion.placePrediction?.text?.text ||
      suggestion.placePrediction?.text ||
      '';

    if (addressText) {
      onChange(addressText);
    }
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);

    // Reset session token on selection finish
    sessionTokenRef.current = null;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < suggestions.length) {
        handleSelectSuggestion(suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const inputComponent = (
    <div
      ref={containerRef}
      className={`relative flex items-center bg-black/60 border rounded-full transition-all duration-300 ${
        highlighted
          ? 'border-red-500 ring-2 ring-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
          : focused
          ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/30'
          : 'border-[#D4AF37]/25'
      } ${className}`}
    >
      {Icon && (
        <Icon
          className={`absolute left-4 w-4 h-4 transition-all duration-300 z-10 pointer-events-none ${
            focused ? 'text-[#D4AF37] scale-110' : highlighted ? 'text-red-500 scale-110' : 'text-[#D4AF37]/40'
          }`}
        />
      )}

      <input
        id={id}
        type="text"
        required={required}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setFocused(true);
          if (suggestions.length > 0 && value.trim().length >= 3) {
            setIsOpen(true);
          }
        }}
        onBlur={() => setFocused(false)}
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        aria-controls={`${id}-listbox`}
        className={`w-full bg-transparent text-zinc-100 placeholder-transparent focus:outline-none pt-5 pb-2 pr-10 ${
          Icon ? 'pl-11' : 'pl-5'
        }`}
        placeholder={placeholder || label}
        autoComplete="off"
      />

      <label
        htmlFor={id}
        className={`absolute pointer-events-none transition-all duration-300 leading-none ${
          Icon ? 'left-11' : 'left-5'
        } ${
          focused || isFilled
            ? 'top-2 text-[9px] text-[#D4AF37] font-black uppercase tracking-widest z-10'
            : 'top-3.5 text-xs text-zinc-400 font-medium z-10'
        }`}
      >
        {label}
      </label>

      {loading && (
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <Loader2 className="w-4 h-4 text-[#D4AF37] animate-spin" />
        </div>
      )}

      {isOpen && suggestions.length > 0 && (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1.5 bg-zinc-950 border border-[#D4AF37]/30 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto py-1 divide-y divide-zinc-900"
        >
          {suggestions.map((suggestion, index) => {
            const mainText =
              suggestion.placePrediction?.text?.text ||
              suggestion.placePrediction?.text ||
              '';
            const secondaryText =
              suggestion.placePrediction?.structuredFormat?.secondaryText?.text || '';
            const isActive = index === activeIndex;

            return (
              <li
                key={suggestion.placePrediction?.placeId || index}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input blur before click registers
                  handleSelectSuggestion(suggestion);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`px-4 py-2.5 cursor-pointer text-left transition-colors flex items-start gap-2.5 ${
                  isActive ? 'bg-[#D4AF37]/20 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
                }`}
              >
                <MapPin className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-zinc-100 truncate">{mainText}</span>
                  {secondaryText && <span className="text-[10px] text-zinc-400 truncate">{secondaryText}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  if (floating) {
    return (
      <div className="relative w-full">
        {inputComponent}
        {statusMessage && (
          <p className="mt-1 text-[11px] text-amber-400/95 flex items-center gap-1 px-1">
            <span>ℹ️</span> {statusMessage}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <div className="relative flex items-center bg-black border border-[#D4AF37]/30 rounded-xl transition-all">
        {Icon && <Icon className="absolute left-3.5 w-4 h-4 text-[#D4AF37]/50 pointer-events-none z-10" />}
        <input
          id={id}
          type="text"
          required={required}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0 && value.trim().length >= 3) {
              setIsOpen(true);
            }
          }}
          onBlur={() => setFocused(false)}
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={`${id}-listbox`}
          className={`w-full bg-transparent text-zinc-100 focus:outline-none py-2 pr-10 ${Icon ? 'pl-10' : 'pl-4'}`}
          placeholder={placeholder || label}
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <Loader2 className="w-4 h-4 text-[#D4AF37] animate-spin" />
          </div>
        )}
        {isOpen && suggestions.length > 0 && (
          <ul
            id={`${id}-listbox`}
            role="listbox"
            className="absolute left-0 right-0 top-full mt-1.5 bg-zinc-950 border border-[#D4AF37]/30 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto py-1 divide-y divide-zinc-900"
          >
            {suggestions.map((suggestion, index) => {
              const mainText =
                suggestion.placePrediction?.text?.text ||
                suggestion.placePrediction?.text ||
                '';
              const secondaryText =
                suggestion.placePrediction?.structuredFormat?.secondaryText?.text || '';
              const isActive = index === activeIndex;

              return (
                <li
                  key={suggestion.placePrediction?.placeId || index}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectSuggestion(suggestion);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`px-4 py-2.5 cursor-pointer text-left transition-colors flex items-start gap-2.5 ${
                    isActive ? 'bg-[#D4AF37]/20 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100'
                  }`}
                >
                  <MapPin className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs font-semibold text-zinc-100 truncate">{mainText}</span>
                    {secondaryText && <span className="text-[10px] text-zinc-400 truncate">{secondaryText}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {statusMessage && (
        <p className="mt-1 text-[11px] text-amber-400/95 flex items-center gap-1 px-1">
          <span>ℹ️</span> {statusMessage}
        </p>
      )}
    </div>
  );
};

export default LocationAutocomplete;
