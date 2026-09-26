import { useState, useEffect, useRef } from 'react';

function App() {
  const [user, setUser] = useState<any>(null);
  const [installations, setInstallations] = useState<any[]>([]);
  const [repos, setRepos] = useState<any[]>([]);
  const [savedRepos, setSavedRepos] = useState<any[]>(() => {
    const saved = localStorage.getItem('savedRepos');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");

  // Job State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentStage, setCurrentStage] = useState<string>("Waiting...");
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('savedRepos', JSON.stringify(savedRepos));
  }, [savedRepos]);

  useEffect(() => {
    fetch('http://51.79.165.228:3001/api/v1/auth/me', { credentials: 'include' })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("Not logged in");
      })
      .then(data => {
        setUser(data.user);
        fetchInstallations();
      })
      .catch(() => setUser(null));
  }, []);

  const fetchInstallations = () => {
    fetch('http://51.79.165.228:3001/api/v1/github/installations', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data && data.length > 0) {
          setInstallations(data);
          fetchRepos(data[0].id);
        } else {
          setInstallations([]);
          setRepos([]);
        }
      })
      .catch(() => {
        setInstallations([]);
        setRepos([]);
      });
  };

  const fetchRepos = async (instId: number) => {
    try {
        const res = await fetch(`http://51.79.165.228:3001/api/v1/github/repositories?installationId=${instId}`, { credentials: 'include' });
        const data = await res.json();
        setRepos(data || []);
        if (data && data.length > 0) {
            setSelectedRepoId(data[0].id.toString());
        }
    } catch(e) {}
  };

  const handleSaveRepo = () => {
    if (!selectedRepoId) return;
    const repoToAdd = repos.find(r => r.id.toString() === selectedRepoId);
    if (repoToAdd && !savedRepos.find(r => r.id === repoToAdd.id)) {
      setSavedRepos([...savedRepos, repoToAdd]);
    }
    setIsAddModalOpen(false);
  };

  const triggerScan = async (repo: any) => {
    setLogs([]); // Clear old logs
    try {
      const res = await fetch(`http://51.79.165.228:3001/api/v1/projects/${repo.id}/scans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ branch: repo.default_branch, repoName: repo.name, owner: repo.owner.login, installationId: installations[0]?.id })
      });
      const data = await res.json();
      if(data.jobId) setActiveJobId(data.jobId);
    } catch (e) {
      console.error(e);
    }
  };

  // Listen to Server-Sent Events when a job starts
  useEffect(() => {
    if (!activeJobId) return;

    const eventSource = new EventSource(`http://51.79.165.228:3001/api/v1/jobs/${activeJobId}/events`);

    eventSource.addEventListener("stage.started", (e: any) => {
      const data = JSON.parse(e.data);
      setCurrentStage(data.message);
      setLogs(prev => [...prev, `\n> === STAGE: ${data.stage.toUpperCase()} ===`]);
    });

    eventSource.addEventListener("log.chunk", (e: any) => {
      const data = JSON.parse(e.data);
      setLogs(prev => [...prev, data.text]);
    });

    eventSource.addEventListener("job.finished", (e: any) => {
      const data = JSON.parse(e.data);
      setCurrentStage(`Finished: ${data.status}`);
      setLogs(prev => [...prev, `\n> === JOB FINISHED: ${data.message} ===`]);
      eventSource.close();
    });

    return () => eventSource.close();
  }, [activeJobId]);

  // Auto-scroll terminal to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const logout = async () => {
    await fetch('http://51.79.165.228:3001/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    setInstallations([]);
    setRepos([]);
    setActiveJobId(null);
    setSavedRepos([]);
  };

  const devBypassLogin = () => {
    setUser({ username: 'LocalDeveloper', avatar: 'https://github.com/github.png' });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#16171d] text-gray-100 flex flex-col items-center justify-center">
        <div className="bg-[#1f2028] p-10 rounded-lg shadow-xl flex flex-col items-center max-w-md w-full text-center">
          <svg className="w-16 h-16 text-blue-500 mb-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
          <h1 className="text-3xl font-bold text-white mb-2">AI Repository Guardian</h1>
          <p className="text-gray-400 mb-8">Login to manage your repositories and run security scans.</p>
          
          <div className="w-full flex flex-col gap-3">
              <a 
                href="http://51.79.165.228:3001/api/v1/auth/github" 
                className="w-full flex justify-center py-3 px-4 rounded bg-[#2e303a] hover:bg-[#3f4150] text-white font-medium transition-colors"
              >
                Authorize with GitHub
              </a>
              <button 
                onClick={devBypassLogin}
                className="w-full flex justify-center py-2 px-4 rounded border border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 text-sm transition-colors"
              >
                Local Dev: Bypass Login to View Dashboard
              </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#16171d] text-white font-sans p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto flex justify-between items-center mb-16">
        <div className="flex items-center gap-4">
          <svg className="w-10 h-10 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
          <h1 className="text-4xl font-bold">AI Repository Guardian</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <img src={user.avatar} alt="Avatar" className="w-8 h-8 rounded-full bg-gray-800" />
            <span className="text-gray-400">{user.username}</span>
          </div>
          <button 
            onClick={logout} 
            className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-1.5 rounded transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16">
        
        {/* Left Column: Repositories */}
        <div>
          <h2 className="text-xl font-bold mb-6 text-center">Your Repositories</h2>
          
          <div className="flex flex-col gap-4 items-center w-full">
            <button 
                onClick={() => {
                    fetchInstallations();
                    setIsAddModalOpen(true);
                }}
                className="bg-[#2e303a] hover:bg-[#3f4150] text-white px-4 py-2 rounded text-sm transition-colors w-full mb-2"
            >
                + Add Repository
            </button>

            {savedRepos.length === 0 ? (
                <div className="text-center text-gray-500 text-sm mt-4">
                    No repositories added yet. Click above to add one.
                </div>
            ) : (
              <div className="w-full flex flex-col gap-3">
                {savedRepos.map(repo => (
                  <div key={repo.id} className="bg-[#1f2028] border border-gray-700 p-4 rounded flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-lg">{repo.name}</h3>
                      <p className="text-gray-400 text-sm">{repo.default_branch}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setSavedRepos(savedRepos.filter(r => r.id !== repo.id))}
                          className="text-gray-500 hover:text-red-400 font-bold px-2"
                        >
                          X
                        </button>
                        <button 
                          onClick={() => triggerScan(repo)} 
                          disabled={activeJobId !== null && currentStage !== "Waiting..." && !currentStage.startsWith("Finished")}
                          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Scan
                        </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Terminal */}
        <div>
          <h2 className="text-xl font-bold mb-6 text-center">Live Build Logs</h2>
          
          <div className="bg-[#1a1a1a] rounded-lg overflow-hidden border border-gray-700 h-[500px] flex flex-col">
            {/* Terminal Header */}
            <div className="bg-[#f3f4f6] text-center py-2 border-b border-gray-300">
              <span className="font-bold text-gray-700">
                Status: <span className="text-blue-600">{currentStage}</span>
              </span>
            </div>
            
            {/* Terminal Body */}
            <div className="flex-1 p-4 overflow-y-auto font-mono text-sm leading-relaxed text-green-500">
              {logs.length === 0 ? (
                <div className="text-center mt-4">
                  Awaiting job...
                </div>
              ) : (
                <div className="space-y-1 whitespace-pre-wrap">
                  {logs.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                  <div ref={logsEndRef} className="h-1" />
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Add Repository Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#1f2028] border border-gray-700 rounded shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                <h3 className="text-lg font-bold text-white">Add Repository</h3>
                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-gray-400 hover:text-white text-xl font-bold"
                >
                  &times;
                </button>
            </div>
            
            <div className="p-6">
                {installations.length === 0 ? (
                    <div className="text-center">
                        <p className="text-gray-400 mb-4">You need to authorize the Astro-Guardian GitHub app before you can add repositories.</p>
                        <a 
                            href="https://github.com/apps/astreaboba" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="inline-block w-full py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-500 transition-colors"
                        >
                            Authorize GitHub App
                        </a>
                    </div>
                ) : repos.length === 0 ? (
                    <div className="text-center">
                        <p className="text-gray-400 mb-4">No repositories are currently accessible.</p>
                        <a 
                            href="https://github.com/apps/astreaboba" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-blue-500 hover:underline"
                        >
                            Manage GitHub App Access
                        </a>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <label className="text-sm font-medium text-gray-400">Select Repository</label>
                        <select 
                            value={selectedRepoId}
                            onChange={(e) => setSelectedRepoId(e.target.value)}
                            className="bg-[#16171d] border border-gray-700 text-white rounded px-3 py-2 focus:outline-none focus:border-blue-500"
                        >
                            <option value="" disabled>Select a repository...</option>
                            {repos.map(r => (
                                <option key={r.id} value={r.id.toString()}>{r.name}</option>
                            ))}
                        </select>
                        
                        <button 
                            onClick={handleSaveRepo}
                            disabled={!selectedRepoId}
                            className="w-full py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Save to Dashboard
                        </button>
                    </div>
                )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
