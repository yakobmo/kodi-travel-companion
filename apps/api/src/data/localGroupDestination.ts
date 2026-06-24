import type { StoredGroupDestination } from "./demoStorage.js";
import { loadDemoStorage, saveDemoStorage } from "./demoStorage.js";

export function loadDemoGroupDestination() {
  return loadDemoStorage().groupDestination ?? null;
}

export function saveDemoGroupDestination(destination: StoredGroupDestination) {
  saveDemoStorage({
    groupDestination: destination
  });
  return destination;
}

export function resetDemoGroupDestination() {
  saveDemoStorage({
    groupDestination: null
  });
  return null;
}
