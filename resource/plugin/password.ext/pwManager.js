class PwManager {
    constructor() {
        this.currentDomain = window.location.hostname;
        this.observer = null;
        this.init();
    }

    init() {
        if (this.hasPasswordFields()) {
            this.setupMutationObserver();
            this.attachToExistingFields();
            this.restoreCredentials();
        }
    }

    hasPasswordFields() {
        return document.querySelector('input[type="password"]') !== null;
    }

    setupMutationObserver() {
        this.observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length) {
                    this.handleNewNodes(mutation.addedNodes);
                }
            });
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    handleNewNodes(nodes) {
        nodes.forEach(node => {
            if (node.nodeType === 1) {
                const passwordFields = node.querySelectorAll ?
                    node.querySelectorAll('input[type="password"]') : [];

                passwordFields.forEach(passwordField => {
                    this.attachToPasswordField(passwordField);
                });

                if (node.matches('input[type="password"]')) {
                    this.attachToPasswordField(node);
                }
            }
        });
    }

    // 绑定已有字段
    attachToExistingFields() {
        document.querySelectorAll('input[type="password"]').forEach(passwordField => {
            this.attachToPasswordField(passwordField);
        });
    }

    attachToPasswordField(passwordField) {
        const usernameField = this.findUsernameFieldForPassword(passwordField);

        this.overrideAutocomplete(usernameField);
        this.overrideAutocomplete(passwordField);

        // 绑定输入事件
        const handler = this.handleInputChange.bind(this);
        if (usernameField) {
            usernameField.addEventListener('input', handler);
        }
        passwordField.addEventListener('input', handler);

        // 绑定回车键提交
        passwordField.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                this.saveCredentials();
                setTimeout(this.saveCredentials.bind(this), 100);
            }
        });
    }

    findUsernameFieldForPassword(passwordField) {
        // 查找逻辑优化：同级元素、常见模式、属性匹配等
        const container = passwordField.closest('form, div, span, section') || document;
        const candidates = [
            'input[type="text"]',
            'input[type="email"]',
            'input[autocomplete="username"]',
            'input[name*="user"]',
            'input[name*="name"]',
            'input[name*="login"]',
            'input[id*="user"]'
        ];

        // 优先查找前面的输入框
        const allInputs = container.querySelectorAll('input');
        for (let i = 0; i < allInputs.length; i++) {
            if (allInputs[i] === passwordField && i > 0) {
                const prevInput = allInputs[i - 1];
                if (prevInput.matches(candidates.join(','))) {
                    return prevInput;
                }
            }
        }

        // 通用查找
        for (const selector of candidates) {
            const field = container.querySelector(selector);
            if (field && field !== passwordField) return field;
        }

        return null;
    }

    overrideAutocomplete(field) {
        if (field && field.autocomplete === "off") {
            field.autocomplete = "new-password";
            setTimeout(() => {
                field.autocomplete = "off";
            }, 1000);
        }
    }

    handleInputChange(e) {
        this.saveCredentials();
    }

    saveCredentials() {
        // 查找所有密码字段并保存第一个有效组合
        document.querySelectorAll('input[type="password"]').forEach(passwordField => {
            const usernameField = this.findUsernameFieldForPassword(passwordField);
            const username = usernameField?.value;
            const password = passwordField.value;

            if (username && password) {
                const data = {
                    username,
                    password: btoa(unescape(encodeURIComponent(password)))
                };
                localStorage.setItem(this.storageKey, JSON.stringify(data));
            }
        });
    }

    restoreCredentials() {
        const data = JSON.parse(localStorage.getItem(this.storageKey) || '{}');
        const retry = () => {
            document.querySelectorAll('input[type="password"]').forEach(passwordField => {
                const usernameField = this.findUsernameFieldForPassword(passwordField);
                this.fillField(usernameField, data.username);
                this.fillField(passwordField, data.password);
            });
        };

        retry();
        setTimeout(retry, 300);
    }

    fillField(field, value) {
        if (!field || !value) return;

        try {
            const decodedValue = field.type === "password"
                ? decodeURIComponent(escape(atob(value)))
                : value;

            if (field.value !== decodedValue) {
                field.value = decodedValue;
                field.dispatchEvent(new Event('input', { bubbles: true }));
                field.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } catch (e) {
            console.error("字段填充失败:", e);
        }
    }

    get storageKey() {
        return `pm-${this.currentDomain}`;
    }
}

function __initializePasswordManager() {
	if (document.querySelector('input[type="password"]')) {
        new PwManager();
    }
}

// 初始化逻辑保持不变
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', __initializePasswordManager);
} else {
    __initializePasswordManager();
}