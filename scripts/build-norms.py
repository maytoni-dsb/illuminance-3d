"""Builds js/norms.js — the codifier of norms (stage 7) — from the two parsers' output.

  python3 scripts/build-norms.py <sp52.txt> <en12464.txt> > js/norms.js

Rows keep: reference, name, plane (label and height; null height = vertical, not calculated here),
Ē (СП 52: general lighting column; EN: Ēm required), U0 (null = not set) and a short note.
Corrections of the PDF text and the rules for the EN planes are below, in one place.
"""
import json, re, subprocess, sys, os

here = os.path.dirname(os.path.abspath(__file__))
sp = json.loads(subprocess.check_output([sys.executable, os.path.join(here, 'norms-sp52.py'), sys.argv[1]]))
en = json.loads(subprocess.check_output([sys.executable, os.path.join(here, 'norms-en12464.py'), sys.argv[2]]))

num = lambda s: float(s.replace(',', '.').replace(' ', '')) if re.fullmatch(r'\d[\d ]*(,\d+)?', s or '') else None

# ---- СП 52.13330.2016, table Л.1 ----
SP_FIX = {  # rows the PDF text lost or garbled, read off the table by hand
    '17': [{'plane': 'В-1,0', 'desc': '', 'gen': '150', 'u0': '-'}],
    '64': [{'plane': 'Г-0,0', 'desc': 'на полу', 'gen': '300', 'u0': '-'}],
    '170': [{'plane': 'Г-0,8', 'desc': '', 'gen': '400', 'u0': '-'}],
    '179': [{'plane': 'Г-0,8', 'desc': '', 'gen': '300', 'u0': '-'}],
    '193г': [{'plane': 'Г-0,0', 'desc': 'на полу', 'gen': '50', 'u0': '-'}],
}
def sp_plane(p):
    m = re.fullmatch(r'([ГВ])-(\d+,\d+)', p)
    if m: return (p, num(m.group(2)) if m.group(1) == 'Г' else None)
    if 'вод' in p: return ('Г-0,0', 0.0)  # surface of the water: level of the floor around the pool
    return ('В', None)                      # boards, screens
def sp_rows(ref, name, groups):
    rows = []
    for g in groups:
        E = num(g['gen'])
        if E is None: continue  # «не более …» and empty cells are not targets
        label, z = sp_plane(g['plane'])
        note = g.get('desc', '').strip(' -')
        rows.append({'ref': ref, 'name': name, 'plane': label, 'z': z, 'E': E, 'U0': num(g['u0']), 'note': note})
    return rows
sp_sections, cur = [], None
for r in sp:
    if 'section' in r:
        cur = {'title': re.sub(r'\s+', ' ', r['section']).strip(), 'rows': []}; sp_sections.append(cur); continue
    if 'items' in r:
        for it in r['items']:
            ref = r['no'] + it['sub']
            nm = re.split(r'\s[ЗЖ]-\d', it['name'])[0]  # values that lost their plane (193г)
            cur['rows'] += sp_rows(ref, f"{r['name']}: {nm}", SP_FIX.get(ref, it['groups']))
    else:
        nm = re.split(r'\s(?:[ГВ]-\d|[АБВЖЗ]-\d\s)', r['name'])[0]  # values that lost their plane (17)
        cur['rows'] += sp_rows(r['no'], nm.rstrip(' ,'), SP_FIX.get(r['no'], r['groups']))
# medical: the first heading continues with the subsection «Приемные и палатные отделения»
for s in sp_sections:
    s['title'] = s['title'].replace('Медицинские организации Приемные', 'Медицинские организации. Приемные')
    if s['title'].startswith(('Лечебные отделения', 'Отделения консультативного', 'Лаборатории медицинских', 'Стерилизационные',
                              'Патологоанатомическое', 'Помещения пищеблоков')):
        s['title'] = 'Медицинские организации. ' + s['title']

# ---- EN 12464-1:2021, tables 9–61 ----
PREFIX = {'19.2': 'Winding', '19.5': 'Assembly work', '26.11': 'Assembly'}
EN_FIX = {'32.6': {'req': '1 000'}, '13.6': {'req': '75', 'u0': '0,40', 'spec': 'On aisle rack face.'}}
FLOOR_TABLES = {9, 42}
TASKS_61 = {'61.5', '61.8', '61.8.1', '61.10.1', '61.10.2', '61.10.3', '61.10.4'}
VERTICAL = re.compile(r'rack face|white boards|Display board|Facial lighting|bookshelves|Light on teacher|podium', re.I)
def en_plane(t, ref, name, spec):
    if VERTICAL.search(name) or re.match(r'(Vertical illuminance|Illuminance should be vertical)', spec, re.I): return ('В', None)
    if re.search(r'floor level', spec, re.I) or t in FLOOR_TABLES or (t == 61 and ref not in TASKS_61): return ('Г-0,0', 0.0)
    return ('Г-0,8', 0.8)
en_sections, cur = [], None
for r in en:
    if 'table' in r:
        cur = {'title': f"Table {r['table']} — {r['title']}", 'table': r['table'], 'rows': []}; en_sections.append(cur); continue
    r = {**r, **EN_FIX.get(r['ref'], {})}
    if r.get('bad') and r['ref'] not in EN_FIX: continue  # group headers («Winding:»)
    name = re.sub(r'^-\s*', '', r['name']).strip()
    head = next((PREFIX[p] for p in PREFIX if r['ref'].startswith(p + '.')), None)
    if head: name = f'{head}: {name}'
    E = num(r.get('req', '-'))
    if E is None: continue
    # the specific requirements without the leading Ēm,z, Ēm,wall, Ēm,ceiling (but «4 000 K» stays)
    tok = r.get('spec', '').split(' ')
    while tok and re.fullmatch(r'\d+|[-–]', tok[0]) and not (tok[1:2] == ['K'] or tok[1:3] == ['000', 'K']): tok.pop(0)
    spec = ' '.join(tok)
    label, z = en_plane(cur['table'], r['ref'], name, spec)
    cur['rows'].append({'ref': r['ref'], 'name': name, 'plane': label, 'z': z, 'E': E, 'U0': num(r.get('u0', '-')), 'note': spec[:160]})

def js(sections):
    out = []
    for s in sections:
        rows = ',\n'.join('    ' + json.dumps([x['ref'], x['name'], x['plane'], x['z'], x['E'], x['U0'], x['note']], ensure_ascii=False) for x in s['rows'])
        out.append(f"  {{ title: {json.dumps(s['title'], ensure_ascii=False)}, rows: [\n{rows},\n  ] }}")
    return '[\n' + ',\n'.join(out) + ',\n]'

n_sp = sum(len(s['rows']) for s in sp_sections); n_en = sum(len(s['rows']) for s in en_sections)
print(f"""// Codifier of lighting norms (stage 7), generated by scripts/build-norms.py from the texts of
// СП 52.13330.2016 (table Л.1) and EN 12464-1:2021 (tables 9–61); do not edit by hand.
// Row: [reference, room or task, plane label, plane height m (null: vertical, not calculated here),
//       Ē lx, U0 (null: not set), note]. СП 52: Ē for general lighting. EN: Ēm «required»; plane Г-0,0
//       where the standard says «at floor level» and for traffic zones (tables 9, 42, 61 except task
//       areas), vertical where it says so, else the task area at 0,8 m.
// {n_sp} + {n_en} rows.

export const SP52 = {js(sp_sections)};

export const EN12464 = {js(en_sections)};
""")
