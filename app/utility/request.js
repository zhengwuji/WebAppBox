import { net } from 'electron'

export default async function requestJson(options) {
    return new Promise((resolve, reject) => {
        const {
            url,
            method = 'GET',
            headers = {},
            body = null
        } = options;

        const request = net.request({
            method,
            url
        });

        for (const [key, value] of Object.entries(headers)) {
            request.setHeader(key, value);
        }

        let responseData = '';

        request.on('response', (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Request failed with status ${response.statusCode}`));
                return;
            }

            response.on('data', (chunk) => {
                responseData += chunk.toString();
            });

            response.on('end', () => {
                try {
                    const jsonData = JSON.parse(responseData);
                    resolve(jsonData);
                } catch (error) {
                    reject(new Error('Invalid JSON response'));
                }
            });

            response.on('error', (error) => {
                reject(error);
            });
        });

        request.on('error', (error) => {
            reject(error);
        });

        if (body) {
            request.write(JSON.stringify(body));
        }

        request.end();
    });
}

// // 使用示例 - GET 请求
// requestJson({
//     url: 'https://api.example.com/data',
//     headers: {
//         'Content-Type': 'application/json',
//         'Authorization': 'Bearer your_token_here'
//     }
// }).then(data => console.log(data))
//     .catch(error => console.error(error));
//
// // 使用示例 - POST 请求
// requestJson({
//     url: 'https://api.example.com/data',
//     method: 'POST',
//     headers: {
//         'Content-Type': 'application/json'
//     },
//     body: {
//         key: 'value'
//     }
// }).then(data => console.log(data))
//     .catch(error => console.error(error));