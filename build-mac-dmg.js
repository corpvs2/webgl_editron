
const builder = require('electron-builder');
const fs = require('fs');
const packageJson = fs.readFileSync('./package.json', 'utf8');
const parsedPackageJson = JSON.parse(packageJson);

let appName = parsedPackageJson.name;
parsedPackageJson.main = './server/main.js';

fs.writeFileSync('./app/package.json', JSON.stringify(parsedPackageJson, null, '  '));

builder.build({
    platform: 'mac',
    config: {
        appId: `com.example.${appName}`,
        mac: {
            target: 'dmg',
            icon: './dist/icon.png',
        },
        directories: {
            app: './app',
        },
    },
});
