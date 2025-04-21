const net = require('net');
const port = 8081;
const host = '192.168.0.169';

const fs = require('fs'); 
const QRC = require('qrcode');

// const app = express();
// app.set("view engine", "ejs");

// const http = require('http');

// const server = http.createServer(app);

const { Client, Location, List, Buttons, LocalAuth, MessageMedia  } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
var pQR;
const client = new Client();
var chatList;
client.on('qr', qr => {
    console.log('QR received Before=>'+qr);
    //doQrFunc(qr);
    qrcode.generate(qr, {small: true});
    console.log('QR received After=>'+pQR);
});

async function doQrFunc(qr)
{
    const qrCodeDataUrl = await QRC.toDataURL(qr);
    const qrCodeBuffer = Buffer.from(qrCodeDataUrl.split(',')[1], 'base64');
    pQR = qrCodeBuffer;
    fs.writeFileSync('qrcode.png', qrCodeBuffer);        
    console.log("QR Inside=>"+qrCodeBuffer);
}

client.on('ready', () => {
    console.log('READY');
    let chats = client.getChats();
    chats.then(function(result){
        chatList = result;
        for(i=0;i<result.length;i++)
        {
            element = result[i];
            console.log(element.name+","+element.isGroup);
            console.log(element.name+","+element.isGroup);
        }
    })
});

function sendApiMessage(grpName,msgText,msgMedia)
{
    for(i=0;i<chatList.length;i++)
    {
        element = chatList[i];
        console.log(element.name+","+element.isGroup);
        if (element.name.indexOf(grpName)>-1)
        {
            //element.sendMessage('Checking');
            //element.sendMessage(client.MessageMedia.fromFilePath("d:\\logo.png"));
            const media = MessageMedia.fromFilePath(msgMedia);
            element.sendMessage(media,{caption: msgText});
            console.log("message sent");
        }
    }
}

function getChatList()
{
    var returnStr="";
    for(i=0;i<chatList.length;i++)
    {
        element = chatList[i];
        returnStr = returnStr+element.name+","+element.isGroup+"|";
    }
    return returnStr;
}


// app.get('/', (req, res) => {
//     res.render("index");
// });

// app.get("/scan", (req, res) => {
//     res.render("scan", { pQR });        
// });
  
client.initialize();

// server.listen(3000, () => {
//     console.log('listening on *:3000');
// });
  
const server = net.createServer();
server.listen(port, host, () => {
    console.log('TCP Server is running on port ' + port +'.');
});

let sockets = [];

server.on('connection', function(sock) {
    console.log('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);
    sockets.push(sock);

    sock.on('data', function(data) {
        const myArray = data.toString().split(":");
        let waCmd = myArray[0];
        if (waCmd=="SendMessage")
        {
            try
            {
                let rightStr = myArray[1];
                const myArray1 = rightStr.toString().split("~");
                let gName = myArray1[0];
                let mText = myArray1[1];
                let mMeida = myArray1[2];
                console.log('Group Name ' + sock.remoteAddress + ': ' + gName);
                console.log('Message ' + sock.remoteAddress + ': ' + mText);
                console.log('Media ' + sock.remoteAddress + ': ' + mMeida);
                sendApiMessage(gName,mText,mMeida);
                // Write the data back to all the connected, the client will receive it as data from the server
                sockets.forEach(function(sock, index, array) {
                sock.write(sock.remoteAddress + ':' + sock.remotePort + " message send " + mText + '\n');
            });
            }
            catch (error)
            {

            }
        }
        else if (waCmd=="GetChatList")
        {
            let rightStr = getChatList();
            console.log('Chat List=> ' + sock.remoteAddress + ': ' + rightStr);
            // Write the data back to all the connected, the client will receive it as data from the server
            sockets.forEach(function(sock, index, array) {
                sock.write('<ChatList>' + rightStr + '</ChatList>');
            });
        }

    });

    // Add a 'close' event handler to this instance of socket
    sock.on('close', function(data) {
        let index = sockets.findIndex(function(o) {
            return o.remoteAddress === sock.remoteAddress && o.remotePort === sock.remotePort;
        })
        if (index !== -1) sockets.splice(index, 1);
        console.log('CLOSED: ' + sock.remoteAddress + ' ' + sock.remotePort);
    });

    sock.on('error', function(data) {
        console.log('Socket CLOSED');
        
    });
});