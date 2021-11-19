const path = require("path");
const http = require("http");
const Koa = require("koa");
const fs = require("fs").promises;
const Router = require("@koa/router");
const multer = require("@koa/multer");
const SocketIO = require("socket.io");
const mount = require("koa-mount");
const serve = require("koa-static");
const { customAlphabet } = require("nanoid");
const next = require("next");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = parseInt(process.env.PORT, 10) || 3000;
const UPLOADS_DIR = path.resolve(__dirname, "uploads");

const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();
const upload = multer();
const chatrooms = {};
const nanoid = customAlphabet("123456789abcdefghijklmnopqrstuvwxyz", 6);

main();

async function main() {
  await Promise.all([nextApp.prepare(), setupUploadsDir()]);

  const app = new Koa();
  const router = new Router();

  router.get("/", (ctx) => {
    ctx.status = 307;
    ctx.redirect("/r/" + nanoid());
  });

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
    const savePath = await saveUploads(room, file);
    const filePath = savePath.slice(__dirname.length);
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
    const procMsg = (msg) => {
      const { room } = socket.data;
      msg.id = newChatroomMsgId(room);
      msg.sentAt = currentTime();
      return msg;
    };
    socket.on("enter", ({ room, user }) => {
      if (!room || !user) return;
      socket.join(room);
      const chatroom = ensureChatroom(room);
      socket.data = { room, user };
      chatroom.members.add(user);
      if (chatroom.members.size > 0) {
        socket.send(
          procMsg({
            system: true,
            action: "listMembers",
            users: Array.from(chatroom.members),
          })
        );
        socket.to(room).emit(
          "message",
          procMsg({
            system: true,
            action: "addMember",
            user,
          })
        );
      }
    });
    socket.on("chat", (message) => {
      if (!socket.data) return;
      const { room, user } = socket.data;
      io.to(room).emit("message", procMsg({ user, message }));
    });
    socket.on("disconnect", async () => {
      if (!socket.data) return;
      const { room, user } = socket.data;
      const chatroom = ensureChatroom(room);
      if (chatroom.members.delete(user)) {
        socket.to(room).emit(
          "message",
          procMsg({
            system: true,
            action: "removeMember",
            user,
          })
        );
      }
      if (chatroom.members.size === 0) {
        await clearChatroom(room);
      }
    });
  });

  server.listen(PORT, HOST, () => {
    console.log(`> Ready on http://${HOST}:${PORT}`);
  });
}

function ensureChatroom(room) {
  if (!chatrooms[room]) {
    chatrooms[room] = { msgId: 0, members: new Set() };
  }
  return chatrooms[room];
}

function newChatroomMsgId(room) {
  const chatroom = ensureChatroom(room);
  chatroom.msgId += 1;
  return chatroom.msgId;
}

async function clearChatroom(room) {
  try {
    const roomDir = path.resolve(UPLOADS_DIR, room);
    await fs.rm(roomDir, { recursive: true, force: true });
  } catch {}
}

async function setupUploadsDir() {
  await fs.rm(UPLOADS_DIR, {
    recursive: true,
    force: true,
  });
  await ensurceDir(UPLOADS_DIR);
}

async function saveUploads(room, file) {
  const name = file.originalname;
  const roomDir = path.resolve(UPLOADS_DIR, room);
  await ensurceDir(roomDir);
  const savePath = path.resolve(roomDir, name);
  await fs.writeFile(savePath, file.buffer);
  return savePath;
}

async function ensurceDir(dir) {
  try {
    const stat = await fs.stat(dir);
    if (stat.isDirectory()) return;
  } catch (err) {
    await fs.mkdir(dir);
  }
}

function currentTime() {
  return Math.floor(Date.now() / 1000);
}
