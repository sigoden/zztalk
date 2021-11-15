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
  MessageSeparator,
  MessageInput,
} from "@chatscope/chat-ui-kit-react";

const user = md5(navigator.userAgent);

export default function Chat({ room }) {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [progress, setProgress] = useState(0);
  const fileRef = createRef();
  useEffect(() => {
    const socket = io("/", {
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () => {
      setSocket(socket);
      socket.emit("enter", { room, sender: user }, (messages) => {
        setMessages(messages.map(santizeMsg));
      });
      socket.on("message", (message) => {
        setMessages((v) => [...v, santizeMsg(message)]);
      });
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
                <Avatar src={genAvatar(msg.sender)} />
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
  const { id, sentAt, sender, message } = msg;
  const direction = sender === user ? 1 : 0;
  return {
    id,
    message,
    sentAt,
    sender,
    direction,
    position: "single",
  };
}

function genAvatar(sender, size = 200) {
  return "data:image/svg+xml;base64," + btoa(jdenticon.toSvg(sender, size));
}

function getMsgDate(msg) {
  const date = new Date(msg.sentAt);
  let hh = date.getHours();
  let mm = date.getMinutes();
  if (hh < 10) hh = "0" + hh;
  if (mm < 10) mm = "0" + mm;
  return `${hh}:${mm}`;
}
