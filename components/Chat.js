import { createRef, useEffect, useState } from "react";
import * as md5 from "md5";
import * as jdenticon from "jdenticon";
import axios from "axios";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import { io } from "socket.io-client";
import {
  Avatar,
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
} from "@chatscope/chat-ui-kit-react";

const user = md5(navigator.userAgent).slice(0, 6);
const avatarCache = {};

export default function Chat({ room }) {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [progress, setProgress] = useState(0);
  const fileRef = createRef();
  useEffect(() => {
    const socket = io("/", {
      transports: ["websocket", "polling"],
    });
    setSocket(socket);
    socket.on("connect", () => {
      socket.emit("enter", { room, user });
    });
    socket.on("message", (message) => {
      setMessages((v) => [...v, santizeMsg(message)]);
    });
    return () => socket.disconnect();
  }, [room]);
  const handleSend = (message) => {
    socket.emit("chat", message);
  };
  const handleAttachClick = () => {
    if (fileRef.current) fileRef.current.click();
  };
  const handleUpload = async (file) => {
    const formData = new FormData();
    formData.append("room", room);
    formData.append("file", file);
    try {
      const res = await axios({
        method: "post",
        url: "/uploads",
        data: formData,
        onUploadProgress: (e) => {
          setProgress(parseInt((e.loaded / e.total) * 100));
        },
      });
      setProgress(0);
      const { filePath, fileName } = res.data;
      handleSend(`<a target="_blank" href="${filePath}">${fileName}</a>`);
    } catch (err) {
      setProgress(0);
    }
  };
  return (
    <Box sx={{ maxWidth: "md", mx: "auto", a: { color: "black" } }}>
      <LinearProgress
        sx={{ visibility: progress > 0 ? "visible" : "hidden" }}
        variant="determinate"
        value={progress}
      />
      <MainContainer style={{ height: "calc(100vh - 25px)" }}>
        <ChatContainer>
          <MessageList>
            {messages.map((msg) => (
              <Message key={msg.id} model={msg}>
                <Avatar src={msg.avatar} />
              </Message>
            ))}
          </MessageList>
          <MessageInput
            placeholder="Type message here"
            onSend={(text) => handleSend(text)}
            onAttachClick={handleAttachClick}
            attachDisabled={progress > 0}
          />
        </ChatContainer>
      </MainContainer>
      <input
        ref={fileRef}
        type="file"
        multiple={false}
        hidden
        onChange={(e) => handleUpload(e.target.files[0])}
      />
    </Box>
  );
}

function santizeMsg(msg) {
  const { id, system, kind, sentAt } = msg;
  let { message } = msg;
  let avatar;
  let direction = 0;
  if (system) {
    if (kind === "welcome") {
      message = `Share current page url to invite members.`;
    } else if (kind === "listMembers") {
      message = `Current members: ` + msg.users.map(embedAvatar).join("");
    } else if (kind === "addMember") {
      message = embedAvatar(msg.user) + " enter room";
    } else if (kind === "removeMember") {
      message = embedAvatar(msg.user) + " quit room";
    }
    avatar = "/system.svg";
  } else {
    if (user === msg.user) direction = 1;
    avatar = genAvatar(msg.user);
  }
  return {
    id,
    sentAt,
    message,
    avatar,
    direction,
    position: "single",
  };
}

function embedAvatar(user) {
  return `<img style="width: 13px; margin-right: 4px;" src="${genAvatar(
    user
  )}" />`;
}

function genAvatar(user, size = 200) {
  if (avatarCache[user]) return avatarCache[user];
  avatarCache[user] =
    "data:image/svg+xml;base64," + btoa(jdenticon.toSvg(user, size));
  return avatarCache[user];
}

function getMsgDate(msg) {
  const date = new Date(msg.sentAt * 1000);
  let hh = date.getHours();
  let mm = date.getMinutes();
  if (hh < 10) hh = "0" + hh;
  if (mm < 10) mm = "0" + mm;
  return `${hh}:${mm}`;
}
