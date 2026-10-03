export type PatternRow = {
  pattern: string;
  assignmentId: string;
  word: string;
  readings: { result: string }[];
  schoolResult: { result: { correct: boolean } | null } | null;
};
export function PatternReport({ rows, weeks }: { rows: PatternRow[]; weeks: { assignmentId: string }[] }) {
  const patterns = [...new Set(rows.map(row => row.pattern))];
  return <section>
    <h3>Patterns across weeks</h3>
    <p>Independent Discovery and school results stay separate. Practice does not count as mastery.</p>
    {patterns.map(pattern => <div key={pattern}>
      <h4>{pattern.replace('spelling.', '').replaceAll('_', ' ')}</h4>
      <ul>{weeks.map((week, index) => {
        const entries = rows.filter(row => row.pattern === pattern && row.assignmentId === week.assignmentId);
        if (!entries.length) return null;
        const readings = entries.flatMap(row => row.readings);
        const school = entries.flatMap(row => row.schoolResult?.result ? [row.schoolResult.result] : []);
        return <li key={week.assignmentId}>Week {index + 1}: Discovery {readings.length ? `${readings.filter(r => r.result === 'correct').length}/${readings.length} correct` : 'not measured'}; school {school.length ? `${school.filter(r => r.correct).length}/${school.length} correct` : 'awaiting results'}.</li>;
      })}</ul>
    </div>)}
    {!patterns.length && <p>No pattern history yet.</p>}
  </section>;
}
