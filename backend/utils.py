import requests
import json

class Model():
    def __init__(
        self,
        model: str = 'openopenai/gpt-4o'
    ):
        self.model = model
        self.model_data = requests.get(model)

        # TODO: implement backup models, prompt caching

    def reply(self, prompt_obj):
        '''
        prompt_obj: JSON object with following attributes:
        - Text: string, contains text prompt
        - Image: JSON object, contains data (base64 encoding of image) and format (format of image)
        - PDF: string, base64 encoding of PDF
        - Audio: JSON object, contains data (base64 encoding of audio) and format (format of audio)
        - Modalities: string array of modalities
        Returns a JSON object
        '''

        # TODO: check that model has correct modality

        content = []
        prompt = json.loads(prompt_obj)

        if prompt['text'] is not None:
            content.append({
                'type': 'text',
                'text': prompt['text']
            })

        if prompt['img'] is not None:
            img = json.loads(prompt['img'])
            url = f"data:image/{img['format']};base64,{img['data']}"
            content.append({
                'type': 'image_url',
                'image_url': {
                    'url': url
                }
            })

        if prompt['pdf'] is not None:
            url = f"data:application/pdf;base64,{prompt['pdf']}"
            content.append({
                'type': 'file',
                'file': {
                    'filename': 'temp_doc.pdf',
                    'file_data': url
                }
            })

        if prompt['audio'] is not None:
            audio = json.loads(prompt['audio'])
            content.append({
                'type': 'input_audio',
                'input_audio': {
                    'data': audio['data'],
                    'format': audio['format']
                }
            })

        payload = {
            'model': self.model,
            'message': [
                {
                    'role': 'user',
                    'content': content
                }
            ],
            'plugins': [
                {
                    id: 'file-parser',
                    pdf: {
                        engine: 'pdf-text'
                    }
                }
            ],
            'modalities': prompt_obj['modalities']
        }

        response = requests.post(
            url='https://openrouter.ai/api/v1/chat/completions',
            headers={
                "Authorization": "Bearer <OPENROUTER_API_KEY>",
                "HTTP-Referer": "<YOUR_SITE_URL>", # Optional. Site URL for rankings on openrouter.ai.
                "X-Title": "<YOUR_SITE_NAME>", # Optional. Site title for rankings on openrouter.ai.
            },
            data=payload
        )
        return response.usage.model_dump_json()