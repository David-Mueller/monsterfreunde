"""Cut provisional rig parts out of the existing pose sheets (way B in ANIMATION.md).

Writes dist/assets/parts/<monster>-<part>.png and dist/assets/rig.json. The
proper parts sheets described in asset-prompts.json replace these one to one.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.spatial import ConvexHull

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'dist/assets/parts'
OUT.mkdir(exist_ok=True)
LANDMARKS = json.loads((ROOT/'dist/assets/motion.json').read_text())

def cells(name):
    image = np.asarray(Image.open(ROOT/'dist/assets'/f'{name}.png').convert('RGBA'))
    h, w = image.shape[:2]
    ch, cw = h//2, w//4
    n = min(ch, cw)
    return [image[f//4*ch:f//4*ch+n, f%4*cw:f%4*cw+n] for f in range(8)], n

def disk(r):
    y, x = np.ogrid[-r:r+1, -r:r+1]
    return (x*x+y*y) <= r*r

def largest(mask):
    labels, count = ndimage.label(mask)
    if not count:
        return mask
    sizes = ndimage.sum(mask, labels, range(1, count+1))
    return labels == (int(np.argmax(sizes))+1)

def component_at(mask, x, y):
    labels, count = ndimage.label(mask)
    if not count:
        return None
    ys, xs = np.where(mask)
    d = (xs-x)**2 + (ys-y)**2
    return labels == labels[ys[d.argmin()], xs[d.argmin()]]

def hull(mask):
    """Convex hull of a mask, so an eye keeps its full oval even where the pupil touches the rim."""
    ys, xs = np.where(mask)
    points = np.stack([xs, ys], 1)
    if len(points) < 3:
        return mask
    vertices = points[ConvexHull(points).vertices]
    canvas = Image.new('1', mask.shape[::-1], 0)
    ImageDraw.Draw(canvas).polygon([tuple(map(int, v)) for v in vertices], fill=1)
    return np.asarray(canvas, dtype=bool)

def dark_mask(cell):
    rgb = cell[..., :3].astype(float)
    return (rgb[..., 0] < 145) & (rgb[..., 1] < 75) & (rgb[..., 2] < 180) & (cell[..., 3] > 200)

def white_mask(cell):
    rgb = cell[..., :3].astype(float)
    return (rgb.min(2) > 205) & ((rgb.max(2)-rgb.min(2)) < 50) & (cell[..., 3] > 200)

def inpaint(cell, hole):
    """Fill `hole` with the nearest surrounding pixels, then soften the seam."""
    out = cell.copy()
    _, indices = ndimage.distance_transform_edt(hole, return_indices=True)
    out[hole] = cell[indices[0][hole], indices[1][hole]]
    blurred = np.stack([ndimage.gaussian_filter(out[..., c].astype(float), 4) for c in range(3)], -1)
    region = ndimage.binary_dilation(hole, structure=disk(3))
    out[region, :3] = blurred[region].clip(0, 255).astype(np.uint8)
    return out

def save(cell, mask, path):
    out = cell.copy()
    out[..., 3] = np.where(mask, out[..., 3], 0)
    ys, xs = np.where(mask)
    box = [int(xs.min()), int(ys.min()), int(xs.max()+1), int(ys.max()+1)]
    Image.fromarray(out[box[1]:box[3], box[0]:box[2]]).save(path)
    return box

rig = {}
for name in ('momo', 'pip'):
    frames, n = cells(name)
    p0 = frames[0]
    opaque = p0[..., 3] > 200
    landmarks = LANDMARKS[name]
    def hand(frame, side):
        p = landmarks[frame]['points'][12 if side == 'left' else 13]
        return (p[0]-landmarks[frame]['offset'][0])*n, p[1]*n
    # Skin colour: the most common opaque colour that is neither white nor dark.
    dark, white = dark_mask(p0), white_mask(p0)
    candidates = p0[opaque & ~dark & ~white][:, :3]
    skin = np.median(candidates, axis=0)
    def skin_mask(cell):
        return (np.abs(cell[..., :3].astype(float)-skin).sum(2) < 90) & (cell[..., 3] > 200)
    # Torso: skin region opened with a disk wider than an arm.
    torso = largest(ndimage.binary_opening(ndimage.binary_fill_holes(skin_mask(p0)), structure=disk(int(n*.055))))
    torso_wide = ndimage.binary_dilation(torso, structure=disk(int(n*.02)))
    # Accent parts by colour: Momo's cobalt hair, Pip's raspberry horns. They
    # go behind the body and can swing on their own. The mask is widened a
    # little so a small turn never opens a gap against the face.
    rgb = p0[..., :3].astype(int)
    accent = opaque & ~skin_mask(p0) & ~white & ~dark
    accent_parts = {}
    if name == 'momo':
        accent_parts['hair'] = accent & (rgb[..., 2] > rgb[..., 1] + 30)
    else:
        accent_parts['horns'] = accent & (rgb[..., 0] > 140) & (rgb[..., 1] < 110)
    accent_masks = {}
    for part_name, raw in accent_parts.items():
        cleaned = ndimage.binary_opening(raw, structure=disk(2))
        cleaned = ndimage.binary_fill_holes(ndimage.binary_closing(cleaned, structure=disk(4)))
        labels, count = ndimage.label(cleaned)
        sizes = ndimage.sum(cleaned, labels, range(1, count+1))
        keep = [i+1 for i, size in enumerate(sizes) if size > n*n*.002]
        accent_masks[part_name] = np.isin(labels, keep)
    # Body: pose 0 without the arm stubs beside the torso.
    stubs = np.zeros_like(opaque)
    for side in ('left', 'right'):
        part = component_at(skin_mask(p0) & ~torso_wide, *hand(0, side))
        if part is not None:
            stubs |= part
    body = opaque & ~ndimage.binary_dilation(stubs, structure=disk(2))
    for mask in accent_masks.values():
        body &= ~mask
    # Face features are removed from the body and drawn as separate parts.
    whites = white & ndimage.binary_opening(white, structure=disk(4))
    labels, count = ndimage.label(whites)
    sizes = ndimage.sum(whites, labels, range(1, count+1))
    eye_ids = sorted(range(1, count+1), key=lambda i: -sizes[i-1])[:2]
    eye_ids.sort(key=lambda i: np.where(labels == i)[1].mean())
    # Pupils overlap the rim of the eye white, so the eye is the hull of the
    # white plus every dark blob touching it.
    dark_labels, dark_count = ndimage.label(dark)
    def eye_mask(white_part):
        touching = np.unique(dark_labels[ndimage.binary_dilation(white_part, structure=disk(3)) & dark])
        pupil = np.isin(dark_labels, touching[touching > 0])
        return ndimage.binary_dilation(hull(white_part | pupil), structure=disk(2))
    eye_masks = [eye_mask(labels == i) for i in eye_ids]
    eyes = np.zeros_like(opaque)
    for mask in eye_masks:
        eyes |= mask
    white_labels, _ = ndimage.label(white)
    def mouth_mask(cell_dark, cell_white_labels):
        lips = largest(cell_dark)
        touching = np.unique(cell_white_labels[ndimage.binary_dilation(lips, structure=disk(3)) & (cell_white_labels > 0)])
        teeth = np.isin(cell_white_labels, touching)
        return ndimage.binary_fill_holes(ndimage.binary_dilation(lips | teeth, structure=disk(2)))
    mouth = mouth_mask(dark, white_labels)
    hole = ndimage.binary_dilation(eyes | mouth, structure=disk(3)) & body
    body_image = inpaint(p0, hole)
    parts = {}
    parts['body'] = {'box': save(body_image, body, OUT/f'{name}-body.png'), 'z': 2}
    for part_name, mask in accent_masks.items():
        wide = ndimage.binary_dilation(mask, structure=disk(int(n*.02))) & opaque
        ys, xs = np.where(mask)
        if part_name == 'horns':
            # Two horns, each pivoting at its base.
            labels, count = ndimage.label(mask)
            for i, side in zip(sorted(range(1, count+1), key=lambda i: np.where(labels == i)[1].mean())[:2], ('left', 'right')):
                one = ndimage.binary_dilation(labels == i, structure=disk(int(n*.02))) & opaque
                hy, hx = np.where(labels == i)
                box = save(p0, one, OUT/f'{name}-horn-{side}.png')
                parts[f'horn-{side}'] = {'box': box, 'pivot': [int(hx.mean()), int(hy.max())], 'z': 1}
        else:
            box = save(p0, wide, OUT/f'{name}-{part_name}.png')
            centre = [int((eye_masks[0].nonzero()[1].mean() + eye_masks[1].nonzero()[1].mean()) / 2), int(eye_masks[0].nonzero()[0].mean())]
            parts[part_name] = {'box': box, 'pivot': centre, 'z': 1}
    for side, mask in zip(('left', 'right'), eye_masks):
        eye = p0.copy()
        eye[ndimage.binary_erosion(mask, structure=disk(3)), :3] = 255  # pupils are drawn in code
        parts[f'eye-{side}'] = {'box': save(eye, mask, OUT/f'{name}-eye-{side}.png'), 'z': 3}
    parts['mouth'] = {'box': save(p0, mouth, OUT/f'{name}-mouth.png'), 'z': 3}
    for variant, frame in (('open', 5), ('laugh', 7)):
        cell = frames[frame]
        mask = mouth_mask(dark_mask(cell), ndimage.label(white_mask(cell))[0])
        parts[f'mouth-{variant}'] = {'box': save(cell, mask, OUT/f'{name}-mouth-{variant}.png'), 'z': 3}
    # Arms: raised arms from pose 5, skin coloured and attached to the hand landmark.
    p5 = frames[5]
    torso5 = largest(ndimage.binary_opening(ndimage.binary_fill_holes(skin_mask(p5)), structure=disk(int(n*.055))))
    torso5 = ndimage.binary_dilation(torso5, structure=disk(int(n*.015)))
    cy, cx = ndimage.center_of_mass(torso5)
    for side in ('left', 'right'):
        arm = component_at(skin_mask(p5) & ~torso5, *hand(5, side))
        if arm is None or arm.sum() < n*n*.004:
            continue
        arm = ndimage.binary_fill_holes(ndimage.binary_closing(arm, structure=disk(3)))
        ys, xs = np.where(arm)
        d = (xs-cx)**2 + (ys-cy)**2
        pivot = [int(xs[d.argmin()]), int(ys[d.argmin()])]
        far = (xs-pivot[0])**2 + (ys-pivot[1])**2
        tip = [int(xs[far.argmax()]), int(ys[far.argmax()])]
        box = save(p5, arm, OUT/f'{name}-arm-{side}.png')
        parts[f'arm-{side}'] = {'box': box, 'pivot': pivot, 'tip': tip, 'z': 1}
    # Shoulders: on the torso outline at 58% height, moved 5% inwards so the
    # flat root of each arm lies over the body and stays hidden.
    row = np.where(torso[int(n*.58)])[0]
    shoulders = {'left': [int(row.min()+n*.05), int(n*.58)], 'right': [int(row.max()-n*.05), int(n*.58)]}
    for side in ('left', 'right'):
        if f'arm-{side}' in parts:
            parts[f'arm-{side}']['shoulder'] = shoulders[side]
            parts[f'arm-{side}']['z'] = 3
    for key in list(parts):
        if key.startswith('eye') or key.startswith('mouth'):
            parts[key]['z'] = 4
    rig[name] = {'cell': n, 'skin': [int(v) for v in skin], 'parts': parts}
    print(name, {k: v['box'] for k, v in parts.items()})

(ROOT/'dist/assets/rig.json').write_text(json.dumps(rig, separators=(',', ':'))+'\n')
