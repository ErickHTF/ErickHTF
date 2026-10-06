import argparse
import numpy as np
import cv2
from PIL import Image, ImageSequence

DOT = 2
TEXT_EDGE = 560
INK = (214, 214, 218)
HIGHLIGHT = (237, 237, 237)
GREEN = (124, 196, 164)
PINK = (232, 154, 184)


def hash01(yy, xx, seed):
    v = (xx.astype(np.int64) * 73856093) ^ (yy.astype(np.int64) * 19349663) ^ (seed * 83492791)
    v = (v ^ (v >> 13)) * 1274126177
    return ((v ^ (v >> 16)) & 0xFFFF) / 0xFFFF


def blue_noise(n, seed, iters=24, sigma=1.6):
    r = np.random.default_rng(seed).random((n, n))
    f = np.fft.fftfreq(n)
    g = np.exp(-(f[:, None] ** 2 + f[None, :] ** 2) * (2 * np.pi * sigma) ** 2 / 2)
    for _ in range(iters):
        r = r - np.real(np.fft.ifft2(np.fft.fft2(r) * g))
        r = np.argsort(np.argsort(r.ravel())).reshape(n, n) / (n * n)
    return (r + 0.5 / (n * n)).astype(np.float32)


def load_frames(path):
    return [np.asarray(f.convert("RGB"), np.float32) for f in ImageSequence.Iterator(Image.open(path))]


def smooth_in_time(frames, sigma):
    if sigma <= 0:
        return frames
    r = 3 * int(np.ceil(sigma))
    k = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * sigma ** 2))
    k /= k.sum()
    stack = np.stack(frames)
    idx = np.clip(np.arange(len(frames))[:, None] + np.arange(-r, r + 1)[None, :], 0, len(frames) - 1)
    return list(np.tensordot(k, stack[idx.T], axes=(0, 0)).astype(np.float32))


def interpolate(frames, factor):
    if factor <= 1:
        return frames
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    h, w = frames[0].shape[:2]
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    out = []
    for a, b in zip(frames, frames[1:]):
        ga = cv2.cvtColor(a.astype(np.uint8), cv2.COLOR_RGB2GRAY)
        gb = cv2.cvtColor(b.astype(np.uint8), cv2.COLOR_RGB2GRAY)
        fab = dis.calc(ga, gb, None)
        fba = dis.calc(gb, ga, None)
        out.append(a)
        for k in range(1, factor):
            t = k / factor
            wa = cv2.remap(a, gx - fba[..., 0] * t, gy - fba[..., 1] * t, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            wb = cv2.remap(b, gx - fab[..., 0] * (1 - t), gy - fab[..., 1] * (1 - t), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
            out.append(wa * (1 - t) + wb * t)
    out.append(frames[-1])
    return out


def close_loop(frames, n):
    n = min(n, len(frames) // 3)
    body = frames[:-n]
    for i in range(n):
        t = (i + 1) / (n + 1)
        body[i] = frames[len(frames) - n + i] * (1 - t) + body[i] * t
    return body


def main():
    p = argparse.ArgumentParser(description="Stippled galaxy footer GIF from an animated source.")
    p.add_argument("source")
    p.add_argument("background")
    p.add_argument("out")
    p.add_argument("--interpolate", type=int, default=1)
    p.add_argument("--delay", type=int, default=70)
    p.add_argument("--scale", type=float, default=0.95)
    p.add_argument("--center", default="665,112")
    p.add_argument("--gamma", type=float, default=1.25)
    p.add_argument("--detail", type=float, default=1.4)
    p.add_argument("--floor", type=float, default=0.1)
    p.add_argument("--gain", type=float, default=1.2)
    p.add_argument("--sparks", type=float, default=0.45)
    p.add_argument("--pink-stars", type=float, default=0.3)
    p.add_argument("--smooth", type=float, default=2.5)
    p.add_argument("--hysteresis", type=float, default=0.03)
    p.add_argument("--seed", type=int, default=7)
    a = p.parse_args()

    bg_img = Image.open(a.background).convert("RGB")
    bg_pal = bg_img.quantize(60, dither=Image.Dither.NONE)
    bg = np.asarray(bg_pal.convert("RGB"))
    ph, pw = bg.shape[:2]
    gw, gh = pw // DOT, ph // DOT

    src = load_frames(a.source)
    sh, sw = src[0].shape[:2]
    tw, th = round(sw * a.scale), round(sh * a.scale)
    src = [cv2.resize(f, (tw, th), interpolation=cv2.INTER_AREA) for f in src]
    src = smooth_in_time(src, a.smooth)
    frames = close_loop(interpolate(src, a.interpolate), 12 * a.interpolate)

    cx, cy = (int(v) for v in a.center.split(","))
    x0, y0 = cx - tw // 2, cy - th // 2
    yy, xx = np.mgrid[0:th, 0:tw].astype(np.float32)
    fx = np.clip(np.minimum(xx, tw - 1 - xx) / 22, 0, 1)
    fy = np.clip(np.minimum(yy, th - 1 - yy) / 13, 0, 1)
    feather = (fx * fy) ** 1.5

    lum = [f @ np.array([0.299, 0.587, 0.114], np.float32) / 255 for f in frames]
    sample = np.concatenate([l.ravel() for l in lum[::10]])
    lo, hi = np.percentile(sample, 2), np.percentile(sample, 99.8)

    tile = np.tile(blue_noise(64, a.seed), (gh // 64 + 1, gw // 64 + 1))[:gh, :gw]
    gy_, gx_ = np.mgrid[0:gh, 0:gw]
    green_pick = hash01(gy_, gx_, a.seed + 1)
    pink_pick = hash01(gy_, gx_ // 3, a.seed + 2)

    rng = np.random.default_rng(a.seed)
    fixed_stars = []
    for _ in range(40):
        sx, sy = int(rng.integers(300, gw - 10)), int(rng.integers(6, gh - 6))
        if x0 + 10 < sx < x0 + tw - 10 and y0 + 6 < sy < y0 + th - 6:
            continue
        fixed_stars.append((sx, sy, rng.random() < 0.45, rng.random()))

    ys, xs = slice(max(y0, 0), min(y0 + th, gh)), slice(max(x0, 0), min(x0 + tw, gw))
    sy_, sx_ = slice(ys.start - y0, ys.stop - y0), slice(xs.start - x0, xs.stop - x0)

    def place(values):
        out = np.zeros((gh, gw), np.float32)
        out[ys, xs] = values[sy_, sx_]
        return out

    text_mask = np.zeros((ph, pw), bool)
    text_mask[:, TEXT_EDGE:] = True
    up = lambda m: np.repeat(np.repeat(m, DOT, 0), DOT, 1)

    out = []
    prev = np.zeros((gh, gw), bool)
    for i, (f, l) in enumerate(list(zip(frames, lum)) * 2):
        v = np.clip((l - lo) / (hi - lo), 0, 1)
        v = np.clip(v + a.detail * (v - cv2.GaussianBlur(v, (0, 0), 5)), 0, 1)
        v = np.clip((v - a.floor) / (1 - a.floor), 0, 1) ** a.gamma
        v = np.minimum(v * a.gain, 0.7 + 0.12 * np.tanh((v * a.gain - 0.7) * 3))
        r, g, b = f[..., 0], f[..., 1], f[..., 2]
        total = r + g + b + 1e-3

        level = place(v * feather)
        lit = np.where(prev, level > tile - a.hysteresis, level > tile + a.hysteresis)
        prev = lit
        if i < len(frames):
            continue

        cool = place((b - r) / total)
        warm = place((r - b) / total)
        raw = place(l * feather)
        peak = (raw - cv2.GaussianBlur(raw, (0, 0), 3) > 0.18) & (raw > 0.35)
        peak = cv2.dilate(peak.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
        green = lit & (cool > 0.12) & (green_pick < a.sparks)
        pink = lit & peak & (warm > -0.02) & (pink_pick < a.pink_stars) & ~green

        color = np.zeros((gh, gw, 3), np.uint8)
        on = lit.copy()
        color[lit] = INK
        color[lit & (level > 0.92)] = HIGHLIGHT
        color[green] = GREEN
        color[pink] = PINK
        for sx, sy, cross, kind in fixed_stars:
            c = PINK if kind < 0.22 else GREEN if kind < 0.55 else INK
            for dx, dy in [(0, 0)] + ([(1, 0), (-1, 0), (0, 1), (0, -1)] if cross else []):
                color[sy + dy, sx + dx] = c
                on[sy + dy, sx + dx] = True

        frame = bg.copy()
        m = up(on) & text_mask
        frame[m] = up(color)[m]
        out.append(Image.fromarray(frame))

    colors = [tuple(c) for c in np.unique(bg.reshape(-1, 3), axis=0)] + [INK, HIGHLIGHT, GREEN, PINK]
    pal = Image.new("P", (1, 1))
    pal.putpalette([v for c in colors for v in c] + [0] * (768 - 3 * len(colors)))
    q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in out]
    q[0].save(a.out, save_all=True, append_images=q[1:], duration=a.delay, loop=0, optimize=True)
    print(f"{a.out} {len(q)} frames {len(q) * a.delay / 1000:.1f}s")


if __name__ == "__main__":
    main()
