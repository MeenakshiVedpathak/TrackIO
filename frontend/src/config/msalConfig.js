import { PublicClientApplication } from '@azure/msal-browser';
import { ROUTES } from '@/constants/routes';
 
// Derived at runtime rather than baked in at build time, so the same bundle
// resolves the correct origin on localhost/trackio/rutqa/rut-portal. Each origin
// must still be registered as an SPA redirect URI on the Entra App Registration.
const microsoftRedirectUri = `${window.location.origin}${ROUTES.MICROSOFT_CALLBACK}`;
 
// Multi-tenant: a work/school account from any organization's Entra tenant signs in with this
// same client id, against its own tenant. Who may enter the app is decided by the backend
// (Employee Master), not here.
const microsoftAuthority =
  import.meta.env.VITE_MICROSOFT_AUTHORITY || 'https://login.microsoftonline.com/organizations';
 
export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID,
    authority: microsoftAuthority,
    redirectUri: microsoftRedirectUri,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};
 
export const msalInstance = new PublicClientApplication(msalConfig);
 
 