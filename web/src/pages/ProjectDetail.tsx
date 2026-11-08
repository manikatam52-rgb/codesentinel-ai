import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { api } from '../lib/api';
import ScoreBadge from '../components/ScoreBadge';
import FindingsTable from '../components/FindingsTable';
import IssueList from '../components/IssueList';

type Tab = 'analyses' | 'reviews' | 'issues' | 'analytics' | 'tests';

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const [tab, setTab] = useState<Tab>('analyses');
  const [project, setProject] = useState<{ name: string; repoOwner: string; repoName: string } | null>(null);
  const [analyses, setAnalyses] = useState<{ id: string; status: string; qualityScore: number | null; startedAt: string; commitSha: string; _count: { findings: number } }[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [analysisDetail, setAnalysisDetail] = useState<{ findings: { id: string; filePath: string; line: number; ruleId: string; title: string; severity: string; category: string; description: string; suggestion: string | null }[] } | null>(null);
  const [suggestions, setSuggestions] = useState<{ line: number; severity: string; suggestion: string; explanation: string }[] | null>(null);
  const [reviews, setReviews] = useState<{ id: string; prNumber: number; title: string; status: string; qualityScore: number | null; summary: string | null; _count: { comments: number } }[]>([]);
  const [pulls, setPulls] = useState<{ number: number; title: string; author: string }[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [testRuns, setTestRuns] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = async () => {
    if (!projectId) return;
    try {
      const [p, a, r, an, t] = await Promise.all([
        api.project(projectId),
        api.analyses(projectId),
        api.reviews(projectId),
        api.analytics(projectId).catch(() => null),
        api.testRuns(projectId).catch(() => []),
      ]);
      setProject(p);
      setAnalyses(a);
      setReviews(r);
      setAnalytics(an);
      setTestRuns(t);
    } catch (e) {
      setError(String((e as Error).message));
    }
  };
  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const runAnalysis = async () => {
    if (!projectId) return;
    setBusy('analysis');
    try {
      await api.runAnalysis(projectId);
      await loadAll();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const openAnalysis = async (id: string) => {
    if (!projectId) return;
    setSelected(id);
    setSuggestions(null);
    setAnalysisDetail(await api.analysis(projectId, id));
  };

  const loadSuggestions = async () => {
    if (!selected) return;
    setBusy('suggestions');
    try {
      setSuggestions((await api.suggestions(selected)).suggestions);
    } finally {
      setBusy(null);
    }
  };

  const loadPulls = async () => {
    if (!projectId) return;
    setTab('reviews');
    try {
      setPulls(await api.pullRequests(projectId));
    } catch (e) {
      setError(String((e as Error).message));
    }
  };

  const reviewPr = async (prNumber: number) => {
    if (!projectId) return;
    setBusy(`review-${prNumber}`);
    try {
      await api.runReview(projectId, prNumber);
      setReviews(await api.reviews(projectId));
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'analyses', label: 'Code analysis' },
    { key: 'reviews', label: 'PR reviews' },
    { key: 'issues', label: 'Issues' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'tests', label: 'Test runs' },
  ];

  return (
    <div>
      <header className="page-head">
        <div>
          <h1>{project?.name ?? 'Project'}</h1>
          <p className="muted">
            {project?.repoOwner}/{project?.repoName}
          </p>
        </div>
        <button className="btn primary" onClick={runAnalysis} disabled={busy === 'analysis'}>
          {busy === 'analysis' ? 'Analyzing…' : '▶ Run analysis'}
        </button>
      </header>

      {error && <div className="error">{error}</div>}

      <nav className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={tab === t.key ? 'tab active' : 'tab'} onClick={t.key === 'reviews' ? loadPulls : () => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'analyses' && (
        <div className="split">
          <div className="card list">
            <h3>Analyses</h3>
            {analyses.length === 0 && <p className="muted">No analyses yet. Click “Run analysis”.</p>}
            {analyses.map((a) => (
              <div key={a.id} className={`list-item ${selected === a.id ? 'selected' : ''}`} onClick={() => void openAnalysis(a.id)}>
                <div>
                  <strong>{new Date(a.startedAt).toLocaleString()}</strong>
                  <div className="muted mono">{a.commitSha.slice(0, 8)} · {a._count.findings} findings · {a.status}</div>
                </div>
                <ScoreBadge score={a.qualityScore} />
              </div>
            ))}
          </div>
          <div className="card">
            {analysisDetail ? (
              <>
                <div className="row-between">
                  <h3>Findings ({analysisDetail.findings.length})</h3>
                  <button className="btn" onClick={loadSuggestions} disabled={busy === 'suggestions'}>
                    {busy === 'suggestions' ? 'Thinking…' : '✨ AI suggestions'}
                  </button>
                </div>
                <FindingsTable findings={analysisDetail.findings} />
                {suggestions && (
                  <div className="suggestions">
                    <h4>AI improvement suggestions</h4>
                    {suggestions.map((s, i) => (
                      <div key={i} className="suggestion">
                        <span className={`sev ${s.severity.toLowerCase()}`}>{s.severity}</span>
                        <div>
                          <p>{s.suggestion}</p>
                          <p className="muted small">{s.explanation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="muted">Select an analysis to view findings.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'reviews' && (
        <div>
          <div className="card">
            <h3>Open pull requests</h3>
            {pulls.length === 0 && <p className="muted">No open pull requests (or GitHub token not configured).</p>}
            {pulls.map((p) => (
              <div key={p.number} className="list-item">
                <div>
                  <strong>#{p.number} {p.title}</strong>
                  <div className="muted">by {p.author}</div>
                </div>
                <button className="btn primary" onClick={() => reviewPr(p.number)} disabled={busy === `review-${p.number}`}>
                  {busy === `review-${p.number}` ? 'Reviewing…' : '🤖 AI review'}
                </button>
              </div>
            ))}
          </div>
          <div className="card">
            <h3>Completed reviews</h3>
            {reviews.length === 0 && <p className="muted">No reviews yet.</p>}
            {reviews.map((r) => (
              <details key={r.id} className="review">
                <summary>
                  <strong>#{r.prNumber} {r.title}</strong> <ScoreBadge score={r.qualityScore} /> <span className="muted">{r.status}</span>
                </summary>
                <pre className="summary">{r.summary}</pre>
              </details>
            ))}
          </div>
        </div>
      )}

      {tab === 'issues' && projectId && <IssueList projectId={projectId} />}

      {tab === 'analytics' && analytics && (
        <div className="charts">
          <div className="card">
            <h3>Quality score trend</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={analytics.scoreTrend.map((s: any) => ({ ...s, date: new Date(s.date).toLocaleDateString() }))}>
                <XAxis dataKey="date" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <h3>Findings by severity</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={Object.entries(analytics.severity as Record<string, number>).map(([name, value]) => ({ name, value }))}
              >
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <h3>Top problem files</h3>
            <ul>
              {analytics.topFiles.map((f: any) => (
                <li key={f.filePath} className="mono">
                  {f.filePath} <span className="muted">({f.count})</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3>Top rules triggered</h3>
            <ul>
              {analytics.topRules.map((r: any) => (
                <li key={r.ruleId} className="mono">
                  {r.ruleId} <span className="muted">({r.count})</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === 'tests' && (
        <div className="card">
          <h3>Test runs</h3>
          {testRuns.length === 0 && <p className="muted">No test runs recorded yet.</p>}
          {testRuns.map((t) => (
            <details key={t.id} className="review">
              <summary>
                <strong>{new Date(t.createdAt).toLocaleString()}</strong>{' '}
                <span className="sev low">✅ {t.passed} passed</span> <span className="sev high">❌ {t.failed} failed</span>{' '}
                <span className="muted">{t.durationMs} ms · {t.analysis?.commitSha?.slice(0, 8)}</span>
              </summary>
              <pre className="summary">{t.log?.slice(0, 4000)}</pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
