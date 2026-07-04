"""DB module — delegates to PostgreSQL (db_pg.py).

Exports the same collection names as the original MongoDB version so that
repository.py requires zero changes. This fulfils the PRD's PostgreSQL
requirement while keeping all business logic untouched.
"""
from db_pg import (
    sellers,
    uploads,
    jobs,
    marketplace_invoices,
    vendor_invoices,
    ims_actions,
    exceptions_log,
    exports,
    close_pool,
)


class _Client:
    """Shim matching the motor client.close() call in server.py's shutdown hook."""
    def close(self):
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(close_pool())
            else:
                loop.run_until_complete(close_pool())
        except Exception:
            pass


client = _Client()
