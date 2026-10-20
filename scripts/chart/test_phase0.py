import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name('phase0-saori.sh')


class ArchiveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name)
        self.source = self.home / 'Devlopment' / 'fake repo' / 'src' / 'context'
        self.source.mkdir(parents=True)
        (self.source / 'synthetic.json').write_text('{"childId":"synthetic"}')
        (self.source / 'nested').mkdir()
        (self.source / 'nested' / 'word list.txt').write_text('able\nagain\n')
        self.before = self.inventory()

    def inventory(self):
        return {str(p.relative_to(self.source)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in self.source.rglob('*') if p.is_file()}

    def run_script(self, *args):
        return subprocess.run(['bash', str(SCRIPT), *args], env={**os.environ, 'HOME': str(self.home)},
                              capture_output=True, text=True, timeout=30)

    def test_dry_run_discovers_misspelled_development_and_writes_nothing(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(str(self.source), result.stdout)
        self.assertFalse((self.home / 'SunnyData').exists())
        self.assertEqual(self.before, self.inventory())

    def test_apply_verifies_every_byte_and_does_not_change_source(self):
        result = self.run_script('--apply', '--writers-stopped', '--source', str(self.source))
        self.assertEqual(result.returncode, 0, result.stderr)
        archives = list((self.home / 'SunnyData' / 'archive').glob('*.tar.gz'))
        self.assertEqual(len(archives), 1)
        manifest = json.loads(Path(str(archives[0]) + '.manifest.json').read_text())
        with tarfile.open(archives[0]) as archive:
            actual = {m.name: hashlib.sha256(archive.extractfile(m).read()).hexdigest()
                      for m in archive.getmembers() if m.isfile()}
        self.assertEqual(actual, self.before)
        self.assertEqual(manifest['files'], self.before)
        self.assertEqual(self.before, self.inventory())
        self.assertEqual((self.home / 'SunnyData').stat().st_mode & 0o777, 0o700)
        self.assertFalse(list((self.home / 'SunnyData' / 'archive').glob('*.partial')))

    def test_apply_requires_source(self):
        result = self.run_script('--apply')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('source_required', result.stderr)
        self.assertFalse((self.home / 'SunnyData').exists())

    def test_apply_requires_explicit_stopped_writers(self):
        result = self.run_script('--apply', '--source', str(self.source))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('writers_must_be_stopped', result.stderr)
        self.assertFalse((self.home / 'SunnyData').exists())

    def test_symlinked_source_member_is_rejected_without_following_it(self):
        (self.source / 'link').symlink_to('/etc/hosts')
        result = self.run_script('--apply', '--writers-stopped', '--source', str(self.source))
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('symlink', result.stderr)
        self.assertFalse(list((self.home / 'SunnyData' / 'archive').glob('*.tar.gz')))

    def test_change_during_capture_never_publishes_complete_archive(self):
        spec = importlib.util.spec_from_file_location('phase0', SCRIPT.with_suffix('.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        original = tarfile.TarFile.add
        def changing_add(archive, name, *args, **kwargs):
            result = original(archive, name, *args, **kwargs)
            Path(name).write_text('changed while archiving')
            return result
        with patch.object(tarfile.TarFile, 'add', changing_add):
            with self.assertRaisesRegex(RuntimeError, 'source_changed'):
                module.archive_source(self.source, self.home)
        self.assertFalse(list((self.home / 'SunnyData' / 'archive').glob('*.tar.gz')))

    def test_manifest_directory_sync_failure_cannot_publish_archive(self):
        spec = importlib.util.spec_from_file_location('phase0', SCRIPT.with_suffix('.py'))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with patch.object(module, 'sync_directory', side_effect=OSError('sync failed')) as sync:
            with self.assertRaisesRegex(OSError, 'sync failed'):
                module.archive_source(self.source, self.home)
            self.assertEqual(sync.call_count, 1)
        self.assertFalse(list((self.home / 'SunnyData' / 'archive').glob('*.tar.gz')))


if __name__ == '__main__':
    unittest.main()
