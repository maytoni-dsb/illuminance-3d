// English dictionary of the interface and the report (stage 8). The keys are the same in every
// dictionary (js/lang-ru.js, js/lang-de.js); the forms of the values are described in js/i18n.js.
// Names of SP 52.13330.2016 stay in the language of the document (norms.sp52), as decided on
// 13 Nov 2026: a room with that norm opened in this version keeps its document and room names.

const NB = ' ';

export default {
  meta: {
    id: 'en', label: 'EN', name: 'English', locale: 'en-GB',
    decimal: '.', group: ',', plane: 'H', vplane: 'V',
    quotes: ['“', '”'],
    /** Units after which the report keeps a no-break space from the number. */
    units: ['lx', 'lm', 'm', 'mm', 'cm', 'W', 'K', 'pcs', '%', '°'],
  },

  unit: {
    m: 'm', mm: 'mm', lx: 'lx', lm: 'lm', K: 'K', W: 'W', pcs: 'pcs', pcsDot: 'pcs',
    cdklm: 'cd/klm', cdm2: 'cd/m²', ms: 'ms', ev: 'EV',
  },

  face: ['Floor', 'Ceiling', 'Wall y = 0', 'Wall y = W', 'Wall x = 0', 'Wall x = L'],

  form: {
    L: 'Length', W: 'Width', H: 'Height',
    rhoC: 'Ceiling', rhoW: 'Walls', rhoF: 'Floor',
    En: 'Illuminance Ē', hwp: 'Work plane', U0n: 'Uniformity U₀', mf: 'Maintenance factor MF',
    nx: 'Along X', ny: 'Along Y', hm: 'Mounting height', psi: 'Rotation',
    flux: 'Flux', cct: 'CCT', power: 'Power',
    note: { hwp: 'H − 0.1', hm: 'not above H' },
    more: 'More', less: 'Less',
    err: {
      choice: 'Choose an option',
      number: 'Enter a number',
      int: 'Enter a whole number',
      gt: 'Must be greater than {x}{unit}',
      range: 'Allowed {min}…{max}{unit}{note}',
      rangeGt: 'Allowed > {gt}, at most {max}{unit}{note}',
      maxLum: 'At most {max} luminaires, now {nx} × {ny} = {n}',
    },
  },

  info: {
    name: { label: 'Project name', placeholder: 'For example, “Office, 3rd floor”' },
    description: { label: 'Project description', placeholder: 'What is lit and what for' },
    author: { label: 'Prepared by', placeholder: 'Name; company' },
    phone: {
      label: 'Phone',
      placeholder: (p) => (p.code === '+49' ? '+49 30 12345678' : '+44 20 7946 0958'),
      codes: ['+44', '+49'],
      code: 'Country code',
    },
    email: { label: 'Email', placeholder: 'name@example.com' },
    customer: { label: 'Client', placeholder: 'Company or private person' },
    err: {
      empty: 'Fill in this field',
      phone: 'A number of {n} digits after {code}',
      phoneRange: 'A number of {min}–{max} digits after {code}',
      email: 'An address like name@example.com',
    },
  },

  project: {
    roomName: 'Room {n}',
    fileName: 'Project',
    err: {
      json: 'The file cannot be read: it is not a project file.',
      format: 'This is not a lighting calculation project file.',
      version: 'The file was saved by a newer version of the program ({v}).',
      rooms: 'The project file has no rooms.',
    },
  },

  norms: {
    sets: ['en12464'],
    sp52: {
      title: 'СП 52.13330.2016', ref: '№', head: 'Помещение, рабочее место',
      source: `СП${NB}52.13330.2016, table${NB}Л.1, no.${NB}{ref}`,
      doc: `СП${NB}52.13330.2016 (table${NB}Л.1)`, row: `no.${NB}{ref}`,
      note: '',
    },
    en12464: {
      title: 'EN 12464-1:2021', ref: 'Ref. no.', head: 'Type of task / activity area',
      source: `EN${NB}12464-1:2021, ref.${NB}no.${NB}{ref}`,
      doc: `EN${NB}12464-1:2021`, row: `ref.${NB}no.${NB}{ref}`,
      note: 'Ē — Ēm “required”; U₀ — Uo. Plane: H-0.0 where the requirement refers to the floor and for traffic zones; ' +
        'vertical where so stated; otherwise the task area at 0.8 m.',
    },
    setBy: 'Set by {src}{name}',
    user: 'Set by the user',
    found: 'found: {n}',
    rows: { one: '{n} row', other: '{n} rows' },
    none: 'Nothing found. Try another word.',
    noneEn: 'Nothing found. Try another word.',
    plane: 'Plane',
    vertical: 'Vertical plane: the program calculates horizontal planes only',
  },

  pf: {
    empty: 'The file is empty',
    iesNoTilt: 'An .ies file without a TILT= line is not an IES LM-63 file',
    iesTiltMissing: 'The IES file has no TILT= line',
    iesShort: 'The IES file ends too early: data missing ({what})',
    iesNaN: 'Not a number in the IES file: “{v}” ({what})',
    tiltN: 'TILT=INCLUDE: wrong number of angles',
    wTiltInclude: 'The lamp tilt (TILT=INCLUDE) is ignored: the luminaire is taken as mounted as in the measurement',
    wTiltFile: 'The external lamp tilt file (TILT={tilt}) is ignored',
    ptypeAB: 'Type {t} photometry is not supported, type C is required',
    ptype: 'Unknown photometry type {t}',
    nV: 'Wrong number of vertical angles: {n}',
    nH: 'Wrong number of horizontal angles: {n}',
    count: 'The file has {have} intensity values instead of {need} ({planes} planes × {angles} angles)',
    countPart: ': the data cover only {k} planes',
    extra: 'The file has {n} more numbers after the intensity table; they are skipped',
    mult: 'The intensity multiplier must be greater than zero',
    vRange: 'Vertical angles must lie within 0…180°',
    h0: 'A single horizontal plane must have the angle 0°, not {h}°',
    hSet: 'Unclear set of horizontal angles: {a}…{b}°',
    wUnits: 'Unknown units of dimensions ({u}); metres assumed',
    ldtEnd: 'The LDT file ends at line {n}',
    ldtNaN: 'Line {n} of the LDT file ({what}): not a number “{v}”',
    ldtInt: 'Line {n} of the LDT file ({what}): a whole number is required, not {v}',
    ldtLines: 'This is not an LDT (EULUMDAT) file: it has fewer than 30 lines',
    isym: 'Unknown symmetry Isym = {v}',
    nC: 'Wrong number of C planes: {n}',
    nG: 'Wrong number of γ angles: {n}',
    nSets: 'Wrong number of lamp sets: {n}',
    setFlux: 'The lamp flux of set {k} must be greater than zero, not {v}',
    ldtShort: 'The LDT file ends too early: data missing ({what})',
    ldtNaN2: 'Not a number in the LDT file: “{v}” ({what})',
    wOnePlane: 'The file has one C plane with the symmetry Isym = {v}; rotational symmetry assumed',
    mcDiv: 'The number of C planes {n} is not divisible by {d} with the symmetry Isym = {s}',
    lampFlux: 'The lamp flux must be greater than zero, not {v}',
    wTilt: 'The luminaire was measured tilted by {v}°; the tilt is ignored',
    wConv: 'The intensity conversion factor {v} is not applied (values in cd/klm)',
    gRange: 'γ angles must lie within 0…180°',
    cRange: 'C angles must lie within 0…360°',
    wFlux: 'The luminaire flux in the file, {rated} lm (lamp flux × LOR {lor} %), differs from the flux of the intensity distribution, {f} lm; the flux of the distribution is used',
    negative: 'Negative or invalid intensity in the table: {v}',
    zero: 'All values of the intensity table are zero',
    ascending: '{what} must ascend: {a}, {b}',
    what: {
      tiltGeom: 'TILT: lamp geometry', tiltN: 'TILT: number of angles', tiltAngles: 'TILT: angles and factors',
      nLamps: 'number of lamps', lampLumens: 'lumens per lamp', multiplier: 'candela multiplier',
      nV: 'number of vertical angles', nH: 'number of horizontal angles', ptype: 'photometry type',
      units: 'units of dimensions', width: 'width', length: 'length', height: 'height',
      ballast: 'ballast factor', blpf: 'ballast-lamp photometric factor', watts: 'input watts',
      vAngles: 'vertical angles', hAngles: 'horizontal angles', cd: 'luminous intensity',
      isym: 'symmetry Isym', nC: 'number of C planes', nG: 'number of γ angles',
      lumL: 'luminaire length', lumB: 'luminaire width', lumH: 'luminaire height',
      areaL: 'luminous area length', areaB: 'luminous area width', areaH: 'luminous area height',
      lorl: 'light output ratio LORL', conv: 'intensity conversion factor', tilt: 'tilt during measurement',
      nSets: 'number of lamp sets', lampFlux: 'lamp flux', cAngles: 'C angles', gAngles: 'γ angles',
    },
  },

  phot: {
    polar: 'Luminous intensity distribution: C0–C180 solid, C90–C270 dashed',
    choose: 'Choose an IES or LDT file',
    drop: 'Drop an IES or LDT file',
    click: 'or click to choose',
    replace: 'drop another file or click to replace',
    remove: 'Remove the file',
    none: 'No file loaded',
    cosine: 'Cosine intensity distribution',
    source: 'Light source',
    set: 'Set {n}',
    type: 'an .ies or .ldt file is required',
    size: 'the file is larger than 5 MB',
  },

  help: {
    title: 'Help',
    none: 'There is no help for this element.',
    label: 'Help: {title}',
    keys: '<b>F1</b> — help on the field (outside a field — on the stage); <b>F2</b> — plan (2D); <b>F3</b> — 3D view; ' +
      '<b>F4</b> — show or hide the calculation surface; <b>F5</b> — calculate (when the automatic calculation is off); ' +
      '<b>F9</b> — false colours; <b>F10</b> — initial view; <b>Ctrl+S</b> — save the project.',
    topics: {
      stage1: {
        title: 'Stage 1. Project',
        text: 'The name, description, author with phone and email, and the client go to the title page of the report; ' +
          'the fields with an asterisk are needed for the documentation, the rooms can be calculated without them.<br>' +
          '“Save” in the top bar writes the whole project — the information, all rooms and their photometric files — into one .lcalc.json file; ' +
          '“Open project…” loads such a file. Results are not written to the file: they are recalculated on opening.<br>' +
          'The language of the interface and the report — the RU / EN / DE switch in the top bar.<br>{keys}',
      },
      stage2: {
        title: 'Stage 2. Room calculation',
        text: 'On the left — the input data of the room, in the centre — the view, on the right — the results. The calculation runs by itself ' +
          'on every change (the “Automatic” switch); without it — with the “Calculate” button or F5.<br>' +
          'The rooms are switched in the list on the right of the second pill of the top bar; there and with the button at the bottom of the results column ' +
          'a new room is added — with the same luminaire and requirements as the current one.<br>{keys}',
      },
      stage3: {
        title: 'Stage 3. Documentation',
        text: 'The report is built from all rooms of the project: title page, contents, for each room — the summary, ' +
          'the plans of the calculation surfaces with isolines and the illustrations. The check boxes of the tree include and exclude sections, a click on a name ' +
          'scrolls the preview to its page.<br>“Print” opens the print window of the browser; to get a PDF, choose “Save as PDF”, ' +
          'paper A4, margins “None” (the pages are already laid out with margins). Plans and the scale are vector graphics, 3D images 300 dpi.',
      },
      room: {
        title: 'Room',
        text: 'An empty rectangular room: the length L along the X axis, the width W along Y, the height H from the floor to the ceiling. ' +
          'The origin is in a corner of the floor, the Z axis points up. Furniture, windows and partitions are not taken into account.<br>' +
          'The surfaces are divided into elements automatically (about 4000 per room): the step is chosen by the area of the faces.',
      },
      refl: {
        title: 'Reflectances',
        text: 'The share of the incident light that a surface reflects; reflection is taken as diffuse. ' +
          'Typical values: white ceiling — 0.7…0.8; light walls — 0.5…0.7; floor — 0.2…0.3. The limit is 0.9.<br>' +
          'The reflected component is calculated by the radiosity method: the light is reflected many times between all elements of the faces.',
      },
      norm: {
        title: 'Requirements',
        text: '<b>Ē</b> — the required maintained illuminance for the task (EN 12464-1, Ēm); the arrows step through the illuminance scale.<br>' +
          '<b>Work plane</b> — its height: 0 — floor (H-0.0), 0.8 — desk (H-0.8); another height can be typed. ' +
          'The assessed plane is at this height, the others are shown for reference.<br>' +
          '<b>MF</b> — the maintenance factor: all results are multiplied by it.<br>' +
          '<b>U<sub>0</sub></b> — the required uniformity E<sub>min</sub> / Ē; an empty field — no requirement.<br>' +
          '<b>Choose</b> — the codifier of tables 9–61 of EN 12464-1:2021, with search. ' +
          'A row fills in Ē, the work plane and U<sub>0</sub>; its source is written under the fields, after a manual change — “set by the user”.',
      },
      file: {
        title: 'Photometric file',
        text: 'An IES (LM-63) or EULUMDAT (LDT) file from the luminaire manufacturer. It gives the luminous intensity distribution, ' +
          'the luminous flux, the housing dimensions, the colour temperature, the power and the CRI; with several lamp sets in an LDT file choose the one you need.<br>' +
          'Without a file the luminaire is a point source with a cosine distribution. The file is kept in the project with the room.',
      },
      lumdata: {
        title: 'Luminaire data',
        text: 'Flux Φ — the luminous flux of the luminaire; when it changes, the intensity distribution is scaled. The colour temperature and the power ' +
          'do not enter the calculation and are printed in the report.',
      },
      grid: {
        title: 'Luminaire layout',
        text: 'A regular grid n<sub>x</sub> × n<sub>y</sub>: from the wall to the outer row — half a step.<br>' +
          '<b>Suggest</b> — an estimate of the number of luminaires by the utilisation factor and a grid with similar steps along the length and the width.<br>' +
          '<b>Mounting height h<sub>m</sub></b> — to the top of the housing, as in DIALux: the photometric centre is lower by the housing height from the file. ' +
          'With h<sub>m</sub> = H the luminaire is on the ceiling, and its upward flux is not taken into account.<br>' +
          '<b>Rotation ψ</b> — the angle of the C0 plane from the X axis counterclockwise, the arrows step by 90°.',
      },
      results: {
        title: 'Results',
        text: 'For each calculation surface — the average Ē, the minimum and maximum illuminance and U₀ = E<sub>min</sub> / Ē, with MF. ' +
          'Ē is the exact average over the area; E<sub>min</sub> and E<sub>max</sub> are the extreme values at all points of the plan.<br>' +
          'Marks of the assessed plane: red cross — Ē below the requirement; green tick — Ē from the requirement up to the next step of the scale; ' +
          'yellow triangle — above that step (more light than needed); red cross at U₀ — below the required U<sub>0</sub>.<br>' +
          'U<sub>d</sub> = E<sub>min</sub> / E<sub>max</sub>.<br>' +
          'The button in a row shows the isolines and the values at the points of the EN 12464-1 grid — on the plan and in 3D.',
      },
      plane: {
        title: 'Calculation surface',
        text: 'The left part of the button shows or hides the chosen surface (F4): isolines, numbers at the grid points, ' +
          'on the plan — the fill. The arrow on the right chooses the surface: H-0.0 (floor), H-0.8 and the work plane height.',
      },
      view: {
        title: 'View controls',
        text: '<b>3D:</b> left mouse button — rotate around the centre of the floor; right or middle — pan; wheel — zoom to the pointer.<br>' +
          '<b>Plan:</b> right or middle button — pan, wheel — zoom; the left button does nothing.<br>' +
          'Double click with the wheel — fit the current view into the window. “Initial view” returns the initial angle (on the plan — fits the plan).<br>' +
          'On a touch screen: one finger — rotate (on the plan — pan), two — pan and zoom.<br>' +
          '<b>F2</b> — plan, <b>F3</b> — 3D, <b>F4</b> — surface, <b>F9</b> — false colours, <b>F10</b> — initial view.',
      },
      'f:roomname': { title: 'Room name', text: 'Under this name the room appears in the list of rooms, in the contents and the headings of the report.' },
      'f:L': { title: 'Length L', text: 'The size of the room along the X axis, 1…50 m.' },
      'f:W': { title: 'Width W', text: 'The size of the room along the Y axis, 1…50 m.' },
      'f:H': { title: 'Height H', text: 'From the floor to the ceiling, 2…20 m. While the luminaire is on the ceiling, its mounting height follows H.' },
      'f:rhoC': { title: 'Ceiling reflectance ρ₁', text: 'White ceiling — 0.7…0.8; mineral tile ceiling — about 0.7; dark — 0.3 and below.' },
      'f:rhoW': { title: 'Wall reflectance ρ₂…₅', text: 'One value for all four walls. Light paint — 0.5…0.7; wood — 0.3…0.4; concrete — 0.3.' },
      'f:rhoF': { title: 'Floor reflectance ρ₀', text: 'Light floor — 0.3…0.4; parquet and laminate — 0.2…0.3; dark — 0.1.' },
      'f:En': { title: 'Required illuminance Ē', text: 'The required maintained average illuminance of the work plane, lx (EN 12464-1, Ēm). The arrows and ↑/↓ step through the scale: … 150, 200, 300, 500, 750 …' },
      'f:hwp': { title: 'Work plane', text: '0 — floor, 0.8 — desk; the arrows switch between these two values, another one can be typed. Not above H − 0.1 m.' },
      'f:U0n': { title: 'Uniformity U₀', text: 'The required U₀ = E<sub>min</sub> / Ē of the assessed plane, at least; an empty field — no requirement. A smaller value is marked red in the results.' },
      'f:mf': { title: 'Maintenance factor MF', text: 'The ratio of the illuminance at the end of the maintenance cycle to the initial one: 0.8 — clean rooms with LED luminaires, 0.7…0.5 — dusty ones.' },
      'f:nx': { title: 'Luminaires along X', text: 'The number of rows along the length; together with n<sub>y</sub> — at most 500 luminaires.' },
      'f:ny': { title: 'Luminaires along Y', text: 'The number of rows along the width; together with n<sub>x</sub> — at most 500 luminaires.' },
      'f:hm': { title: 'Mounting height hₘ', text: 'The height of the top of the housing above the floor. Equal to H — the luminaire is on the ceiling (recessed or surface mounted); less than H — suspended.' },
      'f:psi': { title: 'Rotation ψ', text: 'The angle of the C0 plane of the luminaire from the X axis of the room, counterclockwise, 0…180°. It matters for asymmetric distributions.' },
      'f:flux': { title: 'Luminous flux Φ', text: 'The flux of the luminaire, lm. With a file — from the chosen lamp set; a typed value scales the intensity distribution.' },
      'f:cct': { title: 'Colour temperature', text: 'From the file, if stated; it does not enter the calculation and is printed in the report.' },
      'f:power': { title: 'Power', text: 'The power of the luminaire, W; from the file, if stated. Printed in the report.' },
      'f:name': { title: 'Project name', text: 'Large on the title page and in the running heads; the name of the project file is made from it as well.' },
      'f:description': { title: 'Project description', text: 'A few lines about the task under the name on the title page.' },
      'f:author': { title: 'Prepared by', text: 'Who made the calculation; on the title page together with the phone and the email.' },
      'f:phone': { title: 'Phone', text: 'Printed on the title page. Choose the country code; the number is written by its mask.' },
      'f:email': { title: 'Email', text: 'Printed on the title page.' },
      'f:customer': { title: 'Client', text: 'For whom the calculation was made; on the title page.' },
    },
  },

  app: {
    title: 'Lighting calculation',
    appTitle: 'Room lighting<br>calculation',
    stages: 'Stages', st1: 'Project', st2: 'Calculation', st3: 'Documentation',
    rooms: 'Rooms', lang: 'Interface language',
    save: 'Save', saveTip: 'Save the project to a file',
    theme: 'Switch the theme', themeTip: 'Light or dark theme',
    step1: 'Step 1 of 3',
    st1Lead: 'This information goes to the title page of the report. The fields with an asterisk are needed for the documentation; the rooms can be calculated without them.',
    infoMsg: 'Fill in the required fields — the documentation cannot be made without them.',
    open: 'Open project…', newProject: 'New project', next: 'Next',
    opened: 'Opened “{name}”: {rooms}.',
    roomsN: { one: '{n} room', other: '{n} rooms' },
    newConfirm: 'Start a new project? The current one is lost unless it is saved to a file.',
    inputs: 'Input data', room: 'Room', roomName: 'Name',
    helpRoom: 'Help: room dimensions',
    refl: 'Reflectances', helpRefl: 'Help: reflectances',
    norms: 'Requirements', helpNorm: 'Help: lighting requirements', choose: 'Choose',
    lum: 'Luminaire', helpFile: 'Help: photometric file',
    grid: 'Layout', helpGrid: 'Help: luminaire layout',
    suggest: 'Suggest', suggestTip: 'Estimate the number of luminaires by the utilisation factor and place them in a grid',
    centre: '*Photometric centre at the height of {z} m',
    centreLow: ' — not above the work plane',
    centreTip: '{mm} mm below the mounting point: the housing height from the file',
    centreSame: 'At the mounting point',
    estNone: 'No estimate: the luminaires must be above the work plane.',
    lums: { one: '{n} luminaire', other: '{n} luminaires' },
    estTooMany: 'The preliminary estimate needs {lums} (calculated {raw}) — more than can be placed (at most {max}). Check the luminous flux of the luminaire: {flux} lm. The grid is not changed.',
    estEnough: '*By the preliminary estimate enough: {n} pcs',
    estNeed: '*By the preliminary estimate needed: {n} pcs',
    estTip: 'Calculated {raw}, u = {u}; grid {nx} × {ny} = {n} pcs',
    viewAria: '3D view of the room',
    view3dFail: 'The 3D view could not be loaded (Three.js from the CDN): {msg}',
    busy: 'Calculating…', calcError: 'Calculation error: {msg}',
    plane: 'Calculation surface', planeShow: 'Show the calculation surface', planePick: 'Choose the calculation surface',
    showPlane: 'Show {name}', hidePlane: 'Hide {name}', noPlane: 'Do not show',
    normative: 'assessed', noResult: 'No calculation result',
    falseColors: 'False colours', plan: 'Plan', planTip: '2D view (plan)', view3d: '3D view', reset: 'Initial view',
    helpView: 'Help: view controls',
    legend: 'Illuminance scale', legendUnit: 'E, lx', andAbove: '{v} and above',
    results: 'Results', helpResults: 'Help: results',
    calc: 'Calculate', auto: 'Automatic', autoTip: 'Recalculate on every change of the parameters',
    changed: 'The parameters have changed. Press “Calculate”.',
    levelLow: 'below the requirement', levelOk: 'within the step of the scale', levelHigh: 'above the step of the scale',
    levelTitle: '{what}: required Ē = {e} lx',
    u0Low: 'U₀ below the required {u}', u0Ok: 'U₀ not below the required {u}', u0None: 'No U₀ requirement; U₀ below 0.3',
    isoAria: 'Isolines {name}', isoTip: '{name}: isolines and values at the grid points — on the plan and in 3D',
    faces: 'Illuminance of the faces', face: 'Face', faceAvg: 'E<sub>av</sub>, lx', direct: 'Direct', reflShort: 'Refl.',
    absorbed: 'Absorbed {a} lm of {b} lm.',
    lost: ' The upward flux of {a} lm is not taken into account: the luminaire is at the ceiling (no suspension).',
    extra: 'More settings',
    exposure: 'Exposure correction', exposureHint: 'For the realistic view: ±2 stops from the automatic exposure.',
    map: 'Map on the faces', mapTotal: 'Total', mapDirect: 'Direct', mapIndirect: 'Reflected',
    mapHint: 'The button of a plane row shows its isolines and the values at the points of the EN 12464-1 grid: on the plan — on a light background (in colour with the “False colours” button), in 3D — as a semi-transparent layer. Without false colours the faces are shown realistically: luminance L = ρE/π.',
    dev: 'For the developer', mesh: 'Mesh', elements: 'Elements',
    meshStep: 'Step h (auto), m', meshN: 'Total elements N',
    timing: 'Calculation time', cached: 'cached',
    tKernel: 'Kernel', tKernelDetail: '{a} + correction {b}',
    tDirect: 'Direct component', tDirectDetail: '{a} · {l} lum. × {n} el.', tEvals: ' · {n} eval./pair',
    tSolver: 'Solver', tSolverDetail: '{a} · {n} iter.',
    tPlanes: 'Planes', tChecks: 'Checks of stages 3–4',
    viewDev: 'View', plainColors: 'Placeholder face colours', edges: 'Element edges', normals: 'Face normals',
    crit: 'Stage {n} criteria',
    newRoom: 'New room', newRoomPlus: '+ New room',
    untitled: 'Untitled',
    delRoom: 'Delete the room', delRoomAria: 'Delete {name}',
    delRoomConfirm: 'Delete the room “{name}”? Its input data will be lost.',
    codifier: 'Codifier', normsTitle: 'Illuminance requirements',
    normsLead: 'Click a row — the requirement, the work plane and the uniformity are put into the room.',
    close: 'Close', normsSearch: 'Search: room, number, word', normsSearchAria: 'Search the requirements',
    reportTree: 'Report contents', step3: 'Step 3 of 3',
    st3Lead: 'Check the sections that go into the report; click a name to go to its page.',
    print: 'Print', printNote: 'To get a file, choose the “Save as PDF” printer in the print window.',
    preview: 'Report preview',
  },

  rep: {
    kind: 'Lighting calculation',
    untitled: 'Untitled project',
    customer: 'Client', author: 'Prepared by', date: 'Date',
    disclaimer: `The calculation was made with non-certified software and is for demonstration only. MAYTONI accepts no${NB}liability for differences between the results of this calculation, the actual illuminance and the results of calculations made with certified software.`,
    toc: 'Contents',
    lumlist: 'List of luminaires', restable: 'Summary of results',
    room: 'Room', summary: 'Summary', results: 'Results', ill: 'Illustrations',
    maker: 'Manufacturer', article: 'Article', cct: 'CCT', kit: 'Lamp', count: 'Qty, pcs',
    surface: 'Surface',
    refNote: '* For reference.', targetNote: `In${NB}brackets — the target value of the parameter.`,
    norms: 'Lighting requirements', lum: 'Luminaire',
    normative: 'assessed surface', reference: 'for reference',
    height: ', height {z}', floor: ', floor',
    illReal: 'Visualisation of the light distribution',
    illFalse: 'Illuminance distribution in false colours',
    scale: 'False colour scale, lx',
    scaleMark: `Scale${NB}1:{n}`,
  },

  rui: {
    size: 'Length × width × height',
    refl: 'Reflectances<br><span class="sub">ceiling / walls / floor</span>',
    mf: 'Maintenance factor MF',
    norm: 'Requirement', En: 'Illuminance Ē', U0: 'Uniformity U<sub>0</sub>', U0none: 'no requirement',
    maker: 'Manufacturer', article: 'Article', noFile: 'cosine distribution, no file',
    count: 'Quantity', flux: 'Luminous flux', cct: 'Colour temperature', power: 'Power',
    dims: 'Dimensions', hm: 'Mounting height', centre: 'Photometric centre', at: 'at the height of {z}',
    lum: 'Luminaire', noFileLum: 'No file (cosine distribution)',
    busyRoom: 'Calculating: {name} ({k} of {n})…', aRoom: 'room', busyIll: 'Illustrations…',
    failed: 'The report could not be prepared: {msg}',
    title: 'Title page', toc: 'Contents',
    allRooms: 'In all rooms', inAll: '{what} in all rooms', normOnly: 'Assessed only',
    page: 'p. {n}',
  },

  chk: {
    s1: {
      normals: 'The normals of all faces point inwards', normalsOk: '6 of 6, by the vertices of the triangles',
      badTris: '{n} triangles not along the normal', outward: 'outwards',
      count: 'The number of elements matches n_L, n_W, n_H',
      axes: 'The axes in 3D match the specification',
    },
    s2: {
      floorCentre: 'centre of the floor', wall: 'at a wall', corner: 'in a corner', planeCentre: '{plane}, centre',
      sumDetail: '|ΣF − 1| = {err} over {n} elements',
      cornerEl: 'corner element of the floor', centreEl: 'central element of the floor',
      rowDetail: '|ΣF − 1| = {err}, exact F element → element',
      recip: 'Reciprocity A<sub>i</sub>F<sub>ij</sub> = A<sub>j</sub>F<sub>ji</sub>',
      worst: 'largest relative difference {x}',
      coax: 'Coaxial squares: table values',
      coaxDetail: '0.0686 · 0.1998 · 0.4153; difference from the exact formula {x}',
    },
    s3: {
      under: 'Below a luminaire E = I(0)/d²',
      one: 'one luminaire; {d}',
      below: 'floor: {a}, I(0)/d² = {b}, difference {x}',
      above: '; ceiling: {a}, I(180°)/h<sub>c</sub>² = {b}',
      flux: 'The flux on all faces equals the flux of the luminaires',
      fluxExact: 'element averages: |ΣE·A / ΣΦ − 1| = {x} with N = {n}',
      fluxFile: 'element averages (adaptive cubature): |ΣE·A / ΣΦ − 1| = {x} with N = {n}',
      up: '; the upward flux at the ceiling is not taken into account',
      centres: 'Flux balance by element centres on a fine mesh',
      centresDetail: '|ΣE·A / ΣΦ − 1| = {x} with N = {n} (step h/2); on the main mesh: {y}',
      avgFile: 'Element averages: cubature and exact cubature',
      avgExact: 'Element averages: exact formula and quadrature',
      avgFileDetail: 'floor, cubature with a 100 times smaller tolerance: largest relative difference {x} (elements above 1 % of the maximum)',
      avgExactDetail: 'floor, Gauss 8 × 8 of the point formula: largest relative difference {x}',
    },
    s4: {
      kernel: 'The kernel matches the direct calculation of F',
      kernelDetail: '{n} random pairs of different faces: largest relative difference {x}; max |ΣF<sub>ij</sub> − 1| = {y} with N = {N}',
      balance: 'Energy balance within 0.5 %',
      balanceDetail: 'absorbed Σ(1 − ρ)·E·A = {a} lm, flux of the luminaires {e} lm, difference {x}',
      sumpner: 'The reflected illuminance is close to Sumpner’s estimate',
      sumpnerDetail: 'average over the faces {a} lx, estimate Φ₁ / (A·(1 − ρ<sub>av</sub>)) = {b} lx, difference {x} (tolerance 15 %)',
      exposure: 'The exposure does not change with rotation',
      exposureDetail: '{n} angles, from above and below: m = {m} in all; L<sub>wa</sub> = {l} cd/m² over the whole room',
      solver: 'The solver converged',
      solverDetail: '{n} Gauss–Seidel iterations with a correction by faces; last change {x} &lt; ε = {e}',
    },
    s5: {
      rated: 'The flux of the distribution matches the rated flux (1 %)',
      ratedDetail: 'integral of the distribution {a}, in the file {b}, difference {x}',
      scaled: '; flux in the calculation {a} (distribution × {k})',
      iesDetail: 'the IES file does not state the luminaire flux ({why}); the luminaire flux is the integral of the distribution, {a}',
      absolute: 'absolute photometry', lamps: 'lamp flux {a} stated',
      through: 'The distribution passes through the table values',
      throughDetail: '{c} planes in the file, {p} after unfolding (symmetry: {s}), {g} γ angles: largest difference {x} of I<sub>max</sub>',
      sym: { rot: 'rotational', quad: 'two planes', half0: 'plane C0–C180', half90: 'plane C90–C270', none: 'none' },
      closed: 'Flux of the interpolant in closed form',
      closedDetail: 'formula {a}, Gauss quadrature 6 × 6 over the cells of the table: difference {x}; down {d}, up {u}',
      each: 'Flux of each luminaire on the faces (10⁻³)',
      eachDetail: '{n} luminaires (integrated {k}, the others mirrored): largest |ΣE·A / Φ − 1| = {x}; {e} evaluations of the distribution per element–luminaire pair, depth {d}, retries {r}',
    },
    s6: {
      field: '{plane}: plan field',
      fieldDetail: 'auxiliary grid {ax} × {ay} (step {dx} m), grid points {gx} × {gy}; reflected {r}, direct {d}, grid points {g}',
      iso: 'Isolines run along the colour boundaries',
      isoDetail: '{v} vertices on cell edges: on the level — {l}, different colours on both sides — {c}; segment midpoints at most {x} cell from the colour boundary',
      isoNone: 'no isolines on the plan (the illuminance stays within one level of the scale)',
      mean: 'Ē of the plan matches Ē of the results (0.5 %)',
      meanDetail: 'by the nodes of the auxiliary grid {a} lx, by the cells {b} lx, difference {x}',
      interp: 'Reflected between mesh vertices: interpolation against the exact calculation (1 %)',
      interpDetail: 'at {n} grid points largest difference {x} of the total illuminance',
    },
  },
};
