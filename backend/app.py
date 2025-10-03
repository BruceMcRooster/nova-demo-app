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

    model = model_dict[model_id]
    output = model.reply(prompt)
    return output['choices'][0]['message']['content']

# chat with streaming
@app.post("/chat_streaming")
async def chat_streaming(model_id: str, prompt: str):
    '''
    model_id: string, id of model to run on
    prompt: string, json string of prompt object
    '''

    model = model_dict[model_id]

    def event_generator():
        yield from model.reply(prompt, stream=True)

    output = StreamingResponse(event_generator(), media_type="text/event-stream")

    chunks = []
    async for chunk in output.body_iterator:
        chunks.append(chunk)
    return ''.join(chunks)