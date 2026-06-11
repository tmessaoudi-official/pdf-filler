#!/usr/bin/env bash
# PostToolUse hook: after any write to locales/*.json, verify en/fr/ar are key-identical.
# Keys starting with "_" (developer notes) are excluded from the comparison.
# Exit 2 feeds the drift report back to Claude so it completes the missing translations.
set -uo pipefail

input=$(cat)
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")

case "$file" in
  */locales/*.json) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}" || exit 0

keys_of() {
  jq -r 'paths(scalars) | join(".")' "locales/$1.json" 2>/dev/null \
    | grep -v '^_' | LC_ALL=C sort
}

ref=$(keys_of en) || exit 0
drift=""
for lang in fr ar; do
  other=$(keys_of "$lang") || continue
  delta=$(LC_ALL=C comm -3 <(printf '%s\n' "$ref") <(printf '%s\n' "$other"))
  if [[ -n "$delta" ]]; then
    drift+="--- en vs $lang (col1: only in en, col2: only in $lang) ---"$'\n'"$delta"$'\n'
  fi
done

if [[ -n "$drift" ]]; then
  echo "Locale key drift detected after editing $file:" >&2
  echo "$drift" >&2
  echo "All three locales (en/fr/ar) must stay key-identical. Add the missing keys." >&2
  exit 2
fi
exit 0
