import json
import os

# Define the path to the data directory relative to this file
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
MEMORY_FILE = os.path.join(DATA_DIR, 'memory.json')

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

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
