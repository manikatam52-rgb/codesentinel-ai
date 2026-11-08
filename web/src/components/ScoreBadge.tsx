interface Props {
  score: number | null | undefined;
}

export default function ScoreBadge({ score }: Props) {
  if (score === null || score === undefined) {
    return <span className="score-badge none">Not analyzed</span>;
  }
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
  const cls = score >= 90 ? 'good' : score >= 60 ? 'warn' : 'bad';
  return (
    <span className={`score-badge ${cls}`}>
      {score}/100 · {grade}
    </span>
  );
}
