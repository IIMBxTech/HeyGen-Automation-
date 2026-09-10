"use client";

import { useState, useEffect } from "react";

export default function Logs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/logs`)
      .then(res => res.json())
      .then(data => {
        if (data && data.logs) {
          setLogs(data.logs);
        }
      })
      .catch(err => console.error("Failed to fetch logs", err));
  }, []);

  const handleDownload = async (jobId: string) => {
    setDownloadingId(jobId);
    try {
      const res = await fetch(`/api/status/${jobId}`);
      if (!res.ok) {
        alert("File no longer available (server memory may have been cleared).");
        setDownloadingId(null);
        return;
      }
      const data = await res.json();
      if (data.status !== "done" || !data.results) {
        alert("Results not found or job incomplete.");
        setDownloadingId(null);
        return;
      }
      
      data.results.forEach((result: any) => {
        let content = "";
        result.data.forEach((item: any) => {
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
        
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    } catch (err) {
      alert("Error downloading file.");
    }
    setDownloadingId(null);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header>
        <h1 className="text-3xl font-bold mb-2">Translation Log Book</h1>
        <p className="text-zinc-400">
          History of all video translation jobs.
        </p>
      </header>

      <section className="glass-panel rounded-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className="px-6 py-4 font-medium text-zinc-300">Timestamp</th>
              <th className="px-6 py-4 font-medium text-zinc-300">Video URL</th>
              <th className="px-6 py-4 font-medium text-zinc-300">Status</th>
              <th className="px-6 py-4 font-medium text-zinc-300">Segments</th>
              <th className="px-6 py-4 font-medium text-zinc-300">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {logs.length === 0 ? (
               <tr><td colSpan={5} className="px-6 py-8 text-center text-zinc-500">No logs found</td></tr>
            ) : (
              logs.map((log, i) => (
                <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-zinc-400 text-sm">{new Date(log.timestamp).toLocaleString()}</td>
                  <td className="px-6 py-4 text-white text-sm max-w-[200px] truncate">{log.url}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${log.status === 'Success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {log.status}
                    </span>
                    {log.error && <p className="text-xs text-red-400 mt-1">{log.error}</p>}
                  </td>
                  <td className="px-6 py-4 text-zinc-300">{log.segments}</td>
                  <td className="px-6 py-4">
                    {log.status === 'Success' && log.job_id && (
                      <button 
                        onClick={() => handleDownload(log.job_id)}
                        disabled={downloadingId === log.job_id}
                        className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {downloadingId === log.job_id ? '...' : 'Download SRT'}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
