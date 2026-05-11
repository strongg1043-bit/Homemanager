export function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function getFamilyColour(colour: string): string {
  const colours: Record<string, string> = {
    indigo: '#4F46E5', emerald: '#059669', amber: '#D97706',
    rose: '#E11D48', violet: '#7C3AED', sky: '#0284C7'
  };
  return colours[colour] || '#4F46E5';
}

export const COLOUR_OPTIONS = ['indigo', 'emerald', 'amber', 'rose', 'violet', 'sky'];
