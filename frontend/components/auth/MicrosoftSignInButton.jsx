// Fixed Microsoft identity brand asset — per Microsoft's sign-in button guideline, this keeps
// the exact same white surface / #8C8C8C border / Segoe UI look in both light and dark app
// themes, so it deliberately avoids the app's themed Button/CSS-variable system.
const SEGOE_FONT_STACK = '"Segoe UI", "Segoe UI Web", -apple-system, BlinkMacSystemFont, sans-serif';

const MicrosoftLogo = () => (
  <span className="grid h-5 w-5 shrink-0 grid-cols-2 grid-rows-2 gap-px" aria-hidden="true">
    <span style={{ background: '#F25022' }} />
    <span style={{ background: '#7FBA00' }} />
    <span style={{ background: '#00A4EF' }} />
    <span style={{ background: '#FFB900' }} />
  </span>
);

const Spinner = () => (
  <span
    className="h-[15px] w-[15px] shrink-0 animate-spin rounded-full"
    style={{ border: '2px solid #D9D9D9', borderTopColor: '#5E5E5E' }}
    aria-hidden="true"
  />
);

export const MicrosoftSignInButton = ({ onClick, disabled = false, loading = false }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    style={{ fontFamily: SEGOE_FONT_STACK }}
    className="inline-flex h-[41px] w-full items-center justify-center gap-3 rounded-[4px] border border-[#8C8C8C] bg-white px-4 text-[15px] text-[#5E5E5E] transition-colors hover:bg-[#F3F3F3] focus-visible:shadow-[0_0_0_3px_rgba(20,23,28,0.08),0_0_0_1px_#2B3A67_inset] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55"
  >
    {loading ? <Spinner /> : <MicrosoftLogo />}
    {loading ? 'Signing in…' : 'Sign in with Microsoft'}
  </button>
);

export default MicrosoftSignInButton;
