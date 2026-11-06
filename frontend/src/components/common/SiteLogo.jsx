import { useEffect, useState } from 'react';
import { useSiteLogo } from '@/hooks/useSiteLogo';
import { resolveSiteLogoUrl } from '@/api/siteLogo.api';

export const DEFAULT_LOGO_SRC = '/logo-dark.png';

// The Platform Admin's active logo, or the bundled default while loading, when none is active,
// or when the uploaded image fails to load. `as` lets callers pass motion.img.
const SiteLogo = ({ as: Component = 'img', alt = 'Trackio', ...props }) => {
  const { data } = useSiteLogo();
  const remoteSrc = resolveSiteLogoUrl(data?.image_path);
  const [failedSrc, setFailedSrc] = useState(null);

  useEffect(() => {
    setFailedSrc(null);
  }, [remoteSrc]);

  const src = remoteSrc && remoteSrc !== failedSrc ? remoteSrc : DEFAULT_LOGO_SRC;

  return (
    <Component
      {...props}
      src={src}
      alt={alt}
      onError={() => {
        if (src !== DEFAULT_LOGO_SRC) setFailedSrc(src);
      }}
    />
  );
};

export default SiteLogo;
