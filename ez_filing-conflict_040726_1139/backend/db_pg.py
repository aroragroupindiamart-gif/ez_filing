"""PostgreSQL connection pool — drop-in replacement for the MongoDB motor client.

Each former MongoDB collection maps to a PostgreSQL table with columns:
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()

The repository layer talks only through this module, so no business logic
changes are needed when switching from MongoDB.
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

import asyncpg

_pool: Optional[asyncpg.Pool] = None

DATABASE_URL = os.environ.get("DATABASE_URL", "")

COLLECTIONS = [
    "sellers",
    "uploads",
    "jobs",
    "marketplace_invoices",
    "vendor_invoices",
    "ims_actions",
    "exceptions_log",
    "exports",
]


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        await _ensure_schema(_pool)
    return _pool


async def _ensure_schema(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        for col in COLLECTIONS:
            await conn.execute(f"""
                CREATE TABLE IF NOT EXISTS {col} (
                    id TEXT PRIMARY KEY,
                    data JSONB NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            await conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{col}_created ON {col}(created_at DESC)"
            )
        # Extra indexes for common query patterns
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_mp_inv_seller_period "
            "ON marketplace_invoices((data->>'seller_gstin'), (data->>'period'))"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_vnd_inv_seller_period "
            "ON vendor_invoices((data->>'seller_gstin'), (data->>'period'))"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_ims_seller_period "
            "ON ims_actions((data->>'seller_gstin'), (data->>'period'))"
        )
        await conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_exceptions_seller_period "
            "ON exceptions_log((data->>'seller_gstin'), (data->>'period'))"
        )


async def close_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


# ---------------------------------------------------------------------------
# Collection proxy — mimics the Motor collection API used in repository.py
# ---------------------------------------------------------------------------

def _row_to_dict(row) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    data = row["data"]
    if isinstance(data, str):
        data = json.loads(data)
    return dict(data)


class PgCollection:
    def __init__(self, table: str):
        self._table = table

    async def insert_one(self, doc: Dict[str, Any]) -> None:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                f"INSERT INTO {self._table}(id, data) VALUES($1, $2) ON CONFLICT(id) DO NOTHING",
                doc["id"],
                json.dumps(doc),
            )

    async def insert_many(self, docs: List[Dict[str, Any]]) -> None:
        if not docs:
            return
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.executemany(
                f"INSERT INTO {self._table}(id, data) VALUES($1, $2) ON CONFLICT(id) DO NOTHING",
                [(d["id"], json.dumps(d)) for d in docs],
            )

    async def find_one(self, query: Dict[str, Any], projection=None) -> Optional[Dict[str, Any]]:
        pool = await get_pool()
        where, args = _build_where(query)
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                f"SELECT data FROM {self._table} WHERE {where} LIMIT 1", *args
            )
        return _row_to_dict(row)

    def find(self, query: Dict[str, Any], projection=None) -> "PgCursor":
        return PgCursor(self._table, query)

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any], upsert: bool = False) -> None:
        pool = await get_pool()
        set_fields = update.get("$set", {})
        existing = await self.find_one(query)
        if existing:
            merged = {**existing, **set_fields}
            async with pool.acquire() as conn:
                await conn.execute(
                    f"UPDATE {self._table} SET data = $1 WHERE id = $2",
                    json.dumps(merged),
                    existing["id"],
                )
        elif upsert:
            doc = {**set_fields}
            if "id" not in doc:
                import uuid
                doc["id"] = str(uuid.uuid4())
            async with pool.acquire() as conn:
                await conn.execute(
                    f"INSERT INTO {self._table}(id, data) VALUES($1, $2) "
                    f"ON CONFLICT(id) DO UPDATE SET data = EXCLUDED.data",
                    doc["id"],
                    json.dumps(doc),
                )

    async def delete_many(self, query: Dict[str, Any]) -> None:
        pool = await get_pool()
        where, args = _build_where(query)
        async with pool.acquire() as conn:
            await conn.execute(f"DELETE FROM {self._table} WHERE {where}", *args)


class PgCursor:
    def __init__(self, table: str, query: Dict[str, Any]):
        self._table = table
        self._query = query
        self._sort_clause = "ORDER BY created_at DESC"

    def sort(self, sort_spec) -> "PgCursor":
        if sort_spec:
            field, direction = sort_spec[0]
            pg_field = f"data->>'{field}'"
            pg_dir = "ASC" if direction == 1 else "DESC"
            self._sort_clause = f"ORDER BY {pg_field} {pg_dir}"
        return self

    async def to_list(self, limit: int = 500) -> List[Dict[str, Any]]:
        pool = await get_pool()
        where, args = _build_where(self._query)
        args.append(limit)
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"SELECT data FROM {self._table} WHERE {where} "
                f"{self._sort_clause} LIMIT ${len(args)}",
                *args,
            )
        return [_row_to_dict(r) for r in rows if r]


def _build_where(query: Dict[str, Any]):
    """Convert a simple MongoDB-style query dict to a PostgreSQL WHERE clause.

    Supports:
    - Exact match on top-level fields stored in the JSONB `data` column.
    - Nested match using dot notation is not needed — all fields are top-level.
    """
    if not query:
        return "1=1", []

    clauses = []
    args = []
    for key, value in query.items():
        args.append(str(value) if not isinstance(value, bool) else str(value).lower())
        clauses.append(f"data->>'{ key }' = ${len(args)}")

    return " AND ".join(clauses), args


# ---------------------------------------------------------------------------
# Collection singletons — same names as in db.py (mongo version)
# ---------------------------------------------------------------------------
sellers = PgCollection("sellers")
uploads = PgCollection("uploads")
jobs = PgCollection("jobs")
marketplace_invoices = PgCollection("marketplace_invoices")
vendor_invoices = PgCollection("vendor_invoices")
ims_actions = PgCollection("ims_actions")
exceptions_log = PgCollection("exceptions_log")
exports = PgCollection("exports")
