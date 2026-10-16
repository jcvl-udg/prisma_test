import type { SearchFilterState } from '../filter-state';

export type FacetOption = { value: string; count: number };
export type SearchFacets = {
  stars: FacetOption[];
  propertyTypes: FacetOption[];
  themes: FacetOption[];
  amenities: FacetOption[];
  boardTypes: FacetOption[];
  cancellationTypes: FacetOption[];
};

interface HotelFilterPanelProps {
  filters: SearchFilterState;
  facets?: SearchFacets;
  onChange: (filters: SearchFilterState) => void;
}

function title(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function FacetGroup({
  title: heading,
  name,
  facets,
  selected,
  onToggle,
}: {
  title: string;
  name: string;
  facets: FacetOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const options = [
    ...facets,
    ...selected
      .filter((value) => !facets.some((facet) => facet.value === value))
      .map((value) => ({ value, count: 0 })),
  ];
  if (options.length === 0) return null;

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold text-slate-900">{heading}</legend>
      {options.map(({ value, count }) => (
        <label key={value} className="flex items-center justify-between gap-3 text-sm text-slate-700">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              name={name}
              value={value}
              checked={selected.includes(value)}
              onChange={() => onToggle(value)}
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-700"
            />
            {title(value)}
          </span>
          <span className="text-xs text-slate-500">{count}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function HotelFilterPanel({ filters, facets, onChange }: HotelFilterPanelProps) {
  const toggle = (key: 'propertyTypes' | 'themes' | 'amenities' | 'boardTypes' | 'cancellationTypes', value: string) => {
    const values = filters[key];
    onChange({
      ...filters,
      [key]: values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value],
      after: '',
      before: '',
    });
  };

  return (
    <aside
      aria-label="Filtros de hoteles"
      className="space-y-5 rounded-lg border border-slate-200 bg-white p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Filtros</h2>
        <button
          type="button"
          onClick={() =>
            onChange({
              ...filters,
              minStars: undefined,
              minRating: undefined,
              minPrice: undefined,
              maxPrice: undefined,
              propertyTypes: [],
              themes: [],
              amenities: [],
              boardTypes: [],
              cancellationTypes: [],
              after: '',
              before: '',
            })
          }
          className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
        >
          Limpiar filtros
        </button>
      </div>

      <div className="space-y-2">
        <label htmlFor="filter-min-stars" className="block text-sm font-semibold text-slate-900">
          Estrellas mínimas
        </label>
        <select
          id="filter-min-stars"
          value={filters.minStars ?? ''}
          onChange={(event) =>
            onChange({
              ...filters,
              minStars: event.target.value ? Number(event.target.value) : undefined,
              after: '',
              before: '',
            })
          }
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Cualquier categoría</option>
          {[...(facets?.stars ?? [])]
            .sort((a, b) => Number(a.value) - Number(b.value))
            .map(({ value, count }) => (
              <option key={value} value={value}>
                {value} estrellas ({count})
              </option>
            ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-sm text-slate-700">
          <span className="block font-medium">Precio mínimo</span>
          <input
            aria-label="Precio mínimo"
            type="number"
            min="0"
            inputMode="decimal"
            value={filters.minPrice ?? ''}
            onChange={(event) =>
              onChange({
                ...filters,
                minPrice: event.target.value ? Number(event.target.value) : undefined,
                after: '',
                before: '',
              })
            }
            className="w-full rounded-md border border-slate-300 px-2 py-2"
          />
        </label>
        <label className="space-y-1 text-sm text-slate-700">
          <span className="block font-medium">Precio máximo</span>
          <input
            aria-label="Precio máximo"
            type="number"
            min="0"
            inputMode="decimal"
            value={filters.maxPrice ?? ''}
            onChange={(event) =>
              onChange({
                ...filters,
                maxPrice: event.target.value ? Number(event.target.value) : undefined,
                after: '',
                before: '',
              })
            }
            className="w-full rounded-md border border-slate-300 px-2 py-2"
          />
        </label>
      </div>

      <div className="space-y-2">
        <label htmlFor="filter-min-rating" className="block text-sm font-semibold text-slate-900">
          Calificación mínima
        </label>
        <select
          id="filter-min-rating"
          value={filters.minRating ?? ''}
          onChange={(event) =>
            onChange({
              ...filters,
              minRating: event.target.value ? Number(event.target.value) : undefined,
              after: '',
              before: '',
            })
          }
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Cualquier calificación</option>
          {[6, 7, 8, 9].map((rating) => (
            <option key={rating} value={rating}>{rating}+ de 10</option>
          ))}
        </select>
      </div>

      {facets && (
        <>
          <FacetGroup
            title="Tipo de alojamiento"
            name="propertyType"
            facets={facets.propertyTypes}
            selected={filters.propertyTypes}
            onToggle={(value) => toggle('propertyTypes', value)}
          />
          <FacetGroup
            title="Temas"
            name="theme"
            facets={facets.themes}
            selected={filters.themes}
            onToggle={(value) => toggle('themes', value)}
          />
          <FacetGroup
            title="Servicios"
            name="amenity"
            facets={facets.amenities}
            selected={filters.amenities}
            onToggle={(value) => toggle('amenities', value)}
          />
          <FacetGroup
            title="Plan de alimentos"
            name="boardType"
            facets={facets.boardTypes}
            selected={filters.boardTypes}
            onToggle={(value) => toggle('boardTypes', value)}
          />
          <FacetGroup
            title="Cancelación"
            name="cancellationType"
            facets={facets.cancellationTypes}
            selected={filters.cancellationTypes}
            onToggle={(value) => toggle('cancellationTypes', value)}
          />
        </>
      )}
    </aside>
  );
}
