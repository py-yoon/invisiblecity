"""UpdraftPlus MySQL 덤프를 sqlite로 옮긴다. 사용: python3 sql2sqlite.py db.sql out.db"""
import re, sqlite3, sys

ESC = {'n': '\n', 'r': '\r', 't': '\t', '0': '\0', 'Z': '\x1a', 'b': '\b'}

def parse_values(s, i):
    rows = []
    n = len(s)
    while i < n:
        while s[i] in ' ,\n': i += 1
        if s[i] == ';': return rows
        assert s[i] == '(', s[i:i+50]
        i += 1
        row = []
        while True:
            while s[i] == ' ': i += 1
            c = s[i]
            if c == "'":
                i += 1; buf = []
                while True:
                    j = s.find("'", i); k = s.find('\\', i)
                    if k != -1 and k < j:
                        buf.append(s[i:k]); e = s[k+1]
                        buf.append(ESC.get(e, e)); i = k + 2
                    elif s[j+1:j+2] == "'":
                        buf.append(s[i:j] + "'"); i = j + 2
                    else:
                        buf.append(s[i:j]); i = j + 1; break
                row.append(''.join(buf))
            else:
                m = re.compile(r"[^,)]*").match(s, i)
                tok = m.group().strip(); i = m.end()
                row.append(None if tok == 'NULL' else (int(tok) if re.fullmatch(r'-?\d+', tok) else tok))
            while s[i] == ' ': i += 1
            if s[i] == ',': i += 1; continue
            assert s[i] == ')'; i += 1; break
        rows.append(row)
    return rows

src = open(sys.argv[1], encoding='utf-8', errors='replace').read()
db = sqlite3.connect(sys.argv[2])
for m in re.finditer(r'CREATE TABLE `(\w+)` \((.*?)\n\)', src, re.S):
    cols = re.findall(r'^\s+`(\w+)`', m.group(2), re.M)
    db.execute(f'DROP TABLE IF EXISTS {m.group(1)}')
    db.execute(f'CREATE TABLE {m.group(1)} ({",".join(cols)})')
counts = {}
for m in re.finditer(r'^INSERT INTO `(\w+)` VALUES ', src, re.M):
    t = m.group(1)
    rows = parse_values(src, m.end())
    if rows:
        db.executemany(f'INSERT INTO {t} VALUES ({",".join("?"*len(rows[0]))})', rows)
    counts[t] = counts.get(t, 0) + len(rows)
db.commit()
for t, c in counts.items(): print(t, c)
