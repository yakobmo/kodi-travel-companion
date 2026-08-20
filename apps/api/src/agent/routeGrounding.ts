export function areRouteEndpointsGrounded(
  retrievedPlaceIds: Iterable<string>,
  originPlaceId: string,
  destinationPlaceId: string
) {
  const groundedIds = new Set(retrievedPlaceIds);
  return groundedIds.has(originPlaceId) && groundedIds.has(destinationPlaceId);
}
