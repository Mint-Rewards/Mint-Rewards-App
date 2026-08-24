#!/usr/bin/env bash
# Fetches every named place in Pakistan from Overpass, in ONE query.
#
#   bash scripts/geocode-spike/osm-precheck/fetch.sh out/pk-places.json
#
# This backs the P0.1a LOWER BOUND: does OSM contain a place with this name at
# all? It needs no API key, no extents and no Nominatim import, so it can rule
# the auto-fill path out cheaply before any of that is built. It cannot rule it
# in — name presence is not resolution. See ../README.md.
#
# One query, generous timeout, identifying User-Agent: this is within Overpass
# etiquette. Do not put it in a loop.
set -euo pipefail
OUT="${1:-out/pk-places.json}"
mkdir -p "$(dirname "$OUT")"

read -r -d '' Q <<'QUERY' || true
[out:json][timeout:300];
area["ISO3166-1"="PK"][admin_level=2]->.pk;
(
  node["place"~"^(suburb|neighbourhood|quarter|city_block|town|city|village)$"]["name"](area.pk);
  way["place"~"^(suburb|neighbourhood|quarter|city_block|town|city|village)$"]["name"](area.pk);
  relation["place"~"^(suburb|neighbourhood|quarter|city_block|town|city|village)$"]["name"](area.pk);
);
out tags center;
QUERY

curl -sS --max-time 320 \
  -A "mint-rewards-osm-precheck/1.0" \
  -d "data=$Q" \
  https://overpass-api.de/api/interpreter -o "$OUT"

echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
