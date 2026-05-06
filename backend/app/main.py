from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.routes import router as api_router
from app.core.config import settings


def _mount_frontend(app: FastAPI) -> None:
    frontend_dist = settings.project_root / "frontend" / "dist"
    index_file = frontend_dist / "index.html"
    assets_dir = frontend_dist / "assets"

    if not index_file.exists():
        return

    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/", include_in_schema=False)
    async def serve_index() -> FileResponse:
        return FileResponse(index_file)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str) -> FileResponse:
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(status_code=404, detail="Not Found")
        requested = (frontend_dist / full_path).resolve()
        if requested.is_file() and _is_relative_to(requested, frontend_dist):
            return FileResponse(requested)
        return FileResponse(index_file)


def _is_relative_to(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def create_app() -> FastAPI:
    app = FastAPI(
        title="Wind Power Forecasting API",
        description="Upload wind farm time-series data and compare demo forecast models.",
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(ValueError)
    async def value_error_handler(_: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(
            status_code=400,
            content={"code": 400, "message": str(exc), "data": None},
        )

    @app.exception_handler(Exception)
    async def generic_error_handler(_: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content={"code": 500, "message": f"server error: {exc}", "data": None},
        )

    app.include_router(api_router, prefix=settings.api_prefix)
    _mount_frontend(app)
    return app


app = create_app()
