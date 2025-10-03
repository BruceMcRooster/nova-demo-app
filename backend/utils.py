from dotenv import load_dotenv
import os
import requests
import json
import uuid
from typing import Union, Generator

load_dotenv()
OPENROUTER_API_KEY = os.getenv('API_KEY')

# map model ids -> models
model_dict = {}

class Model():
    def __init__(
        self,
        model: str = 'x-ai/grok-4-fast:free'
    ):
        self.model = model 

        # find model data
        all_models = requests.get('https://openrouter.ai/api/v1/models').json()['data']
        self.model_data = None
        for obj in all_models:
            if obj['id'] == model:
                self.model_data = obj
                break
        if not self.model_data:
            raise NameError('Model not found')

        self.id = uuid.uuid4()
        model_dict[self.id] = self

        # TODO: implement backup models, prompt caching

    def reply(self, prompt_obj, stream=False):
        '''
        prompt_obj: json object with following attributes:
        - text: string, contains text prompt
        - img: json object, contains data (base64 encoding of image) and format (format of image)
        - pdf: string, base64 encoding of pdf
        - modalities: string array of modalities
        returns a json object
        if field is not used set as None

        stream: bool, True if stream and False otherwise. Can only stream if output is text only
        '''

        content = []
        prompt = json.loads(prompt_obj)
        
        # check output modalities are supported
        output_modalities = self.model_data['architecture']['output_modalities']
        if not set(prompt['modalities']).issubset(set(output_modalities)):
            raise ValueError('Model does not support requested modalities')

        # add data to content to feed to model
        input_modalities = self.model_data['architecture']['input_modalities']

        if 'text' in input_modalities and prompt['text']:
            content.append({
                'type': 'text',
                'text': prompt['text']
            })

        if 'image' in input_modalities and prompt['img']:
            img = json.loads(prompt['img'])
            url = f"data:image/{img['format']};base64,{img['data']}"
            content.append({
                'type': 'image_url',
                'image_url': {
                    'url': url
                }
            })

        if 'file' in input_modalities and prompt['pdf']:
            url = f"data:application/pdf;base64,{prompt['pdf']}"
            content.append({
                'type': 'file',
                'file': {
                    'filename': 'temp_doc.pdf',
                    'file_data': url
                }
            })

        # submit prompt
        url = "https://openrouter.ai/api/v1/chat/completions"

        headers = {
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        }

        payload = {
            'model': self.model,
            'messages': [
                {
                    'role': 'user',
                    'content': content
                }
            ],
            'plugins': [
                {
                    'id': 'file-parser',
                    'pdf': {
                        'engine': 'pdf-text'
                    }
                }
            ],
            'modalities': output_modalities
        }

        return self._stream(url, headers, payload) if stream and output_modalities == ['text'] else self._output(url, headers, payload)

    def _stream(self, url, headers, payload):
        payload['stream'] = True
        buffer = ''
        with requests.post(url, headers=headers, json=payload, stream=True) as r:
            for chunk in r.iter_content(chunk_size=1024, decode_unicode=True):
                buffer += chunk
                while True:
                    try:
                        # Find the next complete SSE line
                        line_end = buffer.find("\n")
                        if line_end == -1:
                            break
                        line = buffer[:line_end].strip()
                        buffer = buffer[line_end + 1:]
                        if line.startswith("data: "):
                            data = line[6:]
                            if data == "[DONE]":
                                break
                            try:
                                data_obj = json.loads(data)
                                content = data_obj["choices"][0]["delta"].get("content")
                                if content:
                                    yield f"{content}"
                                    print(content, end="", flush=True)
                            except json.JSONDecodeError:
                                pass
                    except Exception:
                        break

    def _output(self, url, headers, payload):
        response = requests.post(
            url=url,
            headers=headers,
            json=payload
        )
        return response.json()