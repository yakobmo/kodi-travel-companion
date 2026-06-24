import type { StoredGroupRoute } from "./demoStorage.js";
import { loadDemoStorage, loadDemoStorageAsync, saveDemoStorage, saveDemoStorageAsync } from "./demoStorage.js";

export function loadDemoGroupRoute() {
  return loadDemoStorage().groupRoute ?? null;
}

export async function loadDemoGroupRouteAsync() {
  return (await loadDemoStorageAsync()).groupRoute ?? null;
}

export function saveDemoGroupRoute(route: StoredGroupRoute) {
  saveDemoStorage({
    groupRoute: route
  });
  return route;
}

export async function saveDemoGroupRouteAsync(route: StoredGroupRoute) {
  await saveDemoStorageAsync({
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

export async function resetDemoGroupRouteAsync() {
  await saveDemoStorageAsync({
    groupRoute: null
  });
  return null;
}
