/**
 * 系统弹窗扩展 (System Dialogs) for TurboWarp / Scratch 3
 * 作者: Yuanbao
 * 用法: TurboWarp 编辑器 -> 左下角「扩展」-> 「自定义扩展」-> 选择本 .js 文件
 *
 * 功能:
 *  - 自绘系统弹窗: 标题 / 内容 / 任意多个按键
 *  - 自绘输入框弹窗
 *  - 图片弹窗: 图片可来自 http/https 链接, 也可来自本地文件(点按钮选图)
 *  - 图片可点击查看大图(全屏查看器)
 *  - 浏览器原生 alert / confirm / prompt
 *
 * 说明:
 *  - Scratch 的积木格式不支持在积木上动态增加输入框(没有真正的 "+" 号),
 *    因此用两种等价写法来模拟 "(+)":
 *      1) 在积木的「追加按键」输入框里用英文逗号分隔: 重试,忽略,帮助
 *      2) 先用「添加弹窗按键 xxx」积木一个个加, 再用「使用已添加的按键」弹出
 *  - 本地文件导入的图片只存在于当前这次运行(转成了 dataURL), 保存作品不会把它存进去,
 *    需要长期使用时请把图片放到网络链接上, 或用「选择的图片」积木再导出/上传。
 */

(function (Scratch) {
  'use strict';

  const MAX_BUTTONS = 8;

  const SRC_LINK = 'http/https 链接';
  const SRC_FILE = '本地文件';

  const icon = (svg) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  const ICON = icon(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">' +
      '<rect x="3.5" y="7" width="33" height="26" rx="4" fill="#ffffff" stroke="#4C97FF" stroke-width="3"/>' +
      '<path d="M3.5 11a4 4 0 0 1 4-4h25a4 4 0 0 1 4 4v4h-33z" fill="#4C97FF"/>' +
      '<rect x="9" y="19" width="22" height="3" rx="1.5" fill="#4C97FF"/>' +
      '<rect x="9" y="25" width="13" height="3" rx="1.5" fill="#4C97FF"/>' +
      '</svg>'
  );

  const CSS = `
.twsysdlg-mask{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483000;
  background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;
  font-family:"Segoe UI","Microsoft YaHei","PingFang SC","Helvetica Neue",Arial,sans-serif;}
.twsysdlg-box{background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.3);
  min-width:280px;max-width:min(92vw,460px);max-height:92vh;overflow:auto;padding:20px 22px 14px;
  color:#222;user-select:none;}
.twsysdlg-title{margin:0 0 10px;font-size:17px;font-weight:700;line-height:1.4;word-break:break-word;}
.twsysdlg-text{margin:0 0 16px;font-size:14px;line-height:1.6;color:#444;white-space:pre-wrap;word-break:break-word;}
.twsysdlg-input{width:100%;box-sizing:border-box;margin:0 0 16px;padding:8px 10px;font-size:14px;
  border:1px solid #c9d3e0;border-radius:6px;outline:none;color:#222;}
.twsysdlg-input:focus{border-color:#4C97FF;box-shadow:0 0 0 3px rgba(76,151,255,.18);}
.twsysdlg-imgwrap{margin:0 0 14px;text-align:center;}
.twsysdlg-img{max-width:100%;max-height:46vh;border-radius:8px;cursor:zoom-in;
  background:#f0f3f8;display:inline-block;vertical-align:middle;}
.twsysdlg-imgerr{margin:0 0 14px;padding:14px;border-radius:8px;background:#fff1f0;
  color:#c0392b;font-size:13px;line-height:1.6;text-align:center;user-select:text;}
.twsysdlg-hint{margin:-8px 0 12px;font-size:12px;color:#8a94a6;text-align:center;}
.twsysdlg-btns{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;}
.twsysdlg-btn{appearance:none;border:1px solid #c9d3e0;background:#fff;color:#333;
  padding:7px 16px;border-radius:6px;font-size:14px;cursor:pointer;min-width:72px;transition:.15s;}
.twsysdlg-btn:hover{background:#f2f6fc;border-color:#9dbbe8;}
.twsysdlg-btn:active{transform:translateY(1px);}
.twsysdlg-btn.primary{background:#4C97FF;border-color:#4C97FF;color:#fff;font-weight:600;}
.twsysdlg-btn.primary:hover{background:#3d86ea;}
.twsysdlg-lightbox{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483600;
  background:rgba(0,0,0,.86);display:flex;align-items:center;justify-content:center;cursor:zoom-out;}
.twsysdlg-lightbox img{max-width:96vw;max-height:96vh;object-fit:contain;
  box-shadow:0 10px 40px rgba(0,0,0,.6);border-radius:4px;background:#fff;}
`;

  function toText(v) {
    if (v === null || v === undefined) return '';
    return String(v);
  }

  /** 把 "确定, 取消 ,重试" 解析成 ['确定','取消','重试'] */
  function parseList(str) {
    return toText(str)
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * 校验 / 规范化图片地址
   * 只允许 http(s) 链接、data:、blob:，其余一律拒绝(防止 javascript: 之类)
   */
  function normalizeImageUrl(url) {
    const s = toText(url).trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (/^\/\//.test(s)) return 'https:' + s; // 协议相对地址
    if (/^data:image\//i.test(s)) return s;
    if (/^blob:/i.test(s)) return s;
    return 'INVALID';
  }

  class SystemDialogs {
    constructor() {
      this.buttons = [];       // 「添加弹窗按键」累积的按键
      this.lastButton = '';    // 最近一次被按下的按键
      this.lastImage = '';     // 最近一次选择的图片(链接或 dataURL)
      this.mask = null;
      this.resolveFn = null;
      this.onKey = null;
      this._injectCSS();
    }

    _injectCSS() {
      if (document.getElementById('twsysdlg-style')) return;
      const style = document.createElement('style');
      style.id = 'twsysdlg-style';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    getInfo() {
      return {
        id: 'systemdialogs',
        name: '系统弹窗',
        menuIconURI: ICON,
        blockIconURI: ICON,
        color1: '#4C97FF',
        color2: '#3373CC',
        color3: '#2E64A8',
        menus: {
          imageSource: {
            acceptReporters: true,
            items: [SRC_LINK, SRC_FILE]
          }
        },
        blocks: [
          {
            opcode: 'openDialog',
            blockType: Scratch.BlockType.REPORTER,
            text: '弹出弹窗 标题 [TITLE] 内容 [CONTENT] 按键 [B1] [B2] 追加按键 [MORE]',
            arguments: {
              TITLE: { type: Scratch.ArgumentType.STRING, defaultValue: '提示' },
              CONTENT: { type: Scratch.ArgumentType.STRING, defaultValue: '你确定要继续吗？' },
              B1: { type: Scratch.ArgumentType.STRING, defaultValue: '确定' },
              B2: { type: Scratch.ArgumentType.STRING, defaultValue: '取消' },
              MORE: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
            }
          },
          {
            opcode: 'openDialogWithList',
            blockType: Scratch.BlockType.REPORTER,
            text: '弹出弹窗 标题 [TITLE] 内容 [CONTENT] 使用已添加的按键',
            arguments: {
              TITLE: { type: Scratch.ArgumentType.STRING, defaultValue: '提示' },
              CONTENT: { type: Scratch.ArgumentType.STRING, defaultValue: '你确定要继续吗？' }
            }
          },
          {
            opcode: 'addButton',
            blockType: Scratch.BlockType.COMMAND,
            text: '添加弹窗按键 [BTN]',
            arguments: {
              BTN: { type: Scratch.ArgumentType.STRING, defaultValue: '重试' }
            }
          },
          {
            opcode: 'clearButtons',
            blockType: Scratch.BlockType.COMMAND,
            text: '清空弹窗按键'
          },
          {
            opcode: 'inputDialog',
            blockType: Scratch.BlockType.REPORTER,
            text: '弹出输入框 标题 [TITLE] 内容 [CONTENT] 默认 [DEFAULT]',
            arguments: {
              TITLE: { type: Scratch.ArgumentType.STRING, defaultValue: '请输入' },
              CONTENT: { type: Scratch.ArgumentType.STRING, defaultValue: '你的名字是？' },
              DEFAULT: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
            }
          },
          {
            opcode: 'lastButton',
            blockType: Scratch.BlockType.REPORTER,
            text: '被按下的按键'
          },
          '---',
          {
            opcode: 'openImageDialog',
            blockType: Scratch.BlockType.REPORTER,
            text: '弹出图片弹窗 标题 [TITLE] 内容 [CONTENT] 图片 [IMG] 来源 [SOURCE] 按键 [B1] [B2] 追加按键 [MORE]',
            arguments: {
              TITLE: { type: Scratch.ArgumentType.STRING, defaultValue: '查看图片' },
              CONTENT: { type: Scratch.ArgumentType.STRING, defaultValue: '这是一张图片' },
              IMG: { type: Scratch.ArgumentType.STRING, defaultValue: 'https://www.w3.org/2008/site/images/logo-w3c-mobile-lg.png' },
              SOURCE: { type: Scratch.ArgumentType.STRING, menu: 'imageSource', defaultValue: SRC_LINK },
              B1: { type: Scratch.ArgumentType.STRING, defaultValue: '确定' },
              B2: { type: Scratch.ArgumentType.STRING, defaultValue: '取消' },
              MORE: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
            }
          },
          {
            opcode: 'viewImage',
            blockType: Scratch.BlockType.REPORTER,
            text: '全屏查看图片 [IMG] 来源 [SOURCE]',
            arguments: {
              IMG: { type: Scratch.ArgumentType.STRING, defaultValue: '' },
              SOURCE: { type: Scratch.ArgumentType.STRING, menu: 'imageSource', defaultValue: SRC_LINK }
            }
          },
          {
            opcode: 'pickImageFile',
            blockType: Scratch.BlockType.REPORTER,
            text: '选择图片文件'
          },
          {
            opcode: 'lastImage',
            blockType: Scratch.BlockType.REPORTER,
            text: '选择的图片'
          },
          '---',
          {
            opcode: 'nativeAlert',
            blockType: Scratch.BlockType.COMMAND,
            text: '浏览器原生提示 内容 [CONTENT]',
            arguments: {
              CONTENT: { type: Scratch.ArgumentType.STRING, defaultValue: '你好！' }
            }
          },
          {
            opcode: 'nativeConfirm',
            blockType: Scratch.BlockType.BOOLEAN,
            text: '浏览器原生确认 内容 [CONTENT]',
            arguments: {
              CONTENT: { type: Scratch.ArgumentType.STRING, defaultValue: '你确定吗？' }
            }
          },
          {
            opcode: 'nativePrompt',
            blockType: Scratch.BlockType.REPORTER,
            text: '浏览器原生输入 内容 [CONTENT] 默认 [DEFAULT]',
            arguments: {
              CONTENT: { type: Scratch.ArgumentType.STRING, defaultValue: '请输入内容' },
              DEFAULT: { type: Scratch.ArgumentType.STRING, defaultValue: '' }
            }
          },
          {
            opcode: 'closeDialog',
            blockType: Scratch.BlockType.COMMAND,
            text: '关闭所有弹窗'
          }
        ]
      };
    }

    /* ---------- 普通弹窗 ---------- */

    openDialog(args) {
      const btns = [toText(args.B1), toText(args.B2)]
        .concat(parseList(args.MORE))
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return this._dialog(toText(args.TITLE), toText(args.CONTENT), btns.length ? btns : ['确定'], null);
    }

    openDialogWithList(args) {
      const btns = this.buttons.length ? this.buttons.slice() : ['确定', '取消'];
      return this._dialog(toText(args.TITLE), toText(args.CONTENT), btns, null);
    }

    addButton(args) {
      const label = toText(args.BTN).trim();
      if (label && this.buttons.length < MAX_BUTTONS) this.buttons.push(label);
    }

    clearButtons() {
      this.buttons = [];
    }

    inputDialog(args) {
      const buttons = ['确定', '取消'];
      return this._dialog(toText(args.TITLE), toText(args.CONTENT), buttons, {
        value: toText(args.DEFAULT),
        okButton: '确定'
      });
    }

    lastButton() {
      return this.lastButton;
    }

    /* ---------- 图片相关 ---------- */

    /** 打开文件选择器, 把图片读成 dataURL */
    _pickFile() {
      return new Promise((resolve) => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'image/*';
        inp.style.position = 'fixed';
        inp.style.left = '-9999px';
        document.body.appendChild(inp);

        let done = false;
        const finish = (val) => {
          if (done) return;
          done = true;
          if (inp.parentNode) inp.parentNode.removeChild(inp);
          resolve(val);
        };

        inp.addEventListener('change', () => {
          const file = inp.files && inp.files[0];
          if (!file) return finish('');
          if (!/^image\//.test(file.type)) return finish('');
          const reader = new FileReader();
          reader.onload = () => finish(String(reader.result || ''));
          reader.onerror = () => finish('');
          reader.readAsDataURL(file);
        });

        // 取消选择(现代浏览器)的兜底
        inp.addEventListener('cancel', () => finish(''));
        window.addEventListener(
          'focus',
          function onFocus() {
            setTimeout(() => {
              window.removeEventListener('focus', onFocus);
              if (!inp.files || !inp.files.length) finish('');
            }, 800);
          },
          { once: false }
        );

        inp.click();
      });
    }

    /** 根据「来源」决定图片到底从哪来 */
    async _resolveImage(img, source) {
      if (source === SRC_FILE) {
        const raw = toText(img).trim();
        // 已经填了 dataURL / blob 就直接用, 否则弹文件选择器
        const data = raw ? normalizeImageUrl(raw) : '';
        if (data && data !== 'INVALID' && /^(data:|blob:)/i.test(data)) {
          this.lastImage = data;
          return data;
        }
        const picked = await this._pickFile();
        if (picked) this.lastImage = picked;
        return picked;
      }
      const url = normalizeImageUrl(img);
      if (url && url !== 'INVALID') this.lastImage = url;
      return url === 'INVALID' ? 'INVALID' : url;
    }

    async openImageDialog(args) {
      const btns = [toText(args.B1), toText(args.B2)]
        .concat(parseList(args.MORE))
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const src = await this._resolveImage(args.IMG, toText(args.SOURCE).trim() || SRC_LINK);
      return this._dialog(
        toText(args.TITLE) || '查看图片',
        toText(args.CONTENT),
        btns.length ? btns : ['确定'],
        null,
        src
      );
    }

    /** 全屏看图, 点任意处 / Esc 关闭, 返回停留的毫秒数(没啥用但方便做等待) */
    async viewImage(args) {
      const src = await this._resolveImage(args.IMG, toText(args.SOURCE).trim() || SRC_LINK);
      if (!src) return '';
      if (src === 'INVALID') {
        return this._dialog('图片错误', '图片地址无效：只支持 http/https 链接或本地图片文件。', ['确定'], null, 'INVALID');
      }
      const start = Date.now();
      await this._lightbox(src);
      return String(Date.now() - start);
    }

    pickImageFile() {
      return this._pickFile().then((data) => {
        if (data) this.lastImage = data;
        return data;
      });
    }

    lastImage() {
      return this.lastImage;
    }

    /** 全屏查看器 */
    _lightbox(src) {
      return new Promise((resolve) => {
        const box = document.createElement('div');
        box.className = 'twsysdlg-lightbox';
        const img = document.createElement('img');
        img.src = src;
        img.alt = '图片';
        box.appendChild(img);
        document.body.appendChild(box);

        const close = () => {
          document.removeEventListener('keydown', onKey);
          if (box.parentNode) box.parentNode.removeChild(box);
          resolve();
        };
        const onKey = (e) => {
          if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            close();
          }
        };
        box.addEventListener('click', close);
        document.addEventListener('keydown', onKey);
        img.addEventListener('load', () => {
          if (!img.naturalWidth) close();
        });
        img.addEventListener('error', () => {
          if (box.parentNode) box.parentNode.removeChild(box);
          document.removeEventListener('keydown', onKey);
          resolve();
        });
      });
    }

    /* ---------- 原生弹窗 ---------- */

    nativeAlert(args) {
      window.alert(toText(args.CONTENT));
    }

    nativeConfirm(args) {
      return !!window.confirm(toText(args.CONTENT));
    }

    nativePrompt(args) {
      const r = window.prompt(toText(args.CONTENT), toText(args.DEFAULT));
      return r === null ? '' : r;
    }

    closeDialog() {
      this._close('');
    }

    /* ---------- 弹窗核心 ---------- */

    _close(value) {
      if (this.onKey) {
        document.removeEventListener('keydown', this.onKey);
        this.onKey = null;
      }
      if (this.mask && this.mask.parentNode) this.mask.parentNode.removeChild(this.mask);
      this.mask = null;
      if (this.resolveFn) {
        const fn = this.resolveFn;
        this.resolveFn = null;
        fn(value);
      }
    }

    /**
     * @param {string} title   标题
     * @param {string} content 内容
     * @param {string[]} buttons 按键文字
     * @param {?{value:string, okButton:string}} input 带输入框时的配置
     * @param {string} [image] 图片地址(http/https/data/blob), 'INVALID' 表示地址非法
     * @returns {Promise<string>} 被按下的按键文字(带输入框时: 点确定返回输入内容, 否则返回 '')
     */
    _dialog(title, content, buttons, input, image) {
      this._close('');
      const self = this;
      return new Promise((resolve) => {
        const list = (Array.isArray(buttons) ? buttons : []).slice(0, MAX_BUTTONS);
        if (!list.length) list.push('确定');

        const mask = document.createElement('div');
        mask.className = 'twsysdlg-mask';

        const box = document.createElement('div');
        box.className = 'twsysdlg-box';

        const h = document.createElement('div');
        h.className = 'twsysdlg-title';
        h.textContent = title || '提示';
        box.appendChild(h);

        if (content) {
          const p = document.createElement('div');
          p.className = 'twsysdlg-text';
          p.textContent = content;
          box.appendChild(p);
        }

        // 图片区
        if (image) {
          if (image === 'INVALID') {
            const err = document.createElement('div');
            err.className = 'twsysdlg-imgerr';
            err.textContent = '图片加载失败：地址无效。请使用 http:// 或 https:// 开头的链接，或选择本地图片文件。';
            box.appendChild(err);
          } else {
            const wrap = document.createElement('div');
            wrap.className = 'twsysdlg-imgwrap';
            const img = document.createElement('img');
            img.className = 'twsysdlg-img';
            img.alt = '图片';
            img.src = image;
            img.title = '点击放大查看';
            img.addEventListener('click', () => self._lightbox(image));
            img.addEventListener('error', () => {
              const err = document.createElement('div');
              err.className = 'twsysdlg-imgerr';
              err.textContent = '图片加载失败：可能是链接失效、没有开启跨域(CORS)访问权限，或文件格式不支持。';
              if (img.parentNode) img.parentNode.replaceChild(err, img);
            });
            wrap.appendChild(img);
            box.appendChild(wrap);
            const hint = document.createElement('div');
            hint.className = 'twsysdlg-hint';
            hint.textContent = '点击图片可全屏查看';
            box.appendChild(hint);
          }
        }

        let inputEl = null;
        if (input) {
          inputEl = document.createElement('input');
          inputEl.className = 'twsysdlg-input';
          inputEl.type = 'text';
          inputEl.value = input.value || '';
          box.appendChild(inputEl);
        }

        const row = document.createElement('div');
        row.className = 'twsysdlg-btns';

        const finish = (label) => {
          self.lastButton = label;
          let result = label;
          if (input) {
            result = label === input.okButton ? (inputEl ? inputEl.value : '') : '';
          }
          self._close(result);
        };

        list.forEach((label, i) => {
          const b = document.createElement('button');
          b.className = 'twsysdlg-btn' + (i === 0 ? ' primary' : '');
          b.textContent = label;
          b.addEventListener('click', () => finish(label));
          row.appendChild(b);
        });
        box.appendChild(row);

        mask.appendChild(box);
        document.body.appendChild(mask);

        self.mask = mask;
        self.resolveFn = resolve;
        self.onKey = (e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            self.lastButton = '';
            self._close('');
          } else if (e.key === 'Enter' && e.target !== inputEl) {
            e.preventDefault();
            finish(list[0]);
          }
        };
        document.addEventListener('keydown', self.onKey);

        if (inputEl) {
          inputEl.focus();
          inputEl.select();
        } else if (row.firstChild) {
          row.firstChild.focus();
        }
      });
    }
  }

  Scratch.extensions.register(new SystemDialogs());
})(Scratch);
