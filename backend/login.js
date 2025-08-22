// login.js
(async () => {
  const domain = 'dev-ic6hqtbqegunpxep.eu.auth0.com';
  const clientId = 'WcIzHufRw5OJnrCiXWPknSJHUwzWOL05';
  const audience = 'https://belote-api';

  // ✅ index.html est sous /backend/
  const redirectUri = 'http://127.0.0.1:5500/backend/index.html'

  const auth0Client = await auth0.createAuth0Client({
    domain,
    clientId,
    authorizationParams: {
      audience,
      redirect_uri: redirectUri,
      scope: 'openid profile email'
    },
    cacheLocation: 'localstorage',
    useRefreshTokens: true
  });
  window.auth0Client = auth0Client; // debug

  // Retour de Auth0 (code/state)
  if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
    try {
      await auth0Client.handleRedirectCallback();
    } catch (e) {
      console.error('[auth0] handleRedirectCallback', e);
      alert('Erreur de retour Auth0. Regarde la console.');
    } finally {
      const url = new URL(window.location.href);
      url.searchParams.delete('code'); url.searchParams.delete('state');
      window.history.replaceState({}, document.title, url.toString());
    }
  }


  // Bouton “Se connecter”
  document.getElementById('btn-login')?.addEventListener('click', () => {
    auth0Client.loginWithRedirect({
      authorizationParams: { prompt: 'login' }
    });
  });

  // Déjà connecté ? → récupère un access token API puis va au lobby
  try {
    if (await auth0Client.isAuthenticated()) {
      const token = await auth0Client.getTokenSilently({ authorizationParams: { audience } });
      const idClaims = await auth0Client.getIdTokenClaims();
      const idToken = idClaims?.__raw;
      sessionStorage.setItem('auth_token', token); // game.js lit ceci
      if (idToken) sessionStorage.setItem('id_token', idToken);
      location.replace('/backend/lobby.html');     
    }
  } catch (e) {
    console.error('[auth0] getTokenSilently', e);
  }
})();
