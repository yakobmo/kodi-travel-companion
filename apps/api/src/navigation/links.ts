export interface NavigationTarget {
  lat: number;
  lng: number;
  label?: string;
}

export function createNavigationLinks(target: NavigationTarget) {
  const ll = `${target.lat},${target.lng}`;
  const encodedLl = encodeURIComponent(ll);
  const placeSearchQuery = target.label?.trim() ? `${target.label.trim()} ${ll}` : ll;

  return {
    label: target.label ?? null,
    waze: {
      app: `waze://?ll=${encodedLl}&navigate=yes`,
      web: `https://waze.com/ul?ll=${encodedLl}&navigate=yes`
    },
    googleMapsPlace: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeSearchQuery)}`,
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${encodedLl}&travelmode=driving`,
    googleMapsWalking: `https://www.google.com/maps/dir/?api=1&destination=${encodedLl}&travelmode=walking`
  };
}
