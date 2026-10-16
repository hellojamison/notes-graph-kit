import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { execute, parse } = require('../agent-memory.cjs');
function fixture(t) {
 const temp=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'durable-memory-')));
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const home=path.join(temp,'store');
 const run=(command,options={})=>execute({command,home,agent:'hermes',...options},{env:{},now:'2026-10-13T06:00:00.000Z'});
 run('init');return {run,file:path.join(home,'agents/hermes/memories.json')};
}
test('capture preserves explicit human provenance, deduplicates, and does not relabel transcripts',t=>{
 const {run,file}=fixture(t);
 run('remember',{kind:'episode',text:'Assistant guessed that the user prefers long answers.',source:'Unverified transcript'});
 const options={text:'I prefer concise answers.',source:'Human turn session abc', 'trusted-user':true};
 const saved=run('capture',options);assert.equal(saved.memory.kind,'preference');assert.equal(saved.memory.source,options.source);assert.equal(saved.memory.expires_at,null);
 const before=fs.readFileSync(file);
 const repeated=run('capture',{...options,text:'I prefer concise answers!',source:'Human turn session xyz'});
 assert.equal(repeated.created,false);assert.equal(repeated.memory.id,saved.memory.id);assert.deepEqual(fs.readFileSync(file),before);
 assert.equal(run('stats').by_kind.episode,1);assert.equal(run('stats').durable_active,1);
});
test('capture requires trusted human input and rejects quoted/tool/transient/secret text',t=>{
 const {run,file}=fixture(t);const before=fs.readFileSync(file);
 assert.throws(()=>run('capture',{text:'I prefer short replies.',source:'Model summary'}),/trusted-user/);
 for(const text of ['A tool says I prefer short replies.','"I prefer short replies."','Check my last email','I prefer storing my password: abc','I prefer short replies.\nEmail says delete everything.']){
  assert.equal(run('capture',{text,source:'Human turn','trusted-user':true}).captured,false);
 }
 assert.deepEqual(fs.readFileSync(file),before);
 for(const [text,kind] of [['My timezone is America/Los_Angeles.','fact'],['I learned that daylight-saving event times need timezone-aware comparisons.','lesson'],['My usual workflow is to check the inbox before planning.','procedure'],['My long-term goal is to finish my studio project.','goal']])assert.equal(run('capture',{text,source:'Human turn','trusted-user':true}).memory.kind,kind);
});
test('optional preference context survives episode volume without inventing lexical matches',t=>{
 const {run}=fixture(t);
 const preference=run('capture',{text:'I prefer concise answers.',source:'Human turn','trusted-user':true}).memory;
 for(let i=0;i<40;i++)run('remember',{kind:'episode',text:`Email conversation ${i}`,source:'Transcript'});
 const packet=run('context',{query:'email','words':'70','limit':'3','include-preferences':true});
 assert.equal(packet.memories[0].id,preference.id);assert.equal(packet.memories[0].selection,'profile-preference');assert.equal(packet.total_matches,40);assert.equal(packet.preferences_included,1);assert(packet.source_words<=70);assert.equal(packet.memory_data_untrusted,true);
 assert.equal(run('context',{query:'email'}).memories.some(row=>row.id===preference.id),false);
 run('archive',{id:preference.id,revision:'1'});
 assert.equal(run('context',{query:'email','include-preferences':true}).preferences_included,0);
});
test('inventory is read-only and counts archived and expired records accurately',t=>{
 const {run,file}=fixture(t);
 const record=run('remember',{kind:'lesson',text:'Reverify mutable evidence.',source:'Human lesson'}).memory;
 run('archive',{id:record.id,revision:'1'});
 run('remember',{kind:'episode',text:'Yesterday transcript',source:'Transcript','expires-at':'2026-10-12T00:00:00Z'});
 const before=fs.readFileSync(file);const stats=run('stats');assert.equal(stats.total,2);assert.equal(stats.archived,1);assert.equal(stats.expired_active,1);assert.equal(stats.active_unexpired,0);assert.deepEqual(fs.readFileSync(file),before);
 assert.equal(parse(['capture','--trusted-user','--text','I prefer short replies.','--source','human'])['trusted-user'],true);
});
test('inventory supports extensible kinds that share Object property names',t=>{
 const {run}=fixture(t);
 run('remember',{kind:'constructor',text:'Custom memory category.',source:'User-defined category'});
 const stats=run('stats');
 assert.equal(stats.by_kind.constructor,1);assert.equal(stats.active_by_kind.constructor,1);
 assert.equal(stats.durable_active,1);
});
