#!/bin/sh
# Starts the kindling daemon and builds the shared Node image on first run.
# Writes /run/kindling-ready once both are done, which gates the manager
# container's healthcheck.
set -eu

ROOT="${KLING_ROOT:-/var/lib/kindling}"
SOCK="${KLING_SOCK:-/run/kling.sock}"

mkdir -p "$ROOT" /run
# Firecracker's jailer canonicalizes this path; create it up front so the first
# machine boot doesn't fail on a missing directory.
mkdir -p "$ROOT/jails"
rm -f /run/kindling-ready
# The device gids from the host rarely match the container's kvm group.
chmod 666 /dev/kvm 2>/dev/null || true
chmod 666 /dev/net/tun 2>/dev/null || true

echo "[kindling] starting daemon (root=$ROOT socket=$SOCK run-as=kindling)"
kling daemon -root "$ROOT" -socket "$SOCK" -run-as kindling &
DAEMON_PID=$!

shutdown() {
  kill -TERM "$DAEMON_PID" 2>/dev/null || true
  wait "$DAEMON_PID" 2>/dev/null || true
}
trap shutdown TERM INT

i=0
while [ ! -S "$SOCK" ]; do
  i=$((i + 1))
  if [ "$i" -gt 90 ]; then
    echo "[kindling] daemon did not create $SOCK" >&2
    exit 1
  fi
  sleep 1
done
echo "[kindling] daemon socket is up"

# The daemon boots microVMs with $ROOT/images/vmlinux, which the release does
# not ship; fetch it from the Firecracker CI bucket.
KLING_ROOT="$ROOT" /usr/local/bin/fetch-kernel.sh

# The `base` builder layers onto a `min` image built from an Alpine minirootfs.
if [ ! -f "$ROOT/images/min.ext4" ]; then
  echo "[kindling] building 'min' base image (first run)"
  if KLING_ROOT="$ROOT" /usr/local/lib/kindling/70-build-minimal-image.sh min; then
    echo "[kindling] min image ready"
  else
    echo "[kindling] WARNING: min image build failed" >&2
  fi
fi

# Build the Node-capable image once; it persists in the kindling root volume.
IMAGE="${KLING_IMAGE:-toolchain}"
if ! kling image ls -q 2>/dev/null | grep -qx "$IMAGE"; then
  echo "[kindling] building '$IMAGE' image (first run; needs network)"
  if kling image toolchain; then
    echo "[kindling] image $IMAGE ready"
  else
    echo "[kindling] WARNING: image $IMAGE build failed" >&2
  fi
else
  echo "[kindling] image $IMAGE already present"
fi

touch /run/kindling-ready
echo "[kindling] ready"

wait "$DAEMON_PID"
