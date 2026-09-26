import { useState, useEffect, useRef } from 'react';

// Change this to 'http://localhost:3001' when running the backend locally
const API_BASE_URL = 'http://51.79.165.228:3001';

function App() {
  const [user, setUser] = useState<any>(null);
  const [installations, setInstallations] = useState<any[]>([]);
  const [repos, setRepos] = useState<any[]>([]);

  // Job State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeRepoId, setActiveRepoId] = useState<number | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentStage, setCurrentStage] = useState<string>("Waiting...");
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/auth/me`, { credentials: 'include' })
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
    fetch(`${API_BASE_URL}/api/v1/github/installations`, { credentials: 'include' })
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
        const res = await fetch(`${API_BASE_URL}/api/v1/github/repositories?installationId=${instId}`, { credentials: 'include' });
        const data = await res.json();
        setRepos(data || []);
    } catch(e) {}
  };

  const triggerScan = async (repo: any) => {
    setLogs([]); // Clear old logs
    setActiveRepoId(repo.id);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${repo.id}/scans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ branch: repo.default_branch, repoName: repo.name, owner: repo.owner.login, installationId: installations[0]?.id })
      });
      const data = await res.json();
      if(data.jobId) setActiveJobId(data.jobId);
    } catch (e) {
      console.error(e);
      setActiveRepoId(null);
    }
  };

  // Listen to Server-Sent Events when a job starts
  useEffect(() => {
    if (!activeJobId) return;

    const eventSource = new EventSource(`${API_BASE_URL}/api/v1/jobs/${activeJobId}/events`);

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
      setActiveRepoId(null);
    });

    return () => {
      eventSource.close();
      setActiveRepoId(null);
    }
  }, [activeJobId]);

  // Auto-scroll terminal to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const logout = async () => {
    await fetch(`${API_BASE_URL}/api/v1/auth/logout`, { method: 'POST', credentials: 'include' });
    setUser(null);
    setInstallations([]);
    setRepos([]);
    setActiveJobId(null);
    setActiveRepoId(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0f1115] text-gray-100 flex flex-col items-center justify-center relative overflow-hidden">
        {/* Animated background blobs */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px]"></div>
        
        <div className="bg-[#1a1c23]/80 backdrop-blur-xl p-12 rounded-2xl border border-gray-800 shadow-2xl flex flex-col items-center max-w-md w-full text-center z-10">
          <div className="w-20 h-20 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6 border border-blue-500/20">
            <svg className="w-10 h-10 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">AI Repository Guardian</h1>
          <p className="text-gray-400 mb-8 text-sm">Automated security scanning and AI-powered patch generation for your GitHub repositories.</p>
          
          <div className="w-full flex flex-col gap-3">
            <a 
              href={`${API_BASE_URL}/api/v1/auth/github`} 
              className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl bg-white text-black font-semibold hover:bg-gray-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
              Continue with GitHub
            </a>
          </div>
        </div>
      </div>
    );
  }

  const scanHistory = [
    { day: 'Mon', scans: 14 },
    { day: 'Tue', scans: 22 },
    { day: 'Wed', scans: 8 },
    { day: 'Thu', scans: 35 },
    { day: 'Fri', scans: 18 },
    { day: 'Sat', scans: 4 },
    { day: 'Sun', scans: 11 },
  ];
  
  const maxScans = Math.max(...scanHistory.map(d => d.scans));

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-200 font-sans">
      {/* Top Navbar */}
      <nav className="border-b border-gray-800 bg-[#16181d] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
            <h1 className="text-xl font-bold text-white tracking-tight">AI Repository Guardian</h1>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 bg-[#1e2128] px-3 py-1.5 rounded-full border border-gray-700">
              <img src={user.avatar} alt="Avatar" className="w-7 h-7 rounded-full" />
              <span className="text-sm font-medium text-gray-300 pr-1">{user.username}</span>
            </div>
            <button 
              onClick={logout} 
              className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
              Logout
            </button>
          </div>
        </div>
      </nav>
      
      {/* Main Layout */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Top Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-[#16181d] border border-gray-800 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                    </div>
                    <h3 className="text-gray-400 font-medium">Total Scans</h3>
                </div>
                <p className="text-3xl font-bold text-white">1,284</p>
            </div>
            
            <div className="bg-[#16181d] border border-gray-800 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    </div>
                    <h3 className="text-gray-400 font-medium">Vulnerabilities Fixed</h3>
                </div>
                <p className="text-3xl font-bold text-white">342</p>
            </div>

            <div className="bg-[#16181d] border border-gray-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-gray-400 font-medium">Scan Activity (7d)</h3>
                    <span className="text-xs font-semibold text-green-400 bg-green-400/10 px-2 py-1 rounded">+14%</span>
                </div>
                <div className="flex items-end gap-2 h-16 w-full mt-2">
                    {scanHistory.map((data, i) => (
                    <div key={i} className="flex-1 flex flex-col justify-end group">
                        <div 
                            className="w-full bg-blue-500/80 rounded-t-sm group-hover:bg-blue-400 transition-colors" 
                            style={{ height: `${(data.scans / maxScans) * 100}%` }}
                            title={`${data.scans} scans on ${data.day}`}
                        ></div>
                    </div>
                    ))}
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Repositories */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-semibold text-white">Monitored Repositories</h2>
              <a 
                  href="https://github.com/apps/astreaboba"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-md shadow-blue-500/20"
              >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                  Add Repository
              </a>
            </div>
            
            <div className="flex flex-col gap-3">
              {repos.length === 0 ? (
                  <div className="bg-[#16181d] border border-gray-800 border-dashed rounded-xl p-8 text-center flex flex-col items-center">
                      <svg className="w-12 h-12 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                      <p className="text-gray-400 text-sm mb-4">No repositories are currently connected to the Guardian app.</p>
                      <a 
                          href="https://github.com/apps/astreaboba"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-400 font-medium text-sm"
                      >
                          Grant Access on GitHub &rarr;
                      </a>
                  </div>
              ) : (
                repos.map(repo => {
                  const isProcessing = activeRepoId === repo.id && currentStage !== "Waiting..." && !currentStage.startsWith("Finished");
                  
                  return (
                    <div key={repo.id} className={`bg-[#16181d] border ${isProcessing ? 'border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 'border-gray-800 hover:border-gray-600'} p-4 rounded-xl flex flex-col gap-3 transition-all group`}>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors flex items-center gap-2">
                            <svg className={`w-4 h-4 ${isProcessing ? 'text-blue-400' : 'text-gray-500'}`} fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                            {repo.name}
                          </h3>
                          <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>
                            {repo.default_branch}
                          </p>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-gray-800">
                          <button 
                            onClick={() => triggerScan(repo)} 
                            disabled={activeJobId !== null && currentStage !== "Waiting..." && !currentStage.startsWith("Finished")}
                            className={`w-full py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                              isProcessing 
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30' 
                                : 'bg-[#1e2128] hover:bg-gray-700 text-gray-200 border border-gray-700 disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                          >
                            {isProcessing ? (
                              <>
                                <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Scanning...
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                                Run Security Scan
                              </>
                            )}
                          </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Live Terminal */}
          <div className="lg:col-span-8 flex flex-col">
            <h2 className="text-lg font-semibold text-white mb-4">Build Logs & Security Output</h2>
            
            <div className="bg-[#0c0c0e] rounded-xl overflow-hidden border border-gray-800 h-[600px] flex flex-col shadow-2xl relative">
              {/* Terminal Header */}
              <div className="bg-[#16181d] px-4 py-3 border-b border-gray-800 flex justify-between items-center">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                  <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
                </div>
                <div className="text-xs font-mono text-gray-400 flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${currentStage !== "Waiting..." && !currentStage.startsWith("Finished") ? "bg-green-500 animate-pulse" : "bg-gray-600"}`}></div>
                  STATUS: <span className="text-gray-300 font-semibold">{currentStage}</span>
                </div>
              </div>
              
              {/* Terminal Body */}
              <div className="flex-1 p-5 overflow-y-auto font-mono text-sm leading-relaxed text-gray-300">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-50">
                    <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    <p>Awaiting task initiation...</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {logs.map((log, i) => (
                      <div key={i} className={`${
                        log.includes('[ERROR]') ? 'text-red-400' :
                        log.includes('[GITHUB]') ? 'text-blue-400' :
                        log.includes('[OSV]') ? 'text-orange-400' :
                        log.includes('[BOB]') ? 'text-purple-400' :
                        log.includes('=== STAGE:') ? 'text-emerald-400 font-bold mt-4 mb-2' :
                        log.includes('=== JOB FINISHED') ? 'text-emerald-400 font-bold mt-4' : 'text-gray-300'
                      }`}>
                        {log}
                      </div>
                    ))}
                    <div ref={logsEndRef} className="h-1" />
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;
