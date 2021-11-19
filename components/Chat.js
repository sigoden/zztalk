import { createRef, useCallback, useEffect, useState } from "react";
import useStateRef from "react-usestateref";
import * as md5 from "md5";
import * as jdenticon from "jdenticon";
import axios from "axios";
import Box from "@mui/material/Box";
import Modal from "@mui/material/Modal";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import { io } from "socket.io-client";
import {
  Avatar,
  MainContainer,
  ConversationHeader,
  AvatarGroup,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
  InfoButton,
} from "@chatscope/chat-ui-kit-react";

const user = md5(navigator.userAgent).slice(0, 6);
const avatarCache = {};

export default function Chat({ room }) {
  const [socket, setSocket] = useState(null);
  const [msgs, setMsgs, msgsRef] = useStateRef([]);
  const [members, setMembers, membersRef] = useStateRef([]);
  const [showHelp, setShowHelp] = useState(false);
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
    socket.on("message", (msg) => {
      handleMsg(msg);
    });
    return () => socket.disconnect();
  }, [room, handleMsg]);
  const handleMsg = useCallback(
    (msg) => {
      if (msg.action) {
        const members = membersRef.current;
        const { action } = msg;
        if (action === "listMembers") {
          setMembers(msg.users);
        } else if (action === "addMember") {
          setMembers(
            members.indexOf(msg.user) === -1 ? [...members, msg.user] : members
          );
        } else if (action === "removeMember") {
          setMembers(members.filter((member) => member !== msg.user));
        }
      } else {
        let msgs = msgsRef.current;
        const newMsg = {
          id: msg.id,
          message: msg.message,
          sender: msg.user,
          position: "single",
          avatar: null,
          direction: msg.user === user ? 1 : 0,
        };
        if (msgs.length > 0) {
          const prevMsg = msgs[msgs.length - 1];
          if (prevMsg.sender === newMsg.sender) {
            if (prevMsg.position === "single") {
              prevMsg.position = "first";
            } else if (prevMsg.position === "last") {
              prevMsg.position = "normal";
            }
            newMsg.position = "last";
          } else {
            newMsg.avatar = genAvatar(msg.user);
          }
        } else {
          newMsg.avatar = genAvatar(msg.user);
        }
        msgs = [...msgs, newMsg];
        setMsgs(msgs);
      }
    },
    [membersRef, setMembers, msgsRef, setMsgs]
  );
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
    <Box
      sx={{
        maxWidth: "md",
        mx: "auto",
        a: {
          color: "#0269c8",
          borderBottom: "1px solid #d1e9ff",
          textDecoration: "none",
        },
        ".cs-conversation-header__avatar": {
          flexGrow: 1,
        },
        ".cs-message-list": {
          background: "#f1f3f4",
        },
        ".cs-message__content": {
          background: "white !important",
        },
      }}
    >
      <LinearProgress
        sx={{ visibility: progress > 0 ? "visible" : "hidden" }}
        variant="determinate"
        value={progress}
      />

      <MainContainer style={{ height: "calc(100vh - 25px)" }}>
        <ChatContainer>
          <ConversationHeader>
            <AvatarGroup size="md">
              {members.map((member) => (
                <Avatar key={member} src={genAvatar(member)} />
              ))}
            </AvatarGroup>
            <ConversationHeader.Actions>
              <InfoButton onClick={() => setShowHelp(true)} />
            </ConversationHeader.Actions>
          </ConversationHeader>
          <MessageList style={{ paddingTop: "4px" }}>
            {msgs.map((msg) => (
              <Message key={msg.id} model={msg} avatarSpacer={!msg.avatar}>
                {msg.avatar && <Avatar src={msg.avatar} />}
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
      <Modal
        open={showHelp}
        onClose={() => setShowHelp(false)}
        aria-labelledby="modal-modal-title"
        aria-describedby="modal-modal-description"
      >
        <Box
          sx={{
            position: "absolute",
            top: "33%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "80%",
            maxWidth: 600,
            bgcolor: "background.paper",
            boxShadow: 24,
            p: 2,
          }}
        >
          <Typography id="modal-modal-title" variant="h6" component="h2">
            Note
          </Typography>
          <Box id="modal-modal-description" sx={{ mt: 2 }}>
            <Typography variant="body1">
              1. Share url to invite members.
            </Typography>
            <Typography variant="body1">
              2. If all members quit, the room will be destroyed.
            </Typography>
            <Typography variant="body1">
              3. All files will be deleted along with the room.
            </Typography>
          </Box>
        </Box>
      </Modal>
    </Box>
  );
}

function genAvatar(user, size = 200) {
  if (avatarCache[user]) return avatarCache[user];
  avatarCache[user] =
    "data:image/svg+xml;base64," + btoa(jdenticon.toSvg(user, size));
  return avatarCache[user];
}
