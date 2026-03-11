const PALETTE = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#42d4f4',
  '#f032e6',
  '#bfef45',
  '#fabed4',
  '#469990',
  '#dcbeff',
  '#9a6324',
  '#800000',
  '#aaffc3',
  '#808000',
  '#000075',
  '#a9a9a9',
];

/** Returns a distinct color for a collection by index. Wraps around the palette. */
export function getCollectionColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}
