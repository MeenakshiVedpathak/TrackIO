// Purely decorative — the sun/mountain flourish from the reference design, next to the
// greeting header. No data, so it's a flat inline SVG rather than a real chart component.
const GreetingIllustration = ({ className }) => (
  <svg viewBox="0 0 160 90" className={className} aria-hidden="true">
    <circle cx="128" cy="26" r="34" fill="#fef3c7" opacity="0.5" />
    <circle cx="128" cy="26" r="14" fill="#fbbf24" />
    <g stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round">
      <line x1="128" y1="2" x2="128" y2="8" />
      <line x1="128" y1="44" x2="128" y2="50" />
      <line x1="104" y1="26" x2="110" y2="26" />
      <line x1="146" y1="26" x2="152" y2="26" />
      <line x1="111" y1="9" x2="115" y2="13" />
      <line x1="141" y1="39" x2="145" y2="43" />
      <line x1="145" y1="9" x2="141" y2="13" />
      <line x1="115" y1="39" x2="111" y2="43" />
    </g>
    <g fill="#ffffff" opacity="0.9">
      <ellipse cx="30" cy="20" rx="14" ry="8" />
      <ellipse cx="42" cy="18" rx="10" ry="7" />
      <ellipse cx="20" cy="24" rx="9" ry="6" />
    </g>
    <path d="M0 78 L28 40 L52 64 L70 34 L96 78 Z" fill="#bfdbfe" />
    <path d="M20 90 L54 46 L82 78 L104 50 L140 90 Z" fill="#60a5fa" />
    <path d="M54 46 L60 56 L48 56 Z" fill="#ffffff" />
    <path d="M104 50 L110 60 L98 60 Z" fill="#ffffff" />
    <rect x="0" y="86" width="160" height="4" fill="#dbeafe" />
  </svg>
);

export default GreetingIllustration;
