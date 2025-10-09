from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import requests
import json
from utils import Model, model_dict

app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware

# enable cors on all sites
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Hello World"}

# chat
@app.post("/chat")
async def chat(model_id: str, prompt: str):
    '''
    model_id: string, id of model to run on
    prompt: string, json string of prompt object
    '''
    model = Model(model=model_id)
    output = model.reply({"text": prompt, "img": None, "pdf": None, "modalities": ["text"]}, stream=False)
    return output

# chat with streaming
@app.post("/chat_streaming")
async def chat_streaming(model_id: str, prompt: str):
    '''
    model_id: string, id of model to run on
    prompt: string, json string of prompt object
    '''

    model = Model(model=model_id)

    def event_generator():
        for chunk in model.reply({"text": prompt, "img": None, "pdf": None, "modalities": ["text"]}, stream=True):
            yield chunk
        

    output = StreamingResponse(event_generator(), media_type="application/stream+json")
    return output