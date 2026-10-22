// Layered wave-ribbon backdrop for the mobile auth hero (dark navy tone, behind the logo) and
// the mobile auth footer (light blue-on-white tone, behind the copyright line) — see the
// reference mock AuthLayout.jsx follows for the mobile branding header. Purely decorative:
// `aria-hidden`, and always positioned by the caller (`absolute` + a sized wrapper on top of a
// `relative overflow-hidden` parent), never affecting layout itself.
// `preserveAspectRatio="none"` is deliberate — these are abstract flowing bands, not a photo, so
// stretching non-uniformly to exactly fill whatever width/height the caller gives it (any phone
// aspect ratio) reads fine and keeps this a single reusable viewBox instead of one per breakpoint.
const AuthHeroWaves = ({ tone = 'dark', className = '' }) => {
  const fill = tone === 'dark' ? '#ffffff' : 'hsl(221 83% 53%)';
  const opacities = tone === 'dark' ? [0.05, 0.07, 0.1] : [0.05, 0.07, 0.09];

  return (
    <svg viewBox="0 0 1440 800" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path d="M0,430 C240,510 480,350 720,410 C960,470 1200,350 1440,430 L1440,800 L0,800 Z" fill={fill} fillOpacity={opacities[0]} />
      <path d="M0,500 C240,580 480,420 720,480 C960,540 1200,420 1440,500 L1440,800 L0,800 Z" fill={fill} fillOpacity={opacities[1]} />
      <path d="M0,570 C240,640 480,490 720,550 C960,610 1200,490 1440,570 L1440,800 L0,800 Z" fill={fill} fillOpacity={opacities[2]} />
    </svg>
  );
};

export default AuthHeroWaves;
