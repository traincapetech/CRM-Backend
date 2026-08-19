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

  // 2. Employee starts sharing their screen
  socket.on("register_screen_publisher", (employeeInfo) => {
    if (!employeeInfo || !employeeInfo.userId) return;

    const streamData = {
      userId: employeeInfo.userId.toString(),
      userName: employeeInfo.userName || "Sales Representative",
      branchName: employeeInfo.branchName || "Shokvao",
      role: employeeInfo.role || "Sales",
      socketId: socket.id,
      startedAt: new Date().toISOString(),
    };

    activeScreenStreams.set(streamData.userId, streamData);
    socket.userId = streamData.userId;
    socket.isPublisher = true;

    console.log(`📡 [SCREEN STREAM] Registered screen publisher: ${streamData.userName} (${streamData.userId})`);

    // Notify all supervisors of the new active screen stream
    io.to("supervisors_room").emit("screen_stream_started", streamData);
  });

  // 3. WebRTC Signaling (Offer, Answer, ICE Candidate) between Supervisor & Employee
  socket.on("webrtc_signal", (data) => {
    // data: { targetSocketId, signal, senderId }
    if (data && data.targetSocketId) {
      io.to(data.targetSocketId).emit("webrtc_signal", {
        senderSocketId: socket.id,
        senderId: data.senderId,
        signal: data.signal,
      });
    }
  });

  // 4. Employee stops sharing screen
  socket.on("stop_screen_publisher", (userId) => {
    const id = userId || socket.userId;
    if (id && activeScreenStreams.has(id)) {
      activeScreenStreams.delete(id);
      console.log(`🛑 [SCREEN STREAM] Stopped screen publisher: ${id}`);
      io.to("supervisors_room").emit("screen_stream_stopped", { userId: id });
    }
  });

  // 5. Handle Disconnecting
  socket.on("disconnect", () => {
    if (socket.isPublisher && socket.userId) {
      activeScreenStreams.delete(socket.userId);
      console.log(`🔌 [SCREEN STREAM] Publisher disconnected: ${socket.userId}`);
      io.to("supervisors_room").emit("screen_stream_stopped", { userId: socket.userId });
    }
  });
};
