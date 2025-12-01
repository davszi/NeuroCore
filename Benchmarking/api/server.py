from fastapi import FastAPI
from pydantic import BaseModel

from Benchmarking.api.submit_run import handle_submission

app = FastAPI()

class UserConfig(BaseModel):
    task: str
    model: str
    attention: str
    steps: int = 10

@app.post("/submit")
def submit_run(config: UserConfig):
    return handle_submission(config.dict())
