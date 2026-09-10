"use client";

import { useState, useEffect } from "react";

export default function Logs() {
  const [logs, setLogs] = useState<any[]>([]);

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
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {logs.length === 0 ? (
               <tr><td colSpan={4} className="px-6 py-8 text-center text-zinc-500">No logs found</td></tr>
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
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
