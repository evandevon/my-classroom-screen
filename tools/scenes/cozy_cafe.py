#!/usr/bin/env python3
"""Original cozy café loop, drawn in code. Every motion repeats exactly every T seconds."""
import math, random, subprocess, sys
import cairo

W, H, FPS, T = 1920, 1080, 30, 20
TAU = math.pi * 2
OUT = sys.argv[1] if len(sys.argv) > 1 else 'cafe.mp4'
STILL = '--still' in sys.argv


def rgb(hx, a=1.0):
    hx = hx.lstrip('#')
    return tuple(int(hx[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (a,)


def col(g, hx, a=1.0):
    g.set_source_rgba(*rgb(hx, a))


def rrect(g, x, y, w, h, r):
    g.new_sub_path()
    g.arc(x + w - r, y + r, r, -math.pi / 2, 0)
    g.arc(x + w - r, y + h - r, r, 0, math.pi / 2)
    g.arc(x + r, y + h - r, r, math.pi / 2, math.pi)
    g.arc(x + r, y + r, r, math.pi, 3 * math.pi / 2)
    g.close_path()


def ellipse(g, cx, cy, rx, ry):
    g.save(); g.translate(cx, cy); g.scale(rx, ry); g.arc(0, 0, 1, 0, TAU); g.restore()


def lin(x0, y0, x1, y1, *stops):
    p = cairo.LinearGradient(x0, y0, x1, y1)
    for o, hx, *a in stops:
        p.add_color_stop_rgba(o, *rgb(hx, a[0] if a else 1))
    return p


def glow(g, x, y, r, hx, a):
    p = cairo.RadialGradient(x, y, 0, x, y, r)
    p.add_color_stop_rgba(0, *rgb(hx, a))
    p.add_color_stop_rgba(1, *rgb(hx, 0))
    g.set_source(p); g.arc(x, y, r, 0, TAU); g.fill()


def surface():
    s = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    return s, cairo.Context(s)


# ------------------------------------------------------------------ layout
WIN = (1000, 180, 700, 410)          # window x, y, w, h
WX, WY, WW, WH = WIN
SEAT_Y = WY + WH + 18                # top of the window seat cushion
FLOOR_Y = 770
rnd = random.Random(7)


def leaf(g, x, y, ang, ln, wd, hx, a=1):
    g.save(); g.translate(x, y); g.rotate(ang)
    g.move_to(0, 0); g.curve_to(ln * .3, -wd, ln * .7, -wd, ln, 0); g.curve_to(ln * .7, wd, ln * .3, wd, 0, 0)
    col(g, hx, a); g.fill_preserve(); col(g, '#2f5a3a', .35); g.set_line_width(1.2); g.stroke()
    g.move_to(0, 0); g.line_to(ln * .9, 0); col(g, '#e9f3d6', .25); g.set_line_width(1); g.stroke()
    g.restore()


def potted_plant(g, x, y, size, pot='#c96f4a', seed=1):
    r = random.Random(seed)
    for i in range(int(9 * size) + 6):
        ang = -math.pi / 2 + r.uniform(-1.25, 1.25)
        leaf(g, x + r.uniform(-8, 8) * size, y - 6 * size, ang, r.uniform(28, 46) * size, r.uniform(8, 12) * size,
             r.choice(['#5d9b5a', '#4f8a50', '#72ad62', '#3f7a48']))
    g.move_to(x - 22 * size, y - 8 * size); g.line_to(x + 22 * size, y - 8 * size)
    g.line_to(x + 16 * size, y + 26 * size); g.line_to(x - 16 * size, y + 26 * size); g.close_path()
    g.set_source(lin(x - 22 * size, 0, x + 22 * size, 0, (0, pot), (.6, pot), (1, '#8e4a30'))); g.fill()
    rrect(g, x - 25 * size, y - 13 * size, 50 * size, 9 * size, 3 * size); col(g, '#d9845d'); g.fill()


# ------------------------------------------------------------------ static room (window panes left clear)
def draw_room():
    s, g = surface()
    # wall
    g.set_source(lin(0, 60, 0, 650, (0, '#f2d3ae'), (1, '#e9b98f'))); g.rectangle(0, 60, W, 600); g.fill()
    # soft stripes in the wallpaper
    for x in range(0, W, 46):
        g.rectangle(x, 60, 18, 600); col(g, '#ffffff', .05); g.fill()
    # ceiling beams
    g.set_source(lin(0, 0, 0, 70, (0, '#4e3324'), (1, '#6e4a33'))); g.rectangle(0, 0, W, 70); g.fill()
    g.rectangle(0, 62, W, 10); col(g, '#3d281c'); g.fill()
    for x in range(-40, W, 320):
        g.move_to(x, 0); g.line_to(x + 60, 0); g.line_to(x + 48, 66); g.line_to(x + 12, 66); g.close_path(); col(g, '#3f2a1e', .55); g.fill()
    # wainscot
    g.set_source(lin(0, 650, 0, FLOOR_Y, (0, '#8c5b3c'), (1, '#6c432c'))); g.rectangle(0, 650, W, FLOOR_Y - 650); g.fill()
    g.rectangle(0, 644, W, 14); col(g, '#a8734f'); g.fill()
    for x in range(30, W, 150):
        rrect(g, x, 676, 120, 70, 6); col(g, '#5e3a26', .5); g.set_line_width(3); g.stroke()
    # floor planks with perspective
    g.set_source(lin(0, FLOOR_Y, 0, H, (0, '#9a6744'), (1, '#c08a5c'))); g.rectangle(0, FLOOR_Y, W, H - FLOOR_Y); g.fill()
    vx = 960
    for i in range(-20, 21):
        g.move_to(vx + i * 40, FLOOR_Y); g.line_to(vx + i * 210, H); col(g, '#5e3a24', .35); g.set_line_width(2); g.stroke()
    for k in range(1, 8):
        y = FLOOR_Y + (H - FLOOR_Y) * (k / 8) ** 1.6
        g.move_to(0, y); g.line_to(W, y); col(g, '#5e3a24', .18); g.set_line_width(1.5); g.stroke()
    g.rectangle(0, FLOOR_Y, W, 10); col(g, '#3d2618', .35); g.fill()

    # --- window: clear the panes, then frame
    g.set_operator(cairo.OPERATOR_CLEAR); g.rectangle(*WIN); g.fill(); g.set_operator(cairo.OPERATOR_OVER)
    fw = 22
    col(g, '#f7efe2'); g.set_line_width(fw)
    g.rectangle(WX - fw / 2, WY - fw / 2, WW + fw, WH + fw); g.stroke()
    g.set_line_width(12)
    for i in (1, 2):
        g.move_to(WX + WW * i / 3, WY); g.line_to(WX + WW * i / 3, WY + WH); g.stroke()
    g.move_to(WX, WY + WH * .45); g.line_to(WX + WW, WY + WH * .45); g.stroke()
    g.rectangle(WX - fw, WY - fw, WW + 2 * fw, 6); col(g, '#d8cbb6'); g.fill()
    # curtains (tied back)
    for side in (-1, 1):
        cx = WX - 40 if side < 0 else WX + WW + 40
        g.move_to(cx - 45 * side * -1 if False else cx - 45, WY - 50)
        g.move_to(cx - 50, WY - 50); g.line_to(cx + 50, WY - 50)
        g.curve_to(cx + 20 * -side, WY + 200, cx + 45 * -side, WY + 300, cx + 30, WY + WH + 30)
        g.line_to(cx - 30, WY + WH + 30)
        g.curve_to(cx - 45 * -side, WY + 300, cx - 20 * -side, WY + 200, cx - 50, WY - 50)
        g.close_path()
        g.set_source(lin(cx - 50, 0, cx + 50, 0, (0, '#c46a4c'), (.5, '#dd8a62'), (1, '#b35c40'))); g.fill()
        for k in (-25, 0, 25):
            g.move_to(cx + k, WY - 45); g.curve_to(cx + k * .5 - 10 * side, WY + 200, cx + k * .3, WY + 320, cx + k * .7, WY + WH + 25)
            col(g, '#8f4430', .35); g.set_line_width(3); g.stroke()
        rrect(g, cx - 34, WY + 245, 68, 16, 7); col(g, '#f2c46d'); g.fill()
    g.rectangle(WX - 120, WY - 62, WW + 240, 10); col(g, '#5a3a28'); g.fill()
    # window seat
    rrect(g, WX - 30, SEAT_Y + 26, WW + 60, 90, 6); col(g, '#7a4c33'); g.fill()
    rrect(g, WX - 20, SEAT_Y, WW + 40, 34, 14); g.set_source(lin(0, SEAT_Y, 0, SEAT_Y + 34, (0, '#a7c4a0'), (1, '#7f9e7c'))); g.fill()
    for x in range(int(WX), int(WX + WW), 36):
        g.rectangle(x, SEAT_Y + 4, 12, 26); col(g, '#f6f1e3', .25); g.fill()
    rrect(g, WX + 16, SEAT_Y - 34, 120, 44, 18); col(g, '#f0c35e'); g.fill()   # cushions
    rrect(g, WX + 130, SEAT_Y - 28, 90, 38, 16); col(g, '#e88f73'); g.fill()
    potted_plant(g, WX + WW - 40, SEAT_Y - 26, 1.0, seed=3)

    # --- shelves on the left wall
    for sy in (250, 370):
        rrect(g, 90, sy, 560, 14, 3); col(g, '#7a4b31'); g.fill()
        g.rectangle(110, sy + 14, 18, 22); g.rectangle(612, sy + 14, 18, 22); col(g, '#5d3824'); g.fill()
    r = random.Random(11)
    x = 110
    while x < 620:  # shelf 1: jars of beans and tea
        w = r.choice([40, 46, 52]); h = r.choice([60, 72, 84])
        if r.random() < .7:
            rrect(g, x, 250 - h, w, h, 10); col(g, '#f4ead8', .55); g.fill()
            rrect(g, x + 4, 250 - h * .6, w - 8, h * .6 - 4, 8); col(g, r.choice(['#6b3e26', '#b4823f', '#7d8f3e', '#c35f3f']), .9); g.fill()
            rrect(g, x - 2, 250 - h - 8, w + 4, 12, 4); col(g, '#9b6a44'); g.fill()
        else:
            potted_plant(g, x + w / 2, 250 - 26, .7, seed=int(x))
        x += w + r.choice([10, 14, 20])
    x = 110
    while x < 620:  # shelf 2: books and cups
        if r.random() < .75:
            for _ in range(r.randint(3, 6)):
                bw = r.randint(14, 22); bh = r.randint(70, 96)
                g.rectangle(x, 370 - bh, bw, bh); col(g, r.choice(['#3f6e7a', '#b8573f', '#e2b25b', '#6c8a52', '#8a5a7a', '#2f4b6b', '#d7cbb0'])); g.fill()
                g.rectangle(x + 3, 370 - bh + 12, bw - 6, 4); col(g, '#ffffff', .35); g.fill()
                x += bw + 2
            x += 16
        else:
            for k in range(3):
                rrect(g, x, 370 - 34, 34, 34, 6); col(g, r.choice(['#f2ece0', '#9cc0c4', '#e6a07f'])); g.fill()
                g.arc(x + 38, 370 - 17, 9, -1.3, 1.3); col(g, '#d9d0c0'); g.set_line_width(5); g.stroke()
                x += 50
            x += 10
    # chalkboard (scribbles only)
    rrect(g, 720, 150, 220, 290, 8); col(g, '#7a4b31'); g.fill()
    rrect(g, 734, 164, 192, 262, 4); col(g, '#2c3a35'); g.fill()
    col(g, '#f2efe6', .75); g.set_line_width(3)
    g.arc(830, 210, 22, 0, TAU); g.stroke()                  # a little cup doodle
    g.move_to(812, 204); g.line_to(848, 204); g.stroke()
    for i, y in enumerate(range(258, 410, 26)):
        g.move_to(752, y)
        for k in range(12):
            g.line_to(752 + k * 9, y + (3 if k % 2 else -3))
        g.stroke()
        g.arc(900, y, 4, 0, TAU); g.fill()

    # --- counter
    g.set_source(lin(0, 570, 0, 820, (0, '#7c4a2f'), (1, '#5a3420'))); g.rectangle(0, 590, 900, 230); g.fill()
    for x in range(20, 880, 170):
        rrect(g, x, 615, 150, 180, 8); col(g, '#3e2416', .35); g.set_line_width(4); g.stroke()
    rrect(g, -10, 560, 920, 34, 6); g.set_source(lin(0, 560, 0, 594, (0, '#efd9bd'), (1, '#c9a47e'))); g.fill()
    # espresso machine
    rrect(g, 250, 420, 200, 140, 18); g.set_source(lin(250, 0, 450, 0, (0, '#a65a35'), (.45, '#e09a62'), (1, '#8a4527'))); g.fill()
    rrect(g, 240, 404, 220, 22, 8); g.set_source(lin(0, 404, 0, 426, (0, '#f2f2f2'), (1, '#a9a9a9'))); g.fill()
    for gx in (300, 400):
        rrect(g, gx - 22, 520, 44, 16, 5); col(g, '#cfcfcf'); g.fill()
        g.rectangle(gx - 5, 536, 10, 12); col(g, '#8d8d8d'); g.fill()
        rrect(g, gx - 16, 546, 32, 14, 4); col(g, '#f4efe6'); g.fill()   # cup under the spout
    g.arc(350, 468, 22, 0, TAU); col(g, '#f7f1e3'); g.fill(); g.arc(350, 468, 22, 0, TAU); col(g, '#6d3b22'); g.set_line_width(4); g.stroke()
    g.move_to(350, 468); g.line_to(362, 456); g.set_line_width(3); g.stroke()
    for k in range(4):  # cups on top
        rrect(g, 262 + k * 46, 380, 36, 26, 5); col(g, ['#f2ece0', '#9cc0c4', '#e6a07f', '#f2ece0'][k]); g.fill()
    # cake stand with dome
    g.rectangle(596, 540, 8, 20); col(g, '#d8d0c4'); g.fill()
    ellipse(g, 600, 540, 70, 9); col(g, '#efe8dc'); g.fill()
    rrect(g, 548, 486, 104, 52, 10); col(g, '#f5d5a6'); g.fill()
    rrect(g, 548, 500, 104, 12, 4); col(g, '#d9744f'); g.fill()
    for k in range(5):
        g.arc(560 + k * 20, 486, 7, 0, TAU); col(g, '#c8364a'); g.fill()
    g.move_to(530, 540); g.curve_to(530, 440, 670, 440, 670, 540); col(g, '#dff1f2', .22); g.fill_preserve()
    col(g, '#ffffff', .6); g.set_line_width(2); g.stroke()
    g.move_to(548, 520); g.curve_to(548, 480, 570, 468, 590, 464); col(g, '#ffffff', .55); g.set_line_width(4); g.stroke()
    # jar of pastries + menu stand
    rrect(g, 120, 470, 80, 90, 14); col(g, '#e8f4f4', .3); g.fill()
    for k in range(4):
        ellipse(g, 140 + (k % 2) * 36, 540 - (k // 2) * 34, 18, 13); col(g, '#d39a52'); g.fill()
    rrect(g, 112, 458, 96, 16, 6); col(g, '#9b6a44'); g.fill()
    potted_plant(g, 780, 534, 1.05, seed=5)

    # big floor plant (right corner)
    g.save()
    r = random.Random(21)
    for i in range(26):
        a = -math.pi / 2 + r.uniform(-1.0, 1.0); ln = r.uniform(80, 150)
        x0, y0 = 1830 + r.uniform(-10, 10), 900 - r.uniform(0, 260)
        leaf(g, x0, y0, a, ln, ln * .32, r.choice(['#3f7a48', '#4f8a50', '#5d9b5a']))
    g.move_to(1830, 1000); g.line_to(1830, 650); col(g, '#5b4430'); g.set_line_width(6); g.stroke()
    g.move_to(1760, 900); g.line_to(1900, 900); g.line_to(1880, 1040); g.line_to(1780, 1040); g.close_path()
    g.set_source(lin(1760, 0, 1900, 0, (0, '#e3dccd'), (.6, '#f4efe4'), (1, '#c8bfae'))); g.fill()
    g.restore()
    return s


# ------------------------------------------------------------------ foreground (table, mugs)
TABLE = (700, 905)
MUGS = [(610, 880), (800, 884)]


def draw_front():
    s, g = surface()
    tx, ty = TABLE
    ellipse(g, tx, H + 10, 150, 22); col(g, '#3b2416', .35); g.fill()   # shadow
    g.rectangle(tx - 14, ty, 28, H - ty); g.set_source(lin(tx - 14, 0, tx + 14, 0, (0, '#2f2f33'), (.5, '#5b5b62'), (1, '#2a2a2e'))); g.fill()
    ellipse(g, tx, ty + 14, 250, 52); col(g, '#6b4029'); g.fill()
    ellipse(g, tx, ty, 250, 52); g.set_source(lin(tx - 250, 0, tx + 250, 0, (0, '#b07a4d'), (.5, '#d8a874'), (1, '#a06a40'))); g.fill()
    ellipse(g, tx - 20, ty - 4, 200, 34); col(g, '#ffffff', .07); g.fill()
    # book
    g.save(); g.translate(tx - 160, ty + 10); g.rotate(-.12)
    rrect(g, -60, -18, 120, 36, 4); col(g, '#3f6e7a'); g.fill(); g.rectangle(-60, -10, 120, 4); col(g, '#f3ead6'); g.fill(); g.restore()
    # plate with croissant
    ellipse(g, tx + 150, ty + 4, 62, 18); col(g, '#f7f3ea'); g.fill()
    ellipse(g, tx + 150, ty + 2, 46, 12); col(g, '#e6dfd1'); g.fill()
    for k, (dx, w) in enumerate([(-30, 18), (-14, 22), (4, 24), (22, 20), (36, 15)]):
        ellipse(g, tx + 150 + dx * .9, ty - 8 - (10 if 0 < k < 4 else 4), w * .7, 13 - abs(k - 2) * 2); col(g, ['#c9853f', '#d99a52', '#e2aa60', '#d99a52', '#c9853f'][k]); g.fill()
    # mugs
    for i, (mx, my) in enumerate(MUGS):
        c = ['#f2ece0', '#e6a07f'][i]
        ellipse(g, mx, my + 34, 38, 9); col(g, '#3b2416', .25); g.fill()
        g.arc(mx + 30, my + 12, 13, -1.4, 1.4); col(g, c); g.set_line_width(7); g.stroke()
        g.move_to(mx - 30, my); g.line_to(mx - 26, my + 32); g.curve_to(mx - 20, my + 40, mx + 20, my + 40, mx + 26, my + 32); g.line_to(mx + 30, my); g.close_path()
        g.set_source(lin(mx - 30, 0, mx + 30, 0, (0, c), (.7, c), (1, '#b9ab98'))); g.fill()
        ellipse(g, mx, my, 30, 8); col(g, '#5a3420'); g.fill()
        ellipse(g, mx, my, 21, 5); col(g, '#c58d5b'); g.fill()   # latte
    # little vase
    vx, vy = tx + 10, ty - 22
    g.move_to(vx - 12, vy); g.curve_to(vx - 22, vy - 30, vx - 6, vy - 40, vx - 5, vy - 48); g.line_to(vx + 5, vy - 48)
    g.curve_to(vx + 6, vy - 40, vx + 22, vy - 30, vx + 12, vy); g.close_path(); col(g, '#9cc0c4', .85); g.fill()
    for a, hx in ((-.4, '#f2c46d'), (0, '#e88f73'), (.45, '#f6f1e3')):
        g.move_to(vx, vy - 46); g.line_to(vx + math.sin(a) * 52, vy - 46 - math.cos(a) * 52); col(g, '#4f8a50'); g.set_line_width(3); g.stroke()
        fx, fy = vx + math.sin(a) * 56, vy - 46 - math.cos(a) * 56
        for p in range(5):
            g.arc(fx + math.cos(p * TAU / 5) * 7, fy + math.sin(p * TAU / 5) * 7, 6, 0, TAU); col(g, hx); g.fill()
        g.arc(fx, fy, 4, 0, TAU); col(g, '#d08a2c'); g.fill()
    # chair back peeking in at bottom left
    g.save(); g.translate(250, 860)
    for x in (-70, 70):
        rrect(g, x - 9, -60, 18, 300, 8); col(g, '#7a4a2e'); g.fill()
    rrect(g, -80, -70, 160, 26, 12); col(g, '#8f5a38'); g.fill()
    for x in (-36, 0, 36):
        rrect(g, x - 6, -44, 12, 120, 5); col(g, '#7a4a2e'); g.fill()
    rrect(g, -80, 70, 160, 20, 8); col(g, '#8f5a38'); g.fill()
    g.restore()
    # vignette and warm grade
    p = cairo.RadialGradient(W / 2, H * .45, H * .35, W / 2, H * .5, H * 1.05)
    p.add_color_stop_rgba(0, 0, 0, 0, 0); p.add_color_stop_rgba(1, .18, .08, .02, .5)
    g.set_source(p); g.paint()
    return s


# ------------------------------------------------------------------ outside (moves)
CLOUDS_FAR = [(60, 60, .8), (300, 110, .6)]       # tile 400px
CLOUDS_NEAR = [(120, 40, 1.2), (520, 90, 1.0)]    # tile 800px


def cloud(g, x, y, s, a):
    col(g, '#ffffff', a)
    for dx, dy, r in ((0, 0, 34), (36, -16, 40), (76, 0, 32), (40, 12, 30), (-30, 10, 24), (104, 10, 22)):
        g.arc(x + dx * s, y + dy * s, r * s, 0, TAU); g.fill()


def draw_outside(g, t):
    g.save(); g.rectangle(*WIN); g.clip()
    g.set_source(lin(0, WY, 0, WY + WH, (0, '#7fb7e6'), (.65, '#bfe0f2'), (1, '#fde7c4'))); g.paint()
    glow(g, WX + WW - 60, WY + 30, 260, '#fff6d8', .8)   # the sun, just out of sight
    off = (t / T) * 400
    for k in range(-1, 4):
        for (x, y, s) in CLOUDS_FAR:
            cloud(g, WX + x + k * 400 + off - 400, WY + y, s, .55)
    off = (t / T) * 800
    for k in range(-1, 2):
        for (x, y, s) in CLOUDS_NEAR:
            cloud(g, WX + x + k * 800 + off - 400, WY + y + 20, s, .9)
    # hills and rooftops
    ellipse(g, WX + 150, WY + WH + 40, 420, 130); col(g, '#8fbf7a'); g.fill()
    ellipse(g, WX + 600, WY + WH + 60, 380, 150); col(g, '#7aae6a'); g.fill()
    for i, (x, w, h, c) in enumerate([(40, 90, 70, '#e3c7a5'), (150, 70, 90, '#f1e1c6'), (440, 110, 60, '#d9b48e')]):
        g.rectangle(WX + x, WY + WH - h, w, h); col(g, c); g.fill()
        g.move_to(WX + x - 10, WY + WH - h); g.line_to(WX + x + w / 2, WY + WH - h - 36); g.line_to(WX + x + w + 10, WY + WH - h); g.close_path(); col(g, '#b55a3f'); g.fill()
        for wx in range(int(x) + 14, int(x + w) - 14, 26):
            g.rectangle(WX + wx, WY + WH - h + 18, 12, 14); col(g, '#7a9bb0'); g.fill()
    # tree, swaying
    tx, ty = WX + 330, WY + WH
    g.move_to(tx - 9, ty); g.line_to(tx - 5, ty - 120); g.line_to(tx + 5, ty - 120); g.line_to(tx + 9, ty); col(g, '#6d4a33'); g.fill()
    g.save(); g.translate(tx, ty - 110); g.rotate(.025 * math.sin(TAU * 4 * t / T))
    for dx, dy, r, c in ((-50, -30, 60, '#4f8f4c'), (40, -40, 64, '#5a9d55'), (0, -90, 70, '#69ad5e'), (-20, -40, 56, '#5fa257'), (60, -10, 44, '#4f8f4c')):
        g.arc(dx, dy, r, 0, TAU); col(g, c); g.fill()
    g.arc(-10, -110, 30, 0, TAU); col(g, '#8fc87a', .7); g.fill()
    g.restore()
    # glass sheen
    g.move_to(WX + 40, WY + WH); g.line_to(WX + 180, WY); g.line_to(WX + 230, WY); g.line_to(WX + 90, WY + WH); g.close_path(); col(g, '#ffffff', .07); g.fill()
    g.restore()


# ------------------------------------------------------------------ sunlight on the floor
PANES = [(WX + WW * c / 3 + 6, WY + (0 if r == 0 else WH * .45) + 6, WW / 3 - 12, WH * (.45 if r == 0 else .55) - 12) for r in (0, 1) for c in range(3)]


def proj(x, y):
    d = (WY + WH - y)
    return x - d * 1.05 - 120, FLOOR_Y + 14 + d * .62


def draw_light(g, t):
    pulse = .9 + .1 * math.sin(TAU * 2 * t / T)
    for (x, y, w, h) in PANES:
        pts = [proj(x, y), proj(x + w, y), proj(x + w, y + h), proj(x, y + h)]
        g.move_to(*pts[0]); [g.line_to(*p) for p in pts[1:]]; g.close_path()
        col(g, '#ffe6a8', .30 * pulse); g.fill()
    # volumetric rays
    for (x, y, w, h) in PANES[3:]:
        a, b = (x + 10, y + 10), (x + w - 10, y + 10)
        pa, pb = proj(x + w - 10, y + h), proj(x + 10, y + h)
        g.move_to(*a); g.line_to(*b); g.line_to(*pa); g.line_to(*pb); g.close_path()
        g.set_source(lin(b[0], b[1], pb[0], pb[1], (0, '#fff1c9', .16 * pulse), (1, '#fff1c9', 0))); g.fill()


MOTES = [(rnd.uniform(0, 1), rnd.uniform(0, 1), rnd.randint(1, 3), rnd.randint(1, 3), rnd.uniform(0, TAU), rnd.uniform(1.2, 3.2)) for _ in range(70)]


def draw_motes(g, t):
    for (u, v, fx, fy, ph, r) in MOTES:
        # somewhere inside the sunbeam, drifting in slow closed loops
        x0, y0 = WX + 40 + u * (WW - 80), WY + 60 + v * 380
        x = x0 - v * 380 * 1.0 + 40 * math.sin(TAU * fx * t / T + ph)
        y = y0 + v * 200 + 30 * math.sin(TAU * fy * t / T + ph * 1.7)
        a = .35 + .3 * math.sin(TAU * (fx + fy) * t / T + ph)
        glow(g, x, y, r * 3, '#fff3cf', max(0, a))


# ------------------------------------------------------------------ string lights, hanging plants, cat, steam
def catenary(x0, x1, y, sag, n):
    pts = []
    for i in range(n + 1):
        u = i / n
        pts.append((x0 + (x1 - x0) * u, y + sag * 4 * u * (1 - u)))
    return pts


STRANDS = [catenary(-20, 980, 74, 70, 16), catenary(940, 1940, 74, 80, 16)]
BULB_PH = [rnd.uniform(0, TAU) for _ in range(40)]
BULB_K = [rnd.randint(1, 4) for _ in range(40)]


def draw_lights(g, t):
    i = 0
    for pts in STRANDS:
        g.move_to(*pts[0]); [g.line_to(*p) for p in pts[1:]]; col(g, '#3a2a20'); g.set_line_width(2.5); g.stroke()
        for (x, y) in pts[1:-1]:
            b = .78 + .22 * math.sin(TAU * BULB_K[i] * t / T + BULB_PH[i])
            glow(g, x, y + 12, 46, '#ffcf7a', .32 * b)
            g.rectangle(x - 3, y, 6, 6); col(g, '#3a2a20'); g.fill()
            ellipse(g, x, y + 13, 6, 8); col(g, '#fff0c4', .75 + .25 * b); g.fill()
            i += 1


HANGERS = [(1170, 150, 1.0, 1), (1560, 110, .85, 2), (520, 130, .8, 3)]


def draw_hangers(g, t):
    for (x, ln, s, k) in HANGERS:
        g.save(); g.translate(x, 66); g.rotate(.03 * math.sin(TAU * k * t / T + x))
        for dx in (-26 * s, 0, 26 * s):
            g.move_to(0, 0); g.line_to(dx, ln); col(g, '#d9c9a8'); g.set_line_width(1.6); g.stroke()
        rrect(g, -28 * s, ln, 56 * s, 34 * s, 10 * s); g.set_source(lin(-28 * s, 0, 28 * s, 0, (0, '#e8e0d0'), (1, '#b8ad98'))); g.fill()
        r = random.Random(x)
        for v in range(7):   # trailing vines
            vx = r.uniform(-24, 24) * s; L = r.uniform(60, 170) * s
            sway = 6 * math.sin(TAU * k * t / T + v)
            g.move_to(vx, ln + 8 * s); g.curve_to(vx + sway, ln + L * .4, vx - sway, ln + L * .7, vx + sway * .5, ln + L)
            col(g, '#3f6f3e'); g.set_line_width(2); g.stroke()
            for j in range(1, 7):
                u = j / 7; yy = ln + L * u; xx = vx + sway * math.sin(u * 3)
                leaf(g, xx, yy, (1 if j % 2 else -1) * 0.9 + math.pi / 2, 16 * s, 7 * s, '#5d9b5a' if j % 2 else '#72ad62')
        for v in range(8):
            leaf(g, r.uniform(-20, 20) * s, ln + 2, -math.pi / 2 + r.uniform(-1.2, 1.2), 26 * s, 9 * s, '#5d9b5a')
        g.restore()


def draw_cat(g, t):
    cx, cy = WX + 430, SEAT_Y - 4
    br = 1 + .035 * math.sin(TAU * 5 * t / T)     # slow breathing
    ellipse(g, cx, cy + 4, 120, 12); col(g, '#3b2416', .18); g.fill()
    g.save(); g.translate(cx, cy); g.scale(1, br)
    ellipse(g, 0, -40, 105, 46); g.set_source(lin(0, -86, 0, 6, (0, '#f0a35c'), (1, '#c97733'))); g.fill()
    for k in range(4):   # stripes
        g.move_to(-30 + k * 28, -84); g.curve_to(-20 + k * 28, -60, -26 + k * 28, -40, -34 + k * 28, -30); col(g, '#b56424', .6); g.set_line_width(7); g.stroke()
    g.restore()
    # tail curled round the front, tip flicking now and then
    flick = math.sin(TAU * 2 * t / T) ** 8
    g.move_to(cx + 96, cy - 18); g.curve_to(cx + 90, cy + 8, cx - 10, cy + 6, cx - 50, cy - 2)
    g.curve_to(cx - 72, cy - 6 - 16 * flick, cx - 86, cy - 12 - 22 * flick, cx - 80, cy - 24 - 22 * flick)
    col(g, '#d9843d'); g.set_line_width(20); g.set_line_cap(cairo.LINE_CAP_ROUND); g.stroke()
    # head resting on the paws, tucked in
    hx, hy = cx - 92, cy - 34 + 2 * math.sin(TAU * 5 * t / T)
    for side in (-1, 1):
        g.move_to(hx + side * 34, hy - 18); g.line_to(hx + side * 30, hy - 58); g.line_to(hx + side * 8, hy - 34); g.close_path(); col(g, '#d9843d'); g.fill()
        g.move_to(hx + side * 28, hy - 24); g.line_to(hx + side * 27, hy - 48); g.line_to(hx + side * 14, hy - 32); g.close_path(); col(g, '#f2b8a0'); g.fill()
    ellipse(g, hx, hy, 46, 38); col(g, '#e8954a'); g.fill()
    ellipse(g, hx + 2, hy + 14, 24, 14); col(g, '#fbe3c8'); g.fill()
    for side in (-1, 1):   # closed eyes
        g.arc(hx + side * 17, hy - 2, 8, .2, math.pi - .2); col(g, '#5a3420'); g.set_line_width(3); g.stroke()
    g.move_to(hx - 4, hy + 8); g.line_to(hx + 4, hy + 8); g.line_to(hx, hy + 13); g.close_path(); col(g, '#d9746a'); g.fill()
    ellipse(g, hx + 10, hy + 34, 26, 12); col(g, '#fbe3c8'); g.fill()   # paws
    ellipse(g, hx - 22, hy + 34, 22, 11); col(g, '#fbe3c8'); g.fill()
    # sleepy zzz rising
    for k in range(3):
        u = ((t / T) * 4 + k / 3) % 1
        zx, zy = hx - 30 - u * 40, hy - 50 - u * 110
        a = math.sin(math.pi * u) * .7
        s = 9 + u * 10
        g.move_to(zx - s, zy - s); g.line_to(zx + s, zy - s); g.line_to(zx - s, zy + s); g.line_to(zx + s, zy + s)
        col(g, '#ffffff', a); g.set_line_width(3); g.set_line_cap(cairo.LINE_CAP_ROUND); g.stroke()


def draw_steam(g, t):
    for i, (mx, my) in enumerate(MUGS):
        for w in range(3):
            x0 = mx - 12 + w * 12
            for lw, a in ((16, .05), (9, .09), (4, .12)):
                g.move_to(x0, my - 4)
                for j in range(1, 31):
                    u = j / 30
                    y = my - 4 - u * 150
                    x = x0 + (8 + 16 * u) * math.sin(TAU * (u * 1.3 - 3 * t / T) + w * 2 + i)
                    g.line_to(x, y)
                g.set_source(lin(0, my, 0, my - 150, (0, '#ffffff', a * 1.6), (1, '#ffffff', 0)))
                g.set_line_width(lw); g.set_line_cap(cairo.LINE_CAP_ROUND); g.stroke()


# ------------------------------------------------------------------ render
room, front = draw_room(), draw_front()


def frame(t):
    s, g = surface()
    draw_outside(g, t)
    g.set_source_surface(room); g.paint()
    draw_light(g, t)
    draw_cat(g, t)
    draw_hangers(g, t)
    draw_lights(g, t)
    g.set_source_surface(front); g.paint()
    draw_steam(g, t)
    draw_motes(g, t)
    return s


if STILL:
    frame(3.0).write_to_png(OUT); sys.exit()

n = FPS * T
ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                       '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], stdin=subprocess.PIPE)
for i in range(n):
    s = frame(i / FPS)
    s.flush(); ff.stdin.write(bytes(s.get_data()))
    if i % 100 == 0: print(f'{i}/{n}', flush=True)
ff.stdin.close(); ff.wait()
print('done', OUT)
