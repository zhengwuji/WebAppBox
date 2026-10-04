import storeManager from './../store/storeManager.js'
class Layout {

    constructor() {
    }

    getWinSize() {
        let size = storeManager.getSetting('defaultWindowSize');
       return size || { width: 1024, height: 768};
    }

    getMenuWidth() {
        return storeManager.getSetting('defaultMenuWidth') || 50;
    }

    getMenuPos(){
        return storeManager.getSetting('leftMenuPosition') || 'left';
    }

    getMenuVisible(){
        return storeManager.getSetting('isMenuVisible');
    }

    getLayout(win){
        const [width, height] = win.getContentSize();
        const menuWidth = this.getMenuWidth();

        if(!this.getMenuVisible()){
            return {
                menu: {x: 0, y: 0, width: 0, height: height},
                web: {x: 0, y: 0, width: width, height: height},
                view: {x: 0, y: 0, width: width, height: height}
            }
        }

        if(this.getMenuPos() === 'left'){
            return {
                menu: {x: 0, y: 0, width: menuWidth, height: height},
                web: {x: menuWidth, y: 0, width: width - menuWidth, height: height},
                view: {x: 0, y: 0, width: width - menuWidth, height: height}
            }
        }

        return {
            menu: {x: width - menuWidth, y: 0, width: menuWidth, height: height},
            web: {x: 0, y: 0, width: width - menuWidth, height: height},
            view: {x: 0, y: 0, width: width - menuWidth, height: height}
        }
    }
}

export default new Layout();