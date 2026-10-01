// Normaliza texto para búsqueda: minúsculas, sin acentos, espacios simples.
// "Cancún  Grand" -> "cancun grand"
// Se usa en DOS lugares y debe ser idéntica en ambos:
//   1) al ESCRIBIR   -> Hotel.searchKey / Destination.searchKey
//   2) al BUSCAR     -> el texto que escribe el usuario en el resolver
export function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita diacríticos
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// "Gran Meliá Cancún" -> "gran-melia-cancun"
export function slugify(input: string): string {
  return normalize(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}