import { app, globalShortcut, Menu } from 'electron'

class ShortcutBase {
    constructor() {
        this.localShortcuts = new Map()
        this.globalShortcuts = new Map()
        this.menuItems = []
    }

    /**
     * 注册快捷键（自动判断是局部还是全局）
     * @param {string} accelerator 快捷键组合，如 'CmdOrCtrl+S'
     * @param {Function} callback 回调函数
     * @param {boolean} [isGlobal=false] 是否全局快捷键
     */
    register(accelerator, callback, isGlobal = false) {
        if (isGlobal) {
            this._registerGlobal(accelerator, callback)
        } else {
            this._registerLocal(accelerator, callback)
        }
    }

    /**
     * 注册全局快捷键
     * @param {string} accelerator
     * @param {Function} callback
     */
    _registerGlobal(accelerator, callback) {
        if (globalShortcut.isRegistered(accelerator)) {
            globalShortcut.unregister(accelerator)
        }

        if (globalShortcut.register(accelerator, callback)) {
            this.globalShortcuts.set(accelerator, callback)
        }
    }

    /**
     * 注册局部快捷键（通过菜单实现）
     * @param {string} accelerator
     * @param {Function} callback
     */
    _registerLocal(accelerator, callback) {
        this.localShortcuts.set(accelerator, callback)
        this._rebuildMenu()
    }


    isRegistered(accelerator){
        return this.localShortcuts.has(accelerator) || this.globalShortcuts.has(accelerator)
    }

    /**
     * 注销快捷键
     * @param {string} accelerator
     */
    unregister(accelerator) {
        if (this.globalShortcuts.has(accelerator)) {
            globalShortcut.unregister(accelerator)
            this.globalShortcuts.delete(accelerator)
        }

        if (this.localShortcuts.has(accelerator)) {
            this.localShortcuts.delete(accelerator)
            this._rebuildMenu()
        }
    }

    /**
     * 注销所有快捷键
     */
    unregisterAll() {
        globalShortcut.unregisterAll()
        this.globalShortcuts.clear()
        this.localShortcuts.clear()
        this._rebuildMenu()
    }

    /**
     * 重新构建菜单（包含所有局部快捷键）
     */
    _rebuildMenu() {
       const template = []

       if (app.isMac) {
            template.push({
                label: app.name,
                submenu: [
                    { role: 'about' },
                    { role: 'quit' }
                ]
            })
       }

        const fileMenu = {
            label: 'File',
            submenu: [
                { role: 'quit' }
            ]
        }

        const editMenu = {
            label: 'Edit',
            submenu: [
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
                { type: 'separator' },
                { role: 'togglefullscreen'},
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' }
            ]
        }

        const shortcutsMenu = {
            label: 'Shortcuts',
            submenu: []
        }

        this.localShortcuts.forEach((callback, accelerator) => {
            shortcutsMenu.submenu.push({
                label: `${accelerator}`,
                accelerator,
                click: callback
            })
        })

        template.push(fileMenu, editMenu, shortcutsMenu)
       if (app.isMac) {
            template.push({
                role: 'window',
                submenu: [
                    { role: 'minimize' },
                    { role: 'front' }
                ]
            })
       }

        const menu = Menu.buildFromTemplate(template)
        Menu.setApplicationMenu(menu)
    }
}

export default new ShortcutBase()