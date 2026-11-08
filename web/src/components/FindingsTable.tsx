interface Finding {
  id: string;
  filePath: string;
  line: number;
  ruleId: string;
  title: string;
  severity: string;
  category: string;
  description: string;
  suggestion: string | null;
}

export default function FindingsTable({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) return <p className="muted">🎉 No findings — the codebase looks clean.</p>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Severity</th>
          <th>Rule</th>
          <th>Location</th>
          <th>Issue</th>
        </tr>
      </thead>
      <tbody>
        {findings.map((f) => (
          <tr key={f.id}>
            <td>
              <span className={`sev ${f.severity.toLowerCase()}`}>{f.severity}</span>
            </td>
            <td className="mono">{f.ruleId}</td>
            <td className="mono small">
              {f.filePath}:{f.line}
            </td>
            <td>
              <strong>{f.title}</strong>
              <div className="muted small">{f.description}</div>
              {f.suggestion && <div className="suggestion-inline">💡 {f.suggestion}</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
