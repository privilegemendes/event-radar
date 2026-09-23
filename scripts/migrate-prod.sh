#!/usr/bin/env bash
# Apply pending Prisma migrations to PRODUCTION.
#
# A script rather than an inline command for two reasons. A permission rule
# matches a command by prefix, and the inline `DATABASE_URL=... npx prisma`
# form cannot be allowed narrowly — only by a rule wide enough to cover any
# command with an env prefix. And the thing being allowed should be reviewable:
# this file is, an ad-hoc shell line is not.
#
# `migrate deploy` ONLY applies pending migrations. It can never reset a
# database, which is what `migrate dev` did to the local one on 2026-09-23.
# See ~/.claude/rules/prisma-never-reset.md.
#
#   bash scripts/migrate-prod.sh          # show what would run
#   bash scripts/migrate-prod.sh --write  # apply
set -euo pipefail

ENV_FILE="${PROD_ENV_FILE:-$HOME/Projects/event-radar/.env}"
[ -f "$ENV_FILE" ] || { echo "no env file at $ENV_FILE" >&2; exit 1; }

# Unpooled: a migration holds a single long-lived connection and must not go
# through the pooler.
URL=$(grep -E '^DATABASE_URL_UNPOOLED=' "$ENV_FILE" | sed 's/^DATABASE_URL_UNPOOLED=//' | tr -d '"')
[ -n "$URL" ] || { echo "DATABASE_URL_UNPOOLED not set in $ENV_FILE" >&2; exit 1; }

HOST=$(printf '%s' "$URL" | sed -E 's#.*@([^/?]+).*#\1#')
echo "target: $HOST"

case "$HOST" in
  localhost*|127.0.0.1*|::1*)
    echo "refusing: that is a LOCAL database; this script is for production." >&2
    echo "use 'npx prisma migrate deploy' directly against local." >&2
    exit 1 ;;
esac

# Prisma auto-loads a .env from the working directory, and that file WINS over
# an inline DATABASE_URL. In a worktree whose .env points at localhost, this
# script would print the production host and then quietly operate on the local
# database — the report and the action disagreeing is exactly how the wrong
# database gets migrated. So verify what Prisma itself resolved, and refuse if
# it is not the host named above.
RESOLVED=$(DATABASE_URL="$URL" npx prisma migrate status 2>&1 | grep -oE 'schema "public" at "[^"]+"' | sed -E 's/.*at "([^"]+)".*/\1/' || true)
if [ -n "$RESOLVED" ] && ! printf '%s' "$HOST" | grep -q "$(printf '%s' "$RESOLVED" | cut -d: -f1)"; then
  echo >&2
  echo "REFUSING: Prisma resolved '$RESOLVED', not '$HOST'." >&2
  echo "A .env in $(pwd) is overriding DATABASE_URL." >&2
  echo "Run this from a checkout whose .env points at production (e.g. ~/Projects/event-radar)." >&2
  exit 1
fi

if [ "${1:-}" != "--write" ]; then
  echo
  echo "pending migrations that would be applied:"
  DATABASE_URL="$URL" npx prisma migrate status 2>&1 | grep -viE '^npm|deprecated|For more|Update available|│|└|┌' | tail -20
  echo
  echo "re-run with --write to apply."
  exit 0
fi

DATABASE_URL="$URL" npx prisma migrate deploy
