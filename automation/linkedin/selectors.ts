/**
 * Todos os seletores do LinkedIn ficam aqui. Nada de string CSS espalhada
 * pelo projeto.
 *
 * Ordem de preferência ao procurar um elemento:
 *   1. role + nome acessível (getByRole)
 *   2. aria-label
 *   3. texto visível
 *   4. CSS (último recurso, e sempre com alternativas)
 *
 * O LinkedIn muda classes com frequência; role e aria-label sobrevivem muito
 * mais. Quando nada for encontrado, o helper falha com screenshot em vez de
 * clicar em algo aleatório.
 */

export const LinkedInUrls = {
  home: 'https://www.linkedin.com/feed/',
  login: 'https://www.linkedin.com/login',
  peopleSearch: (keywords: string) =>
    `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}&origin=GLOBAL_SEARCH_HEADER`,
};

/** Nomes acessíveis aceitos (pt-BR e en). */
export const LinkedInText = {
  connect: [/^conectar$/i, /^connect$/i],
  addNote: [/adicionar nota/i, /add a note/i, /add note/i],
  sendWithoutNote: [/enviar sem nota/i, /send without a note/i],
  send: [/^enviar$/i, /^send$/i, /^enviar convite$/i, /^send invitation$/i, /^enviar agora$/i],
  message: [/^mensagem$/i, /^message$/i],
  more: [/^mais$/i, /^more$/i, /mais ações/i, /more actions/i],
  pending: [/^pendente$/i, /^pending$/i, /convite enviado/i, /invitation sent/i],
  following: [/^seguindo$/i, /^following$/i],
  dismiss: [/^fechar$/i, /^dismiss$/i, /^close$/i],
};

export const LinkedInSelectors = {
  /** Presença = a sessão está válida. */
  signedInMarker: [
    'header.global-nav',
    '#global-nav',
    'nav.global-nav',
    '[data-test-global-nav]',
  ],
  /** Presença = fomos deslogados ou caímos num checkpoint. */
  signedOutMarker: [
    'form.login__form',
    'input[name="session_key"]',
    '#username',
    '.authwall',
    '[data-test-id="checkpoint-challenge"]',
  ],

  searchResultItem: [
    'ul[role="list"] > li div[data-view-name="search-entity-result-universal-template"]',
    'li.reusable-search__result-container',
    'div.search-results-container li',
  ],
  searchResultProfileLink: 'a[href*="/in/"]',
  searchNextPage: 'button[aria-label*="Avançar"], button[aria-label*="Next"]',

  profileName: ['h1', '.text-heading-xlarge'],
  profileHeadline: ['.text-body-medium.break-words', '[data-generated-suggestion-target] .text-body-medium'],
  profileLocation: ['.text-body-small.inline.t-black--light.break-words', 'span.text-body-small.inline'],
  profileTopCard: ['section.artdeco-card', 'main section:first-of-type'],
  profileCurrentCompany: [
    'button[aria-label*="Empresa atual"] span',
    'button[aria-label*="Current company"] span',
    'div.pv-text-details__right-panel span',
  ],
  profileAbout: ['div#about ~ div .display-flex.full-width span[aria-hidden="true"]', 'section:has(div#about) span[aria-hidden="true"]'],
  profileDistanceBadge: ['span.dist-value', '.distance-badge span.dist-value', 'span.artdeco-entity-lockup__degree'],

  connectModal: ['div[role="dialog"]', '.artdeco-modal'],
  connectNoteTextarea: ['textarea[name="message"]', 'textarea#custom-message', 'div[role="dialog"] textarea'],

  messageOverlayComposer: [
    'div.msg-form__contenteditable[contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
  ],
  messageSendButton: ['button.msg-form__send-button', 'button[type="submit"].msg-form__send-btn'],
  messageThreadItem: ['li.msg-s-message-list__event', 'div.msg-s-event-listitem'],
  messageThreadSenderName: ['.msg-s-message-group__name', '.msg-s-event-listitem__name'],
  messageThreadBody: ['p.msg-s-event-listitem__body', 'div.msg-s-event__content p'],
  messageThreadTimestamp: ['time.msg-s-message-group__timestamp', 'time'],
} as const;
