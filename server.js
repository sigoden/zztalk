const path = require("path");
const http = require("http");
const crypto = require("crypto");
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
  await Promise.all([nextApp.prepare(), ensurceDir(UPLOADS_DIR)]);

  setImmediate(clean, TIMEOUT / 10);

  const app = new Koa();
  const router = new Router();
  const server = http.createServer(app.callback());
  const io = new SocketIO.Server(server);

  router.post("/uploads", upload.single("file"), async (ctx) => {
    const { room } = ctx.request.body;
    if (!chatrooms[room]) {
      ctx.status = 400;
      ctx.body = "room not found";
      return;
    }
    const file = await saveUploads(room, ctx.request.file);
    ctx.body = { file };
  });

  router.all("(.*)", async (ctx) => {
    await handle(ctx.req, ctx.res);
    ctx.respond = false;
  });

  app.use(router.routes());
  app.use(router.allowedMethods());

  io.on("connection", (socket) => {
    socket.on("enter", ({ room }, cb) => {
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
      const now = Date.now();
      chatroom.updateAt = now;
      const msgIds = Object.keys(chatroom.msgs);
      const history = [];
      for (const msgId of msgIds) {
        const msg = chatroom.msgs[msgId];
        if (now - msg.updateAt > TIMEOUT) {
          delete chatroom.msgs[msgId];
        } else {
          history.push(msg);
        }
      }
      return cb(history);
    });
    socket.on("message", (msg) => {
      const { room } = msg;
      if (!room) return;
      if (!socket.rooms.has(room)) socket.join(room);
      if (!socket.from && msg.from) socket.from = msg.from;
      let chatroom = chatrooms[room];
      if (!chatrooms[room]) {
        chatroom = chatrooms[room] = {
          msgId: 0,
          msgs: [],
          createdAt: Date.now(),
        };
      }
      let { msgId } = chatroom;
      msgId += 1;
      msg.id = chatroom.msgId = msgId;
      chatroom.updateAt = Date.now();
      chatroom.msgs[msgId] = msg;
      io.to(room).emit("message", msg);
    });
  });

  server.listen(PORT, () => {
    console.log(`> Ready on http://localhost:${PORT}`);
  });
}

async function clean() {
  const now = Date.now();
  const names = Object.keys(chatrooms);
  for (const name of names) {
    const chatroom = chatrooms[name];
    if (now - chatroom.updateAt > TIMEOUT) {
      await fs.promises.rmdir(path.resolve(UPLOADS_DIR, room), {
        recursive: false,
        force: true,
      });
    }
    delete chatrooms[name];
  }
}

async function saveUploads(room, file) {
  const ext = path.extname(file.originalname);
  const name = sha256(file.buffer) + ext;
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

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}
