import { MapAppPreference, RouteStop } from '../types/transit';

const PREF_KEY = 'hk_transit_map_pref';

/**
 * Gets saved map preference (defaults to 'google' as requested by user)
 */
export function getSavedMapPreference(): MapAppPreference {
  try {
    const saved = localStorage.getItem(PREF_KEY);
    if (saved === 'apple' || saved === 'google') {
      return saved;
    }
  } catch {
    // fallback
  }
  return 'google';
}

/**
 * Saves map preference
 */
export function setSavedMapPreference(pref: MapAppPreference): void {
  try {
    localStorage.setItem(PREF_KEY, pref);
  } catch (e) {
    console.warn('Failed to save map preference:', e);
  }
}

/**
 * Launches external map app to navigate to the exact departure bus/minibus stop
 * Uses verified official Transport Department WGS84 coordinates (lat, lng)
 * Designed to prevent blank/white screen when returning to iPhone PWA
 */
export function navigateToStop(stop: RouteStop, pref?: MapAppPreference): void {
  const selectedPref = pref || getSavedMapPreference();
  setSavedMapPreference(selectedPref);

  const lat = Number(stop.lat).toFixed(6);
  const lng = Number(stop.lng).toFixed(6);
  // Strip internal KMB/CTB stop codes like (KT318) for clean display label in Apple Maps
  const cleanStopName = stop.nameTc.replace(/\s*\([A-Z0-9]+\)\s*/g, '').trim();
  const encodedLabel = encodeURIComponent(`${cleanStopName} 車站`);

  let url = '';

  if (selectedPref === 'apple') {
    // Apple Maps walking navigation to exact bus stop coordinates with stop label
    url = `https://maps.apple.com/?daddr=${lat},${lng}&q=${encodedLabel}&dirflg=w`;
  } else {
    // Google Maps walking navigation to exact official bus stop WGS84 coordinates
    url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
  }

  // Preserve state snapshot before leaving app
  try {
    sessionStorage.setItem('hk_transit_last_nav_time', Date.now().toString());
  } catch {}

  // Safe opening via dynamic anchor with noopener to avoid blanking the parent iPhone PWA view
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
