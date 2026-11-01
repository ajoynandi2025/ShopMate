import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { initializeDatabase, closeDatabase } from './database/database';
import { registerDatabaseIpc } from './database/ipc';
import { createDailyBackup } from './database/backup';

const isDevelopment = !app.isPackaged;

function createMainWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'ShopMate',
    icon: path.join(__dirname, '../assets/shopmate.ico'),
    backgroundColor: '#f6f8fb',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDevelopment) {
    void window.loadURL('http://127.0.0.1:5173');
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    void window.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  initializeDatabase();
  try { await createDailyBackup(); } catch (error) { console.warn('Daily backup failed; ShopMate will continue without it:', error); }
  registerDatabaseIpc();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('ShopMate startup failed:', error);
  dialog.showErrorBox('ShopMate could not start', `The local database could not be opened.\n\n${message}`);
  app.quit();
});

app.on('before-quit', () => closeDatabase());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
