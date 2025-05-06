const net = require('net');
const WebSocket = require('ws');
const host = '0.0.0.0';
const path = require('path');
const fs = require('fs');
require('dotenv').config();
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const morgan = require('morgan');

const QRC = require('qrcode');
const express = require("express");
const app = express();
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(morgan('dev'));

const http = require('http');
const serverHTTP = http.createServer(app);
const connectedClients = new Set(); 
const localhost = '192.168.0.169';
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
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        ignoreHTTPSErrors: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-extensions",
            '--disable-gpu', 
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            '--disable-dev-shm-usage'
        ],
    }
});

let chatList = [];
let pQR;
let cachedMedia;  // Cached video media for instant response
const videoPath = path.join(__dirname, 'video', 'secureshutter.mp4'); // Path to the video file
let videoMedia; // Variable to hold the video media object

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
        if (message.fromMe) return; // ignore self messages

        // --- Secure keyword logic ---
        const keyword = "Secure";
        if (message.body.toLowerCase().trim() === keyword.toLowerCase()) {
            console.log(`Keyword "${keyword}" received from ${message.from}`);
            if (cachedMedia) {
                await message.reply('Thanks for Your Enquiry. Kindly find Secure-Shutter Explainer Video:');
                await client.sendMessage(message.from, cachedMedia);
                console.log('Video sent successfully');
            } else {
                console.error('Video is not preloaded yet.');
                await message.reply('Sorry, the video is currently unavailable.');
            }
        }

        // --- Group message WebSocket broadcast ---
        const chat = await message.getChat();
        if (!chat.isGroup) return; // Only handle group messages

        const contact = await message.getContact();
        const senderName = contact.pushname || contact.verifiedName || contact.number;

        // Format timestamp as "YYYY-MM-DD HH:mm:ss"
        const date = new Date(message.timestamp * 1000);
        const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', 
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
        const formatter = new Intl.DateTimeFormat('en-GB', options);
        const parts = formatter.formatToParts(date);
        const formattedTimestamp = `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value} ${parts.find(p => p.type === 'hour').value}:${parts.find(p => p.type === 'minute').value}:${parts.find(p => p.type === 'second').value}`;

        // Mentions
        const mentions = message.mentionedIds && message.mentionedIds.length > 0 ? message.mentionedIds : undefined;

        // Reply info
        let replyTo = undefined;
        if (message.hasQuotedMsg) {
            const quotedMsg = await message.getQuotedMessage();
            replyTo = {
                from: quotedMsg.author || quotedMsg.from,
                messageId: quotedMsg.id._serialized
            };
        }

        // Build payload in your requested format
        const groupMessagePayload = {
            type: "NEW_MESSAGE",
            data: {
                from: senderName,
                group: chat.name,
                body: message.body,
                timestamp: formattedTimestamp,
                ...(mentions && { mentions }),
                ...(replyTo && { replyTo })
            }
        };

        broadcastMessageToClients(groupMessagePayload);

    } catch (error) {
        console.error('Error handling message:', error);
    }
});

// client.on('message', async (message) => {
//     try {
//         if (message.hasQuotedMsg) {
//             const quotedMsg = await message.getQuotedMessage();
//             const sender = quotedMsg.from; // The original sender of the quoted message
//             const reply = message.body;

//             // Forward the reply to the original sender
//             await client.sendMessage(sender, `Reply to your message: ${reply}`);
//             console.log('Reply forwarded to the original sender');
//         }
//     } catch (error) {
//         console.error('Error handling reply:', error);
//     }
// }); 

async function sendMessageToNumber(number, message, mediaPath) {
    try {
      const chatId = number.includes('@c.us') ? number : `${number}@c.us`; 
  
    //   if (typeof message !== 'string') {
    //     console.error("Caption must be a string:", message);
    //     return 'Caption must be a string';
    //   }
  
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
  
      if (fs.existsSync(mediaPath)) {
        videoMedia = MessageMedia.fromFilePath(mediaPath);
        console.log('Video preloaded successfully');
        if (videoMedia) {
          console.log('Sending message with media:', message);
          await chat.sendMessage(videoMedia, { caption: message, sendMediaAsDocument: false });

          console.log('Message sent with media:', message);
        } else {
            console.error(`Video file not found at path: ${videoPath}`);
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



async function sendApiMessage(grpName, msgText, msgMedia, attempt = 1) {
    try {
        if (!chatList) {
            console.error('Chat list is not initialized');
            return 'Chat list is not initialized';
        }

        for (let i = 0; i < chatList.length; i++) {
            const element = chatList[i];

            if (element.isGroup && element.name && element.name.includes(grpName)) {
                const chat = await client.getChatById(element.id._serialized);

                if (!chat || typeof chat.sendMessage !== 'function') {
                    console.warn(`Invalid chat object for group ${grpName}`);
                    continue;
                }

                if (!fs.existsSync(msgMedia)) {
                    console.error(`Media file does not exist at path: ${msgMedia}`);
                    return 'Media file does not exist';
                }

                try {
                    const fileBuffer = fs.readFileSync(msgMedia);
                    const base64File = fileBuffer.toString('base64');
                    const mimeType = getMimeType(msgMedia);
                    const filename = path.basename(msgMedia);
                    const media = new MessageMedia(mimeType, base64File, filename);

                    await chat.sendMessage(media, {
                        caption: msgText,
                        sendMediaAsDocument: false
                    });

                    console.log(`Message sent to group "${grpName}": ${msgText}`);
                    return 'Message sent successfully';
                } catch (sendErr) {
                    console.error(`Failed to send message to "${grpName}":`, sendErr);
                    return `Error sending message: ${sendErr.message}`;
                }
            }
        }

        // If we reached here, group wasn't found
        if (attempt < 2) {
            console.log('Group not found. Updating chat list and retrying...');
            chatList = await updateChatList();
            return await sendApiMessage(grpName, msgText, msgMedia, attempt + 1);
        } else {
            return `Group "${grpName}" not found after retry`;
        }

    } catch (error) {
        console.error(`Fatal error in sendApiMessage:`, error);
        return `Error: ${error.message}`;
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

// Example: 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, slow down' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  });

// function verifyApiKey(req, res, next) {
//     const apiKey = req.headers['x-api-key'];
//     const authHeader = req.headers['authorization'];
//     const bearerToken = authHeader && authHeader.startsWith('Bearer ')
//       ? authHeader.split(' ')[1]
//       : null;
  
//     const validKey = process.env.API_SECRET_KEY;
  
//     if (!apiKey && !bearerToken) {
//       return res.status(401).json({ error: 'No API key or Bearer token provided' });
//     }
  
//     if (apiKey && apiKey === validKey) {
//       return next(); // API key is valid
//     }
  
//     if (bearerToken && bearerToken === validKey) {
//       return next(); // Bearer token is valid
//     }
  
//     return res.status(403).json({ error: 'Invalid API key or Bearer token' });
//   }
  
  

app.get('/', apiLimiter, (req, res) => {
    res.render("index");
});


app.get("/scan", apiLimiter, (req, res) => {
    res.render("scan", { pQR });
});

app.get('/test-send', apiLimiter, async (req, res) => {
    const testNumber = '919344268155'; // Just the number, without '@c.us'
    const testMessage = 'Test Video Caption'; // Message caption
    testMediaPath = path.join(__dirname, 'video', 'secureshutter.mp4'); // Path to the media file

    try {
        const result = await sendMessageToNumber(testNumber, testMessage, testMediaPath);
        res.send(result);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error sending message');
    }
});

app.post('/api/send-message', async (req, res) => {
    const { groupName, messageText, mediaPath } = req.body;

    if (!groupName || !messageText) {
        return res.status(400).json({ error: 'groupName and messageText are required' });
    }

    const result = await sendApiMessage(groupName, messageText, mediaPath);
    res.json({ result });
});


app.get('/test-group-send', apiLimiter, async (req, res) => {
    const testGroupName = 'SVMWA TEST'; // Replace with a partial or full match of your group name
    const testCaption = 'Test Caption';
    const testMediaPath = path.join(__dirname, 'image', 'aiimage.jpg'); // Path to the media file

    try {
        const result = await sendApiMessage(testGroupName, testCaption, testMediaPath);
        res.send(result);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error sending group message');
    }
});



app.get("/update", apiLimiter,  async (req, res) => {
    try {
        const updatedChats = await client.getChats();
        chatList = updatedChats;
        console.log('Updated chat list:');
        chatList.forEach(async (chat) => {
            const chatName = chat.name || 'Unnamed Chat';
            const isGroupChat = isGroup(chat); 
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
app.post('/ai/sendmessage', apiLimiter, async (req, res) => {
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

// Create a new group
/*{
  "groupName": "Test Group 2",
  "participants": ["919344268155@c.us", "919976850245@c.us"]
}*/
app.post('/api/create-group', async (req, res) => {
    const { groupName, participants } = req.body;

    if (!groupName || !participants || !Array.isArray(participants)) {
        return res.status(400).json({ error: 'groupName and participants (array) are required' });
    }

    try {
        const group = await createGroup(groupName, participants);
        if (!group) {
            throw new Error('Group creation failed');
        }
        res.json({ success: true, group });
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ success: false, error: error.message || 'Failed to create group' });
    }
});

// Add members to an existing group
/*{
  "groupName": "Test Group 2",
  "members": ["919976850245@c.us"]
}*/
app.post('/api/add-members', async (req, res) => {
    let { groupId, groupName, members } = req.body;

    if ((!groupId && !groupName) || !members || !Array.isArray(members)) {
        return res.status(400).json({ error: 'groupId or groupName and members (array) are required' });
    }

    // If groupName is provided, find the groupId
    if (!groupId && groupName) {
        groupId = await getGroupIdByName(groupName);
        console.log(`Resolved groupId: ${groupId}`);
        if (!groupId) {
            return res.status(404).json({ error: `Group with name "${groupName}" not found` });
        }
    }
    try {
        await addMembersToGroup(groupId, members);
        res.json({ success: true, message: 'Members processed successfully' });
    } catch (error) {
        console.error('Error adding members:', error);
        res.status(500).json({ error: 'Failed to process members' });
    }
});

// Promote or demote group members to/from admin
/*{
  "groupName": "Test Group 2",
  "members": ["919976850245@c.us"],
  "action": "promote/demote"
}*/
app.post('/api/manage-admins', async (req, res) => {
    let { groupId, groupName, members, action } = req.body;

    if ((!groupId && !groupName) || !members || !Array.isArray(members) || !['promote', 'demote'].includes(action)) {
        return res.status(400).json({ error: 'groupId or groupName, members (array), and action (promote/demote) are required' });
    }

    try {
        // If groupName is provided, resolve groupId
        if (!groupId && groupName) {
            groupId = await getGroupIdByName(groupName);
            console.log(`Resolved groupId: ${groupId}`);
            if (!groupId) {
                return res.status(404).json({ error: `Group with name "${groupName}" not found` });
            }
        }

        if (action === 'promote') {
            await promoteToAdmin(groupId, members);
            res.json({ success: true, message: 'Members promoted to admin successfully' });
        } else if (action === 'demote') {
            await demoteFromAdmin(groupId, members);
            res.json({ success: true, message: 'Members demoted from admin successfully' });
        }
    } catch (error) {
        console.error('Error managing admins:', error);
        res.status(500).json({ error: 'Failed to manage admins' });
    }
});

// Send a message with media and tag members
/*{
  "groupName": "Test Group 2",
  "message": "Hello team, please see the attached file.",
  "mediaPath": "C:/Users/spora/Downloads/whatsapp-web.js/video/secureshutter.mp4",
  "taggedMembers": ["919976850245@c.us"] (optional)
}*/
app.post('/api/send-media-message', async (req, res) => {
    const { groupId, groupName, message, mediaPath, taggedMembers } = req.body;

    if ((!groupId && !groupName) || !message || !mediaPath) {
        return res.status(400).json({ error: 'groupId or groupName, message, and mediaPath are required' });
    }

    // Make taggedMembers optional and always an array
    const safeTaggedMembers = Array.isArray(taggedMembers) ? taggedMembers : [];

    try {
        let resolvedGroupId = groupId;
        if (!resolvedGroupId && groupName) {
            resolvedGroupId = await getGroupIdByName(groupName);
            if (!resolvedGroupId) {
                return res.status(404).json({ error: `Group with name "${groupName}" not found` });
            }
        }
        await sendMessageWithMedia(resolvedGroupId, message, mediaPath, safeTaggedMembers);
        res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error sending message with media:', error);
        res.status(500).json({ error: 'Failed to send message with media' });
    }
});

// Reply to a specific message or tag a user
app.post('/api/reply-message', async (req, res) => {
    const { messageId, replyText } = req.body;

    if (!messageId || !replyText) {
        return res.status(400).json({ error: 'messageId and replyText are required' });
    }

    try {
        const message = await client.getMessageById(messageId);
        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }

        await message.reply(replyText);
        res.json({ success: true, message: 'Reply sent successfully' });
    } catch (error) {
        console.error('Error replying to message:', error);
        res.status(500).json({ error: 'Failed to send reply' });
    }
});

// Function to remove members from a group
async function removeMembersFromGroup(groupId, members) {
    try {
        const group = await client.getChatById(groupId);
        await group.removeParticipants(members); // members is an array of WhatsApp IDs
        console.log('Members removed successfully');
    } catch (error) {
        console.error('Error removing members:', error);
        throw error;
    }
}

// Endpoint to remove members from a group
/*{
  "groupName": "Test Group 2",
  "members": ["919976850245@c.us"]
}*/
app.post('/api/remove-members', async (req, res) => {
    let { groupId, groupName, members } = req.body;

    if ((!groupId && !groupName) || !members || !Array.isArray(members)) {
        return res.status(400).json({ error: 'groupId or groupName and members (array) are required' });
    }

    try {
        // If groupName is provided, resolve groupId
        if (!groupId && groupName) {
            groupId = await getGroupIdByName(groupName);
            console.log(`Resolved groupId: ${groupId}`);
            if (!groupId) {
                return res.status(404).json({ error: `Group with name "${groupName}" not found` });
            }
        }

        await removeMembersFromGroup(groupId, members);
        res.json({ success: true, message: 'Members removed successfully' });
    } catch (error) {
        console.error('Error removing members:', error);
        res.status(500).json({ error: 'Failed to remove members' });
    }
});

// Update group profile picture
/*{
  "groupName": "Test Group 2", // or "groupId": "1203634...@g.us"
  "imagePath": "C:/Users/spora/Downloads/whatsapp-web.js/sporadapfp.jpg" - (give this path always)
}*/
app.post('/api/update-group-picture', async (req, res) => {
    const { groupId, groupName, imagePath } = req.body;

    if ((!groupId && !groupName) || !imagePath) {
        return res.status(400).json({ error: 'groupId or groupName and imagePath are required' });
    }

    try {
        let resolvedGroupId = groupId;
        if (!resolvedGroupId && groupName) {
            resolvedGroupId = await getGroupIdByName(groupName);
            if (!resolvedGroupId) {
                return res.status(404).json({ error: `Group with name "${groupName}" not found` });
            }
        }

        if (!fs.existsSync(imagePath)) {
            return res.status(400).json({ error: 'Image file does not exist at the specified path' });
        }

        const group = await client.getChatById(resolvedGroupId);
        const media = MessageMedia.fromFilePath(imagePath);

        await group.setPicture(media);
        res.json({ success: true, message: 'Group profile picture updated successfully' });
    } catch (error) {
        console.error('Error updating group profile picture:', error);
        res.status(500).json({ error: 'Failed to update group profile picture' });
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
            return o.remoteAddress === sock.remoteAddress && o.remotePort === o.remotePort;
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

async function createGroup(groupName, participants) { 
    try {
        // Ensure all participants are strings ending with @c.us
        const participantIds = participants.map(phoneNumber => 
            phoneNumber.endsWith('@c.us') ? phoneNumber : `${phoneNumber}@c.us`
        );
        // Create the group
        const group = await client.createGroup(groupName, participantIds);
        console.log(`Group created: ${group.name}`);

        // Defensive: Check if group.participants is an array
        let addedIds = [];
        if (Array.isArray(group.participants)) {
            addedIds = group.participants.map(p => p.id._serialized);
        } else if (group.participants && typeof group.participants === 'object') {
            // Sometimes it's an object with participant IDs as keys
            addedIds = Object.keys(group.participants);
        } else {
            console.warn('group.participants is not an array or object:', group.participants);
        }

        const notAdded = participantIds.filter(id => !addedIds.includes(id));

        if (notAdded.length > 0) {
            const inviteCode = await group.getInviteCode();
            const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
            for (const restrictedNumber of notAdded) {
                try {
                    await client.sendMessage(
                        restrictedNumber,
                        `Hi 👋!\n\nYou couldn't be added to the group "${group.name}" due to your privacy settings.\n\nPlease join using this invite link:\n${inviteLink}\n\nIf you have any questions, reply to this message.`
                    );
                    console.log(`Invite link sent to ${restrictedNumber}`);
                } catch (error) {
                    console.error(`Failed to send invite link to ${restrictedNumber}:`, error.message);
                }
            }
        }

        return {
            group,
            added: addedIds.length,
            invited: notAdded.length
        };
    } catch (error) {
        console.error('Error creating group:', error);
        throw error;
    }
}

// Helper: Always get the latest group ID by name
async function getGroupIdByName(groupName) {
    const chats = await client.getChats();
    const group = chats.find(
        chat => chat.isGroup && chat.name && chat.name.toLowerCase() === groupName.toLowerCase()
    );
    return group ? group.id._serialized : null;
}

// Main logic: Add members to group, handle privacy/invite link
async function addMembersToGroup(groupId, members) {
    try {
        const group = await client.getChatById(groupId);
        if (!group) throw new Error('Group not found by ID: ' + groupId);

        // Only add numbers not already in the group
        const existing = group.participants.map(p => p.id._serialized);
        const toAdd = members
            .map(num => num.endsWith('@c.us') ? num : `${num}@c.us`)
            .filter(num => !existing.includes(num));

        if (toAdd.length === 0) {
            console.log('No new members to add.');
            return { added: 0, invited: 0 };
        }

        const result = await group.addParticipants(toAdd);
        console.log('addParticipants result:', result);

        const restrictedNumbers = [];
        for (const [participant, info] of Object.entries(result)) {
            if (info.code !== 200) {
                console.warn(`Could not add member ${participant}: code ${info.code}`);
                restrictedNumbers.push(participant);
            } else {
                console.log(`Member added successfully: ${participant}`);
            }
        }

        if (restrictedNumbers.length > 0) {
            const inviteCode = await group.getInviteCode();
            const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
            for (const restrictedNumber of restrictedNumbers) {
                try {
                    await client.sendMessage(
                        restrictedNumber,
                        `Hi! You couldn't be added to the group "${group.name}" due to your privacy settings.\n\nPlease join using this invite link:\n${inviteLink}`
                    );
                    console.log(`Invite link sent to ${restrictedNumber}`);
                } catch (error) {
                    console.error(`Failed to send invite link to ${restrictedNumber}:`, error.message);
                }
            }
        }

        return { added: toAdd.length - restrictedNumbers.length, invited: restrictedNumbers.length };
    } catch (error) {
        console.error('Error adding members to group:', error);
        throw error;
    }
}

// Endpoint: Add members to an existing group (by groupId or groupName)
app.post('/api/add-members', async (req, res) => {
    let { groupId, groupName, members } = req.body;

    if ((!groupId && !groupName) || !members || !Array.isArray(members)) {
        return res.status(400).json({ error: 'groupId or groupName and members (array) are required' });
    }

    try {
        // If groupName is provided, resolve groupId
        if (!groupId && groupName) {
            groupId = await getGroupIdByName(groupName);
            console.log(`Resolved groupId: ${groupId}`);
            if (!groupId) {
                return res.status(404).json({ error: `Group with name "${groupName}" not found` });
            }
        }
        const result = await addMembersToGroup(groupId, members);
        res.json({ success: true, ...result, message: 'Members processed successfully' });
    } catch (error) {
        console.error('Error adding members:', error);
        res.status(500).json({ error: 'Failed to process members', details: error.message });
    }
});

async function promoteToAdmin(groupId, members) {
    try {
        const group = await client.getChatById(groupId);
        await group.promoteParticipants(members); // members is an array of phone numbers
        console.log('Members promoted to admin successfully');
    } catch (error) {
        console.error('Error promoting members:', error);
        throw error;
    }
}

async function demoteFromAdmin(groupId, members) {
    try {
        const group = await client.getChatById(groupId);
        await group.demoteParticipants(members); // members is an array of phone numbers
        console.log('Members demoted from admin successfully');
    } catch (error) {
        console.error('Error demoting members:', error);
        throw error;
    }
}

// Function to send a message with media and tag members
async function sendMessageWithMedia(groupId, message, mediaPath, taggedMembers = []) {
    try {
        const group = await client.getChatById(groupId);

        // Create media object
        const media = MessageMedia.fromFilePath(mediaPath);

        // Resolve mentions (must be Contact objects)
        const mentions = [];
        if (Array.isArray(taggedMembers) && taggedMembers.length > 0) {
            for (const member of taggedMembers) {
                try {
                    const contact = await client.getContactById(member);
                    mentions.push(contact);
                } catch (err) {
                    console.warn(`Could not resolve contact for ${member}`);
                }
            }
        }

        // Format message with @mentions if any
        const mentionTags = mentions.length > 0 ? '\n\n' + mentions.map(c => `@${c.number}`).join(' ') : '';
        const formattedMessage = `${message}${mentionTags}`;

        // Send message with or without mentions
        await group.sendMessage(media, mentions.length > 0
            ? { caption: formattedMessage, mentions }
            : { caption: formattedMessage }
        );
        console.log('Message sent successfully');
    } catch (error) {
        console.error('Error sending message with media:', error);
        throw error;
    }
}

// Endpoint to send a message with media and tag members
app.post('/api/send-media-message', async (req, res) => {
    const { groupId, groupName, message, mediaPath, taggedMembers } = req.body;

    if ((!groupId && !groupName) || !message || !mediaPath) {
        return res.status(400).json({ error: 'groupId or groupName, message, and mediaPath are required' });
    }

    // Make taggedMembers optional and always an array
    const safeTaggedMembers = Array.isArray(taggedMembers) ? taggedMembers : [];

    try {
        let resolvedGroupId = groupId;
        if (!resolvedGroupId && groupName) {
            resolvedGroupId = await getGroupIdByName(groupName);
            if (!resolvedGroupId) {
                return res.status(404).json({ error: `Group with name "${groupName}" not found` });
            }
        }
        await sendMessageWithMedia(resolvedGroupId, message, mediaPath, safeTaggedMembers);
        res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error('Error sending message with media:', error);
        res.status(500).json({ error: 'Failed to send message with media' });
    }
});

async function getGroupIdByName(groupName) {
    // Always refresh chatList before searching
    chatList = await client.getChats();
    const group = chatList.find(
        chat => chat.isGroup && chat.name && chat.name.toLowerCase() === groupName.toLowerCase()
    );
    return group ? group.id._serialized : null;
}

// // Store messageId -> userId mapping
// const messageUserMap = new Map();

// // Listen for all incoming messages
// client.on('message', async (message) => {
//     try {
//         const chat = await message.getChat();
//         if (!chat.isGroup) return; // Only handle group messages

//         // Get sender's display name (pushname/verifiedName/number)
//         const contact = await message.getContact();
//         const senderName = contact.pushname || contact.verifiedName || contact.number;

//         // Format timestamp as "YYYY-MM-DD HH:mm:ss"
//         const date = new Date(message.timestamp * 1000);
//         const options = { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', 
//             hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
//         const formatter = new Intl.DateTimeFormat('en-GB', options);
//         const parts = formatter.formatToParts(date);
//         const formattedTimestamp = `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value} ${parts.find(p => p.type === 'hour').value}:${parts.find(p => p.type === 'minute').value}:${parts.find(p => p.type === 'second').value}`;

//         // Mentions
//         const mentions = message.mentionedIds && message.mentionedIds.length > 0 ? message.mentionedIds : undefined;

//         // Reply info
//         let replyTo = undefined;
//         if (message.hasQuotedMsg) {
//             const quotedMsg = await message.getQuotedMessage();
//             replyTo = {
//                 from: quotedMsg.author || quotedMsg.from,
//                 messageId: quotedMsg.id._serialized
//             };
//         }

//         // Build payload in your requested format
//         const groupMessagePayload = {
//             type: "NEW_MESSAGE",
//             data: {
//                 from: senderName,
//                 group: chat.name,
//                 body: message.body,
//                 timestamp: formattedTimestamp,
//                 ...(mentions && { mentions }),
//                 ...(replyTo && { replyTo })
//             }
//         };

//         // Send only this one message per group message
//         broadcastMessageToClients(groupMessagePayload);

//     } catch (error) {
//         console.error('Error in group message handler:', error);
//     }
// });
