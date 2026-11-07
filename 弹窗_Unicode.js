class UltimateAlertExtension {
    constructor() {
        this.queue = [];
        // \u5f39\u7a97\u961f\u5217
        this.isActive = false; 
        // \u5f53\u524d\u6fc0\u6d3b\u72b6\u6001
        this.config = {
            // \u53ef\u81ea\u5b9a\u4e49\u914d\u7f6e
            colors: {
                success: '#4CAF50',
                warning: '#FFC107',
                error: '#F44336',
                info: '#2196F3',
                question: '#9C27B0'
            },
            animations: {
                in: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                out: 'cubic-bezier(0.6, -0.3, 0.74, 0.05)'
            }
        };
        
        // \u81ea\u52a8\u6ce8\u5165\u6837\u5f0f
        this.injectStyles();
    }

    getInfo() {
        return {
            id: 'ultimateAlert',
            name: '\u5f39\u7a97-\u5706\u7cbd\u5b50YuanZongzi',
            color1: '#3B82F6',
            color2: '#2563EB',
            blocks: [
                {
                    opcode: 'showAlert',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '\u9ad8\u7ea7\u5f39\u7a97 \u7c7b\u578b[TYPE] \u6807\u9898[TITLE] \u5185\u5bb9[CONTENT]',
                    arguments: {
                        TYPE: {
                            type: Scratch.ArgumentType.STRING,
                            menu: 'alertType',
                            defaultValue: 'success'
                        },
                        TITLE: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: '\u64cd\u4f5c\u6210\u529f'
                        },
                        CONTENT: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: '\u5df2\u5b8c\u6210\u8bf7\u6c42'
                        }
                    }
                },{
                    opcode: 'designer',
                    blockType: Scratch.BlockType.REPORTER,
                    text: '\u4f5c\u8005\u4fe1\u606f'
                }
            ],
            menus: {
                alertType: {
                    acceptReporters: true,
                    items: [
                        { text: '\u2705 \u6210\u529f', value: 'success' },
                        { text: '\u26a0\ufe0f \u8b66\u544a', value: 'warning' },
                        { text: '\u274c \u9519\u8bef', value: 'error' },
                        { text: '\u2139\ufe0f \u4fe1\u606f', value: 'info' },
                        { text: '\u2753 \u95ee\u9898', value: 'question' }
                    ]
                }
            }
        };
    }

    showAlert(args) {
        // \u5904\u7406\u8f93\u5165\u53c2\u6570
        const alertData = {
            type: String(args.TYPE).substring(0, 20),
            title: this.sanitize(args.TITLE.toString().substring(0, 50)),
            content: this.sanitize(args.CONTENT.toString().substring(0, 200))
        };
        
        // \u52a0\u5165\u961f\u5217
        this.queue.push(alertData);
        this.processQueue();
    }

	designer() {
        return this.lastResult || '\u5706\u7cbd\u5b50yuanzongzi\u3002https://space.bilibili.com/3546825153841333';
   	 }

    processQueue() {
        if (this.isActive || this.queue.length === 0) return;
        this.isActive = true;
        this.createAlert(this.queue.shift());
    }

    createAlert(data) {
        const { type, title, content } = data;
        const color = this.config.colors[type] || '#3B82F6';
        
        // \u521b\u5efa\u5bb9\u5668
        const container = document.createElement('div');
        container.className = 'ua-container';
        
        // \u5f39\u7a97\u4e3b\u4f53
        const box = document.createElement('div');
        box.className = 'ua-box';
        box.innerHTML = `
            <div class="ua-header">
                ${this.createIcon(type)}
                <h3 class="ua-title">${title}</h3>
            </div>
            <div class="ua-content">${content}</div>
            ${this.createButton(color)}
        `;

        // \u4e8b\u4ef6\u5904\u7406
        const close = () => {
            box.style.transform = 'translate(-50%, -50%) scale(0.95)';
            container.style.opacity = '0';
            setTimeout(() => {
                container.remove();
                this.isActive = false;
                this.processQueue();
            }, 300);
        };

        box.querySelector('.ua-button').onclick = close;
        container.onclick = (e) => e.target === container && close();
        box.onclick = (e) => e.stopPropagation();

        // \u6e32\u67d3\u5230\u9875\u9762
        container.appendChild(box);
        document.body.appendChild(container);
        
        // \u89e6\u53d1\u5165\u573a\u52a8\u753b
        requestAnimationFrame(() => {
            container.style.opacity = '1';
            box.style.transform = 'translate(-50%, -50%) scale(1)';
        });
    }

    createIcon(type) {
        const paths = {
            success: 'M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
            warning: 'M12 2L2 20h20L12 2zm1 13h-2v2h2v-2zm0-6h-2v4h2V9z',
            error: 'M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',
            info: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
            question: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-4h2v2h-2zm1.61-9.96c-2.06-.3-3.61 1.14-3.61 2.96h2c0-.55.45-1 1-1s1 .45 1 1c0 .3-.1 1.25-.74 1.74-.64.5-1.26.76-1.26 1.26v1h2v-.67c0-.52.35-.97.84-1.33 1.48-1.12 1.16-2.95.87-3.67z'
        };
        
        return `
            <svg class="ua-icon" viewBox="0 0 24 24" style="color:${this.config.colors[type]}">
                <path fill="currentColor" d="${paths[type]}"/>
                <circle cx="12" cy="12" r="10" fill="transparent" 
                    stroke="currentColor" stroke-opacity="0.1" stroke-width="2"/>
            </svg>
        `;
    }

    createButton(color) {
        return `
            <button class="ua-button" style="--btn-color:${color}">
                \u786e\u5b9a
                <span class="ua-ripple"></span>
            </button>
        `;
    }

    sanitize(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    injectStyles() {
        if (document.getElementById('ua-styles')) return;

        const style = document.createElement('style');
        style.id = 'ua-styles';
        style.textContent = `
            .ua-container {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0,0,0,0.4);
                display: flex;
                justify-content: center;
                align-items: center;
                opacity: 0;
                transition: opacity 0.3s;
                z-index: 9999;
                backdrop-filter: blur(4px);
            }

            .ua-box {
                background: rgba(255,255,255,0.95);
                padding: 24px;
                border-radius: 16px;
                box-shadow: 0 12px 32px rgba(0,0,0,0.15);
                min-width: 300px;
                max-width: 90vw;
                transform: translate(-50%, -50%) scale(0.9);
                transition: transform 0.4s ${this.config.animations.in};
                position: fixed;
                top: 50%;
                left: 50%;
                border: 1px solid rgba(255,255,255,0.2);
            }

            .ua-header {
                text-align: center;
                margin-bottom: 20px;
            }

            .ua-icon {
                width: 48px;
                height: 48px;
                animation: iconFloat 2s ease-in-out infinite;
            }

            @keyframes iconFloat {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-6px); }
            }

            .ua-title {
                margin: 16px 0 8px;
                color: #1a1a1a;
                font-size: 20px;
                font-weight: 600;
            }

            .ua-content {
                color: #4d4d4d;
                line-height: 1.6;
                margin-bottom: 24px;
                text-align: center;
            }

            .ua-button {
                position: relative;
                overflow: hidden;
                width: 100%;
                padding: 12px 24px;
                background: var(--btn-color);
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
            }

            .ua-button:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            }

            .ua-button:active {
                transform: translateY(1px);
            }

            @media (max-width: 480px) {
                .ua-box {
                    padding: 16px;
                    width: 90vw;
                }
                .ua-icon {
                    width: 40px;
                    height: 40px;
                }
            }
        `;

        document.head.appendChild(style);
    }
}

Scratch.extensions.register(new UltimateAlertExtension());