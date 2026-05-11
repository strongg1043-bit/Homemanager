export function generateInviteCode(): string {
  // Cryptographically secure — guaranteed exactly 6 chars, unambiguous charset
  // (no 0/O, 1/I confusion). Entropy: 32^6 ≈ 1.07B combinations via CSPRNG.
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => CHARS[b % CHARS.length]).join('');
}

export function getFamilyColour(colour: string): string {
  const colours: Record<string, string> = {
    indigo: '#4F46E5', emerald: '#059669', amber: '#D97706',
    rose: '#E11D48', violet: '#7C3AED', sky: '#0284C7'
  };
  return colours[colour] || '#4F46E5';
}

export const COLOUR_OPTIONS = ['indigo', 'emerald', 'amber', 'rose', 'violet', 'sky'];
