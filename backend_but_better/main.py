from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from api.analyze import router as analyze_router
from api.generation import router as generation_router
from api.samples import router as samples_router


app = FastAPI(title="backend_but_better")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze_router)
app.include_router(generation_router)
app.include_router(samples_router)


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "backend_but_better is running"}


def run() -> None:
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    run()
