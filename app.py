from flask import Flask, request, render_template
from flask_cors import CORS
from dotenv import load_dotenv
import os
from huggingface_hub import InferenceClient

app = Flask(__name__)
CORS(app)

# ----------------------------
# Load HF token
# ----------------------------
load_dotenv()
HF_TOKEN = os.getenv("HF_TOKEN")
if not HF_TOKEN:
    raise ValueError("HF_TOKEN not found. Set it in .env or Render env vars.")

# ----------------------------
# Hosted model (Novita provider)
# ----------------------------
MODEL_ID = "zai-org/GLM-4.7-Flash"

client = InferenceClient(
    model=MODEL_ID,
    token=HF_TOKEN,
    provider="novita"
)

SYSTEM_PROMPT = (
    "You are a helpful AI assistant. "
    "Answer clearly and concisely in full sentences. "
    "Do not show reasoning steps."
)

# ----------------------------
# Simple global memory (demo)
# ----------------------------
messages = [{"role": "system", "content": SYSTEM_PROMPT}]
MAX_TURNS = 6


@app.route("/", methods=["GET"])
def home():
    return render_template("index.html")


@app.route("/chatbot", methods=["POST"])
def handle_prompt():
    data = request.get_json(force=True)
    user_input = (data.get("prompt") or "").strip()
    if not user_input:
        return "Empty input", 400

    # Add user message + trim history
    messages.append({"role": "user", "content": user_input})
    messages[:] = [messages[0]] + messages[-(MAX_TURNS * 2 + 1):]

    try:
        # Chat completion via InferenceClient
        response = client.chat.completions.create(
            messages=messages,
            max_tokens=200,
            temperature=0.3,
            top_p=0.9
        )

        reply = response.choices[0].message.content.strip()

    except Exception as e:
        reply = f"Inference error: {str(e)}"

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
