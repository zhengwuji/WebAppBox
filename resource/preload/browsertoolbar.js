const { contextBridge, ipcRenderer } = require('electron');

const envEntry = process.argv.find(a => a.startsWith('--browserenv='));
const env = envEntry ? envEntry.substring('--browserenv='.length) : '';

contextBridge.exposeInMainWorld('browserBar', {
    env: env,
    nav: (action, payload) => ipcRenderer.invoke('browser:nav', env, action, payload),
    installStore: (input) => ipcRenderer.invoke('browser:install-store', env, input),
    listExtensions: () => ipcRenderer.invoke('browser:list-extensions', env),
    removeExtension: (id) => ipcRenderer.invoke('browser:remove-extension', env, id),
    toggleBookmark: (url, title) => ipcRenderer.invoke('browser:toggle-bookmark', { url, title }),
    listBookmarks: () => ipcRenderer.invoke('browser:list-bookmarks'),
    manageExtensions: () => ipcRenderer.invoke('browser:manage'),
    onState: (callback) => ipcRenderer.on('browser:state', (event, state) => callback(state)),
});

window.addEventListener('contextmenu', (e) => e.preventDefault());
