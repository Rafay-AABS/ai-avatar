
import os
from app import app
import json

print("Starting reproduction script...")
try:
    with app.test_client() as client:
        print("Sending POST request to /chat...")
        response = client.post('/chat', json={"message": "Hello", "session_id": "test_user"})
        print(f"Status Code: {response.status_code}")
        print(f"Response Body: {response.get_json()}")
except Exception as e:
    print(f"An error occurred: {e}")
