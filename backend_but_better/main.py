from fastapi import FastAPI
import uvicorn


app = FastAPI(title="backend_but_better")


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "backend_but_better is running"}


def run() -> None:
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


if __name__ == "__main__":
    run()
