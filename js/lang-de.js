// German dictionary of the interface and the report (stage 8). The keys are the same in every
// dictionary (js/lang-ru.js, js/lang-en.js); the forms of the values are described in js/i18n.js.
// Decided on 13 Nov 2026: the German version offers EN 12464-1 with the English names of its rows;
// the panels of the stage criteria (for the developer) are in English.

import en from './lang-en.js';

const NB = ' ';

export default {
  meta: {
    id: 'de', label: 'DE', name: 'Deutsch', locale: 'de-DE',
    decimal: ',', group: '.', plane: 'H', vplane: 'V',
    quotes: ['„', '“'],
    /** Units after which the report keeps a no-break space from the number. */
    units: ['lx', 'lm', 'm', 'mm', 'cm', 'W', 'K', 'Stk.', '%', '°'],
  },

  unit: {
    m: 'm', mm: 'mm', lx: 'lx', lm: 'lm', K: 'K', W: 'W', pcs: 'Stk.', pcsDot: 'Stk.',
    cdklm: 'cd/klm', cdm2: 'cd/m²', ms: 'ms', ev: 'LW',
  },

  face: ['Boden', 'Decke', 'Wand y = 0', 'Wand y = W', 'Wand x = 0', 'Wand x = L'],

  form: {
    L: 'Länge', W: 'Breite', H: 'Höhe',
    rhoC: 'Decke', rhoW: 'Wände', rhoF: 'Boden',
    En: 'Beleuchtungsstärke Ē', hwp: 'Nutzebene', U0n: 'Gleichmäßigkeit U₀', mf: 'Wartungsfaktor MF',
    nx: 'Entlang X', ny: 'Entlang Y', hm: 'Montagehöhe', psi: 'Drehung',
    flux: 'Lichtstrom', cct: 'Farbtemp.', power: 'Leistung',
    note: { hwp: 'H − 0,1', hm: 'nicht über H' },
    more: 'Mehr', less: 'Weniger',
    err: {
      choice: 'Wählen Sie eine Option',
      number: 'Geben Sie eine Zahl ein',
      int: 'Geben Sie eine ganze Zahl ein',
      gt: 'Muss größer als {x}{unit} sein',
      range: 'Zulässig {min}…{max}{unit}{note}',
      rangeGt: 'Zulässig > {gt}, höchstens {max}{unit}{note}',
      maxLum: 'Höchstens {max} Leuchten, jetzt {nx} × {ny} = {n}',
    },
  },

  info: {
    name: { label: 'Projektname', placeholder: 'Zum Beispiel „Büro, 3. Etage“' },
    description: { label: 'Projektbeschreibung', placeholder: 'Was beleuchtet wird und wozu' },
    author: { label: 'Bearbeiter', placeholder: 'Name; Firma' },
    phone: {
      label: 'Telefon',
      placeholder: (p) => (p.code === '+44' ? '+44 20 7946 0958' : '+49 30 12345678'),
      codes: ['+49', '+44'],
      code: 'Ländervorwahl',
    },
    email: { label: 'E-Mail', placeholder: 'name@example.com' },
    customer: { label: 'Auftraggeber', placeholder: 'Firma oder Privatperson' },
    err: {
      empty: 'Füllen Sie das Feld aus',
      phone: 'Eine Nummer mit {n} Ziffern nach {code}',
      phoneRange: 'Eine Nummer mit {min}–{max} Ziffern nach {code}',
      email: 'Eine Adresse wie name@example.com',
    },
  },

  project: {
    roomName: 'Raum {n}',
    fileName: 'Projekt',
    err: {
      json: 'Die Datei lässt sich nicht lesen: Sie ist keine Projektdatei.',
      format: 'Dies ist keine Projektdatei der Lichtberechnung.',
      version: 'Die Datei wurde mit einer neueren Version des Programms gespeichert ({v}).',
      rooms: 'Die Projektdatei enthält keine Räume.',
    },
  },

  norms: {
    sets: ['en12464'],
    sp52: {
      title: 'СП 52.13330.2016', ref: '№', head: 'Помещение, рабочее место',
      source: `СП${NB}52.13330.2016, Tab.${NB}Л.1, Nr.${NB}{ref}`,
      doc: `СП${NB}52.13330.2016 (Tab.${NB}Л.1)`, row: `Nr.${NB}{ref}`,
      note: '',
    },
    en12464: {
      title: 'EN 12464-1:2021', ref: 'Ref.-Nr.', head: 'Art des Bereichs, der Sehaufgabe oder Tätigkeit',
      source: `EN${NB}12464-1:2021, Ref.-Nr.${NB}{ref}`,
      doc: `EN${NB}12464-1:2021`, row: `Ref.-Nr.${NB}{ref}`,
      note: 'Ē — Ēm „required“; U₀ — Uo. Fläche: H-0,0, wo sich die Anforderung auf den Boden bezieht, und für Verkehrswege; ' +
        'vertikal, wo so angegeben; sonst der Bereich der Sehaufgabe in 0,8 m Höhe. Die Bezeichnungen sind englisch.',
    },
    setBy: 'Festgelegt nach {src}{name}',
    user: 'Vom Benutzer festgelegt',
    found: 'gefunden: {n}',
    rows: { one: '{n} Zeile', other: '{n} Zeilen' },
    none: 'Nichts gefunden. Versuchen Sie ein anderes Wort.',
    noneEn: 'Nichts gefunden. Versuchen Sie ein anderes Wort — die Bezeichnungen der EN 12464-1 sind englisch.',
    plane: 'Fläche',
    vertical: 'Vertikale Fläche: Das Programm berechnet nur horizontale Flächen',
  },

  pf: {
    empty: 'Die Datei ist leer',
    iesNoTilt: 'Eine .ies-Datei ohne TILT=-Zeile ist keine IES-LM-63-Datei',
    iesTiltMissing: 'Die IES-Datei hat keine TILT=-Zeile',
    iesShort: 'Die IES-Datei endet zu früh: Daten fehlen ({what})',
    iesNaN: 'Keine Zahl in der IES-Datei: „{v}“ ({what})',
    tiltN: 'TILT=INCLUDE: falsche Anzahl der Winkel',
    wTiltInclude: 'Die Lampenneigung (TILT=INCLUDE) wird nicht berücksichtigt: Die Leuchte gilt als wie bei der Messung montiert',
    wTiltFile: 'Die externe Neigungsdatei der Lampe (TILT={tilt}) wird nicht berücksichtigt',
    ptypeAB: 'Photometrie vom Typ {t} wird nicht unterstützt, Typ C ist erforderlich',
    ptype: 'Unbekannter Photometrietyp {t}',
    nV: 'Falsche Anzahl der vertikalen Winkel: {n}',
    nH: 'Falsche Anzahl der horizontalen Winkel: {n}',
    count: 'Die Datei enthält {have} Lichtstärkewerte statt {need} ({planes} Ebenen × {angles} Winkel)',
    countPart: ': Die Daten reichen nur für {k} Ebenen',
    extra: 'Nach der Lichtstärketabelle enthält die Datei noch {n} Zahlen; sie werden übersprungen',
    mult: 'Der Lichtstärkefaktor muss größer als null sein',
    vRange: 'Die vertikalen Winkel müssen im Bereich 0…180° liegen',
    h0: 'Eine einzelne horizontale Ebene muss den Winkel 0° haben, nicht {h}°',
    hSet: 'Unklarer Satz horizontaler Winkel: {a}…{b}°',
    wUnits: 'Unbekannte Maßeinheit ({u}); Meter angenommen',
    ldtEnd: 'Die LDT-Datei endet in Zeile {n}',
    ldtNaN: 'Zeile {n} der LDT-Datei ({what}): keine Zahl „{v}“',
    ldtInt: 'Zeile {n} der LDT-Datei ({what}): eine ganze Zahl ist erforderlich, nicht {v}',
    ldtLines: 'Dies ist keine LDT-Datei (EULUMDAT): Sie hat weniger als 30 Zeilen',
    isym: 'Unbekannte Symmetrie Isym = {v}',
    nC: 'Falsche Anzahl der C-Ebenen: {n}',
    nG: 'Falsche Anzahl der γ-Winkel: {n}',
    nSets: 'Falsche Anzahl der Lampensätze: {n}',
    setFlux: 'Der Lampenlichtstrom von Satz {k} muss größer als null sein, nicht {v}',
    ldtShort: 'Die LDT-Datei endet zu früh: Daten fehlen ({what})',
    ldtNaN2: 'Keine Zahl in der LDT-Datei: „{v}“ ({what})',
    wOnePlane: 'Die Datei hat eine C-Ebene bei der Symmetrie Isym = {v}; Rotationssymmetrie angenommen',
    mcDiv: 'Die Anzahl der C-Ebenen {n} ist bei der Symmetrie Isym = {s} nicht durch {d} teilbar',
    lampFlux: 'Der Lampenlichtstrom muss größer als null sein, nicht {v}',
    wTilt: 'Die Leuchte wurde mit einer Neigung von {v}° gemessen; die Neigung wird nicht berücksichtigt',
    wConv: 'Der Umrechnungsfaktor der Lichtstärke {v} wird nicht angewendet (Werte in cd/klm)',
    gRange: 'Die γ-Winkel müssen im Bereich 0…180° liegen',
    cRange: 'Die C-Winkel müssen im Bereich 0…360° liegen',
    wFlux: 'Der Leuchtenlichtstrom in der Datei, {rated} lm (Lampenlichtstrom × LOR {lor} %), weicht vom Lichtstrom der Lichtstärkeverteilung, {f} lm, ab; der Lichtstrom der Verteilung wird verwendet',
    negative: 'Negative oder ungültige Lichtstärke in der Tabelle: {v}',
    zero: 'Alle Werte der Lichtstärketabelle sind null',
    ascending: '{what} müssen aufsteigen: {a}, {b}',
    what: {
      tiltGeom: 'TILT: Lampengeometrie', tiltN: 'TILT: Anzahl der Winkel', tiltAngles: 'TILT: Winkel und Faktoren',
      nLamps: 'Anzahl der Lampen', lampLumens: 'Lichtstrom je Lampe', multiplier: 'Lichtstärkefaktor',
      nV: 'Anzahl der vertikalen Winkel', nH: 'Anzahl der horizontalen Winkel', ptype: 'Photometrietyp',
      units: 'Maßeinheit', width: 'Breite', length: 'Länge', height: 'Höhe',
      ballast: 'Vorschaltgerätefaktor', blpf: 'Lampen-Vorschaltgeräte-Faktor', watts: 'Leistungsaufnahme',
      vAngles: 'vertikale Winkel', hAngles: 'horizontale Winkel', cd: 'Lichtstärke',
      isym: 'Symmetrie Isym', nC: 'Anzahl der C-Ebenen', nG: 'Anzahl der γ-Winkel',
      lumL: 'Leuchtenlänge', lumB: 'Leuchtenbreite', lumH: 'Leuchtenhöhe',
      areaL: 'Länge der leuchtenden Fläche', areaB: 'Breite der leuchtenden Fläche', areaH: 'Höhe der leuchtenden Fläche',
      lorl: 'Leuchtenbetriebswirkungsgrad LORL', conv: 'Umrechnungsfaktor der Lichtstärke', tilt: 'Neigung bei der Messung',
      nSets: 'Anzahl der Lampensätze', lampFlux: 'Lampenlichtstrom', cAngles: 'C-Winkel', gAngles: 'γ-Winkel',
    },
  },

  phot: {
    polar: 'Lichtstärkeverteilung: C0–C180 durchgezogen, C90–C270 gestrichelt',
    choose: 'IES- oder LDT-Datei wählen',
    drop: 'IES- oder LDT-Datei hierher ziehen',
    click: 'oder klicken, um zu wählen',
    replace: 'andere Datei hierher ziehen oder klicken, um zu ersetzen',
    remove: 'Datei entfernen',
    none: 'Keine Datei geladen',
    cosine: 'Kosinusförmige Lichtstärkeverteilung',
    source: 'Lichtquelle',
    set: 'Satz {n}',
    type: 'eine .ies- oder .ldt-Datei ist erforderlich',
    size: 'die Datei ist größer als 5 MB',
  },

  help: {
    title: 'Hilfe',
    none: 'Für dieses Element gibt es keine Hilfe.',
    label: 'Hilfe: {title}',
    keys: '<b>F1</b> — Hilfe zum Feld (außerhalb eines Feldes — zur Phase); <b>F2</b> — Grundriss (2D); <b>F3</b> — 3D-Ansicht; ' +
      '<b>F4</b> — Berechnungsfläche ein- oder ausblenden; <b>F5</b> — berechnen (wenn die automatische Berechnung aus ist); ' +
      '<b>F9</b> — Falschfarben; <b>F10</b> — Ausgangsansicht; <b>Strg+S</b> — Projekt speichern.',
    topics: {
      stage1: {
        title: 'Phase 1. Projekt',
        text: 'Name, Beschreibung, Bearbeiter mit Telefon und E-Mail sowie der Auftraggeber stehen auf dem Titelblatt des Berichts; ' +
          'die Felder mit Sternchen werden für die Dokumentation benötigt, die Räume lassen sich auch ohne sie berechnen.<br>' +
          '„Speichern“ in der oberen Leiste schreibt das ganze Projekt — die Angaben, alle Räume und ihre photometrischen Dateien — in eine .lcalc.json-Datei; ' +
          '„Projekt öffnen…“ lädt eine solche Datei. Ergebnisse werden nicht gespeichert: Sie werden beim Öffnen neu berechnet.<br>' +
          'Die Sprache der Oberfläche und des Berichts — der Umschalter RU / EN / DE in der oberen Leiste.<br>{keys}',
      },
      stage2: {
        title: 'Phase 2. Raumberechnung',
        text: 'Links — die Eingabedaten des Raums, in der Mitte — die Ansicht, rechts — die Ergebnisse. Die Berechnung läuft bei jeder Änderung ' +
          'von selbst (Schalter „Automatisch“); ohne ihn — mit der Schaltfläche „Berechnen“ oder F5.<br>' +
          'Die Räume werden in der Liste rechts in der zweiten Schaltfläche der oberen Leiste gewechselt; dort und mit der Schaltfläche unten in der Ergebnisspalte ' +
          'wird ein neuer Raum hinzugefügt — mit derselben Leuchte und denselben Anforderungen wie der aktuelle.<br>{keys}',
      },
      stage3: {
        title: 'Phase 3. Dokumentation',
        text: 'Der Bericht entsteht aus allen Räumen des Projekts: Titelblatt, Inhaltsverzeichnis, für jeden Raum — die Übersicht, ' +
          'die Grundrisse der Berechnungsflächen mit Isolinien und die Abbildungen. Die Kontrollkästchen im Baum nehmen Abschnitte auf oder heraus, ein Klick auf einen Namen ' +
          'blättert die Vorschau zu seiner Seite.<br>„Drucken“ öffnet das Druckfenster des Browsers; für eine PDF-Datei wählen Sie „Als PDF speichern“, ' +
          'Format A4, Ränder „Keine“ (die Seiten sind bereits mit Rändern gesetzt). Grundrisse und Skala sind Vektorgrafik, 3D-Bilder 300 dpi.',
      },
      room: {
        title: 'Raum',
        text: 'Ein leerer rechteckiger Raum: die Länge L entlang der X-Achse, die Breite W entlang Y, die Höhe H vom Boden bis zur Decke. ' +
          'Der Ursprung liegt in einer Ecke des Bodens, die Z-Achse zeigt nach oben. Möbel, Fenster und Trennwände werden nicht berücksichtigt.<br>' +
          'Die Flächen werden automatisch in Elemente geteilt (etwa 4000 je Raum): Die Schrittweite richtet sich nach der Fläche der Raumbegrenzungen.',
      },
      refl: {
        title: 'Reflexionsgrade',
        text: 'Der Anteil des auftreffenden Lichts, den eine Fläche reflektiert; die Reflexion gilt als diffus. ' +
          'Typische Werte: weiße Decke — 0,7…0,8; helle Wände — 0,5…0,7; Boden — 0,2…0,3. Die Grenze ist 0,9.<br>' +
          'Der reflektierte Anteil wird mit dem Radiosity-Verfahren berechnet: Das Licht wird vielfach zwischen allen Elementen der Flächen reflektiert.',
      },
      norm: {
        title: 'Anforderungen',
        text: '<b>Ē</b> — der geforderte Wartungswert der Beleuchtungsstärke für die Sehaufgabe (EN 12464-1, Ēm); die Pfeile gehen die Stufen der Beleuchtungsstärkeskala durch.<br>' +
          '<b>Nutzebene</b> — ihre Höhe: 0 — Boden (H-0,0), 0,8 — Tisch (H-0,8); eine andere Höhe kann eingegeben werden. ' +
          'Die bewertete Fläche liegt in dieser Höhe, die anderen werden zur Information gezeigt.<br>' +
          '<b>MF</b> — der Wartungsfaktor: Alle Ergebnisse werden mit ihm multipliziert.<br>' +
          '<b>U<sub>0</sub></b> — die geforderte Gleichmäßigkeit E<sub>min</sub> / Ē; ein leeres Feld — keine Anforderung.<br>' +
          '<b>Wählen</b> — die Tabellen 9–61 der EN 12464-1:2021 mit Suche. ' +
          'Eine Zeile setzt Ē, die Nutzebene und U<sub>0</sub> ein; unter den Feldern steht die Quelle, nach einer manuellen Änderung — „vom Benutzer festgelegt“.',
      },
      file: {
        title: 'Photometrische Datei',
        text: 'Eine IES-Datei (LM-63) oder EULUMDAT-Datei (LDT) des Leuchtenherstellers. Aus ihr stammen die Lichtstärkeverteilung, ' +
          'der Lichtstrom, die Gehäusemaße, die Farbtemperatur, die Leistung und der CRI; bei mehreren Lampensätzen in einer LDT-Datei wählen Sie den passenden.<br>' +
          'Ohne Datei ist die Leuchte eine Punktquelle mit kosinusförmiger Verteilung. Die Datei wird mit dem Raum im Projekt gespeichert.',
      },
      lumdata: {
        title: 'Leuchtendaten',
        text: 'Lichtstrom Φ — der Lichtstrom der Leuchte; bei einer Änderung wird die Lichtstärkeverteilung skaliert. Farbtemperatur und Leistung ' +
          'gehen nicht in die Berechnung ein und werden im Bericht ausgegeben.',
      },
      grid: {
        title: 'Leuchtenanordnung',
        text: 'Ein regelmäßiges Raster n<sub>x</sub> × n<sub>y</sub>: von der Wand bis zur äußeren Reihe — ein halber Abstand.<br>' +
          '<b>Vorschlagen</b> — eine Abschätzung der Leuchtenanzahl über den Raumwirkungsgrad und ein Raster mit ähnlichen Abständen in Länge und Breite.<br>' +
          '<b>Montagehöhe h<sub>m</sub></b> — bis zur Oberkante des Gehäuses, wie in DIALux: Der Lichtschwerpunkt liegt um die Gehäusehöhe aus der Datei tiefer. ' +
          'Bei h<sub>m</sub> = H sitzt die Leuchte an der Decke, und ihr nach oben gerichteter Lichtstrom wird nicht berücksichtigt.<br>' +
          '<b>Drehung ψ</b> — der Winkel der C0-Ebene zur X-Achse gegen den Uhrzeigersinn, die Pfeile gehen in Schritten von 90°.',
      },
      results: {
        title: 'Ergebnisse',
        text: 'Für jede Berechnungsfläche — die mittlere Beleuchtungsstärke Ē, die minimale und maximale Beleuchtungsstärke und U₀ = E<sub>min</sub> / Ē, mit MF. ' +
          'Ē ist der exakte Flächenmittelwert; E<sub>min</sub> und E<sub>max</sub> sind die Extremwerte in allen Punkten des Grundrisses.<br>' +
          'Zeichen an der bewerteten Fläche: rotes Kreuz — Ē unter der Anforderung; grüner Haken — Ē von der Anforderung bis zur nächsten Stufe der Skala; ' +
          'gelbes Dreieck — über dieser Stufe (mehr Licht als nötig); rotes Kreuz bei U₀ — unter der geforderten U<sub>0</sub>.<br>' +
          'U<sub>d</sub> = E<sub>min</sub> / E<sub>max</sub>.<br>' +
          'Die Schaltfläche in einer Zeile zeigt die Isolinien und die Werte in den Punkten des Rasters nach EN 12464-1 — im Grundriss und in 3D.',
      },
      plane: {
        title: 'Berechnungsfläche',
        text: 'Der linke Teil der Schaltfläche blendet die gewählte Fläche ein oder aus (F4): Isolinien, Zahlen in den Rasterpunkten, ' +
          'im Grundriss — die Füllung. Der Pfeil rechts wählt die Fläche: H-0,0 (Boden), H-0,8 und die Höhe der Nutzebene.',
      },
      view: {
        title: 'Ansichtssteuerung',
        text: '<b>3D:</b> linke Maustaste — Drehen um die Mitte des Bodens; rechte oder mittlere — Verschieben; Rad — Zoomen zum Zeiger.<br>' +
          '<b>Grundriss:</b> rechte oder mittlere Taste — Verschieben, Rad — Zoomen; die linke Taste bewirkt nichts.<br>' +
          'Doppelklick mit dem Rad — die aktuelle Ansicht in das Fenster einpassen. „Ausgangsansicht“ stellt den Anfangsblick wieder her (im Grundriss — passt ihn ein).<br>' +
          'Auf einem Touchscreen: ein Finger — Drehen (im Grundriss — Verschieben), zwei — Verschieben und Zoomen.<br>' +
          '<b>F2</b> — Grundriss, <b>F3</b> — 3D, <b>F4</b> — Fläche, <b>F9</b> — Falschfarben, <b>F10</b> — Ausgangsansicht.',
      },
      'f:roomname': { title: 'Raumname', text: 'Unter diesem Namen steht der Raum in der Raumliste, im Inhaltsverzeichnis und in den Überschriften des Berichts.' },
      'f:L': { title: 'Länge L', text: 'Die Abmessung des Raums entlang der X-Achse, 1…50 m.' },
      'f:W': { title: 'Breite W', text: 'Die Abmessung des Raums entlang der Y-Achse, 1…50 m.' },
      'f:H': { title: 'Höhe H', text: 'Vom Boden bis zur Decke, 2…20 m. Solange die Leuchte an der Decke sitzt, folgt ihre Montagehöhe der Höhe H.' },
      'f:rhoC': { title: 'Reflexionsgrad der Decke ρ₁', text: 'Weiße Decke — 0,7…0,8; Mineralfaserdecke — etwa 0,7; dunkel — 0,3 und weniger.' },
      'f:rhoW': { title: 'Reflexionsgrad der Wände ρ₂…₅', text: 'Ein Wert für alle vier Wände. Heller Anstrich — 0,5…0,7; Holz — 0,3…0,4; Beton — 0,3.' },
      'f:rhoF': { title: 'Reflexionsgrad des Bodens ρ₀', text: 'Heller Boden — 0,3…0,4; Parkett und Laminat — 0,2…0,3; dunkel — 0,1.' },
      'f:En': { title: 'Geforderte Beleuchtungsstärke Ē', text: 'Der geforderte Wartungswert der mittleren Beleuchtungsstärke der Nutzebene, lx (EN 12464-1, Ēm). Pfeile und ↑/↓ gehen die Stufen der Skala durch: … 150, 200, 300, 500, 750 …' },
      'f:hwp': { title: 'Nutzebene', text: '0 — Boden, 0,8 — Tisch; die Pfeile schalten zwischen diesen beiden Werten um, ein anderer kann eingegeben werden. Nicht über H − 0,1 m.' },
      'f:U0n': { title: 'Gleichmäßigkeit U₀', text: 'Die geforderte U₀ = E<sub>min</sub> / Ē der bewerteten Fläche, mindestens; ein leeres Feld — keine Anforderung. Ein kleinerer Wert wird in den Ergebnissen rot markiert.' },
      'f:mf': { title: 'Wartungsfaktor MF', text: 'Das Verhältnis der Beleuchtungsstärke am Ende des Wartungszyklus zum Neuwert: 0,8 — saubere Räume mit LED-Leuchten, 0,7…0,5 — staubige.' },
      'f:nx': { title: 'Leuchten entlang X', text: 'Die Anzahl der Reihen entlang der Länge; zusammen mit n<sub>y</sub> — höchstens 500 Leuchten.' },
      'f:ny': { title: 'Leuchten entlang Y', text: 'Die Anzahl der Reihen entlang der Breite; zusammen mit n<sub>x</sub> — höchstens 500 Leuchten.' },
      'f:hm': { title: 'Montagehöhe hₘ', text: 'Die Höhe der Gehäuseoberkante über dem Boden. Gleich H — die Leuchte sitzt an der Decke (Einbau oder Anbau); kleiner als H — abgehängt.' },
      'f:psi': { title: 'Drehung ψ', text: 'Der Winkel der C0-Ebene der Leuchte zur X-Achse des Raums, gegen den Uhrzeigersinn, 0…180°. Wichtig bei asymmetrischen Verteilungen.' },
      'f:flux': { title: 'Lichtstrom Φ', text: 'Der Lichtstrom der Leuchte, lm. Mit einer Datei — aus dem gewählten Lampensatz; ein eingegebener Wert skaliert die Lichtstärkeverteilung.' },
      'f:cct': { title: 'Farbtemperatur', text: 'Aus der Datei, falls angegeben; geht nicht in die Berechnung ein und wird im Bericht ausgegeben.' },
      'f:power': { title: 'Leistung', text: 'Die Leistung der Leuchte, W; aus der Datei, falls angegeben. Wird im Bericht ausgegeben.' },
      'f:name': { title: 'Projektname', text: 'Groß auf dem Titelblatt und in den Kopfzeilen; aus ihm entsteht auch der Name der Projektdatei.' },
      'f:description': { title: 'Projektbeschreibung', text: 'Einige Zeilen zur Aufgabe unter dem Namen auf dem Titelblatt.' },
      'f:author': { title: 'Bearbeiter', text: 'Wer die Berechnung erstellt hat; auf dem Titelblatt zusammen mit Telefon und E-Mail.' },
      'f:phone': { title: 'Telefon', text: 'Steht auf dem Titelblatt. Wählen Sie die Ländervorwahl; die Nummer wird nach ihrem Format geschrieben.' },
      'f:email': { title: 'E-Mail', text: 'Steht auf dem Titelblatt.' },
      'f:customer': { title: 'Auftraggeber', text: 'Für wen die Berechnung erstellt wurde; auf dem Titelblatt.' },
    },
  },

  app: {
    title: 'Lichtberechnung',
    appTitle: 'Lichtberechnung<br>für Räume',
    stages: 'Phasen', st1: 'Projekt', st2: 'Berechnung', st3: 'Dokumentation',
    rooms: 'Räume', lang: 'Sprache der Oberfläche',
    save: 'Speichern', saveTip: 'Projekt in eine Datei speichern',
    theme: 'Farbschema wechseln', themeTip: 'Helles oder dunkles Farbschema',
    step1: 'Schritt 1 von 3',
    st1Lead: 'Diese Angaben stehen auf dem Titelblatt des Berichts. Die Felder mit Sternchen werden für die Dokumentation benötigt; die Räume lassen sich auch ohne sie berechnen.',
    infoMsg: 'Füllen Sie die Pflichtfelder aus — ohne sie wird keine Dokumentation erstellt.',
    open: 'Projekt öffnen…', newProject: 'Neues Projekt', next: 'Weiter',
    opened: '„{name}“ geöffnet: {rooms}.',
    roomsN: { one: '{n} Raum', other: '{n} Räume' },
    newConfirm: 'Ein neues Projekt beginnen? Das aktuelle geht verloren, wenn es nicht in eine Datei gespeichert ist.',
    inputs: 'Eingabedaten', room: 'Raum', roomName: 'Name',
    helpRoom: 'Hilfe: Raummaße',
    refl: 'Reflexionsgrade', helpRefl: 'Hilfe: Reflexionsgrade',
    norms: 'Anforderungen', helpNorm: 'Hilfe: Beleuchtungsanforderungen', choose: 'Wählen',
    lum: 'Leuchte', helpFile: 'Hilfe: photometrische Datei',
    grid: 'Anordnung', helpGrid: 'Hilfe: Leuchtenanordnung',
    suggest: 'Vorschlagen', suggestTip: 'Leuchtenanzahl über den Raumwirkungsgrad abschätzen und im Raster anordnen',
    centre: '*Lichtschwerpunkt in {z} m Höhe',
    centreLow: ' — nicht über der Nutzebene',
    centreTip: '{mm} mm unter dem Montagepunkt: Gehäusehöhe aus der Datei',
    centreSame: 'Im Montagepunkt',
    estNone: 'Keine Abschätzung möglich: Die Leuchten müssen über der Nutzebene liegen.',
    lums: { one: '{n} Leuchte', other: '{n} Leuchten' },
    estTooMany: 'Nach der vorläufigen Abschätzung werden {lums} benötigt (rechnerisch {raw}) — mehr, als sich anordnen lassen (höchstens {max}). Prüfen Sie den Lichtstrom der Leuchte: {flux} lm. Das Raster bleibt unverändert.',
    estEnough: '*Nach der vorläufigen Abschätzung ausreichend: {n} Stk.',
    estNeed: '*Nach der vorläufigen Abschätzung erforderlich: {n} Stk.',
    estTip: 'Rechnerisch {raw}, u = {u}; Raster {nx} × {ny} = {n} Stk.',
    viewAria: '3D-Ansicht des Raums',
    view3dFail: 'Die 3D-Ansicht konnte nicht geladen werden (Three.js vom CDN): {msg}',
    busy: 'Berechnung…', calcError: 'Berechnungsfehler: {msg}',
    plane: 'Berechnungsfläche', planeShow: 'Berechnungsfläche einblenden', planePick: 'Berechnungsfläche wählen',
    showPlane: '{name} einblenden', hidePlane: '{name} ausblenden', noPlane: 'Nicht anzeigen',
    normative: 'bewertet', noResult: 'Kein Berechnungsergebnis',
    falseColors: 'Falschfarben', plan: 'Grundriss', planTip: '2D-Ansicht (Grundriss)', view3d: '3D-Ansicht', reset: 'Ausgangsansicht',
    helpView: 'Hilfe: Ansichtssteuerung',
    legend: 'Beleuchtungsstärkeskala', legendUnit: 'E, lx', andAbove: '{v} und mehr',
    results: 'Ergebnisse', helpResults: 'Hilfe: Ergebnisse',
    calc: 'Berechnen', auto: 'Automatisch', autoTip: 'Bei jeder Änderung der Parameter neu berechnen',
    changed: 'Die Parameter haben sich geändert. Drücken Sie „Berechnen“.',
    levelLow: 'unter der Anforderung', levelOk: 'innerhalb der Stufe der Skala', levelHigh: 'über der Stufe der Skala',
    levelTitle: '{what}: gefordert Ē = {e} lx',
    u0Low: 'U₀ unter der Anforderung {u}', u0Ok: 'U₀ nicht unter der Anforderung {u}', u0None: 'Keine Anforderung an U₀; U₀ unter 0,3',
    isoAria: 'Isolinien {name}', isoTip: '{name}: Isolinien und Werte in den Rasterpunkten — im Grundriss und in 3D',
    faces: 'Beleuchtungsstärke der Raumflächen', face: 'Fläche', faceAvg: 'E<sub>m</sub>, lx', direct: 'Direkt', reflShort: 'Refl.',
    absorbed: 'Absorbiert {a} lm von {b} lm.',
    lost: ' Der nach oben gerichtete Lichtstrom von {a} lm wird nicht berücksichtigt: Die Leuchte sitzt an der Decke (ohne Abhängung).',
    extra: 'Weitere Einstellungen',
    exposure: 'Belichtungskorrektur', exposureHint: 'Für die realistische Ansicht: ±2 Stufen gegenüber der automatischen Belichtung.',
    map: 'Darstellung auf den Flächen', mapTotal: 'Gesamt', mapDirect: 'Direkt', mapIndirect: 'Reflektiert',
    mapHint: 'Die Schaltfläche einer Flächenzeile zeigt deren Isolinien und die Werte in den Punkten des Rasters nach EN 12464-1: im Grundriss — auf hellem Grund (mit der Schaltfläche „Falschfarben“ — farbig), in 3D — als halbtransparente Schicht. Ohne Falschfarben werden die Flächen realistisch dargestellt: Leuchtdichte L = ρE/π.',
    dev: 'Für Entwickler', mesh: 'Vernetzung', elements: 'Elemente',
    meshStep: 'Schrittweite h (auto), m', meshN: 'Elemente gesamt N',
    timing: 'Rechenzeit', cached: 'aus dem Cache',
    tKernel: 'Kern', tKernelDetail: '{a} + Korrektur {b}',
    tDirect: 'Direktanteil', tDirectDetail: '{a} · {l} Leuchten × {n} El.', tEvals: ' · {n} Auswert./Paar',
    tSolver: 'Löser', tSolverDetail: '{a} · {n} Iter.',
    tPlanes: 'Flächen', tChecks: 'Prüfungen der Etappen 3–4',
    viewDev: 'Ansicht', plainColors: 'Platzhalterfarben der Flächen', edges: 'Elementkanten', normals: 'Flächennormalen',
    crit: 'Stage {n} criteria',
    newRoom: 'Neuer Raum', newRoomPlus: '+ Neuer Raum',
    untitled: 'Ohne Namen',
    delRoom: 'Raum löschen', delRoomAria: '{name} löschen',
    delRoomConfirm: 'Den Raum „{name}“ löschen? Seine Eingabedaten gehen verloren.',
    codifier: 'Verzeichnis', normsTitle: 'Beleuchtungsanforderungen',
    normsLead: 'Klicken Sie auf eine Zeile — Anforderung, Nutzebene und Gleichmäßigkeit werden in den Raum übernommen.',
    close: 'Schließen', normsSearch: 'Suche: Raum, Nummer, Wort', normsSearchAria: 'Anforderungen durchsuchen',
    reportTree: 'Inhalt des Berichts', step3: 'Schritt 3 von 3',
    st3Lead: 'Markieren Sie die Abschnitte, die in den Bericht kommen; ein Klick auf einen Namen führt zu seiner Seite.',
    print: 'Drucken', printNote: 'Für eine Datei wählen Sie im Druckfenster den Drucker „Als PDF speichern“.',
    preview: 'Berichtsvorschau',
  },

  rep: {
    kind: 'Lichttechnische Berechnung',
    untitled: 'Projekt ohne Namen',
    customer: 'Auftraggeber', author: 'Bearbeiter', date: 'Datum',
    disclaimer: `Die Berechnung wurde mit nicht zertifizierter Software erstellt und dient nur der Demonstration. MAYTONI übernimmt keine${NB}Haftung für Abweichungen zwischen den Ergebnissen dieser Berechnung, der tatsächlichen Beleuchtungsstärke und den Ergebnissen von Berechnungen mit zertifizierter Software.`,
    toc: 'Inhalt',
    lumlist: 'Leuchtenliste', restable: 'Ergebnisübersicht',
    room: 'Raum', summary: 'Übersicht', results: 'Ergebnisse', ill: 'Abbildungen',
    maker: 'Hersteller', article: 'Artikel', cct: 'Farbtemp.', kit: 'Lampe', count: 'Anz., Stk.',
    surface: 'Fläche',
    refNote: '* Zur Information.', targetNote: `In${NB}Klammern — der Sollwert der Kenngröße.`,
    norms: 'Beleuchtungsanforderungen', lum: 'Leuchte',
    normative: 'bewertete Fläche', reference: 'zur Information',
    height: ', Höhe {z}', floor: ', Boden',
    illReal: 'Visualisierung der Lichtverteilung',
    illFalse: 'Beleuchtungsstärkeverteilung in Falschfarben',
    scale: 'Falschfarbenskala, lx',
    scaleMark: `M${NB}1:{n}`,
  },

  rui: {
    size: 'Länge × Breite × Höhe',
    refl: 'Reflexionsgrade<br><span class="sub">Decke / Wände / Boden</span>',
    mf: 'Wartungsfaktor MF',
    norm: 'Anforderung', En: 'Beleuchtungsstärke Ē', U0: 'Gleichmäßigkeit U<sub>0</sub>', U0none: 'keine Anforderung',
    maker: 'Hersteller', article: 'Artikel', noFile: 'kosinusförmige Verteilung, ohne Datei',
    count: 'Anzahl', flux: 'Lichtstrom', cct: 'Farbtemperatur', power: 'Leistung',
    dims: 'Abmessungen', hm: 'Montagehöhe', centre: 'Lichtschwerpunkt', at: 'in {z} Höhe',
    lum: 'Leuchte', noFileLum: 'Ohne Datei (kosinusförmige Verteilung)',
    busyRoom: 'Berechnung: {name} ({k} von {n})…', aRoom: 'Raum', busyIll: 'Abbildungen…',
    failed: 'Der Bericht konnte nicht erstellt werden: {msg}',
    title: 'Titelblatt', toc: 'Inhaltsverzeichnis',
    allRooms: 'In allen Räumen', inAll: '{what} in allen Räumen', normOnly: 'Nur bewertete',
    page: 'S. {n}',
  },

  // the panels of the stage criteria (for the developer): English
  chk: en.chk,
};
