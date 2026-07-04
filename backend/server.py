"""FastAPI entry point.

Wires the /api router, CORS, and shutdown hook. Business logic lives in
`services/`, DB access in `services/repository.py`, and routes in
`routes/api.py`. This structure mirrors the module boundaries planned for
GST AutoFile so code can be lifted with minimal edits.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI  # noqa: E402
from starlette.middleware.cors import CORSMiddleware  # noqa: E402

from routes.api import router as api_router  # noqa: E402
from db import client  # noqa: E402

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="GST-ECOM-EZ", version="0.1.0")

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def _shutdown():
    client.close()
