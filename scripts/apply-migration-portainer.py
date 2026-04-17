#!/usr/bin/env python3
"""Aplica uma migration Prisma via API do Portainer (docker exec no container Postgres).

Env vars necessárias:
- PORTAINER_URL — ex.: https://portainer.example.com
- PORTAINER_TOKEN — X-API-Key do Portainer
- MIGRATION_DIR — pasta em prisma/migrations/ (ex.: 20260417190000_company_soft_delete)
- DB_HINT — substring do nome do container Postgres (default: nexus-roteador-webhook_db)

Uso no workflow GitHub: chamado por .github/workflows/db-migrate.yml.
"""

from __future__ import annotations

import base64
import json
import os
import ssl
import sys
import urllib.request
import urllib.error

PORTAINER_URL = os.environ["PORTAINER_URL"].rstrip("/")
PORTAINER_TOKEN = os.environ["PORTAINER_TOKEN"]
MIGRATION_DIR = os.environ["MIGRATION_DIR"]
DB_HINT = os.environ.get("DB_HINT", "nexus-roteador-webhook_db")

MIGRATION_PATH = f"prisma/migrations/{MIGRATION_DIR}/migration.sql"

# TLS permissivo — Portainer self-signed é comum
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE


def request(method: str, path: str, body: bytes | None = None) -> bytes:
    url = f"{PORTAINER_URL}{path}"
    req = urllib.request.Request(url, method=method, data=body)
    req.add_header("X-API-Key", PORTAINER_TOKEN)
    if body is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, context=CTX) as resp:
            return resp.read()
    except urllib.error.HTTPError as e:
        msg = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"HTTP {e.code} em {method} {path}: {msg}") from None


def find_db_container() -> str:
    data = json.loads(request("GET", "/api/endpoints/1/docker/containers/json?all=1"))
    for c in data:
        names = c.get("Names") or []
        if any(DB_HINT in n for n in names):
            print(f"Container encontrado: {names} id={c['Id']}")
            return c["Id"]
    print("Containers disponíveis:")
    for c in data:
        print(f"  {c.get('Names')}")
    raise SystemExit(f"Nenhum container com '{DB_HINT}' no nome")


def read_migration() -> str:
    if not os.path.isfile(MIGRATION_PATH):
        raise SystemExit(f"Arquivo não encontrado: {MIGRATION_PATH}")
    with open(MIGRATION_PATH, "rb") as f:
        return base64.b64encode(f.read()).decode("ascii")


def demux_docker_stream(raw: bytes) -> str:
    """Docker streams exec em frames de 8 bytes (header) + payload."""
    out = bytearray()
    i = 0
    while i + 8 <= len(raw):
        size = int.from_bytes(raw[i + 4 : i + 8], "big")
        i += 8
        out += raw[i : i + size]
        i += size
    if not out and raw:
        return raw.decode("utf-8", errors="replace")
    return out.decode("utf-8", errors="replace")


def main() -> None:
    cid = find_db_container()
    sql_b64 = read_migration()

    cmd = f'echo {sql_b64} | base64 -d | psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'

    exec_payload = json.dumps(
        {
            "AttachStdout": True,
            "AttachStderr": True,
            "Tty": False,
            "Cmd": ["sh", "-c", cmd],
        }
    ).encode("utf-8")

    exec_resp = json.loads(
        request(
            "POST",
            f"/api/endpoints/1/docker/containers/{cid}/exec",
            exec_payload,
        )
    )
    eid = exec_resp.get("Id")
    if not eid:
        raise SystemExit(f"Exec create falhou: {exec_resp}")
    print(f"Exec id: {eid}")

    start_payload = json.dumps({"Detach": False, "Tty": False}).encode("utf-8")
    raw = request(
        "POST",
        f"/api/endpoints/1/docker/exec/{eid}/start",
        start_payload,
    )
    print("----- psql output -----")
    print(demux_docker_stream(raw))
    print("-----------------------")

    inspect = json.loads(request("GET", f"/api/endpoints/1/docker/exec/{eid}/json"))
    exit_code = inspect.get("ExitCode")
    print(f"Exit code: {exit_code}")
    if exit_code != 0:
        raise SystemExit(f"Migration falhou com exit {exit_code}")
    print("Migration aplicada com sucesso.")


if __name__ == "__main__":
    main()
