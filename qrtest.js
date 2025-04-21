const net = require('net');
const port = 8081;
const host = '192.168.0.169';

const fs = require('fs');
const QRC = require('qrcode'); // For generating QR images
const express = require('express');
const app = express();
const path = require('path');  // For serving static files

const { Client, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

var pQR;
var chatList; // For storing the list of chats

// Serve the 'qrcode.png' file as a static file using Express
app.use(express.static(path.join(__dirname, 'public')));

// Serve the root page
app.get('/', (req, res) => {
    res.send('<h1>Welcome! <a href="/qrcode">Click here to see the QR code</a></h1>');
});

// Set up a route to show the QR code in the browser
app.get('/qrcode', (req, res) => {
    res.sendFile(path.join(__dirname, 'qrcode.png'));
});

// Init WhatsApp client
const client = new Client();

client.on('qr', async qr => {
    console.log('QR received Before => ' + qr);
    qrcode.generate(qr, { small: true }); // shows terminal QR
    await doQrFunc(qr); // optional: save QR to png
    console.log('QR received After => ' + (pQR ? 'QR buffer ready' : 'QR missing'));
});

// This function saves the QR image to file
async function doQrFunc(qr) {
    const qrCodeDataUrl = await QRC.toDataURL(qr);
    const qrCodeBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');
    pQR = qrCodeBuffer;
    fs.writeFileSync('qrcode.png', qrCodeBuffer);
    console.log("QR Inside => Buffer saved");
}

// Once WhatsApp is ready
client.on('ready', () => {
    console.log('WhatsApp READY');
    let chats = client.getChats();
    chats.then(function (result) {
        chatList = result;
        for (let i = 0; i < result.length; i++) {
            let element = result[i];
            console.log(element.name + "," + element.isGroup);
        }
    });
});

// Send media+caption to a group by name
function sendApiMessage(grpName, msgText, msgMedia) {
    for (let i = 0; i < chatList.length; i++) {
        let element = chatList[i];
        console.log(element.name + "," + element.isGroup);
        if (element.name && element.name.indexOf(grpName) > -1) {
            const media = MessageMedia.fromFilePath(msgMedia);
            element.sendMessage(media, { caption: msgText });
            console.log("message sent to", element.name);
        }
    }
}

// Fetch all chats as string for TCP clients
function getChatList() {
    var returnStr = "";
    for (let i = 0; i < chatList.length; i++) {
        let element = chatList[i];
        returnStr = returnStr + element.name + "," + element.isGroup + "|";
    }
    return returnStr;
}

// Start the WhatsApp client
client.initialize();

// Start TCP server
const server = net.createServer();
server.listen(port, host, () => {
    console.log('TCP Server is running on ' + host + ':' + port);
});

let sockets = [];

server.on('connection', function (sock) {
    console.log('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);
    sockets.push(sock);

    // When receiving data over socket
    sock.on('data', function (data) {
        const myArray = data.toString().split(":");
        let waCmd = myArray[0];

        if (waCmd == "SendMessage") {
            try {
                let rightStr = myArray[1];
                const myArray1 = rightStr.toString().split("~");
                let gName = myArray1[0];
                let mText = myArray1[1];
                let mMedia = myArray1[2];
                console.log('Group Name: ' + gName);
                console.log('Message: ' + mText);
                console.log('Media: ' + mMedia);
                sendApiMessage(gName, mText, mMedia);

                // Response to all sockets
                sockets.forEach(function (sock) {
                    sock.write(sock.remoteAddress + ':' + sock.remotePort + " message sent " + mText + '\n');
                });
            } catch (error) {
                console.error("Error processing SendMessage:", error);
            }
        }
        else if (waCmd == "GetChatList") {
            let rightStr = getChatList();
            console.log('Chat List => ' + rightStr);
            sockets.forEach(function (sock) {
                sock.write('<ChatList>' + rightStr + '</ChatList>');
            });
        }
    });

    // Socket closed
    sock.on('close', function () {
        let index = sockets.findIndex(function (o) {
            return o.remoteAddress === sock.remoteAddress && o.remotePort === sock.remotePort;
        });
        if (index !== -1) sockets.splice(index, 1);
        console.log('CLOSED: ' + sock.remoteAddress + ' ' + sock.remotePort);
    });

    // Socket error
    sock.on('error', function (err) {
        console.log('Socket ERROR:', err.message);
    });
});

// Start Express server to serve the QR code and other assets
app.listen(3000, () => {
    console.log('Express server is running on http://localhost:3000');
});
