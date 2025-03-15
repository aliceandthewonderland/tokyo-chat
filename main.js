const { app, BrowserWindow } = require('electron');
const path = require('path');

// Keep a global reference of the window object to prevent it from being garbage collected
let mainWindow;

function createWindow() {
  // Get the screen dimensions
  const { width: screenWidth } = require('electron').screen.getPrimaryDisplay().workAreaSize;

  // Create the browser window with DOS-like dimensions
  mainWindow = new BrowserWindow({
    width: 700,
    height: 600,
    x: screenWidth - 700,
    y: 0,
    resizable: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'tokyo_chat.jpg'),
    backgroundColor: '#000',
    autoHideMenuBar: true
  });

  // Load the index.html of the app
  mainWindow.loadFile('index.html');

  // Open the DevTools in development
  // mainWindow.webContents.openDevTools();

  // Emitted when the window is closed
  mainWindow.on('closed', function () {
    // Dereference the window object
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window when the dock icon is clicked
    if (mainWindow === null) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
}); 