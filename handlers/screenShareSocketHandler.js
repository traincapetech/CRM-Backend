/**
 * Screen Share Socket Handler for Real-Time Shift Screen Monitoring
 * Handles WebRTC P2P signaling between Employees (Publishers) and Supervisors (Subscribers)
 */

// Active streams registry: { [userId]: { userId, userName, branchName, role, socketId, startedAt } }
const activeScreenStreams = new Map();

module.exports = function screenShareSocketHandler(io, socket) {
  // 1. Supervisor joins the monitoring room
  socket.on("join_screen_monitors", (data) => {
    socket.join("supervisors_room");
    console.log(`📺 [SCREEN MONITOR] Supervisor joined monitors room: ${socket.id}`);

    // Send current list of active streaming employees to the supervisor
    const streamsList = Array.from(activeScreenStreams.values());
    socket.emit("active_screen_streams_list", streamsList);
  });

  // 2. Employee starts sharing their screen / updates registration
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

    console.log(`📡 [SCREEN STREAM] Registered screen publisher: ${streamData.userName} (${uId}) socket: ${socket.id}`);

    // Notify all supervisors of the new or reconnected active screen stream
    io.to("supervisors_room").emit("screen_stream_started", streamData);
  });

  // 3. WebRTC Signaling (Offer, Answer, ICE Candidate) between Supervisor & Employee
  socket.on("webrtc_signal", (data) => {
    // data: { targetSocketId, targetUserId, signal, senderId }
    if (!data) return;

    let destSocketId = data.targetSocketId;
    if (data.targetUserId && activeScreenStreams.has(data.targetUserId.toString())) {
      destSocketId = activeScreenStreams.get(data.targetUserId.toString()).socketId;
    }

    if (destSocketId) {
      io.to(destSocketId).emit("webrtc_signal", {
        senderSocketId: socket.id,
        senderId: data.senderId,
        signal: data.signal,
      });
    }
  });

  // 4. Employee stops sharing screen
  socket.on("stop_screen_publisher", (userId) => {
    const id = (userId || socket.userId)?.toString();
    if (id && activeScreenStreams.has(id)) {
      activeScreenStreams.delete(id);
      console.log(`🛑 [SCREEN STREAM] Stopped screen publisher: ${id}`);
      io.to("supervisors_room").emit("screen_stream_stopped", { userId: id });
    }
  });

  // 5. Handle Disconnecting
  socket.on("disconnect", () => {
    if (socket.isPublisher && socket.userId) {
      const uId = socket.userId.toString();
      // Delay removal slightly in case of immediate socket reconnection
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
