import axios from 'axios';
import apiClient from '@/services/apiClient';

const BASE_URL = window.APP_CONFIG.apiUrl;

// The active-logo read runs on the logged-out login page, so it goes through a bare instance:
// apiClient's 401 refresh/logout interceptor must never fire for a public lookup.
const publicClient = axios.create({ baseURL: BASE_URL, timeout: 15000 });

// image_path is relative to the API base ("/system-settings/logos/<id>/image").
export const resolveSiteLogoUrl = (imagePath) => {
  if (!imagePath) return null;
  if (/^https?:\/\//i.test(imagePath)) return imagePath;
  const base = String(BASE_URL ?? '').replace(/\/+$/, '');
  return `${base}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
};

export const siteLogoApi = {
  getActive: () => publicClient.get('/system-settings/site-logo').then((r) => r.data?.data ?? null),
  list: () => apiClient.get('/system-settings/logos').then((r) => r.data?.data ?? []),
  upload: ({ file, onUploadProgress }) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient
      .post('/system-settings/logos', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        ...(onUploadProgress && {
          onUploadProgress: (e) => onUploadProgress(e.total ? Math.round((e.loaded / e.total) * 100) : 0),
        }),
      })
      .then((r) => r.data?.data);
  },
  activate: (id) => apiClient.put(`/system-settings/logos/${id}/activate`).then((r) => r.data?.data),
};
