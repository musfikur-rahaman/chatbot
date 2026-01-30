from flask import Flask, request, render_template, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
from huggingface_hub import InferenceClient

app = Flask(__name__)
CORS(app)

# ----------------------------
# Load environment variables
# ----------------------------
load_dotenv()

HF_TOKEN = os.getenv("HF_TOKEN")
if not HF_TOKEN:
    raise ValueError("HF_TOKEN not found. Set it in .env or hosting env vars.")

# ----------------------------
# Model configuration
# ----------------------------
MODEL_ID = "openai/gpt-oss-120b"

client = InferenceClient(
    model=MODEL_ID,
    token=HF_TOKEN,
)

# ----------------------------
# System prompt
# ----------------------------
SYSTEM_PROMPT = (
    "You are a helpful AI assistant. "
    "Answer clearly and concisely in full sentences. "
    "Do not show reasoning steps."
)

# ----------------------------
# Runtime controls (ENV-friendly)
# ----------------------------
MAX_TURNS = int(os.environ.get("MAX_TURNS", "10"))        # chat memory depth
MAX_OUTPUT_TOKENS = int(os.environ.get("MAX_OUTPUT_TOKENS", "1000"))
TEMPERATURE = float(os.environ.get("TEMPERATURE", "0.3"))
TOP_P = float(os.environ.get("TOP_P", "0.9"))

# ----------------------------
# In-memory chat (demo)
# ----------------------------
messages = [{"role": "system", "content": SYSTEM_PROMPT}]


def trim_history(msgs):
    """
    Keep system prompt + last MAX_TURNS turns.
    1 turn = user + assistant = 2 messages
    """
    if len(msgs) <= 1:
        return msgs
    keep = MAX_TURNS * 2
    return [msgs[0]] + msgs[-keep:]


# ----------------------------
# Routes
# ----------------------------
@app.route("/", methods=["GET"])
def home():
    return render_template("index.html")


@app.route("/chatbot", methods=["POST"])
def chatbot():
    global messages
    data = request.get_json(force=True) or {}
    user_input = (data.get("prompt") or "").strip()

    if not user_input:
        return jsonify({"error": "Empty input"}), 400

    # Add user message
    messages.append({"role": "user", "content": user_input})
    messages = trim_history(messages)

    try:
        response = client.chat.completions.create(
            model=MODEL_ID,
            messages=messages,
            max_tokens=MAX_OUTPUT_TOKENS,
            temperature=TEMPERATURE,
            top_p=TOP_P,
        )

        choice = response.choices[0]
        reply = (choice.message.content or "").strip()

        # Detect truncation
        if getattr(choice, "finish_reason", None) == "length":
            reply += "\n\n[Reply truncated — increase MAX_OUTPUT_TOKENS]"

    except Exception as e:
        reply = f"Inference error: {str(e)}"

    # Save assistant reply
    messages.append({"role": "assistant", "content": reply})
    messages = trim_history(messages)

    return reply


@app.route("/reset", methods=["POST"])
def reset():
    global messages
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    return "Chat reset"


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "model": MODEL_ID,
        "max_turns": MAX_TURNS,
        "max_output_tokens": MAX_OUTPUT_TOKENS
    })


# ----------------------------
# App entry
# ----------------------------
if __name__ == "__main__":
<<<<<<< HEAD
  port = int(os.environ.get("PORT", "5000"))
  app.run(host="0.0.0.0", port=port, debug=True)
=======
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
>>>>>>> 34be852 (no rag update)
