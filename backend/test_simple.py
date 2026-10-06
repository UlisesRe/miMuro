from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
import uvicorn

async def health(request):
    print(f"Health endpoint called: {request.url}")
    return JSONResponse({"status": "ok"})

async def catch_all(request):
    print(f"Catch-all: {request.method} {request.url}")
    from starlette.responses import PlainTextResponse
    return PlainTextResponse(f"Method: {request.method}\nPath: {request.url.path}")

app = Starlette(routes=[
    Route("/api/health", health, methods=["GET"]),
    Route("/{path:path}", catch_all, methods=["GET", "POST", "PUT", "DELETE", "PATCH"]),
])

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="debug")