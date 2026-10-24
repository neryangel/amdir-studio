import { createMemoryRepositories } from '../data/memoryRepositories';
import type { KeyValueStorage } from '../data/storage';
import { createMockProviders } from '../providers/mocks';
import { createOutbox } from '../providers/outbox';
import type { Studio } from './StudioContext';

/**
 * The single place where adapters are chosen. Going live means replacing the memory repositories
 * and mock providers here with Supabase / real provider adapters that pass the same contracts.
 */
export function createDemoStudio(storage: KeyValueStorage & { persistent?: () => boolean }, now: () => string = () => new Date().toISOString()): Studio {
  const outbox = createOutbox({ storage, now });
  return {
    repos: createMemoryRepositories({ storage, now }),
    providers: createMockProviders({ outbox, now }),
    outbox,
    now,
  };
}
