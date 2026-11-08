import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import ScoreBadge from '../components/ScoreBadge';

interface OverviewData {
  projects: { id: string; name: string; repoOwner: string; repoName: string; score: number | null }[];
  totals: { projects: number; openIssues: number; totalFindings: number; completedReviews: number; avgScore: number | null };
}

export default function Overview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [repos, setRepos] = useState<{ fullName: string; owner: string; name: string; defaultBranch: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.overview().then(setData).catch((e) => setError(String(e.message ?? e)));
  };
  useEffect(load, []);

  const openAdd = async () => {
    setShowAdd(true);
    try {
      setRepos(await api.githubRepos());
    } catch {
      setError('Could not list GitHub repos — add a GitHub token in your profile (PUT /api/auth/github-token).');
    }
  };

  const addProject = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const [owner, repo] = selected.split('/');
      const r = repos.find((x) => x.fullName === selected)!;
      await api.createProject({ name: name || repo, repoOwner: owner, repoName: repo, defaultBranch: r.defaultBranch });
      setShowAdd(false);
      setName('');
      setSelected('');
      load();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <header className="page-head">
        <h1>Overview</h1>
        <button className="btn primary" onClick={openAdd}>
          + Add repository
        </button>
      </header>

      {error && <div className="error">{error}</div>}

      {data && (
        <>
          <div className="stats">
            <div className="stat">
              <span className="stat-num">{data.totals.projects}</span>
              <span className="stat-label">Projects</span>
            </div>
            <div className="stat">
              <span className="stat-num">{data.totals.avgScore ?? '–'}</span>
              <span className="stat-label">Avg quality score</span>
            </div>
            <div className="stat">
              <span className="stat-num">{data.totals.openIssues}</span>
              <span className="stat-label">Open issues</span>
            </div>
            <div className="stat">
              <span className="stat-num">{data.totals.totalFindings}</span>
              <span className="stat-label">Findings</span>
            </div>
            <div className="stat">
              <span className="stat-num">{data.totals.completedReviews}</span>
              <span className="stat-label">PR reviews</span>
            </div>
          </div>

          <div className="project-grid">
            {data.projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="card project-card">
                <h3>{p.name}</h3>
                <p className="muted">
                  {p.repoOwner}/{p.repoName}
                </p>
                <ScoreBadge score={p.score} />
              </Link>
            ))}
            {data.projects.length === 0 && <p className="muted">No projects yet — add a GitHub repository to start analyzing.</p>}
          </div>
        </>
      )}

      {showAdd && (
        <div className="modal-backdrop" onClick={() => setShowAdd(false)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add repository</h2>
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">— select a repository —</option>
              {repos.map((r) => (
                <option key={r.fullName} value={r.fullName}>
                  {r.fullName}
                </option>
              ))}
            </select>
            <input placeholder="Project name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn primary" onClick={addProject} disabled={!selected || busy}>
              {busy ? 'Adding…' : 'Add project'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
