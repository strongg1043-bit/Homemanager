const KEY = 'ha_funding_shown';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns true if the BetaFundingModal hasn't been shown in the last 7 days.
 * Falls back to `true` when localStorage is unavailable (e.g. private browsing).
 */
export function shouldShowFundingModal(): boolean {
  try {
    const last = localStorage.getItem(KEY);
    if (!last) return true;
    return Date.now() - parseInt(last, 10) > SEVEN_DAYS_MS;
  } catch {
    return true;
  }
}

/**
 * Records the current timestamp so the modal is suppressed for the next 7 days.
 */
export function recordFundingModalShown(): void {
  try {
    localStorage.setItem(KEY, Date.now().toString());
  } catch {
    // ignore — localStorage unavailable
  }
}
