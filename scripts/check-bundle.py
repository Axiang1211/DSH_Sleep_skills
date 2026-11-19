"""Install the ZIP into isolated homes and use only the packaged application."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
from zipfile import ZipFile

root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
name = f'dsh-sleep-skills-{version}'
archive = root / 'dist' / f'{name}.zip'
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
assert f'{digest}  {archive.name}' in (archive.parent / 'SHA256SUMS.txt').read_text().splitlines()

with TemporaryDirectory(prefix='sleep bundle ') as temporary:
    home = Path(temporary)
    with ZipFile(archive) as zipped:
        zipped.extractall(home)
    source = home / name
    app = home / 'memory' / 'app'
    env = dict(os.environ, DSH_HOME=str(home / 'dsh'), DSH_SLEEP_HOME=str(app.parent),
               DSH_SLEEP_CONFIG=str(app.parent / 'config.json'), DSH_SLEEP_SCOPE='demo')
    def node(path, *args):
        return subprocess.check_output(['node', str(path), *args], cwd=home, env=env, text=True)
    # Non-interactive setup must finish offline and leave recording disabled.
    subprocess.run(['node', str(source / 'bin/setup.mjs')], stdin=subprocess.DEVNULL,
                   cwd=home, env=env, check=True)
    cli = app / 'bin/sleep.mjs'
    assert json.loads(node(cli, 'verify'))['ok']
    assert not json.loads(node(cli, 'doctor'))['enabled']
    node(cli, 'ingest', 'demo', str(app / 'examples/events.jsonl'))
    node(cli, 'sleep', 'demo')
    helper = home / 'dsh/skills/sleep-memory/scripts/recall.mjs'
    assert json.loads(node(helper, 'search', 'Aurora'))
    print(f'{archive.name}: installed CLI and skill verified')
