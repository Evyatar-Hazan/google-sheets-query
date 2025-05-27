import React, { useEffect, useState } from 'react';

type Row = Record<string, string>;

const SHEET_ID = '13XAJOnfF7RrL-WsT4eZUjMueLE4EjzDk';
const SHEETS = ['BeitShemesh', 'JerusalemDistrict', 'ExecutiveSummary', 'TireCategories'];

type SortDirection = 'asc' | 'desc' | null;

function App() {
  const [selectedSheet, setSelectedSheet] = useState(SHEETS[0]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [filteredRows, setFilteredRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const fetchSheetData = async (sheetName: string) => {
    setLoading(true);
    try {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${sheetName}&tqx=out:json`;
      const response = await fetch(url);
      const text = await response.text();

      const json = JSON.parse(text.substring(47, text.length - 2));
      const cols = json.table.cols.map((col: any) => col.label);
      const data: Row[] = json.table.rows.map((row: any) => {
        const obj: Row = {};
        row.c.forEach((cell: any, i: number) => {
          obj[cols[i]] = cell?.v?.toString() ?? '';
        });
        return obj;
      });

      setHeaders(cols);
      setRows(data);
      setFilteredRows(data);
    } catch (error) {
      console.error('שגיאה בשליפת נתונים:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSheetData(selectedSheet);
    setSearch('');
    setSortColumn(null);
    setSortDirection(null);
  }, [selectedSheet]);

  // חיפוש
  useEffect(() => {
    const lowerSearch = search.toLowerCase();
    const filtered = rows.filter((row) =>
      Object.values(row).some((val) => val.toLowerCase().includes(lowerSearch))
    );
    setFilteredRows(filtered);
  }, [search, rows]);

  // מיון
  const sortByColumn = (col: string) => {
    let direction: SortDirection = 'asc';
    if (sortColumn === col && sortDirection === 'asc') {
      direction = 'desc';
    } else if (sortColumn === col && sortDirection === 'desc') {
      direction = null;
    }

    setSortColumn(direction ? col : null);
    setSortDirection(direction);

    if (!direction) {
      setFilteredRows([...rows]); // ביטול מיון
      return;
    }

    const sorted = [...filteredRows].sort((a, b) => {
      const aVal = a[col] || '';
      const bVal = b[col] || '';
      return direction === 'asc'
        ? aVal.localeCompare(bVal, 'he')
        : bVal.localeCompare(aVal, 'he');
    });
    setFilteredRows(sorted);
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>נתונים מתוך Google Sheets</h1>

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="sheet-select">בחר טבלה:</label>{' '}
        <select
          id="sheet-select"
          value={selectedSheet}
          onChange={(e) => setSelectedSheet(e.target.value)}
        >
          {SHEETS.map((sheet) => (
            <option key={sheet} value={sheet}>
              {sheet}
            </option>
          ))}
        </select>
      </div>

      <input
        type="text"
        placeholder="חיפוש חופשי..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          marginBottom: '1rem',
          padding: '0.5rem',
          width: '100%',
          maxWidth: 400,
          direction: 'rtl',
        }}
      />

      {loading ? (
        <p>טוען נתונים...</p>
      ) : (
        <table border={1} cellPadding={8} style={{ direction: 'rtl', textAlign: 'center' }}>
          <thead>
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  onClick={() => sortByColumn(header)}
                  style={{ cursor: 'pointer', background: '#f0f0f0' }}
                >
                  {header}{' '}
                  {sortColumn === header
                    ? sortDirection === 'asc'
                      ? '▲'
                      : sortDirection === 'desc'
                      ? '▼'
                      : ''
                    : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row, i) => (
              <tr key={i}>
                {headers.map((header) => (
                  <td key={header}>{row[header]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default App;
