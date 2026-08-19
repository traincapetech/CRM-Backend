/**
 * Screen Share Socket Handler - MediaRecorder + Socket.IO Relay
 * No WebRTC P2P - video chunks are relayed through the server.
 * This works across all networks without STUN/TURN servers.
 */

// Active streams registry: { [userId]: { userId, userName, branchName, role, socketId, startedAt } }
const activeScreenStreams = new Map();

module.exports = function screenShareSocketHandler(io, socket) {
  // 1. Supervisor joins the monitoring room
  socket.on("join_screen_monitors", () => {
    socket.join("supervisors_room");
    console.log(`📺 [SCREEN MONITOR] Supervisor joined monitors room: ${socket.id}`);

    // Send current list of active streaming employees to the supervisor
    const streamsList = Array.from(activeScreenStreams.values());
    socket.emit("active_screen_streams_list", streamsList);
  });

  // 2. Employee registers as screen publisher
  socket.on("register_screen_publisher", (employeeInfo) => {
    if (!employeeInfo || !employeeInfo.userId) return;

    const uId = employeeInfo.userId.toString();
    const streamData = {
      userId: uId,
      userName: employeeInfo.userName || "Sales Representative",
      branchName: employeeInfo.branchName || "Ukhrul Branch",
      role: employeeInfo.role || "Sales",
      socketId: socket.id,
      startedAt: activeScreenStreams.get(uId)?.startedAt || new Date().toISOString(),
    };

    activeScreenStreams.set(uId, streamData);
    socket.userId = uId;
    socket.isPublisher = true;

    console.log(`📡 [SCREEN STREAM] Registered: ${streamData.userName} (${uId})`);
    io.to("supervisors_room").emit("screen_stream_started", streamData);
  });

  // 3. Employee sends a video chunk - relay to all supervisors
  socket.on("screen_chunk", (data) => {
    if (!data || !data.userId || !data.chunk) return;
    // Relay the chunk to all supervisors watching this stream
    io.to("supervisors_room").emit("screen_chunk", {
      userId: data.userId,
      chunk: data.chunk,
      mimeType: data.mimeType || "video/webm;codecs=vp8",
    });
  });

  // 4. Employee stops sharing screen
  socket.on("stop_screen_publisher", (userId) => {
    const id = (userId || socket.userId)?.toString();
    if (id && activeScreenStreams.has(id)) {
      activeScreenStreams.delete(id);
      console.log(`🛑 [SCREEN STREAM] Stopped: ${id}`);
      io.to("supervisors_room").emit("screen_stream_stopped", { userId: id });
    }
  });

  // 5. Handle Disconnect
  socket.on("disconnect", () => {
    if (socket.isPublisher && socket.userId) {
      const uId = socket.userId.toString();
      setTimeout(() => {
        const currentStream = activeScreenStreams.get(uId);
        if (currentStream && currentStream.socketId === socket.id) {
          activeScreenStreams.delete(uId);
          console.log(`🔌 [SCREEN STREAM] Publisher disconnected: ${uId}`);
          io.to("supervisors_room").emit("screen_stream_stopped", { userId: uId });
        }
      }, 3000);
    }
  });
};
