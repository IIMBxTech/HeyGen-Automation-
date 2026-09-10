"use client";

import { useState, useEffect } from "react";

export default function Glossary() {
  const [entries, setEntries] = useState<any[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEntry, setNewEntry] = useState({ english: "", hindi_simple: "", rule_type: "force" });
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchGlossary();
  }, []);

  const fetchGlossary = () => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/glossary`)
      .then(res => res.json())
      .then(data => {
        setEntries(data.entries || []);
        setFilteredEntries(data.entries || []);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch glossary", err);
        setIsLoading(false);
      });
  };

  // Search and Filter logic
  useEffect(() => {
    let result = entries;
    
    if (filterType !== "all") {
      result = result.filter(e => e.type === filterType);
    }
    
    if (searchQuery.trim()) {
      const lowerQ = searchQuery.toLowerCase();
      result = result.filter(e => 
        e.english.toLowerCase().includes(lowerQ) || 
        (e.hindi_simple && e.hindi_simple.toLowerCase().includes(lowerQ))
      );
    }
    
    setFilteredEntries(result);
    setCurrentPage(1); // Reset to page 1 on search or filter
  }, [searchQuery, filterType, entries]);

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntry.english) return;
    
    setIsAdding(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/glossary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          english: newEntry.english,
          hindi_simple: newEntry.rule_type === "keep" ? newEntry.english : newEntry.hindi_simple,
          rule_type: newEntry.rule_type
        })
      });
      if (res.ok) {
        setIsAddModalOpen(false);
        setNewEntry({ english: "", hindi_simple: "", rule_type: "force" });
        fetchGlossary(); // Refresh list
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAdding(false);
    }
  };

  const totalPages = Math.ceil(filteredEntries.length / itemsPerPage);
  const currentEntries = filteredEntries.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold mb-2">Glossary Management</h1>
          <p className="text-zinc-400">
            Manage your Force Translate and Keep As-Is rules to strictly enforce correct terminology.
          </p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="btn-primary px-6 py-2 rounded-xl font-medium shadow-lg shadow-blue-500/20"
        >
          + Add New Word
        </button>
      </header>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold mb-4">Add New Glossary Rule</h2>
            <form onSubmit={handleAddEntry} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">Rule Type</label>
                <select 
                  value={newEntry.rule_type}
                  onChange={(e) => setNewEntry({...newEntry, rule_type: e.target.value})}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="force">Force Translate</option>
                  <option value="keep">Keep As-Is (Do Not Translate)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1">English Word / Phrase</label>
                <input 
                  type="text" 
                  value={newEntry.english}
                  onChange={(e) => setNewEntry({...newEntry, english: e.target.value})}
                  placeholder="e.g. AI Models"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  required
                />
              </div>

              {newEntry.rule_type === "force" && (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Hindi Translation</label>
                  <input 
                    type="text" 
                    value={newEntry.hindi_simple}
                    onChange={(e) => setNewEntry({...newEntry, hindi_simple: e.target.value})}
                    placeholder="e.g. एआई मॉडल्स"
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    required
                  />
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isAdding}
                  className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
                >
                  {isAdding ? "Saving..." : "Save Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <section className="glass-panel rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10 flex gap-4">
          <input
            type="text"
            placeholder="Search words..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-black/20 border border-white/10 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-zinc-400 text-white"
          />
          <select 
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-black/20 border border-white/10 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-zinc-300"
          >
            <option value="all" className="bg-zinc-900 text-zinc-300">All Rule Types</option>
            <option value="force" className="bg-zinc-900 text-zinc-300">Force Translate</option>
            <option value="keep" className="bg-zinc-900 text-zinc-300">Keep As-Is</option>
          </select>
        </div>
        
        <table className="w-full text-left">
          <thead className="bg-white/5 border-b border-white/10">
            <tr>
              <th className="px-6 py-4 font-medium text-zinc-300">Rule Type</th>
              <th className="px-6 py-4 font-medium text-zinc-300">Original English</th>
              <th className="px-6 py-4 font-medium text-zinc-300">Translation / Mapping</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-zinc-500">Loading glossary...</td>
              </tr>
            ) : filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-zinc-500">No entries found.</td>
              </tr>
            ) : (
              currentEntries.map((entry, idx) => (
                <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    {entry.type === 'force' ? (
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-md uppercase font-bold tracking-wider">Force Translate</span>
                    ) : (
                      <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-md uppercase font-bold tracking-wider">Keep As-Is</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-white font-medium">{entry.english}</td>
                  <td className="px-6 py-4 text-zinc-300">{entry.hindi_simple}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        
        <div className="p-4 border-t border-white/10 flex justify-between items-center text-sm text-zinc-400 flex-wrap gap-3">
          <span>
            Showing {Math.min(currentPage * itemsPerPage, filteredEntries.length)} of {filteredEntries.length} entries
          </span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">Rows per page:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-zinc-300 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
            <span className="text-xs">Page {currentPage} of {totalPages || 1}</span>
            <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 bg-white/5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              Previous
            </button>
            <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1 bg-white/5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
