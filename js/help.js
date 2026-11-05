// Help icons "?" next to fields and groups: a click opens a popover with the text of the topic.
// The texts are user-facing (Russian); they are placeholders until the help is written.

/** Topics: data-help="<key>" on a button.help. */
export const HELP = Object.freeze({
  room: { title: 'Размеры помещения', text: 'Текст справки будет добавлен.' },
  refl: { title: 'Коэффициенты отражения', text: 'Текст справки будет добавлен.' },
  norm: { title: 'Нормы освещения', text: 'Текст справки будет добавлен.' },
  grid: { title: 'Размещение светильников', text: 'Текст справки будет добавлен.' },
  file: { title: 'Фотометрический файл', text: 'Текст справки будет добавлен.' },
  lumdata: { title: 'Параметры светильника', text: 'Текст справки будет добавлен.' },
  results: { title: 'Результаты', text: 'Текст справки будет добавлен.' },
});

/** "?" button markup for a topic. */
export const helpButton = (key) => `<button type="button" class="help" data-help="${key}" aria-label="Справка: ${HELP[key]?.title ?? ''}" aria-expanded="false">?</button>`;

/**
 * Opens and closes the popover for every button.help inside root (one at a time); Esc, a click
 * elsewhere or a second click on the button close it.
 */
export function initHelp(root = document) {
  const pop = document.createElement('div');
  pop.className = 'helppop';
  pop.setAttribute('role', 'dialog');
  pop.hidden = true;
  document.body.appendChild(pop);
  let owner = null;
  const close = () => { if (owner) owner.setAttribute('aria-expanded', 'false'); owner = null; pop.hidden = true; };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button.help');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (owner === b) { close(); return; }
    close();
    const h = HELP[b.dataset.help] ?? { title: 'Справка', text: 'Текст справки будет добавлен.' };
    pop.innerHTML = `<div class="hpt">${h.title}</div><div class="hpx">${h.text}</div>`;
    pop.hidden = false;
    const r = b.getBoundingClientRect(), w = pop.offsetWidth, hh = pop.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    const below = r.bottom + 8 + hh < window.innerHeight;
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${(below ? r.bottom + 8 : r.top - 8 - hh) + window.scrollY}px`;
    owner = b; b.setAttribute('aria-expanded', 'true');
  });
  document.addEventListener('click', (e) => { if (owner && !pop.contains(e.target) && !e.target.closest('button.help')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  window.addEventListener('resize', close);
  document.addEventListener('scroll', close, true);
}
