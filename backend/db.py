"""MongoDB client + collection accessors (repository-pattern seam).

Kept intentionally thin so that swapping to Postgres later is a
contained change: only the repository functions in this module and
services/repository.py need to be rewritten.
"""
import os
from motor.motor_asyncio import AsyncIOMotorClient

_mongo_url = os.environ["MONGO_URL"]
_db_name = os.environ["DB_NAME"]

client = AsyncIOMotorClient(_mongo_url)
db = client[_db_name]

# Collections used across the app
sellers = db["sellers"]
uploads = db["uploads"]
jobs = db["jobs"]
marketplace_invoices = db["marketplace_invoices"]
vendor_invoices = db["vendor_invoices"]
ims_actions = db["ims_actions"]
exceptions_log = db["exceptions_log"]
exports = db["exports"]
