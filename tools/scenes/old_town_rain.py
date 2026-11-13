#!/usr/bin/env python3
"""Original night view (calm: no lightning or flicker) over the tiled roofs of an old town in a rainstorm. Loops every T seconds.

Seen from a high roof: rows of kawara-tiled houses with lit paper windows and shop signs,
a bathhouse chimney, a pagoda on a hill, a far city skyline, power lines, rain at three
depths, splashes and drips on the roofs, wet roofs catching the neon, mist and lightning.
Needs: pycairo, numpy, scipy, ffmpeg.   python3 old_town_rain.py out.mp4 [--still N]
"""
import math, random, subprocess, sys
import numpy as np
import cairo
from scipy.ndimage import gaussian_filter, zoom

W, H, FPS, T = 1920, 1080, 30, 12
TAU = math.pi * 2
OUT = sys.argv[1] if len(sys.argv) > 1 else 'old_town.mp4'
STILL = '--still' in sys.argv
F, VPX, VPY, CAM = 1000.0, 960.0, 300.0, 17.0
FONT = 'Noto Sans CJK JP'
R = random.Random(8)
HAZE = '#1b1632'


def P(X, Y, Z):
    return (VPX + F * X / Z, VPY + F * (CAM - Y) / Z)


def rgb(hx, a=1.0):
    hx = hx.lstrip('#')
    return tuple(int(hx[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (a,)


def mix(h1, h2, f):
    a = rgb(h1) if isinstance(h1, str) else h1
    b = rgb(h2) if isinstance(h2, str) else h2
    return tuple(a[i] * (1 - f) + b[i] * f for i in range(3))


def fog(Z):
    return 1 - math.exp(-Z / 120)


def surf():
    s = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    g = cairo.Context(s); g.set_line_join(cairo.LINE_JOIN_ROUND)
    return s, g


def to_np(s):
    s.flush()
    a = np.ndarray((H, W, 4), np.uint8, buffer=s.get_data()).astype(np.float32) / 255
    return a[..., [2, 1, 0]].copy(), a[..., 3].copy()


def poly(g, pts):
    g.move_to(*pts[0])
    for p in pts[1:]: g.line_to(*p)
    g.close_path()


def noise(h, w, scale, seed, octaves=4):
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32); amp = 1; tot = 0
    for o in range(octaves):
        sh, sw = max(2, int(h / scale) + 2), max(2, int(w / scale) + 2)
        big = zoom(rng.random((sh, sw)).astype(np.float32), (h / sh + 1e-3, w / sw + 1e-3), order=3)[:h, :w]
        big = np.pad(big, ((0, h - big.shape[0]), (0, w - big.shape[1])), mode='edge')
        out += big * amp; tot += amp; amp *= .5; scale /= 2
    return out / tot


base_s, base = surf()                     # unlit surfaces
roof_s, roofm = surf()                    # where wet roof tiles are (they catch the light)
GROUPS = ('steady', 'flickA', 'blinkB', 'lantern', 'warn', 'tv', 'bolt', 'uplight')
EMIT = {k: surf() for k in GROUPS}


def occlude(pts):
    for s, g in EMIT.values():
        g.save(); g.set_operator(cairo.OPERATOR_DEST_OUT); poly(g, pts); g.set_source_rgba(0, 0, 0, 1); g.fill(); g.restore()
    roofm.save(); roofm.set_operator(cairo.OPERATOR_DEST_OUT); poly(roofm, pts); roofm.set_source_rgba(0, 0, 0, 1); roofm.fill(); roofm.restore()


def solid(pts, color, Z, roof=0.0, dark=.92):
    poly(base, pts); base.set_source_rgba(*mix(color, HAZE, fog(Z) * dark), 1); base.fill()
    occlude(pts)
    if roof:
        poly(roofm, pts); roofm.set_source_rgba(1, 1, 1, roof * (1 - fog(Z) * .6)); roofm.fill()


def line3(g, a, b, color, width, alpha=1):
    g.move_to(*P(*a)); g.line_to(*P(*b)); g.set_source_rgba(*mix(color, HAZE, fog(a[2]) * .9), alpha); g.set_line_width(width); g.stroke()


def emit(group, fn):
    fn(EMIT[group][1])


# ------------------------------------------------------------------ sky, skyline, hill + pagoda
sky_s, sky = surf()
gr = cairo.LinearGradient(0, 0, 0, VPY + 60)
gr.add_color_stop_rgb(0, *rgb('#06051a')[:3]); gr.add_color_stop_rgb(.65, *rgb('#1b1236')[:3]); gr.add_color_stop_rgb(1, *rgb('#4d2350')[:3])
sky.set_source(gr); sky.paint()
x = 120
while x < 520:   # city towers far away on the right
    w = R.uniform(14, 34); hgt = R.uniform(60, 210); Z = R.uniform(650, 800)
    (x0, y0), (x1, y1) = P(x, hgt, Z), P(x + w, -40, Z)
    sky.rectangle(x0, y0, x1 - x0, y1 - y0); sky.set_source_rgb(*mix('#120e24', '#3b2350', .3)); sky.fill()
    for wy in np.arange(4, hgt - 4, 4.5):
        for wx in np.arange(x + 2, x + w - 2, 3):
            if R.random() < .3:
                (a, b), (c, d) = P(wx, wy + 1.6, Z), P(wx + 1.4, wy, Z)
                sky.rectangle(a, b, max(1, c - a), max(1, d - b)); sky.set_source_rgba(*rgb(R.choice(['#ffd9a0', '#bfe3ff']), .45)); sky.fill()
    if R.random() < .7:
        cx = (x0 + x1) / 2
        EMIT['warn'][1].arc(cx, y0 - 2, 2.5, 0, TAU); EMIT['warn'][1].set_source_rgb(1, .15, .1); EMIT['warn'][1].fill()
    x += w + R.uniform(-4, 12)
clouds = noise(H, W, 460, 3, 5)
clouds = np.clip((clouds - .42) * 2.2, 0, 1) * np.linspace(1, .3, H)[:, None]

# wooded hill with a five-storey pagoda, softly lit from below
HZ = 260
hill = [P(-260, -10, HZ)] + [P(X, 30 * math.exp(-((X + 110) / 70) ** 2) + 6 * math.sin(X / 9), HZ) for X in range(-260, 60, 4)] + [P(60, -10, HZ)]
solid(hill, '#14121f', HZ, dark=.6)
for k in range(140):   # tree bumps along the ridge
    X = R.uniform(-240, 40); Y = 30 * math.exp(-((X + 110) / 70) ** 2) + 6 * math.sin(X / 9)
    cx, cy = P(X, Y, HZ); r = R.uniform(4, 10)
    base.arc(cx, cy, r, 0, TAU); base.set_source_rgb(*mix('#121a18', HAZE, .55)); base.fill()
px, py0 = -110, 30
for i in range(5):
    wv = 9 - i * 1.3; yb = py0 + i * 4.2
    solid([P(px - wv * .45, yb, HZ), P(px + wv * .45, yb, HZ), P(px + wv * .45, yb + 2.4, HZ), P(px - wv * .45, yb + 2.4, HZ)], '#2a1f22', HZ, dark=.5)
    solid([P(px - wv * .9, yb + 2.2, HZ), P(px + wv * .9, yb + 2.2, HZ), P(px + wv * .55, yb + 4.2, HZ), P(px - wv * .55, yb + 4.2, HZ)], '#18161f', HZ, dark=.5)
    def up(g, wv=wv, yb=yb):
        poly(g, [P(px - wv * .45, yb, HZ), P(px + wv * .45, yb, HZ), P(px + wv * .45, yb + 2.2, HZ), P(px - wv * .45, yb + 2.2, HZ)])
        g.set_source_rgba(*mix('#ff9a4a', HAZE, .35), .55); g.fill()
    emit('uplight', up)
line3(base, (px, py0 + 21, HZ), (px, py0 + 29, HZ), '#18161f', 2.5)

# lightning bolt (only seen during the flash)
bg = EMIT['bolt'][1]
bx, by = 1430, -10
pts = [(bx, by)]
while by < 245:
    bx += R.uniform(-28, 22); by += R.uniform(14, 30); pts.append((bx, by))
for lw, a in ((9, .25), (4, .6), (1.6, 1)):
    bg.move_to(*pts[0]); [bg.line_to(*p) for p in pts[1:]]; bg.set_source_rgba(.85, .85, 1, a); bg.set_line_width(lw); bg.stroke()
bx, by = pts[4]
bg.move_to(bx, by)
for _ in range(5):
    bx += R.uniform(8, 26); by += R.uniform(10, 22); bg.line_to(bx, by)
bg.set_source_rgba(.85, .85, 1, .7); bg.set_line_width(1.4); bg.stroke()

# ------------------------------------------------------------------ the town
SIGN_WORDS = [('旅館', 'box', '#fff1d8', '#7a1e1e'), ('そば', 'neon', '#ff4a5a', None), ('喫茶', 'neon', '#55e6ff', None), ('酒', 'box', '#ff4f45', '#fff4e6'),
              ('質', 'box', '#f4f0e6', '#1c2a6b'), ('たばこ', 'box', '#d63a3a', '#ffffff'), ('理容', 'neon', '#ff6fd0', None), ('薬', 'box', '#e8fff1', '#0f6b3a'),
              ('食堂', 'neon', '#ffd04a', None), ('スナック', 'neon', '#b26bff', None)]
ROOF_COLS = ['#262b3a', '#2a2f40', '#232733', '#2d3140', '#3a2a24', '#203238']
WALL_COLS = ['#3a322d', '#2e2621', '#433d38', '#28211d', '#36332f']
signs_left = list(range(len(SIGN_WORDS)))
splash_pts, drip_pts = [], []


def shoji(g, q, cc, lines=True):
    poly(g, q); g.set_source_rgba(*cc, .95); g.fill()
    if lines:
        (x0, y0), (x1, _), (_, y1) = q[0], q[1], q[2]
        g.set_source_rgba(.12, .07, .04, .55); g.set_line_width(max(.6, (x1 - x0) / 30))
        for k in (1, 2, 3):
            xx = x0 + (x1 - x0) * k / 4; g.move_to(xx, y0); g.line_to(xx, y1); g.stroke()
        for k in (1, 2):
            yy = y0 + (y1 - y0) * k / 3; g.move_to(x0, yy); g.line_to(x1, yy); g.stroke()


def vertical_sign(xc, ytop, Z, text, style, color, tcol, group):
    wv = .85; hv = .78 * len(text) + .55
    (x0, y0), (x1, y1) = P(xc - wv / 2, ytop, Z), P(xc + wv / 2, ytop - hv, Z)
    w = x1 - x0; hz = fog(Z) * .45
    def draw(g):
        poly(g, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
        cc = mix(color, HAZE, hz)
        g.select_font_face(FONT, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD); size = w * .7; g.set_font_size(size)
        if style == 'box':
            g.set_source_rgb(*cc); g.fill(); tc = mix(tcol, HAZE, hz * .6)
        else:
            g.set_source_rgba(.06, .05, .08, 1); g.fill_preserve(); g.set_source_rgba(*cc, .9); g.set_line_width(max(.8, w * .04)); g.stroke(); tc = cc
        step = (y1 - y0 - w * .4) / len(text)
        for i, ch in enumerate(text):
            e = g.text_extents(ch)
            g.move_to((x0 + x1) / 2 - e.x_bearing - e.width / 2, y0 + w * .2 + step * (i + .5) - e.y_bearing - e.height / 2)
            g.text_path(ch)
            if style == 'box': g.set_source_rgb(*tc); g.fill()
            else:
                g.set_source_rgb(*tc); g.set_line_width(max(1, size * .08)); g.stroke_preserve()
                g.set_source_rgba(1, 1, 1, .8); g.set_line_width(max(.5, size * .03)); g.stroke()
    emit(group, draw)


def house(x0, x1, z0, z1, e, r, kind, roofc, wallc):
    ov = .5; xc, zc = (x0 + x1) / 2, (z0 + z1) / 2
    # visible side wall
    for X, vis in ((x1, x1 < 0), (x0, x0 > 0)):
        if vis:
            q = [P(X, 0, z0), P(X, e, z0), P(X, e, z1), P(X, 0, z1)]
            solid(q, mix(wallc, '#000000', .35), z0)
            if kind == 'A':
                solid([P(X, e, z0), P(X, e + r, zc), P(X, e, z1)], mix(wallc, '#000000', .3), z0)
    # front wall + windows
    solid([P(x0, 0, z0), P(x1, 0, z0), P(x1, e, z0), P(x0, e, z0)], wallc, z0)
    if kind == 'B':
        solid([P(x0, e, z0), P(xc, e + r, z0), P(x1, e, z0)], mix(wallc, '#000000', .15), z0)
        if R.random() < .35:   # little round window in the gable
            cx, cy = P(xc, e + r * .35, z0); rr = .35 * F / z0
            emit('steady', lambda g: (g.arc(cx, cy, rr, 0, TAU), g.set_source_rgba(*mix('#ffc070', HAZE, fog(z0) * .5), .9), g.fill()))
    for fl in range(int(e // 2.6)):
        y0w = fl * 2.6 + .9
        for wx in np.arange(x0 + .6, x1 - 1.3, 2.2):
            q = [P(wx, y0w + 1.2, z0), P(wx + 1.3, y0w + 1.2, z0), P(wx + 1.3, y0w, z0), P(wx, y0w, z0)]
            u = R.random()
            if u < .5:
                warm = R.choice(['#ffcf8a', '#ffb870', '#ffe0a8', '#ffc48a'])
                cc = tuple(v * .95 for v in mix(warm, HAZE, fog(z0) * .5))
                emit('steady', lambda g, q=q, cc=cc: shoji(g, q, cc, z0 < 70))
            elif u < .48:
                emit('tv', lambda g, q=q: shoji(g, q, mix('#7fb2ff', HAZE, fog(z0) * .5), False))
            else:
                solid(q, '#15131c', z0)
    # lantern by a door, shop sign on the front
    if R.random() < .3 and z0 < 90:
        cx, cy = P(x0 + .9, min(e, 3.2) - .6, z0 - .2); rr = .24 * F / z0
        def lan(g, cx=cx, cy=cy, rr=rr):
            g.save(); g.translate(cx, cy); g.scale(1, 1.25)
            gg = cairo.RadialGradient(-rr * .2, -rr * .2, 0, 0, 0, rr)
            gg.add_color_stop_rgb(0, 1, .78, .45); gg.add_color_stop_rgb(.7, .95, .22, .12); gg.add_color_stop_rgb(1, .5, .06, .05)
            g.arc(0, 0, rr, 0, TAU); g.set_source(gg); g.fill(); g.restore()
        emit('lantern', lan)
    if signs_left and 14 < z0 < 110 and abs(xc) < z0 * .8 and R.random() < .45 and x1 - x0 > 3:
        i = signs_left.pop(R.randrange(len(signs_left)))
        text, style, colr, tcol = SIGN_WORDS[i]
        grp = 'flickA' if text == 'そば' else 'blinkB' if text == 'スナック' else 'steady'
        vertical_sign(x1 - .7, e + (r * .2 if kind == 'B' else -.1), z0 - .3, text, style, colr, tcol, grp)
    # roof
    rf = lambda pts, sh: solid(pts, mix(roofc, '#000000', sh), z0, roof=1)
    if kind == 'A':
        back = [P(x0 - ov, e, z1 + ov), P(x1 + ov, e, z1 + ov), P(x1 + ov, e + r, zc), P(x0 - ov, e + r, zc)]
        front = [P(x0 - ov, e, z0 - ov), P(x1 + ov, e, z0 - ov), P(x1 + ov, e + r, zc), P(x0 - ov, e + r, zc)]
        rf(back, .35); rf(front, 0)
        for tx in np.arange(x0 - ov + .25, x1 + ov, .32):   # rows of tiles
            line3(base, (tx, e, z0 - ov), (tx, e + r, zc), '#0a0b10', max(.5, 22 / z0), .55)
        line3(base, (x0 - ov, e + r, zc), (x1 + ov, e + r, zc), '#4a4f5e', max(1, 70 / z0))       # ridge
        line3(base, (x0 - ov, e, z0 - ov), (x1 + ov, e, z0 - ov), '#8a90a8', max(.6, 18 / z0), .5)  # wet eave edge
        for _ in range(int((x1 - x0) * 1.2)):
            u, v = R.random(), R.random()
            splash_pts.append((x0 + (x1 - x0) * u, e + r * v, z0 - ov + (zc - z0 + ov) * v))
        for tx in np.arange(x0, x1, 1.4):
            drip_pts.append((tx + R.uniform(0, .8), e, z0 - ov))
    else:
        left = [P(x0 - ov, e, z0 - ov), P(xc, e + r, z0 - ov), P(xc, e + r, z1 + ov), P(x0 - ov, e, z1 + ov)]
        right = [P(x1 + ov, e, z0 - ov), P(xc, e + r, z0 - ov), P(xc, e + r, z1 + ov), P(x1 + ov, e, z1 + ov)]
        first, second = (right, left) if xc > 0 else (left, right)
        rf(first, .3); rf(second, .05)
        for tz in np.arange(z0 - ov + .3, z1 + ov, .32 * max(1, z0 / 25)):
            for xe in (x0 - ov, x1 + ov):
                line3(base, (xe, e, tz), (xc, e + r, tz), '#0a0b10', max(.5, 20 / z0), .4)
        line3(base, (xc, e + r, z0 - ov), (xc, e + r, z1 + ov), '#4a4f5e', max(1, 70 / z0))
        for xe in (x0 - ov, x1 + ov):   # barge boards
            line3(base, (xe, e, z0 - ov), (xc, e + r, z0 - ov), '#3a2a22', max(1, 60 / z0))
        for _ in range(int((x1 - x0) * 1.2)):
            u = R.random(); xe = x0 - ov if (xc > 0) else x1 + ov
            Xs = xe + (xc - xe) * u; splash_pts.append((Xs, e + r * u, R.uniform(z0, z1)))


def flat_block(x0, x1, z0, z1, h):
    """A plain three-storey concrete building with a water tank on top."""
    for X, vis in ((x1, x1 < 0), (x0, x0 > 0)):
        if vis: solid([P(X, 0, z0), P(X, h, z0), P(X, h, z1), P(X, 0, z1)], '#2c2b33', z0)
    solid([P(x0, h, z0), P(x1, h, z0), P(x1, h, z1), P(x0, h, z1)], '#2d2c33', z0, roof=.6)
    solid([P(x0, 0, z0), P(x1, 0, z0), P(x1, h, z0), P(x0, h, z0)], '#3a3940', z0)
    for fl in range(int(h // 3)):
        for wx in np.arange(x0 + .5, x1 - 1, 1.8):
            q = [P(wx, fl * 3 + 2.1, z0), P(wx + 1.1, fl * 3 + 2.1, z0), P(wx + 1.1, fl * 3 + .9, z0), P(wx, fl * 3 + .9, z0)]
            if R.random() < .45:
                cc = tuple(v * .7 for v in mix(R.choice(['#d8f0ff', '#ffe6b8', '#fff4dc']), HAZE, fog(z0) * .55))
                emit('steady', lambda g, q=q, cc=cc: shoji(g, q, cc, False))
            else: solid(q, '#17161d', z0)
    tx = x0 + (x1 - x0) * .7
    solid([P(tx - .9, h + 2.4, z0 + 2), P(tx + .9, h + 2.4, z0 + 2), P(tx + .9, h + .6, z0 + 2), P(tx - .9, h + .6, z0 + 2)], '#3a3a42', z0)
    line3(base, (tx - .7, h, z0 + 2), (tx - .7, h + .6, z0 + 2), '#2a2a30', max(1, 40 / z0))
    line3(base, (tx + .7, h, z0 + 2), (tx + .7, h + .6, z0 + 2), '#2a2a30', max(1, 40 / z0))


def antenna(x, y, z):
    line3(base, (x, y, z), (x, y + 2.2, z), '#0c0c12', max(.6, 25 / z))
    for k in range(4):
        line3(base, (x - .6 + k * .1, y + 1.4 + k * .25, z), (x + .6 - k * .1, y + 1.4 + k * .25, z), '#0c0c12', max(.5, 18 / z))


def billboard(xc, yb, Z, text, style, color, tcol, group):
    wv = 1.5 * len(text) + .8; hv = 2.0
    for px_ in (xc - wv * .35, xc + wv * .35):
        line3(base, (px_, yb - 3.2, Z + .1), (px_, yb, Z + .1), '#121118', max(1, 60 / Z))
    line3(base, (xc - wv * .4, yb - 1.2, Z + .1), (xc + wv * .4, yb - .8, Z + .1), '#121118', max(.8, 30 / Z))
    (x0, y0), (x1, y1) = P(xc - wv / 2, yb + hv, Z), P(xc + wv / 2, yb, Z)
    hz = fog(Z) * .4
    def draw(g):
        poly(g, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
        cc = mix(color, HAZE, hz)
        g.select_font_face(FONT, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        size = (y1 - y0) * .62; g.set_font_size(size)
        if style == 'box':
            g.set_source_rgb(*cc); g.fill(); tc = mix(tcol, HAZE, hz * .6)
        else:
            g.set_source_rgba(.05, .04, .07, 1); g.fill_preserve(); g.set_source_rgba(*cc, .95); g.set_line_width(max(1, size * .06)); g.stroke(); tc = cc
        e = g.text_extents(text)
        g.move_to((x0 + x1) / 2 - e.x_bearing - e.width / 2, (y0 + y1) / 2 - e.y_bearing - e.height / 2); g.text_path(text)
        if style == 'box': g.set_source_rgb(*tc); g.fill()
        else:
            g.set_source_rgb(*tc); g.set_line_width(max(1, size * .085)); g.stroke_preserve()
            g.set_source_rgba(1, 1, 1, .85); g.set_line_width(max(.5, size * .03)); g.stroke()
    emit(group, draw)


BILLBOARDS = sorted([(-9, 13.2, 27, 'ラーメン', 'neon', '#ff3a48', None, 'steady'), (14, 11.5, 41, 'カラオケ', 'neon', '#42ecff', None, 'steady'),
                     (-30, 11, 58, '居酒屋', 'neon', '#ff52b8', None, 'flickA'), (34, 11, 76, '旅館 さくら', 'box', '#fff0d6', '#8a1f2b', 'steady'),
                     (2, 11, 96, '喫茶', 'neon', '#ffd24a', None, 'steady'), (-60, 9.4, 120, '銭湯', 'box', '#f3efe6', '#1e3a7a', 'steady')], key=lambda b: -b[2])

# rows of houses, far → near; a few streets between rows show as warm glows
rows = []
z = 230
while z > 13:
    rows.append(z); z -= R.uniform(7.5, 10) * (1 + z / 160)
street_rows = set(rows[i] for i in range(1, len(rows), 3))
lamps = []
for zr in rows:
    while BILLBOARDS and BILLBOARDS[0][2] > zr + 7:
        billboard(*BILLBOARDS.pop(0))
    xmax = (VPX + 120) * zr / F + 10
    X = -xmax
    houses = []
    while X < xmax:
        wv = R.uniform(5, 9.5) * (1 + zr / 300)
        houses.append((X, X + wv)); X += wv + R.uniform(0, .5)
    # draw the houses farthest from the centre first so nearer ones overlap correctly
    for (a, b) in sorted(houses, key=lambda hb: -abs((hb[0] + hb[1]) / 2)):
        z0 = zr + R.uniform(0, 1.4); d = R.uniform(6, 8.5)
        if R.random() < .035 and 30 < zr < 120:
            flat_block(a, b, z0, z0 + d, R.choice([8.5, 9, 11.5]))
            continue
        e = R.choice([3.4, 5.6, 5.8, 6.0, 3.6]); r = R.uniform(1.7, 2.6) * (b - a) / 7
        house(a, b, z0, z0 + d, e, r, 'A' if R.random() < .6 else 'B', R.choice(ROOF_COLS), R.choice(WALL_COLS))
        if R.random() < .18 and zr < 100: antenna((a + b) / 2 + R.uniform(-1, 1), e + r * .9, z0 + d / 2)
    if zr in street_rows:
        for X in np.arange(-xmax, xmax, R.uniform(18, 26)):
            lamps.append((X + R.uniform(-3, 3), 4.6, zr - 1.4))
# street lamps glimpsed between rows (drawn where they peek over the roofs in front)
for (X, Y, Z) in lamps:
    cx, cy = P(X, Y, Z)
    emit('steady', lambda g, cx=cx, cy=cy, Z=Z: (g.arc(cx, cy, min(5, max(1.2, 140 / Z)), 0, TAU), g.set_source_rgba(*mix('#ffe2a8', HAZE, fog(Z) * .5), .8), g.fill()))

# bathhouse chimney with its sign and warning light
cxw, czw = -24, 48
(ax, ay), (bx2, by2) = P(cxw - .9, 24, czw), P(cxw + .9, 0, czw)
solid([(ax, ay), (bx2, ay), (bx2 + 3, by2), (ax - 3, by2)], '#5a2e26', czw)
for yy in np.arange(1, 24, 1.1):
    line3(base, (cxw - 1, yy, czw - .1), (cxw + 1, yy, czw - .1), '#2a1612', 1, .35)
vertical_sign(cxw, 17, czw - .5, 'ゆ', 'box', '#f6efe6', '#c0242c', 'steady')
emit('warn', lambda g: (g.arc(*P(cxw, 24.6, czw), 3.4, 0, TAU), g.set_source_rgb(1, .15, .1), g.fill()))

# power poles and sagging wires over the roofs
def wire(p, q, sag, w=1.0):
    pts = [P(p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u - sag * 4 * u * (1 - u), p[2] + (q[2] - p[2]) * u) for u in np.linspace(0, 1, 50)]
    base.move_to(*pts[0]); [base.line_to(*pt) for pt in pts[1:]]
    base.set_source_rgba(.02, .02, .04, .9); base.set_line_width(max(.7, w * 16 / min(p[2], q[2]))); base.stroke()
poles = [(-14, 30), (6, 36), (26, 31), (-34, 62), (40, 66)]
tops = []
for (X, Z) in poles:
    line3(base, (X, 0, Z), (X, 12, Z), '#121118', max(1.5, 220 / Z))
    line3(base, (X - 1.2, 11.2, Z), (X + 1.2, 11.2, Z), '#121118', max(1, 90 / Z))
    tops.append([(X - 1.1, 11.2, Z), (X, 11.4, Z), (X + 1.1, 11.2, Z)])
for a, b in ((0, 1), (1, 2), (0, 3), (2, 4)):
    for k in range(3): wire(tops[a][k], tops[b][k], 1.2)
for k in range(3): wire(tops[1][k], (8 + k, 12, 14), .7); wire(tops[0][k], (-30, 10.5, 15), .8)

# our own roof in the foreground (bottom left), tiles running away from us
FZ0, FZ1, FE = 3.2, 9.0, 11.2
fr = [P(-40, FE + 2.6, FZ0), P(1.5, FE + 2.6, FZ0), P(1.5, FE, FZ1), P(-40, FE, FZ1)]
solid(fr, '#262a36', FZ1, roof=1, dark=.0)
for tx in np.arange(-40, 1.5, .3):
    line3(base, (tx, FE + 2.6, FZ0), (tx, FE, FZ1), '#07080c', max(1, 300 / FZ1 * .3), .7)
for k in np.linspace(0, 1, 9)[1:-1]:   # tile courses
    zz = FZ0 + (FZ1 - FZ0) * k; yy = FE + 2.6 - 2.6 * k
    line3(base, (-40, yy, zz), (1.5, yy, zz), '#3a3f50', 1.5, .45)
solid([P(1.5, FE + 2.6, FZ0), P(1.9, FE + 2.6, FZ0), P(1.9, FE - .3, FZ1), P(1.5, FE - .3, FZ1)], '#2b1d17', FZ1, dark=0)     # barge board
solid([P(-40, FE, FZ1), P(1.9, FE, FZ1), P(1.9, FE - .35, FZ1), P(-40, FE - .35, FZ1)], '#1a1c25', FZ1, dark=0)
line3(base, (-40, FE, FZ1), (1.9, FE, FZ1), '#9aa2c0', 2, .5)
for _ in range(220):
    u, v = R.random(), R.random()
    splash_pts.append((-40 + 41.5 * u, FE + 2.6 * (1 - v), FZ0 + (FZ1 - FZ0) * v))
for tx in np.arange(-40, 1.5, .55):
    drip_pts.append((tx + R.uniform(0, .3), FE - .35, FZ1))

# ------------------------------------------------------------------ precompute
print('precomputing…', flush=True)
sky_rgb, _ = to_np(sky_s)
base_rgb, base_a = to_np(base_s)
_, roof_a = to_np(roof_s)
emits, bloom, bloomL = {}, {}, {}
for k in GROUPS:
    e_rgb, e_a = to_np(EMIT[k][0]); emits[k] = (e_rgb, e_a)
    bloom[k] = gaussian_filter(e_rgb, (4, 4, 0)) * .55 + gaussian_filter(e_rgb, (20, 20, 0)) * .55
    bloomL[k] = gaussian_filter(e_rgb, (75, 75, 0))
# wet tiles pick up a smeared copy of the lights around them
sheen = {k: gaussian_filter(bloomL[k] * 1.0 + gaussian_filter(emits[k][0], (14, 30, 0)) * .6, (6, 14, 0)) * roof_a[..., None] for k in GROUPS}
grime = .85 + .3 * noise(H, W, 70, 5, 4)
base_rgb *= grime[..., None]
mist = noise(H + 120, W + 120, 380, 11, 4)
mist_band = np.exp(-((np.arange(H + 120) - 60 - (VPY + 120)) / 200.0) ** 2)[:, None]
mist = (mist * mist_band).astype(np.float32)
NP = np.random.default_rng(1)
grain = [NP.normal(0, 1, (H, W)).astype(np.float32) for _ in range(6)]
vy, vx = np.mgrid[0:H, 0:W].astype(np.float32)
vign = (1 - .55 * np.clip(((vx - W / 2) / (W * .62)) ** 2 + ((vy - H * .5) / (H * .75)) ** 2, 0, 1) ** 1.3)[..., None]
roof_sky = (np.array([.022, .012, .04], np.float32) * np.clip(1.3 - (vy - VPY) / (H - VPY), .4, 1.3)[..., None]).astype(np.float32)
cloud_lit = clouds[..., None] * np.array([.3, .15, .33], np.float32)


def raindrops(n, speed, length, width, alpha, seed):
    r = random.Random(seed); span = H + length + 40
    v = max(1, round(speed * T / span)) * span / T
    return [(r.uniform(-200, W + 200), r.uniform(0, span), v, length * r.uniform(.7, 1.3), width, alpha * r.uniform(.5, 1), span) for _ in range(n)]


RAIN = raindrops(1000, 1300, 24, 1.0, .33, 1) + raindrops(450, 1900, 60, 1.6, .26, 2) + raindrops(110, 2600, 150, 2.6, .16, 3)
SLANT = .14
SPL = []
for i, (X, Y, Z) in enumerate(splash_pts):
    x, y = P(X, Y, Z)
    if -10 < x < W + 10 and 0 < y < H: SPL.append((x, y, F / Z, random.Random(i).randint(1, 6), random.Random(i * 3).random()))
DRIP = []
for i, (X, Y, Z) in enumerate(drip_pts):
    x, y = P(X, Y, Z)
    if 0 < x < W and 0 < y < H and Z < 60: DRIP.append((x, y, F / Z, random.Random(i).randint(3, 9), random.Random(i * 7).random()))


def flicker(t):
    u = (t / T) % 1
    for c, w in ((.21, .012), (.235, .02), (.62, .008), (.64, .03), (.66, .01)):
        if abs(u - c) < w / 2: return .1
    return .92 + .08 * math.sin(TAU * 37 * t / T)


def lightning(t):
    return 0.0   # calm version: no lightning (sudden flashes distract a class)
    v = 0
    for c, w, a in ((7.0, .07, 1), (7.18, .05, .6), (7.32, .18, .9)):
        if t >= c: v += a * math.exp(-(t - c) / w) * (t - c < 1.2)
    return v


def frame(i):
    t = i / FPS
    L = lightning(t)
    # everything changes slowly and smoothly: no flicker, blinking or flashes
    w = {'steady': 1.0, 'flickA': .9 + .1 * math.sin(TAU * t / T), 'blinkB': .8 + .2 * math.sin(TAU * 2 * t / T), 'lantern': .95 + .05 * math.sin(TAU * 3 * t / T),
         'warn': .45 + .45 * math.sin(TAU * 3 * t / T), 'tv': .78 + .1 * math.sin(TAU * 2 * t / T + 1), 'bolt': 0.0, 'uplight': 1.0}
    img = sky_rgb * (1 + 2.2 * L) + cloud_lit * (1 + 9 * L)
    img = base_rgb * (1 + .9 * L) + img * (1 - base_a[..., None])
    for k, (e_rgb, e_a) in emits.items():
        cover = e_a * min(1.0, w[k]) if k in ('bolt',) else e_a   # the bolt is only there while it flashes
        img = e_rgb * w[k] + img * (1 - cover[..., None])
    BL = sum(bloomL[k] * w[k] for k in GROUPS)
    img = img + sum(sheen[k] * w[k] for k in GROUPS) * 1.3 + roof_a[..., None] * (roof_sky + L * np.array([.25, .25, .35], np.float32))
    img = img + sum(bloom[k] * w[k] for k in GROUPS) + BL * .35
    ox = int(60 + 50 * math.cos(TAU * t / T)); oy = int(60 + 30 * math.sin(TAU * t / T))
    img = img + mist[oy:oy + H, ox:ox + W][..., None] * (np.array([.03, .02, .06], np.float32) + BL * .5) * (1 + 3 * L)
    rs = cairo.ImageSurface(cairo.FORMAT_A8, W, H); rg = cairo.Context(rs); rg.set_line_cap(cairo.LINE_CAP_ROUND)
    for (x0, y0, v, ln, lw, a, span) in RAIN:
        y = (y0 + v * t) % span - ln; x = x0 + SLANT * y
        rg.move_to(x, y); rg.line_to(x + SLANT * ln, y + ln); rg.set_source_rgba(0, 0, 0, a); rg.set_line_width(lw); rg.stroke()
    for (x, y, s, k, ph) in SPL:   # rain bouncing off the tiles
        u = (k * t / T + ph) % 1
        if u < .06:
            p = u / .06; r = s * .07 * (.4 + p)
            for d in (-1, 1):
                rg.move_to(x, y); rg.curve_to(x + d * r * .3, y - r * 1.4, x + d * r * .8, y - r * 1.2, x + d * r, y - r * .2 * (1 - p))
                rg.set_source_rgba(0, 0, 0, .5 * (1 - p)); rg.set_line_width(max(.6, s * .006)); rg.stroke()
    for (x, y, s, k, ph) in DRIP:  # drips running off the eaves
        u = (k * t / T + ph) % 1
        if u < .35:
            p = u / .35; dy = s * 2.4 * p * p
            rg.move_to(x, y + dy); rg.line_to(x + 1, y + dy + s * .09); rg.set_source_rgba(0, 0, 0, .7 * (1 - p * .6)); rg.set_line_width(max(.8, s * .012)); rg.stroke()
        if u < .5:
            rg.arc(x, y + 1, max(.8, s * .01), 0, TAU); rg.set_source_rgba(0, 0, 0, .5); rg.fill()
    rs.flush()
    ra = np.ndarray((H, rs.get_stride()), np.uint8, buffer=rs.get_data())[:, :W].astype(np.float32)[..., None] / 255
    img = img + ra * (np.array([.12, .12, .17], np.float32) + BL * 2.2 + L * .6)
    img = img * vign * np.array([1.0, .93, 1.07], np.float32) + np.array([.014, .008, .032], np.float32)
    img = 1 - np.exp(-img * 1.15)
    img = img + grain[i % len(grain)][..., None] * .012
    return (np.clip(img, 0, 1) * 255 + .5).astype(np.uint8)


if STILL:
    from PIL import Image
    Image.fromarray(frame(int(sys.argv[3]) if len(sys.argv) > 3 else 0)).save(OUT); sys.exit()

n = FPS * T
ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                       '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], stdin=subprocess.PIPE)
for i in range(n):
    ff.stdin.write(frame(i).tobytes())
    if i % 60 == 0: print(f'{i}/{n}', flush=True)
ff.stdin.close(); ff.wait()
print('done', OUT)
