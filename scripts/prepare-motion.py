"""Read existing art to derive animation landmarks; never modifies image pixels."""
from pathlib import Path
import json
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
# Corresponding hand and foot centres, in each existing sprite cell.
EXTREMITIES = {
    'momo': [
        [.20,.72,.80,.72,.39,.90,.60,.90],
        [.19,.73,.79,.73,.39,.91,.60,.91],
        [.13,.28,.87,.64,.38,.90,.61,.90],
        [.12,.68,.87,.28,.43,.91,.71,.87],
        [.10,.40,.81,.72,.39,.90,.60,.90],
        [.11,.36,.90,.34,.39,.90,.60,.90],
        [.13,.43,.88,.39,.43,.82,.58,.82],
        [.40,.56,.63,.56,.39,.90,.60,.90],
    ],
    'pip': [
        [.22,.71,.89,.71,.43,.89,.66,.89],
        [.18,.71,.84,.71,.39,.89,.62,.89],
        [.18,.35,.87,.65,.29,.81,.59,.89],
        [.13,.65,.82,.35,.47,.89,.74,.81],
        [.20,.36,.88,.68,.44,.88,.65,.88],
        [.20,.32,.85,.32,.39,.88,.61,.88],
        [.17,.38,.83,.38,.42,.72,.58,.72],
        [.29,.49,.71,.49,.39,.88,.60,.88],
    ],
}

def components(mask, minimum):
    labels, _ = ndimage.label(mask)
    result = []
    h, w = mask.shape
    for label, slices in enumerate(ndimage.find_objects(labels), 1):
        if slices is None:
            continue
        area = np.count_nonzero(labels[slices] == label)
        if area < minimum:
            continue
        y, x = slices
        result.append((area, [x.start/w, y.start/h, x.stop/w, y.stop/h]))
    return sorted(result, reverse=True)

def box_points(box):
    l, t, r, b = box
    return [[(l+r)/2, t], [(l+r)/2, b], [l, (t+b)/2], [r, (t+b)/2]]

result = {}
for name in ('momo', 'pip'):
    image = np.asarray(Image.open(ROOT/'dist/assets'/f'{name}.png'))
    h, w = image.shape[:2]
    poses = []
    for frame in range(8):
        cell = image[round(frame//4*h/2):round((frame//4+1)*h/2),
                     round(frame%4*w/4):round((frame%4+1)*w/4)]
        rgb = cell[:,:,:3].astype(float)
        opaque = cell[:,:,3] > 235
        white = (rgb.min(2)>205) & ((rgb.max(2)-rgb.min(2))<50) & opaque
        dark = (rgb[:,:,0]<145) & (rgb[:,:,1]<75) & (rgb[:,:,2]<180) & opaque
        dark_parts = components(dark, 300)
        mouth = dark_parts[0][1]
        eyes = [box for _,box in components(white, 300) if box[1]<.45 and box[3]<.56]
        if len(eyes) != 2:
            eyes = [box for _,box in dark_parts[1:3]]
        eyes.sort(key=lambda box:box[0])
        assert len(eyes)==2, (name,frame)
        body = components(opaque, 1000)[0][1]
        center = (mouth[0]+mouth[2])/2
        offset = [.50-center, 0]
        # Face anchors keep the eyes and mouth together during in-betweens.
        points = box_points(eyes[0]) + box_points(eyes[1]) + box_points(mouth)
        limbs = EXTREMITIES[name][frame]
        points += [limbs[i:i+2] for i in range(0,8,2)]
        points += [[center,body[1]+.04], [center-.23,.28], [center+.23,.28],
                   [center-.20,.66], [center+.20,.66], [center,.71],
                   [center,.84], [center-.12,.80], [center+.12,.80]]
        points = [[x+offset[0],y] for x,y in points]
        # Keep the transparent border fixed instead of stretching the atlas edge.
        points += [[x,y] for x,y in [(0,0),(.5,0),(1,0),(0,.5),(1,.5),(0,1),(.5,1),(1,1)]]
        poses.append({'offset':offset,'points':points})
    result[name] = poses

output = ROOT/'dist/assets/motion.json'
output.write_text(json.dumps(result,separators=(',',':'))+'\n')
print(f'{len(result)} monsters, 8 poses each, {len(result["momo"][0]["points"])} landmarks per pose')
