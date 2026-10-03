import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { LinkedInAdapter } from '@/automation/linkedin';
import { getConfig, type Config } from '@/lib/config';
import { getSettings } from '@/lib/db/repositories/settings';
import type { SettingsRow, EnrollmentWithLead } from '@/lib/db/types';
import type { CommunicationProfile, LeadContext } from '@/lib/ai/prompts';

export interface WorkerContext {
  adapter: LinkedInAdapter;
  workerId: string;
  config: Config;
  settings: SettingsRow;
  profile: CommunicationProfile;
}

export function createWorkerId(): string {
  return `${hostname()}-${randomUUID().slice(0, 8)}`;
}

export async function loadContext(adapter: LinkedInAdapter, workerId: string): Promise<WorkerContext> {
  const settings = await getSettings();
  return {
    adapter,
    workerId,
    config: getConfig(),
    settings,
    profile: toCommunicationProfile(settings),
  };
}

export function toCommunicationProfile(settings: SettingsRow): CommunicationProfile {
  return {
    myName: settings.my_name,
    myCompany: settings.my_company,
    myRole: settings.my_role,
    whatIDo: settings.what_i_do,
    targetAudience: settings.target_audience,
    toneOfVoice: settings.tone_of_voice,
    thingsToAvoid: settings.things_to_avoid,
  };
}

export function toLeadContext(enrollment: EnrollmentWithLead): LeadContext {
  return {
    fullName: enrollment.lead.full_name,
    firstName: enrollment.lead.first_name,
    headline: enrollment.lead.headline,
    jobTitle: enrollment.lead.job_title,
    company: enrollment.lead.company,
    location: enrollment.lead.location,
    summary: enrollment.lead.profile_summary,
    segment: enrollment.qualification_segment,
  };
}
