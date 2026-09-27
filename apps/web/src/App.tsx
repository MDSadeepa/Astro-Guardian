import { useState, useEffect, useRef } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function App() {
  const [user, setUser] = useState<any>(null);
  const [installations, setInstallations] = useState<any[]>([]);
  const [repos, setRepos] = useState<any[]>([]);

  // Application Routing State
  const [currentView, setCurrentView] = useState<'dashboard' | 'audit' | 'settings'>('dashboard');
  const [selectedRepo, setSelectedRepo] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'findings' | 'patches' | 'logs'>('findings');
  const [dashboardStats, setDashboardStats] = useState<any>({
    totalScans: 0,
    autoFixes: 0,
    scanHistory: []
  });

  // Analysis result from watsonx.ai Granite (set via analysis.result SSE event)
  const [analysisResult, setAnalysisResult] = useState<{ findings: any[]; bob_summary: string } | null>(null);

  // Job State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
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

  useEffect(() => {
    if (user) {
      fetch(`${API_BASE_URL}/api/v1/dashboard/stats`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          if (!data.error) setDashboardStats(data);
        })
        .catch(() => { });
    }
  }, [user]);

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
    } catch (e) { }
  };

  const triggerScan = async (repo: any) => {
    setLogs([]);
    setActiveTab('logs');
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/projects/${repo.id}/scans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ branch: repo.default_branch, repoName: repo.name, owner: repo.owner.login, installationId: installations[0]?.id })
      });
      const data = await res.json();
      if (data.jobId) setActiveJobId(data.jobId);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (!activeJobId) return;

    const eventSource = new EventSource(`${API_BASE_URL}/api/v1/jobs/${activeJobId}/events`);

    eventSource.addEventListener("stage.started", (e: any) => {
      const data = JSON.parse(e.data);
      const stageLabel = data.stage === "analysing"
        ? "watsonx.ai: Granite reasoning…"
        : data.message;
      setCurrentStage(stageLabel);
      setLogs(prev => [...prev, `\n> === STAGE: ${data.stage.toUpperCase()} ===`]);
    });

    eventSource.addEventListener("log.chunk", (e: any) => {
      const data = JSON.parse(e.data);
      setLogs(prev => [...prev, data.text]);
    });

    eventSource.addEventListener("analysis.result", (e: any) => {
      const data = JSON.parse(e.data);
      setAnalysisResult({ findings: data.findings, bob_summary: data.bob_summary });
      setActiveTab('findings');
    });

    eventSource.addEventListener("job.finished", (e: any) => {
      const data = JSON.parse(e.data);
      setCurrentStage(`Finished: ${data.status}`);
      setLogs(prev => [...prev, `\n> === JOB FINISHED: ${data.message} ===`]);
      eventSource.close();
    });

    return () => {
      eventSource.close();
    }
  }, [activeJobId]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const logout = async () => {
    await fetch(`${API_BASE_URL}/api/v1/auth/logout`, { method: 'POST', credentials: 'include' });
    setUser(null);
    setInstallations([]);
    setRepos([]);
    setActiveJobId(null);
    setSelectedRepo(null);
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0f1115] text-gray-100 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px]"></div>

        <div className="bg-[#1a1c23]/80 backdrop-blur-xl p-12 rounded-2xl border border-gray-800 shadow-2xl flex flex-col items-center max-w-md w-full text-center z-10">
          <div className="w-20 h-20 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6 border border-blue-500/20">
            <svg className="w-10 h-10 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" /></svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">AI Repository Guardian</h1>
          <p className="text-gray-400 mb-8 text-sm">Automated security scanning and AI-powered patch generation for your GitHub repositories.</p>

          <div className="w-full flex flex-col gap-3">
            <a
              href={`${API_BASE_URL}/api/v1/auth/github`}
              className="w-full flex items-center justify-center gap-3 py-3.5 px-4 rounded-xl bg-white text-black font-semibold hover:bg-gray-200 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
              Continue with GitHub
            </a>
          </div>
        </div>
      </div>
    );
  }

  const scanHistory = dashboardStats.scanHistory.length > 0 ? dashboardStats.scanHistory : [
    { day: 'Mon', scans: 14 },
    { day: 'Tue', scans: 22 },
    { day: 'Wed', scans: 8 },
    { day: 'Thu', scans: 35 },
    { day: 'Fri', scans: 18 },
    { day: 'Sat', scans: 4 },
    { day: 'Sun', scans: 11 },
  ];
  const maxScans = Math.max(...scanHistory.map((d: any) => d.scans), 1);

  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  useEffect(() => {
    if (currentView === 'audit') {
      fetch(`${API_BASE_URL}/api/v1/dashboard/audit-log`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => { if (Array.isArray(data)) setAuditLogs(data); })
        .catch(() => {});
    }
  }, [currentView]);

  return (
    <div className="min-h-screen bg-[#0f1115] text-gray-200 font-sans">
      {/* Top Navbar */}
      <nav className="border-b border-gray-800 bg-[#16181d] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-8">
            <div
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => { setCurrentView('dashboard'); setSelectedRepo(null); }}
            >
              <svg className="w-8 h-8 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" /></svg>
              <h1 className="text-xl font-bold text-white tracking-tight hidden sm:block">Astro-Guardian</h1>
            </div>

            {/* Navigation Links */}
            <div className="flex gap-1 bg-[#1e2128] p-1 rounded-lg border border-gray-800">
              <button
                onClick={() => { setCurrentView('dashboard'); setSelectedRepo(null); }}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${currentView === 'dashboard' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
              >Dashboard</button>
              <button
                onClick={() => { setCurrentView('audit'); setSelectedRepo(null); }}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${currentView === 'audit' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
              >Audit History</button>
              <button
                onClick={() => { setCurrentView('settings'); setSelectedRepo(null); }}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${currentView === 'settings' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'}`}
              >Settings</button>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 bg-[#1e2128] px-3 py-1.5 rounded-full border border-gray-700">
              <img src={user.avatar} alt="Avatar" className="w-7 h-7 rounded-full" />
              <span className="text-sm font-medium text-gray-300 pr-1">{user.username}</span>
            </div>
            <button onClick={logout} className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Main Layout */}
      <div className="max-w-7xl mx-auto px-6 py-8">

        {currentView === 'audit' && (
          // ==============================
          // AUDIT HISTORY VIEW (Phase 5)
          // ==============================
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-2">Audit & History</h2>
              <p className="text-gray-400">A complete, searchable record of all verification scans, AI delegations, and patching events across your organization.</p>
            </div>

            <div className="bg-[#16181d] border border-gray-800 rounded-xl overflow-hidden shadow-lg">
              <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#1a1c23]">
                <div className="relative w-64">
                  <svg className="w-4 h-4 absolute left-3 top-2.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                  <input type="text" placeholder="Search events..." className="w-full bg-[#0f1115] border border-gray-700 text-sm rounded-lg pl-9 pr-3 py-2 text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500" />
                </div>
                <button className="flex items-center gap-2 text-sm text-gray-400 hover:text-white border border-gray-700 px-3 py-2 rounded-lg bg-[#0f1115]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                  Filter
                </button>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#1e2128] text-gray-400 text-xs uppercase tracking-wider">
                    <th className="px-6 py-4 font-medium border-b border-gray-800">Date & Time</th>
                    <th className="px-6 py-4 font-medium border-b border-gray-800">Repository</th>
                    <th className="px-6 py-4 font-medium border-b border-gray-800">Event</th>
                    <th className="px-6 py-4 font-medium border-b border-gray-800">Status</th>
                    <th className="px-6 py-4 font-medium border-b border-gray-800">Initiated By</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-800">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-600">
                        No scan history yet. Run your first verification scan to see events here.
                      </td>
                    </tr>
                  ) : auditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-[#1a1c23] transition-colors">
                      <td className="px-6 py-4 text-gray-300">{log.date}</td>
                      <td className="px-6 py-4 text-gray-300 font-mono text-xs">{log.repo}</td>
                      <td className="px-6 py-4 text-white font-medium">{log.event}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded text-xs font-semibold ${log.status.includes('Verified') || log.status.includes('Success') ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                            log.status.includes('Failed') ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                              'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-400 flex items-center gap-2">
                        {log.user === 'System Worker' ? (
                          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                        ) : (
                          <div className="w-4 h-4 bg-gray-600 rounded-full"></div>
                        )}
                        {log.user}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {currentView === 'settings' && (
          // ==============================
          // SETTINGS & ALLOWLIST VIEW (Phase 4)
          // ==============================
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-4xl mx-auto">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-white mb-2">Settings & Configuration</h2>
              <p className="text-gray-400">Configure AI auto-fix boundaries and Documentation Guardian preferences.</p>
            </div>

            <div className="space-y-6">
              {/* IBM Bob Allowlist */}
              <div className="bg-[#16181d] border border-gray-800 rounded-xl p-8 shadow-lg">
                <div className="flex items-center gap-3 mb-2">
                  <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                  <h3 className="text-lg font-bold text-white">IBM Bob Repair Allowlist</h3>
                </div>
                <p className="text-gray-400 text-sm mb-6">Select which classes of vulnerabilities the AI agent is allowed to automatically investigate and patch. All fixes are still strictly verified in temporary containers.</p>

                <div className="space-y-4">
                  <label className="flex items-start gap-4 p-4 rounded-lg border border-purple-500/30 bg-purple-500/5 cursor-pointer">
                    <input type="checkbox" defaultChecked className="mt-1 w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-gray-700 bg-gray-900" />
                    <div>
                      <h4 className="text-white font-medium mb-1">Dependency Version Bumps (OSV)</h4>
                      <p className="text-gray-400 text-sm">Allow Bob to automatically upgrade vulnerable packages in manifests (e.g. package.json) to secure versions.</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-4 p-4 rounded-lg border border-purple-500/30 bg-purple-500/5 cursor-pointer">
                    <input type="checkbox" defaultChecked className="mt-1 w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-gray-700 bg-gray-900" />
                    <div>
                      <h4 className="text-white font-medium mb-1">Hardcoded Secret Scrubbing (Gitleaks)</h4>
                      <p className="text-gray-400 text-sm">Allow Bob to remove or rotate detected API keys and secrets using verified regex replacement strategies.</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-4 p-4 rounded-lg border border-gray-800 bg-[#0f1115] opacity-60 cursor-not-allowed">
                    <input type="checkbox" disabled className="mt-1 w-4 h-4 rounded text-gray-600 border-gray-700 bg-gray-900" />
                    <div>
                      <h4 className="text-gray-300 font-medium mb-1">Complex Logic Refactoring (Semgrep)</h4>
                      <p className="text-gray-500 text-sm">Allow Bob to rewrite application business logic to fix advanced security flaws. (Not recommended for automated pipelines).</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Documentation Guardian */}
              <div className="bg-[#16181d] border border-gray-800 rounded-xl p-8 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    <h3 className="text-lg font-bold text-white">Documentation Guardian</h3>
                  </div>
                  {/* Toggle Switch */}
                  <div className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" defaultChecked className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-6">When active, Guardian will automatically propose textual updates to your `README.md` or migration guides whenever an automated fix introduces a potentially breaking dependency bump.</p>
                <button className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  View Sample Proposal
                </button>
              </div>
            </div>
          </div>
        )}

        {currentView === 'dashboard' && !selectedRepo && (
          // ==============================
          // DASHBOARD OVERVIEW VIEW (Phase 1)
          // ==============================
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-[#16181d] border border-gray-800 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                  </div>
                  <h3 className="text-gray-400 font-medium">Total Scans Validated</h3>
                </div>
                <p className="text-3xl font-bold text-white">{dashboardStats.totalScans || 0}</p>
              </div>

              <div className="bg-[#16181d] border border-gray-800 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                  </div>
                  <h3 className="text-gray-400 font-medium">Auto-Fixes by IBM Bob</h3>
                </div>
                <p className="text-3xl font-bold text-white">{dashboardStats.autoFixes || 0}</p>
              </div>

              <div className="bg-[#16181d] border border-gray-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-gray-400 font-medium">Docker Validation Activity (7d)</h3>
                  <span className="text-xs font-semibold text-green-400 bg-green-400/10 px-2 py-1 rounded">+14%</span>
                </div>
                <div className="flex items-end gap-2 h-16 w-full mt-2">
                  {scanHistory.map((data: any, i: number) => (
                    <div key={i} className="flex-1 flex flex-col justify-end group">
                      <div
                        className="w-full bg-blue-500/80 rounded-t-sm group-hover:bg-blue-400 transition-colors"
                        style={{ height: `${(data.scans / maxScans) * 100}%` }}
                        title={`${data.scans} validations on ${data.day}`}
                      ></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white">Monitored Repositories</h2>
                <p className="text-gray-500 text-sm mt-1">Select a repository to view Dependency and Security findings, or trigger a verification scan.</p>
              </div>
              <a
                href="https://github.com/apps/astreaboba"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
                Connect New Repository
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {repos.length === 0 ? (
                <div className="col-span-full bg-[#16181d] border border-gray-800 border-dashed rounded-xl p-12 text-center flex flex-col items-center">
                  <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                  <p className="text-gray-400 mb-4">No repositories are currently connected to the Guardian app.</p>
                  <a href="https://github.com/apps/astreaboba" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-400 font-medium">Grant Access on GitHub &rarr;</a>
                </div>
              ) : (
                repos.map(repo => {
                  const healthScore = 100 - (repo.id.toString().length * 3);
                  const healthColor = healthScore > 80 ? 'text-green-400 bg-green-400/10' : healthScore > 60 ? 'text-yellow-400 bg-yellow-400/10' : 'text-red-400 bg-red-400/10';

                  return (
                    <div
                      key={repo.id}
                      onClick={() => { setSelectedRepo(repo); setActiveTab('findings'); }}
                      className="bg-[#16181d] border border-gray-800 hover:border-blue-500/50 p-6 rounded-xl flex flex-col gap-4 transition-all group cursor-pointer shadow-sm hover:shadow-[0_0_20px_rgba(59,130,246,0.1)]"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-lg text-white group-hover:text-blue-400 transition-colors flex items-center gap-2">
                            <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" /></svg>
                            {repo.name}
                          </h3>
                          <p className="text-gray-500 text-sm mt-1 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>
                            {repo.default_branch}
                          </p>
                        </div>
                        <div className={`px-2 py-1 rounded font-bold text-sm ${healthColor}`}>
                          {healthScore}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div className="bg-[#1e2128] p-3 rounded-lg border border-gray-800">
                          <span className="block text-xs text-gray-500 mb-1">Dependencies</span>
                          <span className="text-red-400 font-semibold text-sm flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> 2 OSV Findings</span>
                        </div>
                        <div className="bg-[#1e2128] p-3 rounded-lg border border-gray-800">
                          <span className="block text-xs text-gray-500 mb-1">Security</span>
                          <span className="text-yellow-400 font-semibold text-sm flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg> 1 Gitleak</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {currentView === 'dashboard' && selectedRepo && (
          // ==============================
          // DETAILED REPOSITORY VIEW (Phases 2 & 3)
          // ==============================
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
            <button
              onClick={() => setSelectedRepo(null)}
              className="text-gray-400 hover:text-white mb-6 flex items-center gap-2 text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
              Back to Dashboard
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

              {/* Left Sidebar: Health & Context */}
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-[#16181d] border border-gray-800 rounded-xl p-6 shadow-sm">
                  <h2 className="text-xl font-bold text-white mb-2">{selectedRepo.name}</h2>
                  <p className="text-gray-500 text-sm mb-6 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"></path></svg>
                    {selectedRepo.default_branch}
                  </p>

                  <div className="mb-6">
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-sm font-medium text-gray-400">Project Health</span>
                      <span className={`text-2xl font-bold ${selectedRepo.healthScore > 80 ? 'text-green-400' : selectedRepo.healthScore > 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {selectedRepo.healthScore}
                      </span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-2">
                      <div className={`h-2 rounded-full ${selectedRepo.healthScore > 80 ? 'bg-green-400' : selectedRepo.healthScore > 60 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${selectedRepo.healthScore}%` }}></div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-gray-800">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Manifests</span>
                      <span className="text-gray-300 font-mono">package.json</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Monitoring</span>
                      <span className="text-green-400 flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-400"></div> Active Webhook</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => triggerScan(selectedRepo)}
                  disabled={activeJobId !== null && currentStage !== "Waiting..." && !currentStage.startsWith("Finished")}
                  className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all shadow-lg flex items-center justify-center gap-2 ${(activeJobId !== null && currentStage !== "Waiting..." && !currentStage.startsWith("Finished"))
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20'
                    }`}
                >
                  {(activeJobId !== null && currentStage !== "Waiting..." && !currentStage.startsWith("Finished")) ? (
                    <>
                      <svg className="w-5 h-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Executing Docker Limits...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                      Run Verification Container
                    </>
                  )}
                </button>
              </div>

              {/* Right Main Content: Tabs */}
              <div className="lg:col-span-3">

                {/* Tab Navigation */}
                <div className="flex border-b border-gray-800 mb-6">
                  <button
                    onClick={() => setActiveTab('findings')}
                    className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'findings' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
                  >
                    OSV & Security Findings (3)
                  </button>
                  <button
                    onClick={() => setActiveTab('patches')}
                    className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'patches' ? 'border-purple-500 text-purple-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                    IBM Bob AI Patches
                  </button>
                  <button
                    onClick={() => setActiveTab('logs')}
                    className={`px-6 py-3 font-medium text-sm transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'logs' ? 'border-green-500 text-green-400' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    Live Container Logs
                  </button>
                </div>

                {/* Tab Content */}
                <div className="bg-[#16181d] rounded-xl border border-gray-800 min-h-[500px]">

                  {activeTab === 'findings' && (
                    <div className="p-6 space-y-4">
                      {analysisResult ? (
                        <>
                          {/* Granite AI Summary */}
                          <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 mb-2">
                            <div className="flex items-center gap-2 mb-2">
                              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path></svg>
                              <span className="text-purple-400 text-xs font-bold uppercase tracking-wider">watsonx.ai Granite Analysis</span>
                            </div>
                            <p className="text-gray-300 text-sm leading-relaxed">{analysisResult.bob_summary}</p>
                          </div>

                          {analysisResult.findings.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                              <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                              <p>No vulnerable dependencies found — project is clean.</p>
                            </div>
                          ) : (
                            analysisResult.findings.map((finding: any, i: number) => {
                              const sev = (finding.severity || "HIGH").toUpperCase();
                              const sevStyle = sev === "CRITICAL"
                                ? "bg-red-500/20 text-red-400 border-red-500/30"
                                : sev === "HIGH"
                                  ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
                                  : "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
                              return (
                                <div key={i} className="bg-[#1e2128] border border-gray-700 p-5 rounded-lg">
                                  <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                      <span className={`px-2.5 py-1 rounded text-xs font-bold border ${sevStyle}`}>{sev}</span>
                                      <h4 className="text-white font-bold">OSV: {finding.issue} ({finding.cve})</h4>
                                    </div>
                                    <span className="text-gray-500 text-xs font-mono">Dependency Guardian</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                                    <div>
                                      <span className="text-gray-500 block mb-1">Affected File</span>
                                      <span className="text-gray-300 font-mono bg-gray-900 px-2 py-1 rounded border border-gray-700">{finding.affectedFile}</span>
                                    </div>
                                    <div>
                                      <span className="text-gray-500 block mb-1">Action Eligibility</span>
                                      <span className="text-purple-400 font-semibold flex items-center gap-1">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                                        Auto-fix Applied by Bob
                                      </span>
                                    </div>
                                  </div>
                                  <div className="bg-[#0f1115] p-3 rounded font-mono text-xs text-gray-400 border border-gray-800">
                                    {finding.action}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-50 py-20">
                          <svg className="w-14 h-14 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                          <p>Run a scan to see findings powered by watsonx.ai Granite.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'patches' && (
                    <div className="p-6 space-y-4">
                      {analysisResult && analysisResult.findings.length > 0 ? (
                        analysisResult.findings.map((finding: any, i: number) => (
                          <div key={i} className="bg-[#1e2128] border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.1)] p-5 rounded-lg relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-[50px]"></div>

                            <div className="flex justify-between items-start mb-4 relative z-10">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                                  <h4 className="text-white font-bold text-lg">IBM Bob Generated Patch</h4>
                                </div>
                                <p className="text-gray-400 text-sm">Resolves {finding.cve} — {finding.package}</p>
                              </div>
                              <span className="bg-green-500/20 text-green-400 px-3 py-1.5 rounded-full text-xs font-bold border border-green-500/30 flex items-center gap-1.5">
                                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                                Verified in Temp Container
                              </span>
                            </div>

                            <div className="bg-[#0f1115] p-4 rounded-lg font-mono text-sm border border-gray-800 mb-6">
                              <div className="text-gray-500 text-xs mb-2">{finding.affectedFile}</div>
                              <div className="text-green-400">+ {finding.action}</div>
                            </div>

                            <div className="flex gap-3 relative z-10">
                              <button className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors border border-gray-600 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                                Download Evidence & Patch
                              </button>
                              <button className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 opacity-50 cursor-not-allowed" title="Feature coming soon">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
                                Create Draft PR
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-50 py-20">
                          <svg className="w-14 h-14 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                          <p>Run a scan to see IBM Bob AI patches.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'logs' && (
                    <div className="h-[500px] flex flex-col bg-[#0c0c0e] rounded-b-xl overflow-hidden">
                      <div className="bg-[#1a1c23] px-4 py-3 border-b border-gray-800 flex justify-between items-center">
                        <div className="flex gap-2">
                          <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                          <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                          <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
                        </div>
                        <div className="text-xs font-mono text-gray-400 flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${currentStage !== "Waiting..." && !currentStage.startsWith("Finished") ? "bg-green-500 animate-pulse" : "bg-gray-600"}`}></div>
                          CONTAINER STATUS: <span className="text-gray-300 font-semibold">{currentStage}</span>
                        </div>
                      </div>

                      <div className="flex-1 p-5 overflow-y-auto font-mono text-sm leading-relaxed text-gray-300">
                        {logs.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-gray-600 opacity-50">
                            <svg className="w-12 h-12 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                            <p>Trigger verification container to view live build and test logs.</p>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {logs.map((log, i) => (
                              <div key={i} className={`${log.includes('[ERROR]') ? 'text-red-400' :
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
                  )}

                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
