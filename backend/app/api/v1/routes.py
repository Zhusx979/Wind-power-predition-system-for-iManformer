from __future__ import annotations

from fastapi import APIRouter, File, UploadFile

from app.core.config import settings
from app.schemas.analysis import AnalysisRequest
from app.schemas.common import ApiResponse
from app.schemas.data import LoadSampleRequest
from app.schemas.predict import PredictRequest
from app.services.ai_analysis import analyze_with_domestic_model
from app.services.data_loader import list_sample_files, load_dataframe_from_upload, load_sample_dataframe
from app.services.predict_service import run_prediction
from app.services.storage import dataset_store

router = APIRouter()


def ok(data, message: str = "success") -> ApiResponse:
    return ApiResponse(code=0, message=message, data=data)


@router.get("/health", response_model=ApiResponse)
async def health() -> ApiResponse:
    return ok({"status": "ok", "service": "wind-power-forecasting-api"})


@router.get("/data/samples", response_model=ApiResponse)
async def list_samples() -> ApiResponse:
    files = list_sample_files()
    return ok({"samples": files, "data_dir": str(settings.data_dir)})


@router.post("/data/load-sample", response_model=ApiResponse)
async def load_sample(request: LoadSampleRequest) -> ApiResponse:
    df, metadata = load_sample_dataframe(request.filename)
    file_id = dataset_store.put(df, source_name=request.filename, metadata=metadata)
    return ok(dataset_store.describe(file_id), "sample loaded")


@router.post("/data/upload", response_model=ApiResponse)
async def upload_data(file: UploadFile = File(...)) -> ApiResponse:
    df, metadata = await load_dataframe_from_upload(file)
    file_id = dataset_store.put(df, source_name=file.filename or "uploaded-file", metadata=metadata)
    return ok(dataset_store.describe(file_id), "file uploaded")


@router.post("/predict", response_model=ApiResponse)
async def predict(request: PredictRequest) -> ApiResponse:
    df = dataset_store.get(request.file_id)
    source = dataset_store.describe(request.file_id)
    result = run_prediction(df, request, source)
    return ok(result, "prediction completed")


@router.post("/analysis", response_model=ApiResponse)
async def analysis(request: AnalysisRequest) -> ApiResponse:
    df = dataset_store.get(request.file_id)
    result = analyze_with_domestic_model(df, request)
    return ok(result, "analysis completed")
