# kindling microVM daemon, containerised for local PoC use.
#
# Requires a Linux host with nested virtualisation and the two devices passed
# through (see compose.yaml): /dev/kvm and /dev/net/tun. The container runs
# privileged because the daemon creates network namespaces, veth pairs and
# nftables rules to give each microVM its own isolated network.
FROM debian:bookworm-slim

ARG FC_VERSION=v1.17.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl nftables iptables ipset iproute2 procps e2fsprogs util-linux kmod \
 && rm -rf /var/lib/apt/lists/*

# Firecracker + jailer, pinned and checksum-verified (mirrors kindling's own
# scripts/20-install-firecracker.sh).
RUN set -eux; \
    arch="$(uname -m)"; \
    case "$arch" in \
      x86_64)  sha=06094a1108ae9e82aa4c23a775aa92758f53f1175d422270d9d6162cb9ade558 ;; \
      aarch64) sha=e351ebe4f7a16b5873bbd51005d2e6767103cff4d5ebc829df2d3f95a93e2256 ;; \
      *) echo "unsupported architecture: $arch" >&2; exit 1 ;; \
    esac; \
    tmp="$(mktemp -d)"; \
    curl -fsSL "https://github.com/firecracker-microvm/firecracker/releases/download/${FC_VERSION}/firecracker-${FC_VERSION}-${arch}.tgz" -o "$tmp/fc.tgz"; \
    echo "${sha}  $tmp/fc.tgz" | sha256sum -c -; \
    tar -xzf "$tmp/fc.tgz" -C "$tmp"; \
    install -m755 "$tmp/release-${FC_VERSION}-${arch}/firecracker-${FC_VERSION}-${arch}" /usr/local/bin/firecracker; \
    install -m755 "$tmp/release-${FC_VERSION}-${arch}/jailer-${FC_VERSION}-${arch}" /usr/local/bin/jailer; \
    rm -rf "$tmp"; \
    firecracker --version

# kindling CLI (same binary runs the daemon) + the guest agent the image
# builders embed. Both are verified against the release's SHA256SUMS.
ARG KLING_VERSION=""
COPY install-kindling.sh /tmp/install-kindling.sh
RUN chmod +x /tmp/install-kindling.sh && /tmp/install-kindling.sh && rm -f /tmp/install-kindling.sh

# The daemon looks for builder executables in this directory; the CLI embeds
# `base` (used by `kling image toolchain`) but the daemon doesn't call it unless
# a wrapper is present.
RUN set -eux; \
    mkdir -p /usr/local/lib/kindling/builders; \
    printf '#!/bin/sh\nexec kling builder base "$@"\n' > /usr/local/lib/kindling/builders/base; \
    chmod 0755 /usr/local/lib/kindling/builders/base

# The unprivileged user Firecracker runs as, in the kvm group.
RUN set -eux; \
    getent group kvm >/dev/null || groupadd --system kvm; \
    useradd --system --no-create-home --shell /usr/sbin/nologin kindling; \
    usermod -aG kvm kindling

COPY entrypoint.sh /usr/local/bin/kindling-entrypoint.sh
COPY fetch-kernel.sh /usr/local/bin/fetch-kernel.sh
RUN chmod +x /usr/local/bin/kindling-entrypoint.sh /usr/local/bin/fetch-kernel.sh

ENTRYPOINT ["/usr/local/bin/kindling-entrypoint.sh"]
