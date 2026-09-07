"""Turn image-generator checkerboards into real PNG transparency.

The generator occasionally paints its transparency preview into the sprite
sheet.  Monster colours are strongly chromatic while the preview grid is
neutral grey, so we can recover the artwork without redrawing it.  Large
neutral islands touching coloured pixels (eye whites) are retained too.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage


def disk(radius: int) -> np.ndarray:
    y, x = np.ogrid[-radius : radius + 1, -radius : radius + 1]
    return x * x + y * y <= radius * radius


def remove_small(mask: np.ndarray, minimum: int) -> np.ndarray:
    labels, count = ndimage.label(mask)
    if not count:
        return mask
    sizes = ndimage.sum(mask, labels, range(1, count + 1))
    keep = np.flatnonzero(sizes >= minimum) + 1
    return np.isin(labels, keep)


def recover_cell(rgb: np.ndarray) -> np.ndarray:
    maximum = rgb.max(axis=2).astype(np.int16)
    minimum = rgb.min(axis=2).astype(np.int16)
    chroma = maximum - minimum

    # Saturated artwork plus the character's very dark mouth and pupils.
    coloured = (chroma > 24) | (maximum < 105)
    coloured = remove_small(coloured, 8)

    # The coloured head/body surrounds white eyes and the dark mouth surrounds
    # its white teeth. Closing then filling those holes recovers the neutral
    # features without ever selecting the similarly neutral background grid.
    core = ndimage.binary_closing(coloured, structure=disk(6))
    core = ndimage.binary_fill_holes(core)
    core = remove_small(core, 16)

    # A tight mask is important for very thin legs: expanding into the fake
    # grid would leave bright fringe pixels after the sprite is scaled down.
    return remove_small(core, 16)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--rows", type=int, default=2)
    args = parser.parse_args()

    image = Image.open(args.source).convert("RGB")
    rgb = np.asarray(image)
    height, width = rgb.shape[:2]
    mask = np.zeros((height, width), dtype=bool)
    for row in range(args.rows):
        y0, y1 = round(row * height / args.rows), round((row + 1) * height / args.rows)
        for column in range(args.columns):
            x0, x1 = round(column * width / args.columns), round((column + 1) * width / args.columns)
            mask[y0:y1, x0:x1] = recover_cell(rgb[y0:y1, x0:x1])

    alpha = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.25))
    # The generator has already composited its antialias pixels over grey.
    # Repaint only the outer three-pixel fringe from the nearest saturated
    # interior colour, otherwise that grey survives as a bright halo.
    maximum = rgb.max(axis=2).astype(np.int16)
    minimum = rgb.min(axis=2).astype(np.int16)
    chroma = maximum - minimum
    inside_distance = ndimage.distance_transform_edt(mask)
    reliable = mask & ((chroma > 60) | (maximum < 105)) & (inside_distance > 2)
    _, nearest = ndimage.distance_transform_edt(~reliable, return_indices=True)
    fringe = mask & (inside_distance <= 3) & (chroma < 60)
    clean_rgb = rgb.copy()
    clean_rgb[fringe] = rgb[nearest[0][fringe], nearest[1][fringe]]
    output = Image.fromarray(clean_rgb).convert("RGBA")
    output.putalpha(alpha)
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    output.save(args.destination, optimize=True)


if __name__ == "__main__":
    main()
