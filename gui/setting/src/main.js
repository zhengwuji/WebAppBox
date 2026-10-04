import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import autoHeight from "@/plugins/autoHeight.js";
//import { throttleDirective } from '@/directives/throttle';

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(autoHeight)

// app.directive('throttle', throttleDirective);

app.mount('#app')
