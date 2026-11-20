# A worksheet under a document camera: the stand-in camera picture for the 21DocCam screenshot.
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import random
W, H = 1280, 720
random.seed(4)
desk = Image.new('RGB', (W, H), (176, 132, 92))
d = ImageDraw.Draw(desk)
for y in range(0, H, 3):   # wood grain
    c = 168 + int(10 * ((y * 7919) % 13) / 13)
    d.line([(0, y), (W, y + random.randint(-2, 2))], fill=(c, int(c * 0.76), int(c * 0.53)), width=2)
sheet = Image.new('RGBA', (760, 980), (252, 252, 248, 255))
s = ImageDraw.Draw(sheet)
inter = '/usr/share/fonts/opentype/inter/'
title = ImageFont.truetype(inter + 'Inter-Bold.otf', 40)
body = ImageFont.truetype(inter + 'Inter-Regular.otf', 34)
small = ImageFont.truetype(inter + 'Inter-Regular.otf', 24)
hand = ImageFont.truetype('excalifont.ttf', 44)
s.text((50, 40), 'Name', font=small, fill=(60, 60, 60)); s.line([(125, 66), (420, 66)], fill=(90, 90, 90), width=2)
s.text((140, 26), 'Maya', font=hand, fill=(70, 70, 90))
s.text((50, 100), 'Adding Fractions', font=title, fill=(25, 25, 25))
s.text((50, 160), 'Add. Show your work.', font=small, fill=(70, 70, 70))
probs = [('1/4 + 2/4 =', '3/4'), ('1/3 + 1/3 =', '2/3'), ('2/5 + 2/5 =', '4/5'), ('3/8 + 1/8 =', '4/8'), ('1/6 + 4/6 =', '')]
y = 230
for i, (q, a) in enumerate(probs):
    s.text((50, y), f'{i + 1}.', font=body, fill=(30, 30, 30))
    s.text((110, y), q, font=body, fill=(30, 30, 30))
    s.line([(330, y + 40), (470, y + 40)], fill=(120, 120, 120), width=2)
    if a: s.text((350, y - 8), a, font=hand, fill=(60, 60, 85))
    y += 120
sheet = sheet.rotate(-3, expand=True, resample=Image.BICUBIC)
shadow = Image.new('RGBA', sheet.size, (0, 0, 0, 0)); shadow.paste((0, 0, 0, 90), mask=sheet.split()[3])
shadow = shadow.filter(ImageFilter.GaussianBlur(10))
x0, y0 = (W - sheet.width) // 2, -110
desk.paste(shadow, (x0 + 10, y0 + 14), shadow)
desk.paste(sheet, (x0, y0), sheet)
# a pencil
d = ImageDraw.Draw(desk)
d.polygon([(980, 600), (1210, 470), (1222, 490), (992, 620)], fill=(245, 190, 40))
d.polygon([(980, 600), (992, 620), (955, 625)], fill=(230, 200, 160)); d.polygon([(962, 616), (955, 625), (968, 621)], fill=(50, 50, 50))
d.polygon([(1210, 470), (1235, 456), (1247, 476), (1222, 490)], fill=(235, 120, 140))
desk.save('worksheet.png')
print(desk.size)
