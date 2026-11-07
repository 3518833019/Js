class UltimateAlertExtension {
    constructor() {
        this.queue = [];
        // 弹窗队列
        this.isActive = false; 
        // 当前激活状态
        this.config = {
            // 可自定义配置
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
        
        // 自动注入样式
        this.injectStyles();
    }

    getInfo() {
        return {
            id: 'ultimateAlert',
            name: '弹窗-圆粽子YuanZongzi',
            color1: '#3B82F6',
            color2: '#2563EB',
            blocks: [
                {
                    opcode: 'showAlert',
                    blockType: Scratch.BlockType.COMMAND,
                    text: '高级弹窗 类型[TYPE] 标题[TITLE] 内容[CONTENT]',
                    arguments: {
                        TYPE: {
                            type: Scratch.ArgumentType.STRING,
                            menu: 'alertType',
                            defaultValue: 'success'
                        },
                        TITLE: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: '操作成功'
                        },
                        CONTENT: {
                            type: Scratch.ArgumentType.STRING,
                            defaultValue: '已完成请求'
                        }
                    }
                },{
                    opcode: 'designer',
                    blockType: Scratch.BlockType.REPORTER,
                    text: '作者信息'
                }
            ],
            menus: {
                alertType: {
                    acceptReporters: true,
                    items: [
                        { text: '? 成功', value: 'success' },
                        { text: '?? 警告', value: 'warning' },
                        { text: '? 错误', value: 'error' },
                        { text: '?? 信息', value: 'info' },
                        { text: '? 问题', value: 'question' }
                    ]
                }
            }
        };
    }

    showAlert(args) {
        // 处理输入参数
        const alertData = {
            type: String(args.TYPE).substring(0, 20),
            title: this.sanitize(args.TITLE.toString().substring(0, 50)),
            content: this.sanitize(args.CONTENT.toString().substring(0, 200))
        };
        
        // 加入队列
        this.queue.push(alertData);
        this.processQueue();
    }

	designer() {
        return this.lastResult || '圆粽子yuanzongzi。https://space.bilibili.com/3546825153841333';
   	 }

    processQueue() {
        if (this.isActive || this.queue.length === 0) return;
        this.isActive = true;
        this.createAlert(this.queue.shift());
    }

    createAlert(data) {
        const { type, title, content } = data;
        const color = this.config.colors[type] || '#3B82F6';
        
        // 创建容器
        const container = document.createElement('div');
        container.className = 'ua-container';
        
        // 弹窗主体
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

        // 事件处理
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

        // 渲染到页面
        container.appendChild(box);
        document.body.appendChild(container);
        
        // 触发入场动画
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
                确定
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