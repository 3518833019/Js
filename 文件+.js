// Name: File Manager
// ID: filemanager
// Description: 导入文件读取信息，导出文件时可自定义图标（支持本地图片、网页图片URL）
// By: Your Name
// License: MIT

(function (Scratch) {
    'use strict';

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('File Manager 扩展必须在无沙盒模式下运行');
    }

    class FileManager {
        constructor() {
            // 存储当前导入的文件信息
            this.currentFile = null;
            // 存储导出的图标 data URI
            this.exportIconDataURI = null;
        }

        getInfo() {
            return {
                id: 'filemanager',
                name: '文件管理器',
                color1: '#4C97FF',
                color2: '#3B7DD8',
                color3: '#2A5FA8',
                blocks: [
                    // ===== 导入文件相关积木 =====
                    {
                        opcode: 'importFile',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '导入文件',
                        arguments: {}
                    },
                    {
                        opcode: 'getFileName',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '文件名',
                        arguments: {}
                    },
                    {
                        opcode: 'getFileSize',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '文件大小（字节）',
                        arguments: {}
                    },
                    {
                        opcode: 'getFileType',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '文件类型（MIME）',
                        arguments: {}
                    },
                    {
                        opcode: 'getFileExtension',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '文件扩展名',
                        arguments: {}
                    },
                    {
                        opcode: 'getFileLastModified',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '文件最后修改时间',
                        arguments: {}
                    },
                    {
                        opcode: 'getFileContentText',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '文件文本内容',
                        arguments: {}
                    },
                    {
                        opcode: 'getFileContentBase64',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '文件 Base64 内容',
                        arguments: {}
                    },
                    {
                        opcode: 'getFileContentDataURI',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '文件 Data URI',
                        arguments: {}
                    },
                    {
                        opcode: 'hasFile',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: '已导入文件？',
                        arguments: {}
                    },

                    // ===== 导出文件图标设置相关积木 =====
                    {
                        opcode: 'setIconFromLocal',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '从本地图片设置导出图标',
                        arguments: {}
                    },
                    {
                        opcode: 'setIconFromURL',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '从网页图片 URL 设置导出图标 [URL]',
                        arguments: {
                            URL: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'https://example.com/icon.png'
                            }
                        }
                    },
                    {
                        opcode: 'setIconFromDataURI',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '从 Data URI 设置导出图标 [DATAURI]',
                        arguments: {
                            DATAURI: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'data:image/png;base64,...'
                            }
                        }
                    },
                    {
                        opcode: 'exportFileWithIcon',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '导出文件 [FILENAME] 内容 [CONTENT]（带图标）',
                        arguments: {
                            FILENAME: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'output.txt'
                            },
                            CONTENT: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'Hello World'
                            }
                        }
                    },
                    {
                        opcode: 'exportFileWithIconAndType',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '导出文件 [FILENAME] 类型 [TYPE] 内容 [CONTENT]（带图标）',
                        arguments: {
                            FILENAME: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'output.txt'
                            },
                            TYPE: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'text/plain'
                            },
                            CONTENT: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: 'Hello World'
                            }
                        }
                    },
                    {
                        opcode: 'getCurrentIconDataURI',
                        blockType: Scratch.BlockType.REPORTER,
                        text: '当前图标 Data URI',
                        arguments: {}
                    },
                    {
                        opcode: 'hasIcon',
                        blockType: Scratch.BlockType.BOOLEAN,
                        text: '已设置图标？',
                        arguments: {}
                    },
                    {
                        opcode: 'clearIcon',
                        blockType: Scratch.BlockType.COMMAND,
                        text: '清除导出图标',
                        arguments: {}
                    }
                ]
            };
        }

        // ==================== 导入文件相关 ====================

        /**
         * 通过文件选择器导入文件
         */
        importFile() {
            return new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.style.display = 'none';
                document.body.appendChild(input);

                input.onchange = () => {
                    const file = input.files[0];
                    if (file) {
                        this.currentFile = file;
                        this._readFileContent(file);
                    }
                    document.body.removeChild(input);
                    resolve();
                };

                input.oncancel = () => {
                    document.body.removeChild(input);
                    resolve();
                };

                input.click();
            });
        }

        /**
         * 读取文件内容（存储为 ArrayBuffer 和文本）
         */
        _readFileContent(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.currentFile._arrayBuffer = e.target.result;
                // 尝试作为文本读取
                try {
                    const textReader = new FileReader();
                    textReader.onload = (te) => {
                        this.currentFile._textContent = te.target.result;
                    };
                    textReader.readAsText(file);
                } catch (err) {
                    this.currentFile._textContent = '';
                }
            };
            reader.readAsArrayBuffer(file);
        }

        /**
         * 获取文件名
         */
        getFileName() {
            if (!this.currentFile) return '';
            return this.currentFile.name;
        }

        /**
         * 获取文件大小（字节）
         */
        getFileSize() {
            if (!this.currentFile) return 0;
            return this.currentFile.size;
        }

        /**
         * 获取文件 MIME 类型
         */
        getFileType() {
            if (!this.currentFile) return '';
            return this.currentFile.type || 'application/octet-stream';
        }

        /**
         * 获取文件扩展名
         */
        getFileExtension() {
            if (!this.currentFile) return '';
            const name = this.currentFile.name;
            const lastDot = name.lastIndexOf('.');
            if (lastDot === -1) return '';
            return name.substring(lastDot + 1).toLowerCase();
        }

        /**
         * 获取文件最后修改时间
         */
        getFileLastModified() {
            if (!this.currentFile) return '';
            const date = new Date(this.currentFile.lastModified);
            return date.toLocaleString();
        }

        /**
         * 获取文件文本内容
         */
        getFileContentText() {
            if (!this.currentFile) return '';
            return this.currentFile._textContent || '';
        }

        /**
         * 获取文件 Base64 内容
         */
        getFileContentBase64() {
            if (!this.currentFile || !this.currentFile._arrayBuffer) return '';
            return this._arrayBufferToBase64(this.currentFile._arrayBuffer);
        }

        /**
         * 获取文件 Data URI
         */
        getFileContentDataURI() {
            if (!this.currentFile || !this.currentFile._arrayBuffer) return '';
            const base64 = this._arrayBufferToBase64(this.currentFile._arrayBuffer);
            const mimeType = this.currentFile.type || 'application/octet-stream';
            return `data:${mimeType};base64,${base64}`;
        }

        /**
         * 是否已导入文件
         */
        hasFile() {
            return this.currentFile !== null;
        }

        // ==================== 导出图标设置相关 ====================

        /**
         * 从本地图片选择并设置图标
         */
        setIconFromLocal() {
            return new Promise((resolve) => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.style.display = 'none';
                document.body.appendChild(input);

                input.onchange = () => {
                    const file = input.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            this.exportIconDataURI = e.target.result;
                            document.body.removeChild(input);
                            resolve();
                        };
                        reader.readAsDataURL(file);
                    } else {
                        document.body.removeChild(input);
                        resolve();
                    }
                };

                input.oncancel = () => {
                    document.body.removeChild(input);
                    resolve();
                };

                input.click();
            });
        }

        /**
         * 从 URL 获取图片并转换为 Data URI 作为图标
         */
        setIconFromURL(args) {
            return new Promise((resolve) => {
                const url = args.URL;
                if (!url) {
                    resolve();
                    return;
                }

                // 如果已经是 data URI，直接使用
                if (url.startsWith('data:')) {
                    this.exportIconDataURI = url;
                    resolve();
                    return;
                }

                // 通过 Image 对象加载远程图片
                const img = new Image();
                img.crossOrigin = 'anonymous';

                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width || 256;
                        canvas.height = img.height || 256;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);

                        // 默认输出 PNG
                        const dataURI = canvas.toDataURL('image/png');
                        this.exportIconDataURI = dataURI;
                        resolve();
                    } catch (err) {
                        console.error('[File Manager] 图标转换失败:', err);
                        resolve();
                    }
                };

                img.onerror = () => {
                    console.error('[File Manager] 图片加载失败，可能是跨域限制。请使用支持 CORS 的图片或使用代理。');
                    resolve();
                };

                img.src = url;
            });
        }

        /**
         * 从 Data URI 字符串设置图标
         */
        setIconFromDataURI(args) {
            const dataURI = args.DATAURI;
            if (dataURI && dataURI.startsWith('data:image/')) {
                this.exportIconDataURI = dataURI;
            }
        }

        /**
         * 导出文件（带图标）
         * 将图标信息嵌入到文件开头作为元数据注释
         */
        exportFileWithIcon(args) {
            const filename = args.FILENAME || 'output.txt';
            const content = args.CONTENT || '';
            const mimeType = this._getMimeType(filename);
            this._doExport(filename, content, mimeType);
        }

        /**
         * 导出文件（带图标，指定 MIME 类型）
         */
        exportFileWithIconAndType(args) {
            const filename = args.FILENAME || 'output.txt';
            const content = args.CONTENT || '';
            const mimeType = args.TYPE || 'text/plain';
            this._doExport(filename, content, mimeType);
        }

        /**
         * 实际执行导出操作
         */
        _doExport(filename, content, mimeType) {
            let finalContent = content;
            let finalMimeType = mimeType;

            // 对于文本类文件，可以在内容前添加图标引用信息
            if (mimeType.startsWith('text/') || mimeType === 'application/json') {
                // 在文本文件开头添加图标信息注释
                const iconInfo = this.exportIconDataURI
                    ? `\n<!-- Embedded Icon: ${this._truncateIconURI(this.exportIconDataURI)} -->\n`
                    : '\n<!-- No icon set -->\n';
                finalContent = iconInfo + content;
            }

            // 创建 Blob 并下载
            const blob = new Blob([finalContent], { type: finalMimeType });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
        }

        /**
         * 获取当前图标的 Data URI
         */
        getCurrentIconDataURI() {
            return this.exportIconDataURI || '';
        }

        /**
         * 是否已设置图标
         */
        hasIcon() {
            return this.exportIconDataURI !== null && this.exportIconDataURI !== '';
        }

        /**
         * 清除图标
         */
        clearIcon() {
            this.exportIconDataURI = null;
        }

        // ==================== 工具方法 ====================

        /**
         * ArrayBuffer 转 Base64
         */
        _arrayBufferToBase64(buffer) {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            const chunkSize = 0x8000;
            for (let i = 0; i < bytes.length; i += chunkSize) {
                const chunk = bytes.subarray(i, i + chunkSize);
                binary += String.fromCharCode.apply(null, chunk);
            }
            return btoa(binary);
        }

        /**
         * 根据文件名获取 MIME 类型
         */
        _getMimeType(filename) {
            const ext = filename.split('.').pop().toLowerCase();
            const mimeMap = {
                'txt': 'text/plain',
                'html': 'text/html',
                'htm': 'text/html',
                'css': 'text/css',
                'js': 'text/javascript',
                'json': 'application/json',
                'xml': 'application/xml',
                'csv': 'text/csv',
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif': 'image/gif',
                'svg': 'image/svg+xml',
                'webp': 'image/webp',
                'pdf': 'application/pdf',
                'zip': 'application/zip',
                'mp3': 'audio/mpeg',
                'wav': 'audio/wav',
                'mp4': 'video/mp4',
                'webm': 'video/webm'
            };
            return mimeMap[ext] || 'application/octet-stream';
        }

        /**
         * 截断图标 URI 用于显示（避免过长）
         */
        _truncateIconURI(uri) {
            if (uri.length > 100) {
                return uri.substring(0, 50) + '...[截断，共 ' + uri.length + ' 字符]...' + uri.substring(uri.length - 20);
            }
            return uri;
        }
    }

    Scratch.extensions.register(new FileManager());
})(Scratch);
