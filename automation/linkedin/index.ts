import { getConfig } from '@/lib/config';
import type { LinkedInAdapter } from './adapter';
import { MockLinkedInAdapter } from './mock-adapter';
import { RealLinkedInAdapter } from './real-adapter';

/** Escolhe o adapter conforme LINKEDIN_ADAPTER. Nada mais do sistema decide isso. */
export function createLinkedInAdapter(): LinkedInAdapter {
  return getConfig().LINKEDIN_ADAPTER === 'real' ? new RealLinkedInAdapter() : new MockLinkedInAdapter();
}

export * from './adapter';
