import { useState, useEffect, useRef } from 'react';

interface Destination {
  id: string;
  name: string;
}

interface Suggestion {
  id: string;
  title: string;
  destinationName?: string; 
  type: 'HOTEL' | 'DESTINATION';
}

interface SearchBarProps {
  onSelect: (id: string, type: string) => void;
  onSearchSubmit: (filters: any) => void;
}

export function SearchBar({ onSelect, onSearchSubmit }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Nuevos estados para fechas y validación
  const [selectedDest, setSelectedDest] = useState<Destination | null>(null);
  const [dates, setDates] = useState({ checkIn: '', checkOut: '' });
  const [dateError, setDateError] = useState('');

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

  // Handler para cuando intentan tocar las fechas
  const handleDateInteraction = (e: React.MouseEvent<HTMLInputElement>) => {
    if (!selectedDest) {
      e.preventDefault(); // Evita que se abra el calendario nativo
      setDateError('Selecciona primero un destino para ver disponibilidad');
      
      // Ocultar el error después de 3 segundos
      setTimeout(() => setDateError(''), 3000);
    }
  };

const handleSubmit = () => {
    onSearchSubmit({
      query,
      destinationId: selectedDest?.id,
      checkIn: dates.checkIn,
      checkOut: dates.checkOut
    });
  };

  return (
    <div className="relative w-full max-w-4xl space-y-2">
      {/* Mensaje de error flotante o inline */}
      {dateError && (
        <div className="absolute -top-10 left-0 bg-red-100 text-red-600 px-3 py-1 rounded-md text-sm animate-fade-in-down">
          {dateError}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-2">
        {/* Input de Búsqueda Original */}
        <div className="relative w-full md:w-1/2">
          <input
            type="text"
            className="flex h-10 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            placeholder="Busca un destino o hotel..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Si borran la búsqueda, limpiamos el destino validado
              if (e.target.value === '') setSelectedDest(null);
            }}
          />
          {selectedDest && (
            <span className="absolute right-2 top-2 text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">
              Destino fijado
            </span>
          )}
        </div>

        {/* Inputs de Fechas */}
        <input
          type="date"
          className={`flex h-10 w-full md:w-1/4 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
            !selectedDest ? 'bg-slate-50 border-slate-200 cursor-not-allowed text-slate-400' : 'border-slate-300 focus:ring-slate-900'
          }`}
          value={dates.checkIn}
          onClick={handleDateInteraction}
          onChange={(e) => selectedDest && setDates({ ...dates, checkIn: e.target.value })}
        />
        
        <input
          type="date"
          className={`flex h-10 w-full md:w-1/4 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
            !selectedDest ? 'bg-slate-50 border-slate-200 cursor-not-allowed text-slate-400' : 'border-slate-300 focus:ring-slate-900'
          }`}
          value={dates.checkOut}
          onClick={handleDateInteraction}
          onChange={(e) => selectedDest && setDates({ ...dates, checkOut: e.target.value })}
        />

        <button
          onClick={handleSubmit}
          className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-6 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
        >
          Buscar
        </button>
      </div>

      {/* Autocomplete Dropdown - Adaptado para diferenciar Destinos y Hoteles */}
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white shadow-lg">
          {suggestions.map((item) => (
            <li
              key={item.id}
              className="cursor-pointer py-2 px-4 hover:bg-slate-50 border-b last:border-0"
              onClick={() => {
                setQuery(item.title);
                setIsOpen(false);
                if (item.type === 'DESTINATION') {
                  setSelectedDest({ id: item.id, name: item.title });
                }
                onSelect(item.id, item.type);
              }}
            >
              <div className="flex flex-col">
                <span className="font-medium text-slate-900">{item.title}</span>
                <span className="text-xs text-slate-500">
                  {item.type === 'DESTINATION' ? '📍 Destino' : `🏨 Hotel en ${item.destinationName}`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}