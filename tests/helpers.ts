import type { EnrollmentFacts } from '@/lib/engine/types';

export const NOW = new Date('2026-09-04T12:00:00.000Z');

export function hoursFromNow(hours: number, from: Date = NOW): Date {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

export function facts(overrides: Partial<EnrollmentFacts> = {}): EnrollmentFacts {
  return {
    qualificationScore: null,
    connectionStatus: 'unknown',
    connectionRequestedAt: null,
    connectedAt: null,
    firstMessageSentAt: null,
    followup1SentAt: null,
    followup2SentAt: null,
    repliedAt: null,
    sequenceStopped: false,
    interestStatus: null,
    retryCount: 0,
    lastAttemptAt: null,
    manualError: false,
    ...overrides,
  };
}
