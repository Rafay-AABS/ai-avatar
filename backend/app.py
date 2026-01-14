import os
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from google import genai
from google.genai import types
from groq import Groq
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

# Configure Groq
groq_api_key = os.getenv("GROQ_API_KEY")
groq_client = None
if not groq_api_key:
    print("Warning: GROQ_API_KEY not found in .env file")
else:
    groq_client = Groq(api_key=groq_api_key)

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

    # Initialize variables
    ai_response = None
    errors = []

    # Attempt 1: Gemini
    if client:
        try:
            gemini_history = []
            for msg in context_window:
                role = "user" if msg['role'] == 'user' else "model"
                gemini_history.append({"role": role, "parts": [msg['content']]})

            chat = client.chats.create(
                model='gemini-2.0-flash-lite',
                history=gemini_history,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT
                )
            )
            response = chat.send_message(user_message)
            ai_response = response.text
        except Exception as e:
            print(f"Gemini Error: {e}")
            errors.append(f"Gemini: {str(e)}")

    # Attempt 2: Groq (Fallback)
    if not ai_response and groq_client:
        print("Falling back to Groq...")
        try:
            groq_messages = [{"role": "system", "content": SYSTEM_PROMPT}]
            for msg in context_window:
                role = "user" if msg['role'] == 'user' else "assistant"
                groq_messages.append({"role": role, "content": msg['content']})
            
            groq_messages.append({"role": "user", "content": user_message})

            chat_completion = groq_client.chat.completions.create(
                messages=groq_messages,
                model="llama-3.1-8b-instant",
            )
            ai_response = chat_completion.choices[0].message.content
        except Exception as e:
            print(f"Groq Error: {e}")
            errors.append(f"Groq: {str(e)}")

    if not ai_response:
        return jsonify({"error": "Failed to generate response", "details": errors}), 500

    # Update memory
    user_history.append({"role": "user", "content": user_message})
    user_history.append({"role": "ai", "content": ai_response})
    
    all_memory[session_id] = user_history
    save_memory(all_memory)

    return jsonify({"response": ai_response})

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5000))
    app.run(debug=True, port=port)
