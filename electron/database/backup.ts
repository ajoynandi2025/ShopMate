import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { app, dialog } from 'electron';
import { getDatabase, closeDatabase, initializeDatabase } from './database';
import { CURRENT_SCHEMA_VERSION } from './migrations';
export async function createBackup(backupDirectory = path.join(app.getPath('userData'), 'backups')): Promise<{ path: string; integrity: string }> {
  fs.mkdirSync(backupDirectory, { recursive: true });const stamp = new Date().toISOString().replace(/[:.]/g, '-');let destination = path.join(backupDirectory, `shopmate-${stamp}.db`);let suffix = 1;while (fs.existsSync(destination)) destination = path.join(backupDirectory, `shopmate-${stamp}-${suffix++}.db`);
  const db = getDatabase();await db.backup(destination);const verification = new Database(destination, { readonly: true, fileMustExist: true });try {const integrity = String(verification.pragma('integrity_check', { simple: true }));if (integrity !== 'ok') throw new Error(`Backup integrity check failed: ${integrity}`);return { path: destination, integrity };} catch (error) { fs.rmSync(destination, { force: true });throw error;} finally {verification.close();}
}
export function listBackups(backupDirectory = path.join(app.getPath('userData'), 'backups')){
 if(!fs.existsSync(backupDirectory))return [];return fs.readdirSync(backupDirectory,{withFileTypes:true}).filter(entry=>entry.isFile()&&/^shopmate-.*\.db$/i.test(entry.name)).map(entry=>{const full=path.join(backupDirectory,entry.name);const stat=fs.statSync(full);return {name:entry.name,path:full,size:stat.size,modifiedAt:stat.mtime.toISOString()};}).sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt));
}
export async function createDailyBackup(){const directory=path.join(app.getPath('userData'),'backups');const day=new Date().toISOString().slice(0,10);if(listBackups(directory).some(item=>item.name.startsWith(`shopmate-${day}`)))return null;return createBackup(directory);}
export async function chooseAndRestoreBackup(){
 const pick=await dialog.showOpenDialog({properties:['openFile'],filters:[{name:'ShopMate SQLite backups',extensions:['db','sqlite','sqlite3']}]});if(pick.canceled||!pick.filePaths[0])return null;return restoreBackup(pick.filePaths[0]);
}
export async function restoreBackup(sourcePath:string){
 const active=getDatabase(),target=active.name;if(path.resolve(sourcePath).toLowerCase()===path.resolve(target).toLowerCase())throw new Error('Choose a backup file, not the database currently in use.');
 const candidate=new Database(sourcePath,{readonly:true,fileMustExist:true});let version=0;try{const integrity=String(candidate.pragma('integrity_check',{simple:true}));if(integrity!=='ok')throw new Error(`Backup integrity check failed: ${integrity}`);version=Number(candidate.pragma('user_version',{simple:true}));if(version<1||version>CURRENT_SCHEMA_VERSION)throw new Error(`Backup schema version ${version} is not supported by this ShopMate version.`);const tables=new Set((candidate.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {name:string}[]).map(x=>x.name));if(!tables.has('products')||!tables.has('sales')||!tables.has('settings'))throw new Error('The selected file is not a ShopMate database.');const fk=candidate.pragma('foreign_key_check') as unknown[];if(fk.length)throw new Error('The selected backup has foreign key errors.');}finally{candidate.close();}
 const backup=await createBackup(path.join(path.dirname(target),'backups'));const temp=`${target}.restore-temp`;try{active.pragma('wal_checkpoint(TRUNCATE)');closeDatabase();fs.copyFileSync(sourcePath,temp);fs.renameSync(temp,target);for(const suffix of ['-wal','-shm'])if(fs.existsSync(target+suffix))fs.rmSync(target+suffix,{force:true});const restored=initializeDatabase(target);if(String(restored.pragma('integrity_check',{simple:true}))!=='ok')throw new Error('Restored database failed its integrity check.');return {path:target,integrity:'ok',safetyBackup:backup.path};}catch(error){try{if(fs.existsSync(temp))fs.rmSync(temp,{force:true});closeDatabase();fs.copyFileSync(backup.path,temp);if(fs.existsSync(target))fs.rmSync(target,{force:true});fs.renameSync(temp,target);initializeDatabase(target);}catch{}throw error;}
}
