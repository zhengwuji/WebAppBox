import {dialog, ipcMain, app} from 'electron'
import path from 'path'
import fs from 'fs/promises';
import tbsDbManager from '../store/tbsDbManager.js'



class DataExport {

    static ALLOWED_PROPS = ['url', 'tag', 'name', 'img', 'proxy', 'order', 'isOpen', 'jsCode'];
    constructor() {}

    filterObjectProperties(obj) {
        if (typeof obj !== 'object' || obj === null) return {};
        return Object.fromEntries(
            Object.entries(obj).filter(([key]) =>
                DataExport.ALLOWED_PROPS.includes(key)
            )
        );
    }

    isValidUrl(urlString) {
        try {
            new URL(urlString);
            return true;
        } catch (error) {
            return false;
        }
    }

    validateInputData(data) {
        if (!Array.isArray(data)) {
            throw new Error('Input data must be an array');
        }
        if (data.some(item => !item.url || !item.tag)) {
            throw new Error('items must contain "url" and "tag" properties');
        }
    }

    async getConfigData() {
        
        const data = tbsDbManager.getSites();
        return data.map(item => this.filterObjectProperties(item));
    }

    async importConfigData(data) {
        this.validateInputData(data);

        
        const total = data.reduce((acc, item) => {
            if (!this.isValidUrl(item.url) || !item.tag?.trim()) return acc;
            if (item.name && tbsDbManager.getSite(item.name)) return acc;

            const processedItem = this.filterObjectProperties(item);
            tbsDbManager.addSite(processedItem);
            return acc + 1;
        }, 0);
        return total;
    }

    bindIpcMain() {
        ipcMain.handle('export:config', async () => {
            const {canceled, filePath} = await dialog.showSaveDialog({
                title: 'Export Sites Data',
                defaultPath: path.join(app.getPath('downloads'), 'config.json'),
                filters: [
                    {name: 'config.json', extensions: ['json']}
                ]
            });
            if(canceled) return false;

            const data = await this.getConfigData()
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
            return true;
        })

        ipcMain.handle('import:config', async () => {
            const result = await dialog.showOpenDialog({
                title: 'Import Sites Data',
                properties: ['openFile'],
                filters: [{ name: '文本文件', extensions: ['json'] }]
            });
            if (result.canceled) return null;
            try {
                const data = await fs.readFile(result.filePaths[0], 'utf-8');
                return await this.importConfigData(JSON.parse(data));
            } catch (error) {
                throw new Error("导入失败:"+error);
            }
        });
    }
}

export default new DataExport();