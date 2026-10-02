import { useState, useEffect, useRef } from 'react';

interface Suggestion {
  id: string;
  title: string;
  destination: { name: string; code: string | null };
}

interface SearchBarProps {
  onSelect: (hotelId: string) => void;
  onSearchSubmit: (query: string) => void;
}

export function SearchBar({ onSelect, onSearchSubmit }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (query.length < 2) {
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
              query Autocomplete($query: String) {
                searchHotels(query: $query, take: 5) {
                  id
                  title
                  destination { name code }
                }
              }
            `,
            variables: { query },
          }),
        });
        const { data } = await res.json();
        setSuggestions(data?.searchHotels || []);
        setIsOpen(true);
      } catch (error) {
        console.error('Error fetching suggestions', error);
      } finally {
        setIsLoading(false);
      }
    }, 300); // 300ms debounce

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div className="relative w-full max-w-2xl">
      <div className="flex gap-2">
        <input
          type="text"
          className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
          placeholder="Busca por hotel, destino o código..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSearchSubmit(query)}
        />
        <button
          onClick={() => onSearchSubmit(query)}
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
        >
          Buscar
        </button>
      </div>

      {/* Autocomplete Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
          {isLoading ? (
            <li className="relative cursor-default select-none py-2 px-4 text-slate-700">Cargando...</li>
          ) : (
            suggestions.map((item) => (
              <li
                key={item.id}
                className="relative cursor-pointer select-none py-2 px-4 hover:bg-slate-100"
                onClick={() => {
                  setQuery(item.title);
                  setIsOpen(false);
                  onSelect(item.id);
                }}
              >
                <div className="flex justify-between">
                  <span className="font-medium text-slate-900">{item.title}</span>
                  <span className="text-slate-500">{item.destination.name}</span>
                </div>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}