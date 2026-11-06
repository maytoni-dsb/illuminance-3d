"""Extracts tables 9–61 of EN 12464-1:2021 from its text (pdftotext) into JSON rows.

Each row: ref. no., type of task/activity area, Ēm required, Ēm modified, Uo, Ra, RUGL and the
specific requirements (used to choose the calculation plane). Run:
  python3 scripts/norms-en12464.py <en12464.txt> > norms-en.json
The output is reviewed by hand; js/norms.js holds the result.
"""
import re, sys, json

NOISE = re.compile(r'^(BS EN 12464|EN 12464-1:2021 \(E\)|\d{1,3}$|Ref\. no\. Type of task|area$|Ēm$|lx Uo Ra RUGL|Ēm,z$|lx$|Ēm,wall$|'
                   r'Ēm,ceiling lx|requireda modifiedb|a required:|b modified:|Table \d+ — .*\(continued\))')
N = r'(\d{1,2} \d{3}|\d+|[-–])'
VALS = re.compile(r'\s' + N + r'\s' + N + r'\s(0,\d+|[-–])\s' + N + r'\s' + N + r'(?=\s|$)')

def main(path):
    text = open(path, encoding='utf-8').read().split('\n')
    start = next(i for i, l in enumerate(text) if i > 1230 and l.startswith('Table 9 — '))
    end = next(i for i, l in enumerate(text) if i > start and re.match(r'^(Annex A|8 Verification|Bibliography)', l))
    out, cur, table = [], None, None
    for l in text[start:end]:
        l = l.strip()
        m = re.match(r'^Table (\d+) — (.*)$', l)
        if m and 9 <= int(m.group(1)) <= 61:
            if cur: out.append(cur); cur = None
            if table is None or table['no'] != int(m.group(1)):
                table = {'no': int(m.group(1)), 'title': m.group(2).strip()}
                out.append({'table': table['no'], 'title': table['title']})
            continue
        if not l or NOISE.match(l): continue
        m = re.match(r'^(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)\s+(.*)$', l)
        if m and table and m.group(1).split('.')[0] == str(table['no']):
            if cur: out.append(cur)
            cur = {'ref': m.group(1), 'raw': m.group(2)}; continue
        if cur: cur['raw'] += ' ' + l
    if cur: out.append(cur)
    for r in out:
        if 'raw' not in r: continue
        raw = re.sub(r'\s+', ' ', ' ' + r['raw'])
        v = VALS.search(raw)
        if not v:
            r['name'] = raw.strip(); r['bad'] = True; del r['raw']; continue
        r['name'] = raw[:v.start()].strip()
        r['req'], r['mod'], r['u0'], r['ra'], r['ugr'] = v.groups()[:5]
        r['spec'] = re.split(r'\s(?:Ref\. no\.|Ēm,wall lx|\d+\.\d+\. )', raw[v.end():])[0].strip()
        del r['raw']
    json.dump(out, sys.stdout, ensure_ascii=False, indent=0)

main(sys.argv[1])
