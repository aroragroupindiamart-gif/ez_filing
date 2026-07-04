FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY ez_filing-conflict_040726_1139/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ez_filing-conflict_040726_1139/backend/ .

ENV PORT=8000
EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
