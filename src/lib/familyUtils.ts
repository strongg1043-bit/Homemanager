export function generateInviteCode(): string {
  // Cryptographically secure — guaranteed exactly 6 chars, unambiguous charset
  // (no 0/O, 1/I confusion). Entropy: 32^6 ≈ 1.07B combinations via CSPRNG.
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => CHARS[b % CHARS.length]).join('');
}

export function getFamilyColour(colour: string): string {
  const colours: Record<string, string> = {
    // Brand colours — primary picks
    indigo:  '#1B3A5C', // NAVY  (primary brand)
    violet:  '#2E7D6B', // TEAL  (secondary brand)
    amber:   '#F5A35A', // AMBER (accent brand)
    // Semantic colours — kept for variety
    emerald: '#059669',
    rose:    '#E11D48',
    sky:     '#0284C7',
  };
  return colours[colour] || '#1B3A5C';
}

export const COLOUR_OPTIONS = ['indigo', 'emerald', 'amber', 'rose', 'violet', 'sky'];
