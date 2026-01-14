import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from services.memory_service import load_memory, save_memory
from services.llm_service import generate_response

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend communication

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

    # Generate response
    ai_response, errors = generate_response(user_message, context_window)

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
