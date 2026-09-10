import os
from dotenv import load_dotenv
load_dotenv()
import subprocess
import json
from datetime import datetime
import uuid
from typing import Optional, List
from fastapi import FastAPI, HTTPException, BackgroundTasks, File, UploadFile, Form
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from faster_whisper import WhisperModel
import yt_dlp
from groq import Groq
import pysrt

app = FastAPI(title="HeyGen Translation Helper API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    print("Loading Whisper model...")
    whisper_model = WhisperModel("small", device="cpu", compute_type="int8")
except Exception as e:
    print(f"Failed to load whisper model: {e}")
    whisper_model = None

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

JOBS = {}
LOGS_FILE = "logs.json"
def load_json_list(filepath):
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def load_json_dict(filepath):
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

FORCE_TRANSLATE = load_json_dict("force_translate.json")
DO_NOT_TRANSLATE = load_json_list("do_not_translate.json")

def log_job(identifier: str, status: str, files_count: int = 1, error: str = ""):
    logs = load_json_list(LOGS_FILE)
    logs.insert(0, {
        "timestamp": datetime.now().isoformat(),
        "url": identifier,
        "status": status,
        "segments": files_count, # Overloading this field to mean 'files processed' or segments
        "error": error
    })
    with open(LOGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(logs, f, indent=2)

def download_video_and_extract_audio(url: str, output_path: str):
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': output_path,
        'quiet': False,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])

def _has_devanagari(text: str) -> bool:
    return any('\u0900' <= c <= '\u097F' for c in text)

def translate_transcript_chunk(text: str, retry: bool = True) -> str:
    text_lower = text.lower()

    # Build glossary enforcement blocks
    relevant_force = {k: v for k, v in FORCE_TRANSLATE.items() if k.lower() in text_lower}
    relevant_dnt = [word for word in DO_NOT_TRANSLATE if word.lower() in text_lower]

    force_block = ""
    if relevant_force:
        lines = "\n".join(f'  • "{k}" → MUST become "{v}" (verbatim, no exceptions)' for k, v in relevant_force.items())
        force_block = f"\n[FORCED TRANSLATIONS — violating these = FAILURE]\n{lines}\n"

    dnt_block = ""
    if relevant_dnt:
        words = ", ".join(f'"{w}"' for w in relevant_dnt)
        dnt_block = f"\n[DO NOT TRANSLATE — keep these words exactly in English]\n  {words}\n"

    system_msg = (
        "You are a professional Hindi subtitle translator. "
        "Your ONLY job is to output the Hindi translation of whatever English text the user gives you. "
        "NEVER output the original English. NEVER explain. NEVER add notes. "
        "Output ONLY Hindi text written in Devanagari script. Nothing else."
    )

    user_msg = f"""Translate the following English subtitle line into natural, conversational Hindi (Devanagari script).

RULES (breaking any rule = wrong answer):
1. Output ONLY the Hindi translation — no English, no explanations, no quotes around the output.
2. Write exclusively in Devanagari script (हिन्दी).
3. Keep it natural and colloquial — not overly formal or Sanskritized.
4. Preserve the original meaning and sentence flow.
{force_block}{dnt_block}
English text to translate:
{text}

Hindi translation:"""

    try:
        completion = client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg}
            ],
            temperature=0.15,
            max_tokens=400
        )
        result = completion.choices[0].message.content.strip()

        # Validation: if no Devanagari detected, retry once with a more aggressive prompt
        if not _has_devanagari(result) and retry:
            print(f"WARNING: No Devanagari in response for: {text[:60]}... Retrying.")
            return translate_transcript_chunk(text, retry=False)

        return result
    except Exception as e:
        print(f"Translation error: {e}")
        return text

def process_job(job_id: str, urls: List[str], file_paths: List[str], file_names: List[str]):
    try:
        final_results = []
        identifier = ", ".join(urls) if urls else f"{len(file_paths)} files uploaded"

        if file_paths:
            # --- SRT FILE PATH ---
            JOBS[job_id]["stage"] = "translating"
            total_segments = 0
            all_subs = []
            for path in file_paths:
                subs = pysrt.open(path)
                all_subs.append(subs)
                total_segments += len(subs)

            JOBS[job_id]["total"] = total_segments

            for i, path in enumerate(file_paths):
                subs = all_subs[i]
                filename = file_names[i]
                file_data = []

                for idx, sub in enumerate(subs):
                    original_text = sub.text.replace('\n', ' ')
                    translated_text = translate_transcript_chunk(original_text)

                    start_sec = sub.start.hours * 3600 + sub.start.minutes * 60 + sub.start.seconds + sub.start.milliseconds / 1000.0
                    end_sec = sub.end.hours * 3600 + sub.end.minutes * 60 + sub.end.seconds + sub.end.milliseconds / 1000.0

                    file_data.append({
                        "id": idx + 1,
                        "start": start_sec,
                        "end": end_sec,
                        "english": original_text.strip(),
                        "hindi": translated_text
                    })
                    JOBS[job_id]["progress"] += 1

                os.remove(path)
                final_results.append({
                    "filename": f"Hindi_{filename}",
                    "data": file_data
                })

        elif urls:
            # --- VIDEO URL PATH (supports multiple URLs) ---
            if not whisper_model:
                raise Exception("Whisper model not loaded.")

            for url_idx, url in enumerate(urls):
                audio_path = f"temp_audio_{job_id}_{url_idx}.m4a"
                url_label = f"Video_{url_idx + 1}"

                JOBS[job_id]["stage"] = "downloading"
                JOBS[job_id]["url_label"] = url_label
                download_video_and_extract_audio(url, audio_path)

                JOBS[job_id]["stage"] = "transcribing"
                segments_gen, info = whisper_model.transcribe(audio_path, language="en")
                segments = list(segments_gen)

                if os.path.exists(audio_path):
                    os.remove(audio_path)

                JOBS[job_id]["stage"] = "translating"
                # Add this video's segments to total (cumulative across all URLs)
                JOBS[job_id]["total"] = JOBS[job_id].get("total", 0) + len(segments)
                file_data = []

                for idx, segment in enumerate(segments):
                    original_text = segment.text
                    translated_text = translate_transcript_chunk(original_text)

                    file_data.append({
                        "id": idx + 1,
                        "start": segment.start,
                        "end": segment.end,
                        "english": original_text.strip(),
                        "hindi": translated_text
                    })
                    JOBS[job_id]["progress"] += 1

                final_results.append({
                    "filename": f"Hindi_{url_label}.srt",
                    "data": file_data
                })
            
        JOBS[job_id]["status"] = "done"
        JOBS[job_id]["results"] = final_results
        log_job(identifier, "Success", len(final_results))
        
    except Exception as e:
        JOBS[job_id]["status"] = "failed"
        JOBS[job_id]["error"] = str(e)
        log_job(job_id, "Failed", 0, str(e))

@app.post("/api/process")
async def start_process(
    background_tasks: BackgroundTasks,
    urls: Optional[str] = Form(None),  # newline-separated list of URLs
    files: Optional[List[UploadFile]] = File(None)
):
    if not urls and not files:
        raise HTTPException(status_code=400, detail="Must provide either a URL or an SRT file")

    # Parse newline/comma-separated URLs into a clean list
    url_list = []
    if urls:
        url_list = [u.strip() for u in urls.replace(',', '\n').splitlines() if u.strip()]

    job_id = str(uuid.uuid4())
    JOBS[job_id] = {
        "status": "processing",
        "stage": "uploading",
        "progress": 0,
        "total": 1,
        "results": [],
        "error": None
    }

    file_paths = []
    file_names = []
    if files:
        for file in files:
            if not file.filename: continue
            content = await file.read()
            path = f"temp_{job_id}_{file.filename}"
            with open(path, "wb") as f:
                f.write(content)
            file_paths.append(path)
            file_names.append(file.filename)

    background_tasks.add_task(process_job, job_id, url_list, file_paths, file_names)
    return {"job_id": job_id, "status": "processing"}

@app.get("/api/status/{job_id}")
async def get_status(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(status_code=404, detail="Job not found")
    return JOBS[job_id]

class GlossaryItem(BaseModel):
    english: str
    hindi_simple: str
    rule_type: str = "force"  # "force" or "keep"

@app.get("/api/glossary")
async def get_glossary():
    force_dict = load_json_dict("force_translate.json")
    dnt_list = load_json_list("do_not_translate.json")
    
    entries = [{"english": k, "hindi_simple": v, "type": "force"} for k, v in force_dict.items()]
    entries.extend([{"english": w, "hindi_simple": w, "type": "keep"} for w in dnt_list])
    
    return {"entries": entries}

@app.post("/api/glossary")
async def add_glossary_item(item: GlossaryItem):
    global FORCE_TRANSLATE
    global DO_NOT_TRANSLATE
    
    if item.rule_type == "force":
        force_dict = load_json_dict("force_translate.json")
        force_dict[item.english] = item.hindi_simple
        with open("force_translate.json", "w", encoding="utf-8") as f:
            json.dump(force_dict, f, indent=2, ensure_ascii=False)
        FORCE_TRANSLATE = force_dict
    elif item.rule_type == "keep":
        dnt_list = load_json_list("do_not_translate.json")
        if item.english not in dnt_list:
            dnt_list.append(item.english)
        with open("do_not_translate.json", "w", encoding="utf-8") as f:
            json.dump(dnt_list, f, indent=2, ensure_ascii=False)
        DO_NOT_TRANSLATE = dnt_list
        
    return {"status": "success"}

@app.get("/api/logs")
async def get_logs():
    return {"logs": load_json_list(LOGS_FILE)}

app.mount("/_next", StaticFiles(directory="../frontend/out/_next"), name="next-static")

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    base_dir = "../frontend/out"
    if full_path == "":
        return FileResponse(os.path.join(base_dir, "index.html"))
    file_path = os.path.join(base_dir, full_path)
    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)
    html_path = f"{file_path}.html"
    if os.path.exists(html_path) and os.path.isfile(html_path):
        return FileResponse(html_path)
    if os.path.exists(os.path.join(base_dir, "404.html")):
        return FileResponse(os.path.join(base_dir, "404.html"), status_code=404)
    return FileResponse(os.path.join(base_dir, "index.html"))

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
