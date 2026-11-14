#!/usr/bin/env python3
"""Build sounds/index.json for the sound library in the Audio widget.

Drop sounds (mp3, m4a, ogg, wav, webm) into sounds/. This runs automatically on GitHub
(see .github/workflows/backgrounds.yml); to run it yourself you need Python 3 and ffmpeg:
python3 tools/build_sounds.py
"""
import hashlib, json, os, re, subprocess, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'sounds')
AUDIO = {'.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.wav', '.webm', '.flac'}


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True)
    try:
        return float(out.stdout.strip())
    except ValueError:
        return 0.0


def file_hash(path):
    h = hashlib.sha1()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()[:10]


def main():
    if not os.path.isdir(ROOT):
        return
    items, skipped = [], []
    for name in sorted(os.listdir(ROOT), key=lambda n: n.lower()):
        path = os.path.join(ROOT, name)
        if not os.path.isfile(path) or os.path.splitext(name)[1].lower() not in AUDIO:
            continue
        d = duration(path) if os.path.getsize(path) > 512 else 0
        if d <= 0:
            skipped.append(name); print(f'skipped (empty or unreadable): {name}', file=sys.stderr); continue
        items.append({'file': name, 'v': file_hash(path), 'name': re.sub(r'[_-]+', ' ', os.path.splitext(name)[0]).strip(),
                      'duration': round(d, 2), 'bytes': os.path.getsize(path)})
    with open(os.path.join(ROOT, 'index.json'), 'w') as f:
        json.dump({'items': items, 'skipped': skipped}, f, indent=1, ensure_ascii=False); f.write('\n')
    print(f'{len(items)} sounds, {len(skipped)} skipped')


if __name__ == '__main__':
    main()
