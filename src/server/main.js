
import http from 'http';
import fs from 'fs';
import path from 'path';
import {app, ipcMain, dialog, BrowserWindow} from 'electron';
import connect from 'electron-connect';
import local from 'connect';
import serveStatic from 'serve-static';

// constant variable ==========================================================
const LOCAL_PORT = 56565;
const IS_DEVELOPMENT = __MODE__ === 'development';
const INDEX_HTML_PATH = IS_DEVELOPMENT ? './app/client/index.html' : './client/index.html';
const MAIN_WINDOW_PARAMETER = {
    width: 1500,
    height: 800,
    frame: false,
    webPreferences: {
        nodeIntegration: true
    }
};

// variables ==================================================================
let mainWindow;    // main window
let connectClient; // connector from electron-connect for client
let connectApp = local();
let server = null;

// app events =================================================================
let isLockable = app.requestSingleInstanceLock();
if(isLockable !== true){app.quit();}

app.on('second-instance', () => {
    if(mainWindow != null){
        if(mainWindow.isMinimized() === true){
            mainWindow.restore();
        }
        mainWindow.focus();
    }
});

app.on('ready', () => {
    createMainWindow();
});

app.on('window-all-closed', () => {
    mainWindow = null;
    app.quit();
});

// function ===================================================================
function createMainWindow(){
    // create new browser window
    mainWindow = new BrowserWindow(MAIN_WINDOW_PARAMETER);
    mainWindow.loadFile(INDEX_HTML_PATH);

    mainWindow.on('closed', () => {
        mainWindow = null;
        if(IS_DEVELOPMENT === true){
            connectClient.sendMessage('quit', null);
        }
    });

    ipcMain.on('minimize', (evt, arg) => {
        mainWindow.minimize();
    });
    ipcMain.on('maximize', (evt, arg) => {
        mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    });
    ipcMain.on('close', (evt, arg) => {
        mainWindow.close();
    });
    ipcMain.on('opendevtools', (evt, arg) => {
        mainWindow.webContents.openDevTools();
    });
    ipcMain.on('settitle', (evt, arg) => {
        mainWindow.setTitle(arg);
        evt.sender.send('settitledom', arg);
    });

    ipcMain.on('opendirectory', (evt, arg) => {
        dialog.showOpenDialog(mainWindow, {
            title: 'open editron project',
            properties: ['openDirectory']
        }, (res) => {
            if(res == null || Array.isArray(res) !== true || res.length === 0){
                evt.sender.send('localserverrunning', false);
            }else{
                if(server != null){
                    server.close();
                }
                connectApp.use(serveStatic(res[0]));
                server = http.createServer(connectApp);
                server.listen(LOCAL_PORT);
                evt.sender.send('localserverrunning', {pwd: res[0], port: LOCAL_PORT});
            }
        });
    });
    ipcMain.on('localserverclose', (evt, arg) => {
        if(server != null){
            server.close();
            console.log('local server closed');
        }
    });

    if(IS_DEVELOPMENT === true){
        connectClient = connect.client.create(mainWindow);
        mainWindow.webContents.openDevTools();
    }
}

