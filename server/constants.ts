import { join } from 'node:path'; // For path manipulation

const DEFAULT_PUBLIC_BASE_URL = 'https://erobb221.live';
const DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  DEFAULT_PUBLIC_BASE_URL,
  'https://www.erobb221.live',
];
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

const normalizeBaseUrl = (baseUrl: string) => baseUrl.trim().replace(/\/+$/, '');

// --- Constants ---
export const UPLOADS_DIR = 'uploads';
export const IMAGES_DIR = join(UPLOADS_DIR, 'images');
export const SOUNDS_DIR = join(UPLOADS_DIR, 'sounds');
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // Increased to 10MB
// export const MAX_AUDIO_DURATION_SECONDS = 15; // Removed duration limit
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
// Add common WAV variations to allowed types
export const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/aac', 'audio/flac'];
export const PUBLIC_BASE_URL = normalizeBaseUrl(process.env.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL);
export const CORS_ORIGINS = (process.env.CORS_ORIGINS || DEFAULT_CORS_ORIGINS.join(','))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
export const isAllowedCorsOrigin = (origin: string) => {
  if (CORS_ORIGINS.includes(origin)) {
    return true;
  }

  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
};
export const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH?.trim() || '';
export const DB_VERSION = 10; // Increment version for cases.is_active
