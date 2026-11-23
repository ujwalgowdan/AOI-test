# syntax=docker/dockerfile:1.7

FROM python:3.12-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    AOI_DATA_DIR=/data

RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Install the exact resolved set (requirements-lock.txt); requirements.txt is the hand-edited source.
COPY requirements.txt requirements-lock.txt ./
RUN pip install -r requirements-lock.txt

COPY app ./app
COPY legacy ./legacy
COPY tests ./tests

EXPOSE 8000

# Dev target — hot-reload uvicorn; mount source in compose for HMR
FROM base AS dev
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# Prod target — gunicorn + uvicorn worker
# Exactly ONE worker: SessionManager (active sessions + WebSocket fan-out) is
# in-process memory, so a 2nd worker would split sessions and drop live
# counts. Scale only after moving that state to a shared store.
FROM base AS prod
CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", "app.main:app", \
     "--workers", "1", "--graceful-timeout", "25", \
     "--bind", "0.0.0.0:8000", "--access-logfile", "-"]
