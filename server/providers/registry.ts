import type { ProviderClient } from './types';
import { ProviderNotFoundError } from './types';

export class ProviderRegistry {
  private readonly clients = new Map<string, ProviderClient>();

  register(client: ProviderClient): void {
    const code = client.code.trim().toUpperCase();
    if (!code) throw new Error('El código del provider no puede estar vacío');
    if (this.clients.has(code)) throw new Error(`Provider duplicado: ${code}`);
    this.clients.set(code, client);
  }

  get(providerCode: string): ProviderClient {
    const code = providerCode.trim().toUpperCase();
    const client = this.clients.get(code);
    if (!client) throw new ProviderNotFoundError(code);
    return client;
  }

  list(): ProviderClient[] {
    return [...this.clients.values()];
  }
}
