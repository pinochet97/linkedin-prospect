/**
 * Nome do cookie de sessão isolado num módulo sem dependências de Node —
 * o middleware roda no runtime Edge e não pode importar `node:crypto`.
 */
export const SESSION_COOKIE = 'lp_session';
