#!/bin/sh
# Fetches the Firecracker CI kernel (vmlinux) that the daemon boots microVMs
# with, into $KLING_ROOT/images/vmlinux. Adapted from kindling's
# scripts/30-fetch-artifacts.sh; only the kernel is needed here (images come
# from the builder, not the CI rootfs).
set -eu

ROOT="${KLING_ROOT:-/var/lib/kindling}"
DEST="$ROOT/images/vmlinux"
BUCKET="https://s3.amazonaws.com/spec.ccfc.min"
ARCH="$(uname -m)"
KERNEL_PREF="${KERNEL_PREF:-6.1}"

if [ -f "$DEST" ]; then
  echo "[kindling] kernel already present: $DEST"
  exit 0
fi

echo "[kindling] fetching Firecracker CI kernel (${KERNEL_PREF}.x, ${ARCH})"
build="$(curl -sfL "$BUCKET/?list-type=2&prefix=firecracker-ci/&delimiter=/" \
  | tr '<' '\n' | grep -oE 'firecracker-ci/[0-9]{8}-[a-z0-9]+-[0-9]+/' | sort -u | tail -1)"
[ -n "$build" ] || { echo "[kindling] could not list the CI bucket" >&2; exit 1; }

base="${build}${ARCH}/"
listing="$(curl -sfL "$BUCKET/?list-type=2&prefix=${base}&max-keys=200")"
kernel="$(printf '%s' "$listing" | tr '<' '\n' \
  | grep -oE "${base}vmlinux-${KERNEL_PREF}\.[0-9]+" \
  | sed "s|${base}||" | sort -V | tail -1)"
[ -n "$kernel" ] || { echo "[kindling] no kernel for series ${KERNEL_PREF}" >&2; exit 1; }

mkdir -p "$ROOT/images"
curl -fL "$BUCKET/${base}${kernel}" -o "$DEST"
echo "[kindling] installed kernel $kernel"
