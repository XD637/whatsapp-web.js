var net = require('net');
const prompt = require('prompt-sync')({sigint: true});

var client = new net.Socket();
var isConnected = 
client.connect(8081, '127.0.0.1', function() {
	console.log('Connected');
	client.write('Hello, server! Love, Client.');
});

client.on('data', function(data) {
	console.log('Received: ' + data);
	//client.destroy(); // kill client after server's response
});

client.on('close', function() {
	console.log('Connection closed');
});

// const readline = require('readline').createInterface({
//     input: process.stdin,
//     output: process.stdout
//   });

// readline.question('Enter groupname:', name => {
//     client.write(name+':Hello, Sample Test Message');
//     console.log(`Send Message to ${name}!`);
// });


let IsExist = false;

// while (!IsExist) {
  // Get user input
  let guess = prompt('Enter Command: ');
  // Convert the string input to a number
  if (guess === "Exit" || guess === "Quit" ) {
    console.log('Thank you. Bye!');
    IsExist = true;
  } else {    
    client.write(guess);
    setTimeout(function() { }, 3600);
  }
  sleep(20);
// }


function sleep(delay)
{

    var start = new Date().getTime();

    while (new Date().getTime() < start + delay);

}

