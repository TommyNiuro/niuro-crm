#!/bin/bash
# run-followup-cadence.sh — Wrapper del LaunchAgent com.niuro.followup-cadence
# para la .app instalada (niuro-crm-oss), migrado desde auto-crm el 2026-07-03.
#
# Corre los DOS pasos siempre, por separado, capturando y logueando el exit
# code de cada uno (si el primero falla, igual corre el segundo).

set -u

export CRM_DATA_DIR="/Users/enderys/Library/Application Support/io.niuro.crm"

cd "/Users/enderys/niuro/niuro-crm-oss" || {
  echo "[followup-cadence] FATAL: no pude cd al repo" >&2
  exit 1
}

NPX="$(command -v npx || true)"
[ -n "$NPX" ] || NPX="/Users/enderys/.nvm/versions/node/v24.14.0/bin/npx"

run_step() {
  local label="$1"
  local script="$2"
  echo "[followup-cadence] === inicio: $label ($script) ==="
  "$NPX" tsx "$script"
  local code=$?
  if [ "$code" -eq 0 ]; then
    echo "[followup-cadence] OK: $label (exit 0)"
  else
    echo "[followup-cadence] FALLO: $label (exit $code)" >&2
  fi
  return "$code"
}

run_step "followup-cadence" "scripts/followup-cadence.ts"
RC1=$?

run_step "calibrate-scoring" "scripts/calibrate-scoring.ts"
RC2=$?

echo "[followup-cadence] resumen: followup-cadence=exit$RC1 calibrate-scoring=exit$RC2"

if [ "$RC1" -ne 0 ] || [ "$RC2" -ne 0 ]; then
  exit 1
fi
exit 0
