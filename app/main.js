import path from 'path'
import { app, session } from 'electron'
import {initDatabase, flushDatabase} from './store/database.js'
import tbsDbManager from './store/tbsDbManager.js'
import { applyGlobalProxy } from './disguise/fingerprint.js'
import windowManager from './windowManager.js'
import trayManager from'./trayManager.js'
import shortcutManager from './shortcut/shortcutManager.js'
import contextManager from "./context/contextManager.js"
import AutoLaunch from "./utility/autoLaunch.js"

// app.disableHardwareAcceleration();
//app.commandLine.appendSwitch('disable-gpu');
//app.commandLine.appendSwitch('disable-webrtc');
app.commandLine.appendSwitch('disable-software-rasterizer');

//证书校验默认开启；仅当设置开启后，站点视图的独立会话才忽略证书错误
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  const ses = webContents?.session;
  if (app.certOverrideEnabled && ses && ses !== session.defaultSession) {
    event.preventDefault();
    callback(true);
    return;
  }
  callback(false);
});

// 代理认证：HTTP 代理（以及经中继的 SOCKS5 场景）需要账密时从这里注入
app.on('login', (event, webContents, details, authInfo, callback) => {
  if (!authInfo || !authInfo.isProxy) return;
  const ses = (webContents && webContents.session) || session.defaultSession;
  const creds = ses && ses.__tbsProxyCreds;
  if (creds && creds.username) {
    event.preventDefault();
    callback(creds.username, creds.password || '');
  }
});

app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')
app.commandLine.appendSwitch('disable-features', 'IsolateOrigins,site-per-process')

if(process.env.PORTABLE_EXECUTABLE_DIR){
  app.setPath('userData', path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'webappbox-user-data'))
}

app.isQuitting = false;
app.isMac = (process.platform === 'darwin');
app.singleLock = app.requestSingleInstanceLock();

import browserEnv from './disguise/browserEnv.js'

app.whenReady().then(async () => {
  if (!app.singleLock) return app.quit();

  // 引擎级别设置 User-Agent（不影响 TLS 指纹，但让 navigator.userAgent 默认值正确）
  const globalUA = browserEnv.getHeaders()['user-agent'];
  if (globalUA) app.userAgentFallback = globalUA;

  // 先初始化数据库
  await initDatabase(path.join(app.getPath('userData'), 'webappbox.db'))
  await tbsDbManager.init()
  app.certOverrideEnabled = !!tbsDbManager.getSetting('ignoreCertificateErrors')
  applyGlobalProxy();

  windowManager.createWindow();
  trayManager.createTray();
  shortcutManager.initShortcuts();
  contextManager.createContextMenu();
  AutoLaunch.initAutoLaunch();
})


app.on('before-quit', () => {
  app.isQuitting = true;
  flushDatabase();
  const win = windowManager.getWindow();
  if (win && !win.isDestroyed()) {
    win.close();
  }
});
app.on('will-quit', () => {
  shortcutManager.unregisterAll();
  trayManager.destroyTray();
})

app.on('window-all-closed', () => {
  if (app.isMac) app.dock.hide();
  else app.quit();
})

app.on('activate', () => {
  if (!windowManager.getWindow()) {
    windowManager.createWindow();
  }else{
    windowManager.getWindow().show();
  }
})


app.on('second-instance', () => {
  windowManager.getWindow()?.show();
})

app.on('render-process-gone', (event, webContents, details) => {
  if (details.reason === 'crashed') {
    windowManager.getMenuView().webContents.reload();
  }
});

// 添加进程异常处理
process.on('unhandledRejection', (error) => {
  console.error('未处理的Promise拒绝:', error)
})

process.on('uncaughtException', (err) => {
  console.error('主进程崩溃:', err);
});