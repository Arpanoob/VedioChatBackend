"use strict";

const express = require("express");
const http = require("http");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");
const twillo = require("twilio");

const socket = require("socket.io");

const port = 5002;

const app = express();

const server = http.createServer(app);
app.use(cors());

const io = socket(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let connectedUser = [];
let rooms = [];

app.use("/api/room-exists/:roomId", (req, res) => {
  const { roomId } = req.params;
  const room = rooms.find((room) => room.id == roomId);
  if (room) {
    if (room.connectedUsers > 3)
      return res.send({ RoomExist: true, roomFull: true });
    else return res.send({ RoomExist: true, RoomFull: false });
  } else {
    return res.send({ RoomExist: false });
  }
});

io.on("connection", (socket) => {
  console.log(`User Connected ${socket.id}`);
  console.log("Total User : ", connectedUser);
  console.log("Rooms", rooms);
  socket.on("create-new-room", (data) => {
    createNewRoomHandler(data, socket);
  });
  socket.on("join-room", (data) => {
    joinRoomHandler(data, socket);
  });
  socket.on("disconnect", () => {
    diconnectHandler(socket);
  });
  socket.on("leave-room", () => {
    console.log("leaved");
    diconnectHandler(socket);
  });
  socket.on("conn-signal", (data) => {
    signalingHandler(data, socket);
  });
});

const signalingHandler = (data, socket) => {
  const { connUserSocketId, signal } = data;

  const signalingData = {
    signal,
    connUserSocketId: socket.id,
  };
  io.to(connUserSocketId).emit("conn-signal", signalingData);
};

const createNewRoomHandler = (data, socket) => {
  console.log("Creating new Room By Host");
  console.log(data);

  const { identity } = data;

  const roomId = uuidv4();

  const newUser = {
    identity,
    id: uuidv4(),
    socketId: socket.id,
    roomId,
  };

  connectedUser = [...connectedUser, newUser];

  const newRoom = { id: roomId, connectedUser: [newUser] };

  socket.join(roomId);
  rooms = [...rooms, newRoom];

  //emit room it to client side for that perticular socket
  socket.emit("room-id", { roomId });
  //emit updated connected user List
  socket.emit("room-update", { connectedUser: newRoom.connectedUser });
};

const joinRoomHandler = (data, socket) => {
  const { identity, roomId } = data;

  console.log(data);

  const newUser = {
    identity,
    id: uuidv4(),
    socketId: socket.id,
    roomId,
  };

  connectedUser = [...connectedUser, newUser];

  const room = rooms.find((room) => room.id === roomId);
  room.connectedUser = [...room.connectedUser, newUser];
  console.log("Total User : ", connectedUser);
  console.log("Rooms", rooms);
  socket.join(roomId);

  //send all user message with data  to prepare for i joined the the room and stablish
  room.connectedUser.array.forEach((user) => {
    if (user.socketId !== socket.id) {
      const data = {
        connUserSocketId: socket.id,
      };
      io.to(roomId).emit("conn-prepare", data);
    }
  });
  //all sockets connected to roomId get this message
  io.to(roomId).emit("room-update", { connectedUser: room.connectedUser });
};

const diconnectHandler = (socket) => {
  console.log("Total User : ", connectedUser);
  console.log("Rooms", rooms);
  const user = connectedUser.find((user) => user.socketId === socket.id);
  if (user) {
    const room = rooms.find((room) => room.id === user.roomId);

    room.connectedUser = room.connectedUser.filter(
      (user) => user.socketId !== socket.id
    );

    socket.leave(user.roomId);
    if (room.connectedUser.length > 3) {
      io.to(room.id).emit("room-update", { connectedUser: room.connectedUser });
    } else {
      rooms = rooms.filter((r) => r.id !== room.id);
    }
  }
};

server.listen(port, () => {
  console.log("hi");
});
