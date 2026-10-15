#!/usr/bin/env bash
# Publish log lines as GitHub check annotations so failures are diagnosable from
# the checks API alone (the raw job log lives on a host that may be unreachable).
#
# Usage: annotate.sh <log-file> <title> [head|tail] [max-lines] [filter-regex]
set -uo pipefail

log_file="${1:?log file required}"
title="${2:?title required}"
mode="${3:-tail}"
max_lines="${4:-50}"
filter="${5:-}"

if [[ ! -f "$log_file" ]]; then
  echo "::error title=${title}::log file ${log_file} not found"
  exit 0
fi

if [[ -n "$filter" ]]; then
  selected_source="$(grep -nE "$filter" "$log_file" || true)"
else
  selected_source="$(cat "$log_file")"
fi

if [[ "$mode" == "head" ]]; then
  selected="$(printf '%s\n' "$selected_source" | head -n "$max_lines")"
else
  selected="$(printf '%s\n' "$selected_source" | tail -n "$max_lines")"
fi

while IFS= read -r line; do
  [[ -z "${line// }" ]] && continue
  safe="$(printf '%s' "$line" | tr -d '\r' | sed -e 's/%/%25/g' | cut -c1-800)"
  echo "::error title=${title}::${safe}"
done <<< "$selected"
