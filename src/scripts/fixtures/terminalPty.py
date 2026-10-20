import errno, os, pty, select, signal, sys, time
pid, master = pty.fork()
if pid == 0:
    os.execv(sys.argv[1], sys.argv[1:])
# macOS may not report PTY EOF after the child exits. Observe the actual
# child status as well as its output; never turn a timeout into success.
fds = [master, 0]
status = None

def interrupted(signum, frame):
    raise RuntimeError("PTY wrapper interrupted")

signal.signal(signal.SIGTERM, interrupted)
try:
    for tick in range(min(1400, int(os.environ.get("SUNNY_TEST_PTY_TICKS", "1400")))):
        ready, _, _ = select.select(fds, [], [], 0.01)
        if master in ready:
            try:
                data = os.read(master, 65536)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
                data = b""
            if data:
                os.write(1, data)
            else:
                fds.remove(master)
        if 0 in ready:
            data = os.read(0, 65536)
            if data:
                os.write(master, data)
            else:
                fds.remove(0)
        if status is None:
            done, result = os.waitpid(pid, os.WNOHANG)
            if done:
                status = result
        if status is not None and master not in select.select([master], [], [], 0)[0]:
            sys.exit(os.waitstatus_to_exitcode(status))
        if status is not None and master not in fds:
            sys.exit(os.waitstatus_to_exitcode(status))
    raise TimeoutError("PTY child did not exit and drain within the bounded wait")
finally:
    if status is None:
        try:
            os.killpg(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass  # Already exited; waitpid below still reaps it.
        for attempt in range(10):
            done, result = os.waitpid(pid, os.WNOHANG)
            if done:
                status = result
                break
            time.sleep(0.1)
        if status is None:
            raise RuntimeError("PTY child could not be reaped after SIGKILL")
    os.close(master)
