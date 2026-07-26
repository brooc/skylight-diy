#!/usr/bin/env bash

set -Eeuo pipefail

percent="${1:-0}"
stage="${2:-Preparing Daymark}"
detail="${3:-This can take several minutes on the first boot.}"
tty="${DAYMARK_PROGRESS_TTY:-/dev/tty1}"
bar_width=42

[[ "${percent}" =~ ^[0-9]+$ ]] || percent=0
(( percent < 0 )) && percent=0
(( percent > 100 )) && percent=100

filled=$((percent * bar_width / 100))
empty=$((bar_width - filled))
filled_bar="$(printf '%*s' "${filled}" '' | tr ' ' '#')"
empty_bar="$(printf '%*s' "${empty}" '' | tr ' ' '-')"

if [[ ! -w "${tty}" ]]; then
  exit 0
fi

{
  printf '\033[2J\033[H\033[?25l'
  printf '\n\n\n'
  printf '\033[38;5;37m'
  printf '                         DAYMARK\n'
  printf '\033[0m'
  printf '                  Family command center\n'
  printf '\n\n\n'
  printf '                 %s\n' "${stage}"
  printf '\n'
  printf '          \033[38;5;37m[%s\033[38;5;245m%s]\033[0m %3d%%\n' \
    "${filled_bar}" "${empty_bar}" "${percent}"
  printf '\n'
  printf '          %s\n' "${detail}"
  printf '\n\n'
  printf '\033[38;5;245m'
  printf '          Keep this device powered on. It may reboot automatically.\n'
  printf '          Detailed log: /var/lib/daymark/first-boot.log\n'
  printf '\033[0m'
} > "${tty}"
