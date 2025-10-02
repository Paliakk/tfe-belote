import { createAuth0Client, type Auth0Client } from '@auth0/auth0-spa-js';



let client: Auth0Client | null = null

async function getClient(): Promise<Auth0Client> {
  if (client) return client;
  client = await createAuth0Client({
    domain: import.meta.env.VITE_AUTH0_DOMAIN,
    clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
    authorizationParams: {
      audience: import.meta.env.VITE_AUTH0_AUDIENCE,
      redirect_uri: window.location.origin + '/login',
    },
    cacheLocation: 'localstorage',
    useRefreshTokens: true,
    // ← clé pour “Invalid state” (persist la transaction de login même si sessionStorage saute)
    useCookiesForTransactions: true,
  });
  return client;
}

export async function handleRedirectCallbackIfNeeded() {
  // ne traite QUE /login?code&state
  if (window.location.pathname !== '/login') return;
  const qs = new URLSearchParams(window.location.search);
  if (!qs.has('code') || !qs.has('state')) return;

  const c = await getClient();
  const result = await c.handleRedirectCallback();
  const target = (result?.appState as string) || '/lobby';
  // nettoie l’URL puis redirige
  window.history.replaceState({}, document.title, target);
}

export async function login(redirectPath = '/lobby') {
  const c = await getClient()
  await c.loginWithRedirect({
    authorizationParams: { prompt: 'login' },
    appState: redirectPath
  })
}

export async function logout() {
  const c = await getClient()
  await c.logout({ logoutParams: { returnTo: window.location.origin + '/' } })
}

export async function getToken(): Promise<string | null> {
  const c = await getClient()
  try {
    return await c.getTokenSilently({ authorizationParams: { audience: import.meta.env.VITE_AUTH0_AUDIENCE } })
  } catch (e) {
    return null
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const c = await getClient()
  return await c.isAuthenticated()
}