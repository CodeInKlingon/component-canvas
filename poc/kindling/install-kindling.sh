#!/bin/sh
# Installs the kindling CLI and the guest agent (a separate release asset that
# install.sh does not fetch, but the image builders need at
# /usr/local/lib/kindling/kling-guest). Both are verified against SHA256SUMS.
set -eu

arch="$(uname -m)"
case "$arch" in
  x86_64)  asset=amd64 ;;
  aarch64) asset=arm64 ;;
  *) echo "unsupported architecture: $arch" >&2; exit 1 ;;
esac

tag="${KLING_VERSION:-}"
if [ -z "$tag" ]; then
  tag="$(curl -fsSL -o /dev/null -w '%{url_effective}' \
    https://github.com/juan52878911/kindling/releases/latest | sed 's|.*/||')"
fi
base="https://github.com/juan52878911/kindling/releases/download/${tag}"

echo "installing kling ${tag} (${asset})"
curl -fsSL https://raw.githubusercontent.com/juan52878911/kindling/main/scripts/install.sh -o /tmp/install.sh
KLING_VERSION="$tag" sh /tmp/install.sh --no-rc --prefix /usr/local/bin

curl -fsSL "$base/SHA256SUMS" -o /tmp/SHA256SUMS
curl -fsSL "$base/kling-guest-linux-${asset}" -o /tmp/kling-guest
expected="$(grep -E "  kling-guest-linux-${asset}$" /tmp/SHA256SUMS | cut -d' ' -f1)"
echo "${expected}  /tmp/kling-guest" | sha256sum -c -
mkdir -p /usr/local/lib/kindling
install -m755 /tmp/kling-guest /usr/local/lib/kindling/kling-guest

# The embedded `base` builder (`kling builder base`) delegates to these repo
# scripts; the release installer doesn't ship them.
for script in 70-build-minimal-image.sh 81-base-image.sh lib-ext4-shrink.sh minimal-init.sh; do
  curl -fsSL "https://raw.githubusercontent.com/juan52878911/kindling/${tag}/scripts/${script}" \
    -o "/usr/local/lib/kindling/${script}"
done
chmod 0755 /usr/local/lib/kindling/70-build-minimal-image.sh /usr/local/lib/kindling/81-base-image.sh

rm -f /tmp/install.sh /tmp/SHA256SUMS /tmp/kling-guest
