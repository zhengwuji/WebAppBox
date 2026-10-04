import {app} from 'electron'
import storeManager from '../store/storeManager.js'
class AutoLaunch {

    constructor() {}

    enableAutoLaunch() {
        app.setLoginItemSettings({openAtLogin: true});
    }

    disableAutoLaunch() {
        app.setLoginItemSettings({openAtLogin: false});
    }

    initAutoLaunch() {
        const isAutoLaunch = storeManager.getSetting('isAutoLaunch');
        if (isAutoLaunch) {
            this.enableAutoLaunch();
        } else {
            this.disableAutoLaunch();
        }
    }
}

export default new AutoLaunch();