import fs from "node:fs";
import os from "node:os";
import { afterAll, expect } from "vitest";
import { removeTempDirsMadeSince } from "./tempLeakGuard";

// I2: every test file removes the sunny-* temp folders it made (see removeTempDirsMadeSince). The snapshot is taken
// when this setup file loads, before the test file's own imports run, so folders made at import time count too.
const before = new Set(fs.existsSync(os.tmpdir()) ? fs.readdirSync(os.tmpdir()) : []);
afterAll(() => { removeTempDirsMadeSince(os.tmpdir(), before, expect.getState().testPath ?? "unknown"); });
