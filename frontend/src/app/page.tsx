"use client";

import { useState, useEffect, useRef } from "react";

export default function Dashboard() {
  const [videoLink, setVideoLink] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [status, setStatus] = useState("idle"); // idle, processing, complete, error
  const [errorMsg, setErrorMsg] = useState("");
  const [resultsData, setResultsData] = useState<any[]>([]);
  const [progress, setProgress] = useState(0);
  const [totalSegments, setTotalSegments] = useState(0);
  const [stage, setStage] = useState(""); // uploading, downloading, transcribing, translating
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [transcribeCreep, setTranscribeCreep] = useState(30);
  const creepRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const savedJobId = localStorage.getItem('activeJobId');
    if (savedJobId) {
      startPolling(savedJobId);
    }
  }, []);

  const startPolling = (jobId: string) => {
    setStatus("processing");
    const pollInterval = setInterval(async () => {
      try {
        const statusRes = await fetch(`/api/status/${jobId}`);
        if (!statusRes.ok) {
          if (statusRes.status === 404) {
             clearInterval(pollInterval);
             setStatus("idle");
             localStorage.removeItem('activeJobId');
          }
          return;
        }
        const statusData = await statusRes.json();
        
        if (statusData.status === "failed") {
          clearInterval(pollInterval);
          setStatus("error");
          setErrorMsg(statusData.error || "Translation failed internally");
          localStorage.removeItem('activeJobId');
        } else if (statusData.status === "done") {
          clearInterval(pollInterval);
          setProgress(statusData.total);
          setTotalSegments(statusData.total);
          setStage("done");
          setResultsData(statusData.results);
          setStatus("complete");
        } else {
          setProgress(statusData.progress);
          setTotalSegments(statusData.total);
          setStage(statusData.stage);
        }
      } catch (pollErr) {
        console.error("Polling error", pollErr);
      }
    }, 1000);
  };

  // Slowly creep the bar from 30% → 85% during transcription so it doesn't look frozen
  useEffect(() => {
    if (stage === "transcribing") {
      setTranscribeCreep(30);
      creepRef.current = setInterval(() => {
        setTranscribeCreep(prev => {
          if (prev >= 85) { clearInterval(creepRef.current!); return 85; }
          return +(prev + 0.15).toFixed(2);
        });
      }, 1000);
    } else {
      if (creepRef.current) { clearInterval(creepRef.current); creepRef.current = null; }
      if (stage !== "transcribing") setTranscribeCreep(30);
    }
    return () => { if (creepRef.current) clearInterval(creepRef.current); };
  }, [stage]);

  const handleProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoLink && (!files || files.length === 0)) {
      setErrorMsg("Please provide a video link or upload SRT file(s).");
      return;
    }

    setStatus("processing");
    setErrorMsg("");
    setResultsData([]);
    setProgress(0);
    setTotalSegments(0);
    setStage("uploading");
    setSelectedFileIndex(0);

    try {
      const formData = new FormData();
      if (videoLink) formData.append("urls", videoLink);
      if (files) {
        for (let i = 0; i < files.length; i++) {
          formData.append("files", files[i]);
        }
      }

      const res = await fetch(`/api/process`, {
        method: "POST",
        body: formData
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to start job");
      
      const jobId = data.job_id;
      
      localStorage.setItem('activeJobId', jobId);
      startPolling(jobId);
      
    } catch (err: any) {
      console.error(err);
      setStatus("error");
      setErrorMsg(err.message);
    }
  };

  const handleTextChange = (fileIndex: number, segmentIndex: number, newHindi: string) => {
    const updatedData = [...resultsData];
    updatedData[fileIndex].data[segmentIndex].hindi = newHindi;
    setResultsData(updatedData);
  };

  const generateSrtContent = (data: any[]) => {
    let content = "";
    data.forEach((item) => {
      const formatTime = (seconds: number) => {
        const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
        const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toFixed(3).padStart(6, '0').replace('.', ',');
        return `${h}:${m}:${s}`;
      };
      content += `${item.id}\n`;
      content += `${formatTime(item.start)} --> ${formatTime(item.end)}\n`;
      content += `${item.hindi}\n\n`;
    });
    return content;
  };

  const triggerDownload = (filename: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    if (!resultsData || resultsData.length === 0) return;
    
    resultsData.forEach((result) => {
      const srtContent = generateSrtContent(result.data);
      triggerDownload(result.filename, srtContent, "text/plain");
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <header>
        <h1 className="text-3xl font-bold mb-2">Video Processing Dashboard</h1>
        <p className="text-zinc-400">
          Paste a video link below to transcribe, OR upload existing `.srt` files to translate instantly.
        </p>
      </header>

      <section className="glass-panel p-8 rounded-2xl">
        <form className="space-y-6" onSubmit={handleProcess}>
          
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <label htmlFor="link" className="block text-sm font-medium">
                  Option 1: Video URL(s)
                </label>
                <span className="text-xs text-zinc-400">One URL per line — supports multiple videos</span>
              </div>
              <textarea
                id="link"
                rows={3}
                value={videoLink}
                onChange={(e) => {
                  setVideoLink(e.target.value);
                  if (e.target.value.trim()) setFiles(null);
                }}
                placeholder={`https://drive.google.com/file/...\nhttps://youtube.com/watch?v=...\nhttps://drive.google.com/file/...`}
                className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-zinc-600 resize-none font-mono text-sm"
                disabled={files !== null && files.length > 0}
              />
              <p className="text-xs text-zinc-500 mt-1">Paste one URL per line, or separated by commas. Each video gets its own output SRT.</p>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1 border-t border-white/10"></div>
              <span className="text-xs text-zinc-500 font-medium uppercase tracking-widest">OR</span>
              <div className="flex-1 border-t border-white/10"></div>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <label htmlFor="file" className="block text-sm font-medium">
                  Option 2: Upload English SRT File(s)
                </label>
                <span className="text-xs text-zinc-400">Approx. wait: ~10s per file</span>
              </div>
              <input
                id="file"
                type="file"
                accept=".srt"
                multiple
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setFiles(e.target.files);
                    setVideoLink("");
                  } else {
                    setFiles(null);
                  }
                }}
                className="w-full text-sm text-zinc-400 file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-white/5 file:text-white hover:file:bg-white/10 transition-all cursor-pointer"
                disabled={videoLink !== ""}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={status === "processing" || (!videoLink && (!files || files.length === 0))}
            className="btn-primary w-full py-3 rounded-xl font-medium shadow-lg shadow-blue-500/20 disabled:opacity-50"
          >
            {status === "processing" 
              ? "Processing..." 
              : files && files.length > 0 
                ? `Translate ${files.length} Uploaded SRT${files.length > 1 ? 's' : ''}` 
                : videoLink.trim()
                  ? `Process ${videoLink.trim().split(/[\n,]+/).filter(Boolean).length} Video URL${videoLink.trim().split(/[\n,]+/).filter(Boolean).length > 1 ? 's' : ''}`
                  : "Process Video URL"}
          </button>
        </form>
      </section>

      {/* Status Section */}
      <section className={`glass-panel p-8 rounded-2xl space-y-6 transition-all ${status === 'idle' ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">Processing Status</h2>
        </div>
        
        {status === 'error' && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-4 rounded-lg text-sm">
            <strong className="block mb-1 text-red-400">Translation Failed</strong>
            {errorMsg}
          </div>
        )}

        {(status === 'processing' || status === 'complete') && (
          <div className="space-y-2">
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 transition-all ease-out duration-1000"
                style={{ 
                  width: `${
                    status === 'complete' ? 100 :
                    stage === 'uploading' ? 5 :
                    stage === 'downloading' ? 15 :
                    stage === 'transcribing' ? transcribeCreep :
                    Math.max(transcribeCreep, (progress / (totalSegments || 1)) * 100)
                  }%` 
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-zinc-400">
              <span>
                {status === 'complete' ? 'Done' :
                 stage === 'uploading' ? 'Uploading...' :
                 stage === 'downloading' ? 'Downloading audio from URL...' :
                 stage === 'transcribing' ? 'Transcribing audio (this takes a minute)...' :
                 `Translating segment ${progress} of ${totalSegments}...`}
              </span>
              <span>
                {status === 'complete' ? '100.00%' :
                 stage === 'uploading' ? '5.00%' :
                 stage === 'downloading' ? '15.00%' :
                 stage === 'transcribing' ? `${transcribeCreep.toFixed(2)}%` :
                 `${((progress / (totalSegments || 1)) * 100).toFixed(2)}%`}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${status === 'processing' ? 'border-blue-500 animate-pulse' : status === 'complete' ? 'border-green-500 bg-green-500/20' : 'border-zinc-600'}`}>
               {status === 'complete' && <span className="text-green-500 text-xs">✓</span>}
            </div>
            <span className={status === 'processing' ? 'text-white' : 'text-zinc-400'}>
              {status === 'processing' 
                ? (files ? 'Translating SRT files instantly...' : 'Downloading, Transcribing & Translating...') 
                : status === 'complete' ? 'Translation Complete!' : 'Waiting...'}
            </span>
          </div>
        </div>

        <div className={`pt-6 border-t border-white/10 space-y-4 ${status !== 'complete' ? 'opacity-50 pointer-events-none hidden' : ''}`}>
          <p className="text-xs text-zinc-400 text-center">
            {files && files.length > 1 
              ? `${files.length} SRT files are translated. Review them below before downloading.` 
              : "File is translated. Review it below before downloading."}
          </p>
          <div className="flex gap-4">
            <button 
              onClick={downloadAll} 
              className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-medium transition-colors border border-blue-500 shadow-lg shadow-blue-500/20"
            >
              Download Translated SRT{files && files.length > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      </section>

      {/* Inline Editor Section */}
      {status === 'complete' && resultsData.length > 0 && (
        <section className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
          <h2 className="text-2xl font-bold">Preview & Edit</h2>
          <p className="text-zinc-400 text-sm -mt-6">
            Review the generated translations below. You can click into any Hindi text box to make manual edits. When you are done, click the big Download button above.
          </p>

          <div className="space-y-6">
            {resultsData.length > 1 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {resultsData.map((file, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedFileIndex(i)}
                    className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors border ${
                      selectedFileIndex === i
                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                    }`}
                  >
                    {file.filename.replace(/^Hindi_/, '')}
                  </button>
                ))}
              </div>
            )}
            
            {resultsData[selectedFileIndex] && (
              <div className="glass-panel rounded-2xl overflow-hidden border border-white/10">
                <div className="bg-white/5 px-6 py-4 border-b border-white/10 font-semibold text-lg flex items-center justify-between">
                  {resultsData[selectedFileIndex].filename}
                  <span className="text-xs font-normal text-zinc-400 bg-black/30 px-3 py-1 rounded-full">
                    {resultsData[selectedFileIndex].data.length} segments
                  </span>
                </div>
                <div className="p-0 divide-y divide-white/5">
                  {resultsData[selectedFileIndex].data.map((segment: any, segmentIndex: number) => (
                    <div key={segment.id} className="p-6 flex flex-col md:flex-row gap-6 hover:bg-white/5 transition-colors group">
                      {/* Timeline / ID */}
                      <div className="text-xs text-zinc-500 font-mono w-16 pt-1 shrink-0">
                        #{segment.id}
                      </div>
                      
                      {/* English Original */}
                      <div className="flex-1 space-y-1">
                        <label className="text-xs uppercase tracking-widest text-zinc-400 font-semibold">Original English</label>
                        <p className="text-[15px] text-zinc-200 leading-relaxed bg-black/10 rounded-lg px-3 py-2 border border-transparent">
                          {segment.english}
                        </p>
                      </div>

                      {/* Hindi Editable */}
                      <div className="flex-1 space-y-1">
                        <label className="text-[10px] uppercase tracking-widest text-blue-400 font-semibold flex justify-between">
                          <span>Translated Hindi</span>
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity">✏️ Editable</span>
                        </label>
                        <textarea
                          value={segment.hindi}
                          onChange={(e) => handleTextChange(selectedFileIndex, segmentIndex, e.target.value)}
                          className="w-full bg-black/20 hover:bg-black/40 focus:bg-black/40 border border-transparent hover:border-white/10 focus:border-blue-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none transition-all resize-y min-h-[60px]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
