#!/bin/sh
# Render any /etc/asterisk/*.template files through envsubst, then exec the
# original asterisk command. Templates with no env vars set will become empty
# strings — failing loudly is preferable to silently shipping broken config.

set -eu

required_vars="ASTERISK_PUBLIC_IP EXT_1001_PASSWORD EXT_1002_PASSWORD EXT_2001_PASSWORD ARI_PASSWORD"

for var in $required_vars; do
  eval "value=\${$var:-}"
  if [ -z "$value" ]; then
    echo "[asterisk-entrypoint] FATAL: required env var $var is not set" >&2
    exit 1
  fi
done

for tpl in /etc/asterisk/*.template; do
  [ -f "$tpl" ] || continue
  out="${tpl%.template}"
  echo "[asterisk-entrypoint] rendering $tpl -> $out"
  envsubst < "$tpl" > "$out"
done

exec "$@"
