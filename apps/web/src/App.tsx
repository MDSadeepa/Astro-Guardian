import { useState, useEffect, useRef } from 'react';

function App() {
  const [user, setUser] = useState<any>(null);
  const [installations, setInstallations] = useState<any[]>([]);
  const [repos, setRepos] = useState<any[]>([]);
  
  // Job State
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentStage, setCurrentStage] = useState<string>("Waiting...");
  const logsEndRef = useRef<HTMLDivElement>(null);

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
        }
      });
  };

  const fetchRepos = async (instId: number) => {
    const res = await fetch(`http://51.79.165.228:3001/api/v1/github/repositories?installationId=${instId}`, { credentials: 'include' });
    const data = await res.json();
    setRepos(data || []);
  };

  const triggerScan = async (repo: any) => {
    setLogs([]); // Clear old logs
    try {
      const res = await fetch(`http://51.79.165.228:3001/api/v1/projects/${repo.id}/scans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ branch: repo.default_branch, repoName: repo.name, owner: repo.owner.login, installationId: installations[0].id })
      });
      const data = await res.json();
      setActiveJobId(data.jobId);
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
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '1000px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>🛡️ Astro-Guardian</h1>
        {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <img src={user.avatar} alt="Avatar" style={{ width: '40px', borderRadius: '50%' }} />
                <span>{user.username}</span>
                <button onClick={logout} style={{ padding: '0.5rem', cursor: 'pointer' }}>Logout</button>
            </div>
        ) : (
            <a href="http://51.79.165.228:3001/api/v1/auth/github" style={{ padding: '0.5rem 1rem', background: '#333', color: 'white', textDecoration: 'none', borderRadius: '4px' }}>Log in with GitHub</a>
        )}
      </div>
      
      {user && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem' }}>
          
          {/* Left Column: Repositories */}
          <div>
            <h2>Your Repositories</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {repos.map(repo => (
                <div key={repo.id} style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{repo.name}</h3>
                  </div>
                  <button onClick={() => triggerScan(repo)} style={{ padding: '0.5rem 1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    Scan
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Live Terminal */}
          <div>
            <h2>Live Build Logs</h2>
            <div style={{ border: '1px solid #ccc', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ background: '#f3f4f6', padding: '0.5rem 1rem', borderBottom: '1px solid #ccc', fontWeight: 'bold' }}>
                    Status: <span style={{ color: '#2563eb' }}>{currentStage}</span>
                </div>
                <div style={{ background: '#1e1e1e', color: '#10b981', padding: '1rem', height: '400px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '14px', whiteSpace: 'pre-wrap' }}>
                    {logs.length === 0 ? "Awaiting job..." : logs.join('\n')}
                    <div ref={logsEndRef} />
                </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

export default App;
