const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const axios = require('axios');
const https = require('https');

/* 
    something is wrong lol
    9-15 lines are here to supress warnings and advises on terminal about 
    net\socket\ssl_client_socket_impl.cc:963] handshake failed; returned -1, SSL error code 1, net_error -100,
    which i couldnt find anything useful about it at all. it is basically a chromium issue after it forces secure conections.
*/

const agent = new https.Agent({ rejectUnauthorized: false });

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';

app.commandLine.appendSwitch('log-level', '3');
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-running-insecure-content');

require('./index.js'); 

let mainWindow;
let preMiniplayerBounds = { width: 1000, height: 700 };

async function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1080,
        height: 700,
        minWidth: 500,
        minHeight: 500,
        maxWidth: 1600,
        title: 'Hispot',
        icon: "public/icon.png",
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        frame: false,
    });

    setTimeout(async () => {
        try {
            const res = await axios.get('http://127.0.0.1:8888/auth-check', { httpsAgent: agent });
            
            if (res.data.loggedIn) {
                mainWindow.loadURL('http://127.0.0.1:8888/');
            } else {
                setTimeout(async () => {
                    const recheck = await axios.get('http://127.0.0.1:8888/auth-check', { httpsAgent: agent });
                    if (recheck.data.loggedIn) {
                        mainWindow.loadURL('http://127.0.0.1:8888/');
                    } else {
                        mainWindow.loadURL('http://127.0.0.1:8888/login');
                    }
                }, 1000);
            }
        } catch (e) {
            mainWindow.loadURL('http://127.0.0.1:8888/login');
        }
    }, 500);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    // Removido listener de resize para permitir controle manual exclusivo do Pin.
}

ipcMain.on('toggle-pin', (event, shouldPin) => {
    if (!mainWindow) return;

    mainWindow.setAlwaysOnTop(shouldPin, "floating");

    if (shouldPin) {
        preMiniplayerBounds = mainWindow.getBounds();
        mainWindow.setSize(340, 200, true);
        mainWindow.setMinimizable(false);
        mainWindow.webContents.executeJavaScript("document.querySelector('.spotify-container').classList.add('mini')");
    } else {
        mainWindow.setSize(preMiniplayerBounds.width, preMiniplayerBounds.height, true);
        mainWindow.setMinimizable(true);
        mainWindow.webContents.executeJavaScript("document.querySelector('.spotify-container').classList.remove('mini')");
    }
});

app.whenReady().then(() => {
    createMainWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createMainWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});