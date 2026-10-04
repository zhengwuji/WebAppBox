import {app, BaseWindow, View, ipcMain, clipboard, WebContentsView, nativeTheme, dialog, session} from 'electron'
import viewManager from './viewManager.js'
import tbsDbManager from './store/tbsDbManager.js'
import storeManager from './store/storeManager.js'
import eventManager from './eventManager.js'
import fetchIcon from './utility/fetchIcon.js'
import CONS from './constants.js'
import dataExport from './utility/dataExport.js'
import dataSync from './utility/dataSync.js'
import Layout from "./utility/layout.js"
import Utility from "./utility/utility.js";
import AutoLaunch from "./utility/autoLaunch.js"
import clipboardWatcher from "./clipboardWatcher.js"
import pluginManager from "./pluginManager.js"
import { summarize, getProfile, randomizeProfile, getOptions, applyGlobalProxy } from "./disguise/fingerprint.js"
import { testProxy } from "./utility/proxyCore.js"
import kernelManager from "./utility/kernelManager.js"


class WindowManager{

    resizeTimer = null;
    cleanupTimer = null;
    constructor() {
        this.window = null
        this.menuView = null
        this.webView = null
    }

    getMenuView(){
        return this.menuView;
    }

    getWindow(){
        return this.window;
    }

    createWindow() {
        const winSize = Layout.getWinSize();
        const win = new BaseWindow({
            width: winSize.width,
            height: winSize.height,
            autoHideMenuBar: true,
            show:false,
            resizable: true,
            icon: CONS.APP.PATH+'/icon.ico',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                backgroundThrottling: false
            }
        })

        const menuView = new WebContentsView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                devTools: true,
                preload: CONS.APP.PATH +'/resource/preload/navigate.js'
            }
        });

        const layout = Layout.getLayout(win)
        menuView.setBounds(layout.menu)
        menuView.webContents.loadFile('gui/index.html').then(()=>{
            this.afterCloseSitePage();
        })

        const webView = new View();
        webView.setBounds(layout.web)

        win.setBackgroundColor("#fff")
        win.contentView.addChildView(menuView);
        win.contentView.addChildView(webView);

        this.window = win;
        this.menuView = menuView;
        this.webView = webView;
        viewManager.setParentView(this.webView);

        this.bindIpcMain();
        this.bindEvents();
        this.setSystemTheme();
        this.uselessSiteCleaner();
        if (storeManager.getSetting('isFullScreen')) {
            win.maximize();
        }
        win.show();

        // 如果剪贴板监控已启用，启动轮询
        if (storeManager.getSetting('clipboardWatchEnabled')) {
            clipboardWatcher.start();
        }
    }

    bindIpcMain(){

        dataExport.bindIpcMain();
        dataSync.bindIpcMain();
        clipboardWatcher.bindIpcMain();

        ipcMain.handle('handle:menu', async (event, hide) => {
            if(hide === true){
                storeManager.set('isMenuVisible', 0);
                this.handleResize();
            }else{
                storeManager.set('isMenuVisible', 1);
                this.handleResize();
            }
        })

        ipcMain.handle('handle:zoom', async (event) => {
            return storeManager.getSetting('isOpenZoom');
        });

        ipcMain.handle('refresh:self', async (event, ...args) => {
            viewManager.refreshActiveView();
        });

        ipcMain.handle('get:menu', async (event, ...args) => {
            
            return tbsDbManager.getMenus()
        });

        ipcMain.handle('get:groupMenus', async (e) => {
            
            return tbsDbManager.getGroupMenus()
        });


        ipcMain.handle('get:shortcuts', async (event, ...args) => {
            
            return tbsDbManager.getShortcuts()
        });

        ipcMain.handle('get:settings', (event, ...args) => {
             return storeManager.getSettings()
        });

        ipcMain.handle('update:shortcut', async (event, shortcut) => {
            
            const oldShortcut = tbsDbManager.getShortcut(shortcut.name);

            const data = {shortcut, oldShortcut}
            const result = await eventManager.send('replace:shortcut', data)

            if(result === true){
                tbsDbManager.updateShortcut(shortcut);
                return {code:0, data:shortcut, msg:"操作成功！"}
            }else{
                return {code:1, data:oldShortcut, msg:"操作失败！"};
            }
        });

        ipcMain.handle('get:version', async () => {
           const data = await Utility.fetchVersionLatest()
           return {
               version: app.getVersion(),
               newVersion: data.version,
               github: data.github,
               download: data.download,
               electron: process.versions.electron,
               chrome: process.versions.chrome
           }
        })

        eventManager.on('set:title', (data) => {
            this.window.setTitle(data);
        });

        eventManager.on('layout:resize', (data) => {
            const layout = Layout.getLayout(this.window)
            data.view.object.setBounds(layout.view)
            this.webView.addChildView(data.view.object)
        })

        ipcMain.on('reset:title', (event, name) => {
            const title = this.window.getTitle();
            const originTitle = (title.split('-')[0]).trim();
            if(name){
                this.window.setTitle(originTitle+' - '+name);
            }else{
                this.window.setTitle(originTitle);
            }
        });

        ipcMain.on('open:url', (event, site) => {
            viewManager.createNewView(site.url, site.name)
        })

        ipcMain.on('open:site', (event, site) => {
            this.menuView.webContents.send('auto:click', site);
        });

        ipcMain.on('copy:text', (event, text) => {
            clipboard.writeText(text);
        });

        ipcMain.on('zoom:wheel', (event, delta) => {
            const view = viewManager.getActiveView();
            let zoomLevel = view.object.webContents.getZoomLevel();
            if (delta > 0) {
                zoomLevel -= 0.5;
            } else if (delta < 0) {
                zoomLevel += 0.5;
            }
            zoomLevel = Math.min(3, Math.max(-2, zoomLevel));
            view.object.webContents.setZoomLevel(zoomLevel);
        });

        //更新左边导航栏
        ipcMain.on('update:menu', async (event, menu) => {

            tbsDbManager.updateSite(menu);
            this.closeHideSites();
            this.refreshMenuView();
        });

        //批量更新排序
        ipcMain.handle('batch:menus', async (event, menus) => {

            tbsDbManager.batchUpdateSite(menus);
            this.closeHideSites();
            this.refreshMenuView();
        });

        //新增左边导航栏
        ipcMain.on('add:menu', async (event, menu) => {

            tbsDbManager.addSite(menu);
            this.closeHideSites();
            this.refreshMenuView();
        });

        //删除左边导航栏
        ipcMain.on('remove:menu', async (event, menu) => {

            tbsDbManager.removeSite(menu);
            this.refreshMenuView();
            this.closeHideSites();
            this.clearSiteStorage(menu.name);
        });

        ipcMain.handle('get:groups', async () => {
            return tbsDbManager.getGroups()
        })

        ipcMain.handle('update:group', async (event, group) => {

            tbsDbManager.updateGroup(group)
            this.refreshMenuView();
            return true;
        })

        ipcMain.handle('remove:group', async (event, group) => {

            tbsDbManager.removeGroup(group)
            this.refreshMenuView();
            return true;
        })

        ipcMain.on('update:setting', (event, setting) => {
            storeManager.updateSetting(setting)
            if(setting.name === "systemTheme"){
                this.setSystemTheme();
            }
            if(setting.name === "isMenuVisible"){
                this.handleResize()
            }
            if(setting.name === "leftMenuPosition"){
                this.handleResize()
            }
            if (setting.name === "isMemoryOptimizationEnabled"){
                this.uselessSiteCleaner();
            }
            if (setting.name === "isOpenDevTools"){
                this.closeHideSites();
            }
            if (setting.name === "isAutoLaunch"){
                AutoLaunch.initAutoLaunch();
            }
            if (setting.name === "ignoreCertificateErrors"){
                app.certOverrideEnabled = !!setting.value;
            }
        });

        // ---------- plugin ----------

        ipcMain.handle('get:plugins', async () => {
            return pluginManager.getPlugins()
        })

        ipcMain.handle('toggle:plugin', async (event, { id, enabled }) => {
            pluginManager.togglePlugin(id, enabled)
            return { success: true }
        })

        ipcMain.handle('install:local-plugin', async () => {
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory'],
                title: '选择插件目录'
            })
            if (result.canceled || result.filePaths.length === 0) {
                return { success: false, error: '已取消' }
            }
            return pluginManager.installFromLocal(result.filePaths[0])
        })

        ipcMain.handle('uninstall:plugin', async (event, id) => {
            return pluginManager.uninstall(id)
        })

        ipcMain.handle('get:favicon', async (event, name) => {
            try {
                const site = tbsDbManager.getSite(name);
                const faviconUrl = await fetchIcon.getFaviconUrl(site.url);
                const iconData = await fetchIcon.fetchFaviconAsBase64(faviconUrl);
                tbsDbManager.updateSite(Object.assign(site, {img: iconData}))

                this.refreshMenuView();
                return {ret:0, data:iconData};
            } catch (error) {
                return {ret:1, data:'获取失败:'+ error};
            }
        });

        // ---------- 指纹环境 / 代理 / 内核 ----------

        ipcMain.handle('get:sites:fingerprint', async () => {
            return tbsDbManager.getSites().map(s => ({
                name: s.name,
                tag: s.tag,
                img: s.img,
                proxy: s.proxy || '',
                summary: summarize(s.name)
            }))
        })

        ipcMain.handle('get:site:fingerprint', async (event, name) => {
            const { base, env } = getProfile(name)
            const site = tbsDbManager.getSite(name)
            return {
                profile: base,
                deep: env.deep,
                overrides: tbsDbManager.getSiteFingerprintOverrides(name) || {},
                proxy: site ? (site.proxy || '') : ''
            }
        })

        ipcMain.handle('update:site:fingerprint', async (event, payload) => {
            const { name, overrides, proxy } = payload || {}
            if (!name) return { ret: 1, msg: '缺少站点名' }
            tbsDbManager.updateSiteFingerprint(name, overrides && Object.keys(overrides).length ? overrides : null)
            if (proxy !== undefined) {
                const site = tbsDbManager.getSite(name)
                if (site) {
                    const proxyValue = typeof proxy === 'string' ? proxy : JSON.stringify(proxy)
                    tbsDbManager.updateSite(Object.assign({}, site, { proxy: proxyValue }))
                }
            }
            viewManager.closeView(name) // 关闭后重新打开即使用新环境
            return { ret: 0 }
        })

        ipcMain.handle('randomize:site:fingerprint', async (event, name) => {
            randomizeProfile(name)
            viewManager.closeView(name)
            return { ret: 0, summary: summarize(name) }
        })

        ipcMain.handle('fingerprint:options', async () => getOptions())

        ipcMain.handle('proxy:test', async (event, config) => testProxy(config))

        ipcMain.handle('proxy:global:get', async () => storeManager.getSetting('globalProxy') || { type: 'none' })

        ipcMain.handle('proxy:global:set', async (event, config) => {
            storeManager.set('globalProxy', config || { type: 'none' })
            applyGlobalProxy()
            return { ret: 0 }
        })

        // ---------- 内核管理 ----------

        ipcMain.handle('kernel:info', async () => kernelManager.getKernelInfo())

        ipcMain.handle('kernel:list', async () => kernelManager.listAvailable())

        ipcMain.handle('kernel:download', async (event, version) => {
            return kernelManager.downloadKernel(version, (progress) => {
                if (!event.sender.isDestroyed()) event.sender.send('kernel:progress', progress)
            })
        })

        ipcMain.handle('kernel:apply', async (event, version) => kernelManager.applyStaged(version))

        ipcMain.handle('kernel:restore', async () => kernelManager.restoreKernel())
    }

    bindEvents(){
        this.window.on('resize', () => {
            if (this.resizeTimer) clearTimeout(this.resizeTimer);
            this.resizeTimer = setTimeout(() => {
                this.handleResize();
            }, 200);
        })

        this.window.on('focus', () => {
            this.handleResize();
        });

        this.window.on('close', (e) => {
            if(app.isQuitting === false){
                e.preventDefault();
                this.window.hide();
                app.dock?.hide();
            }
        })

        //窗口已经销毁，清理资源
        this.window.on('closed', (e) => {
            this.destroy();
        })
    }

    handleResize() {
        const layout = Layout.getLayout(this.window)
        this.menuView.setBounds(layout.menu);
        this.webView.setBounds(layout.web);

        viewManager.views.forEach(view => {
            view.object.setBounds(layout.view);
        });
    }

    setSystemTheme(){
        nativeTheme.themeSource = storeManager.getSetting('systemTheme');
    }

    //菜单数据变更后推送增量刷新，替代整页 reload
    refreshMenuView() {
        this.menuView.webContents.send('menu:refresh', tbsDbManager.getGroupMenus());
    }

    //站点删除后清理其独立会话的存储数据
    clearSiteStorage(name) {
        try {
            session.fromPartition('persist:' + name).clearStorageData().catch(() => {});
        } catch {}
    }

    afterCloseSitePage() {
        const site = {url:CONS.APP.CLOSE_SITE_URL,  name:CONS.APP.CLOSE_SITE_NAME};
        this.menuView.webContents.send('auto:click', site);
    }

    uselessSiteCleaner(){
        const res = storeManager.getSetting('isMemoryOptimizationEnabled');
        if(!res) return;

        const currentView = viewManager.getActiveView();
        const urls = tbsDbManager.getOpenSiteUrls();
        viewManager.views = viewManager.views.filter(view => {
            if(currentView.name === view.name) return true;

            const notInMenu = !urls.includes(view.url);
            const overTime = Math.floor((Date.now() - view.time) / 1000) > 600;

            if (notInMenu || overTime) {
                viewManager.clearView(view)
                return false;
            }
            return true;
        })

        clearTimeout(this.cleanupTimer);
        this.cleanupTimer = setTimeout(() => this.uselessSiteCleaner(), 5*60*1000);
    }

    closeHideSites(){
        const currentView = viewManager.getActiveView();
        const urls = tbsDbManager.getOpenSiteUrls();
        viewManager.views = viewManager.views.filter(view => {
            if(currentView.name === view.name) return true;
            if(!urls.includes(view.url)){
                viewManager.clearView(view)
                return false;
            }
            return true;
        })
    }

    destroy() {
       if(this.cleanupTimer) clearTimeout(this.cleanupTimer);
       if(this.resizeTimer) clearTimeout(this.resizeTimer);
       clipboardWatcher.stop();
       if(this.window) this.window = null;
    }
}

export default new WindowManager();