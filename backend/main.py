import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers import applicant, apply as apply_router, auth, automation as automation_router, config as config_router, cv, jobs, pipeline, requests, setup as setup_router, sources, tailoring_profiles
from services.scheduler import start_scheduler, stop_scheduler
from settings import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    start_scheduler()
    log.info("Jobpls backend started (auth=%s, db=%s)", settings.AUTH_MODE, "sqlite" if settings.is_sqlite else "postgres")
    yield
    stop_scheduler()


app = FastAPI(title="Jobpls API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(config_router.router)
app.include_router(sources.router)
app.include_router(jobs.router)
app.include_router(pipeline.router)
app.include_router(cv.router)
app.include_router(tailoring_profiles.router)
app.include_router(requests.router)
app.include_router(applicant.router)
app.include_router(apply_router.router)
app.include_router(setup_router.router)
app.include_router(automation_router.router)


@app.get("/health")
def health():
    return {"status": "ok"}
