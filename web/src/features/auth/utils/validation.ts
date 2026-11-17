import { USERNAME_RULE } from '../api/auth-actions'

// Client-side checks that mirror the backend, so most mistakes are caught before a
// round trip. Cognito and the PreSignUp trigger still have the final say.
const USERNAME = /^[a-zA-Z0-9._]{2,30}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Profiles live at the site root (/{username}), so names that are app paths, static files or
// likely future paths are refused. Mirrors api/Domain/ReservedUsernames.cs — change both together.
const RESERVED_USERNAMES = new Set([
  'login', 'signup', 'verify', 'forgot-password', 'search', 'library', 'liked', 'activity',
  'settings', 'upload', 'u', 'tracks', 'albums', 'playlists',
  'assets', 'static', 'public', 'index', 'favicon', 'manifest', 'sw', 'robots', 'sitemap',
  'about', 'help', 'support', 'terms', 'privacy', 'legal', 'contact', 'admin', 'api', 'app',
  'me', 'new', 'home', 'feed', 'explore', 'discover', 'notifications', 'messages', 'inbox',
  'logout', 'signin', 'sign-in', 'sign-up', 'register', 'account', 'profile', 'user', 'users',
  'share', 'shared', 'melomelo', 'www', 'mail', 'blog', 'status', 'docs', 'dev', 'test',
  'suggestions',
])
// A web file extension (sw.js, robots.txt); ordinary dotted names (oisin.kelly) are fine
const FILE_EXTENSION =
  /\.(js|mjs|css|html|htm|json|txt|xml|svg|png|jpg|jpeg|gif|ico|webp|webmanifest|map|woff|woff2|ttf|mp3|m4a|mp4|pdf|zip)$/

export function checkUsername(value: string): string | null {
  const name = value.trim()
  if (!USERNAME.test(name)) return USERNAME_RULE
  const lower = name.toLowerCase()
  if (RESERVED_USERNAMES.has(lower) || FILE_EXTENSION.test(lower)) return "That username isn't available."
  return null
}

export function checkEmail(value: string): string | null {
  return EMAIL.test(value.trim()) ? null : 'Enter a valid email.'
}

// Cognito's default policy (CDK defaults): 8+ chars with each character class
export function checkPassword(value: string): string | null {
  if (value.length < 8) return 'Use at least 8 characters.'
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value))
    return 'Use both upper and lower case letters.'
  if (!/[0-9]/.test(value)) return 'Add a number.'
  if (!/[^a-zA-Z0-9]/.test(value)) return 'Add a symbol.'
  return null
}

export function checkCode(value: string): string | null {
  return /^\d{6}$/.test(value.trim()) ? null : 'Enter the 6-digit code from the email.'
}
