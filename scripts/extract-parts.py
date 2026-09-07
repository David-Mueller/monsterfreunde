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
for name in ('momo', 'pip', 'lumi', 'zing'):
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
    if name == 'zing':
        # The fake-alpha recovery necessarily retains some pale edge pixels;
        # use the dominant interior pink for lids and face cleanup.
        skin = np.array([252, 122, 181], dtype=float)
    def skin_mask(cell):
        return (np.abs(cell[..., :3].astype(float)-skin).sum(2) < 90) & (cell[..., 3] > 200)
    # Torso: skin region opened with a disk wider than an arm.
    torso = largest(ndimage.binary_opening(ndimage.binary_fill_holes(skin_mask(p0)), structure=disk(int(n*.055))))
    torso_wide = ndimage.binary_dilation(torso, structure=disk(int(n*.02)))
    # Accent parts by colour: hair, crests and horns. They
    # go behind the body and can swing on their own. The mask is widened a
    # little so a small turn never opens a gap against the face.
    rgb = p0[..., :3].astype(int)
    yy = np.indices(opaque.shape)[0]
    accent = opaque & ~skin_mask(p0) & ~white & ~dark
    accent_parts = {}
    if name == 'momo':
        accent_parts['hair'] = accent & (rgb[..., 2] > rgb[..., 1] + 30)
    elif name == 'pip':
        accent_parts['horns'] = accent & (rgb[..., 0] > 140) & (rgb[..., 1] < 110)
    elif name == 'lumi':
        accent_parts['hair'] = accent & (rgb[..., 2] > rgb[..., 0] + 35) & (rgb[..., 1] < 130)
        # The chest star shares the horn colour, so only keep yellow above
        # the face for the independently swaying antenna-horns.
        accent_parts['horns'] = accent & (rgb[..., 0] > 190) & (rgb[..., 1] > 120) & (rgb[..., 2] < 130) & (yy < n * .42)
    elif name == 'zing':
        accent_parts['hair'] = accent & (rgb[..., 2] > rgb[..., 0] + 55) & (rgb[..., 1] < 155)
    accent_masks = {}
    for part_name, raw in accent_parts.items():
        cleaned = ndimage.binary_opening(raw, structure=disk(2))
        cleaned = ndimage.binary_fill_holes(ndimage.binary_closing(cleaned, structure=disk(4)))
        labels, count = ndimage.label(cleaned)
        sizes = ndimage.sum(cleaned, labels, range(1, count+1))
        minimum = n * n * (.00025 if name == 'zing' else .002)
        keep = [i+1 for i, size in enumerate(sizes) if size > minimum]
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
    if name == 'lumi':
        # The softly shaded arm edges are wider than the skin-colour mask.
        # Keep only the central torso through the arm band; animated arms are
        # placed back on top by the rig.
        gy = np.indices(opaque.shape)[0]
        arm_band = (gy > n * .20) & (gy < n * .83)
        radius = n * .17
        filled_skin = ndimage.binary_fill_holes(skin_mask(p0))
        eroded = ndimage.distance_transform_edt(filled_skin) >= radius
        clean_torso = largest(ndimage.distance_transform_edt(~eroded) <= radius)
        clean_torso = ndimage.binary_dilation(clean_torso, structure=disk(2))
        body &= ~(arm_band & ~clean_torso)
    if name == 'zing':
        # Zing's arms are thinner than their antialiased outline. Remove the
        # complete side zones, including highlights, before rig arms are
        # placed over the shoulders.
        gy = np.indices(opaque.shape)[0]
        arm_band = (gy > n * .32) & (gy < n * .61)
        clean_torso = ndimage.binary_dilation(torso, structure=disk(2))
        body &= ~(arm_band & ~clean_torso)
    if name in ('lumi', 'zing'):
        body = largest(body)
    # Face features are removed from the body and drawn as separate parts.
    whites = white & ndimage.binary_opening(white, structure=disk(4))
    labels, count = ndimage.label(whites)
    sizes = ndimage.sum(whites, labels, range(1, count+1))
    dark_labels, dark_count = ndimage.label(dark)
    if name == 'zing':
        # Zing's playfully staggered eyes overlap into one white shape. Build
        # two clean oval eye boxes around the two pupil components instead.
        dark_sizes = ndimage.sum(dark, dark_labels, range(1, dark_count+1))
        pupil_ids = sorted(range(1, dark_count+1), key=lambda i: -dark_sizes[i-1])[1:3]
        pupil_ids.sort(key=lambda i: np.where(dark_labels == i)[1].mean())
        eye_masks = []
        grid_y, grid_x = np.indices(opaque.shape)
        for pupil_id in pupil_ids:
            py, px = np.where(dark_labels == pupil_id)
            cx, cy = px.mean(), py.mean()
            rx = max(18, (px.max() - px.min() + 1) * 1.12)
            ry = max(21, (py.max() - py.min() + 1) * 1.12)
            eye_masks.append(((grid_x - cx) / rx) ** 2 + ((grid_y - cy) / ry) ** 2 <= 1)
    else:
        eye_ids = sorted(range(1, count+1), key=lambda i: -sizes[i-1])[:2]
        eye_ids.sort(key=lambda i: np.where(labels == i)[1].mean())
        # Pupils overlap the rim of the eye white, so the eye is the hull of
        # the white plus every dark blob touching it.
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
        if name == 'zing':
            # The two white eyes touch each other and sit close to the mouth;
            # filling the dark lip contour keeps only the teeth inside it.
            return ndimage.binary_fill_holes(ndimage.binary_dilation(lips, structure=disk(2)))
        touching = np.unique(cell_white_labels[ndimage.binary_dilation(lips, structure=disk(3)) & (cell_white_labels > 0)])
        teeth = np.isin(cell_white_labels, touching)
        return ndimage.binary_fill_holes(ndimage.binary_dilation(lips | teeth, structure=disk(2)))
    mouth = mouth_mask(dark, white_labels)
    # Eyebrows are small dark strokes above the eyes; they are drawn in code
    # so they can frown, and are painted out of the body here.
    eye_top = min(int(np.where(m)[0].min()) for m in eye_masks)
    eye_bottom = max(int(np.where(m)[0].max()) for m in eye_masks)
    dark_labels, dark_count = ndimage.label(dark)
    brows = np.zeros_like(opaque)
    for i in range(1, dark_count+1):
        ys, xs = np.where(dark_labels == i)
        if 15 < len(ys) < 900 and ys.max() < eye_top + (eye_bottom-eye_top)*.35 and ys.min() > eye_top - (eye_bottom-eye_top)*1.2:
            brows |= dark_labels == i
    brows = ndimage.binary_dilation(brows, structure=disk(3))
    hole = ndimage.binary_dilation(eyes | mouth, structure=disk(3)) & body | brows & body
    if name in ('lumi', 'zing'):
        # Their softly shaded sheets need a clean facial canvas rather than
        # blurred remnants under the code-drawn eyes and mouth. Zing's eye
        # whites also overlap, so his region is slightly taller and narrower.
        gy, gx = np.indices(opaque.shape)
        if name == 'zing':
            face = ((gx - n * .55) / (n * .13)) ** 2 + ((gy - n * .23) / (n * .18)) ** 2 < 1
        else:
            face = ((gx - n * .50) / (n * .23)) ** 2 + ((gy - n * .46) / (n * .25)) ** 2 < 1
        features = ndimage.binary_dilation((white | dark) & face, structure=disk(5))
        hole |= features & body
        body_image = p0.copy()
        body_image[hole, :3] = skin.astype(np.uint8)
        if name == 'lumi':
            # Paint out the inner contour/highlight strokes of the original
            # resting arms too; their silhouette has already been trimmed.
            cheeks = opaque & (rgb[..., 0] > 235) & (rgb[..., 1] < 190) & (rgb[..., 2] < 225)
            side_arms = body & ~cheeks & (gy > n * .48) & (gy < n * .82) & ((gx < n * .34) | (gx > n * .66))
            body_image[side_arms, :3] = skin.astype(np.uint8)
    else:
        body_image = inpaint(p0, hole)
    # Legs: everything below the thick torso core. Long legs get a knee and
    # two segments, stubby feet stay one piece. Legs sit behind the body so
    # the hip joint is hidden, and the upper end is stretched a little into
    # the body so nothing pokes out when the leg swings.
    silhouette = largest(ndimage.binary_fill_holes(opaque))
    leg_radius = int(min(n*.08, silhouette.sum(1).max()*.3))
    leg_core = largest(ndimage.binary_opening(silhouette, structure=disk(leg_radius)))
    core_rows = np.where(leg_core.any(1))[0]
    core_bottom = int(core_rows.max()) if len(core_rows) else int(n*.8)
    leg_zone = opaque & ~ndimage.binary_dilation(leg_core, structure=disk(int(n*.015))) & (yy > core_bottom - n*.08)
    leg_zone = ndimage.binary_opening(leg_zone, structure=disk(2))
    leg_labels, leg_count = ndimage.label(leg_zone)
    leg_sizes = ndimage.sum(leg_zone, leg_labels, range(1, leg_count+1))
    big = [i+1 for i, size in enumerate(leg_sizes) if size > n*n*.003 and np.where(leg_labels == i+1)[0].min() > core_bottom - n*.1]
    centre_x = ndimage.center_of_mass(leg_core)[1]
    leg_masks = {}
    if len(big) >= 2:
        big.sort(key=lambda i: np.where(leg_labels == i)[1].mean())
        leg_masks['left'], leg_masks['right'] = leg_labels == big[0], leg_labels == big[-1]
    elif len(big) == 1:
        one = leg_labels == big[0]
        xs_grid = np.indices(opaque.shape)[1]
        leg_masks['left'], leg_masks['right'] = one & (xs_grid < centre_x), one & (xs_grid >= centre_x)
    legs = np.zeros_like(opaque)
    for mask in leg_masks.values():
        legs |= mask
    body &= ~legs
    parts = {}
    parts['body'] = {'box': save(body_image, body, OUT/f'{name}-body.png'), 'z': 2}
    for side, mask in leg_masks.items():
        if mask.sum() < n*n*.002:
            continue
        ys, xs = np.where(mask)
        top, bottom = int(ys.min()), int(ys.max())
        height = bottom - top
        # Reach up into the body for the hidden hip joint.
        reach = ndimage.binary_dilation(mask, structure=disk(int(n*.03))) & opaque & (yy < top + n*.03) & (yy >= top - n*.04)
        whole = mask | reach
        hip_rows = np.where(whole[top:top+6].any(1))[0]
        hip_x = int(np.where(whole[top:top+6])[1].mean()) if len(hip_rows) else int(xs.mean())
        hip = [hip_x, top + int(n*.015)]
        if height > n*.18:
            knee_y = top + int(height*.5)
            knee_x = int(np.where(whole[knee_y])[0].mean())
            overlap = int(n*.02)
            upper = whole & (yy < knee_y + overlap)
            lower = whole & (yy >= knee_y - overlap)
            parts[f'leg-{side}'] = {'box': save(p0, upper, OUT/f'{name}-leg-{side}.png'), 'pivot': hip, 'z': 1,
                                    'lower': {'box': save(p0, lower, OUT/f'{name}-shin-{side}.png'), 'pivot': [knee_x, knee_y]}}
        else:
            parts[f'leg-{side}'] = {'box': save(p0, whole, OUT/f'{name}-leg-{side}.png'), 'pivot': hip, 'z': 1}
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
        # Eye whites, pupils, lids and brows are drawn in code; only the box is needed.
        ys, xs = np.where(mask)
        parts[f'eye-{side}'] = {'box': [int(xs.min()), int(ys.min()), int(xs.max()+1), int(ys.max()+1)], 'z': 4}
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
        minimum_arm = n * n * (.0008 if name == 'zing' else .004)
        if arm is None or arm.sum() < minimum_arm:
            continue
        arm = ndimage.binary_fill_holes(ndimage.binary_closing(arm, structure=disk(3)))
        ys, xs = np.where(arm)
        d = (xs-cx)**2 + (ys-cy)**2
        pivot = [int(xs[d.argmin()]), int(ys[d.argmin()])]
        far = (xs-pivot[0])**2 + (ys-pivot[1])**2
        tip = [int(xs[far.argmax()]), int(ys[far.argmax()])]
        box = save(p5, arm, OUT/f'{name}-arm-{side}.png')
        parts[f'arm-{side}'] = {'box': box, 'pivot': pivot, 'tip': tip, 'z': 1}
    # Shoulders: a little above where the resting hand hangs in pose 0, on
    # the torso outline of that row, moved inwards so the flat root of each
    # arm lies over the body and stays hidden. Thin bodies get a smaller
    # inset and a more outward resting angle so the arms stay visible.
    shoulders = {}
    skin_filled = ndimage.binary_fill_holes(ndimage.binary_closing(skin_mask(p0), structure=disk(4)))
    for side in ('left', 'right'):
        hx0, hy0 = hand(0, side)
        row_y = int(min(max(hy0 - n*.10, n*.2), n*.8))
        row = np.where(largest(skin_filled)[row_y])[0]
        full = np.where(largest(opaque)[row_y])[0]
        # Shaded or striped bodies leave a narrow skin row; fall back to the
        # full silhouette when the skin row is clearly narrower.
        if len(row) == 0 or (len(full) and row.max()-row.min() < .6*(full.max()-full.min())):
            row = full
        if len(row) == 0:
            row_y = int(n*.58); row = np.where(torso[row_y])[0]
        width = row.max() - row.min()
        inset = min(n*.05, width*.3)
        shoulders[side] = [int(row.min()+inset) if side == 'left' else int(row.max()-inset), row_y]
    rest = 112 if width > n*.3 else 124
    for side in ('left', 'right'):
        if f'arm-{side}' in parts:
            parts[f'arm-{side}']['shoulder'] = shoulders[side]
            parts[f'arm-{side}']['rest'] = rest
            parts[f'arm-{side}']['z'] = 3
    for key in list(parts):
        if key.startswith('eye') or key.startswith('mouth'):
            parts[key]['z'] = 4
    brow_pixels = p0[brows & dark][:, :3]
    brow_colour = [int(v) for v in np.median(brow_pixels, axis=0)] if len(brow_pixels) else [30, 20, 60]
    rig[name] = {'cell': n, 'skin': [int(v) for v in skin], 'brow': brow_colour, 'parts': parts}
    print(name, {k: v['box'] for k, v in parts.items()})

(ROOT/'dist/assets/rig.json').write_text(json.dumps(rig, separators=(',', ':'))+'\n')
