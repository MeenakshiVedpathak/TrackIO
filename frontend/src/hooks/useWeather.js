import { useQuery } from '@tanstack/react-query';

// The banner never shows a city/location line (just icon + temp + condition), so there's no
// reason to prompt the browser for geolocation permission any more — always Pune, India.
const FALLBACK_PLACE = { lat: 18.5204, lon: 73.8567 };

// Open-Meteo (weather) is a free, key-less public API, so this calls it directly with `fetch`
// rather than through the app's axios instance (which is wired for our own backend's
// baseURL/auth, not third-party APIs).
const weatherUrl = (lat, lon) =>
  `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`;

// WMO weather codes → { label, icon }. https://open-meteo.com/en/docs
const WEATHER_CODES = {
  0: { label: 'Clear Sky', icon: '☀️' },
  1: { label: 'Mostly Clear', icon: '🌤️' },
  2: { label: 'Partly Cloudy', icon: '⛅' },
  3: { label: 'Overcast', icon: '☁️' },
  45: { label: 'Foggy', icon: '🌫️' },
  48: { label: 'Foggy', icon: '🌫️' },
  51: { label: 'Light Drizzle', icon: '🌦️' },
  53: { label: 'Drizzle', icon: '🌦️' },
  55: { label: 'Dense Drizzle', icon: '🌦️' },
  56: { label: 'Freezing Drizzle', icon: '🌦️' },
  57: { label: 'Freezing Drizzle', icon: '🌦️' },
  61: { label: 'Light Rain', icon: '🌧️' },
  63: { label: 'Rain', icon: '🌧️' },
  65: { label: 'Heavy Rain', icon: '🌧️' },
  66: { label: 'Freezing Rain', icon: '🌧️' },
  67: { label: 'Freezing Rain', icon: '🌧️' },
  71: { label: 'Light Snow', icon: '🌨️' },
  73: { label: 'Snow', icon: '🌨️' },
  75: { label: 'Heavy Snow', icon: '🌨️' },
  77: { label: 'Snow Grains', icon: '🌨️' },
  80: { label: 'Rain Showers', icon: '🌦️' },
  81: { label: 'Rain Showers', icon: '🌦️' },
  82: { label: 'Heavy Showers', icon: '🌧️' },
  85: { label: 'Snow Showers', icon: '🌨️' },
  86: { label: 'Snow Showers', icon: '🌨️' },
  95: { label: 'Thunderstorm', icon: '⛈️' },
  96: { label: 'Thunderstorm', icon: '⛈️' },
  99: { label: 'Thunderstorm', icon: '⛈️' },
};

// Anything wetter than "overcast" flips the banner into its rainy/stormy visual mode.
const RAINY_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);

async function fetchWeather({ signal }) {
  const res = await fetch(weatherUrl(FALLBACK_PLACE.lat, FALLBACK_PLACE.lon), { signal });
  if (!res.ok) throw new Error('Failed to load weather');
  const data = await res.json();
  const code = data?.current?.weather_code ?? 0;
  const meta = WEATHER_CODES[code] ?? WEATHER_CODES[0];
  return {
    tempC: Math.round(Number(data?.current?.temperature_2m ?? 0)),
    code,
    label: meta.label,
    icon: meta.icon,
    isRainy: RAINY_CODES.has(code),
  };
}

// Polled every 15 min — current conditions don't need to be any fresher than that for a dashboard
// banner, and it keeps this well clear of Open-Meteo's rate limits.
export const useWeather = () =>
  useQuery({
    queryKey: ['weather', 'current-location'],
    queryFn: fetchWeather,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    retry: 1,
  });
