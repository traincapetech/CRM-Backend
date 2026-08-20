/**
 * Screen Share Socket Handler - Ultra-Reliable Canvas Frame Relay
 * No WebRTC P2P or brittle MediaSource chunks.
 * Directly streams compressed JPEG frames with instant cached last-frame delivery.
 */

// Active streams registry: { [userId]: { userId, userName, branchName, role, socketId, startedAt, lastFrame, lastActive } }
const activeScreenStreams = new Map();

module.exports = function screenShareSocketHandler(io, socket) {
  // 1. Supervisor joins the monitoring room
  socket.on("join_screen_monitors", () => {
    socket.join("supervisors_room");
    console.log(`📺 [SCREEN MONITOR] Supervisor joined monitors room: ${socket.id}`);

    // Send current list of active streaming employees with their last frame immediately
    const streamsList = Array.from(activeScreenStreams.values());
    socket.emit("active_screen_streams_list", streamsList);
  });

  // 2. Employee registers as screen publisher
  socket.on("register_screen_publisher", (employeeInfo) => {
    if (!employeeInfo || !employeeInfo.userId) return;

    const uId = employeeInfo.userId.toString();
    const existing = activeScreenStreams.get(uId);

    const streamData = {
      userId: uId,
      userName: employeeInfo.userName || "Sales Representative",
      branchName: employeeInfo.branchName || "Ukhrul Branch",
      role: employeeInfo.role || "Sales",
      socketId: socket.id,
      startedAt: existing?.startedAt || new Date().toISOString(),
      lastFrame: existing?.lastFrame || null,
      lastActive: Date.now(),
    };

    activeScreenStreams.set(uId, streamData);
    socket.userId = uId;
    socket.isPublisher = true;

    console.log(`📡 [SCREEN STREAM] Registered: ${streamData.userName} (${uId})`);
    io.to("supervisors_room").emit("screen_stream_started", streamData);
  });

  // 3. Employee sends a compressed frame (JPEG/WebP dataUrl or buffer)
  socket.on("screen_frame", (data) => {
    if (!data || !data.userId || !data.frame) return;

    const uId = data.userId.toString();
    const stream = activeScreenStreams.get(uId);
    if (stream) {
      stream.lastFrame = data.frame;
      stream.lastActive = Date.now();
    }

    // Relay the frame instantly to all supervisors
    io.to("supervisors_room").emit("screen_frame", {
      userId: uId,
      frame: data.frame,
      timestamp: data.timestamp || Date.now(),
    });
  });

  // Backward compatibility for chunk if sent
  socket.on("screen_chunk", (data) => {
    if (!data || !data.userId) return;
    io.to("supervisors_room").emit("screen_chunk", data);
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
