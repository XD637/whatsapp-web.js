const net = require('net');
const WebSocket = require('ws');
const host = '0.0.0.0';
const path = require('path');
const fs = require('fs');
const QRC = require('qrcode');
const express = require("express");
const app = express();
app.set("view engine", "ejs");

const http = require('http');
const serverHTTP = http.createServer(app);
const connectedClients = new Set(); 
const localhost = 'localhost';
const httpport = 4444;
const tcpport = 5555;
const wsServerPort = 6666;
const wsBroadcastserver = 7777;

const wsServer = http.createServer();

const wss = new WebSocket.Server({ server: wsServer });

const wsServer1 = http.createServer();

const wss1 = new WebSocket.Server({ server: wsServer1 });

const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './sessions'
    })
});

let chatList = [];
let pQR;
let cachedMedia;  // Cached video media for instant response
const videoPath = path.join(__dirname, 'video', 'secureshutter.mp4'); // Path to the video file

// Preload the video when the server starts
function preloadVideo() {
    if (fs.existsSync(videoPath)) {
        cachedMedia = MessageMedia.fromFilePath(videoPath);
        console.log('Video preloaded successfully');
    } else {
        console.error(`Video file not found at path: ${videoPath}`);
    }
}

// Event listeners
client.on('qr', qr => {
    console.log('QR received Before=>' + qr);
    qrcode.toDataURL(qr, { errorCorrectionLevel: 'H' }, function (err, url) {
        if (err) {
            console.error('Error generating QR code:', err);
            return;
        }
        console.log('QR received After=>' + url);
        pQR = url;
    });
});

function isGroup(chat){
  if(chat.id.server === 'g.us'){
    return true;
  }else{
    return false;
  }
}
client.on('ready', async () => {
    console.log('WhatsApp client is ready');
    try {
        chatList = await client.getChats();
        // console.log(JSON.stringify(chatList, null, 2));

        console.log('Initial chat list loaded:');
        chatList.forEach(chat => {
            const chatName = chat.name || 'Unnamed Chat';
            const isGroupChat = isGroup(chat);
            console.log(`${chatName}, ${isGroupChat}`);
        });
    } catch (error) {
        console.error('Error fetching chat list:', error);
    }
});

// Respond to the "Secure" keyword with a video
client.on('message', async (message) => {
    try {
        const keyword = "Secure"; // Define the keyword
        
        // Check if the incoming message matches the keyword
        if (message.body.toLowerCase().trim() === keyword.toLowerCase()) {
            console.log(`Keyword "${keyword}" received from ${message.from}`);

            // Send the preloaded video immediately
            if (cachedMedia) {
                await message.reply('Thanks for Your Enquiry. Kindly find Secure-Shutter Explainer Video:');
                await client.sendMessage(message.from, cachedMedia);
                console.log('Video sent successfully');
            } else {
                console.error('Video is not preloaded yet.');
                await message.reply('Sorry, the video is currently unavailable.');
            }
        }
        let senderName = ''; // Placeholder for name
        const date = new Date(message.timestamp * 1000); // Convert from seconds to milliseconds

        // Convert to Indian Standard Time (IST)
        const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', 
                  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };

        const formatter = new Intl.DateTimeFormat('en-GB', options);
        const parts = formatter.formatToParts(date);

        // Reformat the date to 'YYYY-MM-DD HH:MM:SS'
        const formattedTimestamp = `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value} ${parts.find(p => p.type === 'hour').value}:${parts.find(p => p.type === 'minute').value}:${parts.find(p => p.type === 'second').value}`;

        // Check if the message is from a group or an individual
        // if (message.isGroupMsg) {
            // Fetch group details to get the group name
            const chat = await message.getChat();
            senderName = chat.name || chat.pushname || "Unknown Chat" ; // Group name
        // } else {
        //     // Fetch contact details to get the saved name
        //     const contact = await message.getContact();
        //     console.log(`${contact.pushname}   ${contact.verifiedName}  ${contact.number}`)
        //     senderName = contact.pushname || contact.verifiedName || contact.number; // Saved name or fallback to number
        // }
         const forwardedMessage = {
            from: senderName,
            body: message.body,
            timestamp: formattedTimestamp
        };
        await broadcastMessageToClients(forwardedMessage); // Forward to WebSocket clients
    } catch (error) {
        console.error('Error handling message:', error);
    }
});



async function sendMessageToNumber(number, message, mediaPath) {
    try {
      const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
  
      if (typeof message !== 'string') {
        console.error("Caption must be a string:", message);
        return 'Caption must be a string';
      }
  
      const chat = await client.getChatById(chatId);
      if (!chat) {
        console.error(`Chat not found for: ${chatId}`);
        return 'Chat not found';
      }
  
      console.log(`Sending to ${chatId}`);
      console.log('Chat Info:', chat.name, chat.id._serialized);
      console.log("Client ready?", client.info);
  
      if (!client.info || !client.info.me) {
        console.error('WhatsApp client not ready');
        return 'WhatsApp client not ready';
      }
  
      if (mediaPath) {
        try {
          if (!fs.existsSync(mediaPath)) {
            console.error('Media file not found or inaccessible:', mediaPath);
            return 'Media file not found or inaccessible';
          }
      
          const fileBuffer = fs.readFileSync(mediaPath);
          const base64File = fileBuffer.toString('base64');
          const mimeType = getMimeType(mediaPath);
          const filename = path.basename(mediaPath);
          const media = new MessageMedia(mimeType, base64File, filename);
      
          console.log("Media constructed:", {
            filename,
            mimeType,
            sizeKB: (base64File.length / 1024).toFixed(2)
          });
      
          await chat.sendMessage(media,{ sendMediaAsDocument: true });
          await chat.sendMessage(message);
          console.log('Message sent with media:', message);
      
        } catch (err) {
          console.error('Error handling media file:', err);
          return 'Failed to handle media file';
        }
      }
      
  
      console.log(`Message sent to ${number}`);
      return `Message sent successfully to ${number}`;
  
    } catch (error) {
      console.error('Error sending message to number:', error);
      return 'Error sending message to number: ' + error.message;
    }
  }

// Simple mime resolver
function getMimeType(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    switch (ext) {
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        case 'pdf': return 'application/pdf';
        case 'mp4': return 'video/mp4';
        case 'mp3': return 'audio/mpeg';
        case 'webp': return 'image/webp';
        default: return 'application/octet-stream'; // fallback
    }
}




async function sendApiMessage(grpName, msgText, msgMedia) {
    try {
        if (!chatList) {
            console.error('Chat list is not initialized');
            return 'Chat list is not initialized';
        }

        for (let i = 0; i < chatList.length; i++) {
            const element = chatList[i];
            if (element.name && element.name.indexOf(grpName) > -1) {
                // Check if the media file exists
                if (!fs.existsSync(msgMedia)) {
                    console.error(`Media file does not exist at path: ${msgMedia}`);
                    return 'Media file does not exist';
                }

                // Create MessageMedia from the file
                const fileBuffer = fs.readFileSync(msgMedia);
                const base64File = fileBuffer.toString('base64');
                const mimeType = getMimeType(msgMedia);
                const filename = path.basename(msgMedia);
                const media = new MessageMedia(mimeType, base64File, filename);

                // Send the message with media and caption (message text)
                await element.sendMessage(media, { sendMediaAsDocument: true });
                await element.sendMessage(msgText);
                console.log(`Message sent to group ${grpName}: ${msgText}`);
                return `Message sent successfully`;
            }
        }
        console.log('Group not found, updating chat list and retrying...');
        chatList = await updateChatList();
        await sendApiMessage(grpName, msgText, msgMedia);
        return `Group ${grpName} not found after updating chat list`;
    } catch (error) {
        console.error(`Error sending message to group ${grpName}:`, error);
        return `Error sending message to group ${grpName}: ${error.message}`;
    }
}

function getChatList() {
    let returnStr = "";
    chatList.forEach(chat  => {
        const chatName = chat.name;
        const isGroupChat = isGroup(chat); 
        returnStr += chatName + ',' + isGroupChat + '|';
    });
    return returnStr;
}

app.get('/', (req, res) => {
    res.render("index");
});


app.get("/scan", (req, res) => {
    res.render("scan", { pQR });
});

app.get('/test-send', async (req, res) => {
    const testNumber = '919344268155'; // Just the number, without '@c.us'
    const testMessage = 'Hey there! This is a test message from the bot.';
    const testMediaPath = path.join(__dirname, 'video', 'secureshutterCompressed.mp4');

    try {
        const result = await sendMessageToNumber(testNumber, testMessage, testMediaPath);
        res.send(result);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error sending message');
    }
});


app.get("/update", async (req, res) => {
    try {
        const updatedChats = await client.getChats();
        chatList = updatedChats;
        console.log('Updated chat list:');
        chatList.forEach(async (chat) => {
            const chatName = chat.name || 'Unnamed Chat';
            const isGroupChat = await isGroup(chat); 
            console.log(chatName + ',' + isGroupChat);
        });
        res.send('Chat list updated successfully');
    } catch (error) {
        console.error('Error updating chat list:', error);
        res.status(500).send('Failed to update chat list');
    }
});


// Function to update the chat list
async function updateChatList() {
    try {
        const updatedChats = await client.getChats();
        const chatList = updatedChats.map(chat => ({
            name: chat.name || 'Unnamed Chat',
            ...chat // Include other properties if needed
        }));

        console.log('Updated chat list:');
        chatList.forEach(chat => {
            const isGroupChat = isGroup(chat); 
            console.log(chatName + ',' + isGroupChat);
        });

        return chatList; // Return the updated chat list
    } catch (error) {
        console.error('Error updating chat list:', error);
        throw new Error('Failed to update chat list');
    }
}

app.use(express.json());
app.post('/ai/sendmessage', async (req, res) => {
    try {
        if (!req.body.hasOwnProperty('aiinference')) {
            return res.json({ code: false, message: "AI inference id missing.", error: null });
        }
        try {
            const imagePath = path.join(__dirname, 'aiimage.jpg');
            await sendApiMessage('testing', `ERROR OCCURED AT AI INFERENCE - ${req.body.aiinference}`, imagePath);
            return res.json({ code: true, message: "Message sent Successfully", value: 'success' });
        } catch (er) {
            console.log(er);
            return res.json({ code: false, message: 'Error sending the message', error: er });
        }
    } catch (er) {
        console.log(er);
        return res.json({ code: false, message: 'Error sending the message', error: er });
    }
});

serverHTTP.listen(httpport, () => {
    console.log(`HTTP server listening on http://${localhost}:${httpport}`);
});

wsServer.listen(wsServerPort, () => {
    console.log(`WebSocket server is running on port ${wsServerPort}`);
});

client.initialize();
preloadVideo();  // Preload video on server start

const server = net.createServer();
server.listen(tcpport, host, () => {
    console.log('TCP Server is running on port ' + tcpport + '.');
});

let sockets = [];
server.on('connection', function (sock) {
    console.log('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort);
    sockets.push(sock);

    sock.on('data', async function (data) {
        const myArray = data.toString().split(":");
        let waCmd = myArray[0];
        console.log('Received command from the client=> ' + data.toString());
        if (waCmd === "SendMessage") {
            try {
                let rightStr = myArray[1];
                const myArray1 = rightStr.toString().split("~");
                let recipient = myArray1[0];
                let message = myArray1[1];
                let media = myArray1[2];

                console.log('Recipient: ' + recipient);
                console.log('Message: ' + message);
                console.log('Media: ' + media);
                var result;
                if (await isValidPhoneNumber(recipient)) {
                    result = await sendMessageToNumber(recipient, message, media);
                } else {
                    result = await sendApiMessage(recipient, message, media);
                }
                sockets.forEach(function (sock) {
                    sock.write(result);
                });
            } catch (error) {
                console.error(error);
            }
        } else if (waCmd === "GetChatList") {
            let chatListStr = getChatList();
            console.log('Chat List => ' + sock.remoteAddress + ': ' + chatListStr);
            sockets.forEach(function (sock) {
                sock.write('<ChatList>' + chatListStr + '</ChatList>');
            });
        }
    });

    sock.on('close', function (data) {
        let index = sockets.findIndex(function (o) {
            return o.remoteAddress === sock.remoteAddress && o.remotePort === sock.remotePort;
        });
        if (index !== -1) sockets.splice(index, 1);
        console.log('CLOSED: ' + sock.remoteAddress + ' ' + sock.remotePort);
    });

    sock.on('error', function (data) {
        console.log('Socket CLOSED');
    });
});

wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    ws.on('message', (message) => {
        const messageStr = message.toString();
        console.log('Received WebSocket message:', messageStr);

        const data = messageStr.split(":");
        const waCmd = data[0];

        if (waCmd === "SendMessage") {
            const [recipient, msgText, msgMedia] = data[1].split("~");
            console.log('Recipient:', recipient, 'Message:', msgText, 'Media:', msgMedia);
            var result;
            (async () => {
                try {
                    if (await isValidPhoneNumber(recipient)) {
                        result = await sendMessageToNumber(recipient, msgText, msgMedia);
                    } else {
                        result = await sendApiMessage(recipient, msgText, msgMedia);
                    }
                    ws.send(result);
                } catch (error) {
                    console.error('Error sending message:', error);
                    ws.send('Error sending message: ' + error.message);
                }
            })();
        } else if (waCmd === "GetChatList") {
            const chatListStr = getChatList();
            console.log('Sending chat list to WebSocket client:', chatListStr);
            ws.send('<ChatList>' + chatListStr + '</ChatList>');
        }
    });

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

async function isValidPhoneNumber(input) {
    if (!isNaN(input)) {
        return true;
    } else {
        let phoneRegex = /^[6-9]\d{9}$/; // Example for Indian phone numbers
        return phoneRegex.test(input.trim());
    }
}

// Broadcast function to send messages to all connected WebSocket clients
async function broadcastMessageToClients(message) {
    const formattedMessage = JSON.stringify({ type: "NEW_MESSAGE", data: message });

    connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(formattedMessage);
        }
    });
}

// Handle new WebSocket connections
wss1.on('connection', (ws) => {
    console.log("New WebSocket client connected");
    connectedClients.add(ws);

    // Remove client on disconnection
    ws.on('close', () => {
        console.log("WebSocket client disconnected");
        connectedClients.delete(ws);
    });

    // Optional: Handle incoming WebSocket messages
    ws.on('message', (message) => {
        console.log("Message received from WebSocket client:", message);
    });
});

wsServer1.listen(wsBroadcastserver, () => {
    console.log(`Broadcast server is running on port ${wsBroadcastserver}`);
});