import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const kit = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const worker = require('../scripts/project-notes-worker.cjs');

// This protocol fixture simulates runtime outcomes, not a model or sandbox.
const fakeRuntime = `
const fs=require('fs'), path=require('path'), crypto=require('crypto');
const argv=process.argv.slice(2), value=k=>argv[argv.indexOf(k)+1];
const task=value('--task'), output=value('--output'), packetFile=value('--handoff-packet');
const packet=JSON.parse(fs.readFileSync(packetFile));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v));
if(task==='wait') {
  const {spawn}=require('child_process');
  const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});
  fs.writeFileSync(path.join(path.dirname(output),'descendant.pid'),String(child.pid));
  process.on('SIGTERM',()=>{});setInterval(()=>{},1000);
} else {
const status=task==='incomplete'?'INCONCLUSIVE':'PASS';
let receipt='STATUS: '+status+'\\n'+${JSON.stringify(['CLAIM', 'EVIDENCE', 'COMMANDS RUN', 'FILES READ', 'FILES MODIFIED', 'TESTS', 'RISKS / UNCERTAINTY', 'RECOMMENDED NEXT ACTION'])}.map(s=>s+':\\n'+(s==='FILES MODIFIED'?'none':'fixture evidence')).join('\\n')+'\\n';
if(task==='malformed')receipt='STATUS: PASS\\n';
fs.writeFileSync(output,receipt);
const evidence=output.replace(/\\.txt$/,'.evidence.json');
write(evidence,{files_modified:task==='drift'?['source.txt']:[],handoff:{state:'READY',freshness_after:{fresh:true}}});
const response={packet_id:packet.id,packet_sha256:packet.packetSha256,status,acceptance:'PENDING_COORDINATOR_REVIEW',acceptance_owner:packet.assignment.sender,
examined_paths:['source.txt'],unexamined_declared_inputs:[],coverage_gaps:[],commands:[],files_modified:[],facts_versus_hypotheses:{},working:'fixture',not_verified:'semantic correctness',tried_and_failed:[],
artifacts:[output,evidence,packetFile].map(p=>({path:p,sha256:hash(p)}))};
if(task==='bad-hash')response.artifacts[0].sha256='bad';
if(task==='wrong-packet')response.packet_id='wrong';
write(output.replace(/\\.txt$/,'.handoff-response.json'),response);
if(task==='stale')fs.appendFileSync(path.join(value('--repo'),'source.txt'),'changed');
if(task==='cloud') {
fs.writeFileSync(output.replace(/\\.txt$/,'.luna.txt'),receipt);
write(output.replace(/\\.txt$/,'.routing.json'),{cloud_status:'PASS'});
}
process.exit(task==='incomplete'?2:task==='wrong-exit'?1:0);
}
`;

function fixture(t, scriptsDir = 'scripts', agent = 'codex') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-worker-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const repo = path.join(base, 'repo'), runtimeDir = path.join(base, 'runtime'), stateDir = path.join(base, 'state');
  fs.mkdirSync(repo); fs.mkdirSync(path.join(repo, scriptsDir));
  const git = (...args) => {
    const r = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); return r.stdout;
  };
  git('init', '-q');git('config','user.name','Worker Test');git('config','user.email','test@example.invalid');
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ scripts: {} }));
  const install = (...args) => spawnSync(process.execPath, [path.join(kit, 'install-notes-graph.cjs'), '--repo', repo, ...args], { encoding:'utf8' });
  const installed=install('--app','Fixture','--agent',agent);
  assert.equal(installed.status,0,installed.stderr);
  fs.writeFileSync(path.join(repo,'source.txt'),'original source\n');
  git('add','.');git('commit','-qm','fixture');
  fs.mkdirSync(path.join(runtimeDir,'.venv/bin'),{recursive:true});
  fs.symlinkSync(process.execPath,path.join(runtimeDir,'.venv/bin/python'));
  for(const file of ['worker.py','route-worker.py'])fs.writeFileSync(path.join(runtimeDir,file),fakeRuntime);
  fs.writeFileSync(path.join(runtimeDir,'qwen'),'fixture');fs.writeFileSync(path.join(runtimeDir,'contract.txt'),'fixture');
  const profileFile=path.join(base,'workers.json');
  const profile={adapter:'local-worker-v1',runtimeDir,stateDir,endpoint:'http://127.0.0.1:8080/v1',model:'default_model',allowCloudFallback:false};
  const saveProfile=()=>fs.writeFileSync(profileFile,JSON.stringify({schemaVersion:1,profiles:{'local-coding':profile}}));
  saveProfile();
  const env={...process.env,NODE_PATH:path.join(kit,'node_modules'),PROJECT_NOTES_WORKER_PROFILE_FILE:profileFile};
  const helper=path.join(repo,scriptsDir,'project-notes-worker.cjs');
  const run=(...args)=>spawnSync(process.execPath,[helper,...args],{cwd:repo,env,encoding:'utf8'});
  const configFile=path.join(repo,'notes-graph.config.json');
  const config=()=>JSON.parse(fs.readFileSync(configFile));
  const jobs=()=>fs.existsSync(stateDir)?fs.readdirSync(stateDir).filter(n=>n!=='active.json'):[];
  return {base,repo,runtimeDir,stateDir,profile,profileFile,saveProfile,env,helper,run,configFile,config,jobs,git,install};
}

test('installer defaults disabled; dry-run/enable/disable preserve selected-agent and custom content',t=>{
  const f=fixture(t,'Scripts','claude');
  assert.deepEqual(f.config().workers,{enabled:false,profile:'local-coding'});
  const agentFile=path.join(f.repo,'CLAUDE.md');
  const original=fs.readFileSync(agentFile,'utf8');
  const config=f.config();config.custom={untouched:true};fs.writeFileSync(f.configFile,JSON.stringify(config));
  assert.equal(f.run('enable','--dry-run').status,0);
  assert.equal(f.config().workers.enabled,false);assert.equal(fs.readFileSync(agentFile,'utf8'),original);
  assert.equal(f.run('enable').status,0);assert.equal(f.config().workers.enabled,true);
  assert.deepEqual(f.config().custom,{untouched:true});assert.ok(!fs.existsSync(path.join(f.repo,'AGENTS.md')));
  assert.match(fs.readFileSync(agentFile,'utf8'),/notes-graph-kit:worker:start/);
  assert.equal(f.run('enable').status,0);
  assert.equal(f.run('disable').status,0);assert.equal(fs.readFileSync(agentFile,'utf8'),original);
  assert.ok(!fs.existsSync(f.stateDir));
});

test('upgrade preserves enabled policy, customized npm command, instructions and vault',t=>{
  const f=fixture(t);assert.equal(f.run('enable').status,0);
  const agent=fs.readFileSync(path.join(f.repo,'AGENTS.md'),'utf8');
  const pkg=JSON.parse(fs.readFileSync(path.join(f.repo,'package.json')));pkg.scripts['notes:worker']='custom-worker';fs.writeFileSync(path.join(f.repo,'package.json'),JSON.stringify(pkg));
  const vault=fs.readFileSync(path.join(f.repo,'Project Notes/Notes System.md'),'utf8');
  const result=f.install('--upgrade');assert.equal(result.status,0,result.stderr);
  assert.equal(f.config().workers.enabled,true);assert.equal(JSON.parse(fs.readFileSync(path.join(f.repo,'package.json'))).scripts['notes:worker'],'custom-worker');
  assert.equal(fs.readFileSync(path.join(f.repo,'AGENTS.md'),'utf8'),agent);
  assert.equal(fs.readFileSync(path.join(f.repo,'Project Notes/Notes System.md'),'utf8'),vault);
});

test('instructions ignore fenced marker examples, reject damaged blocks and unclosed append',()=>{
  const example='```md\n<!-- notes-graph-kit:worker:start -->\n<!-- notes-graph-kit:worker:end -->\n```\n';
  const enabled=worker.instructionContent(example,true);
  assert.ok(enabled.startsWith(example));assert.equal(worker.instructionContent(enabled,false),example);
  assert.throws(()=>worker.instructionContent('<!-- notes-graph-kit:worker:start -->',true),/Damaged/);
  assert.throws(()=>worker.instructionContent('```\n',true),/Unclosed/);
});

test('doctor reports unavailable without writing/downloading; unknown flags rejected',t=>{
  const f=fixture(t);fs.unlinkSync(f.profileFile);
  const result=f.run('doctor');assert.equal(result.status,2);assert.equal(JSON.parse(result.stdout).status,'UNAVAILABLE');
  assert.ok(!fs.existsSync(f.stateDir));assert.equal(f.run('run','--allow-write').status,2);
  assert.equal(f.run('enable','--profile','../../escape').status,2);
});

const mac={skip:process.platform!=='darwin'};
test('registered runtime produces pending, packet-linked receipt; later review detects tampering and staleness',mac,t=>{
  const f=fixture(t);assert.equal(f.run('run','--task','ok').status,2);assert.ok(!fs.existsSync(f.stateDir));
  assert.equal(f.run('enable').status,0);
  const result=f.run('run','--role','SCOUT','--task','ok','--input','source.txt');assert.equal(result.status,0,result.stderr);
  const job=JSON.parse(result.stdout);assert.equal(job.status,'PASS');assert.equal(job.acceptance,'PENDING_COORDINATOR_REVIEW');
  assert.ok(!job.command.includes('--allow-write'));assert.match(job.command[1],/worker\.py$/);assert.ok(!job.command[1].endsWith('route-worker.py'));
  assert.equal(f.run('review','--job',job.id).status,0);
  fs.appendFileSync(job.receipt_path,'tampered');assert.equal(f.run('review','--job',job.id).status,2);
  fs.appendFileSync(path.join(f.repo,'source.txt'),'stale');assert.equal(JSON.parse(f.run('review','--job',job.id).stdout).fresh,false);
  assert.equal(f.run('status').status,0);assert.equal(JSON.parse(f.run('status').stdout).state,'IDLE');
});

test('malformed receipts, mismatched identities/hashes/exits, source drift and stale inputs fail closed',mac,t=>{
  const f=fixture(t);assert.equal(f.run('enable').status,0);
  for(const task of ['malformed','wrong-packet','bad-hash','wrong-exit','drift','stale','incomplete']){
    const result=f.run('run','--task',task,'--input','source.txt');assert.equal(result.status,2,result.stderr);
    const job=JSON.parse(result.stdout);assert.equal(job.status,'INCONCLUSIVE');assert.equal(job.acceptance,'PENDING_COORDINATOR_REVIEW');
  }
  assert.equal(f.run('run','--role','IMPLEMENTER','--task','ok').status,2);
  assert.equal(f.run('run','--task','ok','--metrics-kind','unknown').status,2);
  assert.equal(f.run('run','--task','ok','--input','missing.txt').status,2);
  assert.equal(f.run('run','--task','ok','--input','../secret').status,2);
});

test('cloud requires host and per-job authorization; unauthorized cloud artifacts rejected',mac,t=>{
  const f=fixture(t);f.run('enable');
  assert.equal(f.run('run','--task','cloud','--allow-cloud-fallback').status,2);assert.ok(!fs.existsSync(f.stateDir));
  assert.equal(f.run('run','--task','cloud').status,2);
  f.profile.allowCloudFallback=true;f.saveProfile();
  const local=f.run('run','--task','ok');assert.equal(local.status,0,local.stderr);assert.ok(!JSON.parse(local.stdout).command[1].endsWith('route-worker.py'));
  const cloud=f.run('run','--task','cloud','--allow-cloud-fallback');assert.equal(cloud.status,0,cloud.stderr);
  assert.match(JSON.parse(cloud.stdout).receipt_path,/receipt\.luna\.txt$/);
});

test('host profile refuses network exposure, in-repo state/config, and malformed adapter',mac,t=>{
  const f=fixture(t);f.run('enable');
  for(const [key,value] of [['endpoint','http://0.0.0.0:8080/v1'],['stateDir',f.repo],['adapter','unknown']]){
    const old=f.profile[key];f.profile[key]=value;f.saveProfile();assert.equal(f.run('run','--task','ok').status,2);f.profile[key]=old;
  }
  f.saveProfile();f.env.PROJECT_NOTES_WORKER_PROFILE_FILE=path.join(f.repo,'workers.json');fs.copyFileSync(f.profileFile,f.env.PROJECT_NOTES_WORKER_PROFILE_FILE);
  assert.equal(f.run('run','--task','ok').status,2);assert.ok(!fs.existsSync(f.stateDir));
});

test('cancel stops the process tree including detached descendants; shared-state concurrent dispatch rejected',mac,async t=>{
  const f=fixture(t);f.run('enable');
  const child=spawn(process.execPath,[f.helper,'run','--task','wait','--input','source.txt'],{cwd:f.repo,env:f.env,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
  const completed=new Promise(resolve=>child.on('exit',code=>resolve(code)));
  let id,descendant;
  t.after(()=>{
    try { child.kill('SIGKILL'); } catch {}
    if (descendant) { try { process.kill(descendant,'SIGKILL'); } catch {} }
  });
  for(let i=0;i<100;i++){
    id=f.jobs()[0];const file=id&&path.join(f.stateDir,id,'descendant.pid');
    if(file&&fs.existsSync(file)){descendant=Number(fs.readFileSync(file));break;}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.ok(descendant,stderr);
  assert.equal(f.run('run','--task','ok').status,2);
  assert.equal(f.run('cancel','--job',id).status,0);
  assert.equal(await completed,2,stderr);assert.equal(JSON.parse(stdout).state,'CANCELLED');
  assert.throws(()=>process.kill(descendant,0),/ESRCH/);
  assert.equal(JSON.parse(f.run('status').stdout).state,'IDLE');
});

test('worker recommendation is opt-in and read-only after enabling',t=>{
  const f=fixture(t);
  const inspect=require('../scripts/recommend-project-notes-opt-ins.cjs').inspect;
  let item=inspect(f.repo).recommendations.find(r=>r.id==='repository-workers');assert.equal(item.requires_user_approval,true);
  f.run('enable');item=inspect(f.repo).recommendations.find(r=>r.id==='repository-workers');assert.equal(item.requires_user_approval,false);assert.equal(item.action_kind,'read-only');
});
