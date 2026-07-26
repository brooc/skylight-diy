#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTFS_DIR="${1:-}"
DAYMARK_PAYLOAD_DIR=""
FIRSTRUN_FILE=""
INJECTION_MARKER="# Daymark first-boot installer"
DAYMARK_SYSTEMD_RUN="systemd.run=/boot/firmware/daymark/install-first-boot.sh"

fail() {
  printf 'Daymark SD preparation failed: %s\n' "$*" >&2
  exit 1
}

require_bootfs() {
  [[ -n "${BOOTFS_DIR}" ]] ||
    fail "usage: $0 /path/to/mounted/bootfs"
  [[ -d "${BOOTFS_DIR}" ]] ||
    fail "${BOOTFS_DIR} is not a mounted directory"
  [[ -f "${BOOTFS_DIR}/cmdline.txt" && -f "${BOOTFS_DIR}/config.txt" ]] ||
    fail "${BOOTFS_DIR} does not look like a Raspberry Pi bootfs partition"

  FIRSTRUN_FILE="${BOOTFS_DIR}/firstrun.sh"
  if [[ ! -f "${FIRSTRUN_FILE}" && ! -f "${BOOTFS_DIR}/user-data" ]]; then
    fail "neither firstrun.sh nor cloud-init user-data exists; write Raspberry Pi OS with Imager customisation enabled"
  fi
}

copy_payload() {
  DAYMARK_PAYLOAD_DIR="${BOOTFS_DIR}/daymark"
  mkdir -p "${DAYMARK_PAYLOAD_DIR}"
  cp "${SCRIPT_DIR}/install-first-boot.sh" \
    "${DAYMARK_PAYLOAD_DIR}/install-first-boot.sh"
  cp "${SCRIPT_DIR}/first-boot-runner.sh" \
    "${DAYMARK_PAYLOAD_DIR}/first-boot-runner.sh"
  cp "${SCRIPT_DIR}/provision.sh" \
    "${DAYMARK_PAYLOAD_DIR}/provision.sh"
}

inject_first_boot_installer() {
  if grep -Fq "${INJECTION_MARKER}" "${FIRSTRUN_FILE}"; then
    return
  fi

  local next_file="${FIRSTRUN_FILE}.daymark"
  awk -v marker="${INJECTION_MARKER}" '
    { lines[NR] = $0 }
    END {
      last = NR
      while (last > 0 && lines[last] ~ /^[[:space:]]*$/) {
        last--
      }
      if (last > 0 && lines[last] ~ /^[[:space:]]*exit[[:space:]]+0[[:space:]]*$/) {
        last--
      }
      for (line = 1; line <= last; line++) {
        print lines[line]
      }
      print ""
      print marker
      print "/bin/bash \"$(dirname \"$0\")/daymark/install-first-boot.sh\""
      print "exit 0"
    }
  ' "${FIRSTRUN_FILE}" > "${next_file}"
  mv "${next_file}" "${FIRSTRUN_FILE}"
}

inject_cloud_init_boot_command() {
  local cmdline_file="${BOOTFS_DIR}/cmdline.txt"
  if grep -Fq "${DAYMARK_SYSTEMD_RUN}" "${cmdline_file}"; then
    return
  fi

  local next_file="${cmdline_file}.daymark"
  awk -v systemd_run="${DAYMARK_SYSTEMD_RUN}" '
    NR == 1 {
      print $0 " " systemd_run " systemd.run_success_action=none"
      next
    }
    { print }
  ' "${cmdline_file}" > "${next_file}"
  mv "${next_file}" "${cmdline_file}"
}

main() {
  require_bootfs
  copy_payload
  if [[ -f "${FIRSTRUN_FILE}" ]]; then
    inject_first_boot_installer
  else
    inject_cloud_init_boot_command
  fi

  printf 'Daymark first-boot provisioning added to %s\n' "${BOOTFS_DIR}"
  printf 'Eject the card, insert it in the Pi, and power it on.\n'
}

main "$@"
