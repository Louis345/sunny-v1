import { expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import { cachedSpellingAudio } from '../chart/spelling/audio';
it('buys a word once across repeated plays and restarts', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spelling-audio-'));
    let calls = 0;
    const speak = async () => { calls++; return Buffer.from('audio fixture'); };
    try {
        const a = cachedSpellingAudio(root, { key: 'test-voice', speak });
        expect(await a('able')).toEqual(Buffer.from('audio fixture'));
        expect(await a('able')).toEqual(Buffer.from('audio fixture'));
        expect(await cachedSpellingAudio(root, { key: 'test-voice', speak })('able')).toEqual(Buffer.from('audio fixture'));
        expect(calls).toBe(1);
    }
    finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
it('preserves a known failure and requires parent recovery for further audio calls', async () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spelling-audio-'));let calls=0;
 const voice={key:'v',speak:async()=>{if(++calls===1)throw Error('lost');return Buffer.from('audio');}};
 try{await expect(cachedSpellingAudio(root,voice)('able')).rejects.toThrow('lost');
 for(let n=0;n<5;n++)await expect(cachedSpellingAudio(root,voice)('able')).rejects.toThrow('parent_recovery_required');
 expect(calls).toBe(1);
 expect(await cachedSpellingAudio(root,voice)('able',true)).toEqual(Buffer.from('audio'));expect(calls).toBe(2);
 expect(await cachedSpellingAudio(root,voice)('able')).toEqual(Buffer.from('audio'));expect(calls).toBe(2);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

it('keeps a legacy unknown audio outcome blocked until explicit recovery',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spelling-audio-'));let calls=0;
 const key=createHash('sha256').update(JSON.stringify(['v','able'])).digest('hex');
 fs.writeFileSync(path.join(root,key+'.requested'),'');
 const audio=cachedSpellingAudio(root,{key:'v',speak:async()=>{calls++;return Buffer.from('audio');}});
 try{await expect(audio('able')).rejects.toThrow('needs_attention');expect(calls).toBe(0);
 expect(await audio('able',true)).toEqual(Buffer.from('audio'));expect(calls).toBe(1);expect(fs.existsSync(path.join(root,key+'.requested'))).toBe(true);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

it('recovers exhausted audio in a new batch without child taps opening it',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spelling-audio-'));let calls=0;
 const voice={key:'v',speak:async()=>{if(++calls<=3)throw Error('outage');return Buffer.from('audio');}};
 try{for(let n=0;n<3;n++)await expect(cachedSpellingAudio(root,voice)('able',true)).rejects.toThrow();
 await expect(cachedSpellingAudio(root,voice)('able')).rejects.toThrow('attempt_limit');expect(calls).toBe(3);
 expect(await cachedSpellingAudio(root,voice)('able',true)).toEqual(Buffer.from('audio'));expect(calls).toBe(4);
 expect(await cachedSpellingAudio(root,voice)('able')).toEqual(Buffer.from('audio'));expect(calls).toBe(4);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
