#!/usr/bin/env bash

set -Eeuo pipefail

model="$(
  tr -d '\0' < /proc/device-tree/model 2>/dev/null || true
)"
[[ "${model}" == *"Raspberry Pi 3"* ]] || exit 0
command -v wlr-randr >/dev/null 2>&1 || exit 0

display_state="$(wlr-randr 2>/dev/null || true)"
output="$(
  awk '/^[^[:space:]]/ { print $1; exit }' <<< "${display_state}"
)"
[[ -n "${output}" ]] || exit 0

if grep -Eq '^[[:space:]]+1280x800 px' <<< "${display_state}"; then
  wlr-randr --output "${output}" --mode 1280x800
fi
