from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import get_pool, close_pool
from routers import packages, runs, stats


@asynccontextmanager
async def lifespan(app: FastAPI):

    await get_pool()
    yield

    await close_pool()


app = FastAPI(
    title=settings.app_title,
    version=settings.app_version,
    debug=settings.debug,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(packages.router)
app.include_router(runs.router)
app.include_router(stats.router)


@app.get("/health", tags=["infra"])
async def health():
    """Healthcheck для k3s liveness probe."""
    return {"status": "ok", "version": settings.app_version}


@app.get("/", tags=["infra"])
async def root():
    return {
        "service": "reproducible-builds-comparer",
        "docs": "/docs",
        "version": settings.app_version,
    }
