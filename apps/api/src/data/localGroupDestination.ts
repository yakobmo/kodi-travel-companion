import type { StoredGroupDestination } from "./demoStorage.js";
import { loadDemoStorage, loadDemoStorageAsync, saveDemoStorage, saveDemoStorageAsync } from "./demoStorage.js";

export function loadDemoGroupDestination() {
  return loadDemoStorage().groupDestination ?? null;
}

export async function loadDemoGroupDestinationAsync() {
  return (await loadDemoStorageAsync()).groupDestination ?? null;
}

export function saveDemoGroupDestination(destination: StoredGroupDestination) {
  saveDemoStorage({
    groupDestination: destination
  });
  return destination;
}

export async function saveDemoGroupDestinationAsync(destination: StoredGroupDestination) {
  await saveDemoStorageAsync({
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

export async function resetDemoGroupDestinationAsync() {
  await saveDemoStorageAsync({
    groupDestination: null
  });
  return null;
}
