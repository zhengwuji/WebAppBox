import { BrowserWindow, net } from 'electron'
import { URL } from 'url'

async function getFaviconUrl(pageUrl) {
    return new Promise((resolve, reject) => {
        const win = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        win.loadURL(pageUrl);
        win.webContents.on('did-finish-load', async () => {
            try {
                const jsCode = getWebFaviconJs();
                const faviconRelUrl = await win.webContents.executeJavaScript(jsCode);
                if (!faviconRelUrl) {
                    reject(new Error("icon文件不存在"));
                    return;
                }
                resolve(faviconRelUrl);
            } catch (error) {
                reject(error);
            } finally {
                win.close();
            }
        });

        win.webContents.on('did-fail-load', (event, errorCode, errorDesc) => {
            reject(new Error(`加载页面失败: ${errorDesc}`));
            win.close();
        });
    });
}

async function fetchFaviconAsBase64(faviconUrl) {
    const MAX_REDIRECTS = 3;
    let redirectCount = 0;
    const fetchWithRedirect = async (url) => {
        return new Promise((resolve, reject) => {
            if(url.startsWith('data:')){
                return resolve(url);
            }

            const request = net.request(url);
            request.on('response', (response) => {
                if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                    if (redirectCount >= MAX_REDIRECTS) {
                        request.abort();
                        return reject(new Error('Too many redirects'));
                    }

                    const location = response.headers.location;
                    if (!location) return reject(new Error('Redirect with no Location header'));

                    redirectCount++;
                    resolve(fetchWithRedirect(new URL(location, url).href));
                    return;
                }

                if (response.statusCode < 200 || response.statusCode >= 300) {
                    request.abort();
                    return reject(new Error(`HTTP ${response.statusCode}`));
                }

                const chunks = [];
                response.on('data', chunk => chunks.push(chunk));
                response.on('end', () => {
                    const contentType = response.headers['content-type']?.split(';')[0] || 'image/x-icon';
                    const buffer = Buffer.concat(chunks);
                    resolve(`data:${contentType};base64,${buffer.toString('base64')}`);
                });
            });

            request.on('error', reject);
            request.end();
        });
    };

    try {
        return await fetchWithRedirect(faviconUrl);
    } catch (error) {
        throw new Error(`下载图标失败: ${error.message}`);
    }

}

function getWebFaviconJs() {
    return `
        (function() {
            const links = Array.from(document.querySelectorAll('link')).filter(link => {
                const rel = link.rel.toLowerCase();
                return rel.includes('icon') || rel.includes('apple-touch-icon');
            });
    
            if(links.length === 0){
                return new URL('/favicon.ico', window.location.href).href;
            }
            const dataLink = links.find(link => {
                return link.href.startsWith('data:');
            })
            if(dataLink){
                return dataLink.href;
            }
            const appleLink = links.find(link => {
                return link.rel.toLowerCase().includes('apple');
            })
            if(appleLink){
                return new URL(appleLink.href, window.location.href).href;
            }
            const pngLink = links.find(link => {
                return link.href.toLowerCase().endsWith('.png');
            })
            if(pngLink){
                return  new URL(pngLink.href, window.location.href).href;
            }
            const svgLink = links.find(link => {
                return link.href.toLowerCase().endsWith('.svg');
            })
            if(svgLink){
                return  new URL(svgLink.href, window.location.href).href;
            }
            const icoLink = links.find(link => {
                return link.href.toLowerCase().endsWith('.ico');
            })
            if(icoLink){
                return new URL(icoLink.href, window.location.href).href;
            }
            return null;
        })();
        `
}

export default {
    getFaviconUrl,
    fetchFaviconAsBase64
}