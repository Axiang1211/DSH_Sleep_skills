#!/usr/bin/env python3
"""Build a source/install ZIP from an explicit allowlist; never include local memory."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
out = root / 'dist'
out.mkdir(exist_ok=True)
archive = out / f'dsh-sleep-skills-{version}.zip'
include = ['src', 'bin', 'skills', 'docs', 'examples', 'test', 'scripts', 'package.json',
           'package-lock.json', 'cordis.patch.yml', 'README.md', 'LICENSE', 'Install.cmd', 'Install.command']
with ZipFile(archive, 'w', ZIP_DEFLATED) as z:
    for item in include:
        path = root / item
        if not path.exists():
            continue
        for file in sorted(path.rglob('*')) if path.is_dir() else [path]:
            if not file.is_file() or '__pycache__' in file.parts:
                continue
            if file.is_symlink():
                raise RuntimeError(f'Refusing symlink: {file}')
            z.write(file, f'dsh-sleep-skills-{version}/{file.relative_to(root).as_posix()}')
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
(out / 'SHA256SUMS.txt').write_text(f'{checksum}  {archive.name}\n')
print(archive)
