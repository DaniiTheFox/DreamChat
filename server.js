'use strict'

//////EXPRESS////////
const express = require('express');
const axios = require('axios');
const { URL } = require('url');
const path = require('path');

const app = express();

////////HTTP/////////
const http = require('http').createServer(app);

//Port and server setup
const port = process.env.PORT || 1989;

//Server
const server = app.listen(port);

//Console the port
console.log('Server is running localhost on port: ' + port );

/////SOCKET.IO///////
const io = require('socket.io').listen(server);

////////EJS//////////
const ejs = require('ejs');

//Setup the views folder
app.set("views", __dirname + '/views');
app.use('/src', express.static(path.join(__dirname, 'src')));

//Setup ejs, so I can write HTML(:
app.engine('.html', ejs.__express);
app.set('view-engine', 'html');

//Setup the public client folder
app.use(express.static(__dirname + '/'));

function romveFunction(inputString) {
  return inputString.replace(/./g, char => {
      if (/[a-zA-Z0-9 :]/.test(char)) {
          return char;
      }
      return '';
  });
}

var cln = "";

let clients = {}

//Socket setup
io.on('connection', client=>{

  console.log('User ' + client.id + ' connected, there are ' + io.engine.clientsCount + ' clients connected');

  //Add a new client indexed by his id
  clients[client.id] = {
	  username: '',
	  model: '',
	  texture: '',
    position: [0, 0, 0],
    rotation: [0, 0, 0]
  }

  client.emit('identify', 'whois');

  //Make sure to send the client it's ID
  client.on('register', (userdata) => {
	console.log("received registry connection signal: " + userdata);
	if(userdata == "ImChat"){
		client.emit('ok','ignoring');
		console.log("chat detected ignoring....");
	}else{
		var _sdata = userdata.split('$');
		clients[client.id].model = _sdata[1];
		clients[client.id].texture = _sdata[2];
		clients[client.id].username = _sdata[0];
		client.emit('introduction', client.id, clients, io.engine.clientsCount, Object.keys(clients));
		io.sockets.emit('newUserConnected', io.engine.clientsCount, client.id, _sdata[0], _sdata[1], _sdata[2], Object.keys(clients));
	}
  });

  //Update everyone that the number of users has changed
  //io.sockets.emit('newUserConnected', io.engine.clientsCount, client.id, clients[client.id].username, clients[client.id].model, clients[client.id].texture, Object.keys(clients));

  client.on('move', (pos)=>{

    clients[client.id].position = pos;
    io.sockets.emit('userPositions', clients);

  });

  //Handle the disconnection
  client.on('disconnect', ()=>{

    //Delete this client from the object
    delete clients[client.id];

    io.sockets.emit('userDisconnected', io.engine.clientsCount, client.id, Object.keys(clients));

    console.log('User ' + client.id + ' disconnected, there are ' + io.engine.clientsCount + ' clients connected');

  });

  client.on('chat', (msg)=> {
    cln = romveFunction(msg);
    console.log("{Chat-log}: " + cln);
    io.sockets.emit('conversation', msg);
    //console.log("message received!");
  });

});


// Define allowed domains for the proxy
const allowedDomains = ['i.imgur.com', 'www.abdreams.slpmx.com'];  // Replace with trusted image hosts

// List to track blocked IPs for DDoS protection
let blockedIps = new Set();

// Timeouts for external requests (5 seconds)
const requestTimeout = 5000;

// Helper function to validate the URL and domain
const isValidUrl = (url) => {
  try {
    const parsedUrl = new URL(url);
    return (
      allowedDomains.includes(parsedUrl.hostname) &&
      /\.(obj|jpg|png|gif|bmp)$/i.test(parsedUrl.pathname) // Allow .obj files
    );
  } catch (error) {
    return false; // Invalid URL format
  }
};

// Middleware for blocking suspicious IPs (for DDoS protection)
const checkBlockedIp = (req, res, next) => {
  if (blockedIps.has(req.ip)) {
    return res.status(403).send('Your IP is temporarily blocked due to suspicious activity.');
  }
  next();
};
//////////////////////
//////ROUTER////////
/////////////////////
//Client view
app.get('/game.html', (req, res) => {

	res.render('game.html');

});

app.get('/chat.html', (req, res) => {
	res.render('chat.html');
});

// Handle SSRF and fetch image
app.get('/proxy', checkBlockedIp, async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) {
    return res.status(400).send('URL parameter is required');
  }

  // Validate URL format and domain
  if (!isValidUrl(imageUrl)) {
    return res.status(400).send('Invalid URL or domain not allowed');
  }

  try {
    // Fetch the image with a timeout
    const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: requestTimeout });

    // Set the correct content type
    res.set('Content-Type', response.headers['content-type']);
    res.send(response.data); // Send image data
  } catch (error) {
    console.error('Error fetching image:', error.message);

    // Temporary IP block for repeated failed requests (for DDoS protection)
    if (error.response || error.code === 'ECONNABORTED') {
      // Block the IP for 5 minutes if there's a failed request
      blockedIps.add(req.ip);
      setTimeout(() => blockedIps.delete(req.ip), 5 * 60 * 1000); // Remove IP from block list after 5 minutes
    }

    res.status(500).send('Error fetching the image');
  }
});

app.use('/src', express.static(path.join(__dirname, 'src'), {
  setHeaders: (res, path) => {
      if (path.endsWith('.js')) {
          res.setHeader('Content-Type', 'application/javascript');
      }
  }
}));

app.get('/*', (req, res) => {
	res.render('index.html');
});
