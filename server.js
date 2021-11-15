const path = require("path");
const http = require("http");
const Koa = require("koa");
const fs = require("fs");
const Router = require("@koa/router");
const multer = require("@koa/multer");
const SocketIO = require("socket.io");
const next = require("next");

const PORT = parseInt(process.env.PORT, 10) || 3000;
const TIMEOUT = parseInt(process.env.TIMEOUT, 10) || 30 * 60;
const UPLOADS_DIR = path.resolve(__dirname, "public/uploads");

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
    if (!chatrooms[room]) {
      ctx.status = 400;
      ctx.body = "room not found";
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

  app.use(router.routes());
  app.use(router.allowedMethods());

  const server = http.createServer(app.callback());
  const io = new SocketIO.Server(server);

  io.on("connection", (socket) => {
    socket.on("enter", ({ room, sender }, cb) => {
      if (!room) return;
      if (!socket.rooms.has(room)) socket.join(room);
      let chatroom = chatrooms[room];
      if (!chatrooms[room]) {
        chatroom = chatrooms[room] = {
          msgId: 0,
          msgs: [],
          createdAt: Date.now(),
        };
      }
      socket.sender = sender;
      const now = Date.now();
      chatroom.updateAt = now;
      let idx = chatroom.msgs.findIndex((msg) => now - msg.sentAt < TIMEOUT);
      if (idx == -1) idx = 0;
      chatroom.msgs = chatroom.msgs.slice(idx);
      return cb(chatroom.msgs);
    });
    socket.on("message", (msg) => {
      const { room } = msg;
      const now = Date.now();
      if (!room || !chatrooms[room]) return;
      let chatroom = chatrooms[room];
      let { msgId } = chatroom;
      msgId += 1;
      msg.sender = socket.sender;
      msg.id = chatroom.msgId = msgId;
      chatroom.updateAt = now;
      chatroom.msgs.push(msg);
      io.to(room).emit("message", msg);
    });
  });

  server.listen(PORT, () => {
    console.log(`> Ready on http://localhost:${PORT}`);
  });

  setImmediate(purgeOutdated, TIMEOUT / 10);
}

async function purgeOutdated() {
  const now = Date.now();
  const names = Object.keys(chatrooms);
  for (const name of names) {
    const chatroom = chatrooms[name];
    if (now - chatroom.updateAt > TIMEOUT) {
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
