import type { StoredGroupRoute } from "./demoStorage.js";
import { loadDemoStorage, saveDemoStorage } from "./demoStorage.js";

export function loadDemoGroupRoute() {
  return loadDemoStorage().groupRoute ?? null;
}

export function saveDemoGroupRoute(route: StoredGroupRoute) {
  saveDemoStorage({
    groupRoute: route
  });
  return route;
}

export function resetDemoGroupRoute() {
  saveDemoStorage({
    groupRoute: null
  });
  return null;
}
