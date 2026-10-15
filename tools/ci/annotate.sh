#!/usr/bin/env bash
# Publish log lines as GitHub check annotations so failures are diagnosable from
# the checks API alone (the raw job log lives on a host that CI reviewers may not
# be able to reach).
#
# Usage: annotate.sh <log-file> <title> [head|tail] [max-lines]
set -uo pipefail

log_file="${1:?log file required}"
title="${2:?title required}"
mode="${3:-tail}"
max_lines="${4:-50}"

if [[ ! -f "$log_file" ]]; then
  echo "::error title=${title}::log file ${log_file} not found"
  exit 0
fi

if [[ "$mode" == "head" ]]; then
  selected="$(head -n "$max_lines" "$log_file")"
else
  selected="$(tail -n "$max_lines" "$log_file")"
fi

while IFS= read -r line; do
  [[ -z "${line// }" ]] && continue
  # Escape characters that would break the workflow-command syntax.
  safe="$(printf '%s' "$line" | tr -d '\r' | sed -e 's/%/%25/g' -e 's/\r//g' | cut -c1-800)"
  echo "::error title=${title}::${safe}"
done <<< "$selected"
