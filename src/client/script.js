
import {ipcRenderer, webFrame} from 'electron';
import util from './lib/util.js';
import Component from './lib/component.js';

let macos = process.platform === 'darwin';
let latestResponse = null; // サーバからのレスポンス（ファイル情報などを含む）
let latestActive   = null; // ユーザーがアクティブにしたソースコードのインデックス
let items          = [];   // 読み込んだプロジェクトに含まれるソースコード（ディレクトリ）
let pages          = [];   // エディタを格納するページ DOM
let editors        = [];   // エディタ
// mode: Ace に設定するモード, name: サーバからのレスポンスとのマッチに使う名前, title: タブの表記
let editorMode = [
    {mode: 'html',       name: 'html', title: 'HTML'},
    {mode: 'javascript', name: 'js',   title: 'js'},
    {mode: 'glsl',       name: 'vs1',  title: 'vert(1)'},
    {mode: 'glsl',       name: 'fs1',  title: 'frag(1)'},
    {mode: 'glsl',       name: 'vs2',  title: 'vert(2)'},
    {mode: 'glsl',       name: 'fs2',  title: 'frag(2)'},
];

const FONT_SIZE           = 16;                                // 基本のフォントサイズ
const LIGHT_THEME         = 'ace/theme/tomorrow';              // ライト・テーマ
const DARK_THEME          = 'ace/theme/tomorrow_night_bright'; // ダーク・テーマ
const BUTTON_BLOCK_HEIGHT = 32;                                // ボタン領域の高さ
const ICON_SIZE           = 16;                                // ボタンの大きさ
const ICON_MARGIN         = '8px 7px';                         // ボタンの余白
// Ace に設定するオプション
const EDITOR_OPTION = {
    highlightActiveLine: true,
    highlightSelectedWord: true,
    useSoftTabs: true,
    navigateWithinSoftTabs: true,
    vScrollBarAlwaysVisible: true,
    autoScrollEditorIntoView: true,
    scrollPastEnd: 1.0,
    highlightGutterLine: true,
    showPrintMargin: false,
    printMargin: false,
    displayIndentGuides: true,
    fontSize: `${FONT_SIZE}px`,
    fontFamily: '"Ricty Diminished Discord", "Ricty Diminished", Ricty, Monaco, consolas, monospace',
    theme: DARK_THEME,
    enableBasicAutocompletion: true,
    enableSnippets: false,
    enableLiveAutocompletion: true,
};

// DOM Content Loaded でフロント側の設定等を開始する
window.addEventListener('DOMContentLoaded', () => {
    // このウィンドウに関する全体の設定
    windowSetting()
    .then(() => {
        // 初期化（主に DOM の生成）
        return initialSetting();
    })
    .then(() => {
        // Ace の設定関連
        return editorSetting();
    })
    .then(() => {
        // イベント処理
        eventSetting();
        // ステータスバーを更新して準備完了
        setStatusBarMessage('📐: welcome editron');
        setStatusBarIcon(
            '#windowinterfacestatuseditron',
            'green', true,
            'editron initialize success'
        );
    });
}, false);

/**
 * @param {string} text - 設定するテキスト
 */
function setStatusBarMessage(text){
    let message = document.querySelector('#windowinterfacestatusmessage');
    message.textContent = text;
}

/**
 * ステータスバーの右側にあるアイコンの更新を行う
 * @param {string} targetId - 対象となる DOM の ID
 * @param {string} stat - green, yellow, red
 * @param {boolean} add - stat で指定された色を設定するか、解除するか
 * @param {string} title - title 属性に設定する文字列
 */
function setStatusBarIcon(targetId, stat, add, title){
    let icon = document.querySelector(targetId);
    if(add === true){
        icon.classList.add(stat);
    }else{
        icon.classList.remove(stat);
    }
    icon.setAttribute('title', title);
}

/**
 * @return {Promise}
 */
function windowSetting(){
    let fontSize = FONT_SIZE;
    let dark = true;
    // Electron 自体のズームは行われないように設定する
    webFrame.setZoomFactor(1);
    webFrame.setVisualZoomLevelLimits(1, 1);
    webFrame.setLayoutZoomLevelLimits(0, 0);
    return new Promise((resolve) => {
        // header
        let ttl = document.body.querySelector('#windowinterfacetitle');
        let min = document.body.querySelector('#windowinterfacecontrollermin');
        let max = document.body.querySelector('#windowinterfacecontrollermax');
        let cls = document.body.querySelector('#windowinterfacecontrollerclose');
        if(macos === true){
            let head = document.body.querySelector('#windowinterfaceheader');
            let menu = document.body.querySelector('#windowinterfacemenuicon');
            let ctrl = document.body.querySelector('#windowinterfacecontroller');
            head.style.lineHeight = '22px';
            head.style.minHeight  = '22px';
            head.style.maxHeight  = '22px';
            menu.style.minWidth = '4px';
            menu.style.maxWidth = '4px';
            ttl.style.fontSize = 'smaller';
            ttl.style.textAlign = 'center';
            ttl.style.padding = '0px 8px 0px 64px';
            ctrl.style.display = 'none';
        }else{
            min.addEventListener('click', () => {ipcRenderer.send('minimize', true);}, false);
            max.addEventListener('click', () => {ipcRenderer.send('maximize', true);}, false);
            cls.addEventListener('click', () => {ipcRenderer.send('close', true);}, false);
        }
        // footer
        let footer = document.body.querySelector('#windowinterfacefooter');
        // window level event
        window.addEventListener('resize', () => {
            if(editors == null || Array.isArray(editors) !== true){return;}
            editors.forEach((v) => {
                v.resize();
            });
        }, false);
        window.addEventListener('keydown', (evt) => {
            switch(evt.key){
                // 保存および更新
                case 's':
                    if(evt.ctrlKey === true || evt.metaKey === true){
                        saveEditorSource();
                    }
                    break;
                // 開発者ツール
                case 'i':
                case 'I':
                    if(evt.ctrlKey === true || evt.metaKey === true){
                        ipcRenderer.send('opendevtools', {});
                    }
                    break;
                case 'F12':
                    ipcRenderer.send('opendevtools', {});
                    break;
                // テーマの反転
                case 'b':
                case '∫':
                    if((evt.ctrlKey === true || evt.metaKey === true) && evt.altKey === true){
                        dark = !dark;
                        editors.forEach((v, index) => {
                            if(dark === true){
                                v.setTheme(DARK_THEME);
                            }else{
                                v.setTheme(LIGHT_THEME);
                            }
                        });
                    }
                    break;
                // フォントサイズ減
                case '-':
                case '_':
                    if(evt.ctrlKey === true || evt.metaKey === true){
                        --fontSize;
                        pages.forEach((v, index) => {
                            v.style.fontSize = `${fontSize}px`;
                        });
                    }
                    break;
                // フォントサイズ増
                case '=':
                case '+':
                    if(evt.ctrlKey === true || evt.metaKey === true){
                        ++fontSize;
                        pages.forEach((v, index) => {
                            v.style.fontSize = `${fontSize}px`;
                        });
                    }
                    break;
                default:
                    break;
            }
        }, false);
        // 最後にタイトルを更新
        ipcRenderer.on('settitledom', (evt, arg) => {
            ttl.textContent = arg;
            resolve();
        });
        let title = 'webgl - editron';
        ipcRenderer.send('settitle', title);
    });
}

/**
 * @return {Promise}
 */
function initialSetting(){
    return new Promise((resolve) => {
        // 上下を分けるスプリッタ
        let container = document.querySelector('#container');
        let split = new Component.Splitter(container, true);
        split.first.setAttribute('id', 'first');
        split.second.setAttribute('id', 'second');
        split.on('change', (arg) => {
            editors.forEach((v) => {
                v.resize();
            });
            setFrameSize();
        });
        // タブストリップ
        let titles = editorMode.map((v) => {return v.title});
        let tabStrip = new Component.TabStrip(split.second, titles, 0);
        tabStrip.on('change', () => {
            editors.forEach((v) => {
                v.resize();
            });
        });
        pages = tabStrip.getAllPage();
        // 上段を左右に分けるスプリッタ
        let vsplit = new Component.Splitter(split.first, false, 0.2);
        vsplit.on('change', (arg) => {
            setFrameSize();
        });
        vsplit.first.setAttribute('id', 'vfirst');
        vsplit.second.setAttribute('id', 'vsecond');
        // プレビュー用の iframe
        let frame = document.createElement('iframe');
        frame.setAttribute('id', 'frame');
        vsplit.second.appendChild(frame);
        // 上段左サイドバー
        let leftBlock = document.createElement('div');
        util.appendStyle(leftBlock, {
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
        });
        let buttonBlock = document.createElement('div');
        util.appendStyle(buttonBlock, {
            width: '100%',
            minHeight: `${BUTTON_BLOCK_HEIGHT}px`,
            maxHeight: `${BUTTON_BLOCK_HEIGHT}px`,
            display: 'flex',
            flexDirection: 'row',
            overflow: 'hidden',
            userSelect: 'none',
        });
        let openFolderIcon = document.createElement('img');
        openFolderIcon.setAttribute('id', 'open');
        openFolderIcon.setAttribute('title', 'プロジェクトを開く');
        openFolderIcon.src = './image/folder_plus.svg';
        util.appendStyle(openFolderIcon, {
            width: `${ICON_SIZE}px`,
            height: `${ICON_SIZE}px`,
            margin: ICON_MARGIN,
            cursor: 'pointer',
            filter: 'invert(0.5)',
            userSelect: 'none',
        });
        openFolderIcon.addEventListener('mouseenter', () => {
            openFolderIcon.style.filter = 'invert(1)';
        });
        openFolderIcon.addEventListener('mouseleave', () => {
            openFolderIcon.style.filter = 'invert(0.5)';
        });
        let closeFolderIcon = document.createElement('img');
        closeFolderIcon.setAttribute('id', 'close');
        closeFolderIcon.setAttribute('title', 'プロジェクトを閉じる');
        closeFolderIcon.src = './image/folder_minus.svg';
        util.appendStyle(closeFolderIcon, {
            width: `${ICON_SIZE}px`,
            height: `${ICON_SIZE}px`,
            margin: ICON_MARGIN,
            cursor: 'pointer',
            filter: 'invert(0.5)',
            userSelect: 'none',
        });
        closeFolderIcon.addEventListener('mouseenter', () => {
            closeFolderIcon.style.filter = 'invert(1)';
        });
        closeFolderIcon.addEventListener('mouseleave', () => {
            closeFolderIcon.style.filter = 'invert(0.5)';
        });
        let playIcon = document.createElement('img');
        playIcon.setAttribute('id', 'play');
        playIcon.setAttribute('title', 'ソースコードを保存しプレビューを更新 (Ctrl+s or Command+s)');
        playIcon.src = './image/play.svg';
        util.appendStyle(playIcon, {
            width: `${ICON_SIZE}px`,
            height: `${ICON_SIZE}px`,
            margin: ICON_MARGIN,
            cursor: 'pointer',
            filter: 'invert(0.5)',
            userSelect: 'none',
        });
        playIcon.addEventListener('mouseenter', () => {
            playIcon.style.filter = 'invert(1)';
        });
        playIcon.addEventListener('mouseleave', () => {
            playIcon.style.filter = 'invert(0.5)';
        });
        let stopIcon = document.createElement('img');
        stopIcon.setAttribute('id', 'stop');
        stopIcon.setAttribute('title', 'プレビューを停止');
        stopIcon.src = './image/stop.svg';
        util.appendStyle(stopIcon, {
            width: `${ICON_SIZE}px`,
            height: `${ICON_SIZE}px`,
            margin: ICON_MARGIN,
            cursor: 'pointer',
            filter: 'invert(0.5)',
            userSelect: 'none',
        });
        stopIcon.addEventListener('mouseenter', () => {
            stopIcon.style.filter = 'invert(1)';
        });
        stopIcon.addEventListener('mouseleave', () => {
            stopIcon.style.filter = 'invert(0.5)';
        });
        let listBlock = document.createElement('div');
        listBlock.setAttribute('id', 'listblock');
        util.appendStyle(listBlock, {
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
        });
        // appending
        vsplit.first.appendChild(leftBlock);
        leftBlock.appendChild(buttonBlock);
        leftBlock.appendChild(listBlock);
        buttonBlock.appendChild(openFolderIcon);
        buttonBlock.appendChild(closeFolderIcon);
        buttonBlock.appendChild(playIcon);
        buttonBlock.appendChild(stopIcon);

        resolve();
    });
}

/**
 * @return {Promise}
 */
function editorSetting(){
    return new Promise((resolve) => {
        // タブの各ページにエディタを配置し初期化する
        pages.forEach((v, index) => {
            let editor = ace.edit(v.id);
            editor.$blockScrolling = Infinity;
            editor.setOptions(EDITOR_OPTION);
            editor.session.setMode(`ace/mode/${editorMode[index].mode}`);
            editor.session.setUseWrapMode(true);
            editor.session.setTabSize(4);

            // event setting
            let vimMode = false;
            // 諸事情により Command + L は封印する
            editor.commands.addCommand({
                name: 'disableCtrl-L',
                bindKey: {win: 'Ctrl-L', mac: 'Command-L'},
                exec: () => {},
            });
            // vim のキーバインドに変更
            editor.commands.addCommand({
                name: 'toggleVimMode',
                bindKey: {win: 'Ctrl-Alt-V', mac: 'Command-Alt-V'},
                exec: () => {
                    if(vimMode !== true){
                        editor.setKeyboardHandler('ace/keyboard/vim');
                    }else{
                        editor.setKeyboardHandler(null);
                    }
                    vimMode = !vimMode;
                },
            });

            // 変更があったことを検出して左サイドバーのリスト上にインジケータを出すための処理
            editor.session.on('change', () => {
                if(latestResponse != null && latestActive != null && latestResponse.dirs[latestActive] != null){
                    latestResponse.dirs[latestActive].changes = true;
                    items[latestActive].update(null, true)
                }
            });

            editors.push(editor);
        });

        resolve();
    });
}

function eventSetting(){
    // 左サイドバー上のボタン類に対するイベントを設定する
    let open  = document.querySelector('#open');
    let close = document.querySelector('#close');
    let play  = document.querySelector('#play');
    let stop  = document.querySelector('#stop');

    open.addEventListener('click', () => {
        // 変更済みのソースコードがある場合、開く前に尋ねる
        if(latestResponse != null && latestActive != null && items[latestActive].changes === true){
            let message = 'ソースコードの変更後、一度も実行していない変更は破棄されます。\n新規プロジェクトを開いてよろしいですか？';
            nativeDialog('info', message)
            .then((res) => {
                if(res > 0){
                    nativeOpenDirectory();
                }
            });
        }else{
            nativeOpenDirectory();
        }
    }, false);
    close.addEventListener('click', () => {
        // 変更済みのソースコードがある場合、閉じてしまう前に尋ねる
        if(latestResponse != null && latestActive != null && items[latestActive].changes === true){
            let message = 'ソースコードの変更後、一度も実行していない変更は破棄されます。\n現在のプロジェクトを閉じてよろしいですか？';
            nativeDialog('info', message)
            .then((res) => {
                if(res > 0){
                    nativeCloseServer();
                }
            });
        }else{
            nativeCloseServer();
        }
    }, false);
    play.addEventListener('click', () => {
        // Command + s と同等
        saveEditorSource();
    });
    stop.addEventListener('click', () => {
        // iframe の中身だけをリセットする
        clearFrame();
        setStatusBarMessage('clear');
        setStatusBarIcon('#windowinterfacestatusfile', 'green', false, 'clear frame');
    });
}

/**
 * Electron を経由してネイティブ（かつモーダル）なダイアログを出す
 * @param {string} title - タイトル
 * @param {string} message - ダイアログのメッセージ本文
 * @param {Array.<string>} [buttons] - 省略時は OK, cancel になる
 *
 */
function nativeDialog(title, message, buttons){
    return new Promise((resolve) => {
        ipcRenderer.once('nativedialog', (arg, res) => {
            resolve(res);
        });
        ipcRenderer.send('nativedialog', {title: title, message: message, buttons: buttons});
    });
}

/**
 * ローカルのディレクトリを開くダイアログを出し、結果によってはそれを開いたあと
 * 読み込んだファイルの情報一覧と共に情報が返される。このとき、ファイルの情報が
 * 得られた場合はサーバ実装側でローカルサーバを起動している。
 * ポート番号はレスポンスに含まれるため、iframe には `http://localhost:port/dirname`
 * のように URL を指定することができる。
 */
function nativeOpenDirectory(){
    ipcRenderer.once('localserverrunning', (arg, res) => {
        if(res === false){
            // キャンセルされた場合
            setStatusBarMessage('cancel on project open dialog');
        }else if(res.hasOwnProperty('err') === true){
            // 何かしらのエラー
            setStatusBarMessage(`Error: ${res.err}`);
            setStatusBarIcon('#windowinterfacestatuslocalserver', 'green', false, '');
            setStatusBarIcon('#windowinterfacestatuslocalserver', 'yellow', false, '');
            setStatusBarIcon('#windowinterfacestatuslocalserver', 'red', true, 'project open failed');
            nativeDialog('error', 'ソースコードの構成が正しくないためプロジェクトを開けませんでした。', ['OK']);
        }else{
            // レスポンスの内容を確認
            if(Array.isArray(res.dirs) !== true || res.dirs.length === 0){
                setStatusBarMessage(`Error: ${res.err}`);
                setStatusBarIcon('#windowinterfacestatuslocalserver', 'green', false, '');
                setStatusBarIcon('#windowinterfacestatuslocalserver', 'yellow', false, '');
                setStatusBarIcon('#windowinterfacestatuslocalserver', 'red', true, 'project open failed');
                nativeDialog('error', 'ソースコードの構成が正しくないか不正なプロジェクトです。', ['OK']);
                return;
            }
            setStatusBarMessage(`open project: [ ${res.pwd} ]`)
            setStatusBarIcon('#windowinterfacestatuslocalserver', 'red', false, '');
            setStatusBarIcon('#windowinterfacestatuslocalserver', 'yellow', false, '');
            setStatusBarIcon('#windowinterfacestatuslocalserver', 'green', true, 'project open success');
            // 開く前にすべてをリセット
            clearFrame();
            clearList();
            clearEditor();
            let left = document.querySelector('#listblock');
            items = [];
            latestResponse = res;
            latestResponse.dirs.forEach((v, index) => {
                let item = new Component.Item(left, index, v.dirName, false);
                items[index] = item;
                item.on('click', (idx) => {
                    const update = () => {
                        latestActive = idx;
                        setEditorSource(latestResponse.dirs[idx].data);
                        items.forEach((w, i) => {
                            w.update(false, false);
                        });
                        item.update(true, false);
                        setFrameSource(idx);
                        setStatusBarMessage(`start: [ ${latestResponse.dirs[idx].dirName} ]`);
                        setStatusBarIcon('#windowinterfacestatusfile', 'red', false, '');
                        setStatusBarIcon('#windowinterfacestatusfile', 'yellow', false, '');
                        setStatusBarIcon('#windowinterfacestatusfile', 'green', true, 'start success');
                    };
                    // ソースコードに変更が加えられているかどうかなどにより分岐する
                    if(latestActive != null && idx !== latestActive && items[latestActive].changes === true){
                        let message = `現在のソースコード[ ${latestResponse.dirs[latestActive].dirName} ]に変更が加えられています。\n[ ${latestResponse.dirs[idx].dirName} ] を読み込むとその変更は破棄されます。読み込みを開始してよろしいですか？`;
                        nativeDialog('info', message)
                        .then((res) => {
                            if(res > 0){
                                update();
                            }
                        });
                    }else{
                        if(idx === latestActive && items[latestActive].changes === true){
                            // 現在のソースに変更が加えられているときに現在のソースを選択した場合
                            // フレームだけを更新してリスト等は操作しない
                            setFrameSource(idx);
                            setStatusBarMessage(`start: [ ${latestResponse.dirs[idx].dirName} ]`);
                            setStatusBarIcon('#windowinterfacestatusfile', 'red', false, '');
                            setStatusBarIcon('#windowinterfacestatusfile', 'yellow', false, '');
                            setStatusBarIcon('#windowinterfacestatusfile', 'green', true, 'start success');
                        }else{
                            update();
                        }
                    }
                });
            });
        }
    });
    ipcRenderer.send('opendirectory');
}

/**
 * サーバ実装側で起動したローカルサーバを停止する
 */
function nativeCloseServer(){
    ipcRenderer.once('localserverclosed', (arg, res) => {
        clearFrame();
        clearList();
        clearEditor();
        setStatusBarMessage(`local server closed`)
        setStatusBarIcon('#windowinterfacestatuslocalserver', 'green', false, '');
    });
    ipcRenderer.send('closelocalserver');
}

/**
 * iframe の中身をクリアする
 */
function clearFrame(){
    let frame = document.querySelector('#frame');
    frame.src = 'about:blank';
}

/**
 * 左サイドバー上のディレクトリ名一覧を削除する
 */
function clearList(){
    let left = document.querySelector('#listblock');
    while(left.children.length > 0){
        left.removeChild(left.children[0]);
    }
}

/**
 * エディタの中身をすべてクリアする
 */
function clearEditor(){
    latestResponse = null;
    latestActive = null;
    editors.forEach((v, index) => {
        v.setValue('', -1);
    });
}

/**
 * レスポンスの情報をエディタに反映する
 */
function setEditorSource(data){
    editorMode.forEach((v, index) => {
        for(let name in data){
            if(v.name === name){
                editors[index].setValue(data[name].data, -1);
                continue;
            }
        }
    });
}

/**
 * エディタの情報をレスポンスに反映したのちサーバにプッシュし物理的にファイルを保存する
 */
function saveEditorSource(){
    if(latestResponse == null || latestActive == null){return;}
    editorMode.forEach((v, index) => {
        for(let name in latestResponse.dirs[latestActive].data){
            if(v.name === name){
                latestResponse.dirs[latestActive].data[name] = {data: editors[index].getValue(), exists: true};
                continue;
            }
        }
    });
    ipcRenderer.once('savefile', (res) => {
        if(res.hasOwnProperty('err') === true){
            setStatusBarMessage(`Error: ${res.err}`);
            setStatusBarIcon('#windowinterfacestatusfile', 'green', false, '');
            setStatusBarIcon('#windowinterfacestatusfile', 'yellow', false, '');
            setStatusBarIcon('#windowinterfacestatusfile', 'red', true, 'save file failed');
            nativeDialog('error', 'ファイルを保存できませんでした。', ['OK']);
        }else{
            setStatusBarMessage(`save project: [ ${latestResponse.dirs[latestActive].dirName} ]`);
            setStatusBarIcon('#windowinterfacestatusfile', 'red', false, '');
            setStatusBarIcon('#windowinterfacestatusfile', 'yellow', false, '');
            setStatusBarIcon('#windowinterfacestatusfile', 'green', true, 'save file success');
            items[latestActive].update(null, false);
            setFrameSource(latestActive);
        }
    });
    ipcRenderer.send('saveproject', latestResponse.dirs[latestActive]);
}

/**
 * iframe に URL を設定しロードする
 */
function setFrameSource(index){
    clearFrame();
    let frame = document.querySelector('#frame');
    frame.src = `http://localhost:${latestResponse.port}/${latestResponse.dirs[index].dirName}`;
}

/**
 * iframe のサイズを設定する
 */
function setFrameSize(){
    let frame = document.querySelector('#frame');
    let bound = frame.parentElement.getBoundingClientRect();
    frame.width = bound.width;
    frame.height = bound.height;
}

