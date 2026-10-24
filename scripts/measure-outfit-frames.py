"""Emit display geometry; source images are never changed. Requires Pillow/NumPy.

Figures are identified across the whole atlas. SVG silhouette envelopes exclude
neighbour fragments while retaining shoes extending across a nominal grid line.
Touching main figures are rejected: repair the source rather than cut a garment.
"""
import json
import re
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def connected_figures(alpha):
    """Label alpha runs with eight-connectivity."""
    parents, runs = [], []

    def root(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    previous = []
    for y, row in enumerate(alpha > 12):
        edges = np.flatnonzero(np.diff(np.pad(row, (1, 1)).astype(np.int8)))
        current, previous_index = [], 0
        for x0, x1 in zip(edges[::2], edges[1::2]):
            index = len(parents)
            parents.append(index)
            current.append((int(x0), int(x1), index))
            runs.append((int(x0), int(x1), y, index))
            while previous_index < len(previous) and previous[previous_index][1] < x0:
                previous_index += 1
            neighbour = previous_index
            while neighbour < len(previous) and previous[neighbour][0] <= x1:
                parents[root(previous[neighbour][2])] = root(index)
                neighbour += 1
        previous = current
    groups = {}
    for x0, x1, y, index in runs:
        group = groups.setdefault(root(index), {'area': 0, 'box': [x0, y, x1, y+1], 'runs': []})
        group['area'] += x1-x0
        box = group['box']
        group['box'] = [min(box[0], x0), min(box[1], y), max(box[2], x1), max(box[3], y+1)]
        group['runs'].append((x0, x1, y))
    return sorted(groups.values(), key=lambda group: -group['area'])


def geometry(figure, image_width, image_height):
    # Dilation retains antialiased edges. The image's own alpha still defines
    # interior gaps, so the envelope does not fill space between legs or arms.
    left, right = {}, {}
    for x0, x1, y in figure['runs']:
        for row in range(max(0, y-4), min(image_height, y+5)):
            left[row] = min(left.get(row, image_width), max(0, x0-4))
            right[row] = max(right.get(row, 0), min(image_width, x1+4))
    y0, y1 = min(left), max(left)+1
    bands = []
    for y in range(y0, y1, 4):
        end = min(y+4, y1)
        bands.append((min(left[row] for row in range(y, end)),
                      max(right[row] for row in range(y, end)), y, end))
    # Use stair steps rather than diagonals: connecting points must never shave
    # pixels off a band's expanded horizontal interval.
    points = []
    for x0, _, y, end in bands:
        points.extend([(x0, y), (x0, end)])
    for _, x1, y, end in reversed(bands):
        points.extend([(x1, end), (x1, y)])
    def simplify(chain):
        if len(chain) < 3:
            return chain
        ax, ay = chain[0]
        bx, by = chain[-1]
        length = (bx-ax)**2 + (by-ay)**2
        distances = [((by-ay)*(x-ax)-(bx-ax)*(y-ay))**2 / max(1, length) for x, y in chain]
        index = max(range(len(chain)), key=distances.__getitem__)
        if distances[index] <= 1:
            return [chain[0], chain[-1]]
        return simplify(chain[:index+1])[:-1] + simplify(chain[index:])
    middle = len(points)//2
    candidate = simplify(points[:middle]) + simplify(points[middle:])
    # Check every source run against the simplified polygon. If any opaque
    # source pixel would be lost, keep the original expanded envelope.
    intersections = {}
    for a, b in zip(candidate, candidate[1:]+candidate[:1]):
        ax, ay = a
        bx, by = b
        if ay == by:
            continue
        for row in range(min(ay, by), max(ay, by)):
            x = ax + (row+0.5-ay)*(bx-ax)/(by-ay)
            intersections.setdefault(row, []).append(x)
    if all(min(intersections.get(y, [image_width])) <= x0 and
           max(intersections.get(y, [0])) >= x1 for x0, x1, y in figure['runs']):
        points = candidate
    path = 'M' + 'L'.join(f'{x},{y}' for x, y in points) + 'Z'
    x0, x1 = min(left.values()), max(right.values())
    return [x0, y0, x1-x0, y1-y0], path


def main():
    source = (ROOT / 'src/story/companion.ts').read_text(encoding='utf-8')
    outfits = re.findall(r'\{ id: "(\w+)"', source)
    assert len(outfits) == 24
    bounds, paths = {}, {}
    for outfit in outfits:
        bounds[outfit], paths[outfit] = [], []
        for suffix, count in [('', 3), ('-expressions-b', 3), ('-expressions-c', 2)]:
            repaired = ROOT / f'src/assets/wardrobe-v4-{outfit}{suffix}.png'
            source_path = repaired if repaired.exists() else ROOT / f'src/assets/wardrobe-v3-{outfit}{suffix}.png'
            with Image.open(source_path) as image:
                figures = [group for group in connected_figures(np.asarray(image.getchannel('A'))) if group['area'] > 15000]
                assert len(figures) == count, f'{source_path.name}: figures overlap; repair source before measuring'
                figures.sort(key=lambda group: group['box'][0])
                cell_width = image.width // count
                for cell, figure in enumerate(figures):
                    box, path = geometry(figure, image.width, image.height)
                    x, y, width, height = box
                    bounds[outfit].append([x-cell*cell_width, y, width, height, cell_width, image.height])
                    paths[outfit].append(path)
    output = '// Generated by scripts/measure-outfit-frames.py. Source images remain unchanged.\n'
    output += 'import type { OutfitId } from "../story/companion";\n'
    output += 'export const OUTFIT_VISIBLE_FRAMES: Record<OutfitId, readonly (readonly [number, number, number, number, number, number])[]> = '
    output += json.dumps(bounds, indent=2) + ';\n'
    output += 'export const OUTFIT_CLIP_PATHS: Record<OutfitId, readonly string[]> = '
    output += json.dumps(paths, indent=2) + ';\n'
    (ROOT / 'src/ui/outfitBounds.ts').write_text(output, encoding='utf-8')
    print(f'Measured {len(outfits)*8} complete silhouettes without changing art')


if __name__ == '__main__':
    main()
