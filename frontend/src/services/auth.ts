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
      scope: 'openid profile email'
    },
    cacheLocation: 'localstorage',
    useRefreshTokens: true
  });
  return client;
}

export async function handleRedirectCallbackIfNeeded() {
  const c = await getClient();

  if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
    // Récupérer appState depuis le retour de handleRedirectCallback
    const result = await c.handleRedirectCallback();
    const raw = (await c.getIdTokenClaims())?.__raw;
    if (raw) sessionStorage.setItem('id_token', raw);
    const target = (result?.appState as string) || '/lobby';

    // Nettoie l'URL et redirige
    history.replaceState({}, document.title, (result?.appState as string) || '/lobby');
  }
}

export async function login(redirectPath = '/lobby') {
  const c = await getClient()
  await c.loginWithRedirect({
    authorizationParams: { prompt: 'login',scope: 'openid profile email' },
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
export async function getIdTokenRaw(): Promise<string | null> {
  const c = await getClient()
  const claims = await c.getIdTokenClaims().catch(() => null)
  return claims?.__raw ?? null
}