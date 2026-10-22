import { useEffect } from 'react';
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge';

// Rendered only inside the MSAL loginPopup window, at the redirect URI Entra sends it back to.
// msal-browser (v5+) requires this page to actively relay the auth response back to the opener
// over a BroadcastChannel and close itself — without it, loginPopup() in the opener just runs
// until its own timeout, since nothing ever tells it the popup got a response.
const MicrosoftCallback = () => {
  useEffect(() => {
    broadcastResponseToMainFrame().catch(() => {});
  }, []);

  return null;
};

export default MicrosoftCallback;
