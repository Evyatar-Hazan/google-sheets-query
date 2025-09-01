import React, { useMemo, useState } from 'react';
import { parseXlsxFile, sortRows, areDatasetsEqual, diffDatasets } from './utils/xlsx';

type Row = Record<string, string>;

type SortDirection = 'asc' | 'desc';

function DropZone({ label, onFiles }: { label: string; onFiles: (files: FileList | null) => void }) {
  const [isOver, setIsOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsOver(false);
        onFiles(e.dataTransfer.files);
      }}
      style={{
        border: '2px dashed #888',
        padding: '1.5rem',
        borderRadius: 8,
        textAlign: 'center',
        background: isOver ? '#f5f5f5' : 'transparent',
        cursor: 'pointer',
      }}
      onClick={() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls';
        input.onchange = () => onFiles(input.files);
        input.click();
      }}
    >
      {label}
    </div>
  );
}

function App() {
  const [leftFileName, setLeftFileName] = useState<string | null>(null);
  const [rightFileName, setRightFileName] = useState<string | null>(null);
  const [left, setLeft] = useState<{ headers: string[]; rows: Row[] } | null>(null);
  const [right, setRight] = useState<{ headers: string[]; rows: Row[] } | null>(null);
  const [column, setColumn] = useState<string>('');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unifiedHeaders = useMemo(() => {
    const set = new Set<string>();
    left?.headers.forEach((h) => set.add(h));
    right?.headers.forEach((h) => set.add(h));
    return Array.from(set);
  }, [left, right]);

  const sortedLeft = useMemo(() => (left && column ? sortRows(left.rows, column, direction) : left?.rows || []), [left, column, direction]);
  const sortedRight = useMemo(() => (right && column ? sortRows(right.rows, column, direction) : right?.rows || []), [right, column, direction]);

  const equal = useMemo(() => {
    if (!left || !right || !column) return null;
    return areDatasetsEqual(sortedLeft, sortedRight);
  }, [left, right, column, sortedLeft, sortedRight]);

  const differences = useMemo(() => {
    if (!left || !right || !column) return [] as ReturnType<typeof diffDatasets>;
    return diffDatasets(sortedLeft, sortedRight);
  }, [left, right, column, sortedLeft, sortedRight]);

  async function handleFiles(side: 'left' | 'right', files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setLoading(true);
    setError(null);
    try {
      const parsed = await parseXlsxFile(file);
      if (side === 'left') {
        setLeft(parsed);
        setLeftFileName(file.name);
      } else {
        setRight(parsed);
        setRightFileName(file.name);
      }
      if (!column && parsed.headers.length > 0) {
        setColumn(parsed.headers[0]);
      }
    } catch (e: any) {
      setError(e?.message || 'שגיאה בקריאת הקובץ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', direction: 'rtl' }}>
      <h1>השוואת שני קבצי אקסל</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <DropZone label={leftFileName ? `שמאל: ${leftFileName}` : 'גררו קובץ אקסל (שמאל) או לחצו לבחירה'} onFiles={(f) => handleFiles('left', f)} />
          {left && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>שורות: {left.rows.length}</div>
          )}
        </div>
        <div>
          <DropZone label={rightFileName ? `ימין: ${rightFileName}` : 'גררו קובץ אקסל (ימין) או לחצו לבחירה'} onFiles={(f) => handleFiles('right', f)} />
          {right && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>שורות: {right.rows.length}</div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1rem' }}>
        <label>עמודת מיון:</label>
        <select value={column} onChange={(e) => setColumn(e.target.value)} disabled={!unifiedHeaders.length}>
          <option value="" disabled>
            בחרו עמודה
          </option>
          {unifiedHeaders.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <label>כיוון:</label>
        <select value={direction} onChange={(e) => setDirection(e.target.value as SortDirection)}>
          <option value="asc">עולה</option>
          <option value="desc">יורד</option>
        </select>
      </div>

      {error && <div style={{ color: 'red', marginBottom: '1rem' }}>{error}</div>}

      {loading && <div>טוען...</div>}

      {left && right && column && !loading && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ marginBottom: 8 }}>
            {equal ? (
              <span style={{ color: 'green' }}>הקבצים שווים לאחר מיון לפי "{column}"</span>
            ) : (
              <span style={{ color: 'crimson' }}>הקבצים שונים לאחר מיון לפי "{column}"</span>
            )}
          </div>
          {!equal && differences.length > 0 && (
            <div>
              <strong>הבדלים ({differences.length}):</strong>
              <table border={1} cellPadding={6} style={{ marginTop: 8, width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th>#</th>
                    {unifiedHeaders.map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {differences.map((d) => (
                    <tr key={d.index}>

                      <td>{d.index + 1}</td>
                      {unifiedHeaders.map((h) => (
                        <td
                          key={h}
                          style={{
                            background:
                              (d.left?.[h] ?? '') !== (d.right?.[h] ?? '') ? '#fff3cd' : 'transparent',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span title="שמאל" style={{ color: '#333' }}>{d.left?.[h] ?? ''}</span>
                            <span title="ימין" style={{ color: '#666' }}>{d.right?.[h] ?? ''}</span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
