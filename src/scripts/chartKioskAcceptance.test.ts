import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { openChart } from '../chart/db';

let root: string;
let child: ChildProcess | undefined;
let output: string;
let exited: Promise<number | null>;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sunny-chart-server-'));
  const source = path.join(process.cwd(), 'src');
  fs.cpSync(source, path.join(root, 'src'), {recursive:true, filter: from => !from.startsWith(path.join(source,'context')+path.sep) || from.startsWith(path.join(source,'context/schemas'))});
  for (const name of ['tsconfig.json','package.json']) fs.copyFileSync(path.join(process.cwd(),name),path.join(root,name));
  fs.writeFileSync(path.join(root,'children.config.json'),JSON.stringify({defaultCompanionId:'elli',childCompanionIds:{'synthetic-kiosk':'elli'},childProfiles:{'synthetic-kiosk':{ttsName:'Practice Child'}}}));
  fs.symlinkSync(path.join(process.cwd(),'node_modules'),path.join(root,'node_modules'));
  output = '';
});
afterEach(async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    const timer = setTimeout(() => child?.kill('SIGKILL'), 3000);
    try { await exited; } finally { clearTimeout(timer); }
  }
  child = undefined;
  fs.rmSync(root, {recursive:true,force:true});
});
async function launch(extra: NodeJS.ProcessEnv) {
  const socket = net.createServer();
  await new Promise<void>((resolve,reject) => { socket.once('error',reject); socket.listen(0,'127.0.0.1',resolve); });
  const port = (socket.address() as net.AddressInfo).port;
  await new Promise<void>((resolve,reject) => socket.close(error => error ? reject(error) : resolve()));
  child = spawn(process.execPath,['--import','tsx','src/server.ts','--kiosk'],{
    cwd:root, env:{PATH:process.env.PATH,HOME:root,TMPDIR:os.tmpdir(),DOTENV_CONFIG_PATH:'/dev/null',PORT:String(port),SUNNY_CHILD:'synthetic-kiosk',SUNNY_MODE:'real',SUNNY_CONTEXT_ROOT:path.join(root,'src/context'),...extra},stdio:'pipe',
  });
  exited = new Promise((resolve,reject) => { child!.once('error',reject); child!.once('exit',resolve); });
  child.stdout!.on('data', chunk => { output += String(chunk); });
  child.stderr!.on('data', chunk => { output += String(chunk); });
  return port;
}
async function ready(port: number) {
  for (let attempt=0;attempt<10;attempt++) {
    if (output.includes(`server on http://localhost:${port}`)) return;
    if (child?.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve,500));
  }
  throw new Error(`chart_server_start_timeout:${output}`);
}
it('opens an empty synthetic database before readiness and closes it on shutdown',async () => {
  const chartDir=path.join(root,'chart');
  const port=await launch({SUNNY_CHART_DIR:chartDir});
  await ready(port);
  const status=await fetch(`http://127.0.0.1:${port}/api/chart/status`).then(response=>response.json()).catch(error => { throw new Error(`${String(error)}\n${output}`); });
  expect(status).toEqual({connection:'open',children:['synthetic-kiosk'],learningEventsConnected:false});
  expect(output.indexOf('[startup] [connected]')).toBeLessThan(output.indexOf('Project Sunny server'));
  const db=openChart('synthetic-kiosk',{chartDir,readonly:true});
  expect(db.sql.prepare('SELECT count(*) AS n FROM events').get()).toEqual({n:0});db.close();
  child!.kill('SIGTERM'); expect(await exited).toBe(0);
  expect(output).toContain('[chart] [close] [ok]');
},15000);
it('refuses a real kiosk with missing configuration before listening',async () => {
  await launch({SUNNY_CHILD:'reina'});
  expect(await exited).not.toBe(0);
  expect(output).toContain('chart_dir_required');
  expect(output).not.toContain('Project Sunny server');
  expect(fs.existsSync(path.join(root,'SunnyData'))).toBe(false);
},10000);
it.each([{SUNNY_MODE:'as-child'},{SUNNY_STATELESS:'true'}])('keeps nonpersistent startup away from a real-child directory: %j',async mode => {
  const chartDir=path.join(root,'must-not-exist');
  const port=await launch({SUNNY_CHILD:'reina',SUNNY_CHART_DIR:chartDir,...mode});
  await ready(port);
  const status=await fetch(`http://127.0.0.1:${port}/api/chart/status`).then(response=>response.json()).catch(error => { throw new Error(`${String(error)}\n${output}`); });
  expect(status).toMatchObject({connection:'disabled'});
  expect(fs.existsSync(chartDir)).toBe(false);
},15000);
it('activates spelling routes and prevents legacy writes in a chart kiosk',async()=>{
 const port=await launch({SUNNY_CHART_DIR:path.join(root,'chart'),SUNNY_SPELLING_CHART:'1',SUNNY_KIOSK_TOKEN:'test-token',SUNNY_PARENT_PIN:'123456'});
 await ready(port);
 const status:any=await fetch(`http://127.0.0.1:${port}/api/chart/status`).then(r=>r.json());expect(status.learningEventsConnected).toBe(true);
 const config=await fetch(`http://127.0.0.1:${port}/api/spelling/config`).then(r=>r.json());expect(config).toMatchObject({enabled:true,children:['synthetic-kiosk']});
 const legacy=await fetch(`http://127.0.0.1:${port}/api/map/start`,{method:'POST',headers:{'content-type':'application/json'},body:'{"childId":"synthetic-kiosk"}'});expect(legacy.status).toBe(404);
},15000);
