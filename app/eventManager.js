import {EventEmitter} from 'events'
class EventManager extends EventEmitter{
    constructor() {
        super();
    }

    async send(event, data) {
        return new Promise((resolve) => {
            this.emit(event, data, resolve);
        })
    }
}

export default new EventManager();