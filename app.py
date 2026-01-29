from flask import Flask, request, render_template
from flask_cors import CORS
from dotenv import load_dotenv
import os
import requests

app = Flask(__name__)
CORS(app)

# ----------------------------
# Load HF token from .env (local) OR Render env vars
# ----------------------------
load_dotenv()
HF_TOKEN = os.getenv("HF_TOKEN")
if not HF_TOKEN:
    raise ValueError("HF_TOKEN not found. Put HF_TOKEN=... in your .env file or Render env vars.")

# ----------------------------
# Choose a hosted model
# ----------------------------
MODEL_ID = os.getenv("MODEL_ID", "Qwen/Qwen2.5-0.5B-Instruct")
HF_API_URL = f"https://api-inference.huggingface.co/models/{MODEL_ID}"

SYSTEM_PROMPT = (
    "You are a helpful AI assistant. "
    "Answer clearly and concisely in full sentences. "
    "Do not show reasoning steps."
)

# Simple global conversation memory (OK for learning/demo; not multi-user safe)
messages = [{"role": "system", "content": SYSTEM_PROMPT}]
MAX_TURNS = 6  # keep last 6 user/assistant pairs


def build_prompt(msgs):
    """
    Convert chat messages into a plain text prompt for hosted text-generation.
    This works across many models even if they don't support a special chat API.
    """
    lines = []
    for m in msgs:
        role = m["role"]
        content = m["content"].strip()
        if role == "system":
            lines.append(f"System: {content}")
        elif role == "user":
            lines.append(f"User: {content}")
        else:
            lines.append(f"Assistant: {content}")
    lines.append("Assistant:")
    return "\n".join(lines)


def call_hf_inference(prompt: str, max_new_tokens: int = 200):
    headers = {"Authorization": f"Bearer {HF_TOKEN}"}
    payload = {
        "inputs": prompt,
        "parameters": {
            "max_new_tokens": max_new_tokens,
            "temperature": 0.3,
            "top_p": 0.9,
            "return_full_text": False
        }
    }

    r = requests.post(HF_API_URL, headers=headers, json=payload, timeout=60)

    # Helpful error message if something goes wrong
    if r.status_code != 200:
        return f"HF API error {r.status_code}: {r.text}"

    data = r.json()

    # HF can return list[{"generated_text": "..."}] or dict with "error"
    if isinstance(data, dict) and "error" in data:
        return f"HF error: {data['error']}"

    if isinstance(data, list) and len(data) > 0:
        item = data[0]
        if isinstance(item, dict) and "generated_text" in item:
            return item["generated_text"].strip()

    # Fallback (rare)
    return str(data)


@app.route("/", methods=["GET"])
def home():
    return render_template("index.html")


@app.route("/chatbot", methods=["POST"])
def handle_prompt():
    data = request.get_json(force=True)
    user_input = (data.get("prompt") or "").strip()
    if not user_input:
        return "Empty input", 400

    # Add user message and keep recent history
    messages.append({"role": "user", "content": user_input})
    messages[:] = [messages[0]] + messages[-(MAX_TURNS * 2 + 1):]

    prompt = build_prompt(messages)
    reply = call_hf_inference(prompt, max_new_tokens=200)

    messages.append({"role": "assistant", "content": reply})
    return reply


@app.route("/reset", methods=["POST"])
def reset_chat():
    global messages
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    return "Chat reset"


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
    app.run(debug=True)  # for local development