interface RouteGroundingPlace {
  id: string;
  name: string;
  address?: string;
  note?: string;
  tags?: string[];
}

function normalize(value: string) {
  return value.toLocaleLowerCase("he").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function meaningfulTokens(value: string) {
  return new Set(
    normalize(value)
      .split(/\s+/u)
      .filter((token) => token.length >= 3)
      .map((token) => (/^[בלמוכשה]/u.test(token) && token.length >= 4 ? token.slice(1) : token))
  );
}

export function getRouteGroundedPlaceIds(message: string, places: RouteGroundingPlace[]) {
  const normalizedMessage = normalize(message);
  const messageTokens = meaningfulTokens(message);

  return new Set(
    places
      .filter((place) => {
        const exactFields = [place.name, place.address].filter((value): value is string => Boolean(value));
        if (exactFields.some((value) => normalize(value).length >= 4 && normalizedMessage.includes(normalize(value)))) {
          return true;
        }

        const searchable = [place.name, place.address, place.note, ...(place.tags ?? [])]
          .filter((value): value is string => Boolean(value))
          .join(" ");
        const overlap = [...meaningfulTokens(searchable)].filter((token) => messageTokens.has(token));
        return overlap.length >= 2;
      })
      .map((place) => place.id)
  );
}

export function areRouteEndpointsGrounded(
  groundedPlaceIds: Iterable<string>,
  originPlaceId: string,
  destinationPlaceId: string
) {
  const groundedIds = new Set(groundedPlaceIds);
  return groundedIds.has(originPlaceId) && groundedIds.has(destinationPlaceId);
}
