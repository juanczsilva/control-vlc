const exec = require('child_process').exec;
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const path = require('path');
const os = require('os');
const net = require('net');
const fs = require("fs");

const app = express();

const clientPath = `${__dirname}/web_client`;
app.use(express.json());
app.use(express.static(clientPath));
console.log(`\n\u001b[33m* Serving static from '${clientPath}'`);

const server = http.createServer(app);
const port = 8080;

/**
 * @type {Map<string, string>}
 */
const twitchCache = new Map();

let vlcClient = null;
let currentVolume = 64;

// @ts-ignore
const io = socketio(server);

io.on('connection', (sock) => {
  console.log(`\n\u001b[37m* New connection: ${sock.id}`);
  sock.emit('msg', 'PING CL');

  sock.on('disconnect', () => {
    console.log(`\n\u001b[37m* User disconnected: ${sock.id}`);
  });

  sock.on('msg', (text) => {
    console.log(text);
    if (text != "PING SV") {
      checkVLCConnection().then(() => {
        let action = '';
        switch (text) {
          case "CH_NEXT":
            action = 'next';
          break;
          case "CH_PREV":
            action = 'prev';
          break;
          case "VOL_UP":
            action = 'volup 1';
          break;
          case "VOL_DOWN":
            action = 'voldown 1';
          break;
          case "VOL_MUTE":
            action = 'volume';
            vlcClient.once('data', function(data) {
              // console.log("(" + data.toString() + ")");
              let vlcVol = Number(data.toString().split(os.EOL)[0].trim());
              if (!isNaN(vlcVol)) {
                if (vlcVol > 0) {
                  currentVolume = vlcVol;
                  vlcClient.write('volume 0' + os.EOL);
                } else {
                  vlcClient.write('volume ' + currentVolume + os.EOL);
                }
              }
            });
          break;
          case "SHUTDOWN":
            action = 'shutdown';
            // exec("shutdown -s -t 0");
          break;
        }
        vlcClient.write(action + os.EOL);
      });
    }
    // old
    // if (text != "PING SV") exec(`start scripts/action.vbs "${text}"`);
    // if (text != "PING SV") {
    //   exec(`powershell -File "scripts/focus.ps1"`, (err, stdout, stderr) => {
    //     if (err) {
    //         console.error(`Error: ${err.message}`);
    //         return;
    //     }
    //     console.log(`stdout: ${stdout}`);
    //     console.error(`stderr: ${stderr}`);
    //     exec(`start scripts/action.vbs "${text}"`);
    //   });
    // }
  });
});

server.on('error', (err) => {
  console.log(`Error: ${err.name} - ${err.message}`);
});

server.listen(port, () => {
  console.log(`\u001b[33m* Server started on port: ${port}`);
});

app.get('/', (req, res) => {
  res.sendFile(path.resolve(`${clientPath}/index.html`));
});

app.get('/playlist', (req, res) => {
  checkVLCConnection().then(() => {
    vlcClient.once('data', function(data) {
      let playlist = data.toString();
      // if (playlist.includes("[ Playlist - playlist ]")) console.log('Received: ' + data);
      if (playlist.includes("[ End of playlist ]")) {
        // console.log("playlist data end...");
        // vlcclient.destroy();
        res.json({ playlist: parsePlaylist(playlist) });
      }
    });
    vlcClient.write('playlist' + os.EOL);
  });
});

app.get('/play/:id', (req, res) => {
  const id = req.params.id;
  checkVLCConnection().then(() => {
    vlcClient.once('data', function(data) {
      if (data.toString() == "> ") {
        // console.log('Received: ' + '"' + data + '"');
        // vlcclient.destroy();
        res.sendStatus(200);
      }
    });
    vlcClient.write('gotoitem ' + id + os.EOL);
  });
});

app.get('/list', (req, res) => {
  fs.readFile(`${clientPath}/list.json`, "utf8", (error, data) => {
    if (error) {
      console.log(error);
      res.sendStatus(500);
    } else {
      let output = "#EXTM3U\n";
      JSON.parse(data).forEach(element => {
        output += `\n#EXTINF:-1 tvg-name="${element.name}" tvg-chno="${element.number}" channel-number=${element.number},${element.name}`;
        if (element.opts) {
          output += `\n${element.opts}`;
        }
        output += `\n${element.url}\n`;
      });
      res.type("txt");
      res.send(output);
    }
  });
});

app.get('/list/editor', (req, res) => {
  res.sendFile(path.resolve(`${clientPath}/editor.html`));
});

app.post('/list/update', (req, res) => {
  const chList = req.body;
  fs.writeFile(`${clientPath}/list.json`, JSON.stringify(chList, null, 2), (error) => {
    if (error) {
      console.log(error);
      res.sendStatus(500);
    } else {
      res.sendStatus(200);
    }
  });
});

app.get('/streamlink', (req, res) => {
  const ch = req.query.ch || "";
  const chCache = twitchCache.get(ch.toString());
  if (chCache) {
    // console.log(`Cache: ${ch} - ${chCache}`);
    res.redirect(chCache);
  } else {
    execStreamlink(ch.toString(), '360p').then(({ status, data, error }) => {
      if (status == 200) {
        twitchCache.set(ch.toString(), data);
        res.redirect(data);
      } else {
        console.error(error);
        res.sendStatus(status);
      }
    });
  }
});

/**
 * 
 * @param {string} pl 
 * @returns {Array}
 */
function parsePlaylist(pl) {
  let parsedPL = [];
  (pl.split(os.EOL)).forEach((item, index) => {
    let itemParts = item.match(/(\|  )(\*| )([0-9]+)( - )(.+)/);
    if (itemParts != null) {
      parsedPL.push({
        id: itemParts[3], 
        nombre: itemParts[5].trim()
      });
    }
  });
  return parsedPL;
}

function execStreamlink(ch, qu) {
  return new Promise((resolve) => {
    exec(`${__dirname}/streamlink-6.9.0-1-py38-x86/bin/streamlink --stream-url twitch.tv/${ch} ${qu}`, (err, stdout, stderr) => {
      if (err) {
        resolve({ status: 500, data: '', error: `Error: ${err.message}` });
      } else if (stderr) {
        resolve({ status: 404, data: '', error: `Error: ${stderr}` });
      } else {
        resolve({ status: 200, data: stdout, error: '' });
      }
    });
  });
}

function checkVLCConnection() {
  return new Promise((resolve, reject) => {
      if (vlcClient && !vlcClient.destroyed) {
        resolve(true);
      } else {
        vlcClient = new net.Socket();
        vlcClient.connect(1234, 'localhost', function() {
          // console.log('Connected');
          vlcClient.once('data', function(data) {
            // console.log(data.toString());
            resolve(true);
          });
        });
      }
  });
}

fs.readFile(`${clientPath}/list.json`, "utf8", (error, data) => {
  if (!error) {
    JSON.parse(data).forEach((element) => {
      if (element.url.includes("streamlink")) {
          let ch = element.url.split("=")[1];
          execStreamlink(ch, '360p').then(({ status, data, error }) => {
            if (status == 200) {
              twitchCache.set(ch, data);
            } else {
              console.error(error);
            }
          });
      }
    });
  }
});
