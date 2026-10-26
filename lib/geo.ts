// Simplified outlines and city positions for the route map. Coordinates are [lat, lon];
// the outlines are deliberately coarse (a schematic, not a navigation map).
export type LatLon = [number, number];

const BOUNDS = { west: -5.8, east: 15.6, north: 56, south: 42.3 };
const LON_SCALE = Math.cos((50 * Math.PI) / 180); // equirectangular, corrected at ~50°N

export const MAP_W = 520;
export const MAP_H = Math.round(((BOUNDS.north - BOUNDS.south) / ((BOUNDS.east - BOUNDS.west) * LON_SCALE)) * MAP_W);

export function project([lat, lon]: LatLon): [number, number] {
  const x = ((lon - BOUNDS.west) / (BOUNDS.east - BOUNDS.west)) * MAP_W;
  const y = ((BOUNDS.north - lat) / (BOUNDS.north - BOUNDS.south)) * MAP_H;
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

export const toPath = (pts: LatLon[]) => pts.map((p, i) => `${i ? "L" : "M"}${project(p).join(",")}`).join("") + "Z";

export const OUTLINES: Record<string, LatLon[]> = {
  "United Kingdom": [[55.8,-2],[54.9,-1.4],[54.5,-0.6],[53.6,0.1],[53,0.3],[52.9,1.6],[52.4,1.75],[51.9,1.3],[51.4,1.4],[51.1,1.3],[50.8,0.3],[50.7,-1],[50.6,-2.4],[50.2,-3.8],[50,-5.2],[50.6,-4.8],[51.2,-4.2],[51.5,-3.2],[51.7,-5.1],[52.1,-4.5],[52.8,-4.6],[53.3,-4.2],[53.3,-3],[53.9,-3],[54.5,-3.6],[54.9,-3.2],[55,-4.9],[55.8,-4.9]],
  France: [[51.05,2.5],[50.9,1.6],[50.2,1.6],[49.7,0.2],[49.4,-0.2],[49.7,-1.3],[48.65,-1.6],[48.8,-3],[48.5,-4.7],[47.8,-4.2],[47.3,-2.5],[46.5,-1.8],[45.6,-1.2],[44.6,-1.25],[43.5,-1.5],[43.3,-0.5],[42.7,1.5],[42.5,3.1],[43.3,3.5],[43.4,5],[43.1,6.4],[43.7,7.5],[44.2,7.6],[45.1,6.8],[45.9,6.9],[46.4,6.2],[47.5,7],[48,7.6],[49,8.2],[49.4,6.6],[49.5,5.8],[50.1,4.8],[50.2,4.1],[50.7,3.2]],
  Belgium: [[51.3,3.4],[51.05,2.5],[50.7,3.2],[50.2,4.1],[50.1,4.8],[49.5,5.8],[50.1,6.1],[50.8,5.9],[51.4,5]],
  Netherlands: [[53.4,6.9],[53.2,7.2],[52.4,7],[51.8,6],[51.2,6.1],[50.8,5.9],[51.4,5],[51.3,3.4],[51.7,3.7],[52.3,4.5],[52.9,4.7],[53.3,5.2],[53.4,6]],
  Germany: [[54.9,8.3],[54.8,9.9],[54.4,11],[54.1,12],[54.4,13.4],[53.9,14.2],[52.8,14.1],[52.3,14.7],[51.5,15],[50.9,14.8],[50.3,12.2],[49,13.8],[48.6,13.6],[47.6,13],[47.5,10.2],[47.6,7.6],[48,7.6],[49,8.2],[49.4,6.6],[50.1,6.1],[50.8,5.9],[51.2,6.1],[51.8,6],[52.4,7],[53.2,7.2],[53.6,7.1],[53.9,8.6]],
};

export const CITIES: Record<string, LatLon> = {
  London: [51.51, -0.13], Manchester: [53.48, -2.24], Birmingham: [52.49, -1.89], Leeds: [53.8, -1.55],
  Berlin: [52.52, 13.4], Frankfurt: [50.11, 8.68], Hamburg: [53.55, 9.99], Paris: [48.86, 2.35], Lyon: [45.76, 4.84],
  Amsterdam: [52.37, 4.9], Rotterdam: [51.92, 4.48],
};

// Road freight to the continent crosses the Channel at Dover–Calais.
export const DOVER: LatLon = [51.13, 1.31];
export const CALAIS: LatLon = [50.95, 1.86];
