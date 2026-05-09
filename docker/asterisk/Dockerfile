# Wraps andrius/asterisk with envsubst so we can template the public IP and
# endpoint passwords from .env.production at container start. Dev keeps using
# the upstream image with static config files.

FROM andrius/asterisk:latest

# `envsubst` lives in gettext-base. Lightweight (~500KB).
RUN apt-get update \
    && apt-get install -y --no-install-recommends gettext-base \
    && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /usr/local/bin/asterisk-entrypoint.sh
RUN chmod +x /usr/local/bin/asterisk-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/asterisk-entrypoint.sh"]
CMD ["asterisk", "-f"]
