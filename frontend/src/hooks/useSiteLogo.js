import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { siteLogoApi } from '@/api/siteLogo.api';
import { QUERY_KEYS } from '@/constants/queryKeys';

// Public, so it also serves the logged-out login page. A failure just means "no active logo".
export const useSiteLogo = () =>
  useQuery({
    queryKey: QUERY_KEYS.SITE_LOGO,
    queryFn: siteLogoApi.getActive,
    staleTime: 5 * 60_000,
    retry: false,
  });

export const useSiteLogos = () =>
  useQuery({
    queryKey: QUERY_KEYS.SITE_LOGOS,
    queryFn: siteLogoApi.list,
  });

export const useUploadSiteLogo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: siteLogoApi.upload,
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.SITE_LOGOS }),
  });
};

export const useActivateSiteLogo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: siteLogoApi.activate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site-logo'] }),
  });
};
