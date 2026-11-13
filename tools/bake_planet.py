"""Bakes a high-contrast amber gas giant texture from the Solar System Scope Saturn map (CC BY 4.0).
Usage: python -I tools/bake_planet.py <in.jpg> <out.jpg>
Steps: amplify band profile (row means) and fine detail, warp band edges with smooth noise, map to an amber palette."""
import sys
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255
H, W = a.shape[:2]
lum = a @ np.array([0.3, 0.55, 0.15], np.float32)
rng = np.random.default_rng(7)

def smooth_noise(gw, gh, amp=1.0):
    g = rng.random((gh, gw)).astype(np.float32)
    g = np.concatenate([g, g[:, :4]], 1)                         # wrap horizontally: no seam at u = 0/1
    ext = W * (gw + 4) // gw
    img = Image.fromarray((g * 255).astype(np.uint8)).resize((ext, H), Image.BICUBIC)
    return (np.asarray(img).astype(np.float32)[:, :W] / 255 - 0.5) * 2 * amp

# 1. band profile: smooth row means, then boost the band structure against a very smooth trend
rows = lum.mean(1)
def blur1d(v, r):
    k = np.exp(-np.linspace(-2.5, 2.5, 2 * r + 1) ** 2); k /= k.sum()
    return np.convolve(np.pad(v, r, mode='edge'), k, mode='valid')
trend = blur1d(rows, 120)
bands = blur1d(rows, 2) - trend
detail_rows = rows - blur1d(rows, 2)

# 2. warp: each pixel reads the band profile from a slightly shifted row (wavy edges, storm-like swirls)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
warp = smooth_noise(64, 32, 6.0) + smooth_noise(256, 96, 2.0)
ry = np.clip(yy + warp, 0, H - 1).astype(np.int32)
profile = (trend * 0.9 + bands * 4.5 + detail_rows * 3.0)[ry]

# 3. fine detail from the texture itself, amplified, plus a little turbulence
fine = (lum - rows[:, None]) * 3.5 + smooth_noise(512, 256, 0.025) + smooth_noise(1024, 512, 0.012)
v = profile + fine
v = (v - v.mean()) / (v.std() + 1e-6)              # normalise
v = 1 / (1 + np.exp(-v * 1.25))                     # soft S-curve → 0..1

# 4. amber palette
stops = np.array([0.0, 0.25, 0.5, 0.72, 0.9, 1.0], np.float32)
cols = np.array([[38, 16, 6], [104, 50, 18], [176, 98, 40], [222, 150, 78], [244, 196, 128], [252, 228, 186]], np.float32) / 255
out = np.stack([np.interp(v, stops, cols[:, c]) for c in range(3)], -1)
# poles a bit darker and cooler
pole = np.abs(yy / (H - 1) - 0.5) * 2
out *= (1 - 0.35 * pole[..., None] ** 3)
Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(dst, quality=90)
print('saved', dst)
