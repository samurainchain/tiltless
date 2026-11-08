# Reels 08-10 in the 3D style of 02x-07x. Run from scratchpad/es:  PYTHONPATH=.:x3d python3 w2/buildw2.py 08 09 10
# Voice is Piper (es_MX-claude-high), voiced line by line (w2/lines.py), so lines-NN.json holds exact line times.
import json, sys
argv = sys.argv[1:]
from common3d import build, page, win, crop, ext, bar_html, h1s, save, CURSOR  # noqa: E402  (common3d clears sys.argv)

SH = 'w2/shots/'


class R(build.Reel):
    """A reel whose words come from lines-NN.json; amounts with − are red in the subtitles."""
    def __init__(self, n):
        self.n = n
        self.lines = json.load(open(f'w2/lines-{n}.json'))
        self.words = [w for l in self.lines for w in l['words']]
        json.dump(self.words, open(f'words-{n}.json', 'w'), ensure_ascii=False)
        self.toks = [dict(w, c='red' if w['w'].startswith('−') else '') for w in self.words]
        self.layers, self.js = [], []

    def L(self, i):
        return self.lines[i]['s']

    def W(self, i, k):
        return self.lines[i]['words'][k]['s']

    def end(self):
        return self.lines[-1]['e']


DEMO_SMALL = 'El diario es gratis · Pro 30 días gratis hasta el 30 de nov.'


def tag(id, cls, label, value, style=''):
    return f'<div class="tag3d {cls}" id="{id}" style="left:0;top:0;opacity:0;{style}"><span>{label}</span>{value}</div>'


def hl(id, x, y, w, h, color='#3ecf8e'):
    """A glowing outline over a field of a window (window coordinates: view starts 44 px down)."""
    return (f'<div id="{id}" style="position:absolute;left:{x - 8}px;top:{44 + y - 8}px;width:{w + 16}px;height:{h + 16}px;border-radius:14px;'
            f'border:4px solid {color};box-shadow:0 0 40px {color}aa, inset 0 0 30px {color}33;opacity:0"></div>')


# ---------------------------------------------------------------- 08: the screenshot reader
def reel08():
    r = R('08'); L, W = r.L, r.W
    END = r.end() + 0.9
    SHOT = 'w2/56-okxAppEs-dark.png'
    FIELDS = [('Instrumento', 'BTCUSDT'), ('Dirección', 'Corto'), ('Apalancamiento', '25×'), ('Entrada', '59,662.3'), ('Salida', '60,681.7'), ('Tamaño', '0.126')]
    tags = ''.join(tag(f't{i}', 'g', l, v, 'font-size:40px;padding:14px 24px') for i, (l, v) in enumerate(FIELDS))
    boxes = (hl('b0', 457, 305, 526, 41) + hl('b1', 441, 351, 503, 46) + hl('b2', 441, 415, 508, 52)
             + hl('b3', 457, 522, 257, 41) + hl('b4', 726, 522, 257, 41) + hl('b5', 457, 663, 371, 41)
             + hl('bp', 437, 92, 200, 52, '#f2555a') + hl('bs', 441, 783, 508, 40))
    body = f"""
<div id="s0" class="layer stage3d" style="opacity:1;perspective:1300px;perspective-origin:540px 880px">
  <div class="scene" id="sc0f"><div class="gridfloor" style="left:-1600px;top:-400px;width:3200px;height:1600px;opacity:.45;transform:translateZ(-260px)"></div></div>
  <div class="scene" id="sc0">
    <div id="shot" style="position:absolute;left:-300px;top:-249px;width:600px;height:498px;border-radius:28px;overflow:hidden;border:3px solid #ffffff2a;box-shadow:0 50px 120px -20px #000,0 0 90px -20px #3ecf8e88">
      <img src="{SHOT}" style="width:600px;display:block"><div id="scan" style="position:absolute;left:0;right:0;height:6px;background:#3ecf8e;box-shadow:0 0 30px 8px #3ecf8e99;opacity:0"></div></div>
    {tags}
  </div>
</div>
<div id="s1" class="layer stage3d" style="perspective:1400px;perspective-origin:540px 900px"><div style="position:absolute;left:0;right:0;top:0;height:600px;background:linear-gradient(#121212f2 60%,#12121200);z-index:2"></div>
  <div class="scene" id="sc1">
    {win('w1', '#/today', SH + 'entry-empty.png', f'<img id="w1-run" src="{SH}entry-running.png" style="position:absolute;left:0;top:44px;width:1440px;opacity:0"><img id="w1-fill" src="{SH}entry-filled.png" style="position:absolute;left:0;top:44px;width:1440px;opacity:0">' + boxes + CURSOR.format(id='cur') + '<div class="ripple" id="rip"></div>')}
    <img id="drop" src="{SHOT}" style="position:absolute;left:0;top:0;width:600px;border-radius:24px;border:3px solid #3ecf8e;box-shadow:0 0 80px #3ecf8e88;opacity:0">
    {tag('saved', 'g', 'Guardada', '✓', 'font-size:64px')}
  </div>
</div>
<div id="s2" class="layer stage3d" style="perspective:1300px;perspective-origin:540px 860px">
  <div class="scene" id="sc2f"><div class="gridfloor" style="left:-1600px;top:-1600px;width:3200px;height:3200px;transform:translateY(260px) rotateX(90deg);opacity:.6"></div></div>
  <div class="scene" id="sc2">
    {tag('free', 'g', 'Gratis', '5 lecturas / mes', 'font-size:64px')}
    {tag('pro', 'g', 'Pro', 'Sin límite', 'font-size:64px')}
  </div>
</div>
<div style="position:absolute;inset:0;perspective:900px;perspective-origin:540px 1100px;transform-style:preserve-3d;pointer-events:none;z-index:5">{ext('slam', '−$128.44', '#f2555a', 1010, '', 170)}</div>
"""
    heads_html = h1s(['Sube 1 captura.<br><span class="g">6 campos se llenan solos.</span>', 'Una operación cerrada.<br>Captura de ejemplo.', 'La sueltas<br>en Tiltless.',
                      'Instrumento, dirección,<br>apalancamiento.', 'Entrada, salida,<br>tamaño.', 'Y el resultado:<br><span class="r">−$128.44</span>',
                      'Revisas, guardas.<br>Tu diario, <span class="g">al día.</span>', '5 lecturas al mes gratis.<br><span class="g">Sin límite en Pro.</span>'])
    end_html = build.end_card('Sube 1 captura.<br><span class="g">6 campos se llenan solos.</span>', 'El diario es gratis · 5 lecturas de capturas al mes')
    ring = [(-250, -330), (250, -330), (-290, 0), (290, 0), (-250, 330), (250, 330)]
    js = f"""
const L = {json.dumps([l['s'] for l in r.lines])}
labels(t, [[0, '<b>Captura de ejemplo</b> · sintética'], [L[2] - .1, '<b>Nueva operación</b> · escritorio'], [L[7] - .1, '<b>Lector de capturas</b>'], [L[8] - .1, '']])
heads(t, [[.3, 'hd0'], [L[1] - .1, 'hd1'], [L[2] - .1, 'hd2'], [L[3] - .1, 'hd3'], [L[4] - .1, 'hd4'], [L[5] - .1, 'hd5'], [L[6] - .1, 'hd6'], [L[7] - .1, 'hd7'], [L[8] - .1, null]])
$('flash').style.opacity = flashAt(t, [[L[2] + .55, .2], [{W(5, 3)} + .1, .15]])

// The screenshot floats; six fields fly out of it, then fold back while a scan line reads it.
if (show('s0', t, 0, L[2] + .05, .2)) {{
  const c = track([[0, {{ x: 0, y: 0, z: -520, rx: -6, ry: -22, rz: 0 }}], [L[1], {{ x: 0, y: 0, z: -380, rx: -4, ry: 10, rz: 0 }}], [L[2], {{ x: 0, y: 0, z: 120, rx: 8, ry: -4, rz: 0 }}, 'expo']], t)
  $('sc0').style.transform = $('sc0f').style.transform = camCss(c)
  const RING = {json.dumps(ring)}
  for (let i = 0; i < 6; i++) {{
    const out = easeOutBack(clamp((t - .5 - i * .28) / .45)), back = ease(clamp((t - L[1] - .2 - i * .08) / .5)), p = out * (1 - back)
    const el = $('t' + i); el.style.opacity = clamp(out * 3) * (1 - back)
    el.style.transform = `translate3d(${{RING[i][0] * p - el.offsetWidth / 2}}px, ${{RING[i][1] * p - 50}}px, ${{p * 180}}px) rotateY(${{-c.ry}}deg) scale(${{.6 + .4 * p}})`
  }}
  const sp = clamp((t - L[1] - .6) / 2.2); $('scan').style.opacity = sp > 0 && sp < 1 ? 1 : 0; $('scan').style.top = (sp * 492) + 'px'
}}

// Dropped onto the entry form; the fields fill and light up as they're named.
if (show('s1', t, L[2] - .05, L[7] - .05, .2)) {{
  const c = track([
    [L[2] - .05, {{ x: 720, y: 472, z: -900, rx: 22, ry: -18, rz: 0 }}],
    [L[2] + .8, {{ x: 720, y: 472, z: -560, rx: 6, ry: -6, rz: 0 }}, 'expo'],
    [L[3], {{ x: 700, y: 44 + 390, z: 120, rx: 4, ry: -10, rz: 0 }}],
    [L[4], {{ x: 700, y: 44 + 400, z: 100, rx: 2, ry: 8, rz: 0 }}],
    [L[4] + .8, {{ x: 700, y: 44 + 600, z: 120, rx: 2, ry: 6, rz: 0 }}],
    [L[5], {{ x: 560, y: 44 + 160, z: 60, rx: 0, ry: -6, rz: 0 }}],
    [L[6], {{ x: 640, y: 44 + 600, z: -120, rx: 4, ry: -4, rz: 0 }}],
    [L[7], {{ x: 720, y: 472, z: -640, rx: 10, ry: 12, rz: 0 }}],
  ], t)
  $('sc1').style.transform = camCss(c)
  const dp = clamp((t - L[2]) / .6), d = $('drop')
  d.style.opacity = dp > 0 && dp < 1 ? 1 : 0
  d.style.transform = `translate3d(${{lerp(420, 420, dp)}}px, ${{lerp(-900, 230, ease(dp))}}px, ${{lerp(500, 0, ease(dp))}}px) rotateX(${{(1 - dp) * 50}}deg) scale(${{lerp(1, .4, ease(dp))}})`
  const rp = clamp((t - L[2] - .6) / .6); $('rip').style.left = '720px'; $('rip').style.top = '520px'; $('rip').style.opacity = t > L[2] + .6 ? 1 - rp : 0; $('rip').style.transform = `scale(${{.3 + rp * 2}})`
  $('w1-run').style.opacity = t >= L[2] + .6 && t < L[3] - .15 ? 1 : 0; $('w1-fill').style.opacity = t >= L[3] - .15 ? 1 : 0
  const on = [{W(3, 0)}, {W(3, 1)}, {W(3, 2)}, {W(4, 0)}, {W(4, 1)}, {W(4, 2)}]
  on.forEach((a, i) => {{ $('b' + i).style.opacity = clamp((t - a + .05) / .15) * (1 - clamp((t - L[5] + .2) / .3)) }})
  $('bp').style.opacity = clamp((t - {W(5, 3)}) / .15) * (1 - clamp((t - L[6]) / .3))
  const click = {W(6, 1)}, k = $('cur'), kp = ease(clamp((t - L[6]) / (click - L[6])))
  k.style.left = lerp(1150, 690, kp) + 'px'; k.style.top = lerp(1000, 44 + 798, kp) + 'px'; k.style.opacity = clamp((t - L[6]) / .15) * (1 - clamp((t - click - .4) / .2))
  k.style.transform = `scale(${{t > click && t < click + .12 ? .85 : 1}})`
  $('bs').style.opacity = t > click && t < click + .5 ? 1 : 0
  const sp = easeOutBack(clamp((t - click - .3) / .5)); $('saved').style.opacity = clamp(sp * 3); $('saved').style.transform = `translate3d(560px, ${{44 + 700 - sp * 140}}px, ${{sp * 260}}px)`
  $('w1').style.filter = `brightness(${{1 - sp * .35}})`
}}
// The amount slams in front of the form.
{{ const at = {W(5, 3)}, p = clamp((t - at) / .3), el = $('slam'), out = clamp((t - L[6] + .1) / .25)
  el.style.opacity = clamp(p * 3) * (1 - out); el.style.transform = `translateZ(${{(1 - easeOutBack(p)) * 700}}px) rotateX(${{(1 - p) * 30}}deg)`; el.style.filter = `blur(${{(1 - p) * 12}}px)` }}

// Free reads and Pro, as two signs turning over a grid floor.
if (show('s2', t, L[7] - .1, L[8] - .05, .2)) {{
  const c = track([[L[7] - .1, {{ x: 0, y: 0, z: -900, rx: -18, ry: 30, rz: 0 }}], [L[7] + .9, {{ x: 0, y: 0, z: -420, rx: -10, ry: -6, rz: 0 }}, 'expo'], [L[8], {{ x: 0, y: 0, z: -360, rx: -8, ry: -14, rz: 0 }}]], t)
  $('sc2').style.transform = $('sc2f').style.transform = camCss(c)
  const a = easeOutBack(clamp((t - L[7] - .1) / .6)), b = easeOutBack(clamp((t - {W(7, 5)}) / .6))
  $('free').style.opacity = clamp(a * 3); $('free').style.transform = `translate3d(-330px, ${{-190}}px, 0) rotateY(${{(1 - a) * 90}}deg)`
  $('pro').style.opacity = clamp(b * 3); $('pro').style.transform = `translate3d(-250px, ${{40}}px, 60px) rotateY(${{(1 - b) * -90}}deg)`
}}
if (show('end', t, L[8] - .05, 999)) {{ const l = prog(t, L[8], L[8] + .6); $('end-logo').style.transform = `translateY(${{(1 - easeOutBounce(l)) * -300}}px)` }}
"""
    cues = [['whoosh', .1, .6, .3]] + [['pop', .5 + i * .28, .25, 500 + i * 60] for i in range(6)] + [
        ['whoosh', r.L(1) + .2, .8, .25], ['laser', r.L(1) + .6, 2.0], ['whoosh', r.L(2) - .1, .7, .4], ['impact', r.L(2) + .55, .4, 60],
        ['typing', r.L(2) + .7, .12, 8]] + [['click', r.W(i // 3 + 3, i % 3), .3] for i in range(6)] + [
        ['impact', r.W(5, 3) + .1, .5, 70], ['click', r.W(6, 1), .4], ['pop', r.W(6, 1) + .35, .3, 700],
        ['whoosh', r.L(7) - .2, .8, .35], ['thud', r.L(7) + .3, .4], ['thud', r.W(7, 5) + .2, .4], ['laser', r.L(8) - .3, .5], ['impact', r.L(8) + .1, .3, 50]]
    save('08', page(r, body, js, heads_html, end_html, END), cues)
    return END


# ---------------------------------------------------------------- 09: win rate vs. what mistakes cost
def reel09():
    r = R('09'); L, W = r.L, r.W
    END = r.end() + 0.9
    A = SH + 'analytics-full.png'
    ROWS = [990, 1063, 1137, 1210, 1284, 1357, 1411]
    HGT = [62, 62, 62, 62, 62, 42, 42]
    rows = ''.join(f'<div class="card3" id="k{i}" style="opacity:0">{crop(f"kc{i}", A, 297, y, 512, h, "r", 8, "position:relative")}</div>' for i, (y, h) in enumerate(zip(ROWS, HGT)))
    pins = (f'<div class="card3" id="pn0" style="opacity:0">{crop("pc0", A, 297, 258, 321, 53, "g", 10, "position:relative")}</div>'
            f'<div class="card3" id="pn1" style="opacity:0">{crop("pc1", A, 297, 322, 156, 64, "g", 10, "position:relative")}</div>')
    body = f"""<style>.scene .card3, .scene .card3 * {{ transform-style:flat }} .card3 {{ position:absolute; left:0; top:0 }}
.blbl {{ position:absolute; left:-200px; width:400px; text-align:center }} .blbl b {{ display:block; font:800 96px 'JetBrains Mono', monospace; letter-spacing:-.04em }} .blbl span {{ font:700 38px Inter, sans-serif; color:#ededed }}</style>
<div id="s1" class="layer stage3d" style="perspective:1400px;perspective-origin:540px 900px"><div style="position:absolute;left:0;right:0;top:0;height:600px;background:linear-gradient(#121212f2 60%,#12121200);z-index:2"></div>
  <div class="scene" id="sc1">
    {win('w1', '#/analytics', A)}
    {pins}
    {rows}
    {tag('total', 'r', '7 tipos de error', '−$1,340.00', 'font-size:84px')}
  </div>
</div>
<div id="s2" class="layer stage3d" style="perspective:1300px;perspective-origin:540px 860px">
  <div class="scene" id="sc2f"><div class="gridfloor" style="left:-1600px;top:-1600px;width:3200px;height:3200px;transform:translateY(10px) rotateX(90deg);opacity:.6"></div></div>
  <div class="scene" id="sc2">
    <div style="position:absolute;left:-240px;top:0">{bar_html('bg', '#3ecf8e', '<div class="blbl" id="bg-l"><b style="color:#3ecf8e">+$255</b><span>52% de acierto</span></div>')}</div>
    <div style="position:absolute;left:240px;top:0">{bar_html('br', '#f2555a', '<div class="blbl" id="br-l"><b style="color:#f2555a">−$1,340</b><span>Errores</span></div>')}</div>
  </div>
</div>
<div style="position:absolute;inset:0;perspective:900px;perspective-origin:540px 1100px;transform-style:preserve-3d;pointer-events:none;z-index:5">{ext('e52', '52%', '#3ecf8e', 760, 'Tasa de acierto', 260)}{ext('e1340', '−$1,340', '#f2555a', 1040, 'Errores', 190)}</div>
"""
    heads_html = h1s(['Con 52% de acierto,<br>tus errores te costaron <span class="r">$1,340.</span>', 'Mes de demostración.', '52% de acierto.<br><span class="g">+$255.</span>',
                      'Parece bien.<br>Ahora suma los errores.', 'Mala hora:<br><span class="r">−$332.50</span>', 'Pasar el stop:<br><span class="r">−$280.00</span>',
                      'FOMO:<br><span class="r">−$260.00</span>', 'Revancha:<br><span class="r">−$182.50</span>', '7 tipos de error:<br><span class="r">−$1,340.</span>',
                      'Tu acierto<br>no es el problema.'])
    end_html = build.end_card('Tu acierto no es el problema.<br><span class="r">Tus errores, sí.</span>', DEMO_SMALL)
    js = f"""
const L = {json.dumps([l['s'] for l in r.lines])}
const ROWS = {json.dumps(ROWS)}
labels(t, [[0, ''], [L[1] - .1, '<b>Análisis</b> · mes de demostración'], [L[3] - .1, '<b>Costo de los errores</b> · demo'], [L[9] - .1, '<b>Mes de demostración</b>'], [L[10] - .1, '']])
heads(t, [[.3, 'hd0'], [L[1] - .1, 'hd1'], [L[2] - .1, 'hd2'], [L[3] - .1, 'hd3'], [L[4] - .1, 'hd4'], [L[5] - .1, 'hd5'], [L[6] - .1, 'hd6'], [L[7] - .1, 'hd7'], [L[8] - .1, 'hd8'], [L[9] - .1, 'hd9'], [L[10] - .1, null]])
$('flash').style.opacity = flashAt(t, [[{W(0, 8)} + .1, .2], [{W(8, 4)} + .1, .15]])

// Hook: 52% stands, then tips over and −$1,340 slams in.
{{ const a = easeOutBack(clamp((t - .3) / .5)), fall = ease(clamp((t - {W(0, 6)}) / .5)), out = clamp((t - L[1] + .2) / .25), el = $('e52')
  el.style.opacity = clamp(a * 3) * (1 - fall) ; el.style.transform = `translateZ(${{(1 - a) * 500}}px) rotateY(${{(1 - a) * -40 + Math.sin(t * 1.3) * 6}}deg) rotateX(${{fall * 80}}deg)`
  const at = {W(0, 8)}, p = clamp((t - at) / .3), e = $('e1340')
  e.style.opacity = clamp(p * 3) * (1 - out); e.style.transform = `translateZ(${{(1 - easeOutBack(p)) * 800}}px) rotateY(${{Math.sin(t * 1.1) * 8}}deg)`; e.style.filter = `blur(${{(1 - p) * 12}}px)`
  const [sx, sy] = shake(t, at + .25, .3, 16); e.style.marginLeft = sx + 'px'; e.style.marginTop = sy + 'px' }}

// The analytics page: the headline numbers lift out, then every mistake row comes forward into a column.
if (show('s1', t, L[1] - .15, L[9] - .05, .2)) {{
  const scroll = 810 * ease(clamp((t - L[3] - .1) / .8)); $('w1-img').style.transform = `translateY(${{-scroll}}px)`
  const c = track([
    [L[1] - .15, {{ x: 720, y: 472, z: -1500, rx: 40, ry: -30, rz: -6 }}],
    [L[1] + .9, {{ x: 720, y: 472, z: -640, rx: 8, ry: -8, rz: 0 }}, 'expo'],
    [L[2], {{ x: 500, y: 44 + 320, z: 60, rx: 4, ry: -12, rz: 0 }}],
    [L[3], {{ x: 520, y: 44 + 330, z: 20, rx: 4, ry: -6, rz: 0 }}],
    [L[3] + .9, {{ x: 720, y: 472, z: -620, rx: 6, ry: 8, rz: 0 }}],
    [L[4] + .3, {{ x: 700, y: 300, z: -200, rx: 4, ry: 10, rz: 0 }}],
    [L[7] + .3, {{ x: 700, y: 420, z: -240, rx: 4, ry: -6, rz: 0 }}],
    [L[8] + .8, {{ x: 700, y: 560, z: -420, rx: 6, ry: -8, rz: 0 }}],
    [L[9], {{ x: 700, y: 580, z: -460, rx: 8, ry: -14, rz: 0 }}],
  ], t)
  $('sc1').style.transform = camCss(c)
  ;[[0, 297, 258, {W(2, 3)}], [1, 297, 322, L[2]]].forEach(([i, x, y, at]) => {{
    const p = easeOutBack(clamp((t - at) / .45)), gone = clamp((t - L[3] - .2) / .3), el = $('pn' + i)
    el.style.opacity = clamp(p * 3) * (1 - gone); el.style.transform = `translate3d(${{x - 10}}px, ${{44 + y - 10}}px, ${{p * 160}}px) scale(${{1 + p * .15}})` }})
  const starts = [L[4], L[5], L[6], L[7], L[8], L[8] + .25, L[8] + .5]
  let lift = 0
  for (let i = 0; i < 7; i++) {{
    const p = easeOutBack(clamp((t - starts[i]) / .55)), el = $('k' + i)
    const fromY = 44 + ROWS[i] - scroll - 8, toY = 250 + i * 84 - (i > 4 ? (i - 4) * 18 : 0)
    el.style.opacity = p > 0 ? 1 : 0
    el.style.transform = `translate3d(${{lerp(289, 420, p)}}px, ${{lerp(fromY, toY, p)}}px, ${{p * 480}}px) rotateY(${{(1 - p) * 30}}deg)`
    lift = Math.max(lift, p > 0 ? 1 : 0)
  }}
  $('w1').style.filter = `blur(${{ease(clamp((t - L[4]) / .5)) * 6}}px) brightness(${{1 - ease(clamp((t - L[4]) / .5)) * .5}})`
  const tp = easeOutBack(clamp((t - {W(8, 4)}) / .5)); $('total').style.opacity = clamp(tp * 3)
  $('total').style.transform = `translate3d(380px, ${{830}}px, ${{480 + tp * 60}}px) scale(${{.7 + tp * .3}})`
}}

// Two blocks on a floor: what the win rate shows and what the mistakes took.
if (show('s2', t, L[9] - .1, L[10] - .05, .2)) {{
  const c = track([[L[9] - .1, {{ x: 0, y: -260, z: -1100, rx: -30, ry: 40, rz: 0 }}], [L[9] + .9, {{ x: 0, y: -300, z: -620, rx: -14, ry: -16, rz: 0 }}, 'expo'], [L[10], {{ x: 0, y: -300, z: -560, rx: -12, ry: -24, rz: 0 }}]], t)
  $('sc2').style.transform = $('sc2f').style.transform = camCss(c)
  ;[['bg', 255 * .42, 0], ['br', 1340 * .42, .3]].forEach(([id, h, d]) => {{ const p = easeOutBack(clamp((t - L[9] - .1 - d) / .7)); const hh = Math.max(.01, h * p); bar(id, hh, 300, 300)
    const l = $(id + '-l'); l.style.top = (-hh - 190) + 'px'; l.style.opacity = clamp(p * 2); l.style.transform = 'translateZ(160px)' }})
}}
if (show('end', t, L[10] - .05, 999)) {{ const l = prog(t, L[10], L[10] + .6); $('end-logo').style.transform = `translateY(${{(1 - easeOutBounce(l)) * -300}}px)` }}
"""
    cues = [['whoosh', .2, .6, .3], ['thud', .5, .4], ['whoosh', r.W(0, 5), .6, .3], ['impact', r.W(0, 8) + .25, .6, 75],
            ['whoosh', r.L(1) - .3, 1.0, .5], ['pop', r.L(2) + .1, .3, 600], ['pop', r.W(2, 3) + .1, .3, 700], ['whoosh', r.L(3) + .1, .8, .3]] + \
           [['deal', a + .15, .5] for a in [r.L(4), r.L(5), r.L(6), r.L(7), r.L(8), r.L(8) + .25, r.L(8) + .5]] + \
           [['impact', r.W(8, 4) + .15, .5, 70], ['whoosh', r.L(9) - .3, .9, .4], ['thud', r.L(9) + .4, .4], ['thud', r.L(9) + .7, .5], ['laser', r.L(10) - .3, .5], ['impact', r.L(10) + .1, .3, 50]]
    save('09', page(r, body, js, heads_html, end_html, END), cues)
    return END


# ---------------------------------------------------------------- 10: the worst hour
def reel10():
    r = R('10'); L, W = r.L, r.W
    END = r.end() + 0.9
    A = SH + 'analytics-full.png'
    HOURS = {9: 710, 10: 620, 11: 290, 13: -70, 14: 150, 15: -105, 19: -120, 20: -800, 21: -270, 22: -150}
    bars = ''
    for h in range(24):
        v = HOURS.get(h, 0)
        color = '#3ecf8e' if v > 0 else '#f2555a' if v < 0 else '#3a3a3a'
        lab = f'<div class="hl2" id="hl{h}">{h:02d}</div>'
        bars += f'<div class="hb" id="hw{h}" style="position:absolute;left:0;top:0">{bar_html(f"hb{h}", color)}{lab}</div>'
    ticks = ''.join(f'<div style="position:absolute;left:-2px;top:-300px;width:4px;height:{36 if k % 6 == 0 else 18}px;background:{"#ededed" if k % 6 == 0 else "#555"};transform-origin:2px 300px;transform:rotate({k * 15}deg)"></div>' for k in range(24))
    body = f"""<style>.scene .tag3d, .scene .tag3d *, .scene .hl2, .scene .card3, .scene .card3 * {{ transform-style:flat }} .card3 {{ position:absolute; left:0; top:0 }}
.hl2 {{ position:absolute; left:-30px; width:60px; top:24px; text-align:center; font:700 26px 'JetBrains Mono', monospace; color:#a0a0a0 }}</style>
<div id="s0" class="layer stage3d" style="opacity:1;perspective:1300px;perspective-origin:540px 860px">
  <div class="scene" id="sc0">
    <div id="dial" style="position:absolute;left:0;top:0">
      <div style="position:absolute;left:-320px;top:-320px;width:640px;height:640px;border-radius:50%;border:4px solid #2e2e2e;background:radial-gradient(#1a1a1a,#121212);box-shadow:0 40px 120px -20px #000, 0 0 80px -20px #f2555a66"></div>
      {ticks}
      <svg style="position:absolute;left:-320px;top:-320px;width:640px;height:640px;overflow:visible" viewBox="-320 -320 640 640"><path id="arc" fill="none" stroke="#f2555a" stroke-width="14" stroke-linecap="round" style="filter:drop-shadow(0 0 14px #f2555a)"/></svg>
      <div id="hand" style="position:absolute;left:-5px;top:-250px;width:10px;height:250px;border-radius:5px;background:#ededed;transform-origin:5px 250px;box-shadow:0 0 20px #fff8"></div>
      <div id="clk" style="position:absolute;left:-300px;width:600px;top:70px;text-align:center;font:800 120px 'JetBrains Mono', monospace;letter-spacing:-.04em;color:#ededed;transform:translateZ(40px)">00:00</div>
    </div>
  </div>
</div>
<div id="s1" class="layer stage3d" style="perspective:1300px;perspective-origin:540px 900px">
  <div class="scene" id="sc1f"><div style="position:absolute;left:-1700px;top:-1700px;width:3400px;height:3400px;transform:translateY(0px) rotateX(90deg);background-image:radial-gradient(closest-side,#12121200 40%,#121212 100%),linear-gradient(#3ecf8e26 2px, transparent 2px),linear-gradient(90deg, #3ecf8e26 2px, transparent 2px);background-size:100% 100%,100px 100px,100px 100px"></div></div>
  <div class="scene" id="sc1">
    <div class="card3" id="panel" style="opacity:0">{crop('pnc', A, 272, 3516, 1136, 245, '', 12, 'position:relative')}</div>
    {bars}
    {tag('t20', 'r', '20:00', '−$800.00', 'font-size:72px')}
    {tag('t09', 'g', '09:00', '+$710.00', 'font-size:72px')}
  </div>
</div>
<div id="s2" class="layer stage3d" style="perspective:1400px;perspective-origin:540px 900px"><div style="position:absolute;left:0;right:0;top:0;height:600px;background:linear-gradient(#121212f2 60%,#12121200);z-index:2"></div>
  <div class="scene" id="sc2">
    {win('w2', '#/analytics', A)}
    <div class="card3" id="mh" style="opacity:0">{crop('mhc', A, 297, 990, 512, 62, 'r', 10, 'position:relative')}</div>
  </div>
</div>
<div style="position:absolute;inset:0;perspective:900px;perspective-origin:540px 1100px;transform-style:preserve-3d;pointer-events:none;z-index:5">{ext('slam', '−$800', '#f2555a', 1090, '', 220)}</div>
"""
    heads_html = h1s(['Las 8 de la noche<br>te costaron <span class="r">$800</span> este mes.', 'Mes de demostración.<br>PnL por hora de entrada.', '8 de la noche:<br><span class="r">−$800.</span>',
                      '9 de la mañana:<br><span class="g">+$710.</span>', 'Mismo trader.<br>Mismo mercado.', 'Solo cambia<br><span class="g">la hora.</span>',
                      'Tiltless marca las operaciones<br>en tu <span class="r">mala hora.</span>'])
    end_html = build.end_card('Encuentra<br><span class="g">tu hora.</span>', DEMO_SMALL)
    js = f"""
const L = {json.dumps([l['s'] for l in r.lines])}
const HOURS = {json.dumps(HOURS)}
labels(t, [[0, ''], [L[1] - .1, '<b>PnL por hora de entrada</b> · demo'], [L[6] - .1, '<b>Costo de los errores</b> · demo'], [L[7] - .1, '']])
heads(t, [[.3, 'hd0'], [L[1] - .1, 'hd1'], [L[2] - .1, 'hd2'], [L[3] - .1, 'hd3'], [L[4] - .1, 'hd4'], [L[5] - .1, 'hd5'], [L[6] - .1, 'hd6'], [L[7] - .1, null]])
$('flash').style.opacity = flashAt(t, [[{W(0, 7)} + .1, .2], [{W(2, 4)} + .05, .12]])

// A 24-hour dial winds to 20:00 and −$800 slams in.
if (show('s0', t, 0, L[1] - .05, .2)) {{
  const c = track([[0, {{ x: 0, y: -40, z: -700, rx: 18, ry: -24, rz: 0 }}], [2.2, {{ x: 0, y: -40, z: -520, rx: 10, ry: 8, rz: 0 }}], [L[1], {{ x: 0, y: -40, z: -300, rx: 6, ry: 16, rz: 0 }}]], t)
  $('sc0').style.transform = camCss(c)
  const p = ease(clamp((t - .3) / 1.9)), hours = 20 * p, ang = hours * 15
  $('hand').style.transform = `rotate(${{ang}}deg) translateZ(20px)`
  const r0 = 280, a = ang * Math.PI / 180, x = r0 * Math.sin(a), y = -r0 * Math.cos(a)
  $('arc').setAttribute('d', ang < .5 ? '' : `M 0 ${{-r0}} A ${{r0}} ${{r0}} 0 ${{ang > 180 ? 1 : 0}} 1 ${{x}} ${{y}}`)
  const hh = Math.floor(hours), mm = Math.floor((hours - hh) * 60); $('clk').textContent = `${{String(hh).padStart(2, '0')}}:${{String(mm).padStart(2, '0')}}`
  $('clk').style.color = p >= 1 ? '#f2555a' : '#ededed'; $('clk').style.textShadow = p >= 1 ? '0 0 40px #f2555a' : 'none'
  const at = {W(0, 7)}, q = clamp((t - at) / .3), el = $('slam')
  el.style.opacity = clamp(q * 3) * (1 - clamp((t - L[1] + .2) / .25)); el.style.transform = `translateZ(${{(1 - easeOutBack(q)) * 800}}px)`; el.style.filter = `blur(${{(1 - q) * 12}}px)`
  const [sx, sy] = shake(t, at + .25, .3, 16); $('s0').style.transform = `translate(${{sx}}px, ${{sy}}px)`
}} else $('slam').style.opacity = 0

// 24 blocks rise (profit) or sink (loss) from a glass floor.
if (show('s1', t, L[1] - .1, L[6] - .05, .2)) {{
  const X = (h) => (h - 11.5) * 92
  const c = track([
    [L[1] - .1, {{ x: 0, y: -100, z: -1300, rx: -40, ry: 0, rz: 0 }}],
    [L[1] + 1.2, {{ x: 0, y: -60, z: -1100, rx: -18, ry: -10, rz: 0 }}, 'expo'],
    [L[2], {{ x: 120, y: -40, z: -1000, rx: -16, ry: -12, rz: 0 }}],
    [L[2] + .7, {{ x: X(20), y: 120, z: -160, rx: -14, ry: -26, rz: 0 }}, 'expo'],
    [L[3], {{ x: X(20), y: 100, z: -180, rx: -14, ry: -22, rz: 0 }}],
    [L[3] + .7, {{ x: X(9), y: -160, z: -200, rx: -16, ry: 24, rz: 0 }}, 'expo'],
    [L[4], {{ x: X(9), y: -150, z: -220, rx: -16, ry: 20, rz: 0 }}],
    [L[4] + 1.2, {{ x: 0, y: -40, z: -1150, rx: -24, ry: -30, rz: 0 }}],
    [L[6], {{ x: 0, y: -40, z: -1200, rx: -26, ry: 30, rz: 0 }}],
  ], t)
  $('sc1').style.transform = $('sc1f').style.transform = camCss(c)
  const pp = easeOutBack(clamp((t - L[1]) / .5)), pg = clamp((t - L[1] - 1.2) / .4)
  $('panel').style.opacity = clamp(pp * 3) * (1 - pg); $('panel').style.transform = `translate3d(-580px, -420px, ${{100 - pg * 200}}px) scale(1.0)`
  for (let h = 0; h < 24; h++) {{
    const v = HOURS[h] || 0, p = easeOutBack(clamp((t - L[1] - 1.1 - h * .045) / .6)), hh = Math.max(4, Math.abs(v) * .42) * p
    bar('hb' + h, hh, 64, 64)
    const el = $('hw' + h); el.style.transform = `translate3d(${{X(h)}}px, ${{v < 0 ? hh : 0}}px, 0)`; el.style.opacity = p > 0 ? 1 : 0
    $('hl' + h).style.top = (v < 0 ? -hh - 50 : 24) + 'px'; $('hl' + h).style.transform = `translateZ(40px) rotateX(${{-c.rx}}deg)`
  }}
  const on20 = clamp((t - {W(2, 4)}) / .2), on9 = clamp((t - {W(3, 4)}) / .2), pulse = t > L[5] ? .5 + .5 * Math.sin(t * 9) : 1
  $('hb20').children[0].style.boxShadow = `0 0 ${{40 + on20 * 90 * pulse}}px #f2555a${{on20 > .5 ? 'ee' : '55'}}`
  $('hb9').children[0].style.boxShadow = `0 0 ${{40 + on9 * 90 * pulse}}px #3ecf8e${{on9 > .5 ? 'ee' : '55'}}`
  const a = easeOutBack(clamp((t - {W(2, 4)}) / .5)), b = easeOutBack(clamp((t - {W(3, 4)}) / .5))
  $('t20').style.opacity = clamp(a * 3); $('t20').style.transform = `translate3d(${{X(20) - 230}}px, ${{-80 - a * 60}}px, 120px) rotateY(${{-c.ry}}deg) rotateX(${{-c.rx}}deg)`
  $('t09').style.opacity = clamp(b * 3); $('t09').style.transform = `translate3d(${{X(9) - 230}}px, ${{-430 - b * 60}}px, 120px) rotateY(${{-c.ry}}deg) rotateX(${{-c.rx}}deg)`
}}

// Back in the app: the "Mala hora" row of the mistakes table comes forward.
if (show('s2', t, L[6] - .1, L[7] - .05, .2)) {{
  $('w2-img').style.transform = 'translateY(-810px)'
  const c = track([[L[6] - .1, {{ x: 720, y: 472, z: -1300, rx: 30, ry: 30, rz: 4 }}], [L[6] + .8, {{ x: 560, y: 250, z: -60, rx: 6, ry: -10, rz: 0 }}, 'expo'], [L[7], {{ x: 560, y: 250, z: 0, rx: 8, ry: -16, rz: 0 }}]], t)
  $('sc2').style.transform = camCss(c)
  const p = easeOutBack(clamp((t - {W(6, 1)}) / .5)); $('mh').style.opacity = clamp(p * 3)
  $('mh').style.transform = `translate3d(${{289}}px, ${{44 + 990 - 810 - 10}}px, ${{p * 320}}px) scale(${{1 + p * .2}})`
  $('w2').style.filter = `brightness(${{1 - p * .45}}) blur(${{p * 3}}px)`
}}
if (show('end', t, L[7] - .05, 999)) {{ const l = prog(t, L[7], L[7] + .6); $('end-logo').style.transform = `translateY(${{(1 - easeOutBounce(l)) * -300}}px)` }}
"""
    cues = [['whoosh', .2, 2.0, .9], ['typing', .3, .09, 20], ['impact', r.W(0, 7) + .25, .6, 75], ['whoosh', r.L(1) - .3, 1.2, .5]] + \
           [['thud', r.L(1) + 1.1 + h * .045 * 4, .3] for h in range(6)] + \
           [['whoosh', r.L(2), .7, .4], ['impact', r.W(2, 4) + .1, .4, 65], ['whoosh', r.L(3), .7, .4], ['pop', r.W(3, 4) + .1, .3, 800],
            ['whoosh', r.L(4) + .1, 1.1, .4], ['whoosh', r.L(6) - .3, .9, .4], ['pop', r.W(6, 1) + .1, .3, 600], ['laser', r.L(7) - .3, .5], ['impact', r.L(7) + .1, .3, 50]]
    save('10', page(r, body, js, heads_html, end_html, END), cues)
    return END


for n in argv:
    print(n, round({'08': reel08, '09': reel09, '10': reel10}[n](), 2))
