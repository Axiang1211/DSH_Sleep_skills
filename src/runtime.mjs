import { DatabaseSync } from 'node:sqlite';
let checked=false;
export function assertRuntime(){
  if(checked)return;
  if(Number(process.versions.node.split('.')[0])<24)throw new Error('Node.js 24+ is required. Install the current Node.js 24 LTS build.');
  const probe=new DatabaseSync(':memory:');
  try{probe.exec('CREATE VIRTUAL TABLE probe USING fts5(text)');}
  catch{throw new Error('This Node build lacks SQLite FTS5. Use an official Node.js 24 LTS build.');}
  finally{probe.close();}
  checked=true;
}
