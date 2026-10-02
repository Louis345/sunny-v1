"""Read-only discovery; explicitly requested archives never alter source files."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
import tarfile
import uuid


def log(action, result, **facts):
    print(' 🎮 [chart-archive] [%s] [%s] %s' % (action, result, json.dumps(facts)), flush=True)


def command(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired) as error:
        log('inspect', 'unavailable', command=args[0], reason=str(error))
        return ''
    if result.returncode:
        # Do not echo output: ps environments and command errors can contain credentials.
        log('inspect', 'unavailable', command=args[0], exitCode=result.returncode)
        return ''
    return result.stdout.strip()


def inventory(source):
    source = Path(source)
    if not source.is_dir():
        raise RuntimeError('source_not_directory')
    files = {}
    stack = [source]
    while stack:
        directory = stack.pop()
        for entry in sorted(directory.iterdir()):
            if entry.is_symlink():
                raise RuntimeError('source_symlink_rejected:' + str(entry))
            if entry.is_dir():
                stack.append(entry)
            elif entry.is_file():
                digest = hashlib.sha256()
                with entry.open('rb') as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                        digest.update(chunk)
                files[entry.relative_to(source).as_posix()] = digest.hexdigest()
            else:
                raise RuntimeError('source_special_file_rejected:' + str(entry))
    return dict(sorted(files.items()))


def discover(home):
    log('environment', 'ok', host=socket.gethostname(), macOS=command(['sw_vers', '-productVersion']),
        node=command(['node', '--version']), npm=command(['npm', '--version']), sqlite3=shutil.which('sqlite3'))
    roots = set()
    for spelling in ['Development', 'Devlopment']:
        roots.update(home.glob(spelling + '/*/src/context'))
    for line in command(['ps', '-axo', 'pid=,comm=']).splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) != 2 or Path(parts[1]).name not in ['node', 'nodejs']:
            continue
        pid = parts[0]
        cwd_lines = command(['lsof', '-a', '-p', pid, '-d', 'cwd', '-Fn']).splitlines()
        cwd = next((line[1:] for line in cwd_lines if line.startswith('n')), None)
        environment = command(['ps', 'eww', '-p', pid, '-o', 'command='])
        match = re.search(r'(?:^|\s)SUNNY_CONTEXT_ROOT=(.*?)(?=\s[A-Za-z_][A-Za-z0-9_]*=|$)', environment)
        context = match.group(1).strip() if match else None
        resolved = (Path(cwd) / context).resolve() if context and cwd else (Path(context).resolve() if context else None)
        if resolved:
            roots.add(resolved)
        log('process', 'ok', pid=pid, cwd=cwd, SUNNY_CONTEXT_ROOT=context,
            resolvedContextRoot=str(resolved) if resolved else None)
    for root in sorted(roots):
        if not root.is_dir():
            log('candidate', 'missing', path=str(root))
            continue
        files = [p for p in root.rglob('*') if p.is_file() and not p.is_symlink()]
        latest = max((p.stat().st_mtime for p in files), default=0)
        log('candidate', 'ok', path=str(root), realPath=str(root.resolve()), fileCount=len(files),
            latestModified=datetime.fromtimestamp(latest, timezone.utc).isoformat())


def private_directory(directory):
    if directory.is_symlink():
        raise RuntimeError('destination_symlink_rejected')
    if directory.exists():
        if not directory.is_dir() or directory.stat().st_mode & 0o077:
            raise RuntimeError('destination_must_be_private_directory:' + str(directory))
    else:
        directory.mkdir(mode=0o700)


def sync_directory(directory):
    descriptor = os.open(directory, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def archive_source(source, home):
    if source.is_symlink():
        raise RuntimeError('source_symlink_rejected')
    source = source.resolve(strict=True)
    before = inventory(source)
    if not before:
        raise RuntimeError('source_empty')
    destination = home / 'SunnyData' / 'archive'
    if destination.resolve().is_relative_to(source):
        raise RuntimeError('destination_inside_source')
    private_directory(destination.parent)
    private_directory(destination)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    host = re.sub(r'[^A-Za-z0-9_.-]', '_', socket.gethostname())
    final = destination / ('sunny-context-%s-%s-%s.tar.gz' % (host, stamp, uuid.uuid4().hex[:12]))
    partial = Path(str(final) + '.partial')
    manifest_path = Path(str(final) + '.manifest.json')
    manifest_partial = Path(str(manifest_path) + '.partial')
    # Exclusive creation prevents replacing any existing file. Failure leaves clearly partial files.
    with partial.open('xb') as raw:
        os.chmod(partial, 0o600)
        with tarfile.open(fileobj=raw, mode='w:gz', dereference=False) as archive:
            for name in before:
                archive.add(source / name, arcname=name, recursive=False)
        raw.flush()
        os.fsync(raw.fileno())
    if inventory(source) != before:
        raise RuntimeError('source_changed_during_archive')
    actual = {}
    with tarfile.open(partial, 'r:gz') as archive:
        for member in archive:
            if not member.isfile() or member.name in actual:
                raise RuntimeError('archive_member_invalid')
            digest = hashlib.sha256()
            with archive.extractfile(member) as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(chunk)
            actual[member.name] = digest.hexdigest()
    if actual != before or inventory(source) != before:
        raise RuntimeError('archive_verification_failed_or_source_changed')
    manifest = {'sourceHost': socket.gethostname(), 'sourcePath': str(source), 'capturedAt': stamp,
                'writerQuiescence': 'operator-confirmed; source hashes verified before and after capture',
                'fileCount': len(before), 'files': before,
                'manifestSha256': hashlib.sha256(json.dumps(before, sort_keys=True).encode()).hexdigest()}
    with manifest_partial.open('x') as stream:
        os.chmod(manifest_partial, 0o600)
        json.dump(manifest, stream, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    # Publish the archive last; existence of a final archive implies a verified manifest exists.
    os.link(manifest_partial, manifest_path)
    sync_directory(destination)
    os.link(partial, final)
    sync_directory(destination)
    manifest_partial.unlink()
    partial.unlink()
    log('archive', 'verified', path=str(final), bytes=final.stat().st_size,
        fileCount=len(before), manifest=str(manifest_path), manifestSha256=manifest['manifestSha256'])
    return final


def main():
    parser = argparse.ArgumentParser(description='Discover context roots; --apply archives a stable explicit source without changing it.')
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--writers-stopped', action='store_true', help='Confirm kiosk and other source writers are stopped; never stops them automatically.')
    parser.add_argument('--source', type=Path)
    args = parser.parse_args()
    home = Path.home()
    discover(home)
    if args.apply:
        if not args.source:
            raise RuntimeError('source_required: pass --source after reviewing discovery output')
        if not args.writers_stopped:
            raise RuntimeError('writers_must_be_stopped: archive between sessions, then pass --writers-stopped')
        archive_source(args.source, home)
    else:
        log('dry-run', 'complete', source=str(args.source) if args.source else None, writes=0)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(' 🎮 [chart-archive] [archive] [failed] ' + str(error), file=sys.stderr)
        sys.exit(1)
