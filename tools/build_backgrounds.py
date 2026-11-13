#!/usr/bin/env python3
"""Build backgrounds/index.json and preview thumbnails for the background library.

Drop pictures (jpg, png, webp, gif) or looping videos (mp4, webm) into backgrounds/.
This runs automatically on GitHub (see .github/workflows/backgrounds.yml); to run it
yourself you need Python 3 and ffmpeg:  python3 tools/build_backgrounds.py
"""
import json, os, re, subprocess, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'backgrounds')
THUMBS = os.path.join(ROOT, 'thumbs')
VIDEO = {'.mp4', '.webm', '.mov', '.m4v'}
IMAGE = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'}


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path], capture_output=True, text=True)
    if out.returncode != 0:
        return None
    data = json.loads(out.stdout or '{}')
    v = next((s for s in data.get('streams', []) if s.get('codec_type') == 'video'), None)
    if not v:
        return None
    return {'w': int(v.get('width') or 0), 'h': int(v.get('height') or 0), 'duration': float(data.get('format', {}).get('duration') or 0)}


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-') or 'bg'


def nice(name):
    return re.sub(r'[_-]+', ' ', os.path.splitext(name)[0]).strip()


def main():
    os.makedirs(THUMBS, exist_ok=True)
    items, skipped, keep = [], [], set()
    for name in sorted(os.listdir(ROOT), key=lambda n: n.lower()):
        path = os.path.join(ROOT, name)
        ext = os.path.splitext(name)[1].lower()
        if not os.path.isfile(path) or ext not in VIDEO | IMAGE:
            continue
        info = probe(path) if os.path.getsize(path) > 1024 else None
        if not info:
            skipped.append(name)
            print(f'skipped (empty or unreadable): {name}', file=sys.stderr)
            continue
        kind = 'video' if ext in VIDEO else 'image'
        thumb = f'{slug(os.path.splitext(name)[0])}.jpg'
        keep.add(thumb)
        tpath = os.path.join(THUMBS, thumb)
        if not os.path.exists(tpath) or os.path.getmtime(tpath) < os.path.getmtime(path):
            at = ['-ss', f"{min(1.0, info['duration'] / 3):.2f}"] if kind == 'video' and info['duration'] > 0.5 else []
            subprocess.run(['ffmpeg', '-v', 'error', '-y', *at, '-i', path, '-frames:v', '1',
                            '-vf', 'scale=320:180:force_original_aspect_ratio=increase,crop=320:180', '-q:v', '4', tpath], check=True)
        items.append({
            'file': name, 'name': nice(name), 'kind': kind, 'thumb': f'thumbs/{thumb}',
            'width': info['w'], 'height': info['h'],
            **({'duration': round(info['duration'], 1)} if kind == 'video' else {}),
            'bytes': os.path.getsize(path),
        })
    for t in os.listdir(THUMBS):  # remove previews of deleted files
        if t.endswith('.jpg') and t not in keep:
            os.remove(os.path.join(THUMBS, t))
    with open(os.path.join(ROOT, 'index.json'), 'w') as f:
        json.dump({'items': items, 'skipped': skipped}, f, indent=1, ensure_ascii=False)
        f.write('\n')
    print(f'{len(items)} backgrounds, {len(skipped)} skipped')


if __name__ == '__main__':
    main()
