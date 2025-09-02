import React, { useMemo, useState } from 'react';
import { parseXlsxFile, sortRowsMulti, areDatasetsEqual, diffDatasets, detectCellType, CellType } from './utils/xlsx';
import ExcelJS from 'exceljs';

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
  const [multiSort, setMultiSort] = useState<{ column: string; direction: SortDirection }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enableTypeCheck, setEnableTypeCheck] = useState<boolean>(false);
  const [ignoredCellKeys, setIgnoredCellKeys] = useState<string[]>([]);

  const unifiedHeaders = useMemo(() => {
    const set = new Set<string>();
    left?.headers.forEach((h) => set.add(h));
    right?.headers.forEach((h) => set.add(h));
    return Array.from(set);
  }, [left, right]);

  const activeCriteria = useMemo(() => {
    const base = column ? [{ column, direction }] : [];
    // Append additional criteria, avoiding duplicate columns
    return [...base, ...multiSort.filter((c) => c.column && !base.find((b) => b.column === c.column))];
  }, [column, direction, multiSort]);

  const sortedLeft = useMemo(() => (left ? (activeCriteria.length ? sortRowsMulti(left.rows, activeCriteria) : left.rows) : []), [left, activeCriteria]);
  const sortedRight = useMemo(() => (right ? (activeCriteria.length ? sortRowsMulti(right.rows, activeCriteria) : right.rows) : []), [right, activeCriteria]);

  const equal = useMemo(() => {
    if (!left || !right || !column) return null;
    return areDatasetsEqual(sortedLeft, sortedRight);
  }, [left, right, column, sortedLeft, sortedRight]);

  const differences = useMemo(() => {
    if (!left || !right || !column) return [] as ReturnType<typeof diffDatasets>;
    return diffDatasets(sortedLeft, sortedRight);
  }, [left, right, column, sortedLeft, sortedRight]);

  const ignoredSet = useMemo(() => new Set(ignoredCellKeys), [ignoredCellKeys]);

  const differencesForDisplay = useMemo(() => {
    if (!left || !right || !column) return [] as ReturnType<typeof diffDatasets>;
    return differences.filter((d) => {
      return unifiedHeaders.some((h) => {
        const lv = d.left?.[h] ?? '';
        const rv = d.right?.[h] ?? '';
        const valueDiffers = lv !== rv;
        let typeMismatch = false;
        if (enableTypeCheck) {
          typeMismatch = detectCellType(lv) !== detectCellType(rv);
        }
        const key = `${d.index}:${h}`;
        return (valueDiffers || typeMismatch) && !ignoredSet.has(key);
      });
    });
  }, [differences, unifiedHeaders, enableTypeCheck, ignoredSet, left, right, column]);

  function toggleIgnoreCell(rowIndex: number, header: string) {
    const key = `${rowIndex}:${header}`;
    setIgnoredCellKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  async function downloadDifferencesXlsx() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Differences');

    // Header: index + one column per header (values stacked: left then right)
    const headerRow = ['#'];
    unifiedHeaders.forEach((h) => headerRow.push(h));
    const hr = sheet.addRow(headerRow);
    hr.font = { bold: true };

    differencesForDisplay.forEach((d) => {
      const rowValues: (string | number)[] = [d.index + 1];
      unifiedHeaders.forEach((h) => {
        const lv = d.left?.[h] ?? '';
        const rv = d.right?.[h] ?? '';
        rowValues.push(`${lv}\n${rv}`);
      });
      const row = sheet.addRow(rowValues);

      // color and wrap cells that differ (value or type when enabled)
      unifiedHeaders.forEach((h, idx) => {
        const col = 2 + idx; // 1-based column index for combined cell
        const lv = d.left?.[h] ?? '';
        const rv = d.right?.[h] ?? '';
        const valueDiffers = lv !== rv;
        let typeMismatch = false;
        if (enableTypeCheck) {
          typeMismatch = detectCellType(lv) !== detectCellType(rv);
        }
        const key = `${d.index}:${h}`;
        const isIgnored = ignoredSet.has(key);
        const shouldHighlight = (valueDiffers || typeMismatch) && !isIgnored;
        const cell = row.getCell(col);
        cell.alignment = { wrapText: true, vertical: 'top' };
        if (shouldHighlight) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } } as any;
        }
      });
    });

    // autosize columns safely
    for (let i = 1; i <= sheet.columnCount; i++) {
      let max = 10;
      sheet.eachRow({ includeEmpty: true }, (row) => {
        const cell = row.getCell(i);
        const value = cell && cell.value != null ? String(cell.value) : '';
        // consider line breaks
        const len = value.split('\n').reduce((m, s) => Math.max(m, s.length), 0);
        if (len > max) max = len;
      });
      sheet.getColumn(i).width = Math.min(60, max + 2);
    }

    const base = 'differences';
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}-${ts}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
        <button onClick={() => setMultiSort((prev) => [...prev, { column: '', direction: 'asc' }])}>
          הוסף שדה מיון
        </button>
        <label style={{ marginInlineStart: 12 }}>
          <input type="checkbox" checked={enableTypeCheck} onChange={(e) => setEnableTypeCheck(e.target.checked)} /> בדיקת סוגים
        </label>
      </div>

      {multiSort.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1rem' }}>
          {multiSort.map((c, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label>שדה נוסף:</label>
              <select
                value={c.column}
                onChange={(e) => {
                    const v = e.target.value;
                    setMultiSort((prev) => prev.map((pc, i) => (i === idx ? { ...pc, column: v } : pc)));
                  }}
              >
                <option value="" disabled>
                  בחרו עמודה
                </option>
                {unifiedHeaders.map((h) => (
                  <option key={h} value={h} disabled={h === column || multiSort.some((ms, j) => j !== idx && ms.column === h)}>
                    {h}
                  </option>
                ))}
              </select>
              <select
                value={c.direction}
                onChange={(e) => {
                  const v = e.target.value as SortDirection;
                  setMultiSort((prev) => prev.map((pc, i) => (i === idx ? { ...pc, direction: v } : pc)));
                }}
              >
                <option value="asc">עולה</option>
                <option value="desc">יורד</option>
              </select>
              <button onClick={() => setMultiSort((prev) => prev.filter((_, i) => i !== idx))}>הסר</button>
            </div>
          ))}
        </div>
      )}

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
          {!equal && differencesForDisplay.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <strong>הבדלים ({differencesForDisplay.length}):</strong>
                <button onClick={downloadDifferencesXlsx}>הורד תוצאות (XLSX)</button>
              </div>
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
                  {differencesForDisplay.map((d) => (
                    <tr key={d.index}>

                      <td>{d.index + 1}</td>
                      {unifiedHeaders.map((h) => (
                        <td key={h}>
                          {(() => {
                            const lv = d.left?.[h] ?? '';
                            const rv = d.right?.[h] ?? '';
                            const valueDiffers = lv !== rv;
                            let typeMismatch = false;
                            let lt: CellType | undefined;
                            let rt: CellType | undefined;
                            if (enableTypeCheck) {
                              lt = detectCellType(lv);
                              rt = detectCellType(rv);
                              typeMismatch = lt !== rt;
                            }
                            const key = `${d.index}:${h}`;
                            const isIgnored = ignoredSet.has(key);
                            const shouldHighlight = (valueDiffers || typeMismatch) && !isIgnored;
                            const bg = shouldHighlight ? '#fff3cd' : 'transparent';
                            return (
                              <div style={{ background: bg, padding: 4 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <span title="שמאל" style={{ color: '#333' }}>{lv}</span>
                                  <span title="ימין" style={{ color: '#666' }}>{rv}</span>
                                </div>
                                {enableTypeCheck && (
                                  <div style={{ marginTop: 4, fontSize: 11, color: typeMismatch ? '#a30000' : '#666' }}>
                                    סוגים: {lt} | {rt}
                                  </div>
                                )}
                                {(valueDiffers || typeMismatch) && (
                                  <div style={{ marginTop: 6 }}>
                                    <button onClick={() => toggleIgnoreCell(d.index, h)}>
                                      {isIgnored ? 'החזר לבדיקה' : 'סמן תקין'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
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

