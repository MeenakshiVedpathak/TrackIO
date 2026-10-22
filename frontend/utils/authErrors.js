import { extractFieldErrors } from '@/services/apiClient';

// Maps a 422's field errors onto RHF form controls when a visible input exists for that
// field name; anything else (most commonly `loginType`, which has no visible input on
// Login/Forgot Password — it's implicit from the account-type dialog) comes back as
// `leftover` messages for the caller to show as a toast/banner instead.
export const applyFieldErrors = (error, form, knownFields) => {
  const fieldErrors = extractFieldErrors(error);
  const entries = Object.entries(fieldErrors);
  const leftover = [];
  entries.forEach(([field, message]) => {
    if (knownFields.includes(field)) {
      form.setError(field, { message });
    } else {
      leftover.push(message);
    }
  });
  return { hasFieldErrors: entries.length > 0, leftover };
};
