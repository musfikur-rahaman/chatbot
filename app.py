from flask import Flask, request, render_template
from flask_cors import CORS
import json
import os
import torch
from dotenv import load_dotenv
from transformers import AutoTokenizer, AutoModelForCausalLM

app = Flask(__name__)
CORS(app)

# ----------------------------
# Load HF token from .env
# ----------------------------
load_dotenv()
HF_TOKEN = os.getenv("HF_TOKEN")
if not HF_TOKEN:
    raise ValueError("HF_TOKEN not found. Put HF_TOKEN=... in your .env file.")

# ----------------------------
# Model config
# ----------------------------
MODEL_ID = "Qwen/Qwen2.5-0.5B-Instruct"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.float16 if DEVICE == "cuda" else torch.float32

SYSTEM_PROMPT = (
    "You are a helpful AI assistant. "
    "Answer clearly and concisely in full sentences. "
    "Do not show reasoning steps."
)

# ----------------------------
# Load model ONCE
# ----------------------------
tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, token=HF_TOKEN)

model = AutoModelForCausalLM.from_pretrained(
    MODEL_ID,
    token=HF_TOKEN,
    torch_dtype=DTYPE,
    device_map="auto" if DEVICE == "cuda" else None
)

if DEVICE == "cpu":
    model.to(DEVICE)

model.eval()

# ----------------------------
# Conversation memory (demo/global)
# ----------------------------
messages = [{"role": "system", "content": SYSTEM_PROMPT}]
MAX_TURNS = 6


@app.route("/", methods=["GET"])
def home():
    return render_template("index.html")


@app.route("/chatbot", methods=["POST"])
def handle_prompt():
    data = json.loads(request.get_data(as_text=True))
    user_input = data.get("prompt", "").strip()
    if not user_input:
        return "Empty input", 400

    messages.append({"role": "user", "content": user_input})
    messages[:] = [messages[0]] + messages[-(MAX_TURNS * 2 + 1):]

    prompt = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True
    )

    inputs = tokenizer(
        prompt,
        return_tensors="pt",
        truncation=True,
        max_length=1024
    ).to(model.device)

    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=256,
            do_sample=True,
            temperature=0.3,
            top_p=0.9,
            eos_token_id=tokenizer.eos_token_id,
            pad_token_id=tokenizer.eos_token_id
        )

    new_tokens = output_ids[0][inputs["input_ids"].shape[-1]:]
    reply = tokenizer.decode(new_tokens, skip_special_tokens=True).strip()

    messages.append({"role": "assistant", "content": reply})
    return reply


@app.route("/reset", methods=["POST"])
def reset_chat():
    global messages
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    return "Chat reset"


if __name__ == "__main__":
    app.run(debug=True)
