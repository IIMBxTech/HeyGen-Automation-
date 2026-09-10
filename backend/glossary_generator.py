import os
import csv
import json
from groq import Groq

# Initialize Groq client
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

def generate_glossary_chunk(domain: str, existing_words: set) -> list[dict]:
    prompt = f"""
You are an expert translator specializing in converting English terms into simple, conversational, and widely understood Hindi (often using Hinglish or common Urdu/Persian loan words instead of pure/Sanskritized Hindi). 

Your task is to generate 50 highly common English terms related to the domain of '{domain}'. 
For each term, provide the simple, conversational Hindi equivalent that an average person would understand. 
Do NOT use overly formal or difficult Hindi words.

Example:
English: "Technology"
Hindi Simple: "तकनीक (Takneek)" or "टेक्नोलॉजी" instead of "प्रौद्योगिकी (Prodyogiki)"

Generate 50 unique terms.
Your output MUST be valid JSON in the following format:
{{
  "entries": [
    {{"english": "Word", "hindi_simple": "Translation"}}
  ]
}}
"""
    print(f"Generating 50 terms for domain: {domain}...")
    try:
        completion = client.chat.completions.create(
            model="llama-3.1-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a helpful translation assistant. Output only valid JSON."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.3
        )
        
        results = []
        parsed = json.loads(completion.choices[0].message.content)
        for entry in parsed.get("entries", []):
            eng = entry.get("english", "")
            hin = entry.get("hindi_simple", "")
            if eng and eng.lower() not in existing_words:
                results.append({"english": eng, "hindi_simple": hin})
                existing_words.add(eng.lower())
                
        return results
    except Exception as e:
        print(f"Error generating terms for {domain}: {e}")
        return []

def main():
    if not os.environ.get("GROQ_API_KEY"):
        print("ERROR: GROQ_API_KEY environment variable is not set.")
        return

    # List of domains to cover a wide variety of words for the translation glossary
    domains = [
        "Business and Corporate", "Technology and Software", "Finance and Banking",
        "Healthcare and Medicine", "Education and Learning", "Marketing and Sales",
        "Human Resources", "Legal and Compliance", "Engineering and Manufacturing",
        "Everyday Office Conversation", "Management and Leadership", "Customer Service",
        "Project Management", "Data and Analytics", "Media and Entertainment"
    ]
    
    # We want ~3000 words. 15 domains * 4 iterations * 50 words = 3000 words.
    iterations_per_domain = 4 
    
    output_file = "glossary.csv"
    existing_words = set()
    all_entries = []

    print(f"Starting glossary generation. Target: {len(domains) * iterations_per_domain * 50} words.")
    
    for domain in domains:
        for i in range(iterations_per_domain):
            new_entries = generate_glossary_chunk(f"{domain} (Part {i+1})", existing_words)
            all_entries.extend(new_entries)
            
            # Save incrementally
            with open(output_file, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=["english", "hindi_simple"])
                writer.writeheader()
                writer.writerows(all_entries)
                
            print(f"Saved progress. Total words so far: {len(all_entries)}")

    print(f"Done! Generated {len(all_entries)} words and saved to {output_file}.")

if __name__ == "__main__":
    main()
