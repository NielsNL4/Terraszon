export type DataCoverage = 'complete' | 'partial' | 'empty' | 'failed';
export type DataBounds = { south: number; west: number; north: number; east: number };

// Split the longest ground-distance axis. Six decimal places keep split edges
// consistent with the source queries, including narrow missing buffer strips.
export function splitDataBounds(bounds: DataBounds): DataBounds[] {
  const longitudeScale = Math.cos((bounds.south + bounds.north) / 2 * Math.PI / 180);
  const latitude = bounds.north - bounds.south;
  const longitude = (bounds.east - bounds.west) * longitudeScale;
  const vertical = latitude >= longitude;
  const minimum = vertical ? bounds.south : bounds.west;
  const maximum = vertical ? bounds.north : bounds.east;
  const middle = Number(((minimum + maximum) / 2).toFixed(6));
  if (middle <= minimum || middle >= maximum) return [];
  return vertical
    ? [{ ...bounds, north: middle }, { ...bounds, south: middle }]
    : [{ ...bounds, east: middle }, { ...bounds, west: middle }];
}
