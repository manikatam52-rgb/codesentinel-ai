import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../lib/api';

interface Issue {
  id: string;
  title: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  filePath: string | null;
  assignee?: { id: string; name: string } | null;
}

const STATUSES: Issue['status'][] = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];

export default function IssueList({ projectId }: { projectId: string }) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [title, setTitle] = useState('');
  const [severity, setSeverity] = useState<Issue['severity']>('MEDIUM');
  const [error, setError] = useState<string | null>(null);

  const load = () => api.issues(projectId).then(setIssues).catch((e) => setError(String(e.message)));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await api.createIssue(projectId, { title, severity, description: '' });
      setTitle('');
      load();
    } catch (err) {
      setError(String((err as Error).message));
    }
  };

  const cycle = async (issue: Issue) => {
    const next = STATUSES[(STATUSES.indexOf(issue.status) + 1) % STATUSES.length];
    await api.updateIssue(projectId, issue.id, { status: next });
    load();
  };

  return (
    <div className="card">
      <h3>Issues</h3>
      {error && <div className="error">{error}</div>}
      <form className="issue-form" onSubmit={create}>
        <input placeholder="New issue title…" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select value={severity} onChange={(e) => setSeverity(e.target.value as Issue['severity'])}>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button className="btn primary">Add</button>
      </form>
      {issues.length === 0 && <p className="muted">No issues.</p>}
      {issues.map((i) => (
        <div key={i.id} className="list-item">
          <div>
            <strong>{i.title}</strong>
            <div className="muted small">{i.filePath ? `${i.filePath}` : 'Manual issue'}</div>
          </div>
          <div className="row-gap">
            <span className={`sev ${i.severity.toLowerCase()}`}>{i.severity}</span>
            <button className={`btn status ${i.status.toLowerCase()}`} onClick={() => cycle(i)}>
              {i.status.replace('_', ' ')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
