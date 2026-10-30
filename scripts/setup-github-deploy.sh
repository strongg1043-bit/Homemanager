#!/usr/bin/env bash
# Sets the GitHub Actions secret and variables the Deploy workflow needs.
#
# Usage (from the repo root, signed in with `gh auth login` as a repo admin):
#   scripts/setup-github-deploy.sh path/to/service-account-key.json [path/to/.env.local]
#
# Reads the VITE_* values from .env.local and the service account key from the JSON file.
# Nothing is printed except variable names; the key and values never leave this machine
# except to GitHub.

set -euo pipefail

REPO="strongg1043-bit/Homemanager"
KEY_FILE="${1:-}"
ENV_FILE="${2:-.env.local}"
VARS=(
  VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID
  VITE_FIREBASE_STORAGE_BUCKET VITE_FIREBASE_MESSAGING_SENDER_ID VITE_FIREBASE_APP_ID
  VITE_FIREBASE_VAPID_KEY VITE_EMAILJS_SERVICE_ID VITE_EMAILJS_PUBLIC_KEY
  VITE_EMAILJS_REPLY_TO VITE_APP_URL
)

command -v gh >/dev/null || { echo "Install the GitHub CLI first: https://cli.github.com" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first." >&2; exit 1; }
[ -n "$KEY_FILE" ] && [ -f "$KEY_FILE" ] || { echo "Usage: $0 <service-account-key.json> [.env.local]" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Cannot find $ENV_FILE" >&2; exit 1; }
grep -q '"type": *"service_account"' "$KEY_FILE" || { echo "$KEY_FILE does not look like a service account key." >&2; exit 1; }

# Read KEY=VALUE from the env file, dropping comments, CRLF and surrounding quotes.
get_value() {
  local line val
  line=$(grep -E "^[[:space:]]*$1=" "$ENV_FILE" | tail -n1 || true)
  val=${line#*=}
  val=${val%$'\r'}
  val=${val#\"}; val=${val%\"}
  val=${val#\'}; val=${val%\'}
  printf '%s' "$val"
}

# Check everything first so a missing value doesn't leave a half-configured repo.
missing=()
for name in "${VARS[@]}"; do
  [ -n "$(get_value "$name")" ] || missing+=("$name")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "Missing or empty in $ENV_FILE:" >&2
  printf '  %s\n' "${missing[@]}" >&2
  echo "Add them (see the Firebase console and EmailJS) and run again. Nothing was changed." >&2
  exit 1
fi

for name in "${VARS[@]}"; do
  gh variable set "$name" --repo "$REPO" --body "$(get_value "$name")" >/dev/null
  echo "set variable $name"
done

gh secret set FIREBASE_SERVICE_ACCOUNT --repo "$REPO" < "$KEY_FILE" >/dev/null
echo "set secret   FIREBASE_SERVICE_ACCOUNT"

echo
echo "Done. Delete the key file now: $KEY_FILE"
echo "Then run the deploy: https://github.com/$REPO/actions/workflows/deploy.yml"
