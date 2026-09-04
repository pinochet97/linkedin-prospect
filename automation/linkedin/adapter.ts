/**
 * Contrato único entre o motor e o LinkedIn.
 *
 * Duas implementações:
 *   - MockLinkedInAdapter  (nenhum browser; desenvolvimento e testes)
 *   - RealLinkedInAdapter  (Playwright + Chromium com perfil persistente)
 *
 * Nenhuma camada acima daqui conhece Playwright ou seletores.
 */

export type ConnectionState = 'connected' | 'pending' | 'not_connected' | 'unknown';

export interface DiscoveredProfile {
  linkedinUrl: string;
  fullName: string;
  headline?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  location?: string | null;
}

export interface ProfileDetails extends DiscoveredProfile {
  summary?: string | null;
  connectionState: ConnectionState;
}

export interface SearchInput {
  searchUrl?: string | null;
  query?: string | null;
  limit: number;
}

export type ConnectionRequestOutcome =
  | 'sent'
  | 'dry_run'
  | 'already_pending'
  | 'already_connected'
  | 'unavailable';

export interface ConnectionRequestResult {
  outcome: ConnectionRequestOutcome;
  message?: string;
  /** Se a nota não coube / não estava disponível, o convite vai sem nota. */
  noteSent?: boolean;
}

export type SendMessageOutcome = 'sent' | 'dry_run' | 'unavailable';

export interface SendMessageResult {
  outcome: SendMessageOutcome;
  message?: string;
}

export interface InboundMessage {
  text: string;
  receivedAt: Date;
}

export interface LinkedInAdapter {
  readonly name: 'mock' | 'real';

  searchPeople(input: SearchInput): Promise<DiscoveredProfile[]>;

  fetchProfile(profileUrl: string): Promise<ProfileDetails>;

  getConnectionState(profileUrl: string): Promise<ConnectionState>;

  /** Precisa ser idempotente: se já existe convite/conexão, NÃO envia outro. */
  sendConnectionRequest(profileUrl: string, note: string | null): Promise<ConnectionRequestResult>;

  sendMessage(profileUrl: string, body: string): Promise<SendMessageResult>;

  /** Última mensagem RECEBIDA do lead (ignora as que nós enviamos). */
  fetchLatestInboundMessage(profileUrl: string, since: Date | null): Promise<InboundMessage | null>;

  close(): Promise<void>;
}

/** Erro esperado da automação: já vem com contexto para o log. */
export class AutomationError extends Error {
  constructor(
    message: string,
    readonly context: Record<string, unknown> = {},
    readonly screenshotPath: string | null = null,
  ) {
    super(message);
    this.name = 'AutomationError';
  }
}

/** A sessão do LinkedIn caiu — pausa a automação em vez de tentar de novo. */
export class SessionExpiredError extends AutomationError {
  constructor(message = 'Sessão do LinkedIn expirada. Rode `npm run linkedin:login`.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}
