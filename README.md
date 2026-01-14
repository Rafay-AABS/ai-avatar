# AI Avatar Project

This is a minimal AI avatar project using Flask, Gemini API, and Three.js.

## Setup

1.  Navigate to `backend`:
    ```bash
    cd backend
    ```
2.  Create a virtual environment:
    ```bash
    python -m venv venv
    ```
3.  Activate the virtual environment:
    - Windows: `venv\Scripts\activate`
    - Mac/Linux: `source venv/bin/activate`
4.  Install dependencies:
    ```bash
    pip install flask google-generativeai python-dotenv flask-cors
    ```
5.  Add your Gemini API key to `backend/.env`.
6.  Run the server:
    ```bash
    python app.py
    ```

## Usage

1.  Open `frontend/index.html` in a browser.
    - You may need a local server for GLTF loading (e.g., `python -m http.server` in the `frontend` directory).
