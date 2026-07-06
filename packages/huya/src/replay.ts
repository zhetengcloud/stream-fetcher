export interface ReplayMarkers {
  startsWith: readonly string[];
  endsWith: readonly string[];
}

/** Returns true if the title matches replay markers. */
export function isReplay(title: string, markers: ReplayMarkers): boolean {
  return markers.startsWith.some((m) => title.startsWith(m)) ||
    markers.endsWith.some((m) => title.endsWith(m));
}
