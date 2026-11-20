# Rolling hills under a morning sky: the stand-in class photo for the board's background in appearance.jpg.
from PIL import Image, ImageDraw, ImageFilter
import math
W, H = 1920, 1080
img = Image.new('RGB', (W, H))
d = ImageDraw.Draw(img)
for y in range(H):   # sky, pale blue to warm near the hills
    t = y / H
    d.line([(0, y), (W, y)], fill=(int(150 + 90 * t), int(196 + 40 * t), int(236 - 20 * t)))
d.ellipse([1380, 150, 1560, 330], fill=(255, 238, 186))   # the sun
glow = Image.new('L', (W, H), 0)
ImageDraw.Draw(glow).ellipse([1300, 70, 1640, 410], fill=90)
img.paste(Image.new('RGB', (W, H), (255, 244, 214)), (0, 0), glow.filter(ImageFilter.GaussianBlur(60)))
d = ImageDraw.Draw(img)
for i, (base, amp, freq, phase, col) in enumerate([
        (640, 60, 1.3, 0.4, (128, 178, 120)), (720, 70, 1.8, 1.9, (96, 158, 92)),
        (820, 60, 2.3, 3.1, (70, 136, 74)), (930, 45, 2.9, 0.8, (52, 112, 60))]):
    pts = [(x, base - amp * math.sin(freq * x / W * math.pi * 2 + phase)) for x in range(0, W + 8, 8)]
    d.polygon(pts + [(W, H), (0, H)], fill=col)
img = img.filter(ImageFilter.GaussianBlur(1.2))
img.save('hills.jpg', quality=88)
