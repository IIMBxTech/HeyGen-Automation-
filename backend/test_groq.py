import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

try:
    completion = client.chat.completions.create(
        model="qwen/qwen3.8-27b",
        messages=[{"role": "user", "content": "Translate 'Hello' to Hindi"}],
    )
    print("SUCCESS! Output:", completion.choices[0].message.content)
except Exception as e:
    print("FAILED:", e)

