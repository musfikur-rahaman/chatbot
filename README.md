# AI Chatbot — Flask + Hugging Face Inference

A lightweight web chatbot: a Flask backend with a clean chat UI, powered by the Hugging Face Inference API. No GPU required — the model runs server-side on HF infrastructure.

## Features

- **Chat UI** — simple, responsive single-page interface (`templates/index.html`)
- **Sliding-window memory** — keeps the last `MAX_TURNS` conversation turns for context without blowing up the context window
- **Configurable generation** — temperature, top-p, and max output tokens via environment variables
- **Truncation detection** — warns the user when a reply is cut off by the token limit
- **Health endpoint** — `/health` reports model ID and runtime config (deployment-friendly)
- **Reset** — `/reset` clears conversation history

## Model

`openai/gpt-oss-120b` via `huggingface_hub.InferenceClient`. Swap `MODEL_ID` in `app.py` for any other chat model on the Hub.

## API

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Chat UI |
| `/chatbot` | POST | Send a message — body: `{ "prompt": "..." }` |
| `/reset` | POST | Clear conversation history |
| `/health` | GET | Status, model ID, runtime config |

## Quickstart

```bash
pip install -r requirements.txt
```

Create a `.env` file (never commit it):
```env
HF_TOKEN=your_huggingface_token
MAX_TURNS=10
MAX_OUTPUT_TOKENS=1000
TEMPERATURE=0.3
TOP_P=0.9
```

Run locally:
```bash
python app.py
```

Run in production (gunicorn included in requirements):
```bash
gunicorn app:app --bind 0.0.0.0:$PORT
```

## Project structure

- `app.py` — Flask app, routes, inference client, history management
- `templates/index.html` — chat UI
- `static/` — CSS, JS, images, favicon
- `requirements.txt` — Flask, Flask-CORS, python-dotenv, gunicorn, huggingface-hub

## Author

Musfikur Rahaman — PhD student, UA Little Rock
