import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type FC,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  Search,
  MapPin,
  Loader2,
  X,
  Compass,
  Check,
  Globe,
  AlertCircle,
  Hash,
} from "lucide-react";
import {
  searchLocations,
  formatGeocodingAddress,
  extractPostalCode,
  type GeocodingResult,
} from "@/services";
import { cn } from "@/lib/utils";

interface LocationSearchProps {
  onSelectLocation: (result: GeocodingResult) => void;
  disabled?: boolean;
}

export const LocationSearch: FC<LocationSearchProps> = ({
  onSelectLocation,
  disabled = false,
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const performSearch = useCallback(
    async (searchTerm: string) => {
      const trimmed = searchTerm.trim();
      if (!trimmed || trimmed.length < 2) {
        setResults([]);
        setIsOpen(false);
        setIsLoading(false);
        setError(null);
        return;
      }

      // Abort any prior request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      setError(null);

      try {
        const data = await searchLocations(
          trimmed,
          10,
          abortControllerRef.current.signal
        );
        setResults(data);
        setIsOpen(true);
        setHighlightedIndex(-1);
      } catch (err: any) {
        if (err.name === "AbortError") return;
        console.error("Geocoding search failed:", err);
        setError("Unable to retrieve locations from Open-Meteo. Please try again.");
        setIsOpen(true);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Debounced auto-search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      performSearch(query);
    }, 380);

    return () => clearTimeout(timer);
  }, [query, performSearch]);

  const handleSelect = (item: GeocodingResult) => {
    onSelectLocation(item);
    setIsOpen(false);
    setQuery("");
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) {
      if (e.key === "Enter") {
        e.preventDefault();
        performSearch(query);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : 0
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : results.length - 1
        );
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < results.length) {
          handleSelect(results[highlightedIndex]);
        } else if (results.length > 0) {
          handleSelect(results[0]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setError(null);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <label
          htmlFor="location-search-input"
          className="text-xs font-medium text-zinc-300 flex items-center gap-1.5"
        >
          <Compass className="w-3.5 h-3.5 text-cyan-400" />
          <span>Location Lookup</span>
          <span className="text-rose-400 font-bold">*</span>
        </label>
        <span className="text-[11px] text-zinc-500 font-mono flex items-center gap-1">
          <Globe className="w-3 h-3 text-cyan-500/70" />
          <span>geocoding-api.open-meteo.com</span>
        </span>
      </div>

      <div className="relative">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 pointer-events-none" />
          <input
            ref={inputRef}
            id="location-search-input"
            type="text"
            value={query}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setQuery(e.target.value)
            }
            onFocus={() => {
              if (results.length > 0 && query.trim().length >= 2) {
                setIsOpen(true);
              }
            }}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Search city, PIN / postal code, or region (e.g. 444203, Shegaon, Pune, 10001)..."
            autoComplete="off"
            className={cn(
              "w-full pl-10 pr-24 py-2.5 rounded-xl bg-zinc-800/40 text-sm text-zinc-100 placeholder:text-zinc-500 border transition-all duration-150 outline-none",
              "border-white/[0.08] hover:border-white/[0.14] focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20",
              isOpen && "border-cyan-500/50 bg-zinc-900/80"
            )}
          />

          <div className="absolute right-2.5 flex items-center gap-1.5">
            {isLoading && (
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            )}

            {query && !isLoading && (
              <button
                type="button"
                id="btn-clear-location-search"
                onClick={handleClear}
                className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              type="button"
              id="btn-trigger-location-search"
              onClick={() => performSearch(query)}
              disabled={disabled || !query.trim() || isLoading}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-cyan-600/80 hover:bg-cyan-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              Search
            </button>
          </div>
        </div>

        {/* Results Dropdown */}
        {isOpen && (
          <div
            id="location-search-results-dropdown"
            className="absolute left-0 right-0 top-full mt-2 z-50 overflow-hidden rounded-2xl border border-white/[0.12] bg-zinc-950/95 backdrop-blur-2xl shadow-2xl divide-y divide-white/[0.04] animate-in fade-in slide-in-from-top-2 duration-150 max-h-80 overflow-y-auto"
          >
            {isLoading ? (
              <div className="p-6 text-center text-sm text-zinc-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Searching Open-Meteo worldwide database...</span>
              </div>
            ) : error ? (
              <div className="p-4 flex items-center gap-2 text-rose-400 text-xs bg-rose-500/[0.04]">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : results.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-400 space-y-1">
                <p className="font-medium text-zinc-300">
                  No matching locations found
                </p>
                <p className="text-zinc-500">
                  Try checking the spelling or searching by a larger city or
                  region.
                </p>
              </div>
            ) : (
              <div>
                <div className="px-3.5 py-2 bg-zinc-900/80 text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                  <span>
                    Found {results.length} location{results.length === 1 ? "" : "s"}
                  </span>
                  <span>Select to auto-fill coordinates & address</span>
                </div>

                <ul className="divide-y divide-white/[0.04]">
                  {results.map((item, index) => {
                    const formatted = formatGeocodingAddress(item);
                    const postalCode = extractPostalCode(item);
                    const isHighlighted = highlightedIndex === index;

                    return (
                      <li key={item.id || `${item.latitude}-${item.longitude}-${index}`}>
                        <button
                          type="button"
                          id={`location-result-${index}`}
                          onClick={() => handleSelect(item)}
                          onMouseEnter={() => setHighlightedIndex(index)}
                          className={cn(
                            "w-full text-left px-4 py-3 flex items-start justify-between gap-3 transition-colors cursor-pointer outline-none",
                            isHighlighted
                              ? "bg-cyan-500/10 text-white"
                              : "hover:bg-white/[0.04] text-zinc-200"
                          )}
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div
                              className={cn(
                                "p-2 rounded-xl shrink-0 mt-0.5 border transition-colors",
                                isHighlighted
                                  ? "bg-cyan-500/20 border-cyan-500/40 text-cyan-300"
                                  : "bg-zinc-800/80 border-white/[0.06] text-zinc-400"
                              )}
                            >
                              <MapPin className="w-4 h-4" />
                            </div>

                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-sm text-white tracking-tight">
                                  {item.name}
                                </span>
                                {item.country_code && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-white/[0.08] text-zinc-300 border border-white/[0.08]">
                                    {item.country_code}
                                  </span>
                                )}
                                {postalCode && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-500/15 text-purple-300 border border-purple-500/20">
                                    <Hash className="w-2.5 h-2.5" />
                                    <span>{postalCode}</span>
                                  </span>
                                )}
                              </div>

                              <p className="text-xs text-zinc-400 truncate">
                                {formatted}
                              </p>

                              <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono">
                                <span>
                                  Lat: {item.latitude.toFixed(4)}°
                                </span>
                                <span>•</span>
                                <span>
                                  Lon: {item.longitude.toFixed(4)}°
                                </span>
                                {item.timezone && (
                                  <>
                                    <span>•</span>
                                    <span>{item.timezone}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-1 self-center">
                            <span className="text-xs font-medium text-cyan-400 hidden sm:inline">
                              Select
                            </span>
                            <Check className="w-4 h-4 text-cyan-400 opacity-0 group-hover:opacity-100" />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
