// server.js
import { Provider } from 'oidc-provider';

const ISSUER = 'http://localhost:9000';

const configuration = {
  // client finto, copia i valori nella tua app
  clients: [{
    client_id: 'dev-client',
    client_secret: 'dev-secret',
    redirect_uris: [
      'http://localhost:3000/callback',
      'http://localhost:4040/api/auth/google/callback',
      'http://localhost:4040/api/auth/microsoft/callback'
    ],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'client_secret_post',
  }],
  features: {
    devInteractions: { enabled: true },           // login UI di test
    rpInitiatedLogout: { enabled: true },
  },
  scopes: ['openid', 'profile', 'email', 'offline_access'],
};

const oidc = new Provider(ISSUER, configuration);
oidc.listen(9000, () => console.log('Mock OIDC su http://localhost:9000'));
