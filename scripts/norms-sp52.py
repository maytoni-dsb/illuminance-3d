"""Extracts table Л.1 of СП 52.13330.2016 from its text (pdftotext) into JSON rows.

Each record → name, then groups (plane, rank, Ē for general lighting, U0). Run:
  python3 scripts/norms-sp52.py <sp52.txt> > norms-sp52.json
The output is reviewed by hand and corrected in js/norms.js; this script is kept as the record of how
the table was read.
"""
import re, sys, json

HEADINGS = [
  'Административные здания', 'Банковские, кредитно-финансовые', 'Общеобразовательные организации',
  'Зрелищные и досугово-развлекательные', 'Дошкольные образовательные организации', 'Санаторно-курортные',
  'Предприятия общественного питания', 'Предприятия розничной', 'Организации санитарно-бытового',
  'Гостиницы, мотели', 'Медицинские организации', 'Лечебные отделения', 'Отделения консультативного приема',
  'Лаборатории медицинских организаций', 'Стерилизационные помещения', 'Патологоанатомическое отделение',
  'Помещения пищеблоков', 'Аптеки', 'Центры гигиены', 'Объекты ветеринарной', 'Станции скорой',
  'Молочные кухни', 'Вокзалы всех видов', 'Жилые дома', 'Вспомогательные здания и помещения',
  'Прочие помещения общественных зданий',
]
PLANE = r'(?:[ГВ]\s?-\s?\d+,\d+|[ГВ] - на (?:середине )?(?:доски|доске|экране дисплея|поверхности воды)|Г - поверхность воды)'
RANK = r'(?:[АБВЖЗ]-\s?\d|[ГДЕЗ]|[IVX]+\s?[абвгa]?|-)'
VALS = re.compile(r'(?P<rank>' + RANK + r')\s+(?P<comb>\d+\s?/\s?\d+|-)\s+(?P<gen>Не\s+более\s+\d+|\d+|-)\s+(?P<u0>0,\d+|-)')

def main(path):
    text = open(path, encoding='utf-8').read().split('\n')
    a = next(i for i, l in enumerate(text) if l.startswith('Таблица Л.1 -'))
    b = next(i for i, l in enumerate(text) if l.startswith('Таблица Л.1 (Измененная'))
    lines = [l.strip() for l in text[a:b] if not re.match(r'^(СП 52\.13330|Свод правил|Страница)', l)]
    # records: start with their number 1..201 in order
    out, section, cur, expect = [], None, None, 1
    def flush():
        if cur: out.append(cur)
    for l in lines:
        h = next((x for x in HEADINGS if l.startswith(x)), None)
        if h and (cur is None or re.search(r'(\d|-)\s*$', cur['raw'])):
            flush(); cur = None
            section = l; out.append({'section': l}); continue
        if section and cur is None and out and 'section' in out[-1] and not re.match(r'^\d', l):
            out[-1]['section'] += ' ' + l; continue  # heading wraps
        m = re.match(r'^(\d{1,3}[а-я]?)(\s|$)', l)
        if m and m.group(1).rstrip('абвг') == str(expect):
            flush(); cur = {'no': m.group(1), 'raw': l[len(m.group(1)):].strip()}; expect += 1; continue
        if m and m.group(1).rstrip('абвг') == str(expect - 1) and m.group(1)[-1] in 'абвг':
            flush(); cur = {'no': m.group(1), 'raw': l[len(m.group(1)):].strip()}; continue
        if cur: cur['raw'] += ' ' + l
    flush()
    def groups_of(raw):
        gs = []
        for pm in re.finditer(PLANE, raw):
            rest = raw[pm.end():]
            vm = VALS.search(rest[:90])
            if not vm: continue
            gs.append({'at': pm.start(), 'plane': re.sub(r'\s', '', pm.group(0)) if ',' in pm.group(0) else pm.group(0),
                       'desc': rest[:vm.start()].strip(' -'), 'rank': vm.group('rank'), 'gen': vm.group('gen'),
                       'u0': vm.group('u0'), 'comb': vm.group('comb')})
        return gs
    for r in out:
        if 'raw' not in r: continue
        raw = re.sub(r'\s+', ' ', r['raw'])
        parts = re.split(r'(?:^|\s)-?\s?([а-к])\)\s', raw)
        if len(parts) > 1:
            base = parts[0].strip().rstrip(':').strip()
            r['name'] = base; r['items'] = []
            for k in range(1, len(parts), 2):
                seg = parts[k + 1]
                gs = groups_of(seg)
                nm = seg[:gs[0]['at']].strip() if gs else seg.strip()
                r['items'].append({'sub': parts[k], 'name': nm, 'groups': [{x: v for x, v in g.items() if x != 'at'} for g in gs]})
        else:
            gs = groups_of(raw)
            r['name'] = raw[:gs[0]['at']].strip() if gs else raw
            r['groups'] = [{x: v for x, v in g.items() if x != 'at'} for g in gs]
        del r['raw']
    json.dump(out, sys.stdout, ensure_ascii=False, indent=0)

main(sys.argv[1])
