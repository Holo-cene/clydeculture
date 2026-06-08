export function normaliseTitle(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normaliseVenueName(input: string): string {
  return normaliseTitle(input);
}
