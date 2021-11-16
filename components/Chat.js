import { createRef, useEffect, useState } from "react";
import * as md5 from "md5";
import * as jdenticon from "jdenticon";
import axios from "axios";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import * as humanizeDuration from "humanize-duration";
import { io } from "socket.io-client";
import {
  Avatar,
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageSeparator,
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
      socket.emit("enter", { room, sender: user }, (messages) => {
        setMessages(messages.map(santizeMsg));
      });
    });
    socket.on("message", (message) => {
      setMessages((v) => [...v, santizeMsg(message)]);
    });
    return () => socket.disconnect();
  }, [room]);
  const handleSend = (message) => {
    socket.emit("message", { room, message });
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
      socket.emit("message", {
        room,
        message: `<a target="_blank" href="${filePath}">${fileName}</a>`,
      });
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
            {messages.length > 0 && (
              <MessageSeparator>{getMsgDate(messages[0])}</MessageSeparator>
            )}
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
  const { id, system, sentAt, sender } = msg;
  let { message } = msg;
  let avatar;
  let direction = 0;
  if (system) {
    const { kind } = system;
    if (kind === 1) {
      const { href } = location;
      const link = href.split("?")[0];
      message = `Share <a target="_blank" href="${link}">${link}</a> to invite members. <strong>Any message or file in current room will be deleted in ${humanizeDuration(
        system.duration * 1000
      )}.</strong>`;
    } else if (kind === 2) {
      message = `<img style="width: 13px; margin-right: 4px;" src="${genAvatar(
        system.sender
      )}" /> joined room`;
    }
    avatar = "/system.svg";
  } else {
    if (sender === user) direction = 1;
    avatar = genAvatar(sender);
  }
  return {
    id,
    sentAt,
    sender,
    message,
    avatar,
    direction,
    position: "single",
  };
}

function genAvatar(sender, size = 200) {
  if (avatarCache[sender]) return avatarCache[sender];
  avatarCache[sender] =
    "data:image/svg+xml;base64," + btoa(jdenticon.toSvg(sender, size));
  return avatarCache[sender];
}

function getMsgDate(msg) {
  const date = new Date(msg.sentAt * 1000);
  let hh = date.getHours();
  let mm = date.getMinutes();
  if (hh < 10) hh = "0" + hh;
  if (mm < 10) mm = "0" + mm;
  return `${hh}:${mm}`;
}
