import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  type ConnectionRequestResult,
  type ConnectionState,
  type DiscoveredProfile,
  type InboundMessage,
  type LinkedInAdapter,
  type ProfileDetails,
  type SearchInput,
  type SendMessageResult,
} from './adapter';

/**
 * LinkedIn falso. Permite rodar o worker inteiro — descoberta, qualificação,
 * convite, aceite, mensagem, follow-up e resposta — sem abrir browser nenhum.
 *
 * O comportamento é determinístico (derivado de um hash da URL do perfil), então
 * a mesma pessoa sempre reage igual e os testes não ficam instáveis.
 */

interface MockState {
  requests: Record<string, { requestedAt: string; checks: number; note: string | null }>;
  connected: Record<string, string>;
  messagesSent: Record<string, string[]>;
  replies: Record<string, { text: string; receivedAt: string }>;
}

const EMPTY_STATE: MockState = { requests: {}, connected: {}, messagesSent: {}, replies: {} };

const FIRST_NAMES = ['Rafael', 'Ana', 'Bruno', 'Carla', 'Diego', 'Fernanda', 'Gustavo', 'Helena', 'Igor', 'Juliana'];
const LAST_NAMES = ['Souza', 'Almeida', 'Ferreira', 'Ribeiro', 'Martins', 'Barbosa', 'Nogueira', 'Teixeira'];
const COMPANIES = ['Clinicorp', 'Nuvemshop', 'Contabilizei', 'Gupy', 'Omie', 'Pipefy', 'Solides', 'Zenvia'];
const TITLES = ['Founder & CEO', 'Co-founder', 'CTO', 'Head de Growth', 'Diretor Comercial', 'CFO'];
const CITIES = ['São Paulo, SP', 'Florianópolis, SC', 'Belo Horizonte, MG', 'Curitiba, PR', 'Recife, PE'];

export interface MockOptions {
  /** Proporção de convites que são aceitos. */
  acceptRate: number;
  /** Quantas verificações até o aceite acontecer. */
  acceptAfterChecks: number;
  /** Proporção de leads que respondem depois da primeira mensagem. */
  replyRate: number;
  seed: string;
  statePath: string | null;
}

const DEFAULTS: MockOptions = {
  acceptRate: 0.7,
  acceptAfterChecks: 1,
  replyRate: 0.35,
  seed: 'mock',
  statePath: '.data/mock-linkedin.json',
};

function hashRatio(seed: string, value: string): number {
  const digest = createHash('sha256').update(`${seed}:${value}`).digest();
  return digest.readUInt32BE(0) / 0xffffffff;
}

function pick<T>(items: T[], seed: string, value: string): T {
  return items[Math.floor(hashRatio(seed, value) * items.length) % items.length];
}

export class MockLinkedInAdapter implements LinkedInAdapter {
  readonly name = 'mock' as const;
  private readonly options: MockOptions;
  private state: MockState;

  constructor(options: Partial<MockOptions> = {}) {
    this.options = { ...DEFAULTS, ...options };
    this.state = this.load();
  }

  private load(): MockState {
    if (!this.options.statePath) return structuredClone(EMPTY_STATE);
    try {
      return { ...structuredClone(EMPTY_STATE), ...JSON.parse(readFileSync(this.options.statePath, 'utf8')) };
    } catch {
      return structuredClone(EMPTY_STATE);
    }
  }

  private save(): void {
    if (!this.options.statePath) return;
    mkdirSync(dirname(this.options.statePath), { recursive: true });
    writeFileSync(this.options.statePath, JSON.stringify(this.state, null, 2));
  }

  async searchPeople(input: SearchInput): Promise<DiscoveredProfile[]> {
    const source = input.searchUrl ?? input.query ?? 'busca';
    const profiles: DiscoveredProfile[] = [];
    for (let index = 0; index < input.limit; index += 1) {
      const key = `${source}#${index}`;
      const first = pick(FIRST_NAMES, this.options.seed, `first:${key}`);
      const last = pick(LAST_NAMES, this.options.seed, `last:${key}`);
      const company = pick(COMPANIES, this.options.seed, `company:${key}`);
      const title = pick(TITLES, this.options.seed, `title:${key}`);
      const slug = `${first}-${last}-${index}`.toLowerCase();
      profiles.push({
        linkedinUrl: `https://www.linkedin.com/in/${slug}`,
        fullName: `${first} ${last}`,
        headline: `${title} na ${company}`,
        jobTitle: title,
        company,
        location: pick(CITIES, this.options.seed, `city:${key}`),
      });
    }
    return profiles;
  }

  async fetchProfile(profileUrl: string): Promise<ProfileDetails> {
    const [first, last] = (profileUrl.split('/in/')[1] ?? 'lead-mock').split('-');
    const company = pick(COMPANIES, this.options.seed, `company:${profileUrl}`);
    const title = pick(TITLES, this.options.seed, `title:${profileUrl}`);
    return {
      linkedinUrl: profileUrl,
      fullName: `${capitalize(first)} ${capitalize(last ?? '')}`.trim(),
      headline: `${title} na ${company}`,
      jobTitle: title,
      company,
      location: pick(CITIES, this.options.seed, `city:${profileUrl}`),
      summary: `Perfil simulado de ${title} na ${company}.`,
      connectionState: await this.getConnectionState(profileUrl),
    };
  }

  async getConnectionState(profileUrl: string): Promise<ConnectionState> {
    if (this.state.connected[profileUrl]) return 'connected';

    const request = this.state.requests[profileUrl];
    if (!request) return 'not_connected';

    request.checks += 1;
    const willAccept = hashRatio(this.options.seed, `accept:${profileUrl}`) < this.options.acceptRate;
    if (willAccept && request.checks >= this.options.acceptAfterChecks) {
      this.state.connected[profileUrl] = new Date().toISOString();
      this.save();
      return 'connected';
    }
    this.save();
    return 'pending';
  }

  async sendConnectionRequest(profileUrl: string, note: string | null): Promise<ConnectionRequestResult> {
    if (this.state.connected[profileUrl]) return { outcome: 'already_connected' };
    if (this.state.requests[profileUrl]) return { outcome: 'already_pending' };

    this.state.requests[profileUrl] = { requestedAt: new Date().toISOString(), checks: 0, note };
    this.save();
    return { outcome: 'sent', noteSent: Boolean(note) };
  }

  async sendMessage(profileUrl: string, body: string): Promise<SendMessageResult> {
    if (!this.state.connected[profileUrl]) {
      return { outcome: 'unavailable', message: 'Não é conexão no mock.' };
    }

    const sent = this.state.messagesSent[profileUrl] ?? [];
    sent.push(body);
    this.state.messagesSent[profileUrl] = sent;

    // Depois da primeira mensagem, parte dos leads responde.
    const willReply = hashRatio(this.options.seed, `reply:${profileUrl}`) < this.options.replyRate;
    if (willReply && !this.state.replies[profileUrl]) {
      this.state.replies[profileUrl] = {
        text: 'Opa, tudo bem? Faz sentido sim, me manda mais detalhes.',
        receivedAt: new Date().toISOString(),
      };
    }

    this.save();
    return { outcome: 'sent' };
  }

  async fetchLatestInboundMessage(profileUrl: string, since: Date | null): Promise<InboundMessage | null> {
    const reply = this.state.replies[profileUrl];
    if (!reply) return null;
    const receivedAt = new Date(reply.receivedAt);
    if (since && receivedAt <= since) return null;
    return { text: reply.text, receivedAt };
  }

  async close(): Promise<void> {
    this.save();
  }

  /** Só para testes: força um estado. */
  forceConnected(profileUrl: string): void {
    this.state.connected[profileUrl] = new Date().toISOString();
    this.save();
  }

  forceReply(profileUrl: string, text: string): void {
    this.state.replies[profileUrl] = { text, receivedAt: new Date().toISOString() };
    this.save();
  }
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}
