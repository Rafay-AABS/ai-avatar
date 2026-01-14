import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend communication

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
client = None
if not api_key:
    print("Warning: GEMINI_API_KEY not found in .env file")
else:
    client = genai.Client(api_key=api_key)

MEMORY_FILE = 'memory.json'
SYSTEM_PROMPT = "You are a friendly AI Avatar. You answer questions concisely and with a helpful tone."

def load_memory():
    if not os.path.exists(MEMORY_FILE):
        return {}
    try:
        with open(MEMORY_FILE, 'r') as f:
            return json.load(f)
    except json.JSONDecodeError:
        return {}

def save_memory(memory_data):
    with open(MEMORY_FILE, 'w') as f:
        json.dump(memory_data, f, indent=4)

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    user_message = data.get('message')
    session_id = data.get('session_id', 'default_user')

    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    # Load memory
    all_memory = load_memory()
    user_history = all_memory.get(session_id, [])

    # Limit history context (last 10 messages)
    context_window = user_history[-10:]

    # Construct prompt for Gemini
    # We will use the chat history format preferred by Gemini
    # history = [{"role": "user", "parts": ["hello"]}, {"role": "model", "parts": ["hi"]}]
    
    gemini_history = []
    # Add system prompt interaction if needed or prepended to context. 
    # For simple chat models, we can just start the chat history.
    
    for msg in context_window:
        role = "user" if msg['role'] == 'user' else "model"
        gemini_history.append({"role": role, "parts": [msg['content']]})

    # Initialize model
    if not client:
        return jsonify({"error": "Gemini API key not configured"}), 500
    
    try:
        chat = client.chats.create(
            model='gemini-2.0-flash',
            history=gemini_history,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT
            )
        )
        response = chat.send_message(user_message)
        ai_response = response.text
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    # Update memory
    user_history.append({"role": "user", "content": user_message})
    user_history.append({"role": "ai", "content": ai_response})
    
    all_memory[session_id] = user_history
    save_memory(all_memory)

    return jsonify({"response": ai_response})

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5000))
    app.run(debug=True, port=port)
