// All write methods (useful for guards, logging, or auditing)
export const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Global API prefix (used for routing and trimming URLs) */
export const API_PREFIX = 'api';

/** Path segment that marks authentication endpoints */
export const AUTH_SEGMENT = 'auth';

/** Regex pattern for versioned routes like /v1, /v2, etc. */
export const VERSION_REGEX = /^v\d+$/i;

// Auth endpoints that should be public in Swagger
export const PUBLIC_AUTH_SUFFIXES = [
  '/auth/login',
  '/auth/refresh',
  '/auth/signup',
];

export const PUBLIC_HEALTH_SUFFIX = 'health';
