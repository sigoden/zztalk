const path = require("path");
const http = require("http");
const Koa = require("koa");
const fs = require("fs");
const Router = require("@koa/router");
const multer = require("@koa/multer");
const SocketIO = require("socket.io");
const mount = require("koa-mount");
const serve = require("koa-static");
const next = require("next");

const PORT = parseInt(process.env.PORT, 10) || 3000;
const DURATION = parseInt(process.env.DURATION, 10) || 30 * 60;
const UPLOADS_DIR = path.resolve(__dirname, "uploads");

const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();
const upload = multer();
const chatrooms = {};

main();

async function main() {
  await Promise.all([nextApp.prepare(), ensureUploadsDir()]);

  const app = new Koa();
  const router = new Router();

  router.post("/uploads", upload.single("file"), async (ctx) => {
    const {
      file,
      body: { room },
    } = ctx.request;
    if (!chatrooms[room] || !file) {
      ctx.status = 400;
      ctx.body = "invalid args";
      return;
    }
    const filePath = await saveUploads(room, file);
    const fileName = path.basename(filePath);
    ctx.body = { filePath, fileName };
  });

  router.all("(.*)", async (ctx) => {
    await handle(ctx.req, ctx.res);
    ctx.respond = false;
  });

  app.use(mount("/uploads", serve(UPLOADS_DIR)));
  app.use(router.routes());
  app.use(router.allowedMethods());

  const server = http.createServer(app.callback());
  const io = new SocketIO.Server(server);

  io.on("connection", (socket) => {
    const boardcast = (msg) => {
      const { room } = msg;
      const now = currentTime();
      if (!room || !chatrooms[room]) return;
      let chatroom = chatrooms[room];
      let { msgId } = chatroom;
      msgId += 1;
      msg.sender = socket.sender;
      msg.sentAt = now;
      msg.id = chatroom.msgId = msgId;
      chatroom.updateAt = now;
      chatroom.msgs.push(msg);
      io.to(room).emit("message", msg);
    };
    socket.on("enter", ({ room, sender }, cb) => {
      if (!room) return;
      if (!socket.rooms.has(room)) socket.join(room);
      let chatroom = chatrooms[room];
      const now = currentTime();
      if (!chatrooms[room]) {
        chatroom = chatrooms[room] = {
          msgId: 0,
          msgs: [],
        };
        boardcast({ room, system: { kind: 1 } });
      }
      socket.sender = sender;
      chatroom.updateAt = now;
      const msgs = chatroom.msgs.filter((msg) => now - msg.sentAt < DURATION);
      chatroom.msgs = msgs;
      const senders = new Set(msgs.map((msg) => msg.sender));
      if (!senders.has(sender)) {
        boardcast({
          room,
          system: { kind: 2, sender },
        });
      }
      return cb(msgs);
    });
    socket.on("message", (msg) => boardcast(msg));
  });

  server.listen(PORT, () => {
    console.log(`> Ready on http://localhost:${PORT}`);
  });

  setImmediate(purgeOutdated, DURATION / 10);
}

async function purgeOutdated() {
  const now = currentTime();
  const names = Object.keys(chatrooms);
  for (const name of names) {
    const chatroom = chatrooms[name];
    if (now - chatroom.updateAt > DURATION) {
      await fs.promises.rm(path.resolve(UPLOADS_DIR, room), {
        recursive: true,
        force: true,
      });
    }
    delete chatrooms[name];
  }
}

async function ensureUploadsDir() {
  await fs.promises.rm(UPLOADS_DIR, {
    recursive: true,
    force: true,
  });
  await ensurceDir(UPLOADS_DIR);
}

async function saveUploads(room, file) {
  const name = file.originalname;
  const roomDir = path.resolve(UPLOADS_DIR, room);
  await ensurceDir(roomDir);
  await fs.promises.writeFile(path.resolve(roomDir, name), file.buffer);
  return `/uploads/${room}/${name}`;
}

async function ensurceDir(dir) {
  try {
    const stat = await fs.promises.stat(dir);
    if (stat.isDirectory()) return;
  } catch (err) {
    await fs.promises.mkdir(dir);
  }
}

function currentTime() {
  return Math.floor(Date.now() / 1000);
}
