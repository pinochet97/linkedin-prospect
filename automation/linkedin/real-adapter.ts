import { getConfig } from '@/lib/config';
import {
  AutomationError,
  SessionExpiredError,
  type ConnectionRequestResult,
  type ConnectionState,
  type DiscoveredProfile,
  type InboundMessage,
  type LinkedInAdapter,
  type ProfileDetails,
  type SearchInput,
  type SendMessageResult,
} from './adapter';
import { launchBrowser, humanDelay, type BrowserSession } from './browser';
import { requestConnection } from './connect';
import { htmlSnippet } from './helpers';
import { sendMessage } from './messages';
import { openProfile, readConnectionState, readProfile } from './profile';
import { fetchLatestInboundMessage } from './replies';
import { searchPeople } from './search';

/**
 * Implementação real: Playwright + Chromium com perfil persistente.
 *
 * Toda ação passa por `run()`, que abre o browser sob demanda, respeita o
 * intervalo entre ações e, em caso de falha, tira screenshot e anexa um
 * pedaço do HTML — contexto suficiente para investigar sem adivinhação.
 */
export class RealLinkedInAdapter implements LinkedInAdapter {
  readonly name = 'real' as const;
  private session: BrowserSession | null = null;

  private async ensureSession(): Promise<BrowserSession> {
    if (!this.session) {
      this.session = await launchBrowser();
    }
    return this.session;
  }

  private async run<T>(label: string, action: (session: BrowserSession) => Promise<T>): Promise<T> {
    const session = await this.ensureSession();
    const config = getConfig();
    await humanDelay(config.MIN_ACTION_DELAY_MS, config.MAX_ACTION_DELAY_MS);

    try {
      return await action(session);
    } catch (error) {
      if (error instanceof SessionExpiredError) throw error;

      const screenshotPath = await session.screenshot(label);
      const html = await htmlSnippet(session.page);
      const message = error instanceof Error ? error.message : String(error);
      throw new AutomationError(
        message,
        { label, url: session.page.url(), html },
        screenshotPath,
      );
    }
  }

  async searchPeople(input: SearchInput): Promise<DiscoveredProfile[]> {
    return this.run('search', (session) => searchPeople(session.page, input));
  }

  async fetchProfile(profileUrl: string): Promise<ProfileDetails> {
    return this.run('profile', (session) => readProfile(session.page, profileUrl));
  }

  async getConnectionState(profileUrl: string): Promise<ConnectionState> {
    return this.run('connection-state', async (session) => {
      await openProfile(session.page, profileUrl);
      return readConnectionState(session.page);
    });
  }

  async sendConnectionRequest(profileUrl: string, note: string | null): Promise<ConnectionRequestResult> {
    return this.run('connect', (session) => requestConnection(session.page, profileUrl, note));
  }

  async sendMessage(profileUrl: string, body: string): Promise<SendMessageResult> {
    return this.run('message', (session) => sendMessage(session.page, profileUrl, body));
  }

  async fetchLatestInboundMessage(
    profileUrl: string,
    leadFullName: string,
    _since: Date | null,
  ): Promise<InboundMessage | null> {
    return this.run('replies', (session) => fetchLatestInboundMessage(session.page, profileUrl, leadFullName));
  }

  async close(): Promise<void> {
    await this.session?.close();
    this.session = null;
  }
}
