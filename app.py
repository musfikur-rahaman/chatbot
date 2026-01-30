import os
from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from dotenv import load_dotenv

from huggingface_hub import InferenceClient
from supabase import create_client, Client

from supabase_user_rag import SupabaseUserPDFRAG

load_dotenv()

app = Flask(__name__)

# ✅ allow moderate PDFs (raise if needed)
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024  # 25MB

# ✅ Bearer token friendly CORS
CORS(
  app,
  resources={r"/*": {"origins": "*"}},
  supports_credentials=False,
  allow_headers=["Content-Type", "Authorization"],
  methods=["GET", "POST", "OPTIONS"],
)

HF_TOKEN = os.getenv("HF_TOKEN")
MODEL_ID = os.getenv("MODEL_ID", "openai/gpt-oss-120b")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not HF_TOKEN:
  raise ValueError("HF_TOKEN missing")
if not SUPABASE_URL or not SUPABASE_ANON_KEY or not SUPABASE_SERVICE_ROLE_KEY:
  raise ValueError("SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY missing")

# ✅ service role so backend can verify token + write tables
sb: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

client = InferenceClient(model=MODEL_ID, token=HF_TOKEN)
rag = SupabaseUserPDFRAG(sb)

SYSTEM_PROMPT = (
  "You are a helpful AI assistant. "
  "Answer clearly and concisely in full sentences. "
  "Do not show reasoning steps."
)

def require_user_id() -> str:
  auth = request.headers.get("Authorization", "")
  if not auth.startswith("Bearer "):
    raise PermissionError("Missing Authorization Bearer token")

  jwt = auth.split(" ", 1)[1].strip()
  try:
    user_resp = sb.auth.get_user(jwt)
    user = getattr(user_resp, "user", None) or user_resp.get("user")
    if not user:
      raise PermissionError("Invalid token (no user)")
    return user.id
  except Exception:
    raise PermissionError("Invalid/expired token")

def create_conversation(user_id: str, title: str | None = None) -> str:
  resp = sb.table("chat_conversations").insert(
    {"user_id": user_id, "title": title or "New chat"}
  ).execute()
  return resp.data[0]["id"]

def save_message(user_id: str, conversation_id: str, role: str, content: str):
  sb.table("chat_messages").insert(
    {"user_id": user_id, "conversation_id": conversation_id, "role": role, "content": content}
  ).execute()

def load_messages(user_id: str, conversation_id: str, max_turns: int = 10):
  resp = (
    sb.table("chat_messages")
    .select("role,content,created_at")
    .eq("user_id", user_id)
    .eq("conversation_id", conversation_id)
    .order("created_at", desc=False)
    .execute()
  )
  msgs = resp.data or []

  # ✅ never include stored system rows even if present
  msgs = [m for m in msgs if m.get("role") != "system"]
  trimmed = msgs[-2 * max_turns:]

  return [{"role": "system", "content": SYSTEM_PROMPT}] + [
    {"role": m["role"], "content": m["content"]} for m in trimmed
  ]

@app.route("/", methods=["GET"])
def home():
  return render_template("index.html", supabase_url=SUPABASE_URL, supabase_anon_key=SUPABASE_ANON_KEY)

@app.route("/conversations/new", methods=["POST"])
def conversations_new():
  try:
    user_id = require_user_id()
    convo_id = create_conversation(user_id)
    # ✅ do not store system message (prevents duplication)
    return jsonify({"ok": True, "conversation_id": convo_id})
  except PermissionError as e:
    return jsonify({"ok": False, "error": str(e)}), 401
  except Exception as e:
    return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/chatbot", methods=["POST"])
def chatbot():
  try:
    user_id = require_user_id()
  except PermissionError as e:
    return (str(e), 401)

  data = request.get_json(silent=True) or {}
  prompt = (data.get("prompt") or "").strip()
  conversation_id = (data.get("conversation_id") or "").strip()

  if not prompt:
    return ("Missing prompt", 400)
  if not conversation_id:
    return ("Missing conversation_id", 400)

  messages = load_messages(user_id, conversation_id, max_turns=10)

  save_message(user_id, conversation_id, "user", prompt)
  messages.append({"role": "user", "content": prompt})

  try:
    completion = client.chat.completions.create(model=MODEL_ID, messages=messages)
    reply = completion.choices[0].message.content.strip()
  except Exception as e:
    return (f"Model error: {str(e)}", 500)

  save_message(user_id, conversation_id, "assistant", reply)
  return (reply, 200)

@app.route("/pdf/index", methods=["POST"])
def pdf_index():
  try:
    user_id = require_user_id()
  except PermissionError as e:
    return jsonify({"ok": False, "error": str(e)}), 401

  # Debug logs (remove later)
  print("PDF INDEX: user_id =", user_id)
  print("files keys:", list(request.files.keys()))

  if "files" not in request.files:
    return jsonify({"ok": False, "error": "No files uploaded under key 'files'"}), 400

  pdf_files = request.files.getlist("files")
  if not pdf_files:
    return jsonify({"ok": False, "error": "Empty files list"}), 400

  try:
    result = rag.index_pdfs_for_user(user_id, pdf_files)
    return jsonify(result), (200 if result.get("ok") else 400)
  except Exception as e:
    return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/pdf/ask", methods=["POST"])
def pdf_ask():
  try:
    user_id = require_user_id()
  except PermissionError as e:
    return jsonify({"ok": False, "error": str(e)}), 401

  data = request.get_json(silent=True) or {}
  question = (data.get("question") or "").strip()
  k = int(data.get("k") or 8)

  if not question:
    return jsonify({"ok": False, "error": "Missing question"}), 400

  ctx = rag.retrieve_for_user(user_id, question, k=k)
  if not ctx["context"].strip():
    return jsonify({"ok": True, "answer": "I don't know (no indexed PDF content found).", "sources": []}), 200

  prompt = (
    "Answer using ONLY the PDF context below.\n"
    "If the answer is not in the context, say you don't know.\n\n"
    f"QUESTION:\n{question}\n\n"
    f"PDF CONTEXT:\n{ctx['context']}\n"
  )

  try:
    completion = client.chat.completions.create(
      model=MODEL_ID,
      messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
    )
    answer = completion.choices[0].message.content.strip()
  except Exception as e:
    return jsonify({"ok": False, "error": f"Model error: {str(e)}"}), 500

  return jsonify({"ok": True, "answer": answer, "sources": ctx["sources"]}), 200

@app.route("/pdf/summarize", methods=["POST"])
def pdf_summarize():
  try:
    user_id = require_user_id()
  except PermissionError as e:
    return jsonify({"ok": False, "error": str(e)}), 401

  data = request.get_json(silent=True) or {}
  k = int(data.get("k") or 40)

  broad_query = "Summarize the key contributions, methods, datasets, results, and limitations."
  ctx = rag.retrieve_for_user(user_id, broad_query, k=k)

  if not ctx["context"].strip():
    return jsonify({"ok": False, "error": "No PDF content indexed for this user."}), 400

  prompt = (
    "Write a well-structured summary of the PDFs using ONLY the context.\n"
    "Include:\n- Main topic\n- Methods\n- Data/Datasets\n- Key results\n- Limitations\n- Future work\n\n"
    f"CONTEXT:\n{ctx['context']}\n"
  )

  try:
    completion = client.chat.completions.create(
      model=MODEL_ID,
      messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
    )
    final_report = completion.choices[0].message.content.strip()
  except Exception as e:
    return jsonify({"ok": False, "error": f"Model error: {str(e)}"}), 500

  return jsonify({"ok": True, "final_report": final_report, "sources": ctx["sources"]}), 200

if __name__ == "__main__":
  port = int(os.getenv("PORT", "5000"))
  app.run(host="0.0.0.0", port=port, debug=True)
