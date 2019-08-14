
import {ipcRenderer} from 'electron';
import util from './lib/util.js';
import Component from './lib/component.js';

let pages = [];
let editors = [];
let editorMode = [
    {mode: 'html',       title: 'HTML'},
    {mode: 'javascript', title: 'js'},
    {mode: 'glsl',       title: 'vs(1)'},
    {mode: 'glsl',       title: 'fs(1)'},
    {mode: 'glsl',       title: 'vs(2)'},
    {mode: 'glsl',       title: 'fs(2)'},
];

const FONT_SIZE = 16;
const LIGHT_THEME = 'ace/theme/tomorrow';
const DARK_THEME = 'ace/theme/tomorrow_night_bright';
const BUTTON_BLOCK_HEIGHT = 32;
const ICON_SIZE = 16;
const ICON_MARGIN = '8px 6px';
const EDITOR_OPTION = {
    highlightActiveLine: true,
    highlightSelectedWord: true,
    useSoftTabs: true,
    navigateWithinSoftTabs: true,
    vScrollBarAlwaysVisible: true,
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

window.addEventListener('DOMContentLoaded', () => {
    windowSetting()
    .then(() => {
        return initialSetting();
    })
    .then(() => {
        return editorSetting();
    })
    .then(() => {
        eventSetting();
        console.log('📐: welcome editron');
    });
}, false);

function initialSetting(){
    return new Promise((resolve) => {
        let container = document.querySelector('#container');
        let split = new Component.Splitter(container, true);
        split.first.setAttribute('id', 'first');
        split.second.setAttribute('id', 'second');
        split.on('change', (arg) => {console.log(arg);});

        let titles = editorMode.map((v) => {return v.title});
        let tabStrip = new Component.TabStrip(split.second, titles, 0);
        pages = tabStrip.getAllPage();

        let vsplit = new Component.Splitter(split.first, false, 0.2);
        vsplit.first.setAttribute('id', 'vfirst');
        vsplit.second.setAttribute('id', 'vsecond');
        vsplit.on('change', (arg) => {console.log(arg);});

        let frame = document.createElement('iframe');
        vsplit.second.appendChild(frame);

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
            userSelect: 'none',
        });
        let openFolderIcon = document.createElement('img');
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
        vsplit.first.appendChild(leftBlock);
        leftBlock.appendChild(buttonBlock);
        buttonBlock.appendChild(openFolderIcon);
        buttonBlock.appendChild(closeFolderIcon);

        resolve();
    });
}

function editorSetting(){
    return new Promise((resolve) => {
        pages.forEach((v, index) => {
            let editor = ace.edit(v.id);
            editor.$blockScrolling = Infinity;
            editor.setOptions(EDITOR_OPTION);
            editor.session.setMode(`ace/mode/${editorMode[index].mode}`);
            editor.session.setUseWrapMode(true);
            editor.session.setTabSize(4);

            // event setting
            let vimMode = false;
            editor.commands.addCommand({
                name: 'disableCtrl-L',
                bindKey: {win: 'Ctrl-L', mac: 'Command-L'},
                exec: () => {},
            });
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

            editors.push(editor);
        });
        resolve();
    });
}

function eventSetting(){
}

function windowSetting(){
    let fontSize = FONT_SIZE;
    let dark = true;
    return new Promise((resolve) => {
        let ttl = document.body.querySelector('#windowinterfacetitle');
        let min = document.body.querySelector('#windowinterfacecontrollermin');
        let max = document.body.querySelector('#windowinterfacecontrollermax');
        let cls = document.body.querySelector('#windowinterfacecontrollerclose');
        min.addEventListener('click', () => {ipcRenderer.send('minimize', true);}, false)
        max.addEventListener('click', () => {ipcRenderer.send('maximize', true);}, false)
        cls.addEventListener('click', () => {ipcRenderer.send('close', true);}, false)
        window.addEventListener('keydown', (evt) => {
            switch(evt.key){
                case 'I':
                    if(evt.ctrlKey === true || evt.metaKey === true){
                        ipcRenderer.send('opendevtools', {});
                    }
                    break;
                case 'b':
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
                case ',':
                    if((evt.ctrlKey === true || evt.metaKey === true) && evt.altKey === true){
                        --fontSize;
                        pages.forEach((v, index) => {
                            v.style.fontSize = `${fontSize}px`;
                        });
                    }
                    break;
                case '.':
                    if((evt.ctrlKey === true || evt.metaKey === true) && evt.altKey === true){
                        ++fontSize;
                        pages.forEach((v, index) => {
                            v.style.fontSize = `${fontSize}px`;
                        });
                    }
                    break;
                case 'F12':
                    ipcRenderer.send('opendevtools', {});
                    break;
                default:
                    break;
            }
        }, false);
        ipcRenderer.on('settitledom', (evt, arg) => {
            ttl.textContent = arg;
            resolve();
        });
        let title = 'webgl - editron';
        ipcRenderer.send('settitle', title);
    });
}

