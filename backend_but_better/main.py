from fastapi import FastAPI
import uvicorn

from api.samples import router as samples_router


app = FastAPI(title="backend_but_better")
app.include_router(samples_router)


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "backend_but_better is running"}


def run() -> None:
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    run()
