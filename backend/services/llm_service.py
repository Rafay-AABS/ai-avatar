import os
from google import genai
from google.genai import types
from groq import Groq
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

SYSTEM_PROMPT = "You are a friendly AI Avatar. You answer questions concisely and with a helpful tone."

# Configure Gemini
api_key = os.getenv("GEMINI_API_KEY")
client = None
if not api_key:
    # Try looking for .env in parent directory if not found (in case running from backend root)
    if not os.path.exists('.env'):
         pass 
    print("Warning: GEMINI_API_KEY not found in environment")
else:
    client = genai.Client(api_key=api_key)

# Configure Groq
groq_api_key = os.getenv("GROQ_API_KEY")
groq_client = None
if not groq_api_key:
    print("Warning: GROQ_API_KEY not found in environment")
else:
    groq_client = Groq(api_key=groq_api_key)

def generate_response(user_message, context_window):
    """
    Generates a response from LLM (Gemini with Groq fallback).
    
    Args:
        user_message (str): The current user message.
        context_window (list): List of previous message dicts {'role': '...', 'content': '...'}
        
    Returns:
        tuple: (response_text, error_list)
    """
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
                model='gemini-1.5-flash',
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
            
    return ai_response, errors
