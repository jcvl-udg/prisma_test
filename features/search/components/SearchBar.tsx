import { useState, useEffect, useRef } from 'react';

interface Destination {
  id: string;
  name: string;
  code?: string | null;
}

interface Suggestion {
  id: string;
  label: string;
  sublabel: string;
  type: 'HOTEL' | 'DESTINATION';
}

export interface SearchFilters {
  query: string;
  destinationId?: string;
  checkIn: string;
  checkOut: string;
}

interface SearchBarProps {
  onSearchSubmit: (filters: SearchFilters) => void;
  onDatesChange?: (d: { checkIn: string; checkOut: string }) => void;
}

export function SearchBar({ onSearchSubmit, onDatesChange }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const [selectedDest, setSelectedDest] = useState<Destination | null>(null);
  const [dates, setDates] = useState({ checkIn: '', checkOut: '' });
  const [searchError, setSearchError] = useState('');

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const skipNextFetchRef = useRef(false);

  // Click fuera → cerrar dropdown
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Autocomplete con debounce
  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    if (selectedDest) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    if (query.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `
              query Autocomplete($query: String!, $take: Int) {
                suggestions(query: $query, take: $take) {
                  destinations { id name code }
                  hotels { id title categoryStars destinationName }
                }
              }
            `,
            variables: { query, take: 5 },
          }),
        });
        const { data } = await res.json();
        const dests: Suggestion[] = (data?.suggestions?.destinations ?? []).map(
          (d: { id: string; name: string; code: string | null }) => ({
            id: d.id,
            label: d.name,
            sublabel: d.code ? `Destino · ${d.code}` : 'Destino',
            type: 'DESTINATION',
          }),
        );
        const hotels: Suggestion[] = (data?.suggestions?.hotels ?? []).map(
          (h: { id: string; title: string; destinationName: string }) => ({
            id: h.id,
            label: h.title,
            sublabel: `Hotel · ${h.destinationName}`,
            type: 'HOTEL',
          }),
        );
        setSuggestions([...dests, ...hotels]);
        setIsOpen(true);
        setHighlighted(-1);
      } catch (err) {
        console.error('Error fetching suggestions', err);
      } finally {
        setIsLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, selectedDest]);

  const updateDates = (patch: Partial<typeof dates>) => {
    const next = { ...dates, ...patch };
    setDates(next);
    // Avisamos al padre SOLO si ambas fechas están completas
    onDatesChange?.(next.checkIn && next.checkOut ? next : null as any);
  };

  const clearDest = () => {
    setSelectedDest(null);
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
  };

  const showError = (msg: string) => {
    setSearchError(msg);
    setTimeout(() => setSearchError(''), 3000);
  };

  const fireSearch = () => {
    const trimmed = query.trim();

    // 1. Debe haber algo para buscar: destino fijado o texto ≥ 2
    if (!selectedDest && trimmed.length < 2) {
      showError('Elegí un destino o escribí al menos 2 letras');
      return;
    }
    // 2. Si una fecha está, la otra también
    if (!!dates.checkIn !== !!dates.checkOut) {
      showError('Completá ambas fechas o dejá las dos vacías');
      return;
    }
    // 3. Salida posterior a entrada
    if (dates.checkIn && dates.checkOut && dates.checkOut <= dates.checkIn) {
      showError('La fecha de salida debe ser posterior a la de entrada');
      return;
    }

    onSearchSubmit({
      query: selectedDest ? '' : trimmed,
      destinationId: selectedDest?.id,
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
    });
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsOpen(false);
    fireSearch();
  };

  const commitSuggestion = (s: Suggestion) => {
    setIsOpen(false);
    setSuggestions([]);
    setHighlighted(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    skipNextFetchRef.current = true;

    if (s.type === 'DESTINATION') {
      setSelectedDest({ id: s.id, name: s.label, code: null });
      setQuery('');
    } else {
      setSelectedDest(null);
      setQuery(s.label);
    }

    onSearchSubmit({
      query: s.type === 'HOTEL' ? s.label : '',
      destinationId: s.type === 'DESTINATION' ? s.id : undefined,
      checkIn: dates.checkIn,
      checkOut: dates.checkOut,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (!isOpen || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && highlighted >= 0) {
      e.preventDefault();
      commitSuggestion(suggestions[highlighted]);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full max-w-4xl space-y-2">
      {searchError && (
        <div className="absolute -top-10 left-0 bg-red-100 text-red-600 px-3 py-1 rounded-md text-sm">
          {searchError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-2">
        <div className="relative w-full md:w-1/2">
          {selectedDest ? (
            <div className="flex h-10 w-full items-center justify-between rounded-md border border-slate-300 bg-slate-50 px-3 text-sm">
              <span className="truncate">
                📍 <strong>{selectedDest.name}</strong>
                {selectedDest.code ? ` (${selectedDest.code})` : ''}
              </span>
              <button
                type="button"
                onClick={clearDest}
                aria-label="Quitar destino"
                className="ml-2 rounded-full px-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
              >
                ✕
              </button>
            </div>
          ) : (
            <input
              type="text"
              autoComplete="off"
              role="combobox"
              aria-expanded={isOpen}
              aria-autocomplete="list"
              className="flex h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              placeholder="Busca un destino o hotel..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                if (query.trim().length >= 2 && suggestions.length > 0) setIsOpen(true);
              }}
              onKeyDown={handleKeyDown}
            />
          )}
          {isLoading && !selectedDest && (
            <span className="pointer-events-none absolute right-2 top-3 text-[10px] text-slate-400">
              …
            </span>
          )}
        </div>

        <input
          type="date"
          className="flex h-10 w-full md:w-1/4 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          value={dates.checkIn}
          onChange={(e) => updateDates({ checkIn: e.target.value })}
        />

        <input
          type="date"
          className="flex h-10 w-full md:w-1/4 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
          value={dates.checkOut}
          onChange={(e) => updateDates({ checkOut: e.target.value })}
        />

        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-6 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
        >
          Buscar
        </button>
      </form>

      {isOpen && suggestions.length > 0 && !selectedDest && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-auto rounded-md border bg-white shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.type}-${s.id}`}
              role="option"
              aria-selected={i === highlighted}
              className={`cursor-pointer px-4 py-2 border-b last:border-0 ${
                i === highlighted ? 'bg-slate-100' : 'hover:bg-slate-50'
              }`}
              onMouseEnter={() => setHighlighted(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commitSuggestion(s)}
            >
              <div className="flex flex-col">
                <span className="font-medium text-slate-900">{s.label}</span>
                <span className="text-xs text-slate-500">
                  {s.type === 'DESTINATION' ? '📍 ' : '🏨 '}
                  {s.sublabel}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}